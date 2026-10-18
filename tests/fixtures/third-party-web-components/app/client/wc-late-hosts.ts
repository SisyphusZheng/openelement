/**
 * wc-late-hosts — the late-host corpus (A2/A4/B/C of the third-party
 * interop contract).
 *
 * Every host here is created by a module the fixture loads DYNAMICALLY after
 * its own island activated, which is exactly the shape the product had no
 * mechanism for: a foreign component attaches its shadow root (or appends to
 * the light DOM) after the scheduler's one ready-time read, and on a page with
 * no enhanced forms and no `client:visible` island nothing would ever look
 * again.
 *
 * Deliberately library-diverse: FAST and bare-native for shadow interiors,
 * Shoelace / Material Web / Ionic for light-DOM appends, and a nested
 * mixed-library pair for depth. The point is that the product mechanism must
 * not care which library produced the host.
 */
import { FASTElement, html as fastHtml } from '@microsoft/fast-element';
import { css, html, LitElement } from 'lit';
import { defineCustomElement as defineIonButton } from '@ionic/core/components/ion-button.js';
// A3: the fixture's own Stencil component, compiled to dist-custom-elements by
// the harness before the app build (see stencil.config.ts). A missing build
// fails the app build loudly, which is the intended contract.
import { defineCustomElement as defineStencilHost } from './stencil-dist/wc-stencil-host.js';

/**
 * A2: a FAST component renders the island into its OWN open shadow root when
 * it upgrades — a different update schedule from the Lit case next door.
 */
class WcFastHost extends FASTElement {}
WcFastHost.define({
  name: 'wc-fast-host',
  template: fastHtml`<wc-open-fast></wc-open-fast>`,
});

/**
 * A4: the bare-native control. No library at all, just the platform's own
 * `attachShadow({ mode: 'open' })`.
 */
class WcNativeLateHost extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.append(document.createElement('wc-open-native'));
  }
}

/** C1 inner: a Lit host, so the nesting crosses two library boundaries. */
class WcLitNestedHost extends LitElement {
  static styles = css`
    :host {
      display: inline-block;
    }
  `;
  render() {
    return html`<wc-open-nested></wc-open-nested>`;
  }
}

/** C1 outer: a native open root whose content is that Lit host. */
class WcNestedOuter extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.append(document.createElement('wc-lit-nested-host'));
  }
}

/**
 * C2: a CLOSED root. The platform exposes no entry point into it — no
 * `Element.shadowRoot`, no enumeration API — so the product cannot find this
 * host and must not pretend otherwise (and must not monkey-patch
 * `attachShadow` to try). Pinned as a documented gap, never as a pass.
 */
class WcClosedHost extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'closed' });
    root.append(document.createElement('wc-open-closed'));
  }
}

customElements.define('wc-fast-host', WcFastHost);
customElements.define('wc-native-late-host', WcNativeLateHost);
customElements.define('wc-lit-nested-host', WcLitNestedHost);
customElements.define('wc-nested-outer', WcNestedOuter);
customElements.define('wc-closed-host', WcClosedHost);
// A3: Stencil's compiled output is registered through its own export, exactly
// as `ion-button` is — the same consumer shape, a different compiler.
defineStencilHost();

/**
 * B1–B3: append the island as a light-DOM child of a third-party component,
 * after that component upgraded. Shoelace, Material Web and Ionic expose
 * components but no way to author their shadow content, so for them the
 * honest late-host shape is an append into their own light DOM (projected
 * through a slot) — the scheduler has to find that too.
 */
export function installLateLightHosts(root: ShadowRoot | null): void {
  if (!root) return;
  const append = (selector: string, tag: string): void => {
    const host = root.querySelector(selector);
    if (!host || host.querySelector(tag)) return;
    host.appendChild(document.createElement(tag));
  };
  append('sl-button', 'wc-open-light');
  append('md-filled-button', 'wc-open-light');
  const ion = root.querySelector('ion-button');
  if (ion && !ion.querySelector('wc-open-light')) {
    // The Stencil consumer path registers explicitly; mirror the fixture's
    // existing guarded define so this works whether or not the bare import's
    // side effect survived the bundler.
    if (!customElements.get('ion-button')) defineIonButton();
    ion.appendChild(document.createElement('wc-open-light'));
  }
}
