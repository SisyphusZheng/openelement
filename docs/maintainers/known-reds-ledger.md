# Known-reds ledger (committed)

Owner ruling 2026-10-09: internal quality items do not get GitHub issues; they
are tracked in a ledger. The long-running working ledger lives in
`.zcode/plans/known-reds-ledger.md`, which is gitignored. THIS file is the
committed home for the entries a release reader must see before signing off a
candidate — the ones that make a gate red or bound what a gate can prove. Read
it before reading a `release:check` result.

Every entry carries: symptom, evidence path, impact, owner, retirement
condition, and the latest observation (run/SHA). Status vocabulary: OPEN /
FIXING (this batch) / FIXED (commit) / COVERED-BY-DESIGN (a recorded coverage
boundary, not a failure).

## KR-16 · Pre-publish `release:check`: create CLI default install resolves the unpublished version

- **Symptom**: `release:check` → `gate:packed` →
  `@openelement/fixture-third-party-web-components#smoke` scaffolds with
  `packages/create`, and the CLI's DEFAULT install resolves the generated
  caret dependencies (`@openelement/element@^1.0.0-alpha.15`) against the real
  npm registry. At gate time the candidate version is by definition
  unpublished (registry latest `1.0.0-alpha.14`), so the install dies with
  `ERR_PNPM_NO_MATCHING_VERSION` before any fixture assertion runs. The
  alpha15 local preflight was 119 PASS / 2 FAIL — the fixture smoke and the
  gate around it — and `publish:npm:dry-run` was never reached.
- **Evidence path**: `tests/fixtures/third-party-web-components/qualify.ts`
  and `tests/fixtures/web-component-interop/qualify.ts` (the `scaffoldApp`
  calls), `tests/lib/qualify-harness/scaffold-app.ts` (the documented rule),
  `tests/lib/qualify-harness/workspace-alias.ts` (the install that owns the
  real dependencies). Lane logs (untracked, same worktree):
  `.zcode/scratch/t3-release/fixture-smoke-pre-fix.log` (old behavior) and
  `.zcode/scratch/t3-release/fixture-smoke-fixed.log` (fixed). Minimal direct
  reproduction: `node packages/create/src/cli.ts <name>` in a temp directory
  fails with the same `ERR_PNPM_NO_MATCHING_VERSION`.
- **Impact**: no candidate could pass the local release train before publish,
  for an ordering reason rather than a product defect — and the failure was
  reported at the fixture, which masked everything the fixture would have
  checked afterwards.
- **Fix (T3, this batch)**: workspace-aliased qualify fixtures pass
  `extraArgs: ['--no-install']`; `applyWorkspaceAliases` rewrites every
  `@openelement/*` dependency to a workspace `link:` entry and
  `installAppDependencies` runs the single real `pnpm install` against those
  links. `tests/e2e/starter-smoke/setup.ts` already passed `--no-install` for
  the same reason (no change needed).
- **Retirement condition**: on an unpublished version, `release:check`
  reaches `gate:packed` completion — no `ERR_PNPM_NO_MATCHING_VERSION` in any
  scaffold step; the only remaining reds are entries recorded below.
- **Owner**: alpha15 batch (T3).
- **Latest observation**: 2026-10-18, lane/t3-release worktree @ `f395b1e1f`.
  Without the fix the smoke dies at `scaffoldApp` in 2 s with
  `ERR_PNPM_NO_MATCHING_VERSION`; with the fix it scaffolds `--no-install`,
  installs and BUILDS green, then stops at the KR-17 browser gap
  (`missing=wc-open-child`).

## KR-17 · Third-party WC qualification: `wc-open-child` never registers

- **Status**: FIXED (product commit `323fd54df`, lane `672847cb7`) — retired in
  this batch; the evidence is below.
- **Symptom**: the fixture's browser verification throws
  `custom-element registration failed; missing=wc-open-child`. The tag is a
  client-only island whose host is created later, inside a third-party (Lit)
  component's shadow root.
