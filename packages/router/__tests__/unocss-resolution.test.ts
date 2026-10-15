/**
 * @openelement/router — the UnoCSS adapter's RESOLUTION edges (alpha15 stage 2B).
 *
 * The main provider suite pins the behaviour a consumer depends on. This one
 * pins the resolution rules that only show up at the edges of a real project:
 * a theme source that composes other sources, an `@import` the sheet must NOT
 * touch, a cycle, a configuration the engine rejects, and the dev watcher's
 * two decisions (a change that moves nothing, a deletion that must).
 *
 * Every case writes its own temporary fixture inside the probe fixture's tree
 * (the `unocss` install the adapter resolves from) and removes it afterwards.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { expect, test } from 'vitest';
import { PresetErrorCode } from '../src/internal/error-codes.ts';
import {
  createStyleBuildIntegration,
  declaredUnocssConfig,
} from '../src/vite/internal/style-provider.ts';
import { resolveStylePlan, type ResolvedStyleSelection } from '../src/vite/internal/style-plan.ts';

const FIXTURE_ROOT = join(import.meta.dirname!, '../../../tests/fixtures/router-unocss-probe');

/** A scratch directory inside the fixture, unique per test process. */
const SCRATCH = join(FIXTURE_ROOT, `.probe-${process.pid}`);

async function errorCodeOf(run: () => unknown): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

/** One integration over the fixture's own declaration, with a theme override. */
async function withTheme(
  theme: readonly string[],
  sources: Array<[string, string]> = [],
): Promise<{ plan: ResolvedStyleSelection; document: () => Promise<string> }> {
  const declaration = { theme: [...theme] };
  const plan = resolveStylePlan({
    root: FIXTURE_ROOT,
    tailwind: undefined,
    unocss: declaration,
    declarations: [],
  });
  const integration = await createStyleBuildIntegration({
    root: FIXTURE_ROOT,
    plan: plan!,
    unocss: declaration,
    componentSheetCandidates: () => [],
    documentCandidates: () => [],
    sources: () => new Map(),
  });
  return {
    plan: plan!,
    document: async () =>
      await integration.provider.compileDocument!({
        candidates: [],
        sources: sources,
      }),
  };
}

test.afterAll(async () => {
  await rm(SCRATCH, { recursive: true, force: true });
});

/** One integration over the fixture's engine, with no theme override. */
async function integrationForFixture(): Promise<
  Awaited<ReturnType<typeof createStyleBuildIntegration>>
> {
  const declaration = {};
  const plan = resolveStylePlan({
    root: FIXTURE_ROOT,
    tailwind: undefined,
    unocss: declaration,
    declarations: [],
  });
  return await createStyleBuildIntegration({
    root: FIXTURE_ROOT,
    plan: plan!,
    unocss: declaration,
    componentSheetCandidates: () => [],
    documentCandidates: () => [],
    sources: () => new Map(),
  });
}

test('an imported theme source is resolved and inlined depth-first', async () => {
  await mkdir(SCRATCH, { recursive: true });
  await writeFile(join(SCRATCH, 'palette.css'), ':root { --probe-palette: 1; }\n', 'utf8');
  await writeFile(
    join(SCRATCH, 'roles.css'),
    "@import './palette.css';\n:root { --color-primary: var(--probe-palette); }\n",
    'utf8',
  );
  const { document } = await withTheme([`.probe-${process.pid}/roles.css`]);
  const css = await document();
  expect(css, 'the imported file was inlined').toContain('--probe-palette: 1');
  expect(css, 'the importer’s own rule survived').toContain(
    '--color-primary: var(--probe-palette)',
  );
  expect(css, 'the resolution is recorded in the sheet, not silent').toContain(
    "/* @import './palette.css' */",
  );
});

test('a cycle is broken, not followed forever', async () => {
  await mkdir(SCRATCH, { recursive: true });
  await writeFile(join(SCRATCH, 'a.css'), "@import './b.css';\n:root { --probe-a: 1; }\n", 'utf8');
  await writeFile(join(SCRATCH, 'b.css'), "@import './a.css';\n:root { --probe-b: 1; }\n", 'utf8');
  const { document } = await withTheme([`.probe-${process.pid}/a.css`]);
  const css = await document();
  expect(css, 'both files contributed').toContain('--probe-a: 1');
  expect(css, 'both files contributed').toContain('--probe-b: 1');
  expect(css, 'the cycle is reported as a skipped import').toContain(
    '/* circular @import skipped:',
  );
});

