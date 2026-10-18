/**
 * check-adr-index.test.ts — positive and negative proof for the ADR index
 * reader.
 *
 * The check exists because `docs/adr/README.md`'s policy ("retired decisions
 * are preserved in Git history; this repository keeps no separate historical
 * decision index") had already drifted from the tree: four non-active records
 * were retained in the directory with no mechanical statement of what their
 * entries meant. A check that only reports "0 violations on today's tree"
 * proves nothing about that, so this file pins the failure direction for each
 * of the three rules: a link that resolves to nothing, a record nobody lists,
 * and an annotation that disagrees with (or is required by) its record.
 */
import { expect, test } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  checkAdrIndex,
  checkAdrIndexMarkdown,
  declaredRecordStatus,
  type AdrIndexViolation,
} from './check-adr-index.ts';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/** One index document from raw entry lines. */
function index(...lines: string[]): string {
  return ['# Decision records', '', ...lines, ''].join('\n');
}

/** One minimal record with a status banner. */
function record(status: string, body = ''): string {
  return `# ADR-9999: sample\n\n- Status: ${status}\n${body}\n`;
}

function kinds(violations: AdrIndexViolation[]): string[] {
  return violations.map((violation) => violation.kind);
}

function check(markdown: string, records: Record<string, string>) {
  return checkAdrIndexMarkdown(
    markdown,
    () => Object.keys(records),
    (file) => records[file],
  );
}

test('an index whose links resolve, cover every record and agree with each status passes', () => {
  const report = check(
    index(
      '- [ADR-9001-active.md](./ADR-9001-active.md)',
      '- [ADR-9002-retired.md](./ADR-9002-retired.md) — RETIRED by the #1 cleanup',
      '- [ADR-9003-amended.md](./ADR-9003-amended.md) — AMENDED: the second half was retired',
    ),
    {
      'ADR-9001-active.md': record('ACCEPTED (2026-01-01)'),
      'ADR-9002-retired.md': record('**RETIRED** (2026-02-01 — superseded)'),
      'ADR-9003-amended.md': record('ACCEPTED (2026-03-01)', '## Amendment (2026-04-01)\n\ntext'),
    },
  );
  expect(report.violations).toEqual([]);
  expect(report.entryCount).toBe(3);
  expect(report.resolvedCount).toBe(3);
  expect(report.annotatedCount).toBe(2);
  expect(report.recordCount).toBe(3);
});

test('a link that resolves to no record is reported', () => {
  const report = check(index('- [ADR-9001-active.md](./ADR-9001-active.md)'), {
    'ADR-9002-other.md': record('ACCEPTED'),
  });
  expect(kinds(report.violations)).toContain('link-unresolved');
});

test('a record nobody lists is reported', () => {
  const report = check(index('- [ADR-9001-active.md](./ADR-9001-active.md)'), {
    'ADR-9001-active.md': record('ACCEPTED'),
    'ADR-9002-orphan.md': record('ACCEPTED'),
  });
  expect(kinds(report.violations)).toContain('record-not-indexed');
  expect(report.violations[0]!.detail).toContain('ADR-9002-orphan.md');
});

test('a record listed twice is reported', () => {
  const report = check(
    index(
      '- [ADR-9001-active.md](./ADR-9001-active.md)',
      '- [ADR-9001-active.md](./ADR-9001-active.md)',
    ),
    { 'ADR-9001-active.md': record('ACCEPTED') },
  );
  expect(kinds(report.violations)).toContain('record-indexed-twice');
});

test('a retired record indexed as active is reported', () => {
  const report = check(index('- [ADR-9001-retired.md](./ADR-9001-retired.md)'), {
    'ADR-9001-retired.md': record('**RETIRED** (2026-02-01)'),
  });
  expect(kinds(report.violations)).toContain('annotation-missing');
});

test('an annotation that disagrees with the record status is reported', () => {
  const report = check(
    index('- [ADR-9001-active.md](./ADR-9001-active.md) — SUPERSEDED by ADR-9999'),
    { 'ADR-9001-active.md': record('ACCEPTED (2026-01-01)') },
  );
  expect(kinds(report.violations)).toContain('annotation-mismatch');
});

test('an annotation outside the closed vocabulary is reported', () => {
  const report = check(
    index('- [ADR-9001-active.md](./ADR-9001-active.md) — DEPRECATED by ADR-9999'),
    { 'ADR-9001-active.md': record('ACCEPTED') },
  );
  expect(kinds(report.violations)).toContain('unknown-annotation');
});

test('an AMENDED annotation with no amendment in the record is reported', () => {
  const report = check(
    index('- [ADR-9001-active.md](./ADR-9001-active.md) — AMENDED: half retired'),
    { 'ADR-9001-active.md': record('ACCEPTED (2026-01-01)') },
  );
  expect(kinds(report.violations)).toContain('amendment-unbacked');
});

test('an entry that links something other than a record file is reported', () => {
  const report = check(index('- [Notes](./notes.md)'), {
    'ADR-9001-active.md': record('ACCEPTED'),
  });
  expect(kinds(report.violations)).toContain('entry-malformed');
});

test('a record without a status banner is reported instead of agreeing vacuously', () => {
  const report = check(index('- [ADR-9001-nostatus.md](./ADR-9001-nostatus.md)'), {
    'ADR-9001-nostatus.md': '# ADR-9001: sample\n\ntext\n',
  });
  expect(kinds(report.violations)).toContain('record-status-missing');
});

test('an unreadable record directory fails closed', () => {
  const report = checkAdrIndexMarkdown(
    index('- [ADR-9001-active.md](./ADR-9001-active.md)'),
    () => undefined,
    () => undefined,
  );
  expect(kinds(report.violations)).toContain('index-missing');
  expect(report.recordCount).toBe(0);
});

test('an index with no entries fails closed', () => {
  const report = check(index('prose only'), { 'ADR-9001-active.md': record('ACCEPTED') });
  expect(kinds(report.violations)).toContain('vacuous');
});

test('the declared status reads the wrapped amendment half of an amended record', () => {
  expect(declaredRecordStatus(record('ACCEPTED (2026-01-01)'))).toBeUndefined();
  expect(declaredRecordStatus(record('**RETIRED** (2026-02-01)'))).toBe('RETIRED');
  expect(
    declaredRecordStatus(
      '- Status: ACCEPTED (2026-01-01 — the minimal lane);\n  **AMENDED** (2026-02-01 — half retired)\n',
    ),
  ).toBe('AMENDED');
});

test('the live ADR index is clean (this is the drift guard, not a smoke test)', () => {
  const report = checkAdrIndex(repoRoot);
  expect(
    report.violations,
    report.violations.map((violation) => `${violation.line}: ${violation.detail}`).join('\n'),
  ).toEqual([]);
  expect(report.recordCount).toBeGreaterThanOrEqual(29);
  expect(report.entryCount).toBe(report.recordCount);
  expect(report.resolvedCount).toBe(report.entryCount);
});
