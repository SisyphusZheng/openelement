# alpha15 cleanup batch — retrospective

Date: 2026-10-19. Candidate: `ef5da43e45d887b214841a99c26d3f8d2dac358b`
(branch `alpha15`; the batch works in a single worktree, commit-less per lane).
Task book: `OpenElement_Clean_Solution_TaskBook_2026-10-19.md`.
Independent review being answered: `OpenElement_PR1611_Final_Review_2026-10-19_ef5da43.md`.

This is the release/evidence lane's retrospective. It records the decisions of
the whole batch where they are already written down elsewhere (each lane's
evidence file or ADR), and it does not re-narrate other lanes' results from
memory — the linked file is the authority.

## 1. Decisions taken in this batch

| area | decision | recorded at |
| --- | --- | --- |
| S-01/S-02 (FR-01) | `dist/server` is a private artifact: the shared static boundary refuses the `server/` segment after decode/normalize/realpath; deployment and security docs state it | ADR-0171, `docs/release/evidence/alpha15/` (security lane evidence), `www/content/docs/guide/deployment.md` |
| FRM-01 (FR-01 review item, lang) | document language resolution gets its own ADR rather than inheriting the locale default silently | ADR-0172 |
| FRM-03 / FRM-04 (FR-02/FR-03) | bounded late-host activation with an explicit give-up announcement; the deadline is checked at the scanning and continuation entries | ADR-0170, `packages/router/src/vite/internal/ssg/island-scheduler.ts` |
| FRM-07C (FR-05) | run 39216159302's three observations classified separately; the packed-consumer probe now classifies its timeout | `docs/release/evidence/alpha15/frm07-timeout-classification.md` |
| REL-02 (FR-06) | CodeQL disposition record for #4238/#4241 with the authoritative per-ref alert list and the thread-number correction | `docs/release/evidence/alpha15/rel02-codeql-disposition.md` |
| DOC-01 / DOC-02 (FR-07 and content gate) | Site version/command truth corrected; the existing content-example gate audited (coverage/exemptions), gaps closed with tests instead of a new gate | `docs/release/evidence/alpha15/doc01-site-alpha15.md`, `doc02-content-gate-audit.md` |
| DX-02 | browser automation for timing/morph/preserve/390px/keyboard added; automation is explicitly not a screen-reader test | `docs/release/evidence/alpha15/dx02-browser-automation.md` |

## 2. Release-evidence decisions (this lane)

- **REL-01 — evidence is bound by script, never by a hand-written table.**
  `tools/release/evidence-bind.ts` reads the exact-`head_sha` AutoFlow CI runs,
  per-job-instance conclusions, artifacts, the authoritative CodeQL list for
  `refs/pull/<n>/merge`, the six npm dist-tags and the tag/Release state, then
  prints the PR/release checklist snippet. Standing decision: **a run qualifies
  only when its own job instances satisfy the nine-job/twelve-instance contract
  with every instance `success`**; a cancelled or failed run is recorded as
  history and can never be selected. `--require-main-push` adds the release
  lane's push/main rule. Offline/fixture and `--check` modes evaluate recorded
  answers with the same rules, and an unqueried dimension is a loud SKIP (never
  a silent pass).
- **REL-03 — the raw measurement package is obtainable before approval through
  an evidence-only prerelease on the release fork.** Rejected: committing the
  archive (CONTRIBUTING forbids temporary evidence; it is a per-measurement
  binary) and relying on a CI artifact (the archive is produced out of band,
  artifacts expire, and downloads need auth). The tracked README pins the
  archive's sha256/bytes/member counts and documents the fetch path; the
  verifier re-checks all of it, including the JFB numbers recomputed from the
  raw per-invocation JSON.
- **REL-04 — the qualification toolchain is pinned by owner files and
  reproduced as a container recipe.** `.node-version` (Node 24.18.0),
  `package.json` `packageManager` (pnpm 12.8.1), `devDependencies`
  (`playwright` == `@playwright/test` 1.59.1) and the Debian bookworm base
  image in `tools/release/toolchain/Dockerfile`. A pin verifier fails on any drift
  across those files, the lockfile and the CI workflows. It is a
  release-preflight step, not a new CI job: adding a workflow step would change
  the pinned gate counts.
- **REL-05 — FR-08/A6 is an environment-specific observation plus a real
  removal-path defect, and the defect is fixed.** On the fixed toolchain the A6
  built-output assertion passes 6/6 and no `www/dist/server` exists at any
  depth. The review's symptom shape is explained by the pure-static build's
  swallowed `rm`: the build logged a removal it had discarded the result of.
  `finalizePureStaticOutput()` now removes, re-checks, logs only a verified
  removal and fails the build otherwise (hard fail chosen over a warning:
  `dist/server` is server code and must never ship to static hosting). The A6
  file's assertions were not weakened.
- **REL-06 — one dry-run preflight before any owner-gated action.**
  `tools/release/release-preflight.ts` composes the read-only verifiers, the
  existing gate entry points (by `package.json` script name), the REL-01
  evidence binding, and the owner-gated tag/publish/Release/asset/dist-tag
  sequence with read-backs. It is a dry run by default and refuses every
  destructive action unless `--authorize-destructive`, a matching
  `--confirm-sha` and `OPEN_ELEMENT_RELEASE_APPROVED=1` are present — and even
  then it only prints the steps for the owner; it never publishes.

## 3. Exact-SHA evidence state at the end of the batch

Produced live by the binder (point-in-time read; re-run before approval):

