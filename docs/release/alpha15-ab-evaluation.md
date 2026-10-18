# Alpha15 byte-level A/B evaluation

Release evidence for the Alpha15 closeout: a controlled comparison of the
round-4 final baseline (`3613d841c`) against the `1.0.0-alpha.15` candidate,
measured on one machine with one collector over the seven consumer groups the
release qualification covers (five browser fixture gates, the packed starter
consumer, and the docs site).

| | |
| --- | --- |
| Baseline A | `3613d841c38c8fe7dbb94ae528e4dfc2eb6139ee` (detached worktree, never written) |
| Candidate C | `0bc1099282e1a69ec0c3e551e6d923bc21d2fe18` (snapshot `e090b4a9c`, tree `a565eb8708a36a99c9156c1675c1b164af132371`, 1545 files) |
| Collector | `collect.mjs`, sha256 `561968e8873be27168fc2ed3f48428736d01d35b6d1dc185e83992c128aee476` |
| Cross-check | `tools/release/css-cost-report.ts`, byte-identical on both sides |
| Groups | `router-static-only`, `router-native-framework`, `router-lit-framework`, `router-ui-dogfood`, `router-unocss-probe`, `starter (packed)`, `www` |
| Repetitions | 3 interleaved cold builds per side per group, one warm rebuild per side, 3 interleaved starter rebuilds |
| Environment | macOS arm64, Node 24.18.0, pnpm 12.x, `NODE_ENV=production` on every build, npm cache outside the repository |

## Provenance

1. **The candidate tree is the commit.** The candidate side is an rsync copy of
   the clean main worktree (excluding `.git/`, `node_modules/`, `dist/`,
   `test-results/`, `.npm-cache/`), snapshotted into a local git repository.
   The snapshot's tree hash equals the candidate commit's tree hash:
   - commit tree: `a565eb8708a36a99c9156c1675c1b164af132371` (1545 files)
   - copy tree: `a565eb8708a36a99c9156c1675c1b164af132371` (1545 files)
   No file differs, none is missing, none is extra.
2. **Baseline A is never written.** `git status --porcelain` was empty before
   and after the sweep, and the harness patch file the starter leg needs is
   removed again at the end of that leg.
3. **The main worktree stays clean.** Its `git status --porcelain` was empty
   before, during and after the measurement; the sweep writes only outside the
   repository.
4. **The collector did not change.** Its sha256 matches the hash the previous
   edition used, and the canonical cross-check tool is byte-identical on both
   sides.

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
| router-native-framework | 887 015 | 917 041 | **+30 026** | 3.4 % | 207 156 | 216 475 | **+9 319** | 4.5 % | 168 598 | 176 061 | 14 | 17 |
| router-lit-framework | 942 295 | 964 479 | **+22 184** | 2.4 % | 218 119 | 225 433 | **+7 314** | 3.4 % | 177 926 | 183 365 | 17 | 19 |
| router-ui-dogfood | 199 308 | 211 193 | **+11 885** | 6.0 % | 56 608 | 61 385 | **+4 777** | 8.4 % | 48 161 | 52 310 | 30 | 33 |
| router-unocss-probe | 140 160 | 146 984 | **+6 824** | 4.9 % | 43 872 | 46 639 | **+2 767** | 6.3 % | 37 653 | 40 027 | 10 | 14 |
| starter (packed) | 674 382 | 708 814 | **+34 432** | 5.1 % | 175 910 | 187 161 | **+11 251** | 6.4 % | 144 068 | 153 018 | 23 | 26 |
| www (pagefind excluded) | 12 042 864 | 11 915 568 | **−127 296** | -1.1 % | 2 101 987 | 2 087 299 | **−14 688** | -0.7 % | 1 595 154 | 1 577 018 | 222 | 205 |
| www (pagefind included) | 13 605 279 | 13 576 974 | **−28 305** | -0.2 % | 3 569 065 | 3 653 557 | **+84 492** | 2.4 % | 3 054 532 | 3 136 788 | 322 | 307 |

## What this candidate changed relative to the previously qualified candidate

The previous candidate (`53fc1d4fb2c8ec16975018e2aab21ce41426cec8`) was
measured with the same baseline and the same harness. Comparing the two
candidate trees isolates the byte cost of this update's defect-closure work
(tests and docs do not ship; only emitted artifacts move):

