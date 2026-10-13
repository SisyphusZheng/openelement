/**
 * Route/island/manifest discovery and the shared entry descriptor of the
 * open build plugin (issue #1473 extraction).
 *
 * `buildStart` owns the one-shot scan pass that populates ctx.phase1; the
 * rescan entry points serve the dev watcher (plugin-watch.ts).
 */

import process from 'node:process';
import type { Plugin } from 'vite';
import type { OpenElementPackageManifest, RouteEntry } from './framework.ts';
import type { IslandDecl } from '@openelement/protocol/ssg';
import { createLogger, formatError, OpenElementError } from '@openelement/element';
import { join } from 'pathe';
import { DEFAULT_ISLANDS_DIR, DEFAULT_ROUTES_DIR } from './internal/paths.ts';
import {
  buildEntryDescriptor,
  detectAndClassifyCemPackages,
  fileToTagName,
  renderEntry,
  scanForeignTags,
  scanIslandMeta,
  scanIslands,
  scanPackageManifests,
  scanRoutes,
  scanStaticComponents,
} from './internal/ssg/index.ts';
import type { EntryDescriptor } from './internal/ssg/index.ts';
import { buildPackageIslandDecls } from './internal/ssg/island-scanner.ts';
import { resolveIslandDeliveryTags } from './internal/ssg/delivery.ts';
import type { OpenPluginState } from './plugin-config.ts';
import type { ModuleWalkResolver } from './internal/module-graph-walk.ts';
import { collectShadowClassCandidates } from './internal/collect-shadow-candidates.ts';

const log = createLogger('router-vite');

function buildDescriptor(
  state: OpenPluginState,
  routes: RouteEntry[],
  islandTagNames: string[] = [],
  packageManifests: OpenElementPackageManifest[] = [],
  islandFiles: string[] = [],
): EntryDescriptor {
  return buildEntryDescriptor(routes, {
    routesDir: state.resolvedOptions.routesDir,
    islandsDir: state.resolvedOptions.islandsDir,
    middleware: state.resolvedOptions.middleware,
    renderer: state.resolvedOptions.renderer,
    islandTagNames,
    islandFiles,
    islandMeta: state.ctx.phase1.islandMeta,
    staticComponents: state.ctx.phase1.staticComponents,
    packageManifests,
    cemClassifications: state.ctx.phase1.cemClassifications,
    foreignTags: state.ctx.phase1.foreignTags,
    headExtras: state.headExtrasValue,
    allowHeadExtrasScripts: state.allowHeadExtrasValue,
    html: state.resolvedOptions.html,
    upgradeStrategy: state.resolvedOptions.island?.upgradeStrategy || 'idle',
    layout: state.resolvedOptions.layout,
    layouts: state.resolvedOptions.layouts,
    // #1411: the default-CORS production advisory belongs to a production
    // build. Repeating it on every dev first run trained users to ignore it,
    // so the dev server (command 'serve') generates the same entry without
    // the warning; `cli/build` keeps it.
    warnOnDefaultCors: state.produceMode !== 'serve',
    // Same source as the SSG descriptor: the dev/SSR entry must resolve
    // locales identically or dev and build disagree about `/zh/...` paths.
    i18n: state.ctx.plugins.i18nOptions ?? undefined,
  });
}

export function generateEntry(
  state: OpenPluginState,
  routes: RouteEntry[],
  islandTagNames: string[] = [],
  packageManifests: OpenElementPackageManifest[] = [],
  islandFiles: string[] = [],
): string {
  state.entryDescriptor = buildDescriptor(
    state,
    routes,
    islandTagNames,
    packageManifests,
    islandFiles,
  );
  return renderEntry(state.entryDescriptor);
}