test('an @import the browser owns is left exactly as written', async () => {
  await mkdir(SCRATCH, { recursive: true });
  await writeFile(
    join(SCRATCH, 'remote.css'),
    "@import url('https://example.invalid/fonts.css');\n@import '/local-public.css';\n:root { --probe-remote: 1; }\n",
    'utf8',
  );
  const { document } = await withTheme([`.probe-${process.pid}/remote.css`]);
  const css = await document();
  expect(css, 'a scheme URL is not this device’s to resolve').toContain(
    'https://example.invalid/fonts.css',
  );
  expect(css, 'a root-absolute URL is the browser’s').toContain("'/local-public.css'");
});

test('an @import with a layer() condition is inlined INTO that layer', async () => {
  // `@import './child.css' layer(tokens)` is an at-rule with a prelude, not a
  // bare import: dropping the condition would put the child's rules in the
  // wrong cascade layer, and failing to match the statement at all leaves the
  // child out of the sheet entirely — the roles it declares simply vanish.
  await mkdir(SCRATCH, { recursive: true });
  await writeFile(join(SCRATCH, 'layer-child.css'), ':root { --probe-layered: 1; }\n', 'utf8');
  await writeFile(
    join(SCRATCH, 'layer-entry.css'),
    "@import './layer-child.css' layer(tokens);\n:root { --probe-layer-entry: 1; }\n",
    'utf8',
  );
  const { document } = await withTheme([`.probe-${process.pid}/layer-entry.css`]);
  const css = await document();
  expect(css, 'the child was inlined').toContain('--probe-layered: 1');
  expect(css, 'the condition survived as the at-rule it means').toMatch(
    /@layer\s+tokens\s*\{[\s\S]*--probe-layered/,
  );
  // The provenance comment records what was resolved; a live statement would
  // end in a semicolon and would be the browser's to fetch.
  expect(css, 'no live @import statement survives').not.toMatch(
    /@import\s+'\.\/layer-child\.css'\s*;/,
  );
  expect(css, 'the resolution is recorded').toContain("/* @import './layer-child.css' */");
});

test('an @import with supports() and media conditions keeps both', async () => {
  await mkdir(SCRATCH, { recursive: true });
  await writeFile(join(SCRATCH, 'cond-child.css'), ':root { --probe-cond: 1; }\n', 'utf8');
  await writeFile(
    join(SCRATCH, 'cond-entry.css'),
    "@import './cond-child.css' supports(display: grid) screen and (min-width: 40em);\n",
    'utf8',
  );
  const { document } = await withTheme([`.probe-${process.pid}/cond-entry.css`]);
  const css = await document();
  expect(css, 'the child was inlined').toContain('--probe-cond: 1');
  expect(css, 'the media condition survived').toMatch(
    /@media\s+screen and \(min-width: 40em\)\s*\{[\s\S]*--probe-cond/,
  );
  expect(css, 'the supports condition survived').toMatch(
    /@supports\s+\(display: grid\)\s*\{[\s\S]*--probe-cond/,
  );
});

test('an anonymous layer condition is transcribed too', async () => {
  await mkdir(SCRATCH, { recursive: true });
  await writeFile(join(SCRATCH, 'anon-child.css'), ':root { --probe-anon: 1; }\n', 'utf8');
  await writeFile(join(SCRATCH, 'anon-entry.css'), "@import './anon-child.css' layer;\n", 'utf8');
  const { document } = await withTheme([`.probe-${process.pid}/anon-entry.css`]);
  const css = await document();
  expect(css, 'the child was inlined').toContain('--probe-anon: 1');
  expect(css, 'the anonymous layer survived').toMatch(/@layer\s*\{[\s\S]*--probe-anon/);
});

test('a comment is not syntax: @theme and @import inside one are inert', async () => {
  await mkdir(SCRATCH, { recursive: true });
  await writeFile(
    join(SCRATCH, 'commented.css'),
    [
      '/* Tailwind users write @theme { --color-primary: red; } here.',
      "   A commented-out import follows: @import './nowhere.css'; */",
      ':root { --probe-commented: 1; }',
      '/* a trailing comment mentioning @theme again */',
      '',
    ].join('\n'),
    'utf8',
  );
  const { document } = await withTheme([`.probe-${process.pid}/commented.css`]);
  const css = await document();
  expect(css, 'the real declaration reached the sheet').toContain('--probe-commented: 1');
  expect(css, 'the comment is still a comment').toContain('@theme { --color-primary: red; }');
  expect(css, 'a commented-out import is not resolved').toContain("@import './nowhere.css';");
});

test('a source imported twice is inlined once, and says so', async () => {
  // A diamond, not a cycle: both branches import the same sheet. The adapter
  // inlines each source once — a token file's second copy would be redundant
  // rules — and the sheet records the second import rather than dropping it
  // silently.
  await mkdir(SCRATCH, { recursive: true });
  await writeFile(join(SCRATCH, 'shared.css'), ':root { --probe-shared: 1; }\n', 'utf8');
  await writeFile(join(SCRATCH, 'left.css'), "@import './shared.css';\n", 'utf8');
  await writeFile(join(SCRATCH, 'right.css'), "@import './shared.css';\n", 'utf8');
  await writeFile(
    join(SCRATCH, 'diamond.css'),
    "@import './left.css';\n@import './right.css';\n",
    'utf8',
  );
  const { document } = await withTheme([`.probe-${process.pid}/diamond.css`]);
  const css = await document();
  expect(css, 'the shared sheet contributed').toContain('--probe-shared: 1');
  expect(css.split('--probe-shared: 1').length - 1, 'inlined exactly once').toBe(1);
});

test('a local @import that cannot be resolved fails closed', async () => {
  await mkdir(SCRATCH, { recursive: true });
  await writeFile(
    join(SCRATCH, 'broken.css'),
    "@import './nowhere.css';\n:root { --probe-broken: 1; }\n",
    'utf8',
  );
  const { document } = await withTheme([`.probe-${process.pid}/broken.css`]);
  expect(await errorCodeOf(document)).toBe(PresetErrorCode.TAILWIND_SOURCE_UNRESOLVED);
});

test('an imported file carrying @theme is refused too, not only the entry', async () => {
  await mkdir(SCRATCH, { recursive: true });
  await writeFile(join(SCRATCH, 'tailwind-format.css'), '@theme { --color-x: red; }\n', 'utf8');
  await writeFile(
    join(SCRATCH, 'entry.css'),
    "@import './tailwind-format.css';\n:root { --probe-entry: 1; }\n",
    'utf8',
  );
  const { document } = await withTheme([`.probe-${process.pid}/entry.css`]);
  expect(await errorCodeOf(document)).toBe(PresetErrorCode.UNOCSS_THEME_SOURCE_INCOMPATIBLE);
});

test('the first-party package is refused under UnoCSS by code, never half-styled', async () => {
  // The shipped facts, not a synthetic stand-in: @openelement/ui declares its
  // role table as a `tailwind` theme source (generated-manifest.json →
  // ./src/theme.css), and that file is a Tailwind `@theme` source. An
  // application that selects `unocss` and admits the package therefore reaches
  // this refusal — the supported answer while no shipped mechanism substitutes
  // a plain-CSS role table for the package's. The class tokens are portable;
  // the declared theme source is not, and the two facts must not be conflated
  // into a claim of cross-engine parity.
  const uiRoot = join(import.meta.dirname!, '../../../packages/ui');
  expect(readFileSync(join(uiRoot, 'src/generated-manifest.json'), 'utf8')).toContain(
    '"./src/theme.css"',
  );
  expect(readFileSync(join(uiRoot, 'src/theme.css'), 'utf8')).toContain('@theme');
  const { document } = await withTheme([join(uiRoot, 'src/theme.css')]);
  expect(await errorCodeOf(document)).toBe(PresetErrorCode.UNOCSS_THEME_SOURCE_INCOMPATIBLE);
});

test('a configuration the engine rejects is a coded failure, not a crash', async () => {
  await mkdir(SCRATCH, { recursive: true });
  const config = join(SCRATCH, 'rejecting.config.mjs');
  // A preset that is not a preset: the official loader returns it happily and
  // the generator refuses it, which is exactly the boundary under test.
  await writeFile(config, 'export default { presets: [42] };\n', 'utf8');
  const declaration = { config };
  const plan = resolveStylePlan({
    root: FIXTURE_ROOT,
    tailwind: undefined,
    unocss: declaration,
    declarations: [],
  });
  const code = await errorCodeOf(() =>
    createStyleBuildIntegration({
      root: FIXTURE_ROOT,
      plan: plan!,
      unocss: declaration,
      componentSheetCandidates: () => [],
      documentCandidates: () => [],
      sources: () => new Map(),
    }),
  );
  expect(code).toBe(PresetErrorCode.UNOCSS_CONFIG_UNLOADABLE);
});

test('an absolute theme-source path resolves without the app root', async () => {
  await mkdir(SCRATCH, { recursive: true });
  const absolute = join(SCRATCH, 'absolute.css');
  await writeFile(absolute, ':root { --probe-absolute: 1; }\n', 'utf8');
  const { document } = await withTheme([absolute]);
  const css = await document();
  expect(css, 'an absolute path is read as one').toContain('--probe-absolute: 1');
});

test('an opaque candidate with no utility behind it compiles to an empty sheet', async () => {
  // A class name the engine has no rule for is not a failure. The compiler
  // reports "compiled, matched nothing" — which is what an application's own
  // native-CSS hook (`my-semantic-hook`, styled by its own stylesheet) is — and
  // the adapter must deliver the empty sheet that answer describes rather than
  // diagnosing it as a broken pipeline. A candidate count is not evidence that
  // a rule must exist.
  const integration = await integrationForFixture();
  const css = await integration.provider.compileComponents({
    candidates: ['my-semantic-hook'],
    sources: new Map(),
  });
  expect(css.trim(), 'a zero-match compile is an empty sheet, not an error').toBe('');
});

test('a candidate the engine CAN compile still produces its sheet', async () => {
  const integration = await integrationForFixture();
  const css = await integration.provider.compileComponents({
    candidates: ['my-semantic-hook', 'gap-2'],
    sources: new Map(),
  });
  expect(css, 'the one real utility still compiles').toMatch(/\.gap-2\s*\{/);
  expect(css, 'the opaque hook contributed nothing, as it should').not.toContain(
    'my-semantic-hook',
  );
});

test('a document sheet that compiles to nothing at all is a coded failure', async () => {
  // An application configuration that provides nothing: no preset of its own,
  // so the framework installs its own default — and a preset set the caller
  // supplies that emits neither theme nor properties. The document sheet then
  // has nothing to carry, which is the adapter's defect, never silence.
  await mkdir(SCRATCH, { recursive: true });
  const config = join(SCRATCH, 'empty.config.mjs');
  await writeFile(
    config,
    "export default { presets: [{ name: 'probe-empty' }], theme: {} };\n",
    'utf8',
  );
  const declaration = { config };
  const plan = resolveStylePlan({
    root: FIXTURE_ROOT,
    tailwind: undefined,
    unocss: declaration,
    declarations: [],
  });
  const integration = await createStyleBuildIntegration({
    root: FIXTURE_ROOT,
    plan: plan!,
    unocss: declaration,
    componentSheetCandidates: () => [],
    documentCandidates: () => [],
    sources: () => new Map(),
  });
  const code = await errorCodeOf(() =>
    integration.provider.compileDocument!({ candidates: [], sources: new Map() }),
  );
  expect(code).toBe(PresetErrorCode.UNOCSS_EMPTY_COMPILE);
});

test('a false declaration selects nothing and carries no config path', () => {
  const plan = resolveStylePlan({
    root: FIXTURE_ROOT,
    tailwind: undefined,
    unocss: false,
    declarations: [],
  });
  expect(plan, 'false is the off switch, not a selection').toBeUndefined();
  // The declaration's config path is read through one helper: a boolean (or an
  // absent) declaration carries none, and only the object form names a file.
  expect(declaredUnocssConfig(true), 'a boolean names no configuration').toBeUndefined();
  expect(declaredUnocssConfig(undefined), 'an absent declaration names none').toBeUndefined();
  expect(declaredUnocssConfig(false), 'the off switch names none').toBeUndefined();
  expect(declaredUnocssConfig({ config: 'uno.config.ts' }), 'the object form does').toBe(
    'uno.config.ts',
  );
});
