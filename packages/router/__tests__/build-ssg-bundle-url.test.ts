/**
 * Hostile path test for the SSG SSR-bundle dynamic import (issue #1220, M13).
 *
 * build-ssg.ts previously built the bundle's file:// URL by string
 * concatenation, so a project path containing spaces, `#`, `?`, or non-ASCII
 * bytes mis-resolved or crashed the dynamic import. The URL must come from
 * pathToFileURL (the correct usage already present in
 * internal/static-serve.ts).
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { expect, test } from 'vitest';
import { join } from 'node:path';
import { finalizePureStaticOutput, ssrBundleImportUrl } from '../src/cli/build-ssg.ts';

test('build-ssg: SSR bundle import URL survives spaces, #, ? and non-ASCII in the path', async () => {
  const base = await mkdtemp(join(tmpdir(), 'oe-ssg-hostile-'));
  const dir = join(base, 'oe ssg #hostile? é');
  await mkdir(dir);
  try {
    const entryPath = join(dir, 'entry.js');
    await writeFile(entryPath, 'export default 42;');
    // The SUT is node's native dynamic import of the product's file-URL
    // builder. vitest rewrites in-process dynamic imports through its module
    // runner (which mishandles hostile-path URLs), so the probe runs in a
    // clean node subprocess — the same host the build-ssg pipeline imports in.
    const probe = spawnSync(process.execPath, [
      '--input-type=module',
      '--eval',
      `const m = await import(${JSON.stringify(ssrBundleImportUrl(entryPath))}); console.log(m.default);`,
    ]);
    expect(probe.status, `hostile-path import failed:\n${probe.stdout}\n${probe.stderr}`).toEqual(
      0,
    );
    expect(probe.stdout.toString().trim()).toEqual('42');
  } finally {
    await rm(base, { recursive: true });
  }
});

test('build-ssg: SSR bundle import URL is a percent-encoded file URL', () => {
  const url = ssrBundleImportUrl('/tmp/oe ssg #x/entry.js');
  expect(url.startsWith('file://')).toEqual(true);
  expect(url.includes(' '), 'space must be percent-encoded').toEqual(false);
  expect(url.includes('#'), 'fragment marker must be percent-encoded').toEqual(false);
  expect(url).toEqual('file:///tmp/oe%20ssg%20%23x/entry.js');
});

/**
 * #953 finalize contract: a pure-static build's \`dist/server\` is a build-time
 * artifact and must not survive. The previous code called
 * \`rm(...).catch(() => {})\` and logged the removal unconditionally, so a
 * failed removal left server code in the deployable tree while the log claimed
 * it was gone. These tests pin the observable contract and the failure path.
 */
test('build-ssg: a stale dist/server is removed by a pure-static finalize', async () => {
  const base = await mkdtemp(join(tmpdir(), 'oe-ssg-finalize-'));
  const ssrOutDir = join(base, 'dist', 'server');
  await mkdir(ssrOutDir, { recursive: true });
  await writeFile(join(ssrOutDir, 'entry.js'), 'export default 1;');
  const info: string[] = [];
  try {
    expect(existsSync(join(ssrOutDir, 'entry.js'))).toEqual(true);
    const removed = await finalizePureStaticOutput(ssrOutDir, {
      info: (message) => void info.push(message),
    });
    expect(removed).toEqual(true);
    expect(existsSync(ssrOutDir), 'the build-time bundle must be gone').toEqual(false);
    expect(info).toEqual(['Pure-static build: removed build-time SSR bundle (dist/server)']);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('build-ssg: a request-time entry keeps dist/server and is never logged as removed', async () => {
  const base = await mkdtemp(join(tmpdir(), 'oe-ssg-finalize-hybrid-'));
  const ssrOutDir = join(base, 'dist', 'server');
  await mkdir(ssrOutDir, { recursive: true });
  await writeFile(join(ssrOutDir, 'index.js'), 'export default 2;');
  const info: string[] = [];
  try {
    const removed = await finalizePureStaticOutput(ssrOutDir, {
      info: (message) => void info.push(message),
    });
    expect(removed).toEqual(false);
    expect(existsSync(join(ssrOutDir, 'index.js')), 'contract output stays').toEqual(true);
    expect(info).toEqual([]);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('build-ssg: an absent dist/server is nothing-to-remove, never a removal claim', async () => {
  const info: string[] = [];
  const removed = await finalizePureStaticOutput('/tmp/oe-ssg-does-not-exist/dist/server', {
    info: (message) => void info.push(message),
  });
  expect(removed).toEqual(false);
  expect(info).toEqual([]);
});

test('build-ssg: a removal that leaves the directory behind fails the build', async () => {
  const info: string[] = [];
  await expect(
    finalizePureStaticOutput('/dist/server', {
      // The request-time entry is absent; the directory itself is present.
      exists: (path) => !path.endsWith('index.js'),
      remove: () => Promise.reject(new Error('EPERM: operation not permitted')),
      info: (message) => void info.push(message),
    }),
  ).rejects.toThrow(/could not be removed/);
  expect(info, 'no removal may be logged when the directory survives').toEqual([]);
});

test('build-ssg: a removal error that still cleared the directory is not a failure', async () => {
  let present = true;
  const info: string[] = [];
  const removed = await finalizePureStaticOutput('/dist/server', {
    exists: (path) => (path.endsWith('index.js') ? false : present),
    remove: () => {
      present = false;
      return Promise.reject(new Error('ENOTEMPTY (already cleared)'));
    },
    info: (message) => void info.push(message),
  });
  expect(removed).toEqual(true);
  expect(info).toEqual(['Pure-static build: removed build-time SSR bundle (dist/server)']);
});
