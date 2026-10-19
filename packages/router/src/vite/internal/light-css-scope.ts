/**
 * Build-time light-root CSS scoping (alpha15 S lane, S-C1.2).
 *
 * A light root has no native style boundary: the component's DOM lives in the
 * document, so its authored selectors would apply document-wide and its
 * shadow-only `:host`/`::slotted` selectors would never match. The boundary
 * is native CSS `@scope (<tag>)` — the scope root is the component's own tag,
 * which is compiler-known component identity, not a per-instance fact: every
 * instance of a component shares one scoped stylesheet, exactly as it shares
 * one sheet file.
 *
 * This runs at the style-asset boundary (the router client/SSR/dev style
 * plugins), so the emitted asset IS the scoped stylesheet: the bytes the
 * browser parses are the bytes the build wrote, content-addressed, and no
 * runtime can re-derive them.
 *
 * The shadow-selector projection is a CSS-AST rewrite, not a text scan:
 * `postcss` is a direct dependency of this package (`package.json`) and its
 * parser is the boundary that makes the projection selector-only. Only
 * `Rule.selector` strings are ever candidates for rewriting, so a `:host`
 * token in a declaration value (`--selector: :host`, `animation: :host 1s`,
 * an unquoted `url(data:…:host…)`), in a comment, in a string, or in an
 * at-rule prelude (`@supports selector(:host)`) is structurally unreachable
 * for the projection — those nodes are copied as authored. The selector text
 * itself is then walked by an escape-aware tokenizer (see
 * {@linkcode projectSelector}): a CSS escape consumes the code point after
 * it, so `.icon\:host` is an identifier, not a `:host` token, and `[...]`
 * attribute-selector contents are never treated as selector grammar.
 *
 * Matching is ASCII case-insensitive (N1): `:HOST`, `:Host(…)` and
 * `::SLOTTED(…)` are the same pseudo-elements/pseudo-classes as their
 * lowercase spellings.
 *
 * What it does, and why each part is where it is:
 *
 *   - One `@scope (<tag>)` wrapper around the sheet. `@scope` matches the
 *     scope root and its subtree; a plain selector inside does not match the
 *     root itself, which is why `:host` is projected to `:scope`.
 *   - `:host` → `:scope`, `:host(<sel>)` → `:scope:is(<sel>)`,
 *     `::slotted(<sel>)` → `slot > :is(<sel>)`: the shadow-selector grammar
 *     projected onto the light tree, byte-for-byte the rewrite the runtime
 *     used to apply to the same sheet.
 *   - `:host-context(…)` is deliberately left unchanged. The light tree has
 *     no `:host-context` equivalent, and the token's name is not `:host`
 *     (the character after `:host` is `-`, an identifier continuation), so a
 *     document decision is what keeps it authored: projecting it would have
 *     to invent semantics the light tree does not have.
 *   - Prologue at-rules (`@charset`, `@import`, `@namespace`) are hoisted
 *     above the wrapper: they are only valid before any other rule, so
 *     leaving them inside `@scope` would drop them. They stay unscoped, and
 *     that is the honest boundary — the protocol scopes the sheet it owns,
 *     and an imported sheet resolves against the emitted asset's URL like any
 *     other URL in that file.
 *
 * Every other at-rule (`@media`, `@supports`, `@layer`, `@container`,
 * `@keyframes`, `@font-face`, `@property`, …) is a valid member of `@scope`'s
 * rule list and stays inside the wrapper, so conditional and registration
 * at-rules keep the component's scope exactly as authored.
 *
 * Output shape: when no rule selector contains a projectable token the
 * authored body bytes are wrapped verbatim (no reserialization); when a
 * projection does move bytes, the postcss tree is re-stringified — its raws
 * preserve every byte the tokenizer did not deliberately rewrite. A sheet the
 * parser rejects (malformed CSS, already rejected by the build's own CSS
 * pipeline before this seam) is wrapped verbatim without projection rather
 * than failing the build or guessing at selectors.
 */

import postcss from 'postcss';

/** At-rules that must precede every other rule, so they cannot be scoped. */
const PROLOGUE_AT_RULES = new Set(['charset', 'import', 'namespace']);

/** Index of the first byte after the comment starting at `index`. */
function skipComment(css: string, index: number): number {
  let cursor = index + 2;
  while (cursor < css.length) {
    if (css[cursor] === '*' && css[cursor + 1] === '/') return cursor + 2;
    cursor++;
  }
  return css.length;
}

/** Index of the first byte after the string starting at `index` (quote form). */
function skipString(css: string, index: number): number {
  const quote = css[index];
  let cursor = index + 1;
  while (cursor < css.length) {
    const char = css[cursor];
    if (char === '\\') {
      cursor += 2;
      continue;
    }
    cursor++;
    if (char === quote) return cursor;
  }
  return css.length;
}

