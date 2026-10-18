---
title: 'Styling'
lede: 'An explicit shadow root renders inside a custom element with declarative shadow DOM, out of a global stylesheet’s reach. The default is a light root.'
order: 5
---

## The shadow boundary

Route pages render inside per-page custom elements (for example `<blog-post-page>`). When a page class opts into `root: 'shadow-open'`, the server sends its content inside declarative shadow DOM and the page's own `<style>` and `StyleSheet` rules live in the shadow root. A document-level rule like `.card { ... }` or `h1 { ... }` is scoped to the light DOM and never reaches shadow page content — silently: no console warning, no build error. (The compiled default is a light root, where document styles do apply.)

## What crosses the boundary

CSS custom properties inherit through shadow boundaries: `--text-primary`, `--brand` and friends defined on `:root` are readable inside every page. `:host` styles the page element itself from inside; `::slotted()` styles light-DOM children projected into slots. Inherited text properties (`color`, `font-family`, `line-height`) also pass through.

## What does not

Class, id, and tag selectors from a document stylesheet never match inside the shadow root. Global resets (`margin: 0` on `*`), typography rules, and utility-class systems therefore apply only to the document shell. This is encapsulation by design — it is also the most common first-day trap, because the instinct is a global stylesheet.

## The supported styling paths

One: authored `.css` files — a real sheet imported into the component and arrayed in its `static styles` (#1558). The build's style-asset pipeline emits each sheet as a content-addressed asset: a shadow component fetches it as a real `.css` asset and adopts it through `adoptedStyleSheets` (never JS-embedded bytes), while the server declares the same asset with a parser-visible `<link rel="stylesheet" data-oe-static-styles>` in the DSD output. A light root's sheet is emitted wrapped in `@scope (<tag>)` with `:host` and `::slotted` projected onto the light tree, and its DSD template carries the same `<link>` rather than an inline `<style>`; only a package sheet outside the project root that no client graph can emit falls back to an inlined memory `StyleSheet`, and the build reports that fallback as a warning. Two: utility classes from the configured CSS provider (the Tailwind preset by default; UnoCSS through the style-provider port) — the compiler admits static class tokens and the build emits them into the document stylesheet for light roots and into the shared component stylesheet for shadow islands, so presentation lives in the markup and no CSS text ships inside JavaScript. Three: CSS custom properties defined on `:root`, which inherit through the shadow boundary. Document-level `<link rel="stylesheet">` and `<style>` in the head do not apply to shadow content, and raw-text `<style>` tags are rejected from compiled templates.

### A document-level stylesheet (does not apply)

```css
/* app/styles.css — linked in the document head */
.card { border: 1px solid silver; }  /* never matches page content */
```

### A component `.css` file (applies)

```css
/* app/components/page-example.css — the sheet is a file, not a JS string */
:host { display: block; }
.card {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 1rem;
  color: var(--text-primary);
}
```

```tsx
// app/components/page-example.tsx — compiled by the open:compiled-element transform
import { element, OpenElement, type StyleSheetLike } from '@openelement/element';
import styles from './page-example.css';

@element('page-example', { root: 'shadow-open' })
export default class ExamplePage extends OpenElement {
  static override styles: StyleSheetLike[] = [styles];

  render() {
    return <section class='card'>Themed through custom properties.</section>;
  }
}
```

Inline sheet strings are retired: a compiled module's `static styles` must array `.css` imports, and anything else fails the build with OEC9029.

## Custom properties in practice

The starter defines a design-token layer on `:root` (colors, fonts, spacing) precisely so pages can be themed entirely through custom properties. Theme with tokens first; use the component's `.css` sheet for the page-internal layout and typography.

## See also

- [Design System](/architecture/design-system) — how those tokens and semantic roles are organized.
- [Core Concepts](/guide/core-concepts) — the root modes and `static styles` referenced here.
- [Islands and SSR](/guide/islands-and-ssr) — when a component needs a shadow root at all.
