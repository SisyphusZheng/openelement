/**
 * Packed-artifact UI-appliance consumer walkthrough (#1558 / KR-10, alpha.13
 * I1 10c) — the leg that should have caught KR-10.
 *
 * The starter leg (consumer-packaged-starter.ts) qualifies the canonical
 * scaffold, and the starter consumes NO package islands at all: `packageIslands`
 * — the feature the @openelement/ui README teaches — had no packed consumer
 * anywhere, so its full-chain breakage (dev SSR `Unknown file extension
 * ".css"`, then client build MISSING_EXPORT) stayed invisible while www, a
 * workspace symlink consumer, stayed green. This leg closes that hole with the
 * same observational rule: qualify the PACKED artifact, never the workspace
 * source.
 *
 * It installs the six pack:dry-run tarballs into a scratch consumer OUTSIDE
 * the repository, scaffolds the canonical starter through the packed
 * @openelement/create CLI, appliances it into a package-island consumer —
 * `@openelement/ui` joins package.json, `packageIslands` joins
 * openelement.config.ts, and a prerendered page renders open-button +
 * open-dialog + open-code-block — and then runs the adopter lifecycle (ADR-0161):
 *
 *   install  the appliance's package.json resolves through a real pnpm install
 *            (the `vite-plus: "catalog:"` devDependency resolves through the
 *            scaffold's own pnpm-workspace.yaml catalog, and the `vite@*`
 *            override points the whole vite tree at the Vite+ core build)
 *   dev      the Vite+ dev server (`vp dev`) boots; /ui-lab SSR-renders the
 *            three UI hosts with their package sheets as DSD
 *            `<style data-oe-static-styles>` text
 *            (no `Unknown file extension ".css"` — the KR-10(a) detector)
 *   typecheck the starter's own `typecheck` script (tsc --noEmit) against the
 *            packed UI declarations
 *   build    real SSG build; must emit dist/ui-lab/index.html carrying the
 *            component sheets, the package island chunks, and the sheets as
 *            real content-addressed .css assets whose rules are the installed
 *            package's own (Vite's CSS pipeline is the ONE processing path, so
 *            a production build's CSS minifier has run over them) — and the
 *            emitted client JS must contain no component CSS text (the KR-10(b)
 *            detector: without the style-edge intake the build fails at
 *            MISSING_EXPORT; a silent inline would fail the zero-inline scan
 *            instead)
 *   start    the `start` script (the router's `oe` bin) serves the
 *            appliance page over HTTP
 *
 * Gated in CI via the `consumer:packaged` root task, which chains this leg
 * after the starter leg (so the packed-consumer matrix in autoflow-ci.yml
 * covers both without workflow changes).
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { runProcess } from './consumer-packaged-shared.ts';
import { PACKAGE_VERSION, RETAINED_PACKAGE_NAMES } from '../repo/project-constants.ts';
import { readPackages } from '../lib/package-graph.ts';
import { tarballPath } from '../lib/npm-tarball.ts';
import { CREATE_BIN } from './npm-manifest.ts';
import { PW_PROBE_PIN } from './consumer-packaged-starter.ts';
import ts from 'typescript';
import { compileElementModule } from '@openelement/compiler';
import { ISLAND_ADMISSION } from '@openelement/protocol/island-admission';
import { CREATE_VERSION } from '../../packages/create/src/version.ts';

async function readJson<T = unknown>(path: string | URL): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

const repoRoot = resolve(import.meta.dirname!, '../..');
const BUILD_TIMEOUT_MS = 10 * 60_000;
const NPM_INSTALL_TIMEOUT_MS = 5 * 60_000;
const SERVER_READY_TIMEOUT_MS = 3 * 60_000;
const BROWSER_TIMEOUT_MS = 2 * 60_000;

function run(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs?: number,
  env?: Record<string, string>,
): Promise<{ success: boolean; output: string }> {
  return runProcess(command, args, cwd, { timeoutMs, env });
}

async function assertConsumerDoesNotResolveIntoRepository(nodeModules: string): Promise<void> {
  const candidates: string[] = [];
  for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(nodeModules, entry.name);
    if (entry.name.startsWith('@') && entry.isDirectory()) {
      for (const nested of readdirSync(path, { withFileTypes: true })) {
        candidates.push(join(path, nested.name));
      }
    } else {
      candidates.push(path);
    }
  }
  for (const path of candidates) {
    const resolvedReal = await realpath(path).catch(() => path);
    if (resolvedReal === repoRoot || resolvedReal.startsWith(`${repoRoot}/`)) {
      throw new Error(
        `Packed UI consumer resolved a dependency into the repository: ${path} -> ${resolvedReal}`,
      );
    }
  }
}

// Let the OS choose from its ephemeral range (fixed ranges collide with
// parallel CI jobs).
function reservePort(): Promise<number> {
  return new Promise((resolveProbe, reject) => {
    const probe = createServer();
    probe.once('listening', () => {
      const addr = probe.address() as { port: number };
      probe.close(() => resolveProbe(addr.port));
    });
    probe.once('error', reject);
    probe.listen({ port: 0, host: '127.0.0.1' });
  });
}

/**
 * Boot one lifecycle server (dev/start) over the packed output, wait for it to
 * answer HTTP, assert every [path, marker] probe over the wire, then stop it.
 * A green exit alone is not lifecycle evidence (same contract as the starter
 * leg).
 */
