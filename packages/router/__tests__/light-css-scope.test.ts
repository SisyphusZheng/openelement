/**
 * Build-time light-root CSS scoping (alpha15 S lane, S-C1.2).
 *
 * The scoping contract the runtime used to apply per activation is now the
 * build's: the emitted asset IS the scoped stylesheet. These tests pin the
 * shape of that asset — one native `@scope` block per component tag, the
 * shadow-selector projection, byte-preservation outside the deliberate moves,
 * and the prologue-at-rule rule.
 */
import { expect, test } from 'vitest';
import { scopeLightRootCss } from '../src/vite/internal/light-css-scope.ts';

test('light-root CSS uses one native scope and projects shadow selectors', () => {
  const css = `
:host { display: block; }
:host([rail]) .shell, :host(:not([rail])) .main { color: red; }
.body ::slotted(p) { margin: 0; }
@media (max-width: 40rem) { .shell { display: grid; } }
`;

  expect(scopeLightRootCss('open-reading-shell', css)).toEqual(`@scope (open-reading-shell) {\n
:scope { display: block; }
:scope:is([rail]) .shell, :scope:is(:not([rail])) .main { color: red; }
.body slot > :is(p) { margin: 0; }
@media (max-width: 40rem) { .shell { display: grid; } }
\n}`);
});

test('light-root CSS preserves selector-like text in strings and comments', () => {
  const scoped = scopeLightRootCss(
    'oe-card',
    `/* :host ::slotted(*) */ .card::before { content: ":host ::slotted(*)"; }`,
  );

  expect(scoped).toContain('/* :host ::slotted(*) */');
  expect(scoped).toContain('content: ":host ::slotted(*)"');
});

test('light-root CSS leaves empty styles empty', () => {
  expect(scopeLightRootCss('oe-card', '')).toEqual('');
});

test('a sheet with no prologue at-rule is wrapped byte-for-byte', () => {
  // The whole sheet is copied, trivia included: the only deliberate moves are
  // the wrapper and the shadow-selector projection.
  const css = '  .a {\n  color: red;\n}\n.b::after { content: "}"; }\n';
  expect(scopeLightRootCss('oe-x', css)).toEqual(`@scope (oe-x) {\n${css}\n}`);
});

test('prologue at-rules are hoisted above the scope, everything else stays inside', () => {
  const css = [
    `@charset "utf-8";`,
    `@import url('./palette.css') layer(base);`,
    `@namespace svg url(http://www.w3.org/2000/svg);`,
    `@layer tokens, components;`,
    `@font-face { font-family: x; src: url('./x.woff2'); }`,
    `@property --tone { syntax: "<color>"; inherits: true; initial-value: red; }`,
    `@keyframes pulse { from { opacity: 0 } to { opacity: 1 } }`,
    `@container (min-width: 10rem) { .a { color: red } }`,
    `@supports (display: grid) { .b { display: grid } }`,
    `:host { --tone: blue; }`,
  ].join('\n');

  const scoped = scopeLightRootCss('oe-x', css);
  const scopeIndex = scoped.indexOf('@scope (oe-x) {');

  // The three prologue at-rules precede the wrapper — inside it they would be
  // dropped by the parser — and the sheet's own conditional/registration
  // at-rules stay in the scoped body, exactly as authored.
  expect(scoped.indexOf(`@charset "utf-8";`)).toBeLessThan(scopeIndex);
  expect(scoped.indexOf(`@import url('./palette.css') layer(base);`)).toBeLessThan(scopeIndex);
  expect(scoped.indexOf(`@namespace svg url(http://www.w3.org/2000/svg);`)).toBeLessThan(
    scopeIndex,
  );
  for (const inside of [
    '@layer tokens, components;',
    '@font-face',
    '@property --tone',
    '@keyframes pulse',
    '@container (min-width: 10rem)',
    '@supports (display: grid)',
    ':scope { --tone: blue; }',
  ]) {
    expect(scoped.indexOf(inside), `${inside} stays inside the scope`).toBeGreaterThan(scopeIndex);
  }
  expect(scoped.indexOf('@scope (oe-x) {')).toEqual(scoped.lastIndexOf('@scope (oe-x) {'));
});

test('a prologue inside a comment or a string is not hoisted', () => {
  const css = `/* @import './decoy.css'; */ .a::before { content: "@charset \\"utf-8\\";"; }`;
  const scoped = scopeLightRootCss('oe-x', css);
  expect(scoped.startsWith('@scope (oe-x) {')).toEqual(true);
  expect(scoped).toContain(`/* @import './decoy.css'; */`);
});

// ── F02: the projection is selector-only (postcss AST boundary) ────────────
//
// The projection must never rewrite a `:host`/`::slotted` token outside rule
// selector position: declaration values, unquoted url() contents, at-rule
// preludes, comments and strings are authored data, not selector grammar.