/** Index of the first non-trivia byte at or after `index`. */
function skipTrivia(css: string, index: number): number {
  let cursor = index;
  while (cursor < css.length) {
    const char = css[cursor]!;
    if (char === '/' && css[cursor + 1] === '*') {
      cursor = skipComment(css, cursor);
      continue;
    }
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f') {
      cursor++;
      continue;
    }
    return cursor;
  }
  return css.length;
}

/** Index of the first byte after the block opened at `open`. */
function skipBlock(css: string, open: number): number {
  let depth = 0;
  let cursor = open;
  while (cursor < css.length) {
    const char = css[cursor]!;
    if (char === '"' || char === "'") {
      cursor = skipString(css, cursor);
      continue;
    }
    if (char === '/' && css[cursor + 1] === '*') {
      cursor = skipComment(css, cursor);
      continue;
    }
    if (char === '{') {
      depth++;
      cursor++;
      continue;
    }
    if (char === '}') {
      depth--;
      cursor++;
      if (depth === 0) return cursor;
      continue;
    }
    cursor++;
  }
  return css.length;
}

interface AtRuleHead {
  readonly name: string;
  /** Index of the first byte after the at-rule's `;` or block. */
  readonly end: number;
  /** True when the at-rule owns a block (`{…}`) rather than a `;`. */
  readonly block: boolean;
}

/**
 * Read the at-rule opening at `index` (`@name …`), without interpreting its
 * prelude: the scan is string-, comment- and paren-aware and stops at the
 * first `;` or `{` outside any of them. Returns undefined when `index` does
 * not open an at-rule.
 */
function readAtRule(css: string, index: number): AtRuleHead | undefined {
  if (css[index] !== '@') return undefined;
  let cursor = index + 1;
  const nameStart = cursor;
  while (cursor < css.length && /[A-Za-z0-9-]/.test(css[cursor]!)) cursor++;
  const name = css.slice(nameStart, cursor).toLowerCase();
  if (name === '') return undefined;
  let parens = 0;
  while (cursor < css.length) {
    const char = css[cursor]!;
    if (char === '"' || char === "'") {
      cursor = skipString(css, cursor);
      continue;
    }
    if (char === '/' && css[cursor + 1] === '*') {
      cursor = skipComment(css, cursor);
      continue;
    }
    if (char === '(') {
      parens++;
      cursor++;
      continue;
    }
    if (char === ')') {
      parens = Math.max(0, parens - 1);
      cursor++;
      continue;
    }
    if (parens === 0 && char === ';') return { name, end: cursor + 1, block: false };
    if (parens === 0 && char === '{') return { name, end: skipBlock(css, cursor), block: true };
    cursor++;
  }
  return { name, end: css.length, block: false };
}

/**
 * Split the sheet's leading prologue at-rules from the rest. The split is a
 * byte offset into the original text: a sheet with no prologue at-rule is
 * handed back verbatim, so the emitted asset of an ordinary component sheet
 * is `@scope (<tag>) {…}` around the authored bytes and nothing else changes.
 */
function splitPrologue(css: string): { prologue: string; body: string } {
  let cursor = skipTrivia(css, 0);
  let prologueEnd = -1;
  for (;;) {
    const head = readAtRule(css, cursor);
    if (!head || !PROLOGUE_AT_RULES.has(head.name)) break;
    prologueEnd = head.end;
    cursor = skipTrivia(css, head.end);
  }
  if (prologueEnd < 0) return { prologue: '', body: css };
  return { prologue: css.slice(0, prologueEnd), body: css.slice(prologueEnd) };
}

/** True for an ASCII hex digit (`0-9a-fA-F`). */
function isHexDigit(char: string | undefined): boolean {
  if (char === undefined) return false;
  const code = char.charCodeAt(0);
  return (
    (code >= 0x30 && code <= 0x39) || // 0-9
    (code >= 0x41 && code <= 0x46) || // A-F
    (code >= 0x61 && code <= 0x66) // a-f
  );
}

/**
 * True for a character that continues a CSS identifier after `:host` — the
 * boundary test that keeps `:hosting`, `:host-2`, `:host_2` and
 * `:host-context(…)` from being read as the `:host` token.
 */
function isIdentifierContinuation(char: string | undefined): boolean {
  if (char === undefined) return false;
  const code = char.charCodeAt(0);
  return (
    (code >= 0x30 && code <= 0x39) || // 0-9
    (code >= 0x41 && code <= 0x5a) || // A-Z
    (code >= 0x61 && code <= 0x7a) || // a-z
    char === '_' ||
    char === '-' ||
    code >= 0x80 // non-ASCII identifiers are CSS ident code points too
  );
}

