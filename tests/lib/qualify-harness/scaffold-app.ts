/**
 * Scaffold a temporary OpenElement application with packages/create (#1472).
 *
 * One ritual for "fresh app from the documented generator": run the create
 * CLI (workspace source or packed tarball output) under node, then optionally
 * copy fixture sources verbatim into the generated app. The qualify fixtures
 * scaffold with the source CLI; the starter smoke drives its own packed-CLI
 * flow in tests/e2e/starter-smoke/setup.ts.
 *
 * Workspace-aliased fixtures MUST pass `extraArgs: ['--no-install']`. The
 * create CLI's default install resolves the generated `^<version>` framework
 * ranges against the public registry, and at gate time the candidate version
 * is BY DEFINITION not published yet — release:check died in that install with
 * ERR_PNPM_NO_MATCHING_VERSION for `@openelement/element@^1.0.0-alpha.15`
 * before any fixture assertion ran (T3, alpha15). With `--no-install` the
 * harness owns the only install: applyWorkspaceAliases rewrites every
 * `@openelement/*` dependency to a workspace `link:` entry and
 * installAppDependencies runs the real `pnpm install` against those links.
 */

import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runStep } from './command-run.ts';

export interface ScaffoldAppOptions {
  /** Directory the project subdirectory is generated into. */
  workDir: string;
  /** Project (and directory) name passed to the create CLI. */
  projectName: string;
  /** Entrypoint of the create CLI (source cli.ts or packed cli.js). */
  createCli: string;
  /**
   * Extra CLI arguments forwarded to the create CLI before the project name.
   * Workspace-aliased fixtures pass `['--no-install']` here: the registry
   * install of the not-yet-published `^<version>` ranges must never run
   * (see the module doc), the harness installs after aliasing instead.
   */
  extraArgs?: readonly string[];
  /** Fixture sources copied verbatim into the app after scaffolding. */
  copySources?: {
    fromRoot: string | URL;
    files: readonly string[];
  };
}

/** Resolve a fixture-relative path against a directory root that may be a URL. */
export function pathFromRoot(root: string | URL, relativePath: string): string {
  return typeof root === 'string'
    ? join(root, relativePath)
    : fileURLToPath(new URL(relativePath, root));
}

/**
 * Generate the app with the create CLI and copy the fixture sources in.
 * Returns the generated app directory.
 */
export async function scaffoldApp(options: ScaffoldAppOptions): Promise<string> {
  await runStep('node', [options.createCli, ...(options.extraArgs ?? []), options.projectName], {
    cwd: options.workDir,
  });
  const appDir = join(options.workDir, options.projectName);
  if (options.copySources) {
    for (const relativePath of options.copySources.files) {
      const destination = join(appDir, relativePath);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(pathFromRoot(options.copySources.fromRoot, relativePath), destination);
    }
  }
  return appDir;
}
