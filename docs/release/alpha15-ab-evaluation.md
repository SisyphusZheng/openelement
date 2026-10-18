# Alpha15 byte-level A/B evaluation

Release evidence for the Alpha15 closeout: a controlled comparison of the
round-4 final baseline (`3613d841c`) against the `1.0.0-alpha.15` **final
cleanup candidate**, measured on one machine with one collector over the seven
consumer groups the release qualification covers (five browser fixture gates,
the packed starter consumer, and the docs site).

This edition is a **full re-measurement**, not a re-read of the previous
edition's artifacts: the cleanup batch changed the docs site's build inputs
(pages, derived data, and the shared island runtime), so the previously
qualified candidate's byte table no longer describes the candidate. Baseline A
was rebuilt as a detached worktree, candidate C was rebuilt from its own
snapshot, and both sides were swept again from scratch.

| | |
| --- | --- |
| Baseline A | `3613d841c38c8fe7dbb94ae528e4dfc2eb6139ee` (detached worktree, never written) |
| Candidate C | `d9eb755d39bdc1763e75b7c3875208e8900b051e` (snapshot `e77f113d0`, tree `3299f3f50`, 1584 files) |
| Distance A→C | 178 commits |
| Collector | `collect.mjs`, sha256 `561968e8873be27168fc2ed3f48428736d01d35b6d1dc185e83992c128aee476` |
| Cross-check | `tools/release/css-cost-report.ts`, byte-identical on both sides (blob `676f508d7`) |
| Groups | `router-static-only`, `router-native-framework`, `router-lit-framework`, `router-ui-dogfood`, `router-unocss-probe`, `starter (packed)`, `www` |
| Repetitions | 3 interleaved cold builds per side per group, one warm rebuild per side, 3 interleaved starter rebuilds |
| Environment | macOS arm64, Node 24.18.0, pnpm 12.x, `NODE_ENV=production` on every build, npm cache outside the repository |

## Provenance

1. **The candidate tree is the commit.** The candidate side is an rsync copy of
   the clean main worktree (excluding `.git/`, `node_modules/`, `dist/`,
   `test-results/`, `.npm-cache/`), snapshotted into a local git repository.
   The snapshot's tree hash equals the candidate commit's tree hash:
   - commit tree: `3299f3f5095e399b75441634970ff945805613c9` (1584 files)
   - copy tree: `3299f3f5095e399b75441634970ff945805613c9` (1584 files)
   No file differs, none is missing, none is extra. The snapshot's own commit
   is `e77f113d05400d04e294a4f1692347bfa62f0dc7`.
2. **Baseline A is never written.** `git status --porcelain` was empty before
   and after the sweep, and the harness patch file the starter leg needs is
   removed again at the end of that leg.
3. **The main worktree stays clean.** Its `git status --porcelain` was empty
   before, during and after the measurement; the sweep writes only outside the
   repository.
4. **The collector did not change.** Its sha256 matches the hash the previous
   edition used, the canonical cross-check tool is byte-identical on both
   sides, and the A column reproduces the previous edition's A numbers exactly
   (raw, gzip and file counts for every group) — the harness itself is
   unchanged across editions.

## Measurement method

- **Cold** = immediately after `tools/repo/clean.ts <dist>`; **warm** = the
  same build re-run with `dist` in place. Sides alternate within every
  repetition, so ambient drift affects both sides.
- Per file: raw bytes, `zlib.gzipSync(level 9)`, and brotli quality 11.
- A group total is the whole emitted output tree for that consumer
  (`walk(dist)`), the round-4 calibre. The delivery closure (each
  `<script src>` plus `<link rel="modulepreload">`, following static import
  edges only) is reported separately for entry/runtime attribution.
- The docs site is counted twice: with and without `pagefind` (its index is
  not byte-deterministic; one file's gzip moves by one byte between
  repetitions, as the determinism section shows).

## Results: baseline A → candidate C