/**
 * Index of the first byte after the CSS escape starting at `index` (a
 * backslash): either a `\` followed by one code point, or a hex escape of up
 * to six hex digits plus one optional whitespace terminator. Consuming the
 * escape is what keeps an escaped `:` in an identifier (`.icon\:host`) from
 * ever being read as the `:host` token.
 */
function skipEscape(css: string, index: number): number {
  let cursor = index + 1;
  if (cursor >= css.length) return css.length;
  if (!isHexDigit(css[cursor])) return cursor + 1;
  let digits = 0;
  while (cursor < css.length && digits < 6 && isHexDigit(css[cursor])) {
    cursor++;
    digits++;
  }
  const terminator = css[cursor];
  if (
    terminator === ' ' ||
    terminator === '\t' ||
    terminator === '\n' ||
    terminator === '\r' ||
    terminator === '\f'
  ) {
    cursor++;
  }
  return cursor;
}

/** Case-insensitive (ASCII) prefix test at `index`; returns the slice end or -1. */
function asciiPrefixAt(css: string, index: number, token: string): number {
  const end = index + token.length;
  if (end > css.length) return -1;
  return css.slice(index, end).toLowerCase() === token ? end : -1;
}

/**
 * Project the shadow-selector grammar onto the light tree in ONE selector
 * string. Escape-, string-, comment- and attribute-selector-aware: only a
 * real `:host` / `:host(…)` / `::slotted(…)` token in selector position is
 * rewritten. Matching is ASCII case-insensitive (N1).
 */
function projectSelector(selector: string): string {
  let output = '';
  let bracketDepth = 0;

  for (let index = 0; index < selector.length;) {
    const char = selector[index]!;

    if (char === '\\') {
      const end = skipEscape(selector, index);
      output += selector.slice(index, end);
      index = end;
      continue;
    }
    if (char === '/' && selector[index + 1] === '*') {
      const end = skipComment(selector, index);
      output += selector.slice(index, end);
      index = end;
      continue;
    }
    if (char === '"' || char === "'") {
      const end = skipString(selector, index);
      output += selector.slice(index, end);
      index = end;
      continue;
    }
    if (char === '[') {
      bracketDepth++;
      output += char;
      index++;
      continue;
    }
    if (char === ']') {
      if (bracketDepth > 0) bracketDepth--;
      output += char;
      index++;
      continue;
    }
    // Attribute-selector contents are never selector grammar (an unquoted
    // `[data-x=:host]` stays authored), so projection is selector-position
    // only.
    if (bracketDepth === 0 && char === ':') {
      const slotted = asciiPrefixAt(selector, index, '::slotted');
      if (slotted !== -1 && selector[slotted] === '(') {
        output += 'slot > :is(';
        index = slotted + 1;
        continue;
      }
      const hostCall = asciiPrefixAt(selector, index, ':host');
      if (hostCall !== -1) {
        if (selector[hostCall] === '(') {
          output += ':scope:is(';
          index = hostCall + 1;
          continue;
        }
        if (!isIdentifierContinuation(selector[hostCall])) {
          output += ':scope';
          index = hostCall;
          continue;
        }
      }
    }

    output += char;
    index++;
  }

  return output;
}

/**
 * Project every rule selector of one parsed stylesheet in place. Returns
 * whether any selector moved (so the caller can keep the authored bytes when
 * nothing did).
 */
function projectRuleSelectors(root: postcss.Root): boolean {
  let changed = false;
  root.walkRules((rule) => {
    const projected = projectSelector(rule.selector);
    if (projected !== rule.selector) {
      rule.selector = projected;
      changed = true;
    }
  });
  return changed;
}

/**
 * Project the scoped body: parse, rewrite only rule selectors, and keep the
 * authored bytes when no selector changed by any deliberate move.
 */
function projectBody(body: string): string {
  let root: postcss.Root;
  try {
    root = postcss.parse(body);
  } catch {
    // Malformed CSS never reaches this seam through the build (the CSS
    // pipeline parses it first); keep the authored bytes rather than guessing.
    return body;
  }
  return projectRuleSelectors(root) ? root.toString() : body;
}

/**
 * Scope one light-root component stylesheet to its own tag. Empty input stays
 * empty: a component with no authored rules must not emit an empty scope
 * block into its asset.
 */
export function scopeLightRootCss(tag: string, css: string): string {
  if (css.length === 0) return '';
  const { prologue, body } = splitPrologue(css);
  const scoped = `@scope (${tag}) {\n${projectBody(body)}\n}`;
  return prologue === '' ? scoped : `${prologue}\n${scoped}`;
}
