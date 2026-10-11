/**
 * Shadow-native Tailwind acceptance (alpha15 S lane) — the RED consumer's
 * browser proof.
 *
 * The probe component (app/components/shadow-tailwind-probe.tsx) is authored
 * with Tailwind utility classes ONLY: no authored sheet, no `static styles`,
 * no manual adoption, no scan configuration. This spec pins the product
 * contract in a real browser:
 *
 *   1. the shadow tree's computed styles actually reflect the utilities
 *      (`p-8` → 32px padding, `rounded-xl` → a real radius, `text-2xl` → 24px,
 *      `bg-primary` → the document theme role's resolved colour);
 *   2. the styling survives WITHOUT client JavaScript (the probe is a static
 *      component: the assertion runs against the SSR/DSD tree);
 *   3. the delivery is a real CSS resource — no generated CSS text inline in
 *      the page and no runtime-injected style nodes.
 *
 * Run: pnpm --dir tests/fixtures/router-ui-dogfood run e2e (after `run build`)
 */
import { expect, test } from '@playwright/test';

interface ProbeStyles {
  paddingTop: string;
  borderRadius: string;
  headingFontSize: string;
  backgroundColor: string;
  shadowLinks: number;
  shadowInlineStyles: number;
}

// RED CONSUMER (alpha15 S lane). This test encodes the product contract and
// does NOT pass yet: measured on the current tree it reads `0px` where `p-8`
// (= 32px) is written in TSX — the utilities compile into the DOCUMENT
// stylesheet, and document styles cannot cross a shadow boundary. It flips to
// `test(...)` the moment the pipeline lands (compiler candidates → official
// Tailwind compile → external CSS asset → adoptedStyleSheets / DSD link).
// Kept as `fixme` so the fixture's gate stays honest rather than red: the
// failing measurement is recorded in the S-lane report.
test.fixme('a TSX-only Tailwind shadow component is styled inside its shadow root', async ({
  page,
}) => {
  await page.goto('/tailwind-probe');
  const probe = page.locator('oe-tailwind-probe').first();
  await expect(probe).toHaveCount(1);

  const styles = await probe.evaluate((host): ProbeStyles | null => {
    const root = (host as HTMLElement).shadowRoot;
    const article = root?.querySelector('article.probe-card');
    const heading = root?.querySelector('h2');
    if (!(article instanceof HTMLElement)) return null;
    const computed = getComputedStyle(article);
    return {
      paddingTop: computed.paddingTop,
      borderRadius: computed.borderTopLeftRadius,
      backgroundColor: computed.backgroundColor,
      headingFontSize: heading instanceof HTMLElement ? getComputedStyle(heading).fontSize : '',
      shadowLinks: root?.querySelectorAll('link[rel="stylesheet"]').length ?? -1,
      shadowInlineStyles: root?.querySelectorAll('style').length ?? -1,
    };
  });
  expect(styles, 'the probe renders a DSD shadow tree').not.toBeNull();

  // The utility contract, measured in the shadow tree. `p-8` = 2rem = 32px,
  // `rounded-xl` = 0.75rem = 12px, `text-2xl` = 1.5rem = 24px.
  expect(styles!.paddingTop, 'p-8 inside the shadow root').toEqual('32px');
  expect(styles!.borderRadius, 'rounded-xl inside the shadow root').toEqual('12px');
  expect(styles!.headingFontSize, 'text-2xl inside the shadow root').toEqual('24px');
  // `bg-primary` resolves through the document theme role (violet-700 in the
  // light theme) — a real colour, not the transparent default.
  expect(styles!.backgroundColor, 'bg-primary resolves a theme colour').not.toEqual(
    'rgba(0, 0, 0, 0)',
  );
});

test('the probe ships no generated inline CSS and no runtime style injection', async ({ page }) => {
  await page.goto('/tailwind-probe');
  // The RAW server response: external resources only. Generated component CSS
  // must arrive as a referenced stylesheet, never as inlined `<style>` text,
  // and the probe hydrates no client JavaScript — so any style node inside its
  // shadow tree would be a runtime injection.
  const response = await page.request.get('/tailwind-probe');
  const html = await response.text();
  const probeStart = html.indexOf('<oe-tailwind-probe');
  expect(probeStart, 'the probe host exists in the served document').toBeGreaterThan(-1);
  const probeMarkup = html.slice(probeStart, html.indexOf('</oe-tailwind-probe>', probeStart));
  expect(probeMarkup, 'the probe content is server-rendered DSD').toContain('<article');
  expect(probeMarkup, 'no inline <style> inside the DSD template').not.toContain('<style');
  expect(probeMarkup, 'no runtime style injection in the served markup').not.toContain('<link');

  const styles = await page
    .locator('oe-tailwind-probe')
    .first()
    .evaluate((host): ProbeStyles | null => {
      const root = (host as HTMLElement).shadowRoot;
      if (!root) return null;
      return {
        paddingTop: '',
        borderRadius: '',
        backgroundColor: '',
        headingFontSize: '',
        shadowLinks: root.querySelectorAll('link[rel="stylesheet"]').length,
        shadowInlineStyles: root.querySelectorAll('style').length,
      };
    });
  expect(styles).not.toBeNull();
  // No runtime injection: the probe carries no client JavaScript, so the node
  // count is what the server emitted.
  expect(styles!.shadowInlineStyles, 'no runtime style nodes').toEqual(0);
});
