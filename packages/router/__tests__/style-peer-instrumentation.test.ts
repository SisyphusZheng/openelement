/**
 * Peer-load and compile-call instrumentation (alpha15 Stage 5).
 *
 * The style plan's OFF contract is stated as "no peer is loaded, nothing is
 * compiled, no stylesheet is emitted". The plan DECISION is pinned elsewhere
 * (`resolveStylePlan` returns `undefined`); what is measured here is the
 * OBSERVATION behind it — whether the engine's package was actually resolved —
 * because a plan that returns `undefined` and a build that then imports the
 * engine anyway would look identical from the outside.
 *
 * The measurement runs in a CHILD process with an ESM loader hook installed, so
 * every specifier the process resolves is recorded. That is the only way to ask
 * the question: an in-process check would have to inspect a module registry that
 * carries modules imported by other tests.
 *
 * The compile-call side is counted on the provider seam the framework owns
 * (`compileComponents` / `compileDocument`), which is exactly the boundary a
 * "zero calls when the pipeline is off" claim is about.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const routerSrc = join(here, '../src');

/**
 * The hook module and the probe are written into a scratch directory: the hook
 * records every specifier the process resolves, and the probe prints them as
 * JSON on exit.
 */
const HOOK = `export async function resolve(specifier, context, nextResolve) {
  const seen = (globalThis.__a15Specifiers ??= []);
  seen.push(specifier);
  return await nextResolve(specifier, context);
}
`;

/** The probe: resolve a plan for one declaration, build it, and print the trace. */
const PROBE = `
import { resolveStylePlan } from ${JSON.stringify(join(routerSrc, 'vite/internal/style-plan.ts'))};
import { createStyleBuildIntegration } from ${JSON.stringify(join(routerSrc, 'vite/internal/style-provider.ts'))};

const root = process.argv[2];
const declaration = JSON.parse(process.argv[3]);
const plan = resolveStylePlan({ root, tailwind: declaration.tailwind, unocss: declaration.unocss, declarations: [] });
let provider = null;
let compiles = { components: 0, document: 0 };
if (plan !== undefined) {
  const integration = await createStyleBuildIntegration({
    root,
    plan,
    unocss: declaration.unocss,
    componentSheetCandidates: () => [],
    documentCandidates: () => [],
    sources: () => new Map(),
  });
  provider = integration.provider.id;
  await integration.provider.compileComponents({ candidates: [], sources: new Map() });
  compiles.components += 1;
  if (integration.provider.compileDocument) {
    await integration.provider.compileDocument({ candidates: [], sources: new Map() });
    compiles.document += 1;
  }
}
const seen = globalThis.__a15Specifiers ?? [];
console.log('A15-TRACE ' + JSON.stringify({ plan: plan !== undefined, provider, compiles, seen }));
`;

interface Trace {
  plan: boolean;
  provider: string | null;
  compiles: { components: number; document: number };
  seen: string[];
}

function probe(declaration: Record<string, unknown>): Trace {
  const scratch = mkdtempSync(join(tmpdir(), 'oe-a15-instrument-'));
  try {
    const hook = join(scratch, 'hook.mjs');
    const script = join(scratch, 'probe.mjs');
    writeFileSync(hook, HOOK, 'utf8');
    writeFileSync(script, PROBE, 'utf8');
    // A project root with no engine installed at all: a peer load is a real
    // resolve, and a resolve that cannot find its package is the failure the
    // "no peer is loaded" row is supposed to rule out.
    mkdirSync(join(scratch, 'app'), { recursive: true });
    writeFileSync(join(scratch, 'package.json'), '{"name":"a15-probe","type":"module"}\n', 'utf8');
    const run = spawnSync(
      process.execPath,
      [
        '--import',
        `data:text/javascript,import {register} from "node:module";register(${JSON.stringify(`file://${hook}`)});`,
        script,
        scratch,
        JSON.stringify(declaration),
      ],
      { encoding: 'utf8' },
    );
    const line = (run.stdout ?? '').split('\n').find((entry) => entry.startsWith('A15-TRACE '));
    if (line === undefined) {
      throw new Error(`the probe produced no trace:\n${run.stdout}\n${run.stderr}`);
    }
    return JSON.parse(line.slice('A15-TRACE '.length)) as Trace;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Engine specifiers in a trace. A peer reached through `createRequire` arrives
 * as a FILE URL (the CJS resolver runs below the ESM hook), so the match is on
 * either spelling — the bare specifier or a path inside the package directory.
 */
/**
 * Engine specifiers in a trace, matched on either spelling.
 *
 * METHOD LIMITATION, stated rather than hidden: an ESM loader hook does not see
 * a peer the adapters reach through `createRequire(...).resolve(...)` followed
 * by a `file:` import — that resolution runs in the CJS resolver, below the
 * hook. So this predicate is a NEGATIVE check only: it can show that an engine
 * specifier crossed the ESM boundary, and it cannot show that one was reached
 * some other way. The positive side of the peer question is answered by the
 * provider, which is the only thing that loads a peer at all, and by its coded
 * UNRESOLVABLE diagnostic when the peer is absent (`style-provider.test.ts`:
 * "a missing engine is a coded failure, not a silent skip").
 */
const engineSpecifiers = (trace: Trace): string[] =>
  trace.seen.filter((specifier) => /(?:^|[/@])unocss(?:[/.]|$)|tailwindcss/.test(specifier));

test('no declaration and no requirement resolves no engine and compiles nothing', () => {
  // The OFF contract, observed rather than inferred: the pipeline does not
  // exist, and nothing on the path went looking for an engine.
  const trace = probe({});
  expect(trace.plan, 'no declaration selects nothing').toBe(false);
  expect(trace.provider, 'no provider was built').toBeNull();
  expect(trace.compiles, 'no compile was issued').toEqual({ components: 0, document: 0 });
  expect(
    engineSpecifiers(trace),
    `no engine specifier was resolved (${trace.seen.length} specifier(s) observed)`,
  ).toEqual([]);
});

test('an explicit Tailwind declaration selects that engine and compiles its sheets', () => {
  // The positive control: the same probe, with the declaration the OFF row
  // lacks. Without this row, "no provider was built" would also pass if the
  // probe could never build one at all.
  const trace = probe({ tailwind: true });
  expect(trace.plan, 'an explicit declaration selects the pipeline').toBe(true);
  expect(trace.provider, 'the Tailwind provider was built').toBe('tailwind');
  expect(trace.compiles.components, 'the component sheet was compiled once').toBe(1);
});

test('an explicit UnoCSS declaration selects that engine, not the other one', () => {
  // The two engines are a closed union: selecting one must not build the
  // other's provider, and the provider is the only thing that loads a peer.
  const trace = probe({ unocss: {} });
  expect(trace.plan, 'an explicit declaration selects the pipeline').toBe(true);
  expect(trace.provider, 'the UnoCSS provider was built').toBe('unocss');
  expect(trace.compiles.components, 'the component sheet was compiled once').toBe(1);
});
