/**
 * wc-open-closed — openElement child created inside a CLOSED shadow root
 * (C2 of the late-host corpus). This one must NOT activate.
 *
 * A closed root is unreachable by construction: `Element.shadowRoot` is null
 * and no standard API enumerates it, so there is nothing for the scheduler to
 * find and no monkey-patch of `attachShadow` is acceptable in a framework
 * runtime. The fixture pins the honest contract: the page still works, no
 * page error is raised, every other late host on the same page still
 * activates, and this tag is reported as a documented gap — never silently
 * converted into a pass.
 */
import { defineIslandConfig } from '@openelement/router';
import { element, OpenElement } from '@openelement/element';

export const openElement = defineIslandConfig({ hydrate: 'load', ssr: false, dsd: false });

@element('wc-open-closed', { root: 'shadow-open' })
export default class WcOpenClosed extends OpenElement {
  render() {
    return <span id='open-closed-ready'>unreachable: created inside a closed root</span>;
  }
}
