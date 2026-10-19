/**
 * Bilingual parity gate (T10 R6).
 *
 * The site ships two trees of the same manual: `X.md` is the English page and
 * `X.zh.md` its Chinese twin. Until this test, nothing failed when one side
 * existed without the other — the sitemap spec only checked a `/zh` route when
 * a `.zh.md` file was present, so an English-only page (or a Chinese-only one)
 * shipped with a hole in one tree and both gates stayed green. The manual's
 * reader-facing promise is that every page has a twin; this pins it.
 *
 * Rules:
 *   - every `www/content/docs/**\/X.md` must have `X.zh.md`, and vice versa;
 *   - an intentional exception must be listed in {@link PARITY_EXCEPTIONS} with
 *     a non-empty reason — an empty reason fails the test rather than silently
 *     excusing a page (the same shape the doc-claims checker uses);
 *   - a twin's `order`/`section` frontmatter must match its pair, because the
 *     sidebar derives both from the English page and a mismatch silently
 *     reorders the Chinese tree.
 */
import { expect, test } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS_ROOT = fileURLToPath(new URL('../content/docs/', import.meta.url));

/**
 * Pages allowed to exist in one language only, each with the reason it may.
 * Empty on purpose today: the whole manual is bilingual.
 */
const PARITY_EXCEPTIONS: Readonly<Record<string, string>> = {};

interface DocPage {
  /** Locale-neutral path, e.g. `guide/getting-started`. */
  slug: string;
  /** Absolute path of the English file. */
  en: string;
  /** Absolute path of the Chinese file, when it exists. */
  zh?: string;
}

async function collectPages(): Promise<DocPage[]> {
  const pages = new Map<string, DocPage>();
  async function walk(dir: string, prefix: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute, `${prefix}${entry.name}/`);
        continue;
      }
      if (!entry.name.endsWith('.md')) continue;
      const isZh = entry.name.endsWith('.zh.md');
      const slug = `${prefix}${isZh ? entry.name.slice(0, -'.zh.md'.length) : entry.name.slice(0, -'.md'.length)}`;
      const page = pages.get(slug) ?? { slug, en: '' };
      if (isZh) page.zh = absolute;
      else page.en = absolute;
      pages.set(slug, page);
    }
  }
  await walk(DOCS_ROOT, '');
  return [...pages.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

function frontmatterField(source: string, field: string): string | null {
  const block = /^---\n([\s\S]*?)\n---/u.exec(source)?.[1];
  if (!block) return null;
  const line = new RegExp(`^${field}:\\s*(.+)$`, 'mu').exec(block);
  return line?.[1]?.trim() ?? null;
}

const pages = await collectPages();

test('bilingual parity: every page has both language files', () => {
  const missing: string[] = [];
  for (const page of pages) {
    const excused = Object.keys(PARITY_EXCEPTIONS).includes(page.slug);
    if (excused && PARITY_EXCEPTIONS[page.slug]!.trim() === '') {
      throw new Error(
        `bilingual parity: '${page.slug}' is excused with an empty reason — an exception ` +
          'must say why the page may exist in one language only.',
      );
    }
    if (excused) continue;
    if (page.en === '' || page.zh === undefined) {
      missing.push(`${page.slug} (missing ${page.en === '' ? 'en' : 'zh'} file)`);
    }
  }
  expect(missing, 'every content/docs page must carry an .md and a .zh.md twin').toEqual([]);
  // A gate that scans nothing would pass vacuously: pin the population size.
  expect(pages.length).toBeGreaterThanOrEqual(20);
});

test('bilingual parity: twins share order and section', async () => {
  const mismatches: string[] = [];
  for (const page of pages) {
    if (page.zh === undefined) continue;
    const [en, zh] = await Promise.all([readFile(page.en, 'utf8'), readFile(page.zh, 'utf8')]);
    for (const field of ['order', 'section']) {
      const left = frontmatterField(en, field);
      const right = frontmatterField(zh, field);
      // `section` is optional and derived when absent; only a real disagreement
      // is a defect. `order` is on every page.
      if (left !== right) {
        mismatches.push(`${page.slug}: ${field} en='${left}' zh='${right}'`);
      }
    }
  }
  expect(mismatches, 'a twin must not disagree about order/section').toEqual([]);
});