- **Root cause (confirmed)**: B2's page-scope gate reads the page once, at
  module evaluation. `wc-open-child` is created inside the Lit host's own open
  shadow root only after `wc-client.ts` — a separate async chunk — lands, and on
  that page shape nothing ever looks again: with no enhanced forms the enhance
  layer (the only caller of `observeVisible()`) is never generated, and with no
  `client:visible` island the ready-time visible scan is not registered either.
  The scheduler suite pinned the deferral but never the absence of a trigger.
- **Fix (T8, this batch)**: `packages/router/src/vite/internal/ssg/island-scheduler.ts`
  runs a bounded late-host probe — while the page still carries a declared
  factory nobody has consumed, it re-asks the composed tree for those tags (one
  fused traversal for the whole pending set) and hands a hit to the existing
  rescan. It adds no activation path: `load()`'s host gate stays the only one,
  so a page with no host still fetches nothing. Budget 6 scans per window,
  3000 ms per window, at most 3 windows renewed by island-load activity, 9000 ms
  absolute; a spent budget announces `open:island-host-timeout` (registered as a
  P8 seam in `docs/architecture/seams.md`) instead of dropping the tags
  silently. Commits: product `323fd54df` (lane `672847cb7`), fixture corpus
  `a035fdb60` (lane `9cce43828`), three-engine structure `9d1479b90` (lane
  `d4a826ebd`), seam row `38560ea5f` (lane `cd8915701`).
- **Evidence path**: `vp run --no-cache --fail-if-no-match --filter
  @openelement/fixture-third-party-web-components smoke`, default engine set
  chromium + firefox + webkit, **exit 0**. Contract-level cases, 0 failures on
  every engine (chromium 147.0.7727.15, firefox 148.0.2, webkit 26.4): Lit,
  FAST, a real Stencil `dist-custom-elements` host compiled from the fixture's
  own source, and a bare native element each creating an island inside its own
  OPEN shadow root (one of them through a nested pair); a light-DOM late append
  into Shoelace, Material Web and Ionic; exactly-once registration and upgrade;
  a closed-root host present but neither registered nor upgraded, with no page
  error; `open:island-host-timeout` firing exactly once per engine, naming 4
  pending tags with `attempts: 6` and `elapsedMs` 5638 / 5987 / 5675; the unused
  island at `chunkRequests` 0 against 17 / 17 / 15 other island chunks fetched
  on the same page (the positive control that keeps the zero meaningful). **The
  harness does not retry — this run had 0 retries, 0 pageerrors, 0 timeout
  markers.** Lane logs (UNTRACKED, lane t8-design):
  `wt-t8-design/.zcode/scratch/t8/smoke-3engine.log` and
  `wt-t8-design/.zcode/scratch/t8/tier-3engine.json`. Committed anchors:
  `tests/fixtures/third-party-web-components/qualify.ts` (the late-host corpus,
  the per-engine record, the give-up listener) and
  `packages/router/__tests__/island-scheduler.test.ts` (T-1…T-20, including
  T-6/T-6b/T-9/T-9b/T-14).
- **Impact**: the third-party interop fixture could not go green, so the release
  train kept one red step, and the "client-only island inside a foreign shadow
  root" scenario was unqualified. **Resolved in this batch**: the release train
  no longer keeps this red step, and the scenario is qualified on three engines.
- **Owner**: alpha15 batch (T8). Closed.
- **Retirement condition**: MET — T8's three-engine, multi-library cases green
  (`wc-open-child` registers and upgrades inside the Lit shadow root on
  chromium, firefox and webkit).
- **Not this entry**: the advisory tier report still reads `0/11 T0 proved`;
  that is **KR-20** (alpha16), a separate probe-gap item, not a regression of
  this one. Readers should not read the two together.
- **Non-contract observation (recorded, no action taken)**: webkit requested 15
  island chunks where chromium and firefox each requested 17, for the same page
  and the same dist. It affects only the floor of the zero-fetch positive
  control (which asserts > 0), breaks no assertion, and is left as an
  engine-level request-deduplication difference.
- **Latest observation**: 2026-10-18, lane t8-design @ `d4a826ebd` (main-tree
  `9d1479b90`), three-engine run: exit 0, contract failures 0, engine
  differences 0.

## KR-18 · firefox fixture flake: `live.spec.ts:897` and `lit-flow.spec.ts:246`

