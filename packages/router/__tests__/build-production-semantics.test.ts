/**
 * KR-15 (known-reds, Release P0 Gate): the CLI build must pin production
 * semantics so an ambient non-production NODE_ENV cannot silently yield a
 * development-semantics SSR bundle.
 *
 * Vite decides `import.meta.env.PROD` from `process.env.NODE_ENV`, not from
 * `mode`. Before the fix, a build launched from a test runner
 * (`NODE_ENV=test`) emitted `PROD=false`; the production error channel then
 * stopped scrubbing and SSG 500 documents fell back to stack traces
 * (known-reds-ledger KR-15, reproduced 2026-10-12).
 *
 * The proof runs two REAL Vite library builds of the same entry under
 * `NODE_ENV=test`: the raw `viteBuild()` control must inline `PROD=false`
 * (proving the hazard exists), and `buildApp()` must inline `PROD=true`
 * (proving the CLI build pins production) while restoring the caller's
 * ambient NODE_ENV afterwards.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { build as viteBuild, type InlineConfig } from 'vite';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { buildApp } from '../src/vite/index.ts';

const ENTRY = [
  'globalThis.__oeMarker = {',
  '  prod: import.meta.env.PROD,',
  '  dev: import.meta.env.DEV,',
  '  mode: import.meta.env.MODE,',
  '};',
  '',
].join('\n');

let scratch: string;
let ambient: string | undefined;

function buildConfig(outDir: string): InlineConfig {
  return {
    configFile: false,
    logLevel: 'silent',
    build: {
      outDir,
      emptyOutDir: true,
      write: true,
      minify: false,
      lib: {
        entry: join(scratch, 'entry.ts'),
        formats: ['es'],
        fileName: () => 'entry.js',
      },
    },
  };
}

async function builtEntry(outDir: string): Promise<string> {
  return await readFile(join(outDir, 'entry.js'), 'utf8');
}

async function buildOnce(
  runner: (config: InlineConfig) => Promise<unknown>,
  outDir: string,
): Promise<string> {
  await runner(buildConfig(outDir));
  return await builtEntry(outDir);
}

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'oe-kr15-'));
  await writeFile(join(scratch, 'entry.ts'), ENTRY, 'utf8');
  ambient = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
});

afterEach(async () => {
  if (ambient === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ambient;
  await rm(scratch, { recursive: true, force: true });
});

describe('KR-15 production semantics pin', () => {
  test('control: raw viteBuild under NODE_ENV=test emits PROD=false', async () => {
    const output = await buildOnce(viteBuild, join(scratch, 'control'));
    expect(output).toMatch(/prod:\s*false/);
    expect(output).toMatch(/dev:\s*true/);
    // `mode` is already production by default — Vite's PROD/DEV flip comes
    // from the ambient NODE_ENV, which is exactly why pinning NODE_ENV (not
    // just mode) is the fix.
    expect(output).toMatch(/mode:\s*"production"/);
  });

  test('buildApp: NODE_ENV=test still emits PROD=true, then restores ambient', async () => {
    const output = await buildOnce(buildApp, join(scratch, 'pinned'));
    expect(output).toMatch(/prod:\s*true/);
    expect(output).toMatch(/dev:\s*false/);
    expect(output).toMatch(/mode:\s*"production"/);
    expect(process.env.NODE_ENV).toBe('test');
  });
});
