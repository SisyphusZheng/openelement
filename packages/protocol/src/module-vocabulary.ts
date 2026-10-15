/**
 * module-vocabulary.ts — the single definition of the router's module-scan
 * vocabulary for the element semantic core.
 *
 * The semantic core knows no router: its module scan recognizes a
 * page-definition or element-registration factory only when the host injects
 * the binding identity ({moduleSpecifier, exportName, kind}). Router is that
 * host — this module is the one place the router's factory bindings are
 * written, and every router call site that scans module sources injects it,
 * so the scan and the authored route grammar cannot drift (#1473 item 3, the
 * static-sidecar admission pattern).
 */

import type { ModuleVocabularyDescriptor } from './module-descriptors.ts';

/** The module vocabulary router injects into `analyzeModuleSemantics`. */
export const ROUTER_MODULE_VOCABULARY: readonly ModuleVocabularyDescriptor[] = [
  {
    moduleSpecifier: '@openelement/router',
    exportName: 'definePage',
    kind: 'page-definition',
  },
  {
    moduleSpecifier: '@openelement/router',
    exportName: 'defineHtmlPage',
    // #1568: the template-page surface — a page whose render is a plain
    // function returning HTML. Admitted through the same vocabulary
    // mechanism as definePage (host-injected binding identity, no
    // compiled-grammar change), with its own kind so the scan marks the
    // module `templatePage` and the router build keeps the route off the
    // SSR-registration and island/client surfaces.
    kind: 'template-page-definition',
  },
  {
    moduleSpecifier: '@openelement/router/lit',
    exportName: 'defineLitPage',
    kind: 'page-definition',
  },
  {
    moduleSpecifier: '@openelement/router',
    exportName: 'defineElement',
    kind: 'element-registration',
  },
  // `defineIsland` is deliberately absent: the element package retired the
  // defineIsland() runtime and the router never exported the name (the
  // absence is pinned by the authoring surface tests), so the scan fails
  // closed on the unresolvable import instead of recognizing it.
];