async function exerciseServer(
  label: string,
  argsFor: (port: number) => string[],
  cwd: string,
  probes: ReadonlyArray<readonly [string, string]>,
  /** Runs while the server is up, after the HTTP probes (the browser matrix). */
  afterReady?: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const port = await reservePort();
  const server = spawn('pnpm', argsFor(port), {
    cwd,
    env: { ...process.env, OPEN_ELEMENT_PORT: String(port), OPEN_ELEMENT_HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Own process group: the stop below must signal pnpm's node/sh
    // grandchildren (vite, cli/start) too, not just pnpm — orphaned
    // grandchildren keep the inherited stdio pipes open and the piped-output
    // pumps keep this process from ever exiting the success path (observed on
    // macOS; same teardown contract as the starter harness).
    detached: true,
  });
  let exited = false;
  server.addListener('exit', () => {
    exited = true;
  });
  const stdoutChunks: Uint8Array[] = [];
  const stderrChunks: Uint8Array[] = [];
  void (async () => {
    for await (const chunk of server.stdout!) stdoutChunks.push(chunk);
  })();
  void (async () => {
    for await (const chunk of server.stderr!) stderrChunks.push(chunk);
  })();
  const stdoutText = () =>
    new TextDecoder().decode(Buffer.concat(stdoutChunks.map((c) => Buffer.from(c))));
  const stderrText = () =>
    new TextDecoder().decode(Buffer.concat(stderrChunks.map((c) => Buffer.from(c))));
  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    let ready = false;
    const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
    while (Date.now() < deadline && !exited) {
      try {
        const response = await fetch(`${baseUrl}${probes[0][0]}`);
        await response.text();
        ready = true;
        break;
      } catch {
        await new Promise((resolveWait) => setTimeout(resolveWait, 150));
      }
    }
    if (!ready) {
      throw new Error(
        `${label} did not become ready within ${SERVER_READY_TIMEOUT_MS}ms:\n${stdoutText()}\n${stderrText()}`,
      );
    }
    for (const [path, marker] of probes) {
      const response = await fetch(`${baseUrl}${path}`);
      const body = await response.text();
      if (response.status !== 200 || !body.includes(marker)) {
        throw new Error(
          `${label} probe ${path} failed: status=${response.status}, missing marker ${marker}`,
        );
      }
    }
    if (afterReady) await afterReady(baseUrl);
    console.log(`${label} passed (port ${port}).`);
  } catch (error) {
    // Preserve the server-side cause of a failed probe (the dev leg's KR-10
    // regression surfaces as SSR output, not as an exit code).
    const failure = error instanceof Error ? error : new Error(String(error));
    failure.message = `${failure.message}\n${stdoutText().slice(-8000)}\n${stderrText().slice(-8000)}`;
    throw failure;
  } finally {
    if (!exited) {
      try {
        // Negative pid: signal the whole process group (see detached above).
        process.kill(-server.pid!, 'SIGTERM');
      } catch {
        // process group already gone
      }
    }
    await new Promise((resolveSettled) => {
      if (exited) resolveSettled(null);
      else server.addListener('exit', () => resolveSettled(null));
    });
  }
}

// ─── The dependency-only utility probe (S-C2/S-13) ──────────────────────────
//
// A component library whose ONLY styling is Tailwind utility classes — no
// authored `.css` file, no `static styles` — built into a package tarball and
// installed into the appliance from that tarball. The utilities it uses are
// referenced by NO application source, so the component stylesheet proving them
// can only come from the dependency's compiled class candidates travelling
// through packaging (S5-B) into the consumer build's official Tailwind compile.

const UTILITY_WIDGET_TAG = 'utility-widget';
/**
 * The widget's utility classes — the ONLY rules the component sheet may hold.
 * `bg-probe` is a role from THIS PACKAGE's declared theme source (ADR-0167): the
 * appliance declares no Tailwind configuration at all, so the rule can only
 * exist because the package declared both the requirement and the source.
 */
const UTILITY_WIDGET_CANDIDATES = ['p-8', 'font-semibold', 'rotate-45', 'bg-probe'] as const;
/** The package-owned theme role the widget paints with. */
const PROBE_ROLE = '--color-probe';
/** The role's declared value: a distinctive colour no default scale carries. */
const PROBE_ROLE_VALUE = 'oklch(0.62 0.19 275)';
/** The widget's declared theme source (package-relative, shipped in the tarball). */
const PROBE_THEME_SOURCE = './src/theme.css';
/** Utilities nothing in the appliance mentions: a full utility bundle would
 * carry them, a per-candidate compile cannot. */
const ABSENT_UTILITY_PROBES = ['rotate-90', 'p-96', 'underline'] as const;
/** The light root's own utility: its rules belong to the DOCUMENT stylesheet. */
const LIGHT_ROOT_UTILITY = 'p-4';
/** The starter island's own utility: shadow-root component CSS from local source. */
const STARTER_ISLAND_UTILITY = 'p-2';

const UTILITY_WIDGET_COMPONENT = `/**
 * S-C2/S-13 probe: a shadow-root component whose only styling is Tailwind
 * utility classes (no authored .css file, no static styles).
 */
import { element, OpenElement } from '@openelement/element';

@element('${UTILITY_WIDGET_TAG}', { root: 'shadow-open' })
export class UtilityWidget extends OpenElement {
  render() {
    return <span class='${UTILITY_WIDGET_CANDIDATES.join(' ')}'>utility widget</span>;
  }
}
`;

/**
 * Compile the probe component with the workspace compiler (the same emission
 * the release pack pipeline stages), write it as a real package and pack it
 * with npm — the appliance installs that tarball, never workspace source.
 */