- **Symptom**: run `39116176828` @ `f395b1e1f` (fork full qualification, 13
  instances) finished only at attempt 3. Attempt 1 failed
  `e2e-full (fixture-gates)` on a firefox 5 s poll timeout in
  `tests/fixtures/router-request-time/e2e/live.spec.ts:897` (the
  `open:ready fires for the load strategy bucket` test). Attempt 2 (rerun of
  the failed job) failed on a DIFFERENT firefox spec,
  `tests/fixtures/router-lit-framework/e2e/lit-flow.spec.ts:246` (back/forward
  after an enhanced submit, 60 s timeout). Attempt 3 passed all 13 instances.
  Both specs pass on chromium/webkit and in other attempts.
- **Evidence path**: `.zcode/plans/alpha15-fix-batch-report-2026-10-18.md`
  (§3) and `.zcode/scratch/audit-verify/lane-release/verdict.md` (independent
  audit read-back); CI run `39116176828` attempts 1/2 failure, 3 success.
- **Policy**: `retries=0` is the APPROVED fixture-gate policy — every fixture
  playwright config pins it (`tests/fixtures/router-request-time/e2e/playwright.config.ts:29`,
  `tests/fixtures/router-lit-framework/e2e/playwright.config.ts:35`, and the
  other five fixture configs). Retries must NOT be restored to hide this flake;
  the red is surfaced instead.
- **Impact**: fixture gates are intermittently red for timing reasons, and a
  real regression could be discounted as "that flake" — the accounting is the
  fix, not the redness.
- **Owner**: alpha16.
- **Retirement condition**: both specs stabilized (cross-engine timer/history
  waits) OR an explicit fixture flake-accounting mechanism adopted (for
  example a flaky-count gate for fixture lanes); never a retries-based mask.
- **Latest observation**: run `39116176828` @ `f395b1e1f` — attempt 1 FAIL
  (`live.spec.ts:897`), attempt 2 FAIL (`lit-flow.spec.ts:246`), attempt 3
  SUCCESS (13/13 job instances).
- **Latest observation (2026-10-18, pre-integration, t6-hygiene lane)**: the
  flake was observed AGAIN, this time under parallel load (several lanes on one
  machine) while that lane ran
  `@openelement/fixture-router-request-time#gate`: firefox timed out in
  `waitForIsland` (15 s `customElements` wait) on a THIRD spec,
  `tests/fixtures/router-request-time/e2e/zag-combobox.spec.ts:349`
  ("same-turn DOM move and disconnect/reconnect do not duplicate listeners");
  that run was 314 passed / 1 failed. The spec alone passes in 1.3 s on an idle
  machine and the whole gate re-run idle is 315 passed / exit 0 (1.1 m); the
  reduced collection count is the `q1b-diagnose.spec.ts` retirement
  (commit `38602f564`: 318 → 315, 1 test × 3 engines). No retry was used to
  hide it, and the observation is not attributed to that lane's diff.
  Attribution evidence: `wt-t6-hygiene/.zcode/scratch/t6-hygiene/06-gates.md`
  (untracked lane scratch).

## KR-19 · `npm create @openelement` execution layer is not offline-coverable (coverage boundary)

- **Symptom / limit**: the documented bootstrap
  `npm create @openelement <name>` cannot be executed by any pre-publish gate:
  npm's initializer alias resolves `@openelement/create` FROM THE REGISTRY, and
  the candidate version does not exist there before the release. A cold-cache
  `--offline` run can only prove the resolution mapping, never the execution.
- **Coverage as of T3** (all four layers in
  `tools/release/published-consumer-qualification.ts`,
  `probeCreateInitializerAlias`):
  1. alias mapping — `npm create @openelement` against a cold `--offline`
     cache must FAIL while naming `@openelement/create`; the probe fails if the
     alias maps elsewhere;
  2. equivalent execution —
     `npm exec --yes --package=<local tarball> -- <bin> <name> --no-install`,
     the same install-and-run mechanism npm's own init uses, running fully
     offline and generating a real app from the packed candidate;
  3. packed CLI — `node <tarball-extract>/package/src/cli.js` usage text must
     equal the canonical `createInstallCommand()` string (single source of the
     documented spelling);
  4. post-publish — the real `npm create @openelement@<version>` call, in the
     consumer smoke (`--smoke`) where the registry exists.
