---
title: 'Islands and SSR'
lede: 'SSR and DSD provide the document baseline. Islands add client behavior at declared boundaries.'
order: 90
---

## Light DOM, DSD, SSR and islands

The terms that run through this guide are not competing defaults: they answer two different questions — **where a component's markup lives** (a root choice: light DOM or shadow DOM) and **what happens in the browser after the HTML arrives** (DSD, SSR, islands).

| Term | What it is | What it decides |
| --- | --- | --- |
| Light DOM | the component renders its children into the document tree itself | no style boundary: the page's styles reach the children directly |
| Shadow DOM | the component renders into a shadow root it owns | a style boundary: outside class selectors do not reach the component's children |
| DSD (Declarative Shadow DOM) | the platform HTML format that carries a shadow root as markup — a `<template shadowrootmode="open">` the browser parses natively | the shadow content exists before any client JavaScript loads, with no framework involved |
| SSR | rendering a page to HTML on the server: at build time for static routes, per request for `renderIntent: { mode: 'dynamic' }` routes | what the first response contains |
| Islands | a per-module opt-in for client delivery, declared next to the component | whether and when a component's chunk is fetched and its behavior binds |

**Root: light or shadow.** `@element(tag, { root })` chooses where the component's content renders. Light DOM is the current compiled default; `root: 'shadow-open'` and `'shadow-closed'` are explicitly declared modes, and a component that declares one is served as Declarative Shadow DOM. That is one compiler and one Part Program either way: the choice changes styling reach, not the rendering machinery — and neither mode is "the interactive one".

**DSD is a browser format, not a client framework.** Declarative Shadow DOM is a platform HTML format: `<template shadowrootmode="open">` is parsed into a real shadow root by the HTML parser, without script. openElement uses it as the wire format for shadow-root components, which is why their markup is readable and styled before any client module is fetched. DSD says nothing about interactivity: a DSD component can be completely static.

**Server HTML, then browser upgrade.** The server serializes the compiled class to HTML — build time for static routes, per request for dynamic ones, one program either way. Light DOM is already the document; DSD is parsed into a shadow root. Then, when the generated client entry defines the class, the browser's own Custom Element upgrade runs: the compiled claim replays the same program against the DOM that is already there, binds the handlers the template declared, and fills `@property` fields from host attributes. No tree is rebuilt, no binding is looked up by string, and no event is synthesized from a `data-*` attribute. Because upgrade only binds behavior the template declared, an element whose class never loads keeps its markup and its styling.

**Islands are WHERE and WHEN, not a rendering mode.** An island is a module that opts into client delivery with `defineIslandConfig({ hydrate, ssr, dsd })`; `hydrate` selects when the browser imports it — `load`, `idle`, `visible`, `media` or `only` — and the build records which islands each page reaches, so a page fetches only the chunks its own manifest names. An island renders through the same compiled class as a static component and can be a light root or a DSD shadow root; `ssr` and `dsd` say whether the server serializes it at all, and `only` skips SSR. What the island adds is the part that needs the browser: state, handlers, lifecycle.

The whole path, one stage per line:

```text
1  request
   │
   ▼
2  server render — at build time for a static
   route, per request for a dynamic one
   │  emits
   ▼
3  HTML — light DOM, or DSD for a declared
   shadow root
   │
   ▼
4  browser parse — DSD becomes a real shadow
   root with no script
   │
   ▼
5  Custom Element upgrade — only for elements
   whose class ships: the claim replays the
   compiled program against the existing DOM
   │
   ▼
6  interaction — the island chunk loads per
   its declared strategy, then state and
   handlers run
```

Steps 1–4 reuse what the server produced: no client work, and the HTML is already the page. Step 5 needs a client module only for the components whose class is delivered — and it reuses the existing DOM rather than rebuilding it, which is why one compiled program can serve the static artifact, a request-time render and the browser. Step 6 is the only island-specific step: it runs where a module declared a `hydrate` strategy, and a page with no interactive island executes no island chunk of its own.

