/**
 * The Node.js floor (P0): one pure contract, two CLI front doors.
 *
 * The packed manifests declare `engines.node >= 24.2`, but npm engines only
 * warn — and the Router bin entries dispatch on `import.meta.main`, a flag
 * Node added in 24.2.0. On an older host the packed JS would take the
 * `undefined === true` branch and exit 0 having done nothing: a silent success
 * no engine range can prevent from inside the artifact. This suite pins the
 * check that closes it:
 *
 *   1. the version matrix is exact — every line below 24.2 fails closed,
 *      24.2.0 and newer (and only those) pass;
 *   2. the failure is one actionable block (floor, current version, install
 *      hint, docs link) and never a stack trace;
 *   3. the Router copy of the module is byte-identical to this package's
 *      source — the packed packages cannot share a source file outside their
 *      own root, so the parity is machine-checked instead of assumed;
 *   4. every Router bin entry calls the guard at module scope, immediately
 *      before its `import.meta.main` dispatch, and Create's CLI calls it
 *      before any filesystem work, while `--help`/`--version` stay
 *      host-agnostic;
 *   5. and the real entry points, run under a simulated 22.17.0 host, exit 1
 *      with that message instead of succeeding — including the create run,
 *      which must not have written a single scaffold file.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';
import {
  MINIMUM_NODE_VERSION,
  NODE_FLOOR_DOCS_URL,
  UnsupportedNodeError,
  assertSupportedNode,
  enforceNodeFloor,
  nodeFloorProblem,
  parseNodeVersion,
} from '../src/node-version.ts';

const packageDir = join(import.meta.dirname!, '..');
const repoRoot = join(packageDir, '..', '..');
const createCli = join(packageDir, 'src', 'cli.ts');
const canonicalSource = join(packageDir, 'src', 'node-version.ts');
const routerCliDir = join(repoRoot, 'packages', 'router', 'src', 'cli');
const routerEntries = ['cli.ts', 'dev.ts', 'build.ts', 'start.ts'] as const;
/** A real host below the floor: the silent-exit-0 case the guard exists for. */
const OLD_HOST = '22.17.0';

/**
 * Write the simulated-host seam: the CLIs read `process.versions.node`, and
 * `process.versions` is configurable, so the property is replaced before the
 * entry module evaluates. Nothing else about the host changes — this is a
 * version-string simulation, not a second Node.
 */
function writeHostVersionSeam(dir: string, version: string): string {
  const path = join(dir, 'simulate-host-version.mjs');
  writeFileSync(
    path,
    [
      '// Test seam: run the entry under a simulated Node version.',
      "Object.defineProperty(process, 'versions', {",
      `  value: { ...process.versions, node: ${JSON.stringify(version)} },`,
      '  configurable: true,',
      '  enumerable: true,',
      '});',
      '',
    ].join('\n'),
  );
  return pathToFileURL(path).href;
}

test('node floor: the version matrix fails closed below 24.2 and passes above', () => {
  const supported = ['24.2.0', '24.2.1', '24.18.0', '25.0.0', '26.5.0', 'v24.2.0', '24.2'];
  // Every host line the audit named, plus the shapes a version string takes.
  const unsupported = [
    '18.20.4',
    '20.19.0',
    '22.17.0',
    '22.18.0',
    '23.11.1',
    '24.0.0',
    '24.1.0',
    'v22.17.0',
    'not-a-version',
    '',
  ];
  for (const version of supported) {
    expect(nodeFloorProblem(version), `${version} must be supported`).toBeNull();
    expect(parseNodeVersion(version), `${version} must parse`).not.toBeNull();
  }
  for (const version of unsupported) {
    expect(nodeFloorProblem(version), `${version} must fail closed`).not.toBeNull();
  }
  // A prerelease of the floor compares on the numeric triple (documented): it
  // is the same line, and `import.meta.main` is already there.
  expect(nodeFloorProblem('24.2.0-rc.1')).toBeNull();
  // 22.18 carries `import.meta.main` backported, but the supported floor is
  // the declared 24.2 contract — one answer everywhere, not a second window.
  expect(nodeFloorProblem('22.18.0')).not.toBeNull();
});

test('node floor: the failure is one actionable block, never a stack trace', () => {
  const problem = nodeFloorProblem(OLD_HOST)!;
  expect(problem).toContain(MINIMUM_NODE_VERSION);
  expect(problem).toContain(OLD_HOST);
  expect(problem).toContain(NODE_FLOOR_DOCS_URL);
  expect(problem).toContain('Install Node.js');
  expect(problem).toContain('https://nodejs.org/en/download');
  expect(problem.includes('    at '), problem).toBeFalsy();
  expect(
    problem.split('\n').every((line) => line.trim() !== ''),
    problem,
  ).toBeTruthy();
  // An unreadable host version still names what it saw, and still fails.
  expect(nodeFloorProblem('wat')).toContain('wat');
});

