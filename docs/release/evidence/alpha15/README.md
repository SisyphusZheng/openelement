# Alpha15 release evidence — A/B and JFB (durable pointer)

This directory is the **durable pointer** for the two release-evidence documents:

- [`alpha15-ab-evaluation.md`](../../alpha15-ab-evaluation.md) — byte-level A/B
  inventory (baseline A `3613d841c`, mid arm, candidate C
  `d9eb755d3`, alpha14 arm `v1.0.0-alpha.14` = `e9af510de`).
- [`alpha15-jfb-runtime-evaluation.md`](../../alpha15-jfb-runtime-evaluation.md)
  — single-machine runtime comparison, alpha.14 registry install vs alpha.15
  local tarballs packed from `6ae441644`, harness `8103f1fe`.

The measurement was taken on `d9eb755d3`; the delta to the submitted final SHA
is documentation-only (see the A/B document's delta note).

## What is tracked here, and what is a release asset

Tracked (small, reviewable):

| file | purpose |
| --- | --- |
| `report-repro-final.mjs` | re-reads the A/B byte/closure tables and asserts 86 selected cells against the recorded artifacts |
| `three-arm-repro.mjs` | re-asserts the two three-arm tables (22 selected cells) against the three-arm session artifacts |
| `late-host-walk-bench.mjs` | synthetic composed-tree walk benchmark used by ADR-0170's cost evidence |
| `sha256-manifest.txt` | sha256 of every file in the release-evidence archive (503 entries) |

Release asset (not committed — committed temporary evidence is forbidden by
CONTRIBUTING): **`alpha15-ab-jfb-evidence.tar.zst`**, 223,543 bytes,
sha256 `53d974907cb851b6b2d906465e46ac93f577f51552041c8a82195df7338e8451`,
524 members. The archive is **staged for the GitHub Release** and must be
attached at publication time (a Release asset cannot exist before the Release
does). Until then, its digest above is the verification anchor; the staged copy
is `.artifacts/release-evidence/alpha15-ab-jfb-evidence.tar.zst` in the release
workspace (gitignored).

Archive layout:

| member | content | files |
| --- | --- | --- |
| `ab-3arm/` | three-arm sweep plus the main A→C sweep artifacts (`raw/`, `logs/`, `timings.jsonl`, `starter-*`, `*.log`) | 197 |
| `ab-d9/` | re-measured candidate sweep (candidate tree `3299f3f5`, 1584 files) | 142 |
| `jfb/` | JFB bundle: `metrics.json`, `json/` (8 runner invocations × 15 ids), `logs/`, `aggregate.py`, environment and shasum files | 150 |
| `harness/` | collector, sweep driver, starter legs, timing wrapper (historical scripts; paths inside them are the measurement machine's) | 12 |
| `reproducers/` | the two table reproducers as originally run, plus the walk benchmark | 3 |

## Reproduce the table assertions

```sh
# inside the unpacked archive root
shasum -a 256 -c sha256-manifest.txt

AB_OUT=<unpacked>/ab-d9 \
  node report-repro-final.mjs docs/release/alpha15-ab-evaluation.md
# expected: REPORT↔ARTIFACT (final): 86 assertions, 0 failed

OE_AB_3ARM=<unpacked>/ab-3arm OE_AB_FINAL=<unpacked>/ab-d9 \
  node three-arm-repro.mjs docs/release/alpha15-ab-evaluation.md
# expected: THREE-ARM↔ARTIFACT: 22 assertions, 0 failed
```

The reproducer scripts assert the selected cells listed in the A/B document's
"Validation of this document" (byte totals, class splits, closure rows,
three-arm totals). They do not assert the Δ% columns or the advisory timing
table; the doc says so.

## Recompute the JFB tables

`jfb/metrics.json` carries the pooled medians/IQR/ratios and the
`cpu_geomean_ratios`/`threshold_flags` used by the JFB document;
`jfb/aggregate.py` is the aggregation script that produced it, and the
per-invocation JSON under `jfb/json/` is the raw input. `jfb/arm-report.md` §9
is the full artifact index. The JFB document is a single-machine internal
measurement, not a js-framework-benchmark submission and not a leaderboard
result.

## Synthetic walk benchmark (ADR-0170 cost evidence)

```sh
OE_PLAYWRIGHT_MODULE=<repo>/node_modules/playwright/index.js \
  node late-host-walk-bench.mjs
# run 1: {"elements":10100,"singleWalkP50Ms":0.3999…,"singleWalkP95Ms":0.6999…,
#         "worstMs":1.6999…,"eighteenWalkUpperBoundMs":12.599…}
# run 2: p50 0.3999…, p95 0.5999…, worst 1.5, eighteenWalkUpperBoundMs 10.799…
```

It is a replica of the production fused walk (same selector-list +
`shadowRoot` descent) on a 10,100-element composed tree with one pending tag and
no host. The production function is not exported for instrumentation, so this
measures the algorithm rather than an instrumented build; ADR-0170 records that
limitation, the numbers (p95 0.60–0.70 ms, 18-walk p95 bound 10.8–12.6 ms
across two runs), and the p95-based upper bound that stays above the design
record's 10 ms target.

## Boundaries

- Byte axis ≠ runtime axis; the two documents are not interchangeable and
  neither is a cross-framework ranking.
- The JFB document is a single-machine internal measurement (not a submission,
  not a leaderboard result, not a same-load comparison).
- alpha.4 JFB data is historical advisory only and is not part of the
  comparison.
- Timing in the A/B document is advisory-only and is not used for any claim.