```text
node tools/release/evidence-bind.ts --sha ef5da43… --pr 1611 \
  --repo SisyphusZheng/openelement --codeql-repo open-element/openelement \
  --tag v1.0.0-alpha.15
```

- qualification run 39219887454 (attempt 1, `workflow_dispatch`, head_sha
  `ef5da43…`): 13 job instances, all `success` — nine required job IDs,
  twelve instances, plus `sha-guard`;
- history, never qualification: run 39216159302 `failure` and run
  39214493482 `cancelled` (the run the PR body used to cite as "13/13");
- CodeQL on `refs/pull/1611/merge`: authoritative list read (23 alerts); open
  state at read time: #4241 (warning) — every dismissal/fix is listed
  individually by the binder, not summarized;
- npm dist-tags: six packages on `1.0.0-alpha.14` for `alpha` and `latest`;
- tag `v1.0.0-alpha.15`: absent; GitHub Release: absent.

Raw output: `/tmp/release-evidence/rel01/live-checklist.md`,
`/tmp/release-evidence/rel01/live.json`.

## 4. Residual risk and unverified items

1. **The raw-package handoff prerelease does not exist yet.** It is an owner
   action (one `gh release create --prerelease` command, documented in
   `docs/release/evidence/alpha15/README.md`); until it exists a reviewer can
   only verify a locally staged copy. This is the last step of REL-03's
   "obtainable before approval" acceptance.
2. **The publication Release does not attach the raw archive.** The Release
   workflow creates per-package Releases and has no asset step; the preflight
   prints the exact owner command and flags the open decision (which Release
   carries the evidence asset now that the umbrella Release is retired). If the
   Lead wants this automated, it is a release-workflow change (this lane owns
   that file) — kept out of the batch to avoid changing the release train
   without an owner decision.
3. **The fixed-toolchain image was not built here.** Docker is absent on the
   qualification host; the recipe is verified statically by the pin auditer.
   Building it is a next-machine release-preflight step, and the resolved image
   digests must be recorded in the qualification report.
4. **The `www` empty-directory A6 rebuild is deferred to the Lead's
   consolidation build** (Lane E was editing site content; `site:build` starts
   with `generate:all`). The existing-tree evidence is in REL-05's document;
   the consolidation build replaces it.
5. **The evidence binder's live path needs `gh` auth and network.** Its offline
   `--fixtures`/`--check` modes are tested, but the live checklist above is a
   point-in-time read and must be regenerated at approval time.
6. **Open CodeQL #4241 (warning)** is a disposition item owned by the CodeQL
   lane/REL-02; the binder will keep listing it until it is fixed or dismissed.

## 5. alpha16 backlog pointers

The committed register is `docs/maintainers/alpha16-candidates.md`; this section
does not duplicate it. New pointers this batch produced, for the Lead to fold
into that register (Lead-owned file, not edited here):

- automate the evidence-only handoff prerelease and the Release asset
  attachment (REL-03) so a reviewer's first verification never depends on a
  manual command;
- build and publish the fixed-toolchain image in the release train and record
  the resolved base/toolchain digests in the qualification report;
- have REL-07's PR body render the REL-01 binder output directly instead of
  pasting a checklist, so a stale run pointer cannot reappear;
- add a stale-output contract test for hybrid projects (a pre-existing
  `dist/server/index.js` is deployable contract output — make that state
  explicitly tested, like the new pure-static cases);
- document the evidence-only prerelease policy (tag namespace, retention,
  not-a-release semantics) in CONTRIBUTING.

## 6. Verification runs of this lane

| command | result | wall |
| --- | --- | --- |
| `pnpm exec vitest run --project tools tools/release/evidence-bind.test.ts` | 18 passed | 1.19 s |
| `pnpm exec vitest run --project tools tools/release/verify-evidence-archive.test.ts` | 8 passed, incl. the real archive end to end | 1.8 s |
| `pnpm exec vitest run --project tools tools/release/check-toolchain-pins.test.ts` | 9 passed | 0.1 s |
| `pnpm exec vitest run --project tools tools/release/release-preflight.test.ts` | 15 passed | 0.13 s |
| `pnpm exec vitest run --project router packages/router/__tests__/build-ssg-bundle-url.test.ts` | 7 passed (5 new) | 1.07 s |
| `node tools/release/verify-evidence-archive.ts` | 14/14 PASS, VERDICT: verified | 1.09 s |
| `node tools/release/evidence-bind.ts …` (live) | QUALIFIED (run 39219887454; history recorded) | 20 s |
| `node tools/release/check-toolchain-pins.ts` | VERDICT: pins agree | 0.1 s |
| `node tools/release/release-preflight.ts --run-local` | dry-run plan + both read-only checks PASS | 0.56 s |
| A6 single-file test against the existing `www/dist` | 6/6 passed | 1.74 s |

## 7. Lead-owned follow-ups

- `docs/maintainers/known-reds-ledger.md`: the FR-08/A6 row text proposed in
  `docs/release/evidence/alpha15/rel05-a6-adjudication.md` §6 (fix landed; do
  not weaken the A6 assertion).
- `docs/maintainers/alpha16-candidates.md`: fold in the five pointers in §5.
- PR body (REL-07): paste the binder's checklist snippet, not a hand-written
  table; the exact-SHA pointer is run 39219887454, and the cancelled run
  39214493482 stays in history.
- Tag/publish/Release/asset/dist-tag and the handoff prerelease remain
  owner-gated (REL-08); the preflight's dry-run plan is the checklist.