test('node floor: assertSupportedNode throws the shared error contract', () => {
  expect(() => assertSupportedNode(OLD_HOST)).toThrowError(UnsupportedNodeError);
  expect(() => assertSupportedNode(MINIMUM_NODE_VERSION)).not.toThrow();
  try {
    assertSupportedNode(OLD_HOST);
    throw new Error('assertSupportedNode must throw on an unsupported host');
  } catch (error) {
    expect(error).toBeInstanceOf(UnsupportedNodeError);
    expect((error as UnsupportedNodeError).version).toEqual(OLD_HOST);
    expect((error as Error).message).toEqual(nodeFloorProblem(OLD_HOST));
  }
});

test('node floor: the bin-entry form reports once and exits non-zero', () => {
  const reports: string[] = [];
  const codes: number[] = [];
  const report = (message: string): void => void reports.push(message);
  const exit = (code: number): void => void codes.push(code);
  enforceNodeFloor(OLD_HOST, report, exit);
  expect(codes).toEqual([1]);
  expect(reports).toHaveLength(1);
  expect(reports[0]).toContain(`Node.js ${MINIMUM_NODE_VERSION} or newer`);
  expect(reports[0]).toContain(OLD_HOST);
  // A supported host is untouched: no report, no exit.
  enforceNodeFloor('24.18.0', report, exit);
  expect(codes).toEqual([1]);
  expect(reports).toHaveLength(1);
});

test('node floor: the Router copy is byte-identical to this package source', () => {
  // A packed package may not import a source file outside its own root, so the
  // two placements are verbatim; this is the drift lock the header names.
  expect(readFileSync(join(routerCliDir, 'node-version.ts'), 'utf8')).toEqual(
    readFileSync(canonicalSource, 'utf8'),
  );
});

test('node floor: both placements answer identically across the whole matrix', async () => {
  // The lock is two-way: the bytes must match AND the behavior must match, so
  // the Router copy is exercised here, not merely compared.
  const canonical = await import('../src/node-version.ts');
  const mirror = await import('../../router/src/cli/node-version.ts');
  expect(mirror.MINIMUM_NODE_VERSION).toEqual(canonical.MINIMUM_NODE_VERSION);
  expect(mirror.NODE_FLOOR_DOCS_URL).toEqual(canonical.NODE_FLOOR_DOCS_URL);
  for (const version of [
    '18.20.4',
    '20.19.0',
    '22.17.0',
    '22.18.0',
    '23.11.1',
    '24.0.0',
    '24.1.0',
    '24.2.0',
    '24.18.0',
    '26.5.0',
    'not-a-version',
  ]) {
    expect(mirror.nodeFloorProblem(version), version).toEqual(canonical.nodeFloorProblem(version));
  }
  // The mirror's own failure path, driven through its injectable io.
  const codes: number[] = [];
  const messages: string[] = [];
  mirror.enforceNodeFloor(
    OLD_HOST,
    (message) => void messages.push(message),
    (code) => void codes.push(code),
  );
  expect(codes).toEqual([1]);
  expect(messages[0]).toContain(`Node.js ${MINIMUM_NODE_VERSION} or newer`);
});

test('node floor: every Router bin entry guards immediately before its dispatch', () => {
  for (const entry of routerEntries) {
    const source = readFileSync(join(routerCliDir, entry), 'utf8');
    expect(source, entry).toContain("import { enforceNodeFloor } from './node-version.ts';");
    const lines = source.split('\n');
    const guards = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.includes('enforceNodeFloor();'));
    expect(guards.length, `${entry} must call the guard exactly once`).toEqual(1);
    const guard = guards[0]!;
    // Module scope: the call starts at column 0, so no function body owns it.
    expect(guard.line, `${entry} guard must be a top-level statement`).toEqual(
      'enforceNodeFloor();',
    );
    const dispatch = lines.findIndex((line) => line.trim() === 'if (import.meta.main) {');
    expect(dispatch, `${entry} must keep its import.meta.main dispatch`).toBeGreaterThan(
      guard.index,
    );
    // Nothing executable sits between the guard and the dispatch: the guard is
    // the last thing that runs before the gate it protects.
    const between = lines
      .slice(guard.index + 1, dispatch)
      .filter((line) => line.trim() !== '' && !line.trim().startsWith('//'));
    expect(between, `${entry} must not run anything between guard and dispatch`).toEqual([]);
  }
});

