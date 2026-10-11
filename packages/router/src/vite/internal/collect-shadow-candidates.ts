/**
 * Shadow candidate collection for the client build (alpha15 S lane).
 *
 * The client build's module graph holds the island modules only: page,
 * layout and static-component modules are compiled later, by the SSR pass, so
 * their statically admitted class candidates would miss the window in which
 * the component stylesheet is compiled and emitted (Phase 2). This pass runs
 * the SAME official compiler (`compileElementModule`) over the module
 * inventory the Phase 1 scanners already produced — routes, islands and static
 * components — and registers the results in the candidate channel. There is no
 * second parser here and no class grammar of our own: the compiler's lowering
 * collects the tokens, and the build layer forwards them to the official
 * Tailwind compiler as explicit candidates.
 *
 * A module that fails to compile is skipped here by design: this pass only
 * feeds the component stylesheet's candidate set, and the authoritative compile
 * (the SSR pass, which transforms every module) is the one that reports its
 * diagnostics and fails the build. Skipping is therefore never a silent
 * acceptance of broken source.
 *
 * Root scope is preserved exactly as the transform path records it
 * ({@linkcode registerClassCandidates}'s `shadow` flag): light-root candidates
 * are registered for measurement but never enter the shadow stylesheet.
 */

import { readFile } from 'node:fs/promises';
import { compileElementModule, registerClassCandidates } from '@openelement/compiler';
import { ISLAND_ADMISSION } from '@openelement/protocol/island-admission';
import { resolve } from 'pathe';

/** One module the collection pass should compile, as a project-relative path. */
export interface CandidateModule {
  /** Project-relative POSIX path of the module source. */
  readonly path: string;
}

export interface CollectShadowCandidatesOptions {
  /** Project root; module paths resolve against it. */
  readonly root: string;
  /** The modules to compile, in any order (registration is idempotent). */
  readonly modules: readonly CandidateModule[];
}

/**
 * Compile every listed module and register its admitted class candidates.
 * Returns how many modules contributed candidates (diagnostics for the pass's
 * own module set are the SSR pass's to report).
 */
export async function collectShadowClassCandidates(
  options: CollectShadowCandidatesOptions,
): Promise<number> {
  let contributed = 0;
  const seen = new Set<string>();
  for (const module of options.modules) {
    const file = resolve(options.root, module.path);
    if (seen.has(file)) continue;
    seen.add(file);
    let source: string;
    try {
      source = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    if (!source.includes('@element(')) continue;
    let compiled: ReturnType<typeof compileElementModule>;
    try {
      compiled = compileElementModule(source, file, { staticSidecars: [ISLAND_ADMISSION] });
    } catch {
      // The authoritative compile reports diagnostics; see the module header.
      continue;
    }
    if (compiled?.classCandidates === undefined) continue;
    registerClassCandidates(file, compiled.classCandidates, {
      shadow: compiled.program.root.kind !== 'light',
    });
    contributed += 1;
  }
  return contributed;
}
