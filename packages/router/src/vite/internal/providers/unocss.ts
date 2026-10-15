/**
 * The UnoCSS style provider (alpha15 stage 2B).
 *
 * WHAT THIS ADAPTER IS. UnoCSS is a real third-party engine, reached through
 * its own public API: `createGenerator` from `unocss`, `loadConfig` from
 * `@unocss/config` (the same loader the official CLI and Vite plugin use), the
 * official `presetWind4` for the `tailwind4` dialect, and the generator's own
 * `applyExtractors` for source scanning. This module writes no utility grammar,
 * mocks no compiler and hardcodes no CSS: every rule in an emitted sheet was
 * produced by UnoCSS from a token the framework handed it, or by the resolved
 * preset's own theme/preflight layers.
 *
 * THE TWO SHEETS.
 *
 * - COMPONENT sheet — `generate(candidates, { preflights: false })`: the
 *   utilities a shadow root's admitted class tokens need. No preflight: a
 *   reset inside a component's own shadow tree would change every existing
 *   component's rendering. The theme VARIABLES a shadow tree consumes are the
 *   document sheet's (`:root, :host`), and custom properties inherit across
 *   the shadow boundary — one theme source for the whole document, exactly
 *   like the application's own tokens.
 *
 * - DOCUMENT sheet — the resolved config's preflight layers (properties +
 *   theme, plus the base reset when the plan says the document belongs to the
 *   application) followed by the utilities compiled from the admitted
 *   candidates AND the tokens the generator's own extractors find in the
 *   module texts the framework walked. That division is the port's whole
 *   point: the framework traverses its graph and delivers the bytes; UnoCSS
 *   decides what a token means.
 *
 * RESET POLICY. `documentReset` is the one fact the application owns
 * (`ResolvedStylePlan.documentReset`). When the framework installs its default
 * preset — which it does exactly when the project carries no `uno.config.ts`
 * — that policy rides the preset's own `preflights.reset` option. When the
 * project DOES carry a configuration, its presets are the application's own
 * and its reset choice is the application's (`uno.config.ts` is where an
 * UnoCSS application states its preflight policy); the automatic-mode
 * guarantee still holds because automatic mode by definition has no
 * application declaration and therefore no application preset set.
 *
 * THEME SOURCES. Declared `theme` sources are plain CSS and are included
 * verbatim: an UnoCSS sheet is real CSS by the time it exists, so a
 * token/role file (Open Props, a package's `:root` block) needs no
 * engine-specific transform — this is what makes the theme source independent
 * of the utility generator. A source that carries Tailwind's `@theme` at-rule
 * is the one shape this adapter cannot honour (nothing would compile it and
 * the roles would be silently absent), so it fails closed and names both
 * supported shapes.
 *
 * FAILURE POSTURE. Failures keep their codes: a missing peer, an unloadable
 * configuration, a declared source that cannot be resolved, a `@theme` source
 * this adapter cannot compile, and a document sheet that compiles to nothing at
 * all. A COMPONENT sheet that compiles to nothing is not in that list — a
 * zero-match compile is the engine's answer for an application's own native-CSS
 * hooks, and it is delivered as the empty sheet it is.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dirname, isAbsolute, join, resolve } from 'pathe';
import { PresetErrorCode, buildError } from '../../../internal/error-codes.ts';
import type { StyleSheetCompileInput, StyleProvider } from '../style-provider.ts';
import type { ResolvedStyleSelection } from '../style-plan.ts';

/** The generator surface this adapter consumes (the official public shape). */
interface UnoGeneratorLike {
  applyExtractors(code: string, id?: string): Promise<Set<string>>;
  generate(
    tokens: Iterable<string>,
    options: { preflights: boolean },
  ): Promise<{ css: string; matched: Set<string> }>;
}

/** The resolved-config loader's contract (the official `@unocss/config`). */
interface UnoConfigModule {
  /**
   * `sources` is the set of files the configuration was read from, and it is
   * what the engine's own dev plugin watches (`@unocss/vite`'s
   * `ConfigHMRPlugin`). The installed versions hand these back as plain paths
   * — `unconfig`, which `@unocss/config` delegates to, returns `string[]` —
   * while the loader's public type describes `{ filepath }` records. Both
   * shapes are accepted here because only the running version knows which it
   * is, and reading the wrong one silently yields an empty watch list.
   */
  loadConfig(
    cwd: string,
    configOrPath?: string,
    extraConfigSources?: unknown[],
  ): Promise<{
    config: Record<string, unknown>;
    sources: Array<string | { filepath?: string }>;
  }>;
}

