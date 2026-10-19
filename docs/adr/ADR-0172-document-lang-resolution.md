# ADR-0172: Document language resolution — the configured `head.lang` and the derived i18n locale

- Status: ACCEPTED (implemented: `packages/router/src/vite/internal/ssg/entry-route-helpers.ts`,
  `packages/router/src/vite/internal/ssg/entry-render-ssg.ts`,
  `packages/router/src/document.ts`)
- Decided: 2026-10-19 (alpha15 cleanup batch; PR #1611 review FRM-01 — the
  "head.lang has no effect" dogfood finding)
- Preserves: ADR-0153 (the resolved Document seam, #1326) — this record fixes
  the value the seam receives from generated entries; it adds no field, no
  second resolution path and no serializer change. ADR-0169 (request-time
  rendering surface) is unchanged: request-time pages keep the same context
  shape, they only stop inventing a locale.
- Related: `packages/router/src/config.ts` (`head.lang`: "`<html lang>`;
  defaults to `en`"), ADR-0170 (the independent bounded late-host probe).

## Context

`openElement({ head: { lang } })` is documented as the document language and
flows into the entry descriptor's `document.lang` (`entry-descriptor.ts`,
`lang: options.html?.lang || 'en'`). The generated document wrap spelled the
precedence as:

```js
lang: lang || __doc.lang || "<configured document.lang>"
```

where `__doc` is the resolved Document (ADR-0153) and `__doc.lang` is derived
from `context.locale` inside `resolvePageDocument`. The request-time page
context, however, derived that locale unconditionally:

```js
locale: __localeFromPath(__locales, c.req.path, __getDefaultLocale())
```

The generated app always carries a `defaultLocale` (the i18n default, or `'en'`
for a single-locale project), so `localeFromPath` returned `'en'` even when the
project declared no i18n at all. `__doc.lang` therefore became `'en'` on every
request-time page and won the fallback chain, making the configured
`document.lang` (and thus public `head.lang`) unreachable. The SSG build
dispatches its static pages through the same generated request-time handlers
(#1560's internal static generator), which is why a "static" page showed
`<html lang="en">` too, while the Ssg dynamic expansion happened to pass an
explicit `lang` and masked the defect.

Two facts made the defect hard to see from the contract side:

- `PagePropsContext.locale` is documented as "Resolved application locale for
  this render, **when i18n is configured**" — the generated entry contradicted
  its own public type.
- `ResolvedDocument.lang` is a derived value, not a configured one, but nothing
  said so at the type; the wrap expression's `__doc.lang ||` ordering looked
  like a locale override and was in fact a constant override.

## Decision

**1. The document-language precedence is four tiers, in this order:**

| # | Source | When it applies |
| --- | --- | --- |
| 1 | explicit render option `lang` | SSG dynamic expansion and the i18n build pass it; wins over everything |
| 2 | derived i18n locale (`__doc.lang`) | only when the project declared `i18n` and a locale resolves for the request |
| 3 | configured document `head.lang` (`document.lang`) | every page that has no derived locale; `'en'` when unset |
| 4 | serializer default `'en'` | defensive only — tier 3 always supplies a string today |

The generated wrap expressions keep their shape
(`lang || __doc.lang || "<configured>"`): once the seam input is honest, the
fallback order IS the contract, and changing the expression too would fork the
priority between the SSG and request-time call sites.

**2. The request-time page context derives a locale only for a declared i18n
project.** `__locales` is the serialized `openElement({ i18n })` declaration;
the emitted context is now
`locale: __locales.length > 0 ? __localeFromPath(__locales, c.req.path, __getDefaultLocale()) : undefined`.
A single-locale site hands every render channel `locale: undefined`, which is
what the public `PagePropsContext` type always promised.

**3. `ResolvedDocument.lang` stays `undefined` unless a locale is actually
derived.** The Document seam never defaults it to `'en'`, and an empty string is
not a locale. This is the invariant that lets tier 3 win; its JSDoc now states
it, so a future "convenience default" in the seam is a contract change rather
than an invisible regression.

**4. Public contract restated.** On a single-locale site `head.lang` is the
`<html lang>`. With i18n configured, the locale derived from the request path
(or the declared default locale for the unprefixed root) overrides it; an
application that wants per-locale document language beyond that can set
`head.lang` per deployment or use the resolver head channel.

## Alternatives considered

- **Flip the generated expression to `<configured> || __doc.lang`** — rejected:
  it would make i18n locales unable to override the configured language, the
  opposite documented error, and it would leave SSG dynamic expansion (which
  passes an explicit `lang`) inconsistent with request-time rendering.
- **Default `__doc.lang` to `'en'` in `resolvePageDocument`** — rejected: the
  seam would then own a configuration default (the descriptor's job) and the
  configured `head.lang` could never win without a second priority rule in
  generated code.
- **Derive the locale from the configured `head.lang`** — rejected: locale is a
  routing/i18n fact, not a display language; conflating them would make
  `localeFromPath` and layout href localization accept a language that is not a
  declared locale.
- **Leave the generated entry alone and document "use i18n for lang"** — the
  option the review also considered. Rejected as the primary fix because
  `head.lang` is an existing documented public option with a testable
  contract and no reason to be dead; the ADR records the fix instead of a
  narrowed promise.

## Consequences

- **Behaviour change on single-locale sites:** a page head resolver, a props
  projector, or any custom code reading `context.locale` now receives
  `undefined` instead of the synthetic `'en'`. That matches
  `PagePropsContext.locale`'s JSDoc; application code that relied on the
  synthetic value in a single-locale project must read the configured language
  from its own config instead.
- `<html lang>` on single-locale sites becomes the configured `head.lang`
  (`'en'` when unset), including static pages (they render through the
  request-time handlers), dynamic pages and the styled 404. With i18n, output
  is unchanged (a locale was already derived there).
- No new public export, no new field, no protocol change, no build artifact.
  The fix is one emitted expression plus the seam's documented invariant.

## Evidence

- Generated-line tests: `packages/router/__tests__/entry-descriptor.test.ts`
  ("renderEntry: the page locale is derived only for a declared i18n project",
  and the two `generated request-time document` tests that execute the emitted
  context + wrap lines against the real `resolvePageDocument` and
  `wrapInDocument`: no i18n → `lang="fr"` from config; i18n → `'zh'`/`'en'`
  locale overrides it).
- SSG render pass: `packages/router/__tests__/entry-render-ssg.test.ts`
  ("renderRoute: with no locale the configured document lang reaches
  `<html lang>`", "renderRoute: a derived i18n locale overrides the configured
  document lang").
- Seam invariants: `packages/router/__tests__/document.test.ts` (undefined
  head with no locale resolves without `lang`; a locale is carried as the
  document language).
- Root-cause record: `verification/pr1611/60-dogfood-report-verification.md`
  ("head.lang 被吞掉的机制", lines 38-40).
