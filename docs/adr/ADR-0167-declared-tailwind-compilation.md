# ADR-0167: Declared Tailwind compilation — package-owned theme sources, application-owned enablement

- Status: ACCEPTED (implemented in production: `packages/protocol/src/manifest.ts`,
  `packages/router/src/vite/tailwind.ts`, `packages/router/src/vite/internal/ssg/island-scanner.ts`)
- Decided: 2026-10-13 (owner decision: the corrected declaration-driven option ②)
- Origin: alpha15 S lane follow-up — the component stylesheet became a real
  delivery channel (ADR-0164, `tailwind.ts`), and component libraries started
  authoring utilities directly in TSX, which makes "is Tailwind required?"
  a PACKAGE fact that the application currently has to know by hand.
- Extends: `OpenElementPackageManifest` (the source-designated package protocol
  — explicitly NOT Custom Elements Manifest; the router's third-party CEM
  reader is a separate, unvalidated parser, `cem-compat.ts`).

## Context

Before this decision the only way to enable Tailwind was an application
declaration (`openelement.config.ts` → `tailwind: true | { theme: string[] }`),
and the only way a component library's `@theme` roles reached the compile was
for the application to repeat the library's source by path:

```ts
tailwind: { theme: ['@openelement/ui/theme.css'] }   // www/openelement.config.ts
```

Two consequences, both observed in the tree:

1. **Demand was invisible.** `packages/ui` authors utilities directly in TSX
   (`open-code-block`, `open-theme-toggle`, `open-dropdown` — the alpha15 UI
   migration). Without the entry those utilities are never compiled, and the
   component silently loses its presentation: the build succeeds and the shadow
   root simply has no rules. Nothing in the package communicated that
   requirement.
2. **Theme ownership leaked into the consumer.** The ui package owns
   `src/theme.css` (its `@theme` role table) and exports it, but every consumer
   had to name it again. A library cannot ship a new role sheet without editing
   every application.

