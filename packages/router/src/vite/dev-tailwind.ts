/**
 * @openelement/router/vite - the Tailwind entry's dev channel (alpha15 S lane).
 *
 * Dev must deliver the COMPILED stylesheet: the authored `@theme` block is an
 * unknown at-rule to the browser, and the role aliases seated on it stay empty
 * until the entry passes through the official Tailwind compile (#1582). The
 * delivery is the same entry the client build compiles
 * ({@linkcode renderTailwindEntry}) served at the contract URL
 * `/.openElement/tailwind.css`, linked from the document head through the
 * framework's one structured stylesheet channel, so dev and build deliver one
 * compiled fact.
 *
 * The peer's hooks are proxied rather than mounted: `@tailwindcss/vite` is an
 * optional peer resolved lazily (the same loader the client build's mount
 * uses), and Vite 8 flattens user plugins before the `config` hook runs — a
 * plugin list cannot be extended from this side (verified against
 * vite 8.0.16). The peer ships one generate plugin per command; this wrapper
 * calls hooks directly, so it owes the same `apply` filter Vite would apply.
 *
 * OFF stays OFF: with no `tailwind` key the plugin resolves nothing, loads no
 * peer, serves no module and contributes no head fragment.
 *
 * HMR: the peer registers every scanned/loaded file as a watch file, so a
 * `theme.css` edit reaches the browser as a Vite `css-update` for the served
 * entry, and the client re-requests the link with a `?t=` stamp, which both
 * `.*\.css$` and `\?t\=\d+$` in the Hono dev server's exclude list let through
 * to Vite (the versioned-module trap #1582 names).
 */

import process from 'node:process';
import type { Plugin } from 'vite';
import { createLogger } from '@openelement/element';
import {
  renderTailwindEntry,
  resolveTailwindOptions,
  tailwindEntryModuleId,
  tailwindEntryUrl,
  tailwindPlugins,
  type ResolvedTailwindOptions,
} from './tailwind.ts';
import { setFrameworkStylesheets, type OpenPluginState } from './plugin-config.ts';

const log = createLogger('router-vite:tailwind-dev');

/** The peer's plugin hooks this wrapper proxies. */
type ProxiedHook = 'configResolved' | 'configureServer' | 'transform' | 'hotUpdate';

/**
 * The peer plugins that apply to the dev command. Without this filter the
 * build variant's transform would run in dev too, minifying the served sheet
 * and registering duplicate watch files.
 */
function applicablePlugins(plugins: readonly Plugin[], mode: string): Plugin[] {
  const env = { command: 'serve' as const, mode };
  return plugins.filter((plugin) => {
    if (!plugin.apply) return true;
    if (typeof plugin.apply === 'function') {
      return plugin.apply({ mode } as never, env);
    }
    return plugin.apply === 'serve';
  });
}

/**
 * Call one peer hook, preserving the peer's own plugin order: a hook that
 * returns nothing is skipped rather than treated as "no transform", so a later
 * peer plugin's result wins.
 */
async function callPeerHook(
  plugins: readonly Plugin[],
  hook: ProxiedHook,
  context: unknown,
  args: unknown[],
): Promise<unknown> {
  let result: unknown;
  for (const plugin of plugins) {
    // Typed as unknown on purpose: the hook property's declared union trips
    // code scanning when truthiness-narrowed, and only function/object/absent
    // shapes reach the checks below anyway.
    const candidate: unknown = plugin[hook];
    if (candidate === null || candidate === undefined) continue;
    const fn =
      typeof candidate === 'function'
        ? candidate
        : // Null already skipped above, so the object branch cannot be null
          // (and the null check would be a dead comparison for scanners).
          typeof candidate === 'object' && 'handler' in candidate
          ? (candidate as { handler: unknown }).handler
          : undefined;
    if (typeof fn !== 'function') continue;
    const value = await (fn as (this: unknown, ...hookArgs: unknown[]) => unknown).apply(
      context,
      args,
    );
    if (value !== undefined) result = value;
  }
  return result;
}

