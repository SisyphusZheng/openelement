import { expect, test } from 'vitest';
import {
  collectEvidence,
  createFixtureSource,
  evaluateDocument,
  jobBaseId,
  parseArgs,
  renderChecklist,
  type EvidenceFixtures,
  type RawJob,
  type RawRun,
} from './evidence-bind.ts';

const SHA = 'ef5da43e45d887b214841a99c26d3f8d2dac358b';
const OTHER_SHA = '8f0e22c03053ebbdb81cb82e88810b3054c238b2';

function rawRun(overrides: Partial<RawRun> & { id: number }): RawRun {
  return {
    status: 'completed',
    conclusion: 'success',
    event: 'push',
    head_branch: 'main',
    head_sha: SHA,
    created_at: '2026-10-19T09:00:00Z',
    updated_at: '2026-10-19T09:40:00Z',
    html_url: `https://github.com/open-element/openelement/actions/runs/${overrides.id}`,
    ...overrides,
  };
}

const QUALIFICATION_RUN_ID = 39219887454;
const CANCELLED_RUN_ID = 39214493482;
const FAILED_RUN_ID = 39216159302;

/** The nine required job IDs / twelve instances, plus the sha-guard. */
function job(name: string, conclusion: string | null = 'success'): RawJob {
  return {
    id: Math.floor(Math.random() * 1_000_000_000),
    name,
    status: conclusion ? 'completed' : 'in_progress',
    conclusion,
    started_at: '2026-10-19T09:00:00Z',
    completed_at: conclusion ? '2026-10-19T09:05:00Z' : null,
    html_url: 'https://github.com/open-element/openelement/actions/runs/1/job/1',
  };
}

const QUALIFICATION_JOBS: RawJob[] = [
  job('sha-guard'),
  job('lint'),
  job('test'),
  job('e2e'),
  job('pack'),
  job('e2e-full (site-e2e)'),
  job('e2e-full (fixture-gates)'),
  job('bfcache'),
  job('node-serve-smoke (24)'),
  job('node-serve-smoke (26)'),
  job('packed-consumer-matrix (ubuntu-latest)'),
  job('packed-consumer-matrix (macos-latest)'),
  job('fresh-install'),
];

function baseFixtures(overrides: Partial<EvidenceFixtures> = {}): EvidenceFixtures {
  return {
    runs: [
      rawRun({ id: CANCELLED_RUN_ID, conclusion: 'cancelled', created_at: '2026-10-19T06:00:00Z' }),
      rawRun({ id: FAILED_RUN_ID, conclusion: 'failure', created_at: '2026-10-19T07:00:00Z' }),
      rawRun({ id: QUALIFICATION_RUN_ID, run_attempt: 1, created_at: '2026-10-19T08:00:00Z' }),
    ],
    runDetails: {
      [String(QUALIFICATION_RUN_ID)]: rawRun({ id: QUALIFICATION_RUN_ID }),
    },
    jobs: {
      [String(QUALIFICATION_RUN_ID)]: { total_count: 13, jobs: QUALIFICATION_JOBS },
    },
    artifacts: {
      [String(QUALIFICATION_RUN_ID)]: { total_count: 0, artifacts: [] },
    },
    codeql: {
      ref: 'refs/pull/1611/merge',
      alerts: [
        {
          number: 4236,
          state: 'fixed',
          created_at: '2026-10-17T00:00:00Z',
          updated_at: '2026-10-18T05:10:34Z',
          html_url: 'https://github.com/open-element/openelement/security/code-scanning/4236',
          rule: {
            id: 'js/bad-code-sanitization',
            severity: 'error',
            security_severity_level: 'high',
          },
          tool: { name: 'CodeQL' },
          most_recent_instance: { ref: 'refs/pull/1611/merge' },
        },
        {
          number: 4238,
          state: 'open',
          created_at: '2026-10-18T00:00:00Z',
          updated_at: '2026-10-18T06:00:00Z',
          html_url: 'https://github.com/open-element/openelement/security/code-scanning/4238',
          rule: {
            id: 'js/bad-code-sanitization',
            severity: 'error',
            security_severity_level: 'medium',
          },
          tool: { name: 'CodeQL' },
          most_recent_instance: { ref: 'refs/pull/1611/merge' },
        },
        {
          number: 4241,
          state: 'open',
          created_at: '2026-10-18T00:00:00Z',
          updated_at: '2026-10-18T06:00:00Z',
          html_url: 'https://github.com/open-element/openelement/security/code-scanning/4241',
          rule: { id: 'js/trivial-conditional', severity: 'warning' },
          tool: { name: 'CodeQL' },
          most_recent_instance: { ref: 'refs/pull/1611/merge' },
        },
      ],
    },
    tags: { 'v1.0.0-alpha.15': null },
    releases: { 'v1.0.0-alpha.15': null },
    distTags: {
      '@openelement/protocol': { distTags: { alpha: '1.0.0-alpha.14', latest: '1.0.0-alpha.14' } },
      '@openelement/element': { distTags: { alpha: '1.0.0-alpha.14', latest: '1.0.0-alpha.14' } },
      '@openelement/compiler': { distTags: { alpha: '1.0.0-alpha.14', latest: '1.0.0-alpha.14' } },
      '@openelement/router': { distTags: { alpha: '1.0.0-alpha.14', latest: '1.0.0-alpha.14' } },
      '@openelement/create': { distTags: { alpha: '1.0.0-alpha.14', latest: '1.0.0-alpha.14' } },
      '@openelement/ui': { distTags: { alpha: '1.0.0-alpha.14', latest: '1.0.0-alpha.14' } },
    },
    ...overrides,
  };
}