async function packUtilityWidget(dir: string): Promise<string> {
  const compiled = compileElementModule(UTILITY_WIDGET_COMPONENT, 'utility-widget.tsx', {
    staticSidecars: [ISLAND_ADMISSION],
  });
  if (compiled === null) {
    throw new Error('the utility-widget probe did not compile as an openElement island module');
  }
  const pkgDir = join(dir, 'acme-utility-widget');
  await mkdir(join(pkgDir, 'src'), { recursive: true });
  await writeFile(
    join(pkgDir, 'package.json'),
    `${JSON.stringify(
      {
        name: '@acme/utility-widget',
        version: '1.0.0',
        type: 'module',
        exports: {
          '.': './src/utility-widget.js',
          './manifest': './src/manifest.js',
          './utility-widget': './src/utility-widget.js',
        },
        files: ['src'],
      },
      null,
      2,
    )}\n`,
  );
  // The compiler's emission is TypeScript (the release pack pipeline transpiles
  // it while packing); a shipped package module must be plain JS. Transpile with
  // the repo's own TypeScript — the same tool the packer's step uses — rather
  // than hand-stripping annotations.
  const emittedJs = ts.transpileModule(compiled.code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  await writeFile(join(pkgDir, 'src', 'utility-widget.js'), emittedJs);
  await writeFile(
    join(pkgDir, 'src', 'manifest.js'),
    `export const manifest = ${JSON.stringify(
      {
        schemaVersion: '1.0.0',
        packageName: '@acme/utility-widget',
        version: '1.0.0',
        description:
          'Packed utility-candidate probe for the alpha15 S lane (S-C2/S-13): a shadow component styled only by Tailwind utilities.',
        declarations: [
          {
            tagName: UTILITY_WIDGET_TAG,
            className: 'UtilityWidget',
            superclassName: 'OpenElement',
            description: 'Shadow-root component styled only by Tailwind utility classes.',
            attributes: [],
            events: [],
            slots: [{ name: '' }],
            cssParts: [],
            openElement: {
              ssr: true,
              dsd: true,
              hydrate: 'load',
              status: 'experimental',
              module: '@acme/utility-widget/utility-widget',
              export: 'UtilityWidget',
              // ADR-0167: the package declares that its component cannot be
              // styled without the Tailwind compile and owns the theme source
              // that compile needs. The appliance therefore carries NO Tailwind
              // configuration: this declaration alone enables the pipeline.
              tailwind: { required: true, sources: [PROBE_THEME_SOURCE] },
            },
          },
        ],
      },
      null,
      2,
    )};\n`,
  );
  // The package-owned theme source, shipped in the tarball (`files: ['src']`).
  await writeFile(
    join(pkgDir, 'src', 'theme.css'),
    `@theme {\n  ${PROBE_ROLE}: ${PROBE_ROLE_VALUE};\n}\n`,
  );
  const packed = await run(
    'npm',
    ['pack', '--pack-destination', dir],
    pkgDir,
    NPM_INSTALL_TIMEOUT_MS,
  );
  if (!packed.success) {
    throw new Error(`Packing @acme/utility-widget failed:\n${packed.output}`);
  }
  const tarball = join(dir, 'acme-utility-widget-1.0.0.tgz');
  if (!existsSync(tarball)) {
    throw new Error(`npm pack produced no tarball at ${tarball}:\n${packed.output}`);
  }
  return tarball;
}

// ─── The appliance sources ──────────────────────────────────────────────────
//
// The prerendered page renders all three exercised UI components by tag; the
// compiled page module (components/ui-lab.tsx) references them, which is the
// reachability evidence the client build's island admission consumes. The
// sheet markers below are the authored bytes of the installed package's own
// files (not copies): the assertions read them back from the installed tree.

const UI_LAB_COMPONENT = `/**
 * UI appliance page for the packed-consumer gate (#1558/KR-10): the three
 * @openelement/ui components the package README's packageIslands recipe is
 * supposed to deliver.
 */
import { element, OpenElement } from '@openelement/element';
import '@openelement/ui/open-button';
import '@acme/utility-widget/utility-widget';
import '@openelement/ui/open-dialog';
import '@openelement/ui/open-code-block';

@element('ui-lab', { root: 'light' })
export default class UiLab extends OpenElement {
  render() {
    return (
      <div class='ui-lab ${LIGHT_ROOT_UTILITY}'>
        <h1>Packed UI appliance</h1>
        <open-button variant='primary'>packed button</open-button>
        <open-dialog>
          <span slot='label'>packed dialog</span>
          <p>dialog body from the packed tarball</p>
        </open-dialog>
        <open-code-block>
          <pre><code>const packed = true;</code></pre>
        </open-code-block>
        <utility-widget></utility-widget>
      </div>
    );
  }
}
`;

const UI_LAB_ROUTE = `import { definePage } from '@openelement/router';
import UiLab from '../components/ui-lab.tsx';

export default definePage(UiLab, {
  head: { title: 'Packed UI appliance' },
});
`;

/** Anchors the appliance writes rely on; a template drift fails loudly here. */
const CONFIG_ANCHOR = 'export default defineConfig({';

const UI_SHEET_MARKERS = ['.control:focus-visible', '.btn[hidden]'] as const;

/**
 * The rule selectors of a component sheet, normalized for comparison against
 * the build-processed copy: comments dropped, whitespace collapsed, whitespace
 * around a selector-list comma removed, attribute quotes removed (a CSS
 * minifier writes `:host(:not([size])) .btn,:host([size=md]) .btn` for the
 * authored `… .btn, … .btn` and normalizes `[size='sm']` to `[size=sm]`).
 * The minifier preserves selector text — it rewrites declarations — so the
 * selector set is what survives as the sheet's provenance.
 */
function sheetSelectors(css: string): string[] {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('{')
    .slice(0, -1)
    .map((part) => (part.split('}').pop() ?? '').replace(/\s+/g, ' ').trim())
    .filter((selector) => selector !== '' && !selector.startsWith('@'))
    .map((selector) =>
      selector
        .replace(/\s*,\s*/g, ',')
        .replace(/\[([^\]]*)\]/g, (_, body: string) => `[${body.replace(/['"]/g, '')}]`),
    );
}

// ─── The browser computed-style matrix (S-C3, gap B) ────────────────────────
//
// Real engines, real packed install: the appliance's start server is already
// running, and the probe measures the COMPUTED values the component-level
// utilities must produce INSIDE the shadow trees (file-content assertions are
// not a computed-style proof). Isolation is measured too, with a class that is
// injected at RUNTIME so no build-time scan can have styled it: a light element
// carrying the widget's `rotate-45` must stay untransformed.