| group | A raw | C raw | Δraw | Δraw % | A gzip | C gzip | Δgzip | Δgzip % | A br | C br | A files | C files |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| router-static-only | 1 767 | 2 163 | **+396** | 22.4 % | 968 | 1 207 | **+239** | 24.7 % | 609 | 778 | 3 | 4 |
| router-native-framework | 887 015 | 918 570 | **+31 555** | 3.6 % | 207 156 | 217 069 | **+9 913** | 4.8 % | 168 598 | 176 604 | 14 | 17 |
| router-lit-framework | 942 295 | 966 008 | **+23 713** | 2.5 % | 218 119 | 226 030 | **+7 911** | 3.6 % | 177 926 | 183 897 | 17 | 19 |
| router-ui-dogfood | 199 308 | 212 722 | **+13 414** | 6.7 % | 56 608 | 62 004 | **+5 396** | 9.5 % | 48 161 | 52 876 | 30 | 33 |
| router-unocss-probe | 140 160 | 148 513 | **+8 353** | 6.0 % | 43 872 | 47 256 | **+3 384** | 7.7 % | 37 653 | 40 604 | 10 | 14 |
| starter (packed) | 674 382 | 710 096 | **+35 714** | 5.3 % | 175 910 | 187 684 | **+11 774** | 6.7 % | 144 068 | 153 544 | 23 | 26 |
| www (pagefind excluded) | 12 042 864 | 11 986 116 | **−56 748** | -0.5 % | 2 101 987 | 2 084 970 | **−17 017** | -0.8 % | 1 595 154 | 1 582 278 | 222 | 206 |
| www (pagefind included) | 13 605 279 | 13 650 796 | **+45 517** | 0.3 % | 3 569 065 | 3 654 506 | **+85 441** | 2.4 % | 3 054 532 | 3 145 312 | 322 | 308 |

The docs site remains the only group that is **smaller than the baseline on
its authored output** (pagefind excluded: −56 748 raw, −17 017 gzip) while its
search index grows by design (pagefind included: +45 517 raw). The fixture
groups are unchanged in shape from the previous edition; their growth is the
shared client runtime (below).

## What this candidate changed relative to the previously qualified candidate

The previous candidate (`0bc1099282e1a69ec0c3e551e6d923bc21d2fe18`) was
qualified with the same baseline and the same harness (its evaluation is the
previous edition of this document). Comparing the two candidate trees isolates
the byte cost of the cleanup batch's production work (tests, docs, and gate
tooling do not ship; only emitted artifacts move):

| group | C_prev raw | C_final raw | Δraw | Δraw % | C_prev gzip | C_final gzip | Δgzip | Δgz % |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| router-static-only | 2 163 | 2 163 | +0 | 0.0 % | 1 207 | 1 207 | +0 | 0.0 % |
| router-native-framework | 917 041 | 918 570 | +1 529 | 0.2 % | 216 475 | 217 069 | +594 | 0.3 % |
| router-lit-framework | 964 479 | 966 008 | +1 529 | 0.2 % | 225 433 | 226 030 | +597 | 0.3 % |
| router-ui-dogfood | 211 193 | 212 722 | +1 529 | 0.7 % | 61 385 | 62 004 | +619 | 1.0 % |
| router-unocss-probe | 146 984 | 148 513 | +1 529 | 1.0 % | 46 639 | 47 256 | +617 | 1.3 % |
| starter (packed) | 708 814 | 710 096 | +1 282 | 0.2 % | 187 161 | 187 684 | +523 | 0.3 % |
| www (pagefind excluded) | 11 915 568 | 11 986 116 | +70 548 | 0.6 % | 2 087 299 | 2 084 970 | −2 329 | -0.1 % |
| www (pagefind included) | 13 576 974 | 13 650 796 | +73 822 | 0.5 % | 3 653 557 | 3 654 506 | +949 | 0.03 % |

The movement is attributable and small:

1. **Exactly +1 529 B of client JavaScript in every fixture and starter group
   that ships the island runtime** (the four island-bearing fixtures and the
   packed starter; the static-only group ships neither path and does not move),
   and **+1 531 B** in the docs site's client chunk. This is the bounded
   late-host probe added to `packages/router/src/vite/internal/ssg/island-scheduler.ts`
   (`+319/−6` source lines): the generic fix for a third-party component
   creating an island's host inside its own open shadow root after the ready
   scan. It is the only production-source change in this batch that emits
   bytes, and it lands in every group's shared runtime chunk identically.
