/**
 * The `@openelement/element/server` constructor helpers — `__h`, `__t`,
 * `__ssr`.
 *
 * These are the runtime half of the server function component lane: the
 * compiler lowers admitted server TSX functions to calls against this surface.
 * The contract pinned here:
 *
 *   - `__t` escapes every dynamic text value through the ONE DSD-serializer
 *     `escapeText` implementation (no second escape copy exists);
 *   - `__h` escapes every attribute value through the ONE `escapeAttr`
 *     implementation, admits only safe attribute names, emits bare boolean
 *     attributes, omits falsy ones, emits void elements self-closed, and
 *     routes the `innerHTML` key through the ONE trustedHtml brand check;
 *   - URL-carrying attribute values are screened by the ONE shared stream
 *     frame URL policy and fail closed with a code;
 *   - `__ssr` is the component path's literal runtime function: it renders a
 *     registered compiled host through the compiled serializer and fails
 *     closed for unregistered tags.
 *
 * The entry must never pull the client graph: importing it installs no
 * hydration machinery (the root barrel's side effects stay out of the server
 * module graph).
 */

import { describe, expect, test } from 'vitest';
import { __h, __t, __ssr } from '@openelement/element/server';
import { trustedHtml, OpenElementError } from '@openelement/element';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('__t — the dynamic text boundary', () => {
  test('escapes markup-significant characters via the serializer escapeText', () => {
    expect(__t('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(__t('a & b')).toBe('a &amp; b');
    expect(__t('"quoted"')).toBe('"quoted"'); // quotes are inert in text content
  });

  test('coerces non-strings like the serializer textPartValue (displayValue)', () => {
    expect(__t(7)).toBe('7');
    expect(__t(null)).toBe('');
    expect(__t(undefined)).toBe('');
    expect(__t(false)).toBe('false');
  });
});

describe('__h — the element constructor', () => {
  test('emits static and escaped dynamic attributes in one quoted form', () => {
    expect(__h('article', { class: 'card', 'data-x': 'a"b' }, [])).toBe(
      '<article class="card" data-x="a&quot;b"></article>',
    );
  });

  test('true is a bare attribute; false/null/undefined are omitted', () => {
    expect(__h('input', { disabled: true, autofocus: false, hidden: null }, [])).toBe(
      '<input disabled>',
    );
    expect(__h('input', { disabled: undefined }, [])).toBe('<input>');
  });

  test('void elements self-close; ordinary elements carry the closing tag', () => {
    expect(__h('br', {}, [])).toBe('<br>');
    expect(__h('img', { src: '/x.png' }, [])).toBe('<img src="/x.png">');
    expect(__h('div', {}, [])).toBe('<div></div>');
  });

  test('children are final HTML strings joined in order', () => {
    expect(__h('p', {}, ['a', __t('<b>'), 'c'])).toBe('<p>a&lt;b&gt;c</p>');
  });

  test('unsafe attribute names fail closed with a code', () => {
    expect(() => __h('div', { onclick: 'x' }, [])).toThrow(OpenElementError);
    expect(() => __h('div', { srcdoc: 'x' }, [])).toThrow(OpenElementError);
    expect(() => __h('div', { 'not a name': 'x' }, [])).toThrow(OpenElementError);
  });

  test('raw-text and forbidden tags fail closed with a code', () => {
    expect(() => __h('script', {}, ['x'])).toThrow(OpenElementError);
    expect(() => __h('NotATag', {}, [])).toThrow(OpenElementError);
  });

  test('URL-carrying attributes are screened by the shared URL policy', () => {
    expect(__h('a', { href: '/docs/intro' }, ['x'])).toBe('<a href="/docs/intro">x</a>');
    let thrown: unknown;
    try {
      __h('a', { href: 'javascript:alert(1)' }, ['x']);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(OpenElementError);
    expect((thrown as OpenElementError).code).toBe('OE_UNSAFE_URL_SINK');
    try {
      __h('a', { href: 'jav&#x0A;ascript:alert(1)' }, ['x']);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as OpenElementError).code).toBe('OE_UNSAFE_URL_SINK');
  });

  test('the innerHTML key is the trustedHtml sink: brand required, content raw', () => {
    expect(__h('div', { innerHTML: trustedHtml('<b>ok</b>') }, [])).toBe('<div><b>ok</b></div>');
    let thrown: unknown;
    try {
      __h('div', { innerHTML: { html: '<b>forged</b>' } }, []);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(OpenElementError);
    expect((thrown as OpenElementError).code).toBe('OE_UNTRUSTED_HTML_SINK');
    try {
      __h('div', { innerHTML: '<b>forged</b>' }, []);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as OpenElementError).code).toBe('OE_UNTRUSTED_HTML_SINK');
  });

  test('class and style values coerce like the serializer (arrays, records)', () => {
    expect(__h('div', { class: ['a', 'b'] }, [])).toBe('<div class="a b"></div>');
    expect(__h('div', { style: { color: 'red' } }, [])).toBe('<div style="color:red"></div>');
  });
});

describe('__ssr — the component path literal', () => {
  test('fails closed for an unregistered tag (the registry owns admission)', () => {
    expect(() => __ssr('oe-nothing-here', {})).toThrow(OpenElementError);
  });
});

describe('the server entry stays out of the client graph', () => {
  test('the entry imports no client barrel and installs no hydration machinery', () => {
    const entry = readFileSync(fileURLToPath(new URL('../src/server.ts', import.meta.url)), 'utf8');
    expect(entry).not.toMatch(/from '\.\/index\.ts'/);
    expect(entry).not.toMatch(/from '\.\/public-surface\.ts'/);
    expect(entry).not.toMatch(/client-only/);
    expect(entry).not.toMatch(/hydrate-install|blocks-install/);
  });
});
