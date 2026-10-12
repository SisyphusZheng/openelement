/**
 * N-2 SSR inline-CSS defects — consumer form through the real Router build
 * entry (SSG route output; `packages/router/src/cli/build.ts`).
 *
 * Two defects in the SSR style half of the alpha15 style-asset protocol:
 *
 *   N-2A — the SSR rule parser truncates at a `}` inside a CSS string
 *   (`ShimStyleSheet.parseRules`, raw brace counting with no string/comment
 *   state). A URL-less author sheet whose bytes contain
 *   `.a::before { content: "}" }` reaches the document as malformed inline
 *   CSS. The serializer's only inline channel is the marked
 *   `<style data-oe-static-styles>` text the parser feeds (ADR-0164 S-C2/S-10:
 *   "SSR serializes its rules verbatim"), so a truncation is a corrupted
 *   document, not a cosmetic difference.
 *
 *   N-2B — the SSR global `CSSStyleSheet` stub (`ssr-polyfills.ts`) drops
 *   every sheet: `replaceSync` is a no-op and `cssRules` always returns [].
 *   A URL-less author sheet constructed through the global (the constructor
 *   the browser semantics of the S-10 contract name) contributes nothing to
 *   the server-rendered document — a silent style loss, where the contract
 *   promises verbatim rules and "never a silent drop".
 *
 * Why a legacy (pre-#1558) artifact package: today's compiled grammar admits
 * one style form (`.css` imports in `static styles`, OEC9029) and no runtime
 * top-level statements (OEC9008), so an in-memory sheet cannot be authored in
 * a compiled module. The artifact recovery explicitly keeps pre-#1558
 * inline-sheet modules working ("artifacts compiled before #1558 (legacy
 * inline sheets that referenced a `StyleSheet` built in a plain module)
 * therefore keep riding the old path unchanged",
 * packages/compiler/src/internal/compiler/compiled-artifact-style-requests.ts).
 * This suite builds such a package the way a consumer build sees it: through
 * `compileElementModule`'s own artifact emission, with the legacy styles
 * member restored, consumed by the real CLI build.
 *
 * Recorded on the pre-fix revision (4edf71be3): N-2A renders the truncated
 * rule `oe-n2-a p::before { content: "}` (the closing brace and the second
 * rule's prefix are re-attached to the wrong boundary); N-2B renders no style
 * node at all. The literal module-top-level spelling of N-2B
 * (`const s = new CSSStyleSheet()` in a statically imported module) fails
 * LOUDLY today — `ReferenceError: CSSStyleSheet is not defined`, because the
 * polyfill installs the global in the entry body, after module evaluation —
 * so the reachable silent-loss shape (construction at render time through the
 * same global) is the one pinned here.
 */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { compileElementModule } from '@openelement/compiler';

const REPO_ROOT = join(import.meta.dirname!, '..', '..', '..');
const ROUTER_BUILD_CLI = join(REPO_ROOT, 'packages', 'router', 'src', 'cli', 'build.ts');

/** N-2A's sheet: a `}` inside a string, then a second rule (one rule/line). */
const N2A_CSS = 'oe-n2-a p::before { content: "}" }\noe-n2-a p { color: rgb(1, 2, 3); }\n';
/** N-2B's sheet: ordinary bytes; loss is the defect, not the content. */
const N2B_CSS = 'oe-n2-b p { color: rgb(4, 5, 6); }\n';

const N2A_PAGE_TEXT = 'n2a legacy page';
const N2B_PAGE_TEXT = 'n2b lazy page';

const fixtureRoots: string[] = [];

async function write(joinPath: string, content: string): Promise<void> {
  await mkdir(joinPath.slice(0, joinPath.lastIndexOf('/')), { recursive: true });
  await writeFile(joinPath, content, 'utf8');
}

/**
 * A compiled page artifact for one legacy package: real `compileElementModule`
 * emission with the packer's type strips applied and the legacy in-memory
 * styles member restored (the pre-#1558 shape the artifact path documents).
 */
