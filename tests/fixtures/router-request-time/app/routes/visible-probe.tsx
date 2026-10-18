/**
 * /visible-probe — static route carrying the #606 client:visible island.
 *
 * The route exists so the e2e can exercise the REAL scheduler module through
 * the fixture's normal client module graph (the generated entry imports it via
 * virtual:open-client-runtime/scheduler) instead of stringifying the factory.
 */
import { definePage } from '@openelement/router';
import VisiblePage from '../components/page-visible-probe.tsx';

export default definePage(VisiblePage, {
  // Request-time rendered: the response carries the per-request CSP nonce, so
  // the island client entry is allowed to execute (a static page's policy-only
  // meta CSP has no nonce and would block it by design).
  renderIntent: { mode: 'dynamic' },
  head: { title: 'request-time fixture — visible probe' },
});