The rejected alternative was inferring demand from class strings ("does this
module contain utility-looking tokens?"). That is guessing: `btn`, `trigger`
and friends are ordinary class names, a regex recognizer has no idea which
strings Tailwind would compile, and the framework is explicitly forbidden from
becoming a second Tailwind grammar (taste: never a regex recognizer; use the
official compiler for utility semantics).

## Decision

### 1. The declaration (package side)

`OpenElementExtensions` gains one optional block:

```ts
interface OpenElementTailwindDeclaration {
  /** Mandatory: without the compile this component is unstyled. */
  required?: boolean;
  /** Package-owned sources the entry compiles by default (package-relative). */
  sources?: string[];
}
// OpenElementDeclaration.openElement.tailwind?: OpenElementTailwindDeclaration
```

Distinctions the contract keeps sharp:

| Fact | Field | Meaning |
|---|---|---|
| mandatory compilation dependency | `required: true` | The component's presentation needs the compile. Disabling it fails the build. |
| default theme source | `sources` | The package's own sheet compiles by default; the application need not repeat it. |
| optional theme availability | no field | A sheet a consumer may `@import` themselves. It does not enable anything. |
| ordinary authored CSS | none of the above | A `.css` import edge in `static styles` — connected through the style-asset protocol, never a Tailwind requirement. |

### 2. Ownership and resolution

- **Owner**: the package that declares the source owns it. Sources are
  **package-relative** (`./theme.css`), resolved against the declaring package's
  own directory — derived from the resolved `${pkg}/manifest` module path at
  scan time, so a packed tarball, a pnpm link and a workspace link resolve
  identically. A source that is not package-relative fails with a coded
  diagnostic; there is no second spelling.
- **Tarball presence**: the resolved file must exist on disk (the build fails
  closed otherwise), which is exactly the condition a tarball must satisfy. The
  package's `files` list and its export map stay the package's own
  responsibility — the resolver reads the file the manifest names, never a
  package.json field of its own invention.
- **The theme source stays in its owning package.** This ADR makes discovery
  package-metadata-driven; it does not relocate theme ownership into Router.

### 3. Activation (which components make it active)

A declaration is active when its package is on the admitted scan list
(`packageIslands`) and the declaration is admitted by the same facts that admit
its component — the island delivery scan. Static components (`hydrate: 'none'`
declarations), `ssr: true` components, ordinary package imports and nested
components all ride the same admission: they are admitted when the scanner
admits them (or, for a component the application imports directly, when the
client build's resolver-driven discovery walks it — ADR-0167 rides the S-lane
discovery, it does not add one).

### 4. Configuration semantics

`tailwind` stays `boolean | { theme: string[] }`, with one new meaning for
`undefined`:

| `tailwind` | Peer loaded | Compile invoked | Sources compiled |
|---|---|---|---|
| `undefined` + an active declared requirement | yes | yes | declared sources, deterministic order |
| `undefined` + no declaration | **no** | **no** | none — no entry, no resource, no payload |
| `true` | yes | yes | declared sources |
| `{ theme: [...] }` | yes | yes | declared sources first, then the application's, order preserved |
| `false` | no | no | none; an active `required: true` fails closed |

- **Deterministic order**: declared sources are ordered by package name, then
  declaration tag name, then declared array order — never by scan timing.
- **Deduplication by RESOLVED MODULE IDENTITY** (`isomorphic` to the S-lane's
  module-identity rule): the same file reached twice contributes one `@import`.
  A source reached from a package and from the application collapses onto the
  first (declared) occurrence, so "repeat the owner's path" is a no-op rather
  than a double compile.
- **Conflicting package themes**: two packages declaring conflicting role
  values is resolved by the same deterministic order (package name →
  declaration tag → declared order): the later source wins the cascade, exactly
  as two `@theme` blocks in one entry behave today. The application override
  policy is explicit and is the documented way to settle a conflict: an
  application source always compiles AFTER every declared source, so the
  application's roles win — and because of identity dedup, an application that
  already names the owner's source changes nothing.
- **Local application components** get no automatic entry from their class
  strings: an application declares `tailwind` for its own utilities, unless an
  admitted package declaration already enabled the pipeline.

### 5. What the entry is

Unchanged from the S lane — this ADR only decides *when* and *with which
sources* it exists:

- The **document** entry is the official `@tailwindcss/vite` pipeline over
  `@import 'tailwindcss'` plus the resolved sources (`preflight` included: the
  document is the application's own surface).
- The **component** (shadow) entry is the reduced entry — `tailwindcss/theme.css`
  + resolved sources + `tailwindcss/utilities.css` + one `@source inline(…)` per
  compiler-admitted static candidate. **Document preflight is deliberately
  absent there**: a reset inside a component's shadow tree would change every
  existing component's rendering, and preflight's document-wide selectors have
  no business inside a shadow root.
- **No unwanted document-wide styling** in automatic mode: enabling the pipeline
  compiles exactly the sources the packages declared (their `@theme` layer) plus
  the candidates the compiler admitted; no package can inject document rules
  through this channel because a declaration names style SOURCES, never a
  stylesheet that would be applied wholesale.
- **Dark mode / forced-colors / required variables**: role seats are authored
  in the owning package's source (`:root[data-theme='dark'], :host([data-theme='dark'])`
  and the forced-colors tier). Custom properties inherit across shadow
  boundaries, so one compile feeds both the document and every shadow root; the
  component entry re-declares them inside the sheet that shadow roots adopt, so
  a shadow root is styled even when the document sheet is a separate resource.
- **Dynamic class values** are never guessed: a `class={this.field}` binding
  contributes nothing. Completeness rides the author's explicit Tailwind
  mechanisms in the declared source (`@source inline(…)`, `@source` over files),
  which the official compiler consumes like any other CSS. The framework adds no
  recognizer.

### 6. Peers and diagnostics

- The peer requirement is unchanged and stays the application's: `tailwindcss`
  (and `@tailwindcss/vite`, which the router resolves from its own install) is
  an OPTIONAL peer, loaded lazily only when the pipeline is enabled. A disabled
  pipeline needs no peer installed.
- Diagnostics are coded and actionable:
  - `OE_PRESET_TAILWIND_UNRESOLVABLE` — the pipeline is enabled but
    `@tailwindcss/vite` is not resolvable: `install @tailwindcss/vite`.
  - `OE_PRESET_TAILWIND_REQUIRED_DISABLED` — `tailwind: false` while an admitted
    component declares `required: true`; names the package and tag.
  - `OE_PRESET_TAILWIND_SOURCE_UNRESOLVED` — a declared source is not
    package-relative, or does not exist in the installed package; names both.
  - `OE_PACKAGE_ISLAND_TAILWIND_SHAPE` — the declaration block itself is
    malformed (`required` not a boolean, `sources` not a string array).

### 7. Dev and build share one contract

One implementation resolves the pipeline — `resolveTailwindPlan()` in
`vite/tailwind.ts` — and both channels consume it: the dev channel's
`configResolved` and the client build's Phase 2. Consequently the dev server
serves the same compiled sources at the same URL identity, the DSD link and the
adapter agree (the S-C registry ordering fix), and "works in dev, unstyled in
prod" cannot happen for a declared requirement.

## Consequences

- A UI library that authors utilities can now ship them with its own role sheet
  and be styled in a consumer that declares nothing. This is the acceptance the
  packed consumer proves (all six `@openelement/ui` components, no `tailwind`
  key in the app).
- Applications keep the authority: `false` is an authoritative off switch with a
  fail-closed diagnostic when a mandatory dependency really exists, and an
  application source always overrides declared role values.
- `www` stops repeating `@openelement/ui/theme.css`.
- Retired here: nothing. The previous rule this replaces is the UI package's own
  "component internals carry no utility classes" contract, which the owner
  superseded for the S lane (utilities are the intended first-party authoring
  form); that package-level change is recorded in `packages/ui/CUSTOMIZATION.md`,
  not as a protocol decision.