const UI_UTILITY_PROBE_SCRIPT = `import { chromium, firefox, webkit } from '@playwright/test';

const [baseUrl, browserName] = process.argv.slice(2);
const browserType = browserName === 'chromium' ? chromium : browserName === 'firefox' ? firefox : browserName === 'webkit' ? webkit : null;
if (!baseUrl || !browserType) throw new Error('usage: pw-utility-probe.mjs <baseUrl> <chromium|firefox|webkit>');

// Islands live inside shadow trees (the layout is a shadow host and pages render
// through its slot), so every lookup pierces shadow roots.
const DEEP = \`(function () {
  const find = (root, selector) => {
    const direct = root.querySelector(selector);
    if (direct) return direct;
    for (const element of root.querySelectorAll('*')) {
      const shadow = element.shadowRoot;
      if (!shadow) continue;
      const found = find(shadow, selector);
      if (found) return found;
    }
    return null;
  };
  globalThis.__deepFind = (selector) => find(document, selector);
})()\`;

const browser = await browserType.launch({ headless: true });
try {
  const page = await browser.newPage();

  await page.goto(baseUrl + '/ui-lab', { waitUntil: 'load' });
  await page.evaluate(DEEP);
  const lab = await page.evaluate(async () => {
    const widget = globalThis.__deepFind('utility-widget');
    const widgetSpan = widget?.shadowRoot?.querySelector('span');

    // Isolation probe: the class is added HERE, so no build-time scan saw it.
    const light = document.createElement('div');
    light.className = 'rotate-45 p-8';
    document.body.appendChild(light);

    // ── WebKit rotate A/B (bounded): three delivery channels, both properties
    // and a GEOMETRIC read (a 100x100 box rotated 45deg has a ~141.4px bounding
    // box), so the verdict is the visual effect, not a support claim.
    const BOX = 'width:100px;height:100px;background:#123456;';
    const box = (selector) => {
      const element = document.createElement('div');
      element.style.cssText = BOX;
      element.className = selector;
      return element;
    };

    // Channel 1 — pure CSS, DOCUMENT stylesheet.
    const documentStyle = document.createElement('style');
    documentStyle.textContent = '.ab-doc-rotate { rotate: 45deg; } .ab-doc-transform { transform: rotate(45deg); }';
    document.head.appendChild(documentStyle);
    const docRotate = box('ab-doc-rotate');
    const docTransform = box('ab-doc-transform');
    const docPlain = box('');
    document.body.append(docRotate, docTransform, docPlain);

    // Channel 2 — pure CSS, SHADOW ROOT adopted constructed sheet.
    const shadowHost = document.createElement('div');
    const shadowRoot = shadowHost.attachShadow({ mode: 'open' });
    const shadowSheet = new CSSStyleSheet();
    shadowSheet.replaceSync('.ab-shadow-rotate { rotate: 45deg; } .ab-shadow-transform { transform: rotate(45deg); }');
    shadowRoot.adoptedStyleSheets = [shadowSheet];
    const shadowRotate = box('ab-shadow-rotate');
    const shadowTransform = box('ab-shadow-transform');
    const shadowPlain = box('');
    shadowRoot.append(shadowRotate, shadowTransform, shadowPlain);
    document.body.appendChild(shadowHost);

    // Channel 3 — the OpenElement-delivered packed component sheet, linked
    // inside a shadow root exactly as the widget's DSD declares it.
    const linkHost = document.createElement('div');
    const linkRoot = linkHost.attachShadow({ mode: 'open' });
    const widgetSheetHref = widget?.shadowRoot?.querySelector('link[data-oe-static-styles]')?.getAttribute('href') ?? '';
    if (widgetSheetHref) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = widgetSheetHref;
      linkRoot.appendChild(link);
    }
    const linkRotate = box('rotate-45');
    const linkPlain = box('');
    linkRoot.append(linkRotate, linkPlain);
    document.body.appendChild(linkHost);
    // A <link> applies asynchronously: wait for ITS sheet to be live before
    // measuring, bounded (the first measurement pass read a not-yet-applied
    // sheet and produced a false negative in chromium/webkit).
    const link = linkRoot.querySelector('link');
    if (link) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 2000);
        if (link.sheet) {
          clearTimeout(timer);
          resolve(undefined);
          return;
        }
        link.addEventListener('load', () => { clearTimeout(timer); resolve(undefined); }, { once: true });
      });
    }

    const geometry = (element) => {
      const rect = element.getBoundingClientRect();
      return { rotate: getComputedStyle(element).rotate, transform: getComputedStyle(element).transform, width: Math.round(rect.width * 10) / 10 };
    };
    const rotateAb = {
      documentRotate: geometry(docRotate),
      documentTransform: geometry(docTransform),
      documentPlain: geometry(docPlain),
      shadowRotate: geometry(shadowRotate),
      shadowTransform: geometry(shadowTransform),
      shadowPlain: geometry(shadowPlain),
      deliveredRotate: geometry(linkRotate),
      deliveredPlain: geometry(linkPlain),
      deliveredSheetHref: widgetSheetHref,
    };

    const capability = document.createElement('div');
    const capabilityRoot = capability.attachShadow({ mode: 'open' });
    const capabilitySheet = new CSSStyleSheet();
    capabilitySheet.replaceSync('.cap { rotate: 45deg; } .cap-transform { transform: rotate(45deg); }');
    capabilityRoot.adoptedStyleSheets = [capabilitySheet];
    const capRotate = document.createElement('span');
    capRotate.className = 'cap';
    const capTransform = document.createElement('span');
    capTransform.className = 'cap-transform';
    capabilityRoot.append(capRotate, capTransform);
    // Attached: computed styles of a detached subtree are empty.
    document.body.appendChild(capability);

    const sheetHref = widget?.shadowRoot?.querySelector('link[data-oe-static-styles]')?.getAttribute('href') ?? '';
    const sheetResponse = sheetHref ? await fetch(sheetHref) : null;

    return {
      widgetFound: widget !== null,
      widgetPaddingTop: widgetSpan ? getComputedStyle(widgetSpan).paddingTop : 'missing',
      widgetFontWeight: widgetSpan ? getComputedStyle(widgetSpan).fontWeight : 'missing',
      // ADR-0167: the package-OWNED theme role. The appliance declares no
      // Tailwind configuration naming this source, so a non-transparent
      // background here is the declared-source path doing its job.
      widgetBackground: widgetSpan ? getComputedStyle(widgetSpan).backgroundColor : 'missing',
      // Tailwind v4 lowers rotate-45 to the independent rotate property
      // (not transform), so both channels are read.
      widgetRotate: widgetSpan ? getComputedStyle(widgetSpan).rotate : 'missing',
      widgetTransform: widgetSpan ? getComputedStyle(widgetSpan).transform : 'missing',
      lightTransform: getComputedStyle(light).transform,
      lightPaddingTop: getComputedStyle(light).paddingTop,
      engineVersion: navigator.userAgent,
      rotateAb,
      rotatePropertySupported: CSS.supports('rotate', '45deg'),
      engineRotateProperty: getComputedStyle(capRotate).rotate,
      engineTransformProperty: getComputedStyle(capTransform).transform,
      sheetStatus: sheetResponse?.status ?? 0,
      sheetType: sheetResponse?.headers.get('content-type') ?? '',
      sheetHref,
    };
  });

  await page.goto(baseUrl + '/', { waitUntil: 'load' });
  await page.evaluate(DEEP);
  const home = await page.evaluate(() => {
    const counter = globalThis.__deepFind('my-counter');
    const row = counter?.shadowRoot?.querySelector('.counter-row');
    return {
      counterFound: counter !== null,
      counterPaddingTop: row ? getComputedStyle(row).paddingTop : 'missing',
    };
  });

  const measured = { lab, home };
  const failures = [];
  if (!lab.widgetFound) failures.push('utility-widget was not found on /ui-lab');
  if (lab.widgetPaddingTop !== '32px') failures.push('p-8 padding-top=' + lab.widgetPaddingTop);
  if (lab.widgetFontWeight !== '600') failures.push('font-semibold weight=' + lab.widgetFontWeight);
  // The declared theme source reached the component sheet: the bg-probe role
  // painted a real colour inside the shadow tree. The computed value is
  // engine-normalized oklch, so this asserts "a real colour", while the
  // sheet-text assertion in the harness pins the exact role declaration.
  if (/^(?:rgba?\\(0, 0, 0, 0\\)|transparent)$/.test(lab.widgetBackground)) {
    failures.push('the declared package theme role did not paint: ' + lab.widgetBackground);
  }
  // The discriminator is the MEASURED application, not CSS.supports: this
  // WebKit build reports support for the rotate property yet ignores it in an
  // adopted sheet (and in the delivered shadow link), so support claims are not
  // evidence.
  const engineAppliesRotate =
    String(lab.engineRotateProperty) === '45deg' ||
    String(lab.engineRotateProperty).startsWith('matrix(');
  if (engineAppliesRotate) {
    const rotated = lab.widgetRotate === '45deg' || String(lab.widgetTransform).startsWith('matrix(');
    if (!rotated) failures.push('rotate-45 apply: rotate=' + lab.widgetRotate + ' transform=' + lab.widgetTransform);
  } else {
    // Reported platform boundary, measured: this engine does not implement the
    // independent rotate property that Tailwind v4 lowers rotate-45 to. The
    // delivered rule is verified by the artifact assertion; the lane does not
    // rewrite Tailwind's output into a transform fallback (no measured need).
    console.log('[' + browserName + '] rotate-45 not applied: engine lacks the rotate property (rule delivered, engine ignores it)');
  }
  if (!home.counterFound) failures.push('my-counter was not found on /');
  if (home.counterPaddingTop !== '8px') failures.push('starter island p-2 padding-top=' + home.counterPaddingTop);
  if (lab.lightTransform !== 'none') failures.push('component sheet leaked rotate-45 into the document: ' + lab.lightTransform);
  if (lab.lightPaddingTop !== '0px') failures.push('component sheet leaked p-8 into the document: ' + lab.lightPaddingTop);
  if (lab.sheetStatus !== 200) failures.push('component sheet href did not load: ' + lab.sheetHref + ' status=' + lab.sheetStatus);
  if (!lab.sheetType.includes('text/css')) failures.push('component sheet content-type=' + lab.sheetType);
  if (failures.length > 0) throw new Error('[' + browserName + '] ' + failures.join(' | ') + ' :: ' + JSON.stringify(measured));
  console.log('UI-UTILITY-OK ' + browserName + ' ' + browser.version() + ' ' + JSON.stringify(measured));
  console.log('[rotate-ab:' + browserName + '] ' + JSON.stringify(measured.lab.rotateAb) + ' engine=' + browser.version());
} finally {
  await browser.close();
}
`;

