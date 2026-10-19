import { Component, Element, h } from '@stencil/core';

/**
 * A3: a Stencil-compiled host for the late-host corpus.
 *
 * Stencil attaches the shadow root from its compiled output, so the host lands
 * on a third schedule — neither Lit's microtask update nor FAST's controller
 * tick. The child is created imperatively once the compiled shadow root
 * exists, which is exactly the shape under qualification: an island host that
 * appears inside an open shadow root long after the page's one ready-time
 * read.
 *
 * `@ionic/core` already pins `@stencil/core` at this same version, so this
 * authoring path costs the fixture no extra bytes.
 */
@Component({
  tag: 'wc-stencil-host',
  shadow: true,
})
export class WcStencilHost {
  @Element() el!: HTMLElement;

  componentDidLoad(): void {
    const root = this.el.shadowRoot;
    if (!root || root.querySelector('wc-open-stencil')) return;
    root.appendChild(document.createElement('wc-open-stencil'));
  }

  render() {
    return <slot />;
  }
}
