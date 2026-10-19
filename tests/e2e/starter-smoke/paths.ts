/**
 * Starter-smoke scaffold location, shared by setup.ts, quality.ts and the
 * Playwright configs.
 *
 * The scaffold lives OUTSIDE the repository (TPL-03): inside it, the
 * repository's ancestor .gitignore made the starter's own bare `oxlint` find
 * zero files, so the quality gate could not exercise the real lifecycle.
 *
 * The root is created with `mkdtemp` — a UNIQUE directory per run, never a
 * fixed name under os.tmpdir() (CodeQL js/insecure-temporary-file, alerts
 * 4242-4245: a predictable temp path later written into reads as an insecure
 * temporary file). Because setup, quality and the Playwright configs/spec run
 * in SEPARATE processes, the chosen root is recorded in a pointer file inside
 * the harness's own `node_modules` (gitignored, and the harness already
 * requires an install):
 *
 *   tests/e2e/starter-smoke/node_modules/.starter-smoke-work-dir
 *
 * `STARTER_SMOKE_WORK_DIR` overrides the root verbatim: a caller-provided
 * directory is not a temporary-path guess, and setup never deletes it.
 *
 * Fail closed: a reader that finds neither the override nor the pointer throws
 * one actionable line instead of silently creating a second, different root.
 * `setup` removes a previous harness-created root before creating the next
 * one, so repeated runs do not leak temp directories.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { basename, dirname, join, resolve, sep } from 'node:path';

/** The mkdtemp prefix: the directory name is never fully predictable. */
const SCRATCH_PREFIX = 'openelement-starter-smoke-';

/** Where the chosen root is recorded for the other harness processes. */
const POINTER_FILE = join(import.meta.dirname!, 'node_modules', '.starter-smoke-work-dir');

/** The recorded root, or `null` when setup has never run on this checkout. */
function pointerValue(): string | null {
  try {
    const value = readFileSync(POINTER_FILE, 'utf8').trim();
    return value === '' ? null : value;
  } catch {
    return null;
  }
}

/** The caller-provided root, or `null` when the override is unset/blank. */
function overrideValue(): string | null {
  const value = process.env.STARTER_SMOKE_WORK_DIR?.trim();
  return value === undefined || value === '' ? null : value;
}

/** One actionable line for a process that runs before setup. */
const MISSING_ROOT_MESSAGE =
  '[starter-smoke] no scaffold root recorded: run ' +
  '`pnpm --dir tests/e2e/starter-smoke run setup` first ' +
  '(or set STARTER_SMOKE_WORK_DIR to a caller-owned directory).';

/**
 * The scaffold root setup.ts created: the override when set, else the root the
 * pointer file records. Throws the actionable line when neither exists — never
 * invents a fallback root.
 */
export function readStarterSmokeWorkDir(): string {
  const override = overrideValue();
  if (override !== null) return override;
  const recorded = pointerValue();
  if (recorded === null) throw new Error(MISSING_ROOT_MESSAGE);
  return recorded;
}

/** The installed scaffold (quality.ts and the Playwright lanes consume it). */
export function starterSmokeAppDir(): string {
  return join(readStarterSmokeWorkDir(), 'my-blog');
}

/** The packed tarballs extracted for the scaffold's dependency rewiring. */
export function starterSmokeDepsDir(): string {
  return join(readStarterSmokeWorkDir(), 'deps');
}

/**
 * Delete a previous root ONLY when it is a harness-created temp directory:
 * resolved under `tmpdir()` AND named with the mkdtemp prefix. A
 * caller-provided root (the env override) never matches and is never touched.
 */
export function removePreviousStarterSmokeWorkDir(workDir: string): void {
  const root = resolve(workDir);
  const temp = resolve(tmpdir());
  if (!root.startsWith(`${temp}${sep}`)) return;
  if (!basename(root).startsWith(SCRATCH_PREFIX)) return;
  rmSync(root, { recursive: true, force: true });
}

/**
 * setup.ts's entry point: reuse the caller's root when the override is set,
 * otherwise retire the recorded temp root (if any) and create a fresh one with
 * `mkdtemp`, then record it in the pointer file for the later processes.
 */
export function createStarterSmokeWorkDir(): string {
  const override = overrideValue();
  if (override !== null) {
    mkdirSync(override, { recursive: true });
    return override;
  }
  const previous = pointerValue();
  if (previous !== null) removePreviousStarterSmokeWorkDir(previous);
  const workDir = mkdtempSync(join(tmpdir(), SCRATCH_PREFIX));
  mkdirSync(dirname(POINTER_FILE), { recursive: true });
  writeFileSync(POINTER_FILE, `${workDir}\n`, 'utf8');
  return workDir;
}