async function collect(
  fixtures: EvidenceFixtures,
  opts: { sha?: string; pr?: number | null } = {},
) {
  return await collectEvidence({
    source: createFixtureSource(fixtures, 'fixtures test'),
    sha: opts.sha ?? SHA,
    repository: 'open-element/openelement',
    pullRequest: opts.pr === undefined ? 1611 : opts.pr,
    tag: 'v1.0.0-alpha.15',
    packages: [
      '@openelement/protocol',
      '@openelement/element',
      '@openelement/compiler',
      '@openelement/router',
      '@openelement/create',
      '@openelement/ui',
    ],
    now: '2026-10-19T12:00:00Z',
  });
}

test('evidence-bind: selects the exact-SHA successful push/main run and passes', async () => {
  const { document, verdict } = await collect(baseFixtures());
  expect(verdict.qualified).toEqual(true);
  expect(verdict.refusals).toEqual([]);
  expect(document.ci.qualificationRunId).toEqual(QUALIFICATION_RUN_ID);
  expect(document.ci.runs).toHaveLength(3);
  expect(document.ci.jobs).toHaveLength(13);
  expect(document.ci.artifactListingTotal).toEqual(0);
  expect(document.codeql.ref).toEqual('refs/pull/1611/merge');
});

test('evidence-bind: a cancelled run is history, never qualification', async () => {
  const { document, verdict } = await collect(baseFixtures());
  const snippet = renderChecklist(document, verdict);
  expect(snippet).toContain('### Qualification CI (never a cancelled or failed run)');
  expect(snippet).toContain(`[${QUALIFICATION_RUN_ID}]`);
  expect(snippet).toContain('History (NOT qualification)');
  expect(snippet).toContain(`[${CANCELLED_RUN_ID}]`);
  expect(snippet).toContain(`[${FAILED_RUN_ID}]`);
  // The cancelled run must not be presented as the qualification pointer.
  const qualificationPointer = snippet
    .split('\n')
    .find((line) => line.startsWith('- Run [') && line.includes(`[${CANCELLED_RUN_ID}]`));
  expect(qualificationPointer).toBeUndefined();
});

