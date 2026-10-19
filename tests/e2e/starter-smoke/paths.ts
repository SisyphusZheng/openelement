/**
 * Starter-smoke scaffold location, shared by setup.ts, quality.ts and the
 * Playwright configs.
 *
 * The scaffold lives OUTSIDE the repository (TPL-03 CI fix, run 39262312202).
 * It used to live under `tests/e2e/starter-smoke/work/`, which the repository's
 * own .gitignore excludes; oxlint's directory walker honors ancestor ignore
 * files, so the starter's own lifecycle script — a bare `oxlint` — found zero
 * files and exited 1:
 *
 *   $ pnpm run lint        # cwd=tests/e2e/starter-smoke/work/my-blog
 *   No files found to lint. Please check your paths and ignore patterns.
 *
 * That is a property of the HARNESS location, not of the template: the same
 * tree under a scratch root outside the repository lints its 13 files green
 * (13 files / 96 rules, exit 0). A user's project is never inside this
 * repository's ignore rules, so the gate must qualify the starter where a user
 * would actually run it.
 *
 * The path is deterministic per host/job so separate steps agree without
 * passing state:
 *
 *   ${RUNNER_TEMP ?? os.tmpdir()}/openelement-starter-smoke/{my-blog,deps}
 *
 * `STARTER_SMOKE_WORK_DIR` overrides the scratch root for local proofs. Each
 * `setup` run recreates the tree from scratch, so a stale scaffold can never
 * be qualified.
 */
import { tmpdir } from 'node:os';
import process from 'node:process';
import { join } from 'node:path';

/** The scratch root: RUNNER_TEMP in CI, the OS temp dir elsewhere. */
export const starterSmokeWorkDir =
  process.env.STARTER_SMOKE_WORK_DIR ??
  join(process.env.RUNNER_TEMP ?? tmpdir(), 'openelement-starter-smoke');

/** The installed scaffold setup.ts generates (and quality.ts + Playwright use). */
export const starterSmokeAppDir = join(starterSmokeWorkDir, 'my-blog');

/** The packed tarballs extracted for the scaffold's dependency rewiring. */
export const starterSmokeDepsDir = join(starterSmokeWorkDir, 'deps');