2. **The docs site's HTML grows by 45 540 B raw but shrinks by 4 616 B gzip
   versus the previous candidate.** The added markup is authored and
   repetitive — `/reference` export rows gain `role="list"`/`role="listitem"`
   plus section aria labels, the zh chrome gains localized aria labels, the
   blog's hidden 404 fallback loses a duplicate `<h1>`, and the guides absorb
   the corrected quickstart commands and derived release/component counts.
   Repetitive attributes compress far better than the prose they replace (the
   description trimming removes ≥160-character ledes), which is why gzip moves
   in the opposite direction from raw.
3. **The delivery closure shape is unchanged by this batch.** No group gains a
   module script, no previously lazy island chunk becomes eager, and the
   stylesheet/modulepreload topology is identical to the previously qualified
   candidate. No style-emitter source file changed in this batch; the A→C
   stylesheet-link collapse (`698 → 320`) was already present in the previously
   qualified candidate and belongs to the wider alpha15 line, not to this
   cleanup batch.
4. **Non-build-input work costs zero bytes**: the committed known-reds ledger,
   ADR-0169 and the platform ledger, the four new source-registry readers, the
   claim checker, the docs re-baseline, the `_headers` cache policy, the test
   suites, and the www budget/perf harnesses are not inputs to any measured
   build.

| group | client JS A→C (raw) | Δ raw / gzip | server-only A→C (raw) | Δ raw / gzip | HTML A→C (raw) | Δ raw / gzip |
| --- | --- | --- | --- | --- | --- | --- |
| router-static-only | 0 → 0 | +0 / +0 | 0 → 0 | +0 / +0 | 1 767 → 2 058 | +291 / +149 |
| router-native-framework | 123 743 → 131 065 | +7 322 / +2 754 | 761 108 → 784 663 | +23 555 / +6 926 | 867 → 964 | +97 / +52 |
| router-lit-framework | 41 006 → 43 343 | +2 337 / +1 022 | 898 586 → 919 554 | +20 968 / +6 678 | 1 801 → 1 995 | +194 / +103 |
| router-ui-dogfood | 146 601 → 158 917 | +12 316 / +4 691 | 0 → 0 | +0 / +0 | 16 194 → 16 562 | +368 / +465 |
| router-unocss-probe | 96 106 → 103 080 | +6 974 / +2 781 | 0 → 0 | +0 / +0 | 1 934 → 2 145 | +211 / +87 |
| starter (packed) | 102 067 → 109 103 | +7 036 / +2 808 | 520 493 → 547 937 | +27 444 / +8 560 | 15 237 → 15 553 | +316 / +156 |
| www (pagefind excluded) | 286 803 → 291 710 | +4 907 / +1 960 | 0 → 0 | +0 / +0 | 10 991 211 → 10 876 285 | −114 926 / −22 776 |
| www (pagefind included) | 286 803 → 291 710 | +4 907 / +1 960 | 0 → 0 | +0 / +0 | 10 991 211 → 10 876 285 | −114 926 / −22 776 |

