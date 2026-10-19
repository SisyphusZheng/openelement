/**
 * `www/public/_headers` contract (T10 R1).
 *
 * The deployed host read `max-age=14400, must-revalidate` for content-hashed
 * assets before this file existed, so every returning reader revalidated the
 * stylesheet, the island sheets and every woff2 — while the framework's own
 * static-serve contract already calls those paths immutable. The site cannot
 * test Cloudflare's edge from a unit test, so what this test pins is the part
 * that CAN be checked deterministically:
 *
 *   - the file parses as the documented `_headers` shape (path lines at column
 *     0, indented `Name: value` lines, `#` comments);
 *   - the content-hashed tree gets `max-age=31536000, immutable`;
 *   - nothing with a stable URL (HTML, the unhashed client entry, the search
 *     index, the redirect table) gets an immutable or year-long policy — the
 *     2026-10-18 audit's whole point is that a wrong rule here is invisible
 *     until a reader is stuck on a stale page.
 */
import { expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';

const HEADERS_FILE = new URL('../public/_headers', import.meta.url);

interface HeaderRule {
  path: string;
  headers: Record<string, string>;
}

function parseHeadersFile(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  let current: HeaderRule | null = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\s+$/u, '');
    if (line === '' || line.trimStart().startsWith('#')) continue;
    if (!/^\s/u.test(line)) {
      current = { path: line.trim(), headers: {} };
      rules.push(current);
      continue;
    }
    if (current === null) {
      throw new Error(`_headers: header line before any path: '${line}'`);
    }
    const match = /^\s+([A-Za-z-]+):\s*(.+)$/u.exec(line);
    if (!match) throw new Error(`_headers: unparsable line: '${line}'`);
    current.headers[match[1]!.toLowerCase()] = match[2]!.trim();
  }
  return rules;
}

const text = await readFile(HEADERS_FILE, 'utf8');
const rules = parseHeadersFile(text);

test('_headers: the file is the documented shape', () => {
  expect(rules.length).toBeGreaterThanOrEqual(3);
  for (const rule of rules) {
    expect(rule.path.startsWith('/'), `path must be site-absolute: ${rule.path}`).toBe(true);
    expect(
      Object.keys(rule.headers).length,
      `rule '${rule.path}' declares no headers`,
    ).toBeGreaterThan(0);
    for (const [name, value] of Object.entries(rule.headers)) {
      expect(name, `header names are lower-cased by the parser`).toBe(name.toLowerCase());
      expect(value.length).toBeGreaterThan(0);
    }
  }
});

test('_headers: content-hashed assets are immutable', () => {
  const hashed = rules.filter((rule) => rule.path.startsWith('/client/assets/'));
  expect(hashed.length, 'the content-hashed asset tree must be covered').toBeGreaterThan(0);
  for (const rule of hashed) {
    const cacheControl = rule.headers['cache-control'] ?? '';
    expect(cacheControl, `${rule.path} must be immutable`).toContain('immutable');
    expect(cacheControl, `${rule.path} must carry a one-year max-age`).toContain(
      'max-age=31536000',
    );
  }
});

test('_headers: stable URLs never get an immutable or year-long policy', () => {
  // The hash is what makes a URL safe to cache forever: a rule may only claim
  // immutable when its path is inside the content-hashed tree.
  for (const rule of rules) {
    const cacheControl = rule.headers['cache-control'] ?? '';
    if (cacheControl.includes('immutable') || cacheControl.includes('max-age=31536000')) {
      expect(
        rule.path.startsWith('/client/assets/'),
        `${rule.path} claims long-lived caching without a content hash in its path`,
      ).toBe(true);
    }
  }
  // The search index and the redirect table are rebuilt per deploy under stable
  // names: they must stay revalidated / uncached.
  const pagefind = rules.find((rule) => rule.path === '/pagefind/*');
  expect(pagefind, 'the pagefind index rule is missing').toBeTruthy();
  expect(pagefind!.headers['cache-control'] ?? '').toContain('must-revalidate');
  const redirects = rules.find((rule) => rule.path === '/_redirects');
  expect(redirects, 'the _redirects rule is missing').toBeTruthy();
  expect(redirects!.headers['cache-control'] ?? '').toContain('no-store');
});

test('_headers: no catch-all rule shadows the per-path policy', () => {
  // `/*` would apply to HTML too, and the host's default (max-age=0,
  // must-revalidate) is the correct policy for a page.
  for (const rule of rules) {
    expect(rule.path, 'a /* catch-all would override the host HTML policy').not.toBe('/*');
    expect(rule.path.endsWith('*.html'), `${rule.path} must not target HTML`).toBe(false);
  }
});
