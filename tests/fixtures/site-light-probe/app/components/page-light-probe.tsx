// Page component for the light-mode probe fixture (#1148 / ADR-0142).
// The class lives here — not in the route module — because a module carrying
// an @element class is compiled under the compiled-element grammar, which
// admits no other runtime top-level statements; the route module needs them
// for its definePage descriptor.
//
// `root: 'light'` on the page: the probe island must sit in the document
// tree, not inside a page shadow root. Page elements are never registered on
// the client (only islands are), so a pre-upgrade click landing in a
// shadow-mode page would key its replay queue to the never-hydrating page
// host and be lost; in light DOM the queue keys to the island host itself.
// The fixture has no layout, so the page renders directly into <body>.
//
// The page is the OUTER light root of the style probe (alpha15 S lane,
// S-C1.2): its own authored sheet is one of the document's stylesheet links,
// and the two component types nested inside it are two more.

import { element, OpenElement } from '@openelement/element';
import pageStyles from './page-light-probe.css';

@element('light-probe-page', { root: 'light' })
export default class LightProbePage extends OpenElement {
  static override styles = [pageStyles];

  render() {
    return (
      <main class='light-probe-page'>
        <h1>Light-mode activation probe</h1>
        {/* The unrelated document element with the overlapping class name: it
            must keep the document's own color, never a component's. */}
        <p class='probe-shared document-probe'>document text</p>
        <open-light-probe class='probe-host'></open-light-probe>
        {/* Two instances of ONE component type: one emitted stylesheet, two
            hosts. */}
        <light-probe-card count='1'></light-probe-card>
        <light-probe-card count='2'></light-probe-card>
        <light-probe-runtime-carrier hidden></light-probe-runtime-carrier>
      </main>
    );
  }
}