The A→C client-JavaScript deltas are dominated by the shared runtime change
(the same compiled probe appears once per group's runtime chunk); the delta
between groups is the authored route/component code each fixture ships. The
server-only column moves only in the groups that run request-time rendering,
and its delta is the compile-time composition of the same runtime plus the
new island-probe branch in the scheduler module.

## Determinism

Byte output collapses across the three cold repetitions on both sides for every
group except the third-party `pagefind` index:

| group | A (3 cold reps) | C (3 cold reps) |
| --- | --- | --- |
| router-static-only | `3:1767:968` | `4:2163:1207` |
| router-native-framework | `14:887015:207156` | `17:918570:217069` |
| router-lit-framework | `17:942295:218119` | `19:966008:226030` |
| router-ui-dogfood | `30:199308:56608` | `33:212722:62004` |
| router-unocss-probe | `10:140160:43872` | `14:148513:47256` |
| starter (packed) | `23:674382:175910` | `26:710096:187684` |
| www (pagefind included) | `322:13605279:3569065` (br: 3054532/3054533/3054532) | `308:13650796:3654506` (gzip: 3654506/3654505/3654505; br: 3145312/3145311/3145311) |

The only non-collapse anywhere is the third-party `pagefind` output: on both
sides its raw bytes and file counts are constant across repetitions while one
index file's gzip and brotli totals each move by one byte. It is never used
for a byte-parity claim. Every other group reproduces its raw, gzip and file
counts exactly across all three repetitions on both sides.

## Delivery closure

| group | stylesheet links | module scripts | modulepreload | client-manifest keys | island-manifest files | inline module JS bytes |
| --- | --- | --- | --- | --- | --- | --- |
| router-static-only | 0 → 0 | 0 → 0 | 0 → 0 | n/a → n/a | 0 → 0 | 0 → 0 |
| router-native-framework | 0 → 0 | 1 → 1 | 0 → 0 | 5 → 7 | 1 → 1 | 0 → 0 |
| router-lit-framework | 0 → 0 | 2 → 2 | 0 → 0 | 4 → 5 | 2 → 2 | 0 → 0 |
| router-ui-dogfood | 30 → 30 | 6 → 6 | 0 → 4 | 8 → 10 | 6 → 6 | 0 → 0 |
| router-unocss-probe | 4 → 4 | 1 → 1 | 0 → 1 | 3 → 6 | 1 → 1 | 0 → 0 |
| starter (packed) | 10 → 10 | 2 → 2 | 0 → 1 | 5 → 7 | 2 → 2 | 0 → 0 |
| www (pagefind excluded) | 698 → 320 | 74 → 74 | 0 → 74 | 29 → 31 | 74 → 74 | 0 → 0 |
| www (pagefind included) | 698 → 320 | 74 → 74 | 0 → 74 | 29 → 31 | 74 → 74 | 0 → 0 |

This table is identical to the previous edition's: the cleanup batch moves
bytes **inside** existing delivery edges, not the edge topology. That is the
expected result for a batch whose production change is one scheduler file plus
authored site content.

## Timing

Build wall time is recorded for completeness but is **not** used for any claim
in this round: the machine was not quiet (load average 4.15 → 8.99 during the
sweep; the sweep itself is the load source, and the reporter's own runs overlap
its clean/build phases). Timing remains advisory only across editions; the
byte-level tables above are the claim.

| group | mode | A runs (ms) | C runs (ms) | n | A median | C median | Δmedian | A spread | C spread |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| router-static-only | cold | 1532 / 767 / 829 | 1808 / 943 / 948 | 3 / 3 | 829 | 948 | +119 (14.4 %) | 765 | 865 |
| router-static-only | warm | 793 | 938 | 1 / 1 | 793 | 938 | +145 (18.3 %) | 0 | 0 |
| router-native-framework | cold | 1024 / 996 / 974 | 1168 / 1224 / 1179 | 3 / 3 | 996 | 1179 | +183 (18.4 %) | 50 | 56 |
| router-native-framework | warm | 971 | 1170 | 1 / 1 | 971 | 1170 | +199 (20.5 %) | 0 | 0 |
| router-lit-framework | cold | 817 / 833 / 847 | 1024 / 1011 / 997 | 3 / 3 | 833 | 1011 | +178 (21.4 %) | 30 | 27 |
| router-lit-framework | warm | 823 | 1000 | 1 / 1 | 823 | 1000 | +177 (21.5 %) | 0 | 0 |
| router-ui-dogfood | cold | 3370 / 1162 / 1142 | 2849 / 1331 / 1311 | 3 / 3 | 1162 | 1331 | +169 (14.5 %) | 2228 | 1538 |
| router-ui-dogfood | warm | 1144 | 1323 | 1 / 1 | 1144 | 1323 | +179 (15.6 %) | 0 | 0 |
| router-unocss-probe | cold | 1738 / 1228 / 1210 | 1926 / 1419 / 1438 | 3 / 3 | 1228 | 1438 | +210 (17.1 %) | 528 | 507 |
| router-unocss-probe | warm | 1228 | 1460 | 1 / 1 | 1228 | 1460 | +232 (18.9 %) | 0 | 0 |
| www | cold | 21302 / 20877 / 35387 | 23434 / 25087 / 26825 | 3 / 3 | 21302 | 25087 | +3785 (17.8 %) | 14510 | 3391 |
| www | warm | 22372 | 23930 | 1 / 1 | 22372 | 23930 | +1558 (7.0 %) | 0 | 0 |

| starter rebuild | A runs (ms) | C runs (ms) |
| --- | --- | --- |
| rep 1 | 1244 | 1143 |
| rep 2 | 1027 | 1149 |
| rep 3 | 1063 | 1155 |

The direction matches the previous edition's advisory table (candidate builds
are slower while the machine is busy in both rounds); the absolute spreads on
both sides exceed most of the medians' differences, so no regression claim is
made here.

