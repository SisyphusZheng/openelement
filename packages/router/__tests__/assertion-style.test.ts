import { expect, test } from 'vitest';
import { readFileSync, readdirSync, type Dirent } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Audit gate: boolean expressions must not be passed to assertExists.
 *
 * assertExists only rejects null/undefined, so a predicate wrapped in it
 * (e.g. a `.includes(...)` result) can never fail the test. Use assert,
 * assertStringIncludes, or assertEquals for predicates instead.
 *
 * Every packages/*\/__tests__\/*.test.ts file is scanned. An assertExists
 * call is flagged when its direct argument (text at paren depth 1, before the
 * first top-level comma) contains a boolean construct: .includes(/
 * .startsWith(/.endsWith(/.some(/.every(/instanceof, or a comparison/logical
 * operator. Nested expressions — e.g. a `.find((w) => ...)` narrowing guard
 * whose callback uses predicates — are legitimate and not flagged.
 *
 * The package root is derived from this file's own URL, never from the
 * process cwd: the test runner's cwd depends on how the suite was invoked,
 * and `join(cwd, 'packages')` can be a directory that does not exist (the
 * scan would crash) — or, worse, whatever stray `packages/` happens to
 * be there, which would silently scan the wrong tree and pass vacuously.
 *
 * assertExists is retired from the tree (0 call sites), so the sweep alone
 * cannot fail today: it stays as a regression net, and the detector itself is
 * pinned by the positive/negative controls below, which drive the full
 * read-and-match path over fixtures written to a temp directory. A broken
 * detector (dropped pattern, off-by-one argument slice, unread file) fails
 * those controls instead of reporting a green sweep over code it no longer
 * understands.
 */

const BOOLEAN_PATTERN =
  /\.(?:includes|startsWith|endsWith|some|every)\(|\binstanceof\b|===|!==|>=|<=|\|\||&&/;

/** Repository root, derived from this test's location (packages/router/__tests__). */
const REPO_ROOT = join(dirname(new URL(import.meta.url).pathname), '..', '..', '..');

/**
 * The scanned marker, assembled at runtime: this file itself lives in the
 * scanned tree, and a literal call spelling here would make the sweep flag its
 * own fixture text.
 */
const ASSERT_EXISTS = 'assert' + 'Exists';

function listTestFiles(): string[] {
  const files: string[] = [];
  const packagesDir = join(REPO_ROOT, 'packages');
  for (const pkg of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue;
    const testsDir = join(packagesDir, pkg.name, '__tests__');
    let entries: Dirent[];
    try {
      entries = readdirSync(testsDir, { withFileTypes: true });
    } catch {
      continue; // package without __tests__
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.test.ts')) {
        files.push(join(testsDir, entry.name));
      }
    }
  }
  return files.sort();
}

/** Extract the direct (depth-1) argument text of every assertExists call. */
function directArguments(source: string): Array<{ text: string; line: number }> {
  const results: Array<{ text: string; line: number }> = [];
  const marker = ASSERT_EXISTS + '(';
  let searchFrom = 0;
  for (;;) {
    const start = source.indexOf(marker, searchFrom);
    if (start === -1) return results;
    const line = source.slice(0, start).split('\n').length;
    let depth = 1;
    let text = '';
    let quote: string | null = null;
    let i = start + marker.length;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (quote) {
        if (ch === '\\') i++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        quote = ch;
        continue;
      }
      if (ch === '(' || ch === '[' || ch === '{') {
        if (depth === 1) text += ch;
        depth++;
      } else if (ch === ')' || ch === ']' || ch === '}') {
        depth--;
        if (depth === 0) break;
        if (depth === 1) text += ch;
      } else if (depth === 1) {
        if (ch === ',') break; // stop before the optional message argument
        text += ch;
      }
    }
    results.push({ text, line });
    searchFrom = i;
  }
}

/** The whole detector: read each file, flag every boolean-argument call. */
function scanAssertionStyle(files: string[]): string[] {
  const offenders: string[] = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const { text, line } of directArguments(content)) {
      if (BOOLEAN_PATTERN.test(text)) {
        offenders.push(`${file}:${line}: ${text.trim().replaceAll(/\s+/g, ' ').slice(0, 80)}`);
      }
    }
  }
  return offenders;
}

test('detector control: boolean arguments are flagged, narrowing guards are not', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'assertion-style-control-'));
  try {
    const offending = join(dir, 'offending.test.ts');
    await writeFile(
      offending,
      `${ASSERT_EXISTS}(value.includes('needle'));\n` +
        `${ASSERT_EXISTS}(\n  count === 3,\n  'the count must match',\n);\n`,
    );
    // The read-and-match path, not just the regex: a scan that looked at no
    // file, or never read this one, fails here.
    const flagged = scanAssertionStyle([offending]);
    expect(flagged).toHaveLength(2);
    expect(flagged[0]).toContain(`${offending}:1:`);
    expect(flagged[0]).toContain('value.includes');
    expect(flagged[1]).toContain(`${offending}:2:`);
    expect(flagged[1]).toContain('count === 3');

    const clean = join(dir, 'clean.test.ts');
    await writeFile(
      clean,
      // The narrowing-guard form the docstring calls legitimate, plus the
      // message argument: neither may be mistaken for the direct argument.
      `${ASSERT_EXISTS}(items.find((w) => w.name.startsWith('a')));\n` +
        `${ASSERT_EXISTS}(widget, 'present');\n`,
    );
    expect(scanAssertionStyle([clean])).toEqual([]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('audit gate: no boolean expressions passed to assertExists', () => {
  const files = listTestFiles();
  // A scan that found no test files proves nothing: an empty offender list
  // from an empty file set would report success without looking at any code.
  expect(
    files.length > 0,
    `no test files found under ${join(REPO_ROOT, 'packages')} — the audit cannot pass vacuously`,
  ).toBeTruthy();

  expect(scanAssertionStyle(files)).toEqual([]);
});
