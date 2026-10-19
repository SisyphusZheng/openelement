# Fixed qualification toolchain (REL-04)

The repository's qualification toolchain is pinned by four owner files, not by
the machine a run happens to execute on. This directory reproduces those pins as
a container recipe:

| pin | version | owner file | why |
| --- | --- | --- | --- |
| Node.js | `24.18.0` | `.node-version` | CI resolves the toolchain from this file (`actions/setup-node` `node-version-file`) |
| pnpm | `12.8.1` | root `package.json` `packageManager` | the package manager for every install/gate; CI installs the same exact pin |
| Playwright | `1.59.1` | root `package.json` devDependencies (`playwright` and `@playwright/test`, pinned equal) + `pnpm-lock.yaml` | browser revision set for the Chromium/Firefox/WebKit proofs |
| OS | Debian bookworm (slim) | `tools/release/toolchain/Dockerfile` base image | the glibc/libffi/libnss set the browsers run against |

The `check-toolchain-pins.ts` verifier checks that all four agree across
`.node-version`, `package.json`, `pnpm-lock.yaml`, `tools/release/toolchain/Dockerfile`,
the CI workflows, and this README — a drift in any one file fails it.

## Build

```sh
docker build -t openelement-toolchain:alpha15 tools/release/toolchain
```

For a frozen qualification, also pin the base image by digest so the same tag
cannot resolve to different bytes later:

```sh
docker pull node:24.18.0-bookworm-slim
docker image inspect --format '{{index .RepoDigests 0}}' node:24.18.0-bookworm-slim
# node:24.18.0-bookworm-slim@sha256:<digest>
docker build \
  --build-arg NODE_IMAGE=node:24.18.0-bookworm-slim@sha256:<digest> \
  -t openelement-toolchain:alpha15 tools/release/toolchain
docker image inspect --format '{{index .RepoDigests 0}}' openelement-toolchain:alpha15
```

Record the two resolved digests in the qualification report (REL-08/QUAL-01) so
"the image" names bytes, not a tag. The Dockerfile runs `node --version` and
`pnpm --version` assertions at build time, so a moved base tag fails the build
instead of producing a silently different image.

## Run the gates inside

The repository is bind-mounted; dependencies are installed into the mounted
workspace with the frozen lockfile (the image itself carries only the
toolchain):

```sh
docker run --rm -it -v "$PWD:/work" -w /work openelement-toolchain:alpha15 bash
# inside the container, once per mount:
pnpm install --frozen-lockfile
# then any gate; these are the ones the qualification report cites:
pnpm run check
pnpm exec vitest run --project element --project compiler --project router \
  --project create --project ui --project www --project tools
pnpm run site:build
```

`pnpm install --frozen-lockfile` inside the image is the same command CI's
setup action runs; the pnpm store is not baked into the image so the lockfile is
always the authority.

## Verify the pins (no Docker required)

```sh
node tools/release/check-toolchain-pins.ts
```

It prints one `PASS` line per checked relationship and exits 1 on any drift. It
is composed into the release preflight (`tools/release/release-preflight.ts`),
not into a CI workflow: adding a CI step would change the qualification gate
counts that the release documentation pins, and the toolchain contract is only
meaningful if it is checked before a qualification run anyway. If the Lead wants
it in the PR layer, that is a workflow-contract change owned by the CI lane.

## Status in this batch (honest limitation)

Docker is not installed on the qualification host used for alpha15
(`which docker` → not found), so the image was **not built** here. The recipe is
verified statically: the pin verifier passes locally, and the Dockerfile's
build-time assertions fail closed if a base image or the pnpm install drifts.
Building the image is a release-preflight step for the next machine that has a
container runtime; the `pnpm install --frozen-lockfile` + gate sequence above is
the exact content of that run.