test('declaration values are never projected (custom properties, animation, unquoted url)', () => {
  const scoped = scopeLightRootCss(
    'oe-x',
    [
      '.a { --selector: :host; }',
      '.b { --sel: :host(.x); }',
      '.c { --sel: ::slotted(span); }',
      '.d { animation: :host 1s; }',
      '.e { background: url(data:image/svg+xml;utf8,<svg>:host</svg>); }',
      '.f { --context: :host-context(.dark); }',
    ].join('\n'),
  );

  for (const authored of [
    '--selector: :host;',
    '--sel: :host(.x);',
    '--sel: ::slotted(span);',
    'animation: :host 1s;',
    'url(data:image/svg+xml;utf8,<svg>:host</svg>)',
    '--context: :host-context(.dark);',
  ]) {
    expect(scoped, `${authored} stays authored`).toContain(authored);
  }
  expect(scoped).not.toContain(':scope:is(.x)');
  expect(scoped).not.toContain('slot > :is(span)');
});

test('at-rule preludes are never projected', () => {
  const scoped = scopeLightRootCss(
    'oe-x',
    [
      '@supports selector(:host) { .a { color: red; } }',
      '@supports selector(:host(.x)) { .b { color: red; } }',
      '@media (min-width: 10rem) and selector(:host) { .c { color: red; } }',
    ].join('\n'),
  );

  expect(scoped).toContain('@supports selector(:host) {');
  expect(scoped).toContain('@supports selector(:host(.x)) {');
  expect(scoped).toContain('selector(:host)');
  expect(scoped).not.toContain('selector(:scope');
});

test('escaped identifiers are not selector tokens', () => {
  const scoped = scopeLightRootCss(
    'oe-x',
    [
      String.raw`.icon\:host { color: red; }`,
      String.raw`.icon\:host:hover { color: red; }`,
      String.raw`.icon\:\:slotted\(p\) { color: red; }`,
      String.raw`.icon\3a host { color: red; }`,
      String.raw`.\[\&\:host\]\:block:host { display: block; }`,
    ].join('\n'),
  );

  expect(scoped).toContain(String.raw`.icon\:host {`);
  expect(scoped).toContain(String.raw`.icon\:host:hover {`);
  expect(scoped).toContain(String.raw`.icon\:\:slotted\(p\) {`);
  // A hex escape consumes its terminator: `\3a ` is the colon of the class
  // name, and the following `host` is not a `:host` token either.
  expect(scoped).toContain(String.raw`.icon\3a host {`);
  // The Tailwind arbitrary-variant class keeps its escaped payload, and only
  // the real trailing `:host` pseudo-class is projected.
  expect(scoped).toContain(String.raw`.\[\&\:host\]\:block:scope {`);
});

test('attribute-selector contents are not selector grammar', () => {
  const scoped = scopeLightRootCss(
    'oe-x',
    String.raw`.a[data-x=":host"] { color: blue; }
.b[data-x=:host] { color: blue; }
.c[data-x='::slotted(p)'] { color: blue; }`,
  );

  expect(scoped).toContain(String.raw`.a[data-x=":host"] {`);
  expect(scoped).toContain(String.raw`.b[data-x=:host] {`);
  expect(scoped).toContain(String.raw`.c[data-x='::slotted(p)'] {`);
  expect(scoped).not.toContain(':scope');
});

test('matching is ASCII case-insensitive (N1)', () => {
  const scoped = scopeLightRootCss(
    'oe-x',
    [
      ':HOST { display: block; }',
      ':Host([rail]) { color: red; }',
      '::SLOTTED(p) { margin: 0; }',
      ':HOST-CONTEXT(.dark) .x { color: red; }',
      '.a { --x: :HOST; }',
    ].join('\n'),
  );

  expect(scoped).toContain(':scope { display: block; }');
  expect(scoped).toContain(':scope:is([rail]) {');
  expect(scoped).toContain('slot > :is(p) {');
  // The identifier continuation after `:HOST` makes it `:HOST-CONTEXT`, not
  // the `:host` token; declaration text stays authored.
  expect(scoped).toContain(':HOST-CONTEXT(.dark) .x {');
  expect(scoped).toContain('--x: :HOST;');
});

test(':host-context stays authored (document decision) while :host projects around it', () => {
  const scoped = scopeLightRootCss(
    'oe-x',
    ':host-context(.dark) :host { color: red; }\n:host-context(.light) .icon\\:host { color: blue; }',
  );

  expect(scoped).toContain(':host-context(.dark) :scope {');
  expect(scoped).toContain(String.raw`:host-context(.light) .icon\:host {`);
});

