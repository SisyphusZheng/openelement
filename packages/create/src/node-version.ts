/**
 * The Node.js floor, checked by every CLI entry before it does any work.
 *
 * The packed manifests declare `engines.node >= 24.2`, but an engine range is
 * advisory: npm warns and installs anyway. The CLIs' own dispatch gate is a
 * runtime flag — the Router entries run their main block only when
 * `import.meta.main` is true, and Node added that flag in 24.2.0. On an older
 * host it is `undefined`, so `undefined === true` is false and the packed CLI
 * terminates successfully having done nothing at all: the silent success this
 * module exists to prevent. An engine range cannot close that window from
 * inside the artifact; this check can, because every entry runs it before the
 * dispatch and before any filesystem work.
 *
 * ONE implementation, TWO verbatim placements: this file (the Create scaffold
 * CLI, source of truth) and the Router CLI's copy beside its bin entries. A
 * packed package may not import a source module outside its own root — a
 * relative declaration edge that escapes the package root fails the release,
 * and a runtime specifier that escapes the tarball cannot resolve for a
 * consumer — so the two copies ship side by side, and the Create suite fails
 * if they ever drift. Edit here, mirror the file byte-for-byte, run the
 * Create suite.
 */

import process from 'node:process';

/**
 * The supported Node.js floor: 24.2.0, the first release with
 * `import.meta.main` (the flag every Router bin entry dispatches on).
 */
export const MINIMUM_NODE_VERSION = '24.2.0';

/** Where a consumer reads how to install a supported Node line. */
export const NODE_FLOOR_DOCS_URL = 'https://openelement.org/docs/guide/getting-started';

/** The download page the install hint points at. */
const NODE_DOWNLOAD_URL = 'https://nodejs.org/en/download';

interface NodeVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

/**
 * `MINIMUM_NODE_VERSION` in comparable form. Derived, never restated, so the
 * published constant and the comparison cannot drift apart.
 */
const FLOOR: NodeVersion = (() => {
  const parsed = parseNodeVersion(MINIMUM_NODE_VERSION);
  if (parsed === null) {
    throw new Error(`node-version: unreadable floor "${MINIMUM_NODE_VERSION}"`);
  }
  return parsed;
})();

/** True when `version` names the same release as `floor`, or a newer one. */
function atLeast(version: NodeVersion, floor: NodeVersion): boolean {
  if (version.major !== floor.major) return version.major > floor.major;
  if (version.minor !== floor.minor) return version.minor > floor.minor;
  return version.patch >= floor.patch;
}

/**
 * Parse `24.2.0`, `v24.2`, `24.2.0-nightly…` into its numeric parts. Returns
 * null when the string carries no major.minor pair; the caller treats that as
 * unsupported, so an unreadable host fails closed instead of passing by
 * accident. A prerelease suffix is ignored: the floor is the numeric triple.
 */
export function parseNodeVersion(version: string): NodeVersion | null {
  const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?/.exec(version.trim());
  if (match === null) return null;
  const [, major, minor, patch] = match;
  return { major: Number(major), minor: Number(minor), patch: Number(patch ?? 0) };
}

/**
 * The one actionable message an unsupported host gets, or null when the host
 * is supported. Pure — no process state, no I/O — so every CLI and every test
 * reads the same sentence: required floor, current version, install command,
 * why, and the docs link. Deliberately not a stack trace.
 */
export function nodeFloorProblem(version: string): string | null {
  const parsed = parseNodeVersion(version);
  if (parsed !== null && atLeast(parsed, FLOOR)) return null;
  return [
    `This CLI requires Node.js ${MINIMUM_NODE_VERSION} or newer, but this host reports ${version}.`,
    `Install Node.js ${MINIMUM_NODE_VERSION} or newer (${NODE_DOWNLOAD_URL}) and re-run the command.`,
    'The packed CLI dispatches on `import.meta.main`, which Node added in 24.2.0; on an older host it would exit 0 without doing anything.',
    `Docs: ${NODE_FLOOR_DOCS_URL}`,
  ].join('\n');
}

/** Raised by `assertSupportedNode`; `message` is the one actionable text. */
export class UnsupportedNodeError extends Error {
  /** The host version string that failed the check. */
  readonly version: string;

  constructor(version: string, message: string) {
    super(message);
    this.name = 'UnsupportedNodeError';
    this.version = version;
  }
}

/**
 * Fail closed when `version` is below the floor. The Create CLI calls this
 * before parsing flags, choosing a template, or touching the filesystem; its
 * module-scope catch renders the message as one `error:` line and exits 1 (the
 * scaffold's L9 rule: never a runtime stack trace).
 */
export function assertSupportedNode(version: string): void {
  const problem = nodeFloorProblem(version);
  if (problem !== null) throw new UnsupportedNodeError(version, problem);
}

/**
 * The bin-entry form: report the floor failure and exit non-zero. Every Router
 * entry calls this at module scope, immediately before its `import.meta.main`
 * dispatch. `report`/`exit` are injectable so the contract is testable without
 * a subprocess; the spawned-CLI proof lives in the Create suite.
 */
export function enforceNodeFloor(
  version: string = process.versions.node,
  report: (message: string) => void = (message) => console.error(message),
  exit: (code: number) => void = (code) => process.exit(code),
): void {
  const problem = nodeFloorProblem(version);
  if (problem === null) return;
  report(`[openelement] ${problem.split('\n').join('\n[openelement] ')}`);
  exit(1);
}
