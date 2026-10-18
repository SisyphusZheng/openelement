/**
 * wc-open-fast — openElement child created inside a FAST component's own open
 * shadow root, after activation (A2 of the late-host corpus).
 *
 * Same late-host shape as wc-open-child, carried by a different template
 * engine: the point of the corpus is that the product mechanism must not care
 * which library created the host, so the fixture must not either.
 */
import { defineIslandConfig } from '@openelement/router';
import { element, OpenElement } from '@openelement/element';

export const openElement = defineIslandConfig({ hydrate: 'load', ssr: false, dsd: false });

@element('wc-open-fast', { root: 'shadow-open' })
export default class WcOpenFast extends OpenElement {
  render() {
    return <span id='open-fast-ready'>openElement child inside FAST</span>;
  }
}