test('evidence-bind: a cancelled-only history refuses the candidate', async () => {
  const fixtures = baseFixtures({
    runs: [rawRun({ id: CANCELLED_RUN_ID, conclusion: 'cancelled' })],
  });
  const { verdict, document } = await collect(fixtures);
  expect(verdict.qualified).toEqual(false);
  expect(verdict.refusals.join('\n')).toContain('satisfies the qualification contract');
  expect(verdict.refusals.join('\n')).toContain('cancelled');
  expect(renderChecklist(document, verdict)).toContain('**NOT QUALIFIED**');
});

test('evidence-bind: a run bound to another SHA refuses instead of being reused', async () => {
  const fixtures = baseFixtures({ runs: [rawRun({ id: 1, head_sha: OTHER_SHA })] });
  const { verdict } = await collect(fixtures);
  expect(verdict.qualified).toEqual(false);
  expect(verdict.refusals.join('\n')).toContain('is bound to');
  expect(verdict.refusals.join('\n')).toContain('not the candidate');
});

test('evidence-bind: any non-success required job instance refuses', async () => {
  const jobs = QUALIFICATION_JOBS.map((entry) =>
    entry.name === 'e2e-full (fixture-gates)' ? { ...entry, conclusion: 'failure' } : entry,
  );
  const fixtures = baseFixtures({
    jobs: { [String(QUALIFICATION_RUN_ID)]: { total_count: 13, jobs } },
  });
  const { verdict } = await collect(fixtures);
  expect(verdict.qualified).toEqual(false);
  expect(verdict.refusals.join('\n')).toContain('e2e-full (fixture-gates) concluded failure');
});

test('evidence-bind: a missing required instance and a partial listing both refuse', async () => {
  const missing = QUALIFICATION_JOBS.filter((entry) => entry.name !== 'node-serve-smoke (26)');
  const { verdict } = await collect(
    baseFixtures({
      jobs: { [String(QUALIFICATION_RUN_ID)]: { total_count: 12, jobs: missing } },
    }),
  );
  expect(verdict.qualified).toEqual(false);
  expect(verdict.refusals.join('\n')).toContain(
    'required CI job node-serve-smoke has 1 instance(s), contract expects 2',
  );

  const { verdict: partial } = await collect(
    baseFixtures({
      jobs: { [String(QUALIFICATION_RUN_ID)]: { total_count: 13, jobs: missing } },
    }),
  );
  expect(partial.refusals.join('\n')).toContain('is incomplete (12/13)');
});

test('evidence-bind: an unknown CI job refuses until the contract is updated', async () => {
  const jobs = [...QUALIFICATION_JOBS, job('new-lane')];
  const { verdict } = await collect(
    baseFixtures({ jobs: { [String(QUALIFICATION_RUN_ID)]: { total_count: 14, jobs } } }),
  );
  expect(verdict.qualified).toEqual(false);
  expect(verdict.refusals.join('\n')).toContain('new-lane');
});

test('evidence-bind: a CodeQL answer for the wrong ref refuses', async () => {
  const fixtures = baseFixtures({ codeql: { ref: 'refs/heads/main', alerts: [] } });
  const { verdict } = await collect(fixtures);
  expect(verdict.qualified).toEqual(false);
  expect(verdict.refusals.join('\n')).toMatch(/CodeQL answer is for refs\/heads\/main/);
});

test('evidence-bind: open alerts are recorded as notes, never as a silent zero', async () => {
  const { document, verdict } = await collect(baseFixtures());
  expect(verdict.notes.join('\n')).toContain('#4238 (medium, js/bad-code-sanitization)');
  expect(verdict.notes.join('\n')).toContain('#4241 (warning, js/trivial-conditional)');
  const snippet = renderChecklist(document, verdict);
  expect(snippet).toContain('bad-code-sanitization');
  expect(snippet).toContain('disposition for each is required (REL-02)');
});

test('evidence-bind: a tag pointing at another SHA refuses', async () => {
  const fixtures = baseFixtures({ tags: { 'v1.0.0-alpha.15': OTHER_SHA } });
  const { verdict } = await collect(fixtures);
  expect(verdict.qualified).toEqual(false);
  expect(verdict.refusals.join('\n')).toContain('points at');
});