test('node floor: the Create CLI checks before any filesystem work', () => {
  const source = readFileSync(createCli, 'utf8');
  expect(source).toContain("import { assertSupportedNode } from './node-version.ts';");
  const guard = source.indexOf('assertSupportedNode(process.versions.node)');
  expect(guard).toBeGreaterThan(-1);
  for (const write of ['await mkdir(', 'await writeFile(']) {
    const at = source.indexOf(write);
    expect(at, `create must call ${write}`).toBeGreaterThan(-1);
    expect(guard, `the floor check must precede ${write}`).toBeLessThan(at);
  }
  // Flags are still parsed after the check; the check itself is argument-free
  // work, so no flag can reach the filesystem first.
  expect(guard).toBeLessThan(source.indexOf('parseArgs(argv)'));
});

test('node floor: a simulated Node 22.17 host fails the Router bin closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oe-node-floor-'));
  try {
    const seam = writeHostVersionSeam(dir, OLD_HOST);
    const faked = spawnSync(
      process.execPath,
      ['--import', seam, join(routerCliDir, 'cli.ts'), '--version'],
      { cwd: dir, encoding: 'utf8' },
    );
    const output = `${faked.stdout}${faked.stderr}`;
    // The silent-exit-0 case: `--version` is a path that normally answers 0.
    expect(faked.status, output).toEqual(1);
    expect(output).toContain(`Node.js ${MINIMUM_NODE_VERSION} or newer`);
    expect(output).toContain(OLD_HOST);
    expect(output).toContain(NODE_FLOOR_DOCS_URL);
    expect(faked.stdout.trim(), 'the version path must not have run').toEqual('');
    // Positive control: the same invocation on the real host answers the
    // version and exits 0, so the failure above is the guard, not the command.
    const real = spawnSync(process.execPath, [join(routerCliDir, 'cli.ts'), '--version'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(real.status, real.stderr).toEqual(0);
    expect(real.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);

test('node floor: the Router start entry fails closed on a simulated old host', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oe-node-floor-'));
  try {
    const seam = writeHostVersionSeam(dir, OLD_HOST);
    const entry = join(routerCliDir, 'start.ts');
    const faked = spawnSync(process.execPath, ['--import', seam, entry], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(faked.status, `${faked.stdout}${faked.stderr}`).toEqual(1);
    expect(faked.stderr).toContain(`Node.js ${MINIMUM_NODE_VERSION} or newer`);
    // The same entry on the real host fails its own way (no build output) and
    // never prints the floor message: the guard is not a blanket refusal.
    const real = spawnSync(process.execPath, [entry], { cwd: dir, encoding: 'utf8' });
    expect(`${real.stdout}${real.stderr}`).not.toContain(
      `Node.js ${MINIMUM_NODE_VERSION} or newer`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);

test('node floor: create refuses a simulated old host and writes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oe-node-floor-'));
  try {
    const seam = writeHostVersionSeam(dir, OLD_HOST);
    const faked = spawnSync(
      process.execPath,
      ['--import', seam, createCli, 'floored-app', '--no-install', '--no-git'],
      { cwd: dir, encoding: 'utf8' },
    );
    expect(faked.status, `${faked.stdout}${faked.stderr}`).toEqual(1);
    expect(faked.stderr).toContain(`Node.js ${MINIMUM_NODE_VERSION} or newer`);
    expect(faked.stderr).toContain(OLD_HOST);
    expect(faked.stderr).toContain('Install Node.js');
    expect(faked.stderr.includes('\n    at '), faked.stderr).toBeFalsy();
    // The negative proof that matters: the refusal happens before any write,
    // so an unsupported host cannot leave a half-scaffolded directory behind.
    expect(existsSync(join(dir, 'floored-app')), faked.stderr).toBeFalsy();

    // --help is host-agnostic, and -v must not report a floor failure either
    // (Create has no --version flag today; the skip keeps one addable).
    const help = spawnSync(process.execPath, ['--import', seam, createCli, '--help'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(help.status, help.stderr).toEqual(0);
    expect(help.stdout).toContain('Usage (Alpha):');
    const shortVersion = spawnSync(process.execPath, ['--import', seam, createCli, '-v'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(shortVersion.stderr).not.toContain(`Node.js ${MINIMUM_NODE_VERSION} or newer`);

    // Positive control: the same scaffold on the real host succeeds and lands
    // the project, so the refusal above is the floor and not a broken command.
    const real = spawnSync(process.execPath, [createCli, 'ok-app', '--no-install', '--no-git'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(real.status, real.stderr).toEqual(0);
    expect(existsSync(join(dir, 'ok-app', 'package.json'))).toBeTruthy();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 120_000);
