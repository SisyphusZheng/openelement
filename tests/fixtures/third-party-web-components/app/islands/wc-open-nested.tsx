/**
 * wc-open-nested — openElement child created inside a NESTED open shadow root
 * (C1 of the late-host corpus).
 *
 * Two foreign shadow roots deep by the time it appears: the walk that finds a
 * late host must not stop at the first boundary, so depth, not just presence,
 * is part of the contract.
 */
import { defineIslandConfig } from '@openelement/router';
import { element, OpenElement } from '@openelement/element';

export const openElement = defineIslandConfig({ hydrate: 'load', ssr: false, dsd: false });

@element('wc-open-nested', { root: 'shadow-open' })
export default class WcOpenNested extends OpenElement {
  render() {
    return <span id='open-nested-ready'>openElement child inside nested shadow roots</span>;
  }
}