function legacyArtifactPage(options: {
  pkgDir: string;
  tag: string;
  className: string;
  text: string;
  stylesMember: string;
}): string {
  const source = [
    "import { element, OpenElement } from '@openelement/element';",
    '',
    `@element('${options.tag}', { root: 'shadow-open' })`,
    `export default class ${options.className} extends OpenElement {`,
    '  render() {',
    `    return <p>${options.text}</p>;`,
    '  }',
    '}',
    '',
  ].join('\n');
  const compiled = compileElementModule(source, join(options.pkgDir, 'index.tsx'), {});
  if (compiled === null) throw new Error(`${options.tag} did not compile to an artifact`);
  const artifact = compiled.code
    .replaceAll('static __partProgram: typeof __partProgram =', 'static __partProgram =')
    .replaceAll(
      'static __compiledProperties: typeof __compiledProperties =',
      'static __compiledProperties =',
    )
    .replaceAll(
      'static __elementMetadata: typeof __elementMetadata =',
      'static __elementMetadata =',
    )
    .replaceAll('static props: typeof __compiledProps =', 'static props =')
    .replaceAll(
      'static observedAttributes: typeof __observedAttributes =',
      'static observedAttributes =',
    )
    .replaceAll('const __observedAttributes: string[] =', 'const __observedAttributes =')
    .replaceAll('render(): never {', 'render() {')
    .replace(/\/\/# sourceMappingURL=.*$/m, '');
  return artifact.replace(
    '  static observedAttributes = __observedAttributes;',
    '  static observedAttributes = __observedAttributes;\n' + options.stylesMember,
  );
}

async function writeLegacyPackage(
  appDir: string,
  pkgName: string,
  files: { 'index.js': string; 'sheet.js'?: string },
): Promise<void> {
  const pkgDir = join(appDir, 'node_modules', '@acme', pkgName);
  await write(
    join(pkgDir, 'package.json'),
    JSON.stringify({ name: `@acme/${pkgName}`, private: true, type: 'module', main: './index.js' }),
  );
  for (const [name, content] of Object.entries(files)) {
    await write(join(pkgDir, name), content);
  }
}

async function buildFixture(): Promise<string> {
  const created = await mkdtemp(join(tmpdir(), 'oe-n2-ssr-css-'));
  const root = await realpath(created);
  fixtureRoots.push(created);
  const appDir = join(root, 'app');

  await write(
    join(appDir, 'package.json'),
    JSON.stringify({ name: 'oe-n2-ssr-css-proof', private: true, type: 'module' }),
  );
  await write(
    join(appDir, 'vite.config.ts'),
    [
      "import { openElement } from '@openelement/router/vite';",
      "import { defineConfig } from 'vite';",
      '',
      'export default defineConfig({ plugins: [openElement()] });',
      '',
    ].join('\n'),
  );

  // N-2A: the sheet is built at module top level by element's cross-realm
  // `StyleSheet` (the SSR shim) and arrayed in the legacy styles member.
  await writeLegacyPackage(appDir, 'oe-n2-legacy-a', {
    'index.js': [
      "import sheet from './sheet.js';",
      '',
      legacyArtifactPage({
        pkgDir: join(appDir, 'node_modules', '@acme', 'oe-n2-legacy-a'),
        tag: 'oe-n2-a',
        className: 'OeN2APage',
        text: N2A_PAGE_TEXT,
        stylesMember: '  static styles = [sheet];',
      }),
      '',
    ].join('\n'),
    'sheet.js': [
      "import { StyleSheet } from '@openelement/element';",
      '',
      'const sheet = new StyleSheet();',
      `sheet.replaceSync(${JSON.stringify(N2A_CSS)});`,
      'export default sheet;',
      '',
    ].join('\n'),
  });

  // N-2B: the sheet is constructed through the global `CSSStyleSheet` — the
  // constructor the SSR stub owns. Construction at render time (the members
  // accessor) is the shape that reaches the installed global; the compiled
  // grammar rejects runtime top-level statements (OEC9008), and a top-level
  // construction in an artifact fails loudly before the polyfill installs.
  await writeLegacyPackage(appDir, 'oe-n2-legacy-b', {
    'index.js': [
      legacyArtifactPage({
        pkgDir: join(appDir, 'node_modules', '@acme', 'oe-n2-legacy-b'),
        tag: 'oe-n2-b',
        className: 'OeN2BPage',
        text: N2B_PAGE_TEXT,
        stylesMember: [
          '  static get styles() {',
          '    const sheet = new CSSStyleSheet();',
          `    sheet.replaceSync(${JSON.stringify(N2B_CSS)});`,
          '    return [sheet];',
          '  }',
        ].join('\n'),
      }),
      '',
    ].join('\n'),
  });

  await write(
    join(appDir, 'app', 'routes', 'index.tsx'),
    [
      "import { definePage } from '@openelement/router';",
      "import LegacyAPage from '@acme/oe-n2-legacy-a';",
      '',
      "export default definePage(LegacyAPage, { renderIntent: { mode: 'static' } });",
      '',
    ].join('\n'),
  );
  await write(
    join(appDir, 'app', 'routes', 'defect-b.tsx'),
    [
      "import { definePage } from '@openelement/router';",
      "import LegacyBPage from '@acme/oe-n2-legacy-b';",
      '',
      "export default definePage(LegacyBPage, { renderIntent: { mode: 'static' } });",
      '',
    ].join('\n'),
  );

  // pnpm-style symlinks to the workspace packages (the layout a consumer has).
  await mkdir(join(appDir, 'node_modules', '@openelement'), { recursive: true });
  await symlink(
    join(REPO_ROOT, 'packages', 'router'),
    join(appDir, 'node_modules', '@openelement', 'router'),
  );
  await symlink(
    join(REPO_ROOT, 'packages', 'element'),
    join(appDir, 'node_modules', '@openelement', 'element'),
  );
  await symlink(join(REPO_ROOT, 'node_modules', 'vite'), join(appDir, 'node_modules', 'vite'));
  await symlink(
    join(REPO_ROOT, 'packages', 'router', 'node_modules', 'hono'),
    join(appDir, 'node_modules', 'hono'),
  );
  return appDir;
}

let appDir: string;
let buildLogs = '';

beforeAll(async () => {
  appDir = await buildFixture();
  const build = spawn(process.execPath, [ROUTER_BUILD_CLI], { cwd: appDir });
  build.stdout.on('data', (chunk) => (buildLogs += chunk));
  build.stderr.on('data', (chunk) => (buildLogs += chunk));
  const code = await new Promise<number>((resolve) => build.on('exit', (c) => resolve(c ?? -1)));
  expect(code, `N-2 fixture build failed:\n${buildLogs}`).toEqual(0);
  if (process.env.OE_KEEP_FIXTURE) console.log(`[fixture] ${appDir}`);
}, 240_000);

afterAll(async () => {
  if (process.env.OE_KEEP_FIXTURE) return;
  for (const root of fixtureRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

/** The marked inline text node's content, or undefined when none was emitted. */
function inlineStyleText(html: string): string | undefined {
  return /<style data-oe-static-styles>([\s\S]*?)<\/style>/.exec(html)?.[1];
}

test('N-2A: a `}` inside a CSS string does not truncate the inline SSR rule text', async () => {
  const html = await readFile(join(appDir, 'dist', 'index.html'), 'utf8');
  expect(html, 'the page rendered (non-vacuous)').toContain(N2A_PAGE_TEXT);
  const css = inlineStyleText(html);
  expect(css, 'the URL-less author sheet rides the inline channel').toBeDefined();
  expect(
    css,
    'the author CSS bytes reach the document verbatim — a `}` inside a string ' +
      'is content, never a rule boundary',
  ).toBe(N2A_CSS);
});

test('N-2B: a sheet constructed through the SSR CSSStyleSheet global keeps its rules', async () => {
  const html = await readFile(join(appDir, 'dist', 'defect-b', 'index.html'), 'utf8');
  expect(html, 'the page rendered (non-vacuous)').toContain(N2B_PAGE_TEXT);
  const css = inlineStyleText(html);
  expect(css, 'the URL-less author sheet must serialize verbatim, never be silently dropped').toBe(
    N2B_CSS,
  );
});
