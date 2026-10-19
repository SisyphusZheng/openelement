/**
 * Package-manager detection for the create CLI's install/start steps.
 *
 * A separate module (not cli.ts): the module is imported by the tests, and
 * cli.ts executes the CLI at import time (top-level main), so anything the
 * tests need to call must live beside it, not inside it.
 *
 * Manager-neutral since alpha.15. The scaffold used to pin pnpm through a
 * `catalog:` specifier in its own pnpm-workspace.yaml, and `catalog:` is a
 * pnpm-only protocol — npm rejects the manifest with EUNSUPPORTEDPROTOCOL —
 * so the probe had exactly one answer and a missing pnpm failed the run with
 * a requirement. The template now ships explicit version pins, no
 * `packageManager` field, and no workspace file, so any of the four common
 * managers installs it unchanged.
 *
 * Detection has TWO sources, in order (TPL-02):
 *
 *   1. the INVOKING manager — the wrapper this run was started through. A
 *      packed `npm create @openelement` run used to print (and drive) `pnpm`
 *      whenever pnpm merely sat on PATH, which is surprising at best and
 *      wrong when the user's workflow is npm: the next-steps box must spell
 *      the manager the user actually chose. The signals are the ones every
 *      manager exports to its child (`npm_config_user_agent`, then
 *      `npm_execpath`, then the argv[1] runner name);
 *   2. the PATH probe, in preference order pnpm, npm, yarn, bun — the
 *      fallback for a DIRECT `node`/`openelement-create` run, where no
 *      wrapper named itself.
 *
 * Only a PATH with none of the four AND no invoking manager fails.
 *
 * The module also owns the two lifecycle COMMAND spellings the CLI prints and
 * every documented quickstart repeats (install dependencies, run dev): one
 * builder each, so the handoff box and the guides cannot drift apart on
 * package-manager spelling. With no manager named they fall back to the
 * universal `npm` spelling — every one of the four runs the same scripts.
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';

/** The managers the install step can drive, in detection order. */
export const PACKAGE_MANAGERS = ['pnpm', 'npm', 'yarn', 'bun'] as const;

export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

/**
 * The spelling used when no manager was detected (a `--no-install` run on a
 * PATH with none of the four): npm's commands are the ones every other
 * manager's docs also accept, and all four run the same package.json scripts.
 */
export const DEFAULT_PACKAGE_MANAGER = 'npm';

/** `<pm> install` — the command a consumer runs when the scaffold skipped it. */
export function installDependenciesCommand(pm: PackageManager | null = null): string {
  return `${pm ?? DEFAULT_PACKAGE_MANAGER} install`;
}

/** `<pm> run dev` — the command every documented quickstart spells. */
export function devCommand(pm: PackageManager | null = null): string {
  return `${pm ?? DEFAULT_PACKAGE_MANAGER} run dev`;
}

