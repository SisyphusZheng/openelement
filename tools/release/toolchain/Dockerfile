# syntax=docker/dockerfile:1
#
# OpenElement qualification toolchain — alpha15 (REL-04).
#
# The repository's fixed toolchain is defined by four pins, each with one
# owner file. This image reproduces exactly those pins so a local or release
# qualification run cannot drift from CI:
#
#   Node.js     .node-version                         (exact version)
#   pnpm        package.json packageManager           (exact version)
#   Playwright  package.json devDependencies          (playwright == @playwright/test)
#   OS          the node:<version>-bookworm-slim base (Debian bookworm)
#
# Build:
#   docker build -t openelement-toolchain:alpha15 tools/release/toolchain
# For a frozen qualification, pin the base image by digest as well:
#   docker build \
#     --build-arg NODE_IMAGE=node:24.18.0-bookworm-slim@sha256:<digest> \
#     -t openelement-toolchain:alpha15 tools/release/toolchain
#
# The verifier (tools/release/check-toolchain-pins.ts) cross-checks every
# version below against the repository files and the CI workflows; `docker
# build` itself is not part of any gate.

ARG NODE_IMAGE=node:24.18.0-bookworm-slim
FROM ${NODE_IMAGE}

ARG NODE_VERSION=24.18.0
ARG PNPM_VERSION=12.8.1
ARG PLAYWRIGHT_VERSION=1.59.1

LABEL org.opencontainers.image.title="openelement-toolchain" \
      org.opencontainers.image.description="Fixed Node.js/pnpm/Playwright toolchain used for OpenElement alpha15 qualification (REL-04)" \
      org.opencontainers.image.version="1.0.0-alpha.15" \
      org.opencontainers.image.base.name="${NODE_IMAGE}" \
      dev.openelement.node-version="${NODE_VERSION}" \
      dev.openelement.pnpm-version="${PNPM_VERSION}" \
      dev.openelement.playwright-version="${PLAYWRIGHT_VERSION}"

# Fail closed if the base image moves under the tag: the pinned major.minor.patch
# must be the node the image actually ships.
RUN node --version \
 && test "$(node --version)" = "v${NODE_VERSION}" \
 || { echo "base image node $(node --version) != pinned v${NODE_VERSION}" >&2; exit 1; }

# System prerequisites: the Playwright browser installs need the distro's
# library set (`--with-deps` below installs the rest); git/curl/jq are used by
# the release checklists. `ca-certificates` keeps https verification on.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git jq \
 && rm -rf /var/lib/apt/lists/*

# pnpm at the exact packageManager pin. corepack is not used: the pin must be
# an explicit registry install so the version is observable in the image.
RUN npm install -g "pnpm@${PNPM_VERSION}" \
 && test "$(pnpm --version)" = "${PNPM_VERSION}"

# Playwright browsers at the repository's Playwright version. The install CLI is
# fetched at the same exact pin, so the browser revisions are the ones the
# lockfile's playwright@<version> resolves to; the repository itself is mounted
# at run time and is not copied into the image.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx --yes "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium firefox webkit \
 && rm -rf /root/.npm/_npx \
 && test -d /ms-playwright \
 && ls /ms-playwright

# The workspace is bind-mounted here; the image only owns the toolchain.
WORKDIR /work
CMD ["bash"]
