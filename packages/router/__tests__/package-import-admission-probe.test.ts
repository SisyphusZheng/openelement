/**
 * @openelement/router — admission coverage for an ORDINARY package import
 * (ADR-0167 §3 / the admission-delivery support table).
 *
 * `packageIslands` is the admission channel for a component package: it admits
 * the package's declarations AND derives the SSR externalization list.
 * ADR-0167 §3 additionally claimed that "ordinary package imports and nested
 * components all ride the same admission … for a component the application
 * imports directly, when the client build's resolver-driven discovery walks
 * it". This suite decides that claim on two REAL builds of the same app, one
 * config key apart, and pins the diagnostic that replaced the silence.
 *
 * Set OE_KEEP_FIXTURE=1 to keep the temp apps for inspection.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, test } from 'vitest';

const REPO_ROOT = join(import.meta.dirname!, '..', '..', '..');
const ROUTER_BUILD_CLI = join(REPO_ROOT, 'packages', 'router', 'src', 'cli', 'build.ts');

const fixtureRoots: string[] = [];

afterAll(async () => {
  if (process.env.OE_KEEP_FIXTURE) return;
  for (const root of fixtureRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function write(joinedPath: string, content: string): Promise<void> {
  await mkdir(joinedPath.slice(0, joinedPath.lastIndexOf('/')), { recursive: true });
  await writeFile(joinedPath, content, 'utf8');
}

/** One app, written twice: with and without the admission key. */
async function writeProbeApp(admitted: boolean): Promise<string> {
  const created = await mkdtemp(join(tmpdir(), 'oe-package-import-probe-'));
  const root = await realpath(created);
  fixtureRoots.push(created);
  const appDir = join(root, 'app');

  await write(
    join(appDir, 'package.json'),
    JSON.stringify({
      name: admitted ? 'oe-package-import-admitted' : 'oe-package-import-probe',
      private: true,
      type: 'module',
      dependencies: { '@openelement/ui': 'workspace:*' },
    }),
  );
  await write(
    join(appDir, 'vite.config.ts'),
    [
      "import { openElement } from '@openelement/router/vite';",
      "import { defineConfig } from 'vite';",
      '',
      "export default defineConfig({ base: '/', plugins: [openElement()] });",
      '',
    ].join('\n'),
  );
  await write(
    join(appDir, 'openelement.config.ts'),
    [
      "import { defineConfig } from '@openelement/router';",
      '',
      admitted
        ? "export default defineConfig({ packageIslands: ['@openelement/ui'] });"
        : '// The package is reached by an ordinary import only: no `packageIslands`.',
      admitted ? '' : 'export default defineConfig({});',
      '',
    ]
      .filter((line) => line !== '')
      .join('\n'),
  );
  await write(
    join(appDir, 'app', 'components', 'import-probe-page.tsx'),
    [
      "import { element, OpenElement } from '@openelement/element';",
      "import '@openelement/ui/open-button';",
      '',
      "@element('import-probe-page', { root: 'shadow-open' })",
      'export default class ImportProbePage extends OpenElement {',
      '  render() {',
      "    return <main><open-button variant='primary'>probe</open-button></main>;",
      '  }',
      '}',
      '',
    ].join('\n'),
  );
  await write(
    join(appDir, 'app', 'routes', 'index.tsx'),
    [
      "import { definePage } from '@openelement/router';",
      "import ImportProbePage from '../components/import-probe-page.tsx';",
      '',
      "export default definePage(ImportProbePage, { head: { title: 'package import probe' } });",
      '',
    ].join('\n'),
  );

  await mkdir(join(appDir, 'node_modules', '@openelement'), { recursive: true });
  for (const name of ['router', 'element', 'ui']) {
    await symlink(
      join(REPO_ROOT, 'packages', name),
      join(appDir, 'node_modules', '@openelement', name),
    );
  }
  await symlink(join(REPO_ROOT, 'node_modules', 'vite'), join(appDir, 'node_modules', 'vite'));
  await symlink(
    join(REPO_ROOT, 'packages', 'router', 'node_modules', 'hono'),
    join(appDir, 'node_modules', 'hono'),
  );
  await symlink(
    join(REPO_ROOT, 'node_modules', 'tailwindcss'),
    join(appDir, 'node_modules', 'tailwindcss'),
  );
  return appDir;
}