- **Evidence path**: `tools/release/published-consumer-qualification.ts`
  (`--prepublish-alias` mode); wired into
  `tests/e2e/starter-smoke/setup.ts` (runs inside `gate:release`, therefore
  inside `release:check`) and into `.github/workflows/autoflow-release.yml`
  (step "Create initializer alias probe (offline, packed tarball)",
  immediately after "Pack and verify" and before the irreversible publish).
  Lane log (untracked): `.zcode/scratch/t3-release/alias-prepublish-probe.log`.
- **Impact**: without this, every pre-publish alias claim was text-only; with
  it, three of the four layers are mechanically checked before publish and the
  fourth is the documented post-publish smoke.
- **Retirement condition**: a local registry mirror (verdaccio-style) lets the
  real alias execute pre-publish, or the owner designates the post-publish
  smoke as the complete alias proof.
- **Owner**: alpha15 batch (T3) — boundary record, no red.
- **Status**: COVERED-BY-DESIGN.
- **Latest observation**: 2026-10-18, lane/t3-release @ `f395b1e1f` with the
  packed `openelement-create-1.0.0-alpha.15.tgz`: probe PASS; the offline
  resolution line reads
  `request to https://registry.npmjs.org/@openelement%2fcreate failed: cache mode is 'only-if-cached'`
  (that is the mapping proof, not an error); the discriminator run
  `npm create @nope-probe-scope … --offline` names `@nope-probe-scope/create`,
  so the assertion really tracks npm's mapping.

## KR-20 · Third-party WC qualification: advisory T0 tier report reads 0/11

- **Symptom**: the fixture's advisory tier report (`OPEN_ELEMENT_TIER_REPORT`)
  reports `0/11 T0 proved` while the smoke's contract assertions all pass and
  the process exits 0. The 11 entries fail in two shapes: 8 (the tags with no
  authored slot-first child) report the same capture-gap trio — `slot-first
  no-JS content not proved`, `:defined styling transition not proved`,
  `pre-upgrade identity not captured`; the 3 slot-first probe tags
  (`wc-lit-counter`, `sl-button`, `md-filled-button`) report `host or child
  identity lost on upgrade` (the pre-upgrade capture ran, the identity did not
  survive the upgrade).
- **Not related to the late-host fix (T8)**: those are the slot-first /
  `:defined` / pre-upgrade-identity probes. The late-host contract is asserted
  separately (registration, upgrade, nested open shadow root, light-DOM late
  append, closed-root non-crash, unused-tag 0 fetch) and passes. **There is no
  comparable baseline**: before the T8 fix the run never reached the browser
  stage (it stopped at `missing=wc-open-child`), and the t3 negative-proof log
  stops at the registry trap, so the T0 count was never observable.
- **Evidence path**: lane t8-design @ `672847cb7`, chromium base run, smoke
  exit 0; tier report and log at
  `wt-t8-design/.zcode/scratch/t8/tier-chromium-base.json` and
  `wt-t8-design/.zcode/scratch/t8/smoke-chromium-base.log` (lane scratch,
  UNTRACKED). The committed anchor for the gap vocabulary is
  `tests/fixtures/third-party-web-components/qualify.ts` (the `t0Failures`
  list inside the advisory `tierReport`).
- **Impact**: the tier report is advisory and does not gate the smoke
  (`qualify.ts` prints it and returns; the gate is the contract assertions
  before the record), so the release train is unaffected. But a reader sees
  `0/11` with no explanation, which reads as a failed qualification.
- **Owner**: alpha16 — not this batch.
- **Retirement condition**: either the three slot-first probes pass on
  chromium, or the report states them as unsupported-by-design.
- **Latest observation**: 2026-10-18, lane t8-design @ `672847cb7` (chromium,
  base run): `third-party Web Components diagnostic completed: 0/11 T0 proved;
  T1/T2 not run`, smoke exit 0, zero error markers in the log.