## Limitations

1. **Timing is load-polluted in this round** (see above). Byte counts are not:
   they are output bytes, and both sides ran in the same conditions.
2. **n = 3 cold, n = 1 warm** per group and side; the packed starter is
   rebuilt three times per side.
3. Both sides run in equal-length paths, but `__vite__mapDeps` ordering can
   still move a gzip/brotli byte while raw length is identical; the pagefind
   index is the only artifact that shows it here.
4. The measurement is a build-output inventory, not a browser loading
   measurement: cold/warm mean build-cache states, not HTTP or page caches, and
   no runtime or hydration timing is claimed here.
5. The starter leg's install and pack phases are excluded from comparison; only
   its repeated build is measured.
6. This evaluation covers exactly the candidate SHA above. A successor commit
   needs a fresh candidate tree and a re-run; old-SHA numbers are not
   transferable.
7. The docs-site byte totals here are the collector's whole-`dist` inventory
   for the sweep's build. The published "Total static output" figure in
   `comparison.md` is measured by the site's own build pipeline and gated by
   `check:doc-figures` (±1 %); the two recipes are not interchangeable, which
   is why this document quotes its own totals and never reuses the site figure.

## Reproduce

The measurement harness (collector, sweep driver, starter leg, report
regression script and the canonical cross-check wrapper) is attached to this
evaluation's release evidence rather than shipped in the published tree. The
protocol it implements is:

1. **Baseline.** Keep a detached worktree at `3613d841c` outside the repository
   and verify its `git status --porcelain` is empty before and after the run.
2. **Candidate tree.** Copy the clean candidate worktree (excluding `.git/`,
   `node_modules/`, `dist/`, test output and caches) into a scratch directory,
   snapshot it into a local git repository, and require its tree hash to equal
   the candidate commit's tree hash before installing dependencies from its own
   lockfile.
3. **Sweep.** For each of the six build groups, alternate baseline and
   candidate builds within each of three cold repetitions, clean each `dist`
   first, then run one warm rebuild per side; collect per-file raw/gzip/brotli
   bytes and the delivery closure from each output tree. Run the packed-starter
   leg separately (pack tarballs, scaffold a consumer, install, then three
   interleaved rebuilds).
4. **Cross-check.** Recompute the class totals with
   `tools/release/css-cost-report.ts` from each side's own tree and compare
   them with the collector's numbers on the same `dist`.
5. **Regression.** Re-read this document's tables and assert every number
   against the recorded artifacts.

## Validation of this document

`report-repro-final.mjs` re-reads the tables above and the measurement
artifacts and asserts every number; it reported **86 assertions, 0 failed**. The
canonical `tools/release/css-cost-report.ts` cross-check compared 98 class
totals over both sides and all seven groups and reported **0 disagreements**.

## Delta note

The measurement was taken on `d9eb755d39bdc1763e75b7c3875208e8900b051e`.
The only delta to the submitted final SHA is **this evaluation document**,
which is not an input to any measured build (it lives under `docs/`, outside
`www/content` and outside every package source set), so it cannot move a byte
or a timing in the tables. The exact-SHA full qualification is re-run on the
final SHA.

This is the second sweep of the same candidate line. The first (at
`4596a122d`) was invalidated by a post-measurement security fix in
`packages/create/src/template-builder.ts` that replaced two quadratic regexes
with linear scans; before freezing, the candidate was **re-measured from a
freshly built tree** and the sweep reproduced the first measurement exactly —
identical raw, gzip and file totals for every group — which is the machine
proof that the fix moves no bytes. The numbers in this document are the
re-measured set, not a copy of the earlier run.