/**
 * The dev pipeline's half of the Tailwind entry. Always present in the plugin
 * list (the list is fixed at `openElement()` call time while the `tailwind`
 * key may live in `openelement.config.ts`, resolved later), and inert until
 * {@linkcode resolveTailwindOptions} answers with options — so a
 * Tailwind-less app pays one resolved-options read and nothing else, and the
 * optional peer is never loaded.
 */
export function devTailwindPlugin(state: OpenPluginState): Plugin {
  let peer: Plugin[] | undefined;
  let entryRoot: string | undefined;
  let entryOptions: ResolvedTailwindOptions | undefined;
  const loadPeer = async (mode: string): Promise<Plugin[]> =>
    (peer ??= applicablePlugins(await tailwindPlugins(), mode));

  return {
    name: 'open:tailwind-dev',
    apply: 'serve',
    // The peer's dev half is `enforce: 'pre'` and compiles the CSS before
    // Vite's own css plugin reads it; the wrapper takes the same seat.
    enforce: 'pre',

    async configResolved(config) {
      const options = resolveTailwindOptions(state.resolvedOptions.tailwind);
      if (!options) return;
      // Request-time delivery, decided here because only `configResolved`
      // sees the resolved options: the entry's identity is a virtual path
      // inside the project root and its text is produced on every load, so
      // the dev channel owns no file on disk.
      entryRoot = config.root ?? process.cwd();
      entryOptions = options;
      // Fail closed at dev start rather than on the first css request: a
      // Tailwind-enabled dev server that cannot compile is an error, never a
      // silently unstyled page (the #1582 symptom).
      const plugins = await loadPeer(config.mode);
      // The link rides the structured stylesheet channel, so the framework's
      // one `<link>` serializer builds it and the href passes the protocol
      // blocklist. Idempotent across Vite's config re-resolution: the setter
      // re-points the framework's own link instead of accumulating one.
      setFrameworkStylesheets(state, [tailwindEntryUrl(config.base ?? '/')]);
      await callPeerHook(plugins, 'configResolved', this, [config]);
    },

    /**
     * Resolve the contract URL — and the entry's own module path — onto the
     * virtual entry's identity. Two spellings arrive here: an absolute path
     * (import-graph contexts) and the root-relative URL a document `<link>` /
     * browser refresh asks the dev server for (leading slash; the base
     * middleware strips the prefix first). Both map onto the identity path;
     * the `?t=` stamp rides along verbatim so cache-busting stays exactly as
     * Vite serves it.
     */
    resolveId(id) {
      if (entryRoot === undefined) return;
      return tailwindEntryModuleId(entryRoot, id);
    },

    /**
     * Serve the entry from memory: the same generator the client build
     * compiles, so dev and build feed one input and a dev/prod comparison
     * diffs only the compile. Deterministic by construction — the text is a
     * pure function of the resolved options — so no cache key is needed beyond
     * Vite's own module graph (a `?t=` request resolves to a fresh module and
     * re-runs the peer's compile, whose watch registration answers source
     * edits).
     */
    load(id) {
      if (entryRoot === undefined || entryOptions === undefined) return;
      if (tailwindEntryModuleId(entryRoot, id) !== id) return;
      return renderTailwindEntry(entryRoot, entryOptions);
    },

    async configureServer(server) {
      if (!peer) return;
      // The channel verdict, stated where a dev run shows it.
      log.info(
        `tailwind entry active — the compiled stylesheet is served at ${tailwindEntryUrl(
          server.config.base ?? '/',
        )} and linked in the document head`,
      );
      await callPeerHook(peer, 'configureServer', this, [server]);
    },

    async transform(code, id) {
      if (!peer) return;
      return (await callPeerHook(peer, 'transform', this, [code, id])) as string | undefined;
    },

    async hotUpdate(context) {
      if (!peer) return;
      await callPeerHook(peer, 'hotUpdate', this, [context]);
    },
  };
}