/** Scan routes + static components into ctx; returns the route entries. */
async function scanRoutesAndStaticComponents(state: OpenPluginState): Promise<RouteEntry[]> {
  const routes = await scanRoutes(state.resolvedOptions.routesDir!, '', {
    root: state.viteRoot ?? process.cwd(),
    workspaceRoot: state.workspaceRoot,
  });
  const resolve = state.resolveModule;
  if (resolve === undefined) {
    // The scan's reachability is the BUNDLER's: without its resolver a component
    // reached through an alias or a `package.json` imports subpath would be
    // invisible here — the silent DSD loss defect B fixed. Fail closed instead
    // of falling back to a narrower walk of our own.
    throw new Error(
      '[openElement] static component discovery requires the build resolver ' +
        '(buildStart captures it); refusing to scan with relative imports only',
    );
  }
  state.ctx.phase1.staticComponents = await scanStaticComponents({
    root: process.cwd(),
    routesDir: state.resolvedOptions.routesDir!,
    islandsDir: state.resolvedOptions.islandsDir || DEFAULT_ISLANDS_DIR,
    routes,
    resolve,
  });
  return routes;
}

/**
 * Scan the admitted packages' manifests into ctx.
 *
 * The ONE owner of "which packages are admitted, and what do their manifests
 * declare": the build/dev `buildStart` calls it, and so does the dev server
 * phase (`configureServer`), which Vite runs BEFORE `buildStart` — the Tailwind
 * dev channels must answer a declared compilation requirement in
 * their own `configureServer`, and the manifest scan is the only thing that
 * makes that requirement visible. Both callers run the same function over the
 * same package list, so running it twice is idempotent, not a second scanner.
 */
export async function scanPackageIslandsInto(state: OpenPluginState): Promise<void> {
  const packageNames = state.resolvedOptions.packageIslands;
  if (!packageNames || packageNames.length === 0) return;
  state.ctx.phase1.packageManifests = await scanPackageManifests([...packageNames]);
  const manifests = state.ctx.phase1.packageManifests;
  if (manifests.length === 0) return;
  // Extract island declarations from manifests.
  state.ctx.phase1.packageIslandDecls = buildPackageIslandDecls(
    manifests,
    state.resolvedOptions.island?.upgradeStrategy,
  );
  log.info(
    `Package islands: ${state.ctx.phase1.packageIslandDecls.map((i) => i.tagName).join(', ')}`,
  );
}

/** Rescan the islands dir into ctx; returns the islands root for later reuse. */
async function scanIslandsIntoCtx(state: OpenPluginState): Promise<string> {
  const islandsRoot = join(process.cwd(), state.resolvedOptions.islandsDir || DEFAULT_ISLANDS_DIR);
  const islandFiles = await scanIslands(islandsRoot);
  state.ctx.phase1.islandTagNames = islandFiles.map((f) => fileToTagName(f));
  state.ctx.phase1.islandFiles = islandFiles;
  state.ctx.phase1.islandMeta = await scanIslandMeta(islandsRoot, islandFiles);
  return islandsRoot;
}

/** Regenerate the entry descriptor from ctx and sync its SSR admission plan. */
function syncEntryDescriptor(state: OpenPluginState, routes: RouteEntry[]): void {
  generateEntry(
    state,
    routes,
    state.ctx.phase1.islandTagNames,
    state.ctx.phase1.packageManifests,
    state.ctx.phase1.islandFiles,
  );
  if (state.entryDescriptor) {
    state.ctx.phase1.ssrAdmissionPlan = state.entryDescriptor.ssrAdmissionPlan;
  }
}

/**
 * #1028: dev-only route rescan. buildStart() scans the routes dir once, so a
 * route file added/removed while the dev server runs never reached the
 * cached entryDescriptor and 404'd until restart. Re-scan, rebuild the
 * descriptor (virtualEntryPlugin.load() renders from it), and invalidate the
 * virtual entry module so the dev server re-evaluates it on the next pass.
 */
export async function rescanRoutes(state: OpenPluginState): Promise<void> {
  const routes = await scanRoutesAndStaticComponents(state);
  state.ctx.phase1.cachedRoutes = routes;
  syncEntryDescriptor(state, routes);
}

