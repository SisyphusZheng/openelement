/**
 * E2E test helpers for openElement docs site.
 *
 * Selector policy (#1232): prefer user-visible semantics — roles, accessible
 * names, text, stable routes and component tag names. Playwright role/CSS
 * locators pierce open shadow roots natively; reach for the shadow-walker in
 * tools/lib/shadow-walker.ts only when the shadow structure itself is the
 * subject under test (dsd-layers.spec.ts). Do not add data-testid hooks
 * except for important, stable interaction boundaries.
 */

import { test, type Page } from '@playwright/test';

/**
 * Collect all custom element tag names found in the page HTML.
 */
export function getCustomElementTags(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const tags = new Set<string>();
    const all = document.querySelectorAll('*');
    for (const el of all) {
      if (el.tagName.includes('-')) {
        tags.add(el.tagName.toLowerCase());
      }
    }
    return [...tags];
  });
}

/**
 * Count upgraded custom elements: elements carrying a shadow root after the
 * browser parsed the DSD and the island scripts ran.
 */
export function getShadowRootCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    let count = 0;
    for (const el of document.querySelectorAll('*')) {
      if (el.shadowRoot) count += 1;
    }
    return count;
  });
}

/**
 * Collect trimmed text of ordinary text nodes that look like leaked raw
 * markup matching `pattern` (case-insensitive). Code, pre, style, script and
 * template subtrees are inert containers: their content is authored examples,
 * not failed DSD serialization.
 */
export function getLeakedMarkupText(page: Page, pattern: RegExp): Promise<string[]> {
  return page.evaluate((source: string) => {
    const re = new RegExp(source, 'i');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const leaked: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest('code, pre, style, script, template')) continue;
      const text = node.textContent ?? '';
      if (re.test(text)) leaked.push(text.trim());
    }
    return leaked;
  }, pattern.source);
}

/**
 * The context a classified timeout names: the phase that owns the wait, and
 * the route the test was driving.
 */
export interface TimeoutClassification {
  phase: string;
  url: string;
}

/**
 * Rethrow a Playwright deadline error as a classified engine timeout.
 *
 * A widened per-route ceiling (the 420 s `/reference` ceiling in the site
 * suite) expires inside whichever await is pending and Playwright reports it
 * as `page.waitForLoadState: Test timeout of 420000ms exceeded` — an
 * assertion-shaped stack for what is an engine/probe timeout (review FR-05C,
 * run 39216159302). The classification names the phase, engine and URL and
 * preserves the original message as the cause.
 *
 * Non-timeout errors are returned untouched: this never weakens an assertion,
 * never retries and never changes a timeout value.
 */
export function classifyTimeoutError(error: unknown, context: TimeoutClassification): unknown {
  const message = error instanceof Error ? error.message : String(error);
  if (!/\bTimeout\b[^.]*\b\d+ms exceeded\b/i.test(message)) return error;
  let engine = 'unknown';
  try {
    engine = test.info().project.name;
  } catch {
    // Called outside a running test (e.g. an imported unit check): keep it
    // 'unknown' instead of masking the original error with a new failure.
  }
  const classified = `engine timeout: phase=${context.phase} engine=${engine} url=${context.url} — ${message}`;
  // The runner's own verdict may still say "Test timeout"; the classified
  // line must be in the failure output regardless (CI log and HTML report).
  console.error(classified);
  return new Error(classified, { cause: error });
}

/** Await one load/observation step, classifying Playwright timeouts. */
export async function observeWithTimeoutClassification<T>(
  context: TimeoutClassification,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw classifyTimeoutError(error, context);
  }
}

/** `page.waitForLoadState(...)` with the classified timeout error. */
export async function waitForLoadStateClassified(
  page: Page,
  state: 'load' | 'domcontentloaded' | 'networkidle',
  context: TimeoutClassification,
): Promise<void> {
  await observeWithTimeoutClassification(context, () => page.waitForLoadState(state));
}
