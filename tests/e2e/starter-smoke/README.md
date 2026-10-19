# starter-smoke

Packed-starter **visual + interaction smoke** (#934). `setup.ts` packs the
release tarballs through the release toolchain (vp pack), runs the packed
`@openelement/create` CLI under Node to generate a fresh starter, rewires its
`@openelement/*` dependencies to those current-SHA tarballs, installs the
starter's own dependency surface with pnpm, and builds it; the Playwright
suites then drive that real build (B5/ADR-0161: Node/pnpm consumer surface).

The scaffold is created **outside the repository** at
`${RUNNER_TEMP ?? os.tmpdir()}/openelement-starter-smoke/my-blog`
(`paths.ts`, overridable with `STARTER_SMOKE_WORK_DIR`). That location is part
of the gate: inside the repo, the repository's ancestor `.gitignore` made the
starter's own bare `oxlint` find zero files (`No files found to lint`, exit 1),
which is not a user-like environment. `setup` recreates the scratch root on
every run.

```bash
pnpm --dir tests/e2e/starter-smoke run setup       # pack + generate + rewire + install + build
pnpm --dir tests/e2e/starter-smoke run test        # all three browser projects
pnpm --dir tests/e2e/starter-smoke run test:dev    # `pnpm dev` dev-mode smoke
pnpm --dir tests/e2e/starter-smoke run gate        # setup + test
pnpm --dir tests/e2e/starter-smoke run quality     # TPL-03 lifecycle chain on the same scaffold
```

`quality` is the **starter quality gate** (TPL-03): after `setup` has created the
fresh scaffold through the packed create CLI, it runs the starter's own
lifecycle scripts against that same tree —
`typecheck` → `lint` → `test` → `build` — then boots `oe start` and probes
`/`, `/about` and `/api/ping` over the wire. It fails closed on any nonzero
script or failed probe, and it never re-packs or re-installs. CI runs it as a
named step inside the existing base-layer `pack` job (see
`docs/release/evidence/alpha15/tpl03-starter-quality-gate.md` for why it is a
step and not a new qualification job).

Guarded regression classes: unstyled page (missing `:root` baseline), dead
island, jammed nav, clipped assets, duplicate H1 (#934); dev-mode island client
serving and route-edit SSR invalidation (#951/#952); the starter lifecycle
(typecheck/lint/test/build/start, TPL-03) in the user-like scratch root.
