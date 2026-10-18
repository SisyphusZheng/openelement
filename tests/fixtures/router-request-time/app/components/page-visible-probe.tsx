/**
 * /visible-probe page element — the #606 visible-island geometry.
 *
 * The tall spacer keeps the client:visible island below the fold, so the island
 * module can only evaluate once the host scrolls into view. The page root is
 * shadow-open, so the island host lives inside the page's DSD shadow root —
 * the deep-query case a light-DOM scan never finds.
 */
import { element, OpenElement } from '@openelement/element';
import pageStyles from './page-visible-probe.css';

@element('visible-page', { root: 'shadow-open' })
export default class VisiblePage extends OpenElement {
  static override styles = [pageStyles];

  render() {
    return (
      <main>
        <h1>visible probe</h1>
        <div id='visible-probe-spacer' class='visible-probe-spacer'>spacer</div>
        <visible-probe></visible-probe>
      </main>
    );
  }
}