test('a selector-only sheet is wrapped byte-for-byte', () => {
  // Nothing in this sheet is a selector token; the body must be the authored
  // bytes exactly (no postcss reserialization). The prologue split still
  // applies to the at-rules the CSS grammar requires before other rules.
  const css = [
    '.a { --selector: :host; }',
    '.b { background: url(data:image/svg+xml;utf8,<svg>:host</svg>); }',
    '.c::before { content: ":host ::slotted(*)"; }',
    '/* ::slotted(p) */',
    '',
  ].join('\n');
  expect(scopeLightRootCss('oe-x', css)).toEqual(`@scope (oe-x) {\n${css}\n}`);
});

test('an unparseable sheet is wrapped verbatim instead of throwing', () => {
  const css = '.a::before { content: ":host }';
  const scoped = scopeLightRootCss('oe-x', css);
  expect(scoped).toEqual(`@scope (oe-x) {\n${css}\n}`);
});

// ── tokenizer edge cases of the prologue split and selector projection ─────
//
// These pin the defensive scanning paths: at-rule blocks containing raw braces,
// strings and comments; strings and escapes inside selector text; the CSS
// escape grammar (hex digits, whitespace terminators, EOF); comments and
// stray brackets in selector position. None of them is a normal authoring
// shape — the contract is that the scanner copies or projects deliberately
// and never guesses.

test('a leading block at-rule is skipped by the prologue scan and stays scoped', () => {
  const css = '@media screen { /* } */ .a::after { content: "}" } }\n.b { color: red; }';
  const scoped = scopeLightRootCss('oe-x', css);
  expect(scoped).toContain('content: "}"');
  expect(scoped).toContain('.b { color: red; }');
  expect(scoped.indexOf('@media screen')).toBeGreaterThan(scoped.indexOf('@scope (oe-x)'));
});

test('a comment inside a prologue prelude does not end the at-rule early', () => {
  const css = `@import /* keep */ url('./x.css');\n.a { color: red; }`;
  const scoped = scopeLightRootCss('oe-x', css);
  expect(scoped.startsWith(`@import /* keep */ url('./x.css');`)).toBe(true);
  expect(scoped).toContain('.a { color: red; }');
});

test('a malformed leading at-rule name falls back to the authored-bytes wrapper', () => {
  // `@` followed by no at-rule name is not a prologue at-rule; the sheet is
  // handed to postcss as authored and a parse failure wraps it verbatim.
  const css = '@ { .a { color: red } }';
  const scoped = scopeLightRootCss('oe-x', css);
  expect(scoped).toEqual(`@scope (oe-x) {\n${css}\n}`);
});

test('a string escape inside a selector stays authored', () => {
  const css = String.raw`[data-x="a\"b"]:host { color: red; }`;
  const scoped = scopeLightRootCss('oe-x', css);
  expect(scoped).toContain(String.raw`[data-x="a\"b"]:scope {`);
});

test('a comment between selector tokens is copied and projection continues', () => {
  const scoped = scopeLightRootCss('oe-x', '.a/* c */:host { color: red; }');
  expect(scoped).toContain('.a/* c */:scope {');
});

test('a stray closing bracket in selector text does not corrupt projection', () => {
  // Malformed selector (a browser drops the rule); the tokenizer must not
  // underflow its bracket depth or lose the rest of the selector.
  const scoped = scopeLightRootCss('oe-x', '.a]:host { color: red; }');
  expect(scoped).toContain('.a]:scope {');
});

test('escape code points outside the hex range are consumed as one character', () => {
  // Escape-aware projection must treat every backslash escape as a unit,
  // whatever code point follows it (ident code points, punctuation, digits).
  const css = [
    String.raw`.a\G:host { color: red; }`,
    String.raw`.a\g:host { color: red; }`,
    String.raw`.a\Z:host { color: red; }`,
    String.raw`.a\z:host { color: red; }`,
    String.raw`.a\/:host { color: red; }`,
    String.raw`.a\::host { color: red; }`,
    String.raw`.a\0:host { color: red; }`,
    String.raw`.a\A:host { color: red; }`,
  ].join('\n');
  const scoped = scopeLightRootCss('oe-x', css);
  expect(scoped.match(/:scope/g)?.length).toEqual(8);
});

test('hex escapes consume digits of every case and every whitespace terminator', () => {
  const css = [
    String.raw`.\68 ost:host { color: red; }`, // digit digits + space terminator
    String.raw`.\4A:host { color: red; }`, // uppercase hex digit, no terminator
    `.\\68\tost:host { color: red; }`, // tab terminator
    `.\\68\fost:host { color: red; }`, // form-feed terminator
    `.\\68\rost:host { color: red; }`, // carriage-return terminator
    '.\\68\nost:host { color: red; }', // newline terminator
    String.raw`.\68x:host { color: red; }`, // non-hex, non-whitespace terminator
  ].join('\n');
  const scoped = scopeLightRootCss('oe-x', css);
  expect(scoped.match(/:scope/g)?.length).toEqual(7);
});