| group | C_prev raw | C_final raw | Δraw | Δraw % | C_prev gzip | C_final gzip | Δgzip | Δgz % |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| router-static-only | 2 163 | 2 163 | +0 | 0.0 % | 1 207 | 1 207 | +0 | 0.0 % |
| router-native-framework | 907 371 | 917 041 | +9 670 | 1.1 % | 213 463 | 216 475 | +3 012 | 1.4 % |
| router-lit-framework | 954 337 | 964 479 | +10 142 | 1.1 % | 221 870 | 225 433 | +3 563 | 1.6 % |
| router-ui-dogfood | 210 040 | 211 193 | +1 153 | 0.5 % | 60 844 | 61 385 | +541 | 0.9 % |
| router-unocss-probe | 145 846 | 146 984 | +1 138 | 0.8 % | 46 113 | 46 639 | +526 | 1.1 % |
| starter (packed) | 695 983 | 708 814 | +12 831 | 1.8 % | 182 826 | 187 161 | +4 335 | 2.4 % |
| www (pagefind excluded) | 11 866 477 | 11 915 568 | +49 091 | 0.4 % | 2 074 837 | 2 087 299 | +12 462 | 0.6 % |
| www (pagefind included) | 13 503 737 | 13 576 974 | +73 237 | 0.5 % | 3 616 990 | 3 653 557 | +36 567 | 1.0 % |

The movement is attributable and small: every island-bearing group gains
roughly one kilobyte of client JavaScript (the compiled-class URL sink screen
and the leading-static-style-node helper in the shared runtime), and the
native/lit/starter groups gain several kilobytes of server-only JavaScript
(the route head-fragment allowlist scanner and the PRG canonicalizer in the
request-time runtime). The static-only group is unchanged because it ships
neither path. The docs site's ~48 KB HTML growth is authored content (the
re-baselined measurement page and the rewritten guides), not framework bytes.
No group loses a feature or gains an unexplained chunk.

| group | client JS A→C (raw) | Δ raw / gzip | server-only A→C (raw) | Δ raw / gzip | HTML A→C (raw) | Δ raw / gzip |
| --- | --- | --- | --- | --- | --- | --- |
| router-static-only | 0 → 0 | +0 / +0 | 0 → 0 | +0 / +0 | 1 767 → 2 058 | +291 / +149 |
| router-native-framework | 123 743 → 129 536 | +5 793 / +2 160 | 761 108 → 784 663 | +23 555 / +6 926 | 867 → 964 | +97 / +52 |
| router-lit-framework | 41 006 → 41 814 | +808 / +425 | 898 586 → 919 554 | +20 968 / +6 678 | 1 801 → 1 995 | +194 / +103 |
| router-ui-dogfood | 146 601 → 157 388 | +10 787 / +4 072 | 0 → 0 | +0 / +0 | 16 194 → 16 562 | +368 / +465 |
| router-unocss-probe | 96 106 → 101 551 | +5 445 / +2 164 | 0 → 0 | +0 / +0 | 1 934 → 2 145 | +211 / +87 |
| starter (packed) | 102 067 → 107 574 | +5 507 / +2 191 | 520 493 → 548 214 | +27 721 / +8 683 | 15 237 → 15 545 | +308 / +142 |
| www (pagefind excluded) | 286 803 → 290 179 | +3 376 / +1 349 | 0 → 0 | +0 / +0 | 10 991 211 → 10 830 745 | −160 466 / −18 160 |
| www (pagefind included) | 286 803 → 290 179 | +3 376 / +1 349 | 0 → 0 | +0 / +0 | 10 991 211 → 10 830 745 | −160 466 / −18 160 |

## Determinism

Byte output collapses across the three cold repetitions on both sides for
every group:

| group | A (3 cold reps) | C (3 cold reps) |
| --- | --- | --- |
| router-static-only | `3:1767:968` | `4:2163:1207` |
| router-native-framework | `14:887015:207156` | `17:917041:216475` |
| router-lit-framework | `17:942295:218119` | `19:964479:225433` |
| router-ui-dogfood | `30:199308:56608` | `33:211193:61385` |
| router-unocss-probe | `10:140160:43872` | `14:146984:46639` |
| starter (packed) | `23:674382:175910` | `26:708814:187161` |
| www (pagefind included) | `322:13605279:3569065` (br: 3054532/3054533/3054533) | `307:13576974:3653557` (br: 3136788/3136788/3136785) |

The only non-collapse anywhere is third-party `pagefind` output (one file's
gzip 183/182/183 B in the previous round; this round the brotli totals drift by
up to 3 B while raw stays constant) — never used for a byte-parity claim. The A
side also reproduces the previously recorded A column raw/gzip/files exactly;
only the starter and pagefind-included brotli totals differ from the frozen
edition by 5 B and 1 B respectively, the same equal-length permutation effect
the previous edition documented (raw, gzip and file counts are identical).

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

