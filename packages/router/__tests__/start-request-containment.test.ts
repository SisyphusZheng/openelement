/**
 * Hostile containment test for the standard fetch handler.
 *
 * `dispatchRequest` may throw or reject; the fetch handler must contain an
 * escaping failure as a 500 response, never an unhandled rejection.
 *
 * It also pins the private `dist/server` boundary (S-01) on the exact entry
 * `serveFetch` runs for `oe start` / `oe start --mode=preview`: the handler
 * never serves the request-time artifacts, and loading the generated entry
 * itself keeps working.
 */

import { expect, test } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFetchHandler,
  importRequestTimeServer,
  type FetchHandlerOptions,
} from '../src/vite/internal/static-serve.ts';

async function assertContained500(
  dispatch: NonNullable<FetchHandlerOptions['dispatch']>,
): Promise<void> {
  const handler = createFetchHandler({
    distDir: '/nonexistent-dist',
    serverMod: null,
    env: {},
    dispatch,
  });
  const response = await handler(new Request('http://127.0.0.1/hostile'));
  expect(response.status).toEqual(500);
  await response.text();
}

test('start: a rejected dispatch is contained as 500', async () => {
  await assertContained500(() => Promise.reject(new Error('hostile escape')));
});

test('start: a synchronously throwing dispatch is contained as 500', async () => {
  await assertContained500(() => {
    throw new Error('hostile synchronous escape');
  });
});

test('start handler: private dist/server is denied before the request-time entry (S-01)', async () => {
  const distDir = await mkdtemp(join(tmpdir(), 'start-private-'));
  try {
    await mkdir(join(distDir, 'server'), { recursive: true });
    await writeFile(join(distDir, 'index.html'), '<h1>home</h1>');
    // The build marks the directory as ESM exactly like this.
    await writeFile(join(distDir, 'server', 'package.json'), '{"type":"module"}\n');
    await writeFile(
      join(distDir, 'server', 'index.js'),
      [
        'export function isRequestTimePath(pathname) { return pathname === "/live"; }',
        'export default async function (event) {',
        '  return new Response(`request-time:${new URL(event.req.url).pathname}`);',
        '}',
        '',
      ].join('\n'),
    );
    const serverMod = await importRequestTimeServer(join(distDir, 'server', 'index.js'));
    const handler = createFetchHandler({ distDir, serverMod, env: {} });

    // The generated entry still loads and still owns its admitted route.
    const live = await handler(new Request('http://127.0.0.1/live'));
    expect(live.status).toEqual(200);
    expect(await live.text()).toEqual('request-time:/live');
    expect((await handler(new Request('http://127.0.0.1/'))).status).toEqual(200);

    for (const pathname of [
      '/server/index.js',
      '/%73erver/index.js',
      '/Server/index.js',
      '/server/',
      '/server/package.json',
    ]) {
      const response = await handler(new Request(`http://127.0.0.1${pathname}`));
      expect(response.status, `GET ${pathname}`).toEqual(404);
      const body = await response.text();
      expect(body, `${pathname} must not leak the server entry`).not.toContain('isRequestTimePath');
      const head = await handler(new Request(`http://127.0.0.1${pathname}`, { method: 'HEAD' }));
      expect(head.status, `HEAD ${pathname}`).toEqual(404);
    }
  } finally {
    await rm(distDir, { recursive: true });
  }
});
