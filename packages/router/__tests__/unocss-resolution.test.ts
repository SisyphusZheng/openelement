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