/** Boot-free runner: the caller already has the start server up at `baseUrl`. */
async function runUtilityBrowserMatrix(starter: string, baseUrl: string): Promise<void> {
  const probePath = join(starter, 'pw-utility-probe.mjs');
  await writeFile(probePath, UI_UTILITY_PROBE_SCRIPT);
  const failures: string[] = [];
  for (const browserName of ['chromium', 'firefox', 'webkit'] as const) {
    const probe = await run(
      process.execPath,
      [probePath, baseUrl, browserName],
      starter,
      BROWSER_TIMEOUT_MS,
    );
    if (probe.success && probe.output.includes(`UI-UTILITY-OK ${browserName}`)) {
      // Record the measurements themselves, not just the verdict: the A/B rows
      // are the evidence a reviewer reads (computed values + geometry + engine
      // version, per engine).
      for (const line of probe.output.split('\n')) {
        if (line.includes('UI-UTILITY-OK') || line.includes('[rotate-ab:'))
          console.log(line.trim());
      }
      console.log(`PASS utility computed styles / ${browserName} / pass`);
    } else {
      failures.push(
        `utility computed styles / ${browserName} / FAIL:\n${probe.output.slice(-2000)}`,
      );
      console.log(`FAIL utility computed styles / ${browserName} / fail`);
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Packed utility computed-style matrix failed (${failures.length}/3 browsers):\n` +
        failures.join('\n'),
    );
  }
  console.log('Packed utility computed-style matrix passed (chromium+firefox+webkit).');
}

async function main(): Promise<void> {
  const tmp = await mkdtemp(join(tmpdir(), 'openelement-packaged-ui-app-'));
  try {
    const npmEnv = { NPM_CONFIG_CACHE: join(tmp, '.npm-cache') };
    const workspacePackages = await readPackages();
    const tarballFor = (name: string): string => {
      const pkg = workspacePackages.find((candidate) => candidate.name === name);
      if (!pkg) throw new Error(`Retained package missing from workspace graph: ${name}`);
      return join(repoRoot, tarballPath(pkg));
    };
    const tarballs = RETAINED_PACKAGE_NAMES.map(tarballFor);
    for (const tarball of tarballs) {
      if (!existsSync(tarball)) {
        throw new Error(
          `Missing packed release artifact: ${tarball} (run \`pnpm --dir tools/release run pack:dry-run\` first)`,
        );
      }
    }
    const uiTarball = tarballFor('@openelement/ui');
    const routerTarball = tarballFor('@openelement/router');
    const elementTarball = tarballFor('@openelement/element');

    const install = await run(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--fetch-timeout=30000',
        ...tarballs,
      ],
      tmp,
      NPM_INSTALL_TIMEOUT_MS,
      npmEnv,
    );
    if (!install.success) throw new Error(`Packed package installation failed:\n${install.output}`);

    const createBinName = Object.keys(CREATE_BIN).sort()[0];
    const create = await run(
      'npm',
      ['exec', createBinName, '--', 'starter', '--no-install'],
      tmp,
      NPM_INSTALL_TIMEOUT_MS,
      npmEnv,
    );
    if (!create.success) throw new Error(`Packed starter generation failed:\n${create.output}`);
    if (!create.output.includes(`@openelement/create ${CREATE_VERSION}`)) {
      throw new Error(
        `Packed create CLI handoff box does not name its version ` +
          `(@openelement/create ${CREATE_VERSION}):\n${create.output}`,
      );
    }

    // The dependency-only utility probe (S-C2/S-13): compiled + packed here,
    // installed into the appliance as a tarball.
    const widgetTarball = await packUtilityWidget(tmp);

    // --- Appliance 1: the ui dependency + the framework declaration ---
    const starter = join(tmp, 'starter');
    const manifestPath = join(starter, 'package.json');
    const manifest = (await readJson(manifestPath)) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    // The Vite+ lifecycle renames `check` to `typecheck` (`tsc --noEmit`);
    // `fmt`/`lint` exist too but this appliance does not drive them.
    for (const script of ['dev', 'typecheck', 'build', 'start']) {
      if (typeof manifest.scripts[script] !== 'string') {
        throw new Error(`Packed starter is missing the '${script}' script.`);
      }
    }
    manifest.dependencies['@openelement/router'] = pathToFileURL(routerTarball).href;
    manifest.dependencies['@openelement/element'] = pathToFileURL(elementTarball).href;
    // The appliance's own dependency: the package the README's recipe teaches.
    manifest.dependencies['@openelement/ui'] = pathToFileURL(uiTarball).href;
    // The browser probe (gap B) resolves @playwright/test from inside the
    // starter, exactly as the starter leg supplies its own probe pin.
    manifest.devDependencies['@playwright/test'] = PW_PROBE_PIN;
    // The dependency-only utility probe: installed from ITS OWN fresh tarball.
    manifest.dependencies['@acme/utility-widget'] = pathToFileURL(widgetTarball).href;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    // The scaffold's own pnpm-workspace.yaml is load-bearing for the Vite+
    // form: its catalog resolves `vite-plus: "catalog:"` in the manifest and
    // the `vite@*: "catalog:"` override points every peer's vite at the Vite+
    // core build. Assert the packed scaffold carries it (same fragments the
    // starter leg and the starter-smoke setup anchor) BEFORE this gate
    // touches the file. The read is itself the existence check
    // (read-and-expect-ENOENT, no existsSync shape probe): a missing file
    // fails the gate right here without opening a check-then-write race
    // window on the path below.
    const workspacePath = join(starter, 'pnpm-workspace.yaml');
    let workspaceYaml: string;
    try {
      workspaceYaml = await readFile(workspacePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        throw new Error(
          'Packed starter is missing pnpm-workspace.yaml (the Vite+ catalog/override form ships it)',
        );
      }
      throw error;
    }
    for (const fragment of [
      'npm:@voidzero-dev/vite-plus-core@1.1.0',
      'vite-plus: 1.1.0',
      'vite@*: "catalog:"',
    ]) {
      if (!workspaceYaml.includes(fragment)) {
        throw new Error(
          `Packed starter pnpm-workspace.yaml is not the Vite+ form: missing ${fragment}`,
        );
      }
    }
    // Every framework package resolves to this checkout's tarballs (the #1557
    // transitive workspace pins), so the legs qualify the packed artifacts
    // end-to-end (same overrides contract as the starter leg). The file://
    // pins fold INTO the scaffold's own `overrides:` block so every shipped
    // entry stays verbatim: rebuilding the file would drop the catalog and
    // leave `vite-plus: "catalog:"` unresolvable at install (same fold the
    // starter leg performs).
    const frameworkTarballs: Array<[string, string]> = [
      ['@openelement/protocol', tarballFor('@openelement/protocol')],
      ['@openelement/element', elementTarball],
      ['@openelement/compiler', tarballFor('@openelement/compiler')],
      ['@openelement/router', routerTarball],
      ['@openelement/ui', uiTarball],
    ];
    const overridesKey = /^overrides:\n/m;
    // One deterministic pass over the in-memory read (same fold shape as the
    // starter leg): transform first, then validate the transformation against
    // the same string it was computed from (a no-op replace is exactly the
    // missing-overrides case), then write once — no shape check precedes the
    // write, so the check-then-write TOCTOU window CodeQL flags
    // (js/file-system-race) cannot open here.
    const foldedYaml = workspaceYaml.replace(
      overridesKey,
      `overrides:\n${frameworkTarballs
        .map(([name, path]) => `  "${name}": ${pathToFileURL(path).href}`)
        .join('\n')}\n`,
    );
    if (foldedYaml === workspaceYaml) {
      throw new Error(
        'Packed starter pnpm-workspace.yaml has no overrides block to extend; ' +
          'the Vite+ scaffold form changed under this gate',
      );
    }
    await writeFile(workspacePath, foldedYaml);

    const configPath = join(starter, 'openelement.config.ts');
    const config = await readFile(configPath, 'utf8');
    if (!config.includes(CONFIG_ANCHOR)) {
      throw new Error(
        `Packed starter openelement.config.ts lost its "${CONFIG_ANCHOR}" anchor — ` +
          'the appliance cannot declare packageIslands (file):\n' +
          config.slice(0, 500),
      );
    }
    await writeFile(
      configPath,
      config.replace(
        CONFIG_ANCHOR,
        `${CONFIG_ANCHOR}\n  packageIslands: ['@openelement/ui', '@acme/utility-widget'],`,
      ),
    );

    // ─── Gap A: the starter's OWN island uses a Tailwind utility (S.2 gate) ──
    // The starter is generated by the real packed create CLI above; this edit
    // touches the GENERATED app (the shipped template default is unchanged, so
    // no authoring-design decision is taken here). The island's shadow markup
    // gains `p-2`, and the component stylesheet must carry the rule.
    const counterPath = join(starter, 'app', 'islands', 'my-counter.tsx');
    const counterSource = await readFile(counterPath, 'utf8');
    if (!counterSource.includes('class="counter-row"')) {
      throw new Error(
        'Packed starter island my-counter.tsx lost its "counter-row" class — the utility ' +
          'gate cannot state its edit:\n' +
          counterSource.slice(0, 400),
      );
    }
    await writeFile(
      counterPath,
      counterSource.replace('class="counter-row"', `class="counter-row ${STARTER_ISLAND_UTILITY}"`),
    );

    await writeFile(join(starter, 'app', 'components', 'ui-lab.tsx'), UI_LAB_COMPONENT);
    await writeFile(join(starter, 'app', 'routes', 'ui-lab.tsx'), UI_LAB_ROUTE);

    const installStarter = await run(
      'pnpm',
      ['install', '--no-frozen-lockfile'],
      starter,
      NPM_INSTALL_TIMEOUT_MS,
    );
    if (!installStarter.success) {
      throw new Error(`UI-appliance dependency install failed:\n${installStarter.output}`);
    }
    await assertConsumerDoesNotResolveIntoRepository(join(tmp, 'node_modules'));
    await assertConsumerDoesNotResolveIntoRepository(join(starter, 'node_modules'));

    // Read the installed package's own sheet bytes: the emitted assets are
    // compared against THESE bytes (the package the appliance installed), never
    // against a repository copy.
    const starterRequire = createRequire(join(starter, 'package.json'));
    const uiModulePath = starterRequire.resolve('@openelement/ui/open-button');
    const uiSheetPath = uiModulePath.replace(/\.js$/, '.css');
    const uiSheet = await readFile(uiSheetPath, 'utf8');
    if (!uiSheet.includes('.btn[hidden]')) {
      throw new Error(
        `Installed @openelement/ui open-button sheet at ${uiSheetPath} lost its authored ` +
          'markers — the packed package is not the artifact this gate expects',
      );
    }

    // Lifecycle leg 1 — dev: the packed adapter must boot the real vite dev
    // server (the Vite+ core, through the starter's `vp dev` script) and
    // SSR-render the appliance page over HTTP. Without the
    // packageIslands → ssr.noExternal wiring (KR-10(a)) this leg dies with
    // `Unknown file extension ".css"` from Node's ESM loader; without the dev
    // style-edge intake it dies at the `.css` module's default export. The DSD
    // marker proves the component sheets reached the rendered shadow roots.
    await exerciseServer(
      'Packed UI appliance dev server',
      (port) => ['run', 'dev', '--port', String(port), '--host', '127.0.0.1', '--strictPort'],
      starter,
      [
        ['/', 'Rendered before JavaScript arrives'],
        ['/ui-lab', '<open-button'],
        ['/ui-lab', '<open-dialog'],
        ['/ui-lab', '<open-code-block'],
        ['/ui-lab', 'data-oe-static-styles'],
        // S-C1.3/S-C1.4 contract: a package component's file-backed sheet is
        // served as an EXTERNAL dev resource and declared by a marked link —
        // its authored text is never inlined into the HTML.
        ['/ui-lab', '.openElement/authored-css.'],
      ],
    );

    // Lifecycle leg 2 — typecheck (the check→typecheck rename of the Vite+
    // lifecycle): the appliance's own `tsc --noEmit` against the packed UI
    // declarations.
    const typecheck = await run('pnpm', ['run', 'typecheck'], starter);
    if (!typecheck.success) {
      throw new Error(`Packed UI appliance typecheck failed:\n${typecheck.output}`);
    }
    console.log(`Packed UI appliance typecheck passed for ${PACKAGE_VERSION}.`);

    // Lifecycle leg 3 — build: the packed adapter must run the real SSG build.
    // This is the KR-10(b) detector: the package island's sheet imports reach
    // the bundler as module edges, and without the style-edge intake the build
    // fails at MISSING_EXPORT (`"default" is not exported by
    // ".../open-button.css"`).
    const build = await run('pnpm', ['run', 'build'], starter, BUILD_TIMEOUT_MS);
    if (!build.success) throw new Error(`Packed UI appliance SSG build failed:\n${build.output}`);

    const serverEntry = join(starter, 'dist', 'server', 'index.js');
    if (!existsSync(serverEntry)) {
      throw new Error(
        `Packed UI appliance build emitted no request-time server entry: ${serverEntry}`,
      );
    }

    // The prerendered appliance page carries the three hosts and the package
    // sheets as DSD text (the SSR half of the style protocol).
    const uiLabHtml = join(starter, 'dist', 'ui-lab', 'index.html');
    if (!existsSync(uiLabHtml)) {
      throw new Error('Packed UI appliance build did not prerender the /ui-lab page');
    }
    const uiLabBody = await readFile(uiLabHtml, 'utf8');
    for (const marker of [
      '<open-button',
      '<open-dialog',
      '<open-code-block',
      'data-oe-static-styles',
      '/client/assets/',
    ]) {
      if (!uiLabBody.includes(marker)) {
        throw new Error(`Packed UI appliance dist/ui-lab/index.html missing marker: ${marker}`);
      }
    }

    // The sheets left the JS: each installed sheet's exact bytes exist as a
    // content-addressed client asset (the client half of the protocol).
    const clientAssetsDir = join(starter, 'dist', 'client', 'assets');
    const emittedSheets = existsSync(clientAssetsDir)
      ? (await readdir(clientAssetsDir)).filter((name) => name.endsWith('.css'))
      : [];
    if (emittedSheets.length === 0) {
      throw new Error(
        `Packed UI appliance build emitted no client css assets under ${clientAssetsDir}`,
      );
    }
    // Identity is asserted by PROVENANCE, not by byte-equality: Vite's CSS
    // pipeline is the ONE processing path for a sheet's text (ADR-0164,
    // S-C1.3 follow-up), and a production build runs its CSS minifier over the
    // emitted asset, so the asset is the PROCESSED sheet (`blue` becomes
    // `#00f`, comments and whitespace are gone) and can never equal the
    // authored file. An emitted asset must instead carry every rule SELECTOR
    // the installed sheet declares — an inlined copy or a framework-generated
    // sheet cannot — and a shadow component's sheet must ship unscoped.
    const installedSelectors = sheetSelectors(uiSheet);
    const emittedTexts = await Promise.all(
      emittedSheets.map(async (name) => ({
        name,
        css: await readFile(join(clientAssetsDir, name), 'utf8'),
      })),
    );
    const provenance = emittedTexts.filter(({ css }) => {
      const selectors = sheetSelectors(css);
      return installedSelectors.every((selector) => selectors.includes(selector));
    });
    if (provenance.length === 0) {
      throw new Error(
        'Packed UI appliance build emitted no client css asset carrying the installed ' +
          `@openelement/ui open-button sheet's rules (${uiSheetPath}) — the package sheet ` +
          'did not travel the style asset protocol',
      );
    }
    for (const { name, css } of provenance) {
      if (css.includes('@scope (')) {
        throw new Error(
          `Packed UI appliance sheet asset ${name} is @scope-wrapped — a shadow-root ` +
            "component's sheet ships unscoped",
        );
      }
    }
    // The dependency-only utility probe (S-C2/S-13): the component stylesheet
    // must carry the widget's unnoticed utility classes — they exist only in
    // the installed package's compiled candidates — and nothing else.
    const componentSheet = emittedTexts.find(({ css }) => css.includes('.p-8'));
    if (componentSheet === undefined) {
      throw new Error(
        'Packed UI appliance emitted no component stylesheet carrying the dependency-only ' +
          `utility candidates (${UTILITY_WIDGET_CANDIDATES.join(', ')}) — the packaged candidate ` +
          "facts did not reach the consumer build's Tailwind compile",
      );
    }
    for (const candidate of UTILITY_WIDGET_CANDIDATES) {
      if (!componentSheet.css.includes(`.${candidate}`)) {
        throw new Error(
          `Component stylesheet ${componentSheet.name} is missing the unseen utility .${candidate} ` +
            `(dependency-only candidate):\n${componentSheet.css.slice(0, 400)}`,
        );
      }
    }
    // Gap A: the STARTER's own island utility must be compiled into the same
    // component sheet — a generated-starter shadow island using Tailwind
    // utilities with no hidden style plumbing.
    if (!componentSheet.css.includes(`.${STARTER_ISLAND_UTILITY}`)) {
      throw new Error(
        `Component stylesheet ${componentSheet.name} is missing the starter island's ` +
          `utility .${STARTER_ISLAND_UTILITY} (generated app source)`,
      );
    }
    // No full utility bundle: rules for utilities nothing references cannot be
    // in a per-candidate compile.
    // ADR-0167: the package's DECLARED theme source compiled into the sheet —
    // the role declaration and the `bg-probe` rule that reads it. No
    // application source names this sheet; only the probe package does.
    if (!componentSheet.css.includes(`${PROBE_ROLE}:`)) {
      throw new Error(
        `Component stylesheet ${componentSheet.name} is missing the declared package role ` +
          `${PROBE_ROLE} — the declaration's source did not compile:\n${componentSheet.css.slice(0, 400)}`,
      );
    }
    if (!componentSheet.css.includes('bg-probe') || !componentSheet.css.includes(PROBE_ROLE)) {
      throw new Error(
        `Component stylesheet ${componentSheet.name} carries no bg-probe rule over ${PROBE_ROLE}:\n` +
          componentSheet.css.slice(0, 400),
      );
    }
    for (const absent of ABSENT_UTILITY_PROBES) {
      if (componentSheet.css.includes(`.${absent}`)) {
        throw new Error(
          `Component stylesheet ${componentSheet.name} carries .${absent}, which no source ` +
            'references — the component sheet is compiling more than the admitted candidates',
        );
      }
    }
    // Scope routing: the LIGHT root's utility belongs to the document sheet, and
    // must not be duplicated into the shadow components' component sheet.
    const documentSheets = emittedTexts.filter(({ css }) => css.includes(`.${LIGHT_ROOT_UTILITY}`));
    if (documentSheets.length === 0) {
      throw new Error(
        `No emitted stylesheet carries the light root's utility .${LIGHT_ROOT_UTILITY} — the ` +
          'document entry must compile the page-level classes',
      );
    }
    if (componentSheet.css.includes(`.${LIGHT_ROOT_UTILITY}`)) {
      throw new Error(
        `Component stylesheet ${componentSheet.name} carries the light root's .${LIGHT_ROOT_UTILITY} ` +
          "— a light root's classes belong to the document entry, not to the shadow component sheet",
      );
    }
    // The widget's DSD template declares that component sheet as a marked link:
    // a shadow tree is styled by its own resource, never by a document node.
    const widgetMarkup = new RegExp(
      `<${UTILITY_WIDGET_TAG}>[\\s\\S]*?<link rel="stylesheet" href="([^"]+)" data-oe-static-styles \\/>`,
    ).exec(uiLabBody);
    if (widgetMarkup === null) {
      throw new Error(
        `<${UTILITY_WIDGET_TAG}> carries no marked stylesheet link in its DSD template — the ` +
          'shadow component was not styled by its own component sheet',
      );
    }
    if (!widgetMarkup[1]!.includes(componentSheet.name)) {
      throw new Error(
        `<${UTILITY_WIDGET_TAG}> declares ${widgetMarkup[1]} as its sheet, but the component ` +
          `stylesheet is ${componentSheet.name}`,
      );
    }

    // Package island attribution: the client build's identity join produced a
    // chunk per exercised component (fail-closed in the build; asserted here
    // as the consumer form).
    const islandsDir = join(starter, 'dist', 'client', 'islands');
    const islandFiles = existsSync(islandsDir) ? await readdir(islandsDir) : [];
    for (const tag of ['open-button', 'open-dialog', 'open-code-block']) {
      if (!islandFiles.some((name) => name.startsWith(`island-${tag}`))) {
        throw new Error(
          `Packed UI appliance client build emitted no island-${tag} chunk ` +
            `(islands: ${islandFiles.join(', ')})`,
        );
      }
    }

    // Zero-inline scan: no emitted client JS may carry component CSS text — a
    // silent inline would deliver the styles as JS bytes instead of assets.
    for (const file of islandFiles.filter((name) => name.endsWith('.js'))) {
      const source = await readFile(join(islandsDir, file), 'utf8');
      for (const marker of UI_SHEET_MARKERS) {
        if (source.includes(marker)) {
          throw new Error(
            `Packed UI appliance island chunk ${file} carries component CSS text ` +
              `("${marker}") — the sheets must ship as emitted .css assets, not JS bytes`,
          );
        }
      }
    }
    console.log(`Packed UI appliance SSG build passed for ${PACKAGE_VERSION}.`);

    // Lifecycle leg 4 — start: serve the built output through the documented
    // local entry (cli/start) and assert the appliance page over HTTP.
    await exerciseServer('Packed UI appliance start server', () => ['run', 'start'], starter, [
      ['/', 'Rendered before JavaScript arrives'],
      ['/ui-lab', '<open-button'],
      ['/ui-lab', '/client/assets/'],
      ['/ui-lab', 'data-oe-static-styles'],
    ]);
    // Gap B: the same running server feeds the real-engine computed-style matrix.
    await exerciseServer(
      'Packed UI appliance start server (browser matrix)',
      () => ['run', 'start'],
      starter,
      [['/ui-lab', '<open-button']],
      (baseUrl) => runUtilityBrowserMatrix(starter, baseUrl),
    );
  } finally {
    await rm(tmp, { recursive: true }).catch(() => undefined);
  }
}

if (import.meta.main) await main();
