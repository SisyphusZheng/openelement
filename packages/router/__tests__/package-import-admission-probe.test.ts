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
 * The diagnostic keys off PACKAGE IDENTITY, never off "the path is inside the
 * project root": a dependency installed under the app's own `node_modules/` is
 * a dependency (the ordinary install layout), and the same package reached
 * through a workspace link must be reported the same way. Both layouts are
 * built here, plus the pnpm store layout and a real tarball install, so a
 * regression to a path test fails on the ordinary layout immediately.
 *
 * Set OE_KEEP_FIXTURE=1 to keep the temp apps for inspection.
 */
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
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

/** How a dependency reaches the app's resolution: the four layouts that matter. */
type InstallLayout = 'symlink' | 'copy' | 'pnpm' | 'tarball';

/**
 * Install `@openelement/ui` into `appDir` in one real layout. All four land the
 * package's own `package.json` (its real identity) in the graph; they differ
 * only in the path the resolver reports, which is exactly the axis the
 * diagnostic must not care about.
 */
async function installUi(appDir: string, layout: InstallLayout): Promise<void> {
  const source = join(REPO_ROOT, 'packages', 'ui');
  const scoped = join(appDir, 'node_modules', '@openelement');
  mkdirSync(scoped, { recursive: true });
  const dest = join(scoped, 'ui');
  if (layout === 'symlink') {
    await symlink(source, dest);
    return;
  }
  if (layout === 'copy') {
    cpSync(source, dest, { recursive: true });
    return;
  }
  if (layout === 'pnpm') {
    // The pnpm store shape: `.pnpm/<name>@<version>/node_modules/<name>` with
    // the inner directory being the real package and the outer one the
    // resolver's path.
    const store = join(
      appDir,
      'node_modules',
      '.pnpm',
      '@openelement+ui@1.0.0-alpha.14',
      'node_modules',
      '@openelement',
      'ui',
    );
    mkdirSync(store, { recursive: true });
    cpSync(source, store, { recursive: true });
    await symlink(store, dest);
    return;
  }
  // tarball: really pack the package and unpack it, so the installed tree is
  // the published member list rather than the working directory.
  const staging = await mkdtemp(join(tmpdir(), 'oe-ui-pack-'));
  try {
    execFileSync('npm', ['pack', '--pack-destination', staging, '--silent'], {
      cwd: source,
      stdio: 'pipe',
    });
    const tarball = (await readdir(staging)).find((name) => name.endsWith('.tgz'));
    if (tarball === undefined) throw new Error('npm pack produced no tarball');
    mkdirSync(dest, { recursive: true });
    execFileSync('tar', ['xzf', join(staging, tarball), '--strip-components=1', '-C', dest], {
      stdio: 'pipe',
    });
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** One app, written twice: with and without the admission key. */
async function writeProbeApp(admitted: boolean, layout: InstallLayout): Promise<string> {
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
  for (const name of ['router', 'element']) {
    await symlink(
      join(REPO_ROOT, 'packages', name),
      join(appDir, 'node_modules', '@openelement', name),
    );
  }
  await installUi(appDir, layout);
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
  layout: InstallLayout = 'symlink',
): Promise<{ appDir: string; logs: string; code: number }> {
  const appDir = await writeProbeApp(admitted, layout);
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

test('the diagnostic keys off package identity, not the path: every install layout reports', async () => {
  // The layouts a real consumer produces. The ordinary `node_modules` install
  // and the pnpm store layout both sit INSIDE the project root, so a path test
  // ("skip everything under root") silently lost the report exactly where it
  // matters most; a workspace link sits outside the root and used to be the
  // only layout that reported.
  for (const layout of ['copy', 'pnpm', 'tarball'] as const) {
    const { logs, code } = await buildProbeApp(false, layout);
    expect(code, `${layout}: build failed:\n${logs}`).toEqual(0);
    expect(logs, `${layout}: the unadmitted package must be reported`).toContain(
      'The component package "@openelement/ui" is imported by this app but not admitted',
    );
  }
}, 600_000);

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