The shape is unchanged by this update: no group gains a module script, no
previously lazy island chunk becomes eager, and the only `modulepreload`
entries are the per-page shared runtime preload that the docs site and the
island-bearing fixtures already had.

## Timing

Build wall time is recorded for completeness but is **not** used for any claim
in this round: the machine was not quiet (load average 4.45 → 5.87, 15-minute
average 5.3–8.4, because the candidate was qualified in parallel on the same
host). The previous edition's 18/18 cold-pair regression remains the recorded
timing evidence; this round's raw numbers are below, advisory only.

| group | mode | A runs (ms) | C runs (ms) | n | A median | C median | Δmedian | A spread | C spread |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| router-static-only | cold | 1502 / 791 / 695 | 1714 / 1021 / 825 | 3 / 3 | 791 | 1021 | +230 (29.1 %) | 807 | 889 |
| router-static-only | warm | 657 | 847 | 1 / 1 | 657 | 847 | +190 (28.9 %) | 0 | 0 |
| router-native-framework | cold | 1092 / 985 / 939 | 1144 / 1112 / 1107 | 3 / 3 | 985 | 1112 | +127 (12.9 %) | 153 | 37 |
| router-native-framework | warm | 913 | 1110 | 1 / 1 | 913 | 1110 | +197 (21.6 %) | 0 | 0 |
| router-lit-framework | cold | 825 / 816 / 780 | 1094 / 1066 / 996 | 3 / 3 | 816 | 1066 | +250 (30.6 %) | 45 | 98 |
| router-lit-framework | warm | 792 | 981 | 1 / 1 | 792 | 981 | +189 (23.9 %) | 0 | 0 |
| router-ui-dogfood | cold | 3258 / 1149 / 1178 | 2717 / 1306 / 1681 | 3 / 3 | 1178 | 1681 | +503 (42.7 %) | 2109 | 1411 |
| router-ui-dogfood | warm | 1195 | 1340 | 1 / 1 | 1195 | 1340 | +145 (12.1 %) | 0 | 0 |
| router-unocss-probe | cold | 1672 / 1195 / 1215 | 1913 / 1369 / 1389 | 3 / 3 | 1215 | 1389 | +174 (14.3 %) | 477 | 544 |
| router-unocss-probe | warm | 1226 | 1447 | 1 / 1 | 1226 | 1447 | +221 (18.0 %) | 0 | 0 |
| www | cold | 22008 / 20930 / 20820 | 22980 / 22242 / 21979 | 3 / 3 | 20930 | 22242 | +1312 (6.3 %) | 1188 | 1001 |
| www | warm | 20464 | 21921 | 1 / 1 | 20464 | 21921 | +1457 (7.1 %) | 0 | 0 |

| starter rebuild | A runs (ms) | C runs (ms) |
| --- | --- | --- |
| rep 1 | 1227 | 1151 |
| rep 2 | 1034 | 1142 |
| rep 3 | 1023 | 1148 |

## Limitations

1. **Timing is load-polluted in this round** (see above). Byte counts are not:
   they are output bytes, and both sides ran in the same conditions.
2. **n = 3 cold, n = 1 warm** per group and side; the packed starter is
   rebuilt three times per side.
3. Both sides run in equal-length paths, but `__vite__mapDeps` ordering can
   still move a gzip/brotli byte while raw length is identical; that is the only
   cross-round A-side variance observed (5 B brotli in the starter, 1 B in
   pagefind-included www).
4. The measurement is a build-output inventory, not a browser loading
   measurement: cold/warm mean build-cache states, not HTTP or page caches, and
   no runtime or hydration timing is claimed here.
5. The starter leg's install and pack phases are excluded from comparison; only
   its repeated build is measured.
6. This evaluation covers exactly the candidate SHA above. A successor commit
   needs a fresh candidate tree and a re-run; old-SHA numbers are not
   transferable.

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
artifacts and asserts every number; it reported **86 assertions, 0 failed**. The canonical
`tools/release/css-cost-report.ts` cross-check compared 98 class totals over
both sides and all seven groups and reported **0 disagreements**.

## Delta note

The measurement was taken on `0bc1099282e1a69ec0c3e551e6d923bc21d2fe18`.
The delta to the submitted final SHA is (a) this evaluation document and (b)
test files added afterwards to lift the production-source branch-coverage gate
back over its floor (the coverage gate is release-train evidence; tests are not
build inputs). Neither delta is an input to any measured build, so neither can
move a byte or timing in the tables; the exact-SHA full qualification is
re-run on the final SHA.