test('evidence-bind: an unqueried dimension is a loud skip, never a silent pass', async () => {
  const fixtures = baseFixtures();
  delete fixtures.distTags;
  const { verdict, document } = await collect(fixtures);
  expect(verdict.qualified).toEqual(false);
  expect(verdict.skips.join('\n')).toMatch(/fixture-missing: distTags/);
  expect(renderChecklist(document, verdict)).toContain('SKIP (not evidence of passing)');
});

test('evidence-bind: offline dist-tags skip loudly and cannot qualify', async () => {
  const fixtures = baseFixtures({
    distTags: { '@openelement/router': { error: 'ENOTFOUND registry.npmjs.org' } },
  });
  const { verdict } = await collect(fixtures);
  expect(verdict.qualified).toEqual(false);
  expect(verdict.skips.join('\n')).toContain('offline');
});

test('evidence-bind: check mode refuses a recorded cancelled run as qualification', async () => {
  const { document } = await collect(baseFixtures());
  const doctored = { ...document, ci: { ...document.ci, qualificationRunId: CANCELLED_RUN_ID } };
  const verdict = evaluateDocument(doctored, SHA);
  expect(verdict.qualified).toEqual(false);
  expect(verdict.refusals.join('\n')).toContain('cancelled');
});

test('evidence-bind: check mode refuses a SHA mismatch against the expected candidate', async () => {
  const { document } = await collect(baseFixtures());
  const verdict = evaluateDocument(document, OTHER_SHA);
  expect(verdict.qualified).toEqual(false);
  expect(verdict.refusals.join('\n')).toContain('not the expected candidate');
});

test('evidence-bind: check mode refuses a job instance that turned non-success', async () => {
  const { document } = await collect(baseFixtures());
  const doctored = {
    ...document,
    ci: {
      ...document.ci,
      jobs: document.ci.jobs.map((entry) =>
        entry.name === 'test' ? { ...entry, conclusion: 'timed_out' } : entry,
      ),
    },
  };
  const verdict = evaluateDocument(doctored, SHA);
  expect(verdict.qualified).toEqual(false);
  expect(verdict.refusals.join('\n')).toContain('required CI job test concluded timed_out');
});

test('evidence-bind: the checklist carries every required job ID and instance count', async () => {
  const { document, verdict } = await collect(baseFixtures());
  const snippet = renderChecklist(document, verdict);
  const required: [string, string][] = [
    ['lint', '1/1'],
    ['test', '1/1'],
    ['e2e', '1/1'],
    ['pack', '1/1'],
    ['e2e-full', '2/2'],
    ['bfcache', '1/1'],
    ['node-serve-smoke', '2/2'],
    ['packed-consumer-matrix', '2/2'],
    ['fresh-install', '1/1'],
  ];
  for (const [id, count] of required) {
    const expected = '\u0060' + id + '\u0060 (' + count + ')';
    expect(snippet).toContain(expected);
  }
  expect(snippet).toContain('none (listing total: 0)');
});

test('evidence-bind: job instance labels are split from the base job ID', () => {
  expect(jobBaseId('e2e-full (site-e2e)')).toEqual('e2e-full');
  expect(jobBaseId('node-serve-smoke (24)')).toEqual('node-serve-smoke');
  expect(jobBaseId('lint')).toEqual('lint');
});

test('evidence-bind: argument parsing accepts the evidence flags and rejects unknown ones', () => {
  const parsed = parseArgs(['--sha', SHA, '--pr', '1611', '--fixtures', '/tmp/f.json', '--json']);
  expect(parsed.sha).toEqual(SHA);
  expect(parsed.pullRequest).toEqual(1611);
  expect(parsed.fixtures).toEqual('/tmp/f.json');
  expect(parsed.json).toEqual(true);
  expect(() => parseArgs(['--nope'])).toThrow(/unknown argument/);
});
