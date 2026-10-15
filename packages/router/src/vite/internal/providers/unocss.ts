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
 * FAILURE POSTURE. A resolvable `unocss` that produces an empty sheet for a
 * non-empty candidate set is a defect of the adapter, never a silently
 * unstyled document: it fails closed. A loadable config that the generator
 * rejects surfaces the config loader's own diagnostic.
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
 * The one shape this adapter cannot honour is Tailwind's `@theme` at-rule
 * (nothing here compiles it, so the roles it declares would be silently
 * absent), and it fails closed naming both supported shapes.
 */
function readThemeSource(root: string, source: string, seen: Set<string> = new Set()): string {
  const file = resolveThemeSource(root, source);
  if (seen.has(file)) return `/* circular @import skipped: ${source} */\n`;
  seen.add(file);
  const text = readFileSync(file, 'utf8');
  if (text.includes(TAILWIND_THEME_AT_RULE)) {
    throw buildError(
      PresetErrorCode.UNOCSS_THEME_SOURCE_INCOMPATIBLE,
      `[unocss] the declared style source "${source}" carries Tailwind's ` +
        `\`${TAILWIND_THEME_AT_RULE}\` at-rule, which UnoCSS does not compile — the roles it ` +
        'declares would be silently absent from the document sheet. UnoCSS accepts (a) ' +
        'plain-CSS token files (`:root { --color-…: … }`, e.g. Open Props) as `theme` ' +
        'sources, and (b) the role table in `uno.config.ts`’s own `theme` key.',
    );
  }
  return text.replace(CSS_IMPORT_RE, (whole, _quote: string, specifier: string) => {
    // A scheme URL, a protocol-relative URL or a root-absolute URL is not this
    // device's to resolve: the browser owns it and it stays exactly as written.
    if (/^[a-z][a-z0-9+.-]*:/i.test(specifier) || specifier.startsWith('//')) return whole;
    if (specifier.startsWith('/')) return whole;
    // A local specifier that cannot be resolved fails closed here rather than
    // reaching the browser: an inlined sheet has no resolver to fall back on,
    // and a silently dropped token file is the "half-styled" failure this
    // adapter exists to prevent.
    const resolved = resolveThemeSource(root, specifier, dirname(file));
    return `/* @import '${specifier}' */\n${readThemeSource(root, resolved, seen)}`;
  });
}

/** One `@import "…"` / `@import url(…)` statement of a theme source. */
const CSS_IMPORT_RE = /@import\s+(?:url\(\s*)?(['"])([^'"]+)\1\s*\)?\s*;/g;

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

/** The empty-compile guard: enabled + admitted candidates ⇒ CSS must exist. */
function assertCompiled(css: string, sheet: 'document' | 'components', candidates: number): string {
  if (css.trim() !== '') return css;
  throw buildError(
    PresetErrorCode.UNOCSS_EMPTY_COMPILE,
    `[unocss] the ${sheet} sheet compiled to no CSS (${candidates} admitted candidate(s)). ` +
      'An enabled entry with admitted candidates must produce a sheet — an empty compile is a ' +
      'defect of the adapter, never a silently unstyled document.',
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
      if (candidates.length === 0) return '';
      const { css } = await generator.generate(candidates, { preflights: false });
      return assertCompiled(css, 'components', candidates.length);
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
      if (sheet.trim() === '') return assertCompiled('', 'document', tokens.length);
      return sheet;
    },
  };
}
