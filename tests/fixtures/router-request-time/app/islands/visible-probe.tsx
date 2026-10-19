/**
 * visible-probe — client:visible island for the #606 e2e.
 *
 * The /visible-probe page puts a 5000px spacer before it, so the island module
 * may only evaluate after the reader scrolls the host into view. `data-hydrated`
 * is set from the compiled claim path, so the spec observes real hydration
 * (not just a network prefetch).
 */
import { element, OpenElement } from '@openelement/element';
import { defineIslandConfig } from '@openelement/router';

export const openElement = defineIslandConfig({ hydrate: 'visible', ssr: true, dsd: true });

@element('visible-probe', { root: 'shadow-open' })
export default class VisibleProbe extends OpenElement {
  protected onDsdHydrated(): void {
    this.setAttribute('data-hydrated', '1');
  }

  protected onCsrRendered(): void {
    this.setAttribute('data-hydrated', '1');
  }

  render() {
    return <span id='visible-probe-marker'>probe</span>;
  }
}