/** The `unocss` package's public surface, as this adapter uses it. */
interface UnocssModule {
  createGenerator(config: Record<string, unknown>): Promise<UnoGeneratorLike>;
  presetWind4(options?: Record<string, unknown>): unknown;
}

/** One compiled UnoCSS sheet plus the files whose change would move it. */
interface UnoCompile {
  readonly generator: UnoGeneratorLike;
  readonly watchFiles: readonly string[];
  /**
   * The document sheet's static head: the declared CSS sources. Read per
   * compile (never cached at construction) so a dev edit to a token file
   * moves the served sheet.
   */
  readonly documentPrefix: () => string;
}

/** The `@theme` at-rule Tailwind compiles; UnoCSS has no such transform. */
const TAILWIND_THEME_AT_RULE = '@theme';

/**
 * Load the `unocss` package from the APPLICATION's own resolution — never from
 * the router's tree, so a packed consumer's declared dependency is what runs.
 * Fails closed with the entry seam's coded error when the peer is missing.
 */
function resolveUnocssEntry(root: string): string {
  try {
    return createRequire(join(root, 'package.json')).resolve('unocss');
  } catch (cause) {
    throw buildError(
      PresetErrorCode.UNOCSS_UNRESOLVABLE,
      '[unocss] the unocss option is enabled but the `unocss` package is not resolvable from ' +
        `the project root (${root}). Install it in the application: \`unocss\` is an optional ` +
        'peer of @openelement/router.',
      { cause: cause instanceof Error ? cause : undefined },
    );
  }
}

async function loadUnocss(root: string): Promise<UnocssModule> {
  return (await import(pathToFileURL(resolveUnocssEntry(root)).href)) as UnocssModule;
}

/** Load the official configuration loader from the peer's own dependency tree. */
async function loadConfigModule(unocssEntry: string): Promise<UnoConfigModule> {
  const require = createRequire(unocssEntry);
  let entry: string;
  try {
    entry = require.resolve('@unocss/config');
  } catch (cause) {
    throw buildError(
      PresetErrorCode.UNOCSS_CONFIG_UNLOADABLE,
      '[unocss] the installed `unocss` package carries no resolvable config loader ' +
        '(@unocss/config), so the project configuration cannot be read.',
      { cause: cause instanceof Error ? cause : undefined },
    );
  }
  return (await import(pathToFileURL(entry).href)) as UnoConfigModule;
}

/** Resolve one declared `unocss.config` path against the application root. */
function resolveDeclaredConfigPath(root: string, declared: string): string {
  const file = isAbsolute(declared) ? declared : resolve(root, declared);
  if (!existsSync(file)) {
    throw buildError(
      PresetErrorCode.UNOCSS_CONFIG_UNRESOLVED,
      `[unocss] the declaration names the configuration "${declared}", but the project does ` +
        `not carry it (resolved: ${file}). Correct the path, or omit \`config\` to let UnoCSS ` +
        'search for its conventional file names (uno.config.ts and friends) from the project root.',
    );
  }
  return file;
}

/**
 * Include one declared theme source verbatim, resolving the one thing that
 * cannot travel verbatim: its `@import`s. A token file composes other token
 * files (`@import 'open-props/style'`, `@import './colors.css'`), and the
 * browser cannot resolve a bare specifier — so each import is resolved through
 * the platform resolver (bare specifiers from the app root, relative ones
 * against their importer) and inlined depth-first, with a cycle guard. This is
 * a resolution step, not a CSS transform: nothing inside the imported text is
 * rewritten.
 *
 * An `@import` is an at-rule with a prelude, and the prelude's conditions are
 * part of its meaning:
 *
 *     @import <url> [layer | layer(name)]? [supports(cond)]? <media-query-list>? ;
 *
 * The child's rules are inlined wrapped in the at-rules those conditions
 * denote — `layer` outermost, then `supports`, then `media`, which is the
 * nesting the spec defines for them. Matching only the bare form (as this
 * adapter first did) left `@import './child.css' layer(tokens)` untouched: the
 * child's tokens never reached the sheet at all, and the surviving `@import`
 * was not the browser's to resolve either.
 *
 * Comments are not syntax. The scan runs over a copy of the text whose comments
 * are blanked to spaces (same length, so offsets still address the original),
 * which is what keeps `@theme` mentioned in a comment from being read as
 * Tailwind's at-rule and a commented-out `@import` from being resolved.
 *
 * The one shape this adapter cannot honour is Tailwind's `@theme` at-rule
 * (nothing here compiles it, so the roles it declares would be silently
 * absent), and it fails closed naming both supported shapes.
 */
