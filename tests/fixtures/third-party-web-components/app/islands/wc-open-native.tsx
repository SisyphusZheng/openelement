/**
 * wc-open-native — openElement child created inside a bare-native custom
 * element's own open shadow root, after activation (A4 of the late-host
 * corpus).
 *
 * The "no framework" control: if the mechanism only worked for library-built
 * hosts, this case would fail while every library case passed, which is
 * exactly the distinction the corpus exists to make.
 */
import { defineIslandConfig } from '@openelement/router';
import { element, OpenElement } from '@openelement/element';

export const openElement = defineIslandConfig({ hydrate: 'load', ssr: false, dsd: false });

@element('wc-open-native', { root: 'shadow-open' })
export default class WcOpenNative extends OpenElement {
  render() {
    return <span id='open-native-ready'>openElement child inside a native element</span>;
  }
}
