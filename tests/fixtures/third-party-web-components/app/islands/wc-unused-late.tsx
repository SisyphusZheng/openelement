/**
 * wc-unused-late — a declared island that this page NEVER hosts (C4).
 *
 * The negative control for the late-host probe. B2's page-scope promise is
 * that an island a page never reaches is never fetched; the probe adds a
 * bounded search for hosts, so the fixture must prove the search cannot turn
 * into a fetch. The browser probe asserts this chunk's URL is requested zero
 * times on the page.
 */
import { defineIslandConfig } from '@openelement/router';
import { element, OpenElement } from '@openelement/element';

export const openElement = defineIslandConfig({ hydrate: 'load', ssr: false, dsd: false });

@element('wc-unused-late', { root: 'shadow-open' })
export default class WcUnusedLate extends OpenElement {
  render() {
    return <span id='unused-late-ready'>never hosted on this page</span>;
  }
}
