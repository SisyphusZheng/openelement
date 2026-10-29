# Pull Request

Read [CONTRIBUTING.md](../CONTRIBUTING.md) first.

## Product boundary

- Element / Router / support tooling / documentation:
- Active ADRs changed, if any:

## Four-question gate (P7)

Answer all four; a "not applicable" is an answer, an empty field is not.

1. **Platform (P1)** — can the platform do this? Name the primitive used, or say why none applies:
2. **Compile time (P2)** — can the cost be paid at compile/build time?
3. **Runtime shape (P3)** — if it must be runtime, does it read as platform code and honor the server contract?
4. **Prior art (P7.4)** — nearest mature prior art, and is our difference deliberate?

Deviations follow the comply-or-explain rule. A hard-to-reverse public API,
package topology, architecture, security/trust or compatibility decision also
lands an ADR — see [CONTRIBUTING.md](../CONTRIBUTING.md) § When an ADR is
required, and list it above under "Active ADRs changed".

## What changed

-

## Verification

- [ ] Focused behavioral tests
- [ ] `vp run fmt`
- [ ] `vp run lint`
- [ ] `vp run typecheck`
- [ ] `vp run test`
- [ ] `vp run build`
- [ ] Packed/browser/runtime gates applicable to this change
- [ ] Commits carry `Signed-off-by` trailers (DCO, `git commit -s`)

## Release impact

- Package or public API impact:
- Release-state impact:
