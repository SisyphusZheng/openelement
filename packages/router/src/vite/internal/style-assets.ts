/**
 * The style-edge intercept (#1558; the #1553 protocol after the file-based
 * authoring retirement). The router client build is the sole owner of the
 * emitted `.css` artifact: `emitFile`, content hash, file name, manifest
 * mapping and the sheet adapter handed back to the module graph (the
 * three-owner seam split's middle owner — the compiler only requests, the
 * runtime only adopts).
 *
 * The compiled-element transform registers every authored `.css` import edge
 * of a compiled module in element's style-edge registry, keyed by the module
 * id the resolver lands on. This plugin intercepts those edges at
 * `enforce: 'pre'` — before vite's CSS plugin, which would serve a shadow
 * component's sheet as a document-level channel it can never reach shadow
 * trees through. A `.css` import from a module with no registered edges is a
 * plain app stylesheet and passes through untouched; a `.css` import from a
 * tracked module with no edge entry is a defect and fails closed.
 *
 * The sheet's bytes live in exactly one place — the authored file (P6). The
 * intercept reads those bytes for every half: the client build emits them
 * content-hashed, the SSR build embeds them into the DSD `<style>` text, and
 * the dev server rides them on the inline adapter. There is no second copy of
 * the bytes anywhere in the protocol, so there is nothing to reconcile.
 *
 * The graph id handed to the bundler is a `\0`-virtual id whose encoded key
 * carries no path shape and whose terminal suffix is `.js` — never the
 * `.css` id itself: the toolchain infers the module type from the id's
 * extension suffix, and a `.css`-suffixed id is processed as a CSS module —
 * the load result is ignored and the build fails with MISSING_EXPORT
 * (reproduced on vite 8.0.16 / rolldown 1.0.3; `moduleType` on the resolveId
 * result does not override it). See the GRAPH_ID_PREFIX doc for the chunking
 * side of the same fact.
 *
 * Adapter forms — one decision, recorded with its evidence:
 *
 * - FETCH (emitted today): `fetch()` + `CSSStyleSheet.replace()`, guarded by
 *   top-level await so the sheet is fully parsed before any importing island
 *   module evaluates (module-evaluation ordering; a
 *   rejected fetch/replace fails the importing module too — fail closed).
 * - NATIVE (`import ... with { type: 'css' }`): implemented as the other
 *   emission, selected when {@linkcode NATIVE_CSS_MODULE_SCRIPTS} is true.
 *
 * The capability verdict is a build-toolchain fact, not a runtime probe: the
 * adapter is bundled, so a runtime check cannot choose between two build-time
 * module shapes. The verdict on record is negative twice over — rolldown
 * 1.0.3 hard-fails the native form at MISSING_EXPORT
 * and Safari has no CSS module scripts through Safari 27 (#1553 App. C),
 * so even a bundler-capable native form would not cover the delivered fleet.
 * Retirement condition (P5): when a toolchain both bundles the native form
 * and the fleet supports it, flip the verdict and delete the fetch emission —
 * the adapter form is a capability probe, not a permanent architecture.
 *
 * Neither adapter ever touches `document.head`: the sheet travels to its
 * consumer as a stylesheet object (a shadow root adopts it, a light root
 * adopts it on the document — alpha15 S lane S-C1.2), and a document-head
 * sink is not a delivery form of this protocol at all.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Plugin } from 'vite';
import {
  getStyleRequest,
  hasStyleImporter,
  type RegisteredStyleRequest,
  styleRequestModuleId,
} from '@openelement/compiler';
import { STYLE_SHEET_READY, STYLE_SHEET_URL } from '@openelement/protocol/style-sheet';
import { buildError, ClientBuildErrorCode } from '../../internal/error-codes.ts';
import { scopeLightRootCss } from './light-css-scope.ts';

/**
 * The `\0`-virtual graph id prefix. The registry key rides base64url-encoded
 * (terminal `.js` appended): the bundler infers the module type from the id's
 * extension suffix, and the client build's island chunk-grouping rules match
 * on path segments (`/<islandsDir>/`) — a raw-key graph id would be typed as
 * a CSS module (load result ignored, MISSING_EXPORT) and grouped into a
 * nonsense `<sheet>.css` chunk. The encoding makes the graph id path-free and
 * JS-typed while the key round-trips exactly.
 */
const GRAPH_ID_PREFIX = '\0oe-style-asset:';

/**
 * The toolchain capability verdict behind the adapter form (module doc:
 * evidence and retirement condition). `false` — every build emits the fetch
 * adapter.
 */
export const NATIVE_CSS_MODULE_SCRIPTS = false;

/** The sheet-adapter form this build emits. */
export type SheetAdapterForm = 'fetch' | 'native-css-module';

/** Length of the content-hash slice carried in the emitted file name. */
const HASH_SLICE = 12;

/** One emitted style asset, recorded by the client build for downstream joins. */
export interface StyleAssetRecord {
  /** The emitted file name, dist/client-relative (`assets/<hash>.css`). */
  readonly fileName: string;
  /** SHA-256 hex of the emitted bytes — the manifest's content address. */
  readonly hash: string;
}

/** SHA-256 hex of one asset's bytes (the manifest-recorded form). */
export function styleAssetHash(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('hex');
}

/**
 * The emitted asset's file name: content-addressed, deterministic. Islands
 * carrying the same sheet bytes share one asset — identical names fold in the
 * emitter (deduplicated per build below) and in the manifest's `styles` URL
 * set, so multi-island reuse is the same hashed bytes, not copies. Pruning
 * granularity vs cache reuse stays #1548's product decision;
 * the protocol only guarantees the cache key is the content.
 */
export function styleAssetFileName(source: string): string {
  return `assets/${styleAssetHash(source).slice(0, HASH_SLICE)}.css`;
}

/** The virtual graph id for one style edge (module doc: why the encoding). */
export function styleAssetGraphId(registryKey: string): string {
  return `${GRAPH_ID_PREFIX}${Buffer.from(registryKey, 'utf8').toString('base64url')}.js`;
}

/** The registry key encoded in a graph id, or undefined for foreign ids. */
export function styleAssetRegistryKey(graphId: string): string | undefined {
  if (!graphId.startsWith(GRAPH_ID_PREFIX) || !graphId.endsWith('.js')) return undefined;
  try {
    return Buffer.from(graphId.slice(GRAPH_ID_PREFIX.length, -'.js'.length), 'base64url').toString(
      'utf8',
    );
  } catch {
    return undefined;
  }
}

/**
 * The fetch adapter module for one emitted asset.
 *
 * Default export: the `CSSStyleSheet` for this sheet, created synchronously so
 * a compiled class can bind it in `static styles` without waiting — the class
 * export then leaves the asynchronous module-evaluation chain that delays it
 * behind this asset (the WebKit overlapping-evaluation race, KR-2). The rules
 * land through `replace()` afterwards, and readiness is recorded on the sheet
 * under the protocol's {@linkcode STYLE_SHEET_READY} key so the element runtime
 * can hand the styles to connected roots and gate SSR fallback removal.
 *
 * The URL comes from `import.meta.ROLLUP_FILE_URL_<referenceId>` — the bundler
 * rewrites it to the final hashed asset URL relative to the importing chunk, so
 * the adapter never hardcodes the output layout.
 */
export function fetchSheetAdapterModule(referenceId: string): string {
  return [
    '// <generated by open:style-assets — island style sheet adapter; do not edit>',
    "// Fetch adapter: the default export is this sheet's CSSStyleSheet, created",
    '// synchronously. Rules arrive through replace(); readiness is recorded under',
    `// the protocol's "${STYLE_SHEET_READY}" key for the element runtime. Never`,
    '// document.head: a document-level node cannot reach shadow trees.',
    `const sheetUrl = import.meta.ROLLUP_FILE_URL_${referenceId};`,
    'const sheet = new CSSStyleSheet();',
    'const ready = fetch(sheetUrl)',
    '  .then((response) => {',
    '    if (!response.ok) {',
    `      throw new Error('[openElement] island style asset request failed with ' + response.status + ': ' + sheetUrl);`,
    '    }',
    '    return response.text();',
    '  })',
    '  .then((css) => sheet.replace(css));',
    '// Observed without conversion: this catch only prevents an unhandled',
    '// rejection before a root consumes the promise. The stored promise keeps its',
    '// rejected state, so a consumer that awaits it still sees the failure.',
    'void ready.catch(() => {});',
    `sheet['${STYLE_SHEET_READY}'] = ready;`,
    '// The external identity of this sheet: a root whose SSR/DSD markup',
    '// references this URL keeps that declarative link as the delivery and does',
    '// not adopt this constructable copy (alpha15 S lane) — one stylesheet',
    '// resource, one delivery, no duplicate application.',
    `sheet['${STYLE_SHEET_URL}'] = sheetUrl;`,
    'export default sheet;',
    '',
  ].join('\n');
}

/**
 * The native CSS-module-script adapter for one emitted asset (form 1): the
 * browser's own CSS module machinery provides the sheet, zero
 * framework code. Inert on the current toolchain — the capability verdict in
 * the module doc keeps this generator out of every real build until the
 * verdict flips.
 */
export function nativeSheetAdapterModule(urlExpression: string): string {
  return [
    '// <generated by open:style-assets — island style sheet adapter; do not edit>',
    '// Native CSS module script adapter: the browser parses the emitted asset;',
    '// no framework code runs.',
    `import sheet from ${urlExpression} with { type: 'css' };`,
    'export default sheet;',
    '',
  ].join('\n');
}

/** The adapter emission for the recorded capability verdict. */
export function sheetAdapterForm(): SheetAdapterForm {
  return NATIVE_CSS_MODULE_SCRIPTS ? 'native-css-module' : 'fetch';
}

/**
 * The inline sheet adapter: the sheet text rides the module. Dev has no
 * emitted asset to fetch and no size or zero-inline contract, so the text
 * inlines there (element's cross-realm StyleSheet is the native
 * CSSStyleSheet in the browser and the SSR shim in Node — one module serves
 * both dev channels). Retirement condition (P5): when the native
 * CSS-module-script verdict flips, or dev learns to serve protocol assets
 * over HTTP, the dev channel collapses into the production adapter form and
 * this generator is deleted with the same verdict.
 */
export function inlineSheetAdapterModule(css: string): string {
  return [
    '// <generated by open:style-assets — dev island style sheet adapter; do not edit>',
    '// Dev adapter: the sheet text rides the module (no emitted asset to fetch);',
    '// the production adapters fetch the real .css asset instead.',
    "import { StyleSheet } from '@openelement/element';",
    'const sheet = new StyleSheet();',
    `sheet.replaceSync(${JSON.stringify(css)});`,
    'export default sheet;',
    '',
  ].join('\n');
}

/**
 * The intercept's resolve half, shared by every channel (client build, SSR
 * build, dev). A relative `.css` import from a tracked module answers with
 * the edge's graph id; anything else passes through untouched. Fail closed:
 * a tracked importer whose `.css` edge carries no registry entry is a defect
 * (the compiled-element transform registers every edge it admits), and an
 * importer-less `.css` source is never an authored module edge.
 */
function styleEdgeResolveId(this: unknown, source: string, importer?: string): string | null {
  if (!source.endsWith('.css') || !importer) return null;
  if (!hasStyleImporter(importer)) return null;
  const registryKey = styleRequestModuleId(importer, source);
  if (!getStyleRequest(registryKey)) {
    throw buildError(
      ClientBuildErrorCode.STYLE_ASSET_UNREGISTERED,
      `Style edge "${source}" from ${importer} carries no registry entry — the ` +
        'compiled-element transform registers every `.css` edge it admits, so a tracked ' +
        'importer with an unregistered edge is a defect. The intercept never re-inlines',
    );
  }
  return styleAssetGraphId(registryKey);
}

/** Read the edge's sheet file — the one place the bytes exist. */
async function readSheetFile(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch (cause) {
    throw buildError(
      ClientBuildErrorCode.STYLE_ASSET_UNREGISTERED,
      `The style edge's sheet file ${file} cannot be read — authored .css files are ` +
        `the protocol's only byte source (reason: ${(cause as Error).message})`,
      { cause: cause as Error },
    );
  }
}

/**
 * The bytes one edge's asset carries (alpha15 S lane, S-C1.2).
 *
 * A shadow-root edge ships the authored sheet verbatim: a shadow tree already
 * IS the boundary. A light-root edge ships the same authored sheet wrapped in
 * native `@scope (<component tag>)` — the light boundary only exists if the
 * build writes it, and the emitted asset is the one place it can be written
 * once for every consumer (SSR's document link, CSR's adopted sheet, dev's
 * inline adapter all carry these exact bytes).
 *
 * Both the content hash and the emitted file name derive from what this
 * returns, so a scoped asset and a raw asset of the same authored file are
 * two distinct resources with two distinct URLs — never one file serving two
 * different meanings.
 */
async function readEdgeCss(request: RegisteredStyleRequest): Promise<string> {
  const authored = await readSheetFile(request.file);
  return request.scopeTag === undefined ? authored : scopeLightRootCss(request.scopeTag, authored);
}

/**
 * The client-build plugin: intercepts style edges, emits the real `.css`
 * asset (content-addressed from the authored file's bytes), records each
 * emission into `records` for the client asset manifest's `styles` field, and
 * hands the sheet adapter back to the module graph.
 */
export const clientStyleAssetPlugin: (records: Map<string, StyleAssetRecord>) => Plugin = (
  records,
) => {
  // Emission dedup keyed by the content-addressed file name: identical sheet
  // bytes from several islands emit ONE asset; every adapter rewrites the
  // same file-URL reference to the same hashed URL (reproduced on
  // rolldown 1.0.3: one referenceId interpolates correctly in each module).
  const emitted = new Map<string, string>();
  return {
    name: 'open:style-assets',
    enforce: 'pre',
    resolveId: styleEdgeResolveId,
    async load(id) {
      const registryKey = styleAssetRegistryKey(id);
      if (registryKey === undefined) return null;
      const request = getStyleRequest(registryKey);
      if (!request) {
        throw buildError(
          ClientBuildErrorCode.STYLE_ASSET_UNREGISTERED,
          `Resolved style module ${id} carries no registry entry — the edge ` +
            'disappeared between resolution and load',
        );
      }
      const css = await readEdgeCss(request);
      const hash = styleAssetHash(css);
      const fileName = styleAssetFileName(css);
      records.set(registryKey, { fileName, hash });
      // Both forms consume the same emitted asset; the verdict selects only
      // the adapter module handed back to the graph.
      let referenceId = emitted.get(fileName);
      if (referenceId === undefined) {
        referenceId = this.emitFile({ type: 'asset', fileName, source: css });
        emitted.set(fileName, referenceId);
      }
      if (sheetAdapterForm() === 'native-css-module') {
        return nativeSheetAdapterModule(`import.meta.ROLLUP_FILE_URL_${referenceId}`);
      }
      return fetchSheetAdapterModule(referenceId);
    },
  };
};

/**
 * The SSR-build plugin: serves the server half of the protocol. The sheet
 * adapter embeds the authored file's bytes — the same bytes the client build
 * emitted content-hashed — so the DSD `<style data-oe-static-styles>` text
 * and the client sheet cannot drift: one file, one fact (P6).
 * `StyleSheet` is element's cross-realm constructor: the SSR shim parses the
 * rules the serializer reads back through `cssRules` (collectStaticStyleCss),
 * exactly the legacy path's text channel.
 */
export function serverStyleAssetPlugin(options?: {
  /**
   * The client build's emitted sheet files, keyed by registry key (the sheet
   * file's resolved path). When an edge's asset was emitted, the server shim
   * carries its URL instead of the sheet text (S5-C): the DSD template then
   * declares the authored stylesheet as an external `<link>`, exactly like the
   * generated utility sheet — one delivery for one resource, no framework CSS
   * text in the SSR markup.
   */
  files?: ReadonlyMap<string, string>;
  /** The build's normalized public base, used to join the emitted file name. */
  base?: string;
}): Plugin {
  return {
    name: 'open:style-assets-ssr',
    enforce: 'pre',
    resolveId: styleEdgeResolveId,
    async load(id) {
      const registryKey = styleAssetRegistryKey(id);
      if (registryKey === undefined) return null;
      const request = getStyleRequest(registryKey);
      if (!request) {
        throw buildError(
          ClientBuildErrorCode.STYLE_ASSET_UNREGISTERED,
          `Resolved style module ${id} carries no registry entry — the edge ` +
            'disappeared between resolution and load',
        );
      }
      const emitted = options?.files?.get(registryKey);
      if (emitted !== undefined) {
        const href = `${options?.base ?? '/'}client/${emitted}`;
        return [
          '// <generated by open:style-assets — SSR style sheet adapter; do not edit>',
          '// Server half of the style edge protocol: the sheet is declared as the',
          "// client build's emitted asset — one resource, one delivery — so the DSD",
          '// template carries a parser-visible `<link>` and never inlines the CSS.',
          "import { StyleSheet } from '@openelement/element';",
          `const sheet = new StyleSheet();`,
          `sheet['__openElementStyleSheetUrl'] = ${JSON.stringify(href)};`,
          'export default sheet;',
          '',
        ].join('\n');
      }
      // No client asset (an island-free build): the text shim keeps the
      // component styled instead of shipping a link to a missing file.
      const text = await readEdgeCss(request);
      return [
        '// <generated by open:style-assets — SSR style sheet adapter; do not edit>',
        '// Server half of the style edge protocol: the sheet text is the .css bytes',
        "// this build emits — the authored file's own bytes for a shadow root, its",
        '// build-time `@scope` projection for a light root — so the server-rendered',
        '// style text and the adopted client sheet cannot drift.',
        "import { StyleSheet } from '@openelement/element';",
        `const sheet = new StyleSheet();`,
        `sheet.replaceSync(${JSON.stringify(text)});`,
        'export default sheet;',
        '',
      ].join('\n');
    },
  };
}

/**
 * The dev plugin: same fail-closed intercept, inline adapter. The dev
 * transform pipeline runs the compiled-element transform before the module's
 * import resolves, so the registry entry exists; the adapter rides the module
 * (see inlineSheetAdapterModule) with the authored file's bytes. Dev keeps
 * the graph ids identical to the build's, so dev and prod exercise the same
 * seam shape.
 */
export function devStyleAssetPlugin(): Plugin {
  return {
    name: 'open:style-assets-dev',
    enforce: 'pre',
    resolveId: styleEdgeResolveId,
    async load(id) {
      const registryKey = styleAssetRegistryKey(id);
      if (registryKey === undefined) return null;
      const request = getStyleRequest(registryKey);
      if (!request) {
        throw buildError(
          ClientBuildErrorCode.STYLE_ASSET_UNREGISTERED,
          `Resolved style module ${id} carries no registry entry — the edge ` +
            'disappeared between resolution and load',
        );
      }
      return inlineSheetAdapterModule(await readEdgeCss(request));
    },
  };
}