The honest caveats: "no client work" means none needed to render or read the page, not that zero bytes are ever executed — while an app declares any island or enhanced form, one small app-wide claim bootstrap still runs on static pages, and a page whose manifest carries a client-activatable island also preloads the shared element-runtime chunk ([Small runtime](#small-runtime) below prices both). And "no rebuild" describes the upgrade path, not a promise that nothing ever updates: after upgrade, a signal change re-renders only the compiled Parts that read the changed value.

## Server first

Every route renders to HTML at build time by default. The output is ordinary declarative markup: content components are serialized as light DOM by default, or as shadow roots the browser parses without script when the component declares a shadow mode; style sheets are inlined (scoped with `@scope(<tag>)` for light roots), and the document is styled and readable before a single client module is fetched. A page whose markup is static therefore stays static even if the network is slow, the module fails to load or JavaScript is disabled.

Page-scope components — compiled modules that live outside the islands directory and are composed into pages by tag — are server-rendered only, and that is the contract, not a degradation. None of their code ships to the client: the browser receives their serialized shadow roots and never upgrades them, so they have no lifecycle, handlers or context at runtime. Anything that must react in the browser takes the island form and pays for exactly that boundary. The [compiled module grammar](/guide/compiled-grammar) covers how each form is discovered — page-scope components through the route import chain as default exports, islands through the page/island template scan with no import needed.

A page that genuinely cannot be prerendered declares `renderIntent: { mode: 'dynamic' }` and renders per request through the generated `dist/server` entry. It is still the same compiled program — a loader supplies the data instead of the build — so moving a page between static and dynamic changes where it renders, not how the markup is produced. A page that keeps a static GET but exports an action stays prerendered and dispatches only its POSTs to the server.

## Declared islands

Client behavior is opt-in per module and visible in metadata, never inferred. An island declares its delivery next to the component it exports:

```tsx
import { defineIslandConfig } from '@openelement/router';

export const openElement = defineIslandConfig({ hydrate: 'visible', ssr: true, dsd: true });
```

`hydrate` selects when the module is imported — `'load'` for first-screen controls, imported and upgraded as early as possible, `'idle'` for work that can wait, `'visible'` for components that matter as they approach the viewport, `'media'` for capability-gated loading (the chunk loads only while the query declared in the island's `media` field matches), and `'only'` for browser-only components that skip SSR. `'none'` retires an island's client side entirely: the server still serializes the component, but the build never emits its chunk, so the component costs zero client JavaScript while keeping its island manifest entry. `ssr` and `dsd` state whether the server serializes the component at all. The build records the result per page, so an island that a page never reaches is never executed. These two settings do not apply on a [streaming](/guide/streaming) route: its shell admits no nested renderer, so every island and nested compiled component is emitted there as an opaque empty host and activates in the browser.

The upgrade itself is the browser's Custom Element mechanism. The server serializes the compiled Part Program as Declarative Shadow DOM; when the class is defined the generated claim artifact runs the same program against the DOM that is already there, binding the handlers the template declared and restoring `@property` fields from host attributes. No tree is rebuilt, no binding is discovered by string lookup, and no event is synthesized from an attribute. A [streaming](/guide/streaming) route is the exception to that serialization promise — see above.

## Late hosts

A declared island's host does not have to exist when the page's ready scan runs. A third-party component, another island's render, or application code after an async fetch may create it later — inside an open shadow root or in the light DOM. While this page still has a declared island whose factory nobody has consumed, the scheduler re-runs the same page-scope scan on a bounded schedule: at most six attempts per 3000 ms window, at most three windows renewed only by island-module load activity, and a 9000 ms absolute cap checked at every probe entry and every continuation window. A suspended or throttled page therefore cannot activate a host past the cap. A host found inside the budget activates through its declared strategy and fires the same `open:ready` event; the scheduler only re-asks for the host, so `load()`'s host gate — and with it "an island a page never reaches is never fetched" — stays the only activation decision.

Both strategies that otherwise get a single chance are covered. After an `'idle'` page's idle attempt runs without a host, the deferred step arms the same bounded search (the load itself still goes through the browser's idle scheduling); a `'media'` page whose query turns matching while the host is still missing arms it from the query's change listener. If the budget expires with declared islands still unactivated, the scheduler dispatches one informational `CustomEvent('open:island-host-timeout')` on `document` whose `detail.pending` names the tags. That event is a hint, not an error — declaring an island a page never hosts is legitimate — and a later explicit rescan or media change can still activate those tags.

## Light islands

An island's root is decided by its component: `@element(tag, { root: 'light' })` compiles a program whose children live in the document tree, while a component that declares a shadow root (`shadow-open` or `shadow-closed`) is served as Declarative Shadow DOM. The island config may restate the family the module belongs to:

```tsx
export const openElement = defineIslandConfig({ hydrate: 'visible', root: 'light' });
```

That declaration is checked, not obeyed. The decorator stays the single source of truth, and a config that contradicts it fails the build with `OEC9030`; declaring it just makes the island's root readable next to its delivery policy, without opening the component.

Light islands are the practical route for utility-first styling. A shadow root is a style boundary — class selectors authored outside it do not reach the component's children — so a shadow island needs compiler-side utility extraction to bridge it, while a light island's children are ordinary document nodes that the page's compiled sheet already styles. What it gives up in exchange is the isolation the shadow root would have provided.

## Small runtime

What ships is the set of island chunks a page declares plus the generated claim code — there is no framework runtime that every page must load. A page with no interactive module executes none of its island chunks; while the app has any island (or enhanced form), a small app-wide claim bootstrap — about 2 KB gzipped — is the one script such a page executes. Fetched and executed are different costs: a link target's chunks can be prefetched before the reader follows the link, and any page whose manifest has a client-activatable island `modulepreload`s the shared element-runtime chunk (about 29 KB gzipped in the www build) even when every island on it is `'visible'` — the runtime is fetched and parsed up front, while the island's own chunk stays deferred until its host activates.

That budget is the reason the static surface matters. Anything that can be expressed as markup — content, layout, documentation, even fully styled interactive-looking components — should stay static DSD; islands are reserved for state and browser APIs. Component code is identical in both cases, so the decision is a one-line declaration rather than a rewrite, and it can be revisited when the component's real requirements become clear.

## See also

- [Island Hydration](/architecture/islands) — the four component layers, how claim works, and the same boundary in the component model.
- [DSD Rendering](/architecture/dsd) — the platform contract behind the server output.