function readThemeSource(
  root: string,
  source: string,
  state: InlineState = newInlineState(),
): string {
  const file = resolveThemeSource(root, source);
  // A cycle is a file reached while it is still being read; a repeat is one
  // already inlined down another branch. Both stop here, and they are reported
  // apart because only the first is a defect in the source.
  if (state.active.has(file)) return `/* circular @import skipped: ${source} */\n`;
  if (state.inlined.has(file)) {
    return `/* repeated @import skipped (already inlined): ${source} */\n`;
  }
  state.active.add(file);
  state.inlined.add(file);
  const text = readFileSync(file, 'utf8');
  // Everything below reads the blanked view and writes the original; the two
  // stay aligned because a comment keeps its length.
  const scanned = blankComments(text);
  if (scanned.includes(TAILWIND_THEME_AT_RULE)) {
    throw buildError(
      PresetErrorCode.UNOCSS_THEME_SOURCE_INCOMPATIBLE,
      `[unocss] the declared style source "${source}" carries Tailwind's ` +
        `\`${TAILWIND_THEME_AT_RULE}\` at-rule, which UnoCSS does not compile — the roles it ` +
        'declares would be silently absent from the document sheet. UnoCSS accepts (a) ' +
        'plain-CSS token files (`:root { --color-…: … }`, e.g. Open Props) as `theme` ' +
        'sources, and (b) the role table in `uno.config.ts`’s own `theme` key.',
    );
  }
  // The scan walks the BLANKED view while the output is cut from the original;
  // the two stay aligned because a comment keeps its length, so an import
  // written inside a comment is skipped and every other byte is preserved.
  let output = '';
  let cursor = 0;
  for (const match of scanned.matchAll(CSS_IMPORT_RE)) {
    const specifier = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? '';
    const prelude = match[6] ?? '';
    // A scheme URL, a protocol-relative URL or a root-absolute URL is not this
    // device's to resolve: the browser owns it and it stays exactly as written.
    if (/^[a-z][a-z0-9+.-]*:/i.test(specifier) || specifier.startsWith('//')) continue;
    if (specifier.startsWith('/')) continue;
    // A local specifier that cannot be resolved fails closed here rather than
    // reaching the browser: an inlined sheet has no resolver to fall back on,
    // and a silently dropped token file is the "half-styled" failure this
    // adapter exists to prevent.
    const resolved = resolveThemeSource(root, specifier, dirname(file));
    const child = readThemeSource(root, resolved, state);
    output += text.slice(cursor, match.index);
    output += `/* @import '${specifier}' */\n${applyImportConditions(child, parseImportConditions(prelude, specifier))}`;
    cursor = match.index + match[0].length;
  }
  state.active.delete(file);
  return output + text.slice(cursor);
}

/** The two walk facts: what is being read now, and what has been inlined. */
interface InlineState {
  /** Files on the current chain — a second visit is a cycle. */
  readonly active: Set<string>;
  /** Files already inlined anywhere — a second visit is a repeat. */
  readonly inlined: Set<string>;
}

function newInlineState(): InlineState {
  return { active: new Set(), inlined: new Set() };
}

/**
 * A copy of `text` with every comment blanked to spaces — same length, same
 * line breaks — so a scan cannot read syntax out of prose while replacements
 * still address the original text.
 */
function blankComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