/**
 * #1062: dev-only island rescan — same mechanism as rescanRoutes (#1028).
 * buildStart() scans the islands dir once, so an island added/removed while
 * the dev server runs never reached the cached descriptor (SSR admission
 * plan) or the dev island client map: the page rendered DSD but the island
 * never hydrated, with no hint why. Re-scan, rebuild the descriptor
 * (virtualEntryPlugin.load() and devIslandClientPlugin.load() both render
 * from ctx.phase1), and let the configureServer watcher invalidate both
 * virtual entries and full-reload, exactly as for routes.
 */
export async function rescanIslands(state: OpenPluginState): Promise<void> {
  await scanIslandsIntoCtx(state);
  syncEntryDescriptor(state, state.ctx.phase1.cachedRoutes || []);
}

/** Create the `buildStart` hook of `open:core` over the shared plugin state. */
export function createBuildStartHook(state: OpenPluginState): Pick<Plugin, 'buildStart'> {
  return {
    async buildStart() {
      state.ctx.reset();
      // This phase owns discovery, so it captures the plugin context's resolver
      // here: route/static-component reachability must be the BUNDLER's
      // (relative, `package.json` imports, alias — defect B), and a dev rescan
      // has no plugin context of its own to ask.
      state.resolveModule = {
        resolve: (specifier, importer) =>
          this.resolve(specifier, importer) as ReturnType<ModuleWalkResolver['resolve']>,
      };

      try {
        const routes = await scanRoutesAndStaticComponents(state);
        const islandsRoot = await scanIslandsIntoCtx(state);
        const islandFiles = state.ctx.phase1.islandFiles;

        if (
          state.resolvedOptions.packageIslands &&
          state.resolvedOptions.packageIslands.length > 0
        ) {
          await scanPackageIslandsInto(state);
        }

        // Cache routes for lazy load() regeneration.
        state.ctx.phase1.cachedRoutes = routes;

        // The DEV channel's class candidates must be complete before the first
        // document render: the component sheet's version (and therefore the
        // `<link>` the DSD template declares) is computed from this registry the
        // moment the style-links module loads — which happens BEFORE the app's
        // modules are transformed — so a transform-only registration would leave
        // the first paint declaring a sheet URL the client adapter disagrees
        // with, and the shadow roots would adopt nothing (defect C's ordering
        // requirement; a process-global registry used to hide this by leaking
        // the previous server's facts). The inventory is the Phase 1 scan's own
        // (bundler-resolved, defect B): the same discovery the build runs, not a
        // second scanner. Builds skip it — their client build discovers its own
        // graph and owns its own registry.
        if (state.produceMode === 'serve') {
          await collectShadowClassCandidates({
            root: process.cwd(),
            candidates: state.classCandidates,
            modules: [
              ...(state.ctx.phase1.staticComponents ?? []).map((decl) => ({
                path: decl.modulePath.replace(/^\/+/, ''),
              })),
              ...(state.ctx.phase1.islandFiles ?? []).map((file) => ({
                path: `${state.resolvedOptions.islandsDir || DEFAULT_ISLANDS_DIR}/${file}`,
              })),
              ...routes
                .filter((route) => route.type === 'page')
                .map((route) => ({ path: `${state.resolvedOptions.routesDir}/${route.filePath}` })),
              ...(state.ctx.phase1.packageIslandDecls ?? []).map((island) => ({
                path: island.modulePath,
                resolve: true,
              })),
            ],
          });
        }

        // CEM auto-detection - scan node_modules for custom-elements.json
        // without importing or executing any package code. Runs BEFORE the entry
        // descriptor is built so the emitted entry and the SSR admission plan
        // share one descriptor instantiation.
        try {
          const nodeModulesDir = join(process.cwd(), 'node_modules');
          state.ctx.phase1.cemClassifications = await detectAndClassifyCemPackages(nodeModulesDir);
          if (state.ctx.phase1.cemClassifications.length > 0) {
            log.info(
              `CEM auto-detection: classified ${state.ctx.phase1.cemClassifications.length} component(s) from node_modules`,
            );
          }
        } catch (err) {
          // CEM detection is best-effort - never fail the build
          log.debug(`CEM auto-detection failed (non-fatal): ${formatError(err)}`);
          state.ctx.phase1.cemClassifications = [];
        }

        // #979: foreign-tag discovery. Scan page route and
        // island sources for custom-element tags that are neither local
        // islands, package-manifest islands, nor openElement-authored
        // elements, so the admission plan records them explicitly
        // (client-only, visibility only) instead of never seeing them.
        try {
          const knownTags = new Set<string>(state.ctx.phase1.islandTagNames);
          for (const [tagName, meta] of Object.entries(state.ctx.phase1.islandMeta)) {
            const delivery = meta as IslandDecl & {
              tags?: readonly string[];
              tagNames?: readonly string[];
            };
            for (const deliveredTag of resolveIslandDeliveryTags(
              tagName,
              delivery.tags,
              delivery.tagNames,
              tagName,
            ))
              knownTags.add(deliveredTag);
          }
          for (const pkg of state.ctx.phase1.packageManifests) {
            for (const decl of pkg.declarations) {
              const delivery = decl as typeof decl & {
                tags?: readonly string[];
                tagNames?: readonly string[];
              };
              const openElement = decl.openElement as typeof decl.openElement & {
                tags?: readonly string[];
                tagNames?: readonly string[];
              };
              for (const deliveredTag of resolveIslandDeliveryTags(
                decl.tagName,
                delivery.tags ?? openElement?.tags,
                delivery.tagNames ?? openElement?.tagNames,
                decl.tagName,
              ))
                knownTags.add(deliveredTag);
            }
          }
          const pageRoutes = routes.filter((r) => r.type === 'page' && !r.special);
          for (const route of pageRoutes) {
            knownTags.add(fileToTagName(route.filePath));
            if (route.tagName) knownTags.add(route.tagName);
          }
          const layoutConfigs = [
            state.resolvedOptions.layout,
            ...Object.values(state.resolvedOptions.layouts ?? {}),
          ];
          for (const shell of layoutConfigs) {
            if (shell && typeof shell === 'object' && shell.tagName) {
              knownTags.add(shell.tagName);
            }
          }
          state.ctx.phase1.foreignTags = await scanForeignTags({
            routesDir: join(process.cwd(), state.resolvedOptions.routesDir || DEFAULT_ROUTES_DIR),
            islandsDir: islandsRoot,
            routeFiles: pageRoutes.map((r) => r.filePath),
            islandFiles,
            knownTags,
          });
          if (state.ctx.phase1.foreignTags.length > 0) {
            log.info(`Foreign WC tags consumed in JSX: ${state.ctx.phase1.foreignTags.join(', ')}`);
          }
        } catch (err) {
          // Foreign-tag discovery is best-effort - never fail the build
          log.debug(`Foreign-tag scan failed (non-fatal): ${formatError(err)}`);
          state.ctx.phase1.foreignTags = [];
        }

        // Single descriptor instantiation: the emitted entry code and the
        // admission plan come from the same object. The returned code string
        // is discarded — the call populates entryDescriptor, which
        // virtualEntryPlugin.load() renders from.
        syncEntryDescriptor(state, routes);
        const pageCount = routes.filter((r) => r.type === 'page' && !r.special).length;
        const apiCount = routes.filter((r) => r.type === 'api' && !r.special).length;
        const totalIslands =
          state.ctx.phase1.islandTagNames.length + state.ctx.phase1.packageIslandDecls.length;
        // A data line, not a banner: the counts are what a dev reading the
        // startup output acts on. A branding suffix here read as though the
        // site title had been concatenated onto the line, and it duplicated
        // the framework's own startup banner.
        log.info(
          `Routes: ${pageCount} page(s), ${apiCount} API route(s), ` + `${totalIslands} island(s)`,
        );
      } catch (err) {
        throw new OpenElementError(`Route scan failed: ${formatError(err)}`, {
          code: 'ROUTE_SCAN_ERROR',
          statusCode: 500,
          recoverable: false,
        });
      }
    },
  };
}
