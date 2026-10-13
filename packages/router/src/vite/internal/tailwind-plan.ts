/**
 * The Tailwind pipeline plan: WHO enabled the compile, and which
 * style sources it carries.
 *
 * Demand is a DECLARED fact, never a guess: an admitted package declaration
 * says "my components need the compile" (`required`) and/or owns the sources
 * that compile with them (`sources`), and the application's own `tailwind`
 * declaration decides enablement. Nothing here inspects a class string — the
 * official compiler owns utility semantics, and the framework owns no Tailwind
 * grammar (see the S-lane registry note in `@openelement/compiler`).
 *
 * One resolver feeds every channel — the client build's Phase 2, the
 * orchestrator's decision to run it, the dev entry and the dev component
 * sheet — so dev and production cannot disagree about whether the pipeline
 * exists or which sources it compiles.
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'pathe';
import type { TailwindOptions } from '../../config.ts';
import { PresetErrorCode, buildError } from '../../internal/error-codes.ts';
import { admittedTailwindDeclarations } from './ssg/island-scanner.ts';
import type { OpenElementBuildContext } from '../build-context.ts';
import type { ResolvedTailwindOptions } from '../tailwind.ts';

/**
 * One ADMITTED package declaration's Tailwind facts: the mandatory
 * requirement and the package-owned sources it declares. Produced by the
 * admission scan (`admittedTailwindDeclarations`); this type carries only what
 * the plan needs.
 */
export interface DeclaredTailwindSource {
  /** The declaring package (diagnostics + deterministic ordering). */
  readonly packageName: string;
  /** The declaring tag (diagnostics + deterministic ordering). */
  readonly tagName: string;
  /** Mandatory compilation: the component is unstyled without the compile. */
  readonly required: boolean;
  /** Package-relative sources (`./theme.css`), in declared order. */
  readonly sources: readonly string[];
}

/** The identity two sources share when they name the same file. */
function sourceIdentity(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * Resolve the Tailwind pipeline for one build or dev server.
 *
 * The application's declaration decides ENABLEMENT; the admitted package
 * declarations decide SOURCES and REQUIREMENT:
 *
 *   undefined + an admitted declaration  → enabled, declared sources only
 *   undefined + no declaration           → undefined (no peer, no compile, no resource)
 *   true                                 → enabled, declared sources only
 *   { theme }                            → enabled, declared sources then the application's
 *   false                                → undefined; an admitted `required: true` fails closed
 *
 * Declared sources resolve package-relative against their OWN package and are
 * deduplicated by resolved identity, so an application never repeats an owner's
 * source and a repeated one collapses onto the declared occurrence. Package
 * declarations are ordered by package name, then tag name, then declared order
 * — never by scan timing — so two packages with conflicting themes resolve the
 * same way on every machine, and an application source (which always compiles
 * last) is the documented override.
 */
export function resolveTailwindPlan(input: {
  root: string;
  /** The application's own declaration (`openelement.config.ts`). */
  tailwind: boolean | TailwindOptions | undefined;
  /** Every admitted package declaration's facts, in any order. */
  declarations: readonly DeclaredTailwindSource[];
}): ResolvedTailwindOptions | undefined {
  const declared = input.declarations
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        a.entry.packageName.localeCompare(b.entry.packageName) ||
        a.entry.tagName.localeCompare(b.entry.tagName) ||
        a.index - b.index,
    )
    .map(({ entry }) => entry);
  const required = declared.filter((entry) => entry.required);
  const offered = declared.some((entry) => entry.required || entry.sources.length > 0);

  if (input.tailwind === false) {
    if (required.length > 0) {
      const names = required.map((entry) => `${entry.packageName} <${entry.tagName}>`).join(', ');
      throw buildError(
        PresetErrorCode.TAILWIND_REQUIRED_DISABLED,
        `\`tailwind: false\` disables the Tailwind entry, but admitted component(s) require the ` +
          `compile: ${names}. Those components ship without their presentation when the entry is ` +
          'off — enable the entry, or stop admitting the package that requires it.',
      );
    }
    return undefined;
  }

  // Automatic mode: a declared requirement (or an offered source) is the only
  // thing that enables the pipeline. Local application classes never do — an
  // application that authors its own utilities declares `tailwind` itself.
  if (input.tailwind === undefined && !offered) return undefined;

  const theme: string[] = [];
  const seen = new Set<string>();
  const admit = (identity: string, specifier: string): void => {
    const key = sourceIdentity(identity);
    if (seen.has(key)) return;
    seen.add(key);
    theme.push(specifier);
  };

  for (const entry of declared) {
    for (const source of entry.sources) {
      if (!source.startsWith('./')) {
        throw buildError(
          PresetErrorCode.TAILWIND_SOURCE_UNRESOLVED,
          `${entry.packageName} <${entry.tagName}> declares the Tailwind source "${source}": a ` +
            'declared source must be package-relative (e.g. "./theme.css"), so its owner stays ' +
            'unambiguous.',
        );
      }
      const file = resolve(packageRootFor(input.root, entry.packageName), source);
      if (!existsSync(file)) {
        throw buildError(
          PresetErrorCode.TAILWIND_SOURCE_UNRESOLVED,
          `${entry.packageName} <${entry.tagName}> declares the Tailwind source "${source}", but ` +
            `the installed package does not carry it (resolved: ${file}). Ship the file in the ` +
            'package (its `files` list) or correct the declaration.',
        );
      }
      admit(file, file);
    }
  }

  if (input.tailwind !== true) {
    for (const source of input.tailwind?.theme ?? []) {
      // An application source keeps its own spelling: the entry renderer
      // resolves it against the app root exactly as it always has (package
      // specifier or app-relative path) — the plan only borrows the file
      // identity behind it, so repeating an owner's source is a no-op.
      let identity: string | undefined;
      try {
        identity = createRequire(join(input.root, 'package.json')).resolve(source);
      } catch {
        identity = undefined;
      }
      admit(identity ?? source, source);
    }
  }

  return { theme };
}