/** Build one probe app; returns the app dir plus the build's own output. */
async function buildProbeApp(
  admitted: boolean,
): Promise<{ appDir: string; logs: string; code: number }> {
  const appDir = await writeProbeApp(admitted);
  const build = spawn(process.execPath, [ROUTER_BUILD_CLI], { cwd: appDir });
  let logs = '';
  build.stdout.on('data', (chunk) => (logs += chunk));
  build.stderr.on('data', (chunk) => (logs += chunk));
  const code = await new Promise<number>((resolve) => build.on('exit', (c) => resolve(c ?? -1)));
  if (process.env.OE_KEEP_FIXTURE) console.log(`[fixture] ${appDir}`);
  return { appDir, logs, code };
}

test('an ordinary package import does NOT deliver a component — and never silently', async () => {
  const { appDir, logs, code } = await buildProbeApp(false);
  // The build itself is legal: importing a package module is not an error.
  expect(code, `the ordinary-import probe build failed:\n${logs}`).toEqual(0);

  const html = await readFile(join(appDir, 'dist', 'index.html'), 'utf8');
  // The app's own shell renders its DSD…
  expect(html, 'the application page still renders').toContain('shadowrootmode="open"');
  // …and the package's component does NOT: it stays an unknown element, with no
  // declarative shadow root and no stylesheet link. This is exactly the
  // delivery the ADR-0167 §3 sentence claimed ordinary imports also rode.
  expect(html, 'the tag stays the raw element').toContain('<open-button');
  expect(
    html.includes('<open-button><template shadowrootmode'),
    'an unadmitted package component must not render a shadow root',
  ).toEqual(false);
  expect(html, 'no style link is declared for it').not.toMatch(
    /<link rel="stylesheet" href="[^"]+" data-oe-static-styles/,
  );

  // The discovery pass still found the package's authored sheet and emitted it
  // — which is what made the degradation hard to see: an asset exists, nothing
  // links it, and the migrated utilities have no sheet at all.
  const assetsDir = join(appDir, 'dist', 'client', 'assets');
  const cssFiles = existsSync(assetsDir)
    ? (await readdir(assetsDir)).filter((name) => name.endsWith('.css'))
    : [];
  expect(cssFiles.length, 'the authored sheet still travels the asset protocol').toBeGreaterThan(0);

  // The diagnostic that replaced the silence, naming both the package and fix.
  expect(logs, 'the build must report the gap').toContain(
    'is imported by this app but not admitted',
  );
  expect(logs, 'the diagnostic names the package').toContain('@openelement/ui');
  expect(logs, 'the diagnostic names the fix').toContain('packageIslands');
}, 240_000);

test('admitting the package delivers the component: DSD and its stylesheet link', async () => {
  // The other side of the boundary: the same app plus one config key, measured
  // on the same build path. This is what `packageIslands` buys.
  const { appDir, logs, code } = await buildProbeApp(true);
  expect(code, `the admitted probe build failed:\n${logs}`).toEqual(0);

  const html = await readFile(join(appDir, 'dist', 'index.html'), 'utf8');
  expect(html, 'the admitted component renders its declarative shadow root').toMatch(
    /<open-button[\s\S]*?<template shadowrootmode="open"/,
  );
  expect(html, 'the admitted component declares its stylesheet link').toMatch(
    /<link rel="stylesheet" href="[^"]+" data-oe-static-styles/,
  );
  expect(logs, 'an admitted package has nothing to report').not.toContain(
    'is imported by this app but not admitted',
  );
}, 240_000);
