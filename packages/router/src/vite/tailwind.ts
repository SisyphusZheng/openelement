/**
 * @openelement/router/vite - the Tailwind CSS entry (alpha15 S lane).
 *
 * OpenElement is not a Tailwind implementation. The official
 * `@tailwindcss/vite` plugin owns candidate detection, `@theme` compilation,
 * utility generation and CSS optimization; Vite's own CSS pipeline owns
 * emission (the content-hashed `.css` asset and every `url()` asset the
 * sources reference, base-rewritten, deduplicated and manifested). What the
 * router owns is the framework-facing half of the contract, and nothing more:
 *
 * 1. The app declares its style sources (`tailwind: { theme: [...] }` in
 *    `openelement.config.ts`; package CSS specifiers or app-relative paths).
 * 2. {@linkcode renderTailwindEntry} renders ONE standard CSS entry from
 *    them — `@import 'tailwindcss'` plus one `@import` per source — served as
 *    a virtual module whose id is a real path inside the project root
 *    ({@linkcode tailwindEntryPath}). The path is the module's identity: the
 *    peer derives its `@import`/`url()` resolution base from the id's
 *    directory exactly as it would for a file on disk, while the candidate
 *    scan base stays the project root, so app classes are detected without a
 *    framework-owned scanner.
 * 3. The official plugin runs inside the framework's own build graphs. The
 *    Phase 2 client build mounts the peer directly
 *    ({@linkcode tailwindPlugins}) and is the sole emitter of the document
 *    stylesheet; the dev server mounts it through
 *    {@linkcode devTailwindPlugin}'s hook proxy, because Vite 8 flattens user
 *    plugins before the `config` hook runs and a plugin list cannot be
 *    extended from this side.
 * 4. The router links the emitted stylesheet in every document head — the
 *    Phase 3 SSG output, the request-time server artifact and the dev render
 *    alike — through the framework's one structured stylesheet channel.
 *
 * Retired with this module's introduction (the pre-S preset): the inner Vite
 * build, the staging directory, the compiled-bundle asset copy and `url()`
 * rewrite, the `@layer components` text extraction, the regex `@scope` face,
 * DSD link injection, the full-inline prohibition and the HTML
 * post-processing pass. Every one of those responsibilities is already owned
 * by the official pipeline or by the existing stylesheet channel, and none is
 * re-created here.
 *
 * OFF stays OFF: with no `tailwind` key nothing resolves, no peer is loaded,
 * no module is generated, and the head artifact is byte-identical to a
 * preset-less render.
 */

import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'pathe';
import type { Plugin } from 'vite';
import { PresetErrorCode, buildError } from '../internal/error-codes.ts';
import type { TailwindOptions } from '../config.ts';

/**
 * The project-relative path of the virtual entry module. A real-looking path
 * inside the project root is load-bearing: the peer resolves every `@import`
 * and every relative `url()` against the id's directory.
 */
export const TAILWIND_ENTRY_PATH = '.openElement/tailwind.css' as const;

/** The resolved preset options: the declared style sources, in order. */
export interface ResolvedTailwindOptions {
  /**
   * The sources the entry `@import`s after Tailwind itself: package CSS
   * specifiers (`@openelement/ui/theme.css`) or app-relative paths. Their
   * `@theme` blocks, `@import`s and `url()` references compile through the
   * official plugin like any other Tailwind CSS source.
   */
  readonly theme: readonly string[];
}

/** Normalize `tailwind: true` / object / undefined into resolved options. */
export function resolveTailwindOptions(
  option: boolean | TailwindOptions | undefined,
): ResolvedTailwindOptions | undefined {
  if (!option) return undefined;
  if (option === true) return { theme: [] };
  return { theme: option.theme ?? [] };
}

/** The absolute path of the virtual entry module (its module identity). */
export function tailwindEntryPath(root: string): string {
  return join(root, TAILWIND_ENTRY_PATH);
}

/** The entry's public URL — what the dev document head links. */
export function tailwindEntryUrl(base: string): string {
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  return `${cleanBase}${TAILWIND_ENTRY_PATH}`;
}

/**
 * The virtual entry's module id for one request/build id in either spelling
 * (the absolute module path, or the root-relative URL a document `<link>` and
 * a browser refresh ask the dev server for). The `?query`/`#hash` suffix
 * rides along verbatim so Vite's cache-busting stamps stay exactly as Vite
 * serves them. `undefined` for every id that is not this entry.
 */