/**
 * The pipeline plan of one running build or dev server, from the project's own
 * admission facts. Every channel calls THIS — the orchestrator's Phase 2 gate,
 * the client build, the dev entry and the dev component sheet — so the four
 * cannot disagree. The declaration itself is passed in because each channel
 * legitimately reads it from its own resolved options (the plugin's `options`
 * in a build, `resolvedOptions` in the dev server); only the DECLARED package
 * facts are shared.
 */
export function tailwindPlanForApp(
  ctx: OpenElementBuildContext,
  root: string,
  tailwind: boolean | TailwindOptions | undefined,
): ResolvedTailwindOptions | undefined {
  return resolveTailwindPlan({
    root,
    tailwind,
    declarations: admittedTailwindDeclarations(
      ctx.phase1.packageManifests ?? [],
      ctx.phase1.packageIslandDecls ?? [],
    ),
  });
}

/**
 * The installed directory of one scanned package: the manifest subpath first
 * (what the scan itself imports), then the package root entry — walked up to
 * the directory whose package.json names the package, so a workspace link, a
 * pnpm link and a packed tarball all resolve inside the installed package.
 */
function packageRootFor(root: string, packageName: string): string {
  const requireFromRoot = createRequire(join(root, 'package.json'));
  let entry: string | undefined;
  for (const specifier of [`${packageName}/manifest`, packageName]) {
    try {
      entry = requireFromRoot.resolve(specifier);
      break;
    } catch {
      continue;
    }
  }
  if (entry === undefined) {
    throw buildError(
      PresetErrorCode.TAILWIND_SOURCE_UNRESOLVED,
      `Cannot locate the installed package "${packageName}" to resolve its declared Tailwind ` +
        'sources (neither its ./manifest subpath nor its root entry resolves from the app root).',
    );
  }
  let dir = dirname(entry);
  for (let depth = 0; depth < 12; depth++) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string };
        if (parsed.name === packageName) return dir;
      } catch {
        // An unreadable package.json is not a package root; keep walking.
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // The walk failed (an unusual layout): the entry's own directory is still
  // inside the installed package, so resolve there.
  return dirname(entry);
}