/** Probe `<pm> --version`; an off-PATH binary gives ENOENT. */
export function packageManagerAvailable(pm: PackageManager): boolean {
  const probe = spawnSync(pm, ['--version'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  return probe.error === undefined && probe.status === 0;
}

/**
 * The first available manager in {@link PACKAGE_MANAGERS} order, or `null`
 * when none of the four is on PATH. The probe is injectable so the order (and
 * the total miss) can be pinned without rewriting PATH.
 */
export function detectPackageManager(
  probe: (pm: PackageManager) => boolean = packageManagerAvailable,
): PackageManager | null {
  for (const pm of PACKAGE_MANAGERS) {
    if (probe(pm)) return pm;
  }
  return null;
}

/** The set form of {@link PACKAGE_MANAGERS}, for name lookups. */
const PACKAGE_MANAGER_NAMES: ReadonlySet<string> = new Set(PACKAGE_MANAGERS);

/** One manager name from a signal, or `null` when the name is not one of ours. */
function managerNamed(name: string | undefined): PackageManager | null {
  const candidate = name?.trim().toLowerCase();
  if (candidate === undefined || candidate === '' || !PACKAGE_MANAGER_NAMES.has(candidate)) {
    return null;
  }
  return candidate as PackageManager;
}

/**
 * The runner file names that map to a manager. `npx`/`pnpm dlx`/`bunx` are
 * runners of their manager, and `npm create` executes through npm's own
 * `npm-cli.js`; `corepack` is deliberately absent — it is a shim over another
 * manager, not a manager to spell commands for.
 */
const RUNNER_MANAGERS: Readonly<Record<string, PackageManager>> = {
  npm: 'npm',
  'npm-cli.js': 'npm',
  npx: 'npm',
  'npx-cli.js': 'npm',
  pnpm: 'pnpm',
  'pnpm.cjs': 'pnpm',
  'pnpm.js': 'pnpm',
  pnpx: 'pnpm',
  yarn: 'yarn',
  'yarn.js': 'yarn',
  'yarn.cjs': 'yarn',
  yarnpkg: 'yarn',
  bun: 'bun',
  bunx: 'bun',
};

/** The last path segment of a POSIX or Windows path. */
function lastPathSegment(path: string): string {
  const normalized = path.replace(/\\+/g, '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

/**
 * The manager named by `npm_config_user_agent` — the signal every one of the
 * four exports to its children, shaped `<name>/<version> <rest>` (npm's own
 * agent, for example, is `npm/11.6.0 node/v24.18.0 darwin arm64 workspaces/false`).
 */
function invokingManagerFromUserAgent(userAgent: string | undefined): PackageManager | null {
  if (userAgent === undefined || userAgent.trim() === '') return null;
  return managerNamed(userAgent.trim().split(/[\s/]/, 1)[0]);
}

/**
 * The manager named by `npm_execpath` — the absolute path of the manager's
 * own entry script (`…/npm/bin/npm-cli.js`, `…/pnpm/bin/pnpm.cjs`,
 * `…/yarn/bin/yarn.js`, `…/bun`). Matched on the basename with the manager
 * names checked before npm's, because `pnpm` contains `npm`.
 */
function invokingManagerFromExecPath(execPath: string | undefined): PackageManager | null {
  if (execPath === undefined || execPath === '') return null;
  const file = lastPathSegment(execPath).toLowerCase();
  if (file.includes('pnpm')) return 'pnpm';
  if (file.includes('yarn')) return 'yarn';
  if (file.includes('bun')) return 'bun';
  if (file.includes('npm') || file.includes('npx')) return 'npm';
  return null;
}

/**
 * The manager named by `process.argv[1]` — the runner script itself when the
 * CLI is executed through a manager binary rather than through its own node
 * entry. A direct `node …/cli.ts` run names the CLI file, which matches
 * nothing by construction.
 */
function invokingManagerFromArgv1(argv: readonly string[]): PackageManager | null {
  const runner = argv[1];
  if (runner === undefined || runner === '') return null;
  return RUNNER_MANAGERS[lastPathSegment(runner).toLowerCase()] ?? null;
}

/**
 * The manager this run was INVOKED through, or `null` when no wrapper named
 * itself (a direct `node` execution). Signals are read in the order every
 * manager's environment makes reliable: the user agent first (it names the
 * wrapper unambiguously), then the exec path, then the argv[1] runner name.
 * Both inputs are injectable, so the precedence is pinned without touching
 * the host's real environment or argv.
 */
export function detectInvokingPackageManager(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv,
): PackageManager | null {
  return (
    invokingManagerFromUserAgent(env.npm_config_user_agent) ??
    invokingManagerFromExecPath(env.npm_execpath) ??
    invokingManagerFromArgv1(argv)
  );
}

/**
 * The manager a run should use, in the two-source order the module header
 * documents: the INVOKING manager when one named itself, otherwise the first
 * of the four on PATH. `null` means "neither a wrapper nor a PATH" — the one
 * case the CLI reports as a failure (or falls back to npm's universal spelling
 * for, in a --no-install handoff).
 */
export function resolvePackageManager(
  options: {
    env?: NodeJS.ProcessEnv;
    argv?: readonly string[];
    probe?: (pm: PackageManager) => boolean;
  } = {},
): PackageManager | null {
  return (
    detectInvokingPackageManager(options.env ?? process.env, options.argv ?? process.argv) ??
    detectPackageManager(options.probe)
  );
}
