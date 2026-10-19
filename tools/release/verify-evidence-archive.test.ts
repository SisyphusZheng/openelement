import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  describeSamples,
  parseArchiveClaims,
  parseArgs,
  parseJfbDocRatios,
  parseSha256Manifest,
  recomputeJfb,
  verifyEvidenceArchive,
  type JfbRawResult,
} from './verify-evidence-archive.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const ARCHIVE = join(ROOT, '.artifacts/release-evidence/alpha15-ab-jfb-evidence.tar.zst');

test('verify-evidence: the shasum manifest parser keeps hash/path pairs only', () => {
  const manifest = [
    'ac9352331c232b5e6b36c5d69d94fddc4d729b054bc4b5c4ce24a10976c3cffd  ./ab-3arm/a.json',
    '',
    'not a manifest line',
    '6368a8a607ae70fab46d083f1dde77a8fa3e6011cccd8838ea241afa350508a5  ./x.js',
  ].join('\n');
  expect(parseSha256Manifest(manifest)).toEqual([
    {
      hash: 'ac9352331c232b5e6b36c5d69d94fddc4d729b054bc4b5c4ce24a10976c3cffd',
      path: './ab-3arm/a.json',
    },
    { hash: '6368a8a607ae70fab46d083f1dde77a8fa3e6011cccd8838ea241afa350508a5', path: './x.js' },
  ]);
});

test('verify-evidence: describe() reproduces the archived aggregate.py quantiles', () => {
  const stats = describeSamples([4, 1, 3, 2]);
  expect(stats.n).toEqual(4);
  expect(stats.median).toEqual(2.5);
  expect(stats.q1).toEqual(1.75);
  expect(stats.q3).toEqual(3.25);
  expect(stats.iqr).toEqual(1.5);
  expect(stats.min).toEqual(1);
  expect(stats.max).toEqual(4);
  expect(stats.geomean).toBeCloseTo(
    Math.exp((Math.log(1) + Math.log(2) + Math.log(3) + Math.log(4)) / 4),
    12,
  );
  expect(describeSamples([7]).q1).toEqual(7);
});

function rawResult(benchmark: string, values: Record<string, number[]>): JfbRawResult {
  return {
    framework: 'fixture',
    benchmark,
    values: Object.fromEntries(
      Object.entries(values).map(([channel, list]) => [channel, { values: list }]),
    ),
  };
}

test('verify-evidence: the JFB recomputation pools rounds exactly like aggregate.py', () => {
  const rounds = [
    {
      round: 1,
      armA: [rawResult('01_run1k', { total: [10, 12], script: [2, 3] })],
      armB: [rawResult('01_run1k', { total: [11, 13], script: [2, 4] })],
    },
    {
      round: 2,
      armA: [rawResult('01_run1k', { total: [14] })],
      armB: [rawResult('01_run1k', { total: [15] })],
    },
  ];
  const recomputed = recomputeJfb(rounds);
  const row = recomputed.summary['01_run1k:total']!;
  expect(row.A.n).toEqual(3);
  expect(row.A.median).toEqual(12);
  expect(row.B.median).toEqual(13);
  expect(row.ratioMedian).toBeCloseTo(13 / 12, 12);
  // Absent benchmarks drop out of the geometric mean exactly like aggregate.py's
  // `x > 0` filter; one CPU row yields that row's ratio, not a fabricated mean.
  expect(recomputed.cpuGeomeanRatios['total:median']!).toBeCloseTo(13 / 12, 12);
  // The threshold verdict is recomputed, not copied: the fixture's +8.33% total
  // and +20% script ratios trip the 5% CPU and 10% single-item levels.
  expect(recomputed.thresholdFlags).toEqual([
    'CPU geometric mean (total, per-benchmark medians): 1.0833 exceeds the 5% threshold',
    'CPU geometric mean (script, per-benchmark medians): 1.2000 exceeds the 5% threshold',
    '01_run1k:script: B/A median 1.2000 exceeds the 10% threshold',
  ]);
});

