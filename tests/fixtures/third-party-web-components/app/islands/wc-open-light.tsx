/**
 * wc-open-light — openElement child appended to a third-party component's
 * LIGHT DOM after that component upgraded (B1–B3 of the late-host corpus).
 *
 * The other half of the late-host contract: Shoelace, Material Web and Ionic
 * expose components but no way to author their shadow content, so the honest
 * late-host case for them is a host appended into their light DOM (and
 * projected through a slot). The scheduler must find that too — a document
 * query does, and the fixture pins that it actually happens.
 */
import { defineIslandConfig } from '@openelement/router';
import { element, OpenElement } from '@openelement/element';

export const openElement = defineIslandConfig({ hydrate: 'load', ssr: false, dsd: false });

@element('wc-open-light', { root: 'shadow-open' })
export default class WcOpenLight extends OpenElement {
  render() {
    return <span id='open-light-ready'>openElement child appended late</span>;
  }
}
