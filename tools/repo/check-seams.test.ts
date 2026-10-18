/**
 * check-seams.test.ts — negative proof for the seams-registry reader (P8).
 *
 * The check exists because `docs/architecture/seams.md` had no mechanical
 * reader (`grep -rn "seams" tools tests .githooks` found only runtime seam
 * files), so the AGENTS.md/P8 claim "a seam missing either does not pass the
 * gate" was not true: rows could lose cells, guards could be renamed, and the
 * KR-5 vaccine clause could be omitted without anything going red. A check
 * that only ever reports "0 violations on today's tree" proves nothing about
 * that, so this file pins the failure direction:
 *
 *   - the parser matrix: escaped pipes stay inside a cell, an unescaped pipe
 *     splits a row into six cells and is reported, empty cells are reported,
 *     a missing header/table is reported;
 *   - the guard matrix: a nonexistent `*.test.ts` path is a violation, a repo
 *     guard script (`check-*.ts`) is accepted, and a fixture-relative token
 *     (`e2e/probe.spec.ts` after the fixture directory) resolves;
 *   - the vaccine matrix: the missing/unreadable-behavior statement is
 *     required, and the wording the audit used to find the 14 lacking rows is
 *     accepted;
 *   - the live tree: the registry as committed is clean.
 */
import { expect, test } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  checkSeams,
  checkSeamsMarkdown,
  splitTableCells,
  type SeamViolation,
} from './check-seams.ts';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

const HEADER = '| Seam | Owner | Direction | Crossing artifacts | Guard test |';
const SEPARATOR = '| --- | --- | --- | --- | --- |';

/** One registry document from raw row lines (each row is five cells). */
function registry(rows: string[], header = HEADER, separator = SEPARATOR): string {
  return [`# Seams`, '', header, separator, ...rows, ''].join('\n');
}

/** A cell sentence that carries the KR-5 vaccine behavior. */
const VACCINE = 'Missing/unreadable behavior: the reader fails closed.';

function kinds(violations: SeamViolation[]): string[] {
  return violations.map((violation) => violation.kind);
}

test('splitTableCells keeps an escaped pipe inside one cell and drops edge empties', () => {
  expect(splitTableCells('| a | b \\| c | d |')).toEqual(['a', 'b | c', 'd']);
  expect(splitTableCells('| a |  | c |')).toEqual(['a', '', 'c']);
  expect(splitTableCells('| a | b | c | d | e |')).toEqual(['a', 'b', 'c', 'd', 'e']);
});

test('a well-formed row with an existing test guard and the vaccine clause passes', () => {
  const report = checkSeamsMarkdown(
    registry([
      `| Sample seam | \`owner.ts\` | writer → reader | \`artifact\` | ${VACCINE} \`tools/repo/check-vp-selector-flags.test.ts\` |`,
      `| Sample seam 2 | \`owner.ts\` | writer → reader | \`artifact\` | ${VACCINE} \`tools/repo/check-vp-selector-flags.test.ts\` |`,
    ]),
    repoRoot,
  );
  expect(report.violations).toEqual([]);
  expect(report.rowCount).toBe(2);
  expect(report.guardedRows).toBe(2);
});

test('an unescaped pipe splits a row into six cells and is reported as malformed', () => {
  const report = checkSeamsMarkdown(
    registry([
      `| Sample | owner | writer → reader | \`a | b\` | ${VACCINE} \`tools/repo/check-vp-selector-flags.test.ts\` |`,
    ]),
    repoRoot,
  );
  expect(kinds(report.violations)).toContain('malformed-row');
  expect(report.violations[0]!.detail).toContain('expected 5 cells, found 6');
});

test('a row with fewer than five cells is reported as malformed', () => {
  const report = checkSeamsMarkdown(
    registry([`| Sample | owner | writer → reader | ${VACCINE} |`]),
    repoRoot,
  );
  expect(kinds(report.violations)).toContain('malformed-row');
  expect(report.violations[0]!.detail).toContain('expected 5 cells, found 4');
});

test('an empty owner cell is reported', () => {
  const report = checkSeamsMarkdown(
    registry([
      `| Sample |  | writer → reader | \`artifact\` | ${VACCINE} \`tools/repo/check-vp-selector-flags.test.ts\` |`,
    ]),
    repoRoot,
  );
  expect(kinds(report.violations)).toContain('empty-cell');
});

test('a row without the missing/unreadable-behavior statement is reported', () => {
  const report = checkSeamsMarkdown(
    registry([
      `| Sample | owner | writer → reader | \`artifact\` | \`tools/repo/check-vp-selector-flags.test.ts\` |`,
    ]),
    repoRoot,
  );
  expect(kinds(report.violations)).toContain('missing-vaccine');
});

test('a guard-cell test path that does not exist is reported', () => {
  const report = checkSeamsMarkdown(
    registry([
      `| Sample | owner | writer → reader | \`artifact\` | ${VACCINE} \`tools/repo/does-not-exist.test.ts\` |`,
    ]),
    repoRoot,
  );
  expect(kinds(report.violations)).toContain('guard-test-unresolved');
  expect(kinds(report.violations)).toContain('guard-not-a-test');
});

test('a repo guard script (check-*.ts) is accepted as a guard artifact', () => {
  const report = checkSeamsMarkdown(
    registry([
      `| Sample | owner | writer → reader | \`artifact\` | ${VACCINE} \`www/tools/check-site-theme-tokens.ts\` |`,
    ]),
    repoRoot,
  );
  expect(report.violations).toEqual([]);
});

test('a fixture-relative guard token resolves against the fixture directory named earlier', () => {
  const report = checkSeamsMarkdown(
    registry([
      `| Sample | owner | writer → reader | \`artifact\` | ${VACCINE} \`tests/fixtures/router-unocss-probe\`; \`e2e/probe.spec.ts\` |`,
    ]),
    repoRoot,
  );
  expect(report.violations).toEqual([]);
});

test('a wrong header is reported instead of silently reading the wrong columns', () => {
  const report = checkSeamsMarkdown(
    registry(
      [
        `| Sample | owner | writer → reader | \`artifact\` | ${VACCINE} \`tools/repo/check-vp-selector-flags.test.ts\` |`,
      ],
      '| Name | Owner | Direction | Crossing artifacts | Guard test |',
    ),
    repoRoot,
  );
  expect(kinds(report.violations)).toContain('malformed-row');
});

test('a document without a table fails closed instead of passing vacuously', () => {
  const report = checkSeamsMarkdown('# Seams\n\nno table here\n', repoRoot);
  expect(kinds(report.violations)).toContain('table-missing');
  expect(report.rowCount).toBe(0);
});

test('a header-only table fails closed', () => {
  const report = checkSeamsMarkdown(registry([]), repoRoot);
  expect(kinds(report.violations)).toContain('table-missing');
});

test('the live seams registry is clean (this is the drift guard, not a smoke test)', () => {
  const report = checkSeams(repoRoot);
  expect(
    report.violations,
    report.violations.map((violation) => `${violation.line}: ${violation.detail}`).join('\n'),
  ).toEqual([]);
  expect(report.rowCount).toBeGreaterThanOrEqual(43);
  expect(report.guardedRows).toBe(report.rowCount);
});
