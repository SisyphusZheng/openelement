---
title: 'Islands and SSR'
lede: 'SSR and DSD provide the document baseline. Islands add client behavior at declared boundaries.'
order: 90
---

## Server first

Every route renders to HTML at build time by default. The output is ordinary declarative markup: content components are serialized as shadow roots the browser parses without script, style sheets are inlined (scoped with `@scope(<tag>)` for light roots), and the document is styled and readable before a single client module is fetched. A page whose markup is static therefore stays static even if the network is slow, the module fails to load or JavaScript is disabled.

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

An island's root is decided by its component: `@element(tag, { root: 'light' })` compiles a program whose children live in the document tree, while the default shadow mode serializes Declarative Shadow DOM. The island config may restate the family the module belongs to:

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