export function tailwindEntryModuleId(root: string, id: string): string | undefined {
  const file = tailwindEntryPath(root);
  const suffixAt = id.search(/[?#]/);
  const bare = suffixAt === -1 ? id : id.slice(0, suffixAt);
  const suffix = suffixAt === -1 ? '' : id.slice(suffixAt);
  if (bare === file) return file + suffix;
  // Root-relative URL form ('/' + TAILWIND_ENTRY_PATH; Vite normalizes
  // request ids to POSIX separators before the plugin pipeline).
  if (bare.startsWith('/') && join(root, bare.slice(1)) === file) return file + suffix;
  return undefined;
}

/**
 * Whether one declared style source is a package specifier rather than an
 * app-relative path.
 *
 * A scoped or subpath-import specifier (`@openelement/ui/theme.css`,
 * `#site-ui/tokens.css`) can only be a package reference, and a `./`/`../`/
 * `/` spelling can only be a path. The remaining ambiguity is a bare word
 * path: `app/styles/theme.css` (the documented app-relative form) and
 * `tailwindcss/theme.css` (the Tailwind theme source a consumer may import)
 * are lexically identical. It is resolved by the filesystem: a source that
 * exists under the app root IS the app file; anything else passes through to
 * the compiler as a specifier, which then fails closed with its own
 * unresolved-import diagnostic if the name is wrong.
 */
export function isPackageStyleSource(root: string, source: string): boolean {
  if (source.startsWith('@') || source.startsWith('#')) return true;
  if (source.startsWith('.') || source.startsWith('/') || isAbsolute(source)) return false;
  return !existsSync(resolve(root, source));
}

/**
 * Resolve one declared source to the specifier the entry's `@import` must
 * carry. Package specifiers pass through untouched. App-relative paths resolve
 * against the app root — the stated contract of `TailwindOptions.theme`
 * ("app-relative paths") — and become the relative path from the entry's own
 * directory, which is the only base its `@import` resolves from. Absolute
 * paths are rewritten relative on that same base.
 */
export function resolveTailwindSource(root: string, source: string): string {
  if (isPackageStyleSource(root, source)) return source;
  const absolute = isAbsolute(source) ? source : resolve(root, source);
  // pathe normalizes to `/` separators, so the emitted @import is portable.
  return relative(join(root, '.openElement'), absolute);
}

/**
 * The entry's CSS text: Tailwind itself, then the app's declared sources in
 * declaration order, as ordinary `@import`s. The one policy the generated
 * entry carries is its first line: a declared source is a Tailwind source
 * (its `@theme` blocks compile against the theme Tailwind installs).
 */
export function renderTailwindEntry(root: string, options: ResolvedTailwindOptions): string {
  const lines = [
    '/* generated by @openelement/router — the Tailwind CSS entry; do not edit */',
    "@import 'tailwindcss';",
  ];
  for (const source of options.theme) {
    lines.push(`@import '${resolveTailwindSource(root, source)}';`);
  }
  return lines.join('\n') + '\n';
}

/**
 * The Vite plugins of the official Tailwind integration, resolved lazily so
 * the router stays installable without it (optional peer). Fails closed with
 * a coded error when the peer is missing — a Tailwind-enabled build never
 * silently skips Tailwind.
 */
export async function tailwindPlugins(): Promise<Plugin[]> {
  let tailwindModule: { default: (options?: unknown) => Plugin[] };
  try {
    tailwindModule = (await import('@tailwindcss/vite')) as typeof tailwindModule;
  } catch (cause) {
    throw buildError(
      PresetErrorCode.TAILWIND_UNRESOLVABLE,
      '[tailwind] the tailwind option is enabled but @tailwindcss/vite is not resolvable. ' +
        'Install it alongside tailwindcss (4.3.x line; the v3-lts line is forbidden): ' +
        '`@tailwindcss/vite` is an optional peer of @openelement/router.',
      { cause: cause instanceof Error ? cause : undefined },
    );
  }
  return tailwindModule.default();
}

/**
 * The virtual entry module — the build half of the entry contract. The client
 * build's generated entry imports {@linkcode tailwindEntryPath}; this plugin
 * answers that id with the generated CSS, and the official peer (mounted
 * beside it) compiles it.
 */
export function tailwindEntryPlugin(root: string, options: ResolvedTailwindOptions): Plugin {
  return {
    name: 'open:tailwind-entry',
    enforce: 'pre',
    resolveId(id) {
      return tailwindEntryModuleId(root, id);
    },
    load(id) {
      if (tailwindEntryModuleId(root, id) !== id) return null;
      return renderTailwindEntry(root, options);
    },
  };
}