/** One `@import` statement, with its URL and the rest of its prelude. */
const CSS_IMPORT_RE =
  /@import\s+(?:url\(\s*(?:'([^']*)'|"([^"]*)"|([^'")\s]*))\s*\)|'([^']*)'|"([^"]*)")[ \t]*([^;]*);/g;

/** The conditions one `@import` prelude carries, in the order it carries them. */
interface ImportConditions {
  /** `layer` (the anonymous form) or `layer(name)`. */
  readonly layer?: string | true;
  /** The `supports(...)` condition, without the parentheses that wrapped it. */
  readonly supports?: string;
  /** Whatever followed: a media query list. */
  readonly media?: string;
}

/**
 * Read an `@import` prelude's conditions. Blank comments come in, so the text
 * is the at-rule's own; anything the grammar does not recognise lands in
 * `media` and is carried through verbatim rather than dropped.
 */
function parseImportConditions(raw: string, specifier: string): ImportConditions {
  const conditions: { layer?: string | true; supports?: string; media?: string } = {};
  let rest = raw.trim();
  const layer = /^layer(?:\s*\(\s*([^)]*)\s*\))?/i.exec(rest);
  if (layer !== null) {
    conditions.layer = layer[1] === undefined || layer[1].trim() === '' ? true : layer[1].trim();
    rest = rest.slice(layer[0].length).trim();
  }
  const supports = /^supports\s*\(/i.exec(rest);
  if (supports !== null) {
    const balanced = readBalanced(rest, supports[0].length - 1);
    if (balanced === null) {
      throw buildError(
        PresetErrorCode.UNOCSS_THEME_SOURCE_INCOMPATIBLE,
        `[unocss] the declared style source imports "${specifier}" with an unbalanced ` +
          `\`supports(...)\` condition, which cannot be transcribed: ${rest}`,
      );
    }
    conditions.supports = balanced.value.trim();
    rest = rest.slice(balanced.end + 1).trim();
  }
  if (rest !== '') conditions.media = rest;
  return conditions;
}

/** The text between the parenthesis at `open` and its match, and where it closed. */
function readBalanced(text: string, open: number): { value: string; end: number } | null {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const character = text[index];
    if (character === '(') depth += 1;
    else if (character === ')') {
      depth -= 1;
      if (depth === 0) return { value: text.slice(open + 1, index), end: index };
    }
  }
  return null;
}

/**
 * Transcribe an import's conditions onto the inlined child: `layer` outermost,
 * then `supports`, then `media` — the nesting CSS Cascade defines for a
 * conditional import, spelled as the at-rules a reader can see.
 */
function applyImportConditions(child: string, conditions: ImportConditions): string {
  let wrapped = child;
  if (conditions.media !== undefined) wrapped = `@media ${conditions.media} {\n${wrapped}\n}`;
  if (conditions.supports !== undefined) {
    wrapped = `@supports (${conditions.supports}) {\n${wrapped}\n}`;
  }
  if (conditions.layer !== undefined) {
    wrapped =
      conditions.layer === true
        ? `@layer {\n${wrapped}\n}`
        : `@layer ${conditions.layer} {\n${wrapped}\n}`;
  }
  return wrapped;
}

/**
 * Resolve one theme-source path: relative paths against their importer, bare
 * and absolute specifiers through the app root's own resolver (so a package
 * CSS subpath resolves by the package's declared `exports`, exactly as any
 * other import of it would).
 */
function resolveThemeSource(root: string, source: string, importer?: string): string {
  if (source.startsWith('.') || isAbsolute(source)) {
    const file = importer === undefined ? resolve(root, source) : resolve(importer, source);
    if (!existsSync(file)) {
      throw buildError(
        PresetErrorCode.TAILWIND_SOURCE_UNRESOLVED,
        `[unocss] the declared style source "${source}" cannot be read (resolved: ${file}).`,
      );
    }
    return file;
  }
  try {
    return createRequire(join(root, 'package.json')).resolve(source);
  } catch {
    const file = resolve(root, source);
    if (existsSync(file)) return file;
    throw buildError(
      PresetErrorCode.TAILWIND_SOURCE_UNRESOLVED,
      `[unocss] the declared style source "${source}" cannot be resolved from the project root ` +
        `${root} (neither a package subpath nor a file). Declare a shipped package CSS file or ` +
        'an app-relative path.',
    );
  }
}

/**
 * Build the resolved configuration for one plan: the project's own config when
 * it carries one (loaded through the official loader, including its
 * `sources` for the watch list), else the framework default.
 */
async function resolveUnoConfig(
  root: string,
  plan: ResolvedStyleSelection,
  declaredConfig: string | undefined,
): Promise<{
  config: Record<string, unknown>;
  watchFiles: string[];
  /** True when the framework's own default preset set was installed. */
  defaultPreset: boolean;
}> {
  // The peer's own resolution first: a missing engine is the coded
  // UNOCSS_UNRESOLVABLE diagnostic, never the resolver's raw MODULE_NOT_FOUND.
  const unocssEntry = resolveUnocssEntry(root);
  const { loadConfig } = await loadConfigModule(unocssEntry);
  const declared =
    declaredConfig === undefined ? undefined : resolveDeclaredConfigPath(root, declaredConfig);
  const loaded = await loadConfig(root, declared);
  const watchFiles = loaded.sources
    .map((source) => (typeof source === 'string' ? source : source.filepath))
    .filter((file): file is string => typeof file === 'string' && file !== '');
  const ownPresets = Array.isArray(loaded.config.presets) && loaded.config.presets.length > 0;
  if (ownPresets) return { config: loaded.config, watchFiles, defaultPreset: false };
  const unocss = await loadUnocss(root);
  return {
    config: { ...loaded.config, presets: [unocss.presetWind4()] },
    watchFiles,
    defaultPreset: true,
  };
}

/**
 * The generator for one compile, with the framework's ONE policy decision
 * applied where that decision lives for this engine: the default preset's
 * `preflights.reset`, which is the plan's `documentReset`.
 */
async function buildGenerator(
  root: string,
  plan: ResolvedStyleSelection,
  declaredConfig: string | undefined,
): Promise<UnoCompile> {
  const { config, watchFiles, defaultPreset } = await resolveUnoConfig(root, plan, declaredConfig);
  const unocss = await loadUnocss(root);
  const resolved = defaultPreset
    ? {
        ...config,
        presets: [unocss.presetWind4({ preflights: { reset: plan.documentReset } })],
      }
    : config;
  let generator: UnoGeneratorLike;
  try {
    generator = await unocss.createGenerator(resolved);
  } catch (cause) {
    throw buildError(
      PresetErrorCode.UNOCSS_CONFIG_UNLOADABLE,
      '[unocss] the resolved UnoCSS configuration was rejected by the generator ' +
        `(${root}${declaredConfig === undefined ? '' : `, config: ${declaredConfig}`}).`,
      { cause: cause instanceof Error ? cause : undefined },
    );
  }
  const documentPrefix = (): string =>
    plan.theme
      .map((source) => `/* declared style source: ${source} */\n${readThemeSource(root, source)}`)
      .join('\n');
  return { generator, watchFiles, documentPrefix };
}

/**
 * The document sheet's emptiness guard.
 *
 * A COMPONENT sheet may legitimately be empty: the engine compiled the
 * candidate set successfully and matched nothing, which is exactly what an
 * application's own native-CSS hooks are — a class it styles itself is not a
 * utility request. Reading the candidate count as evidence that a rule must
 * exist turned that answer into a false failure, so the guard lives only where
 * the engine is expected to produce a layer unconditionally.
 *
 * The document sheet carries the resolved preset's preflight layers (theme
 * variables, `@property` declarations, and the base reset when the application
 * owns the document), so an enabled pipeline that produces nothing at all has
 * produced no theme either — that is a defect of the adapter, never silence.
 */
function assertDocumentCompiled(css: string): string {
  if (css.trim() !== '') return css;
  throw buildError(
    PresetErrorCode.UNOCSS_EMPTY_COMPILE,
    '[unocss] the document sheet compiled to no CSS. An enabled entry always carries the ' +
      'resolved preset’s preflight layers (theme variables at minimum), so an empty compile ' +
      'is a defect of the adapter, never a silently unstyled document.',
  );
}

/**
 * Create the UnoCSS adapter for one build or dev server. Constructing it
 * loads the peer and the project configuration, so the caller constructs it
 * exactly when the plan selected UnoCSS.
 */
export async function createUnocssProvider(
  root: string,
  plan: ResolvedStyleSelection,
  declaredConfig: string | undefined,
): Promise<StyleProvider> {
  const compile = await buildGenerator(root, plan, declaredConfig);
  const { generator, watchFiles, documentPrefix } = compile;

  /** Tokens from the module texts the framework walked, via UnoCSS's extractors. */
  const extractFromSources = async (
    sources: StyleSheetCompileInput['sources'],
  ): Promise<string[]> => {
    const tokens = new Set<string>();
    for (const [id, code] of sources) {
      // The provider's OWN extractor: the framework never tokenizes source.
      for (const token of await generator.applyExtractors(code, id)) tokens.add(token);
    }
    return [...tokens];
  };

  return {
    id: 'unocss',
    dialects: ['tailwind4'],
    documentDelivery: 'generated',
    componentSheetSpecifier: 'virtual:open-unocss-components',
    documentSheetModule: 'virtual:open-unocss-document',
    watchFiles,

    async compileComponents({ candidates }) {
      // A zero-match compile is an answer, not a failure: the engine compiled
      // every admitted candidate and none of them is a utility the application
      // asked the engine to produce. An empty sheet is the delivery for it.
      if (candidates.length === 0) return '';
      const { css } = await generator.generate(candidates, { preflights: false });
      return css;
    },

    async compileDocument({ candidates, sources }) {
      const extracted = await extractFromSources(sources);
      const tokens = [...new Set([...candidates, ...extracted])];
      const { css } = await generator.generate(tokens, { preflights: true });
      // The preflight layers (properties + theme, and the base reset when the
      // application owns the document) exist even with no token at all: an
      // enabled pipeline with zero matched utilities still ships the theme the
      // declared roles live in.
      const sheet = [documentPrefix(), css].filter((part) => part.trim() !== '').join('\n');
      return assertDocumentCompiled(sheet);
    },
  };
}
