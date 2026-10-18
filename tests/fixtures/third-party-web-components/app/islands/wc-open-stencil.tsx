/**
 * wc-open-stencil — openElement child created inside a Stencil-compiled
 * component's own open shadow root, after activation (A3 of the late-host
 * corpus).
 *
 * Stencil is the third authoring path: its components attach their shadow
 * root from compiled output, so the host lands on a different schedule than a
 * Lit or FAST update. `@ionic/core` already pins `@stencil/core` at the same
 * version this fixture builds against, so the compiler costs no extra bytes.
 */
import { defineIslandConfig } from '@openelement/router';
import { element, OpenElement } from '@openelement/element';

export const openElement = defineIslandConfig({ hydrate: 'load', ssr: false, dsd: false });

@element('wc-open-stencil', { root: 'shadow-open' })
export default class WcOpenStencil extends OpenElement {
  render() {
    return <span id='open-stencil-ready'>openElement child inside Stencil</span>;
  }
}
