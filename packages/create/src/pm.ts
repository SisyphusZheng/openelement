/**
 * Package-manager detection for the create CLI's install/start steps.
 *
 * A separate module (not cli.ts): the module is imported by the tests, and
 * cli.ts executes the CLI at import time (top-level main), so anything the
 * tests need to call must live beside it, not inside it.
 *
 * One manager, and the answer is pnpm. The scaffold pins its toolchain through
 * a pnpm catalog — `pnpm-workspace.yaml` declares `vite: npm:…vite-plus-core`
 * and `overrides: vite@*: "catalog:"`, and `package.json` asks for
 * `vite-plus: "catalog:"`. `catalog:` is a pnpm-only protocol: npm rejects it
 * with `EUNSUPPORTEDPROTOCOL: Unsupported URL Type "catalog:"` and installs
 * nothing, so probing for npm as a fallback did not make the scaffold more
 * portable — it moved the failure from an explicit check to a confusing error
 * after the project had already been written. There is no npm-compatible
 * dependency set to fall back to: the catalog IS how `vite` resolves to the
 * Vite+ core build for every peer in the tree.
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';

/** Probe `<pm> --version`; an off-PATH binary gives ENOENT. */
function packageManagerAvailable(pm: string): boolean {
  const probe = spawnSync(pm, ['--version'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  return probe.error === undefined && probe.status === 0;
}

/** Is pnpm on PATH? The caller decides how to report a miss. */
export function pnpmAvailable(): boolean {
  return packageManagerAvailable('pnpm');
}
