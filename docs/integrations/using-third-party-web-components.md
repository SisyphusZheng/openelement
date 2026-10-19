# Using Third-Party Web Components

The Universal WC qualification gate validates direct consumption of mature Web
Components libraries inside OpenElement apps. The pinned evidence targets are
Lit, Shoelace, Material Web, FAST Element 3.0.2, Ionic 8.8.18 as real
Stencil-compiled output, and a bare native custom element.

## Recommended Pattern

Use the component's standard tag directly in JSX:

```tsx
/** @jsxImportSource @openelement/element */

export function SettingsControls() {
  return (
    <section>
      <sl-switch on-sl-change={(event) => console.log(event)}>Enabled</sl-switch>
      <md-filled-button onClick={() => console.log('clicked')}>Save</md-filled-button>
    </section>
  );
}
```

Load the third-party library according to its SSR contract:

- SSR-safe modules can be imported from route modules when they do not touch
  `window`, `document`, `HTMLElement`, `customElements`, layout APIs, or browser
  storage at module evaluation time.
- Browser-only registration modules must be imported from client-only code or an
  island activation path.
- Route modules should render standards-compliant light DOM so SSG can preserve
  useful markup before the browser upgrades the custom element.

## SSR Behavior

openElement SSR/SSG preserves the third-party tag, attributes, children, and
slots. The browser upgrades the element after the library registers its custom
element class.

Declarative shadow DOM for third-party components is not automatic. It is only
part of the contract when the third-party library itself supports server-side
shadow rendering. Otherwise, light-DOM/client-upgrade fallback is expected.

## Late Hosts

An island activates only when the page actually carries a host for its tag, so
a page never fetches an island it does not use. That check runs at page ready
and is repeated on a bounded schedule afterwards, because a third-party
component may create the host later:

- inside its **own open shadow root**, after that component upgrades — the
  common case when a library renders an OpenElement child from its template;
- in the **light DOM** of one of its own elements, appended after upgrade —
  the shape available for libraries that expose components but no way to
  author their shadow content.

Either way the island activates once its host appears, and the activation is
idempotent: one `open:ready` entry per tag, exactly one module fetch. A page
that never hosts the tag still fetches nothing.

**Closed shadow roots are not supported.** `element.attachShadow({ mode:
'closed' })` leaves `element.shadowRoot` null, and the platform exposes no API
that enumerates a closed root, so a host inside one cannot be found.
OpenElement does not patch `attachShadow` to work around that. The result is a
documented gap rather than a silent failure: that island's chunk is not
fetched, the rest of the page is unaffected, and the document receives one
`open:island-host-timeout` event whose `detail.pending` names the tags the
runtime could not reach.

```ts
document.addEventListener('open:island-host-timeout', (event) => {
  console.warn('islands without a reachable host', event.detail.pending);
});
```

That event is informational, and it fires at most once per page. An
application may legitimately declare islands a page never hosts, so treat
`detail.pending` as a hint to cross-check the page's island manifest, never as
an error by itself.

## SSR-Safe Imports

Use this pattern when a library is safe to evaluate on the Node build host
during SSG:

```tsx
/** @jsxImportSource @openelement/element */
import '@safe-wc/library/register.js';

export default function AccountCard() {
  return (
    <safe-account-card variant='compact'>
      <span slot='title'>Ada Lovelace</span>
    </safe-account-card>
  );
}
```

The route may import the registration module directly only if the package's
entry point avoids browser-only globals during module evaluation. If that is not
true, keep the tag markup in the route and move registration to the client.

## Client-Only Imports

Use this pattern for packages that require browser globals while importing:

```tsx
/** @jsxImportSource @openelement/element */

export default function SettingsRoute() {
  return (
    <section>
      <browser-only-picker value='system'>
        Theme
      </browser-only-picker>
      <script type='module' src='/client/register-browser-only-picker.js' />
    </section>
  );
}
```

```ts
// /client/register-browser-only-picker.js
if (typeof window !== 'undefined' && !customElements.get('browser-only-picker')) {
  await import('browser-only-picker/register.js');
}
```

For reusable app code, prefer a small island or client entry module over inline
scripts. The important boundary is the same: SSG renders the tag and light DOM;
the browser imports the registration module after page load.

## Properties And Events

- Primitive configuration should use attributes where the third-party component
  supports them.
- Boolean attributes serialize as standard boolean attributes.
- Complex object/array properties should use a `ref`, a small local wrapper, or
  the library's own setup API.
- Common DOM events use JSX-style names such as `onClick`.
- Dashed CustomEvent names use dashed props, such as `on-sl-change` for
  Shoelace's `sl-change`.

## Library Evidence

The qualification fixture verifies:

- Lit custom elements upgrade in an openElement page, render slots, and dispatch
  composed custom events.
- Shoelace components install, render, upgrade, and dispatch `sl-*` events.
- Material Web Components install, render, and upgrade inside the same app.
- openElement can contain a Lit element, and a Lit element can contain an
  openElement custom element.
- Browser-only custom element registration can be kept out of the SSG path.
- A FAST element preserves authored slot content, upgrades with its own shadow
  root, round-trips state, and emits a composed custom event.
- A real Stencil `dist-custom-elements` consumer (`ion-button`) requires an
  explicit `defineCustomElement()` registration, then upgrades, preserves light
  DOM, reflects a property, and participates in OpenElement event handling.
- Six late-host creators each activate an OpenElement island whose host had no
  place in the page at ready time: Lit, FAST, a real Stencil
  `dist-custom-elements` host built from this fixture's own source, and a bare
  native element, each creating the island inside its own **open shadow root**
  (one of them through a nested pair of shadow roots), plus a light-DOM append
  into Shoelace, Material Web and Ionic hosts.
- A host created inside a **closed** shadow root stays unreachable, without a
  page error and without affecting any other island on the page, and is named
  by the `open:island-host-timeout` event.
- An island the page never hosts is registered nowhere and its chunk is
  requested zero times, while other island chunks on the same page are
  requested — the control that keeps the zero honest.

The current evidence is deliberately client-only for every foreign tag. That is
a supported interoperability path, not a claim that OpenElement server-renders
another library's shadow tree.

| Package kind                        | Metadata observed                   | SSR form               | Browser evidence                                       |
| ----------------------------------- | ----------------------------------- | ---------------------- | ------------------------------------------------------ |
| OpenElement control                 | `openElement` island config         | DSD + client           | registered, upgraded, hydration-safe                   |
| Shoelace                            | Custom Elements Manifest            | light DOM, client-only | slots, properties, events, shadow upgrade, late light-DOM host |
| Ionic / Stencil                     | Stencil collection manifest         | light DOM, client-only | explicit registration, property, event, shadow upgrade, late light-DOM host |
| Lit, Material, FAST fixture, native | no package CEM used by this fixture | light DOM, client-only | per-tag probes recorded in the corpus, plus late open-shadow-root hosts |
| Stencil (fixture-authored host)     | Stencil collection manifest         | light DOM, client-only | compiled by this fixture, late open-shadow-root host   |

`null` in a corpus browser capability means the capability was not applicable
or not exercised for that tag. It is never converted to a passing `true`.

Run the fixture with:

```sh
pnpm --dir tests/fixtures/third-party-web-components run smoke
```

The fixture source lives under `fixtures/third-party-web-components/` and is copied
into a fresh generated OpenElement app during the smoke run.
The same run prints the deterministic capability matrix to standard output so
CI can retain it as ordinary job output without committing generated evidence.