test('verify-evidence: the JFB document claim parser reads the four CPU and three size ratios', () => {
  const markdown = [
    '| total | per-benchmark median | 32.19 | 32.62 | **1.0133 (+1.33 %)** |',
    '| total | per-benchmark geo-mean | 32.54 | 32.74 | 1.0062 (+0.62 %) |',
    '| script | per-benchmark median | 8.66 | 8.80 | **1.0162 (+1.62 %)** |',
    '| script | per-benchmark geo-mean | 8.82 | 8.79 | 0.9965 (−0.35 %) |',
    '| 41_size-uncompressed | 118.60 | 132.20 | **1.1147 (+11.47 %)** |',
    '| 42_size-compressed | 26.70 | 29.70 | **1.1124 (+11.24 %)** |',
    '| 43_first-paint | 191.55 | 195.75 | 1.0219 (+2.19 %) |',
    '| 21_ready-memory | 1 | 2 | 2.0 |',
  ].join('\n');
  expect(parseJfbDocRatios(markdown)).toEqual({
    'total:median': 1.0133,
    'total:geomean': 1.0062,
    'script:median': 1.0162,
    'script:geomean': 0.9965,
    '41_size-uncompressed': 1.1147,
    '42_size-compressed': 1.1124,
    '43_first-paint': 1.0219,
  });
});

test('verify-evidence: the README claim parser reads the pinned digest, bytes and counts', () => {
  const claims = parseArchiveClaims(
    '**`alpha15-ab-jfb-evidence.tar.zst`**, 223,543 bytes,\n' +
      'sha256 `53d974907cb851b6b2d906465e46ac93f577f51552041c8a82195df7338e8451`,\n' +
      '524 members. ... sha256 of every file in the release-evidence archive (503 entries)',
  );
  expect(claims.bytes).toEqual(223543);
  expect(claims.members).toEqual(524);
  expect(claims.manifestEntries).toEqual(503);
  expect(claims.sha256).toEqual('53d974907cb851b6b2d906465e46ac93f577f51552041c8a82195df7338e8451');
});

test('verify-evidence: a missing archive and no URL fails with the fetch path, never a pass', async () => {
  const report = await verifyEvidenceArchive({
    archivePath: join(ROOT, '.artifacts/release-evidence/does-not-exist.tar.zst'),
    url: null,
    expectedSha256: null,
    readmePath: join(ROOT, 'docs/release/evidence/alpha15/README.md'),
    reproducerDir: join(ROOT, 'docs/release/evidence/alpha15'),
    abEvaluationPath: join(ROOT, 'docs/release/alpha15-ab-evaluation.md'),
    jfbEvaluationPath: join(ROOT, 'docs/release/alpha15-jfb-runtime-evaluation.md'),
    workDir: null,
    keepWorkDir: false,
  }).catch((error: unknown) => error as Error);
  expect(report).toBeInstanceOf(Error);
  expect((report as Error).message).toMatch(/no archive at/);
});

test('verify-evidence: argument parsing accepts the documented flags', () => {
  const parsed = parseArgs(['--url', 'https://example.test/a.tar.zst', '--json', '--keep']);
  expect(parsed.url).toEqual('https://example.test/a.tar.zst');
  expect(parsed.json).toEqual(true);
  expect(parsed.keep).toEqual(true);
  expect(() => parseArgs(['--nope'])).toThrow(/unknown argument/);
});

// The real end-to-end verification: it runs only where the staged archive is
// present (the release workspace), and it is the evidence the reviewers cite.
test.skipIf(!existsSync(ARCHIVE))(
  'verify-evidence: the staged archive passes every check end to end',
  async () => {
    const report = await verifyEvidenceArchive({
      archivePath: ARCHIVE,
      url: null,
      expectedSha256: null,
      readmePath: join(ROOT, 'docs/release/evidence/alpha15/README.md'),
      reproducerDir: join(ROOT, 'docs/release/evidence/alpha15'),
      abEvaluationPath: join(ROOT, 'docs/release/alpha15-ab-evaluation.md'),
      jfbEvaluationPath: join(ROOT, 'docs/release/alpha15-jfb-runtime-evaluation.md'),
      workDir: null,
      keepWorkDir: false,
    });
    expect(report.failures).toEqual([]);
    expect(report.manifestEntries).toEqual(503);
    expect(report.members).toEqual(524);
    expect(report.summary?.cpuGeomeanRatios['total:median']).toBeCloseTo(1.0133, 3);
  },
  60_000,
);
