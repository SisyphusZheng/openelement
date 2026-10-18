/**
 * @openelement/element — the class lane's URL-carrying attribute sinks.
 *
 * The compiled class lane and the server `__h` constructor render the same
 * authoring surface, so both judge URL attribute values through the ONE shared
 * policy (`unsafeStreamFrameAttribute`): a `javascript:`/`vbscript:`/`data:`
 * scheme fails closed with `OE_UNSAFE_URL_SINK` instead of reaching markup or
 * the DOM. The corpus is the protocol predicate's own escape cases, driven
 * through the real serializer and the real DOM writes rather than through the
 * predicate a second time.
 */
import { expect, test } from 'vitest';
import { OpenElementError } from '@openelement/protocol/errors';
import { createFreshDom, serializeToHtml } from '../../src/internal/compiled/runtime.ts';
import { serializeProgramContent } from '../../src/internal/compiled/server/index.ts';
import { signal } from '../../src/internal/signal/framework.ts';
import { TestDocument, type TestElement } from '../compiled-runtime/test-dom.ts';
import { testProgram } from '../compiled-runtime/test-program.ts';

/** Schemes the shared protocol predicate refuses, with its escape forms. */
const HOSTILE_URLS = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  ' javascript:alert(1)',
  'jav&#x0A;ascript:alert(1)',
  'vbscript:msgbox(1)',
  'data:text/html,<script>alert(1)</script>',
];

/** Values the same predicate admits (relative, fragment, http, mailto). */
const SAFE_URLS = [
  '/docs/intro',
  '#main',
  'https://example.test/x?a=1',
  'mailto:team@example.test',
];

const URL_ATTRIBUTES = ['href', 'src', 'action', 'formaction'];

function urlProgram(attributeName: string) {
  return testProgram({
    tag: 'oe-url-sink',
    template: [{ k: 'el', tag: 'div', attrs: [], children: [] }],
    parts: [{ k: 'attr', index: 0, signal: 'url', name: attributeName, path: [0] }],
  });
}

function urlHost(url: string) {
  return { signals: { url: signal(url) }, handlers: {} };
}

function thrownCode(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof OpenElementError ? error.code : String(error);
  }
  return undefined;
}

function asNode(element: TestElement): Node {
  return element as unknown as Node;
}

test('the server serializer refuses every URL attribute carrying a script scheme', () => {
  for (const name of URL_ATTRIBUTES) {
    const program = urlProgram(name);
    for (const url of HOSTILE_URLS) {
      expect(
        thrownCode(() => serializeProgramContent(program, urlHost(url))),
        `${name}=${url}`,
      ).toBe('OE_UNSAFE_URL_SINK');
    }
  }
});

test('the seed serializer takes the same decision (one kernel, both modes)', () => {
  for (const name of URL_ATTRIBUTES) {
    const program = urlProgram(name);
    for (const url of HOSTILE_URLS) {
      expect(
        thrownCode(() => serializeToHtml(program, urlHost(url))),
        `${name}=${url}`,
      ).toBe('OE_UNSAFE_URL_SINK');
    }
  }
});

test('benign URL values still serialize', () => {
  for (const name of URL_ATTRIBUTES) {
    const program = urlProgram(name);
    for (const url of SAFE_URLS) {
      expect(serializeProgramContent(program, urlHost(url))).toContain(`${name}="${url}"`);
    }
  }
});

test('authored static URL attributes are screened by the same serializer rule', () => {
  const program = testProgram({
    tag: 'oe-static-url-sink',
    template: [
      {
        k: 'el',
        tag: 'a',
        attrs: [['href', 'javascript:alert(1)']],
        children: [{ k: 'text', value: 'go' }],
      },
    ],
    parts: [],
  });
  expect(thrownCode(() => serializeProgramContent(program, { signals: {}, handlers: {} }))).toBe(
    'OE_UNSAFE_URL_SINK',
  );
});

test('fresh DOM creation refuses a hostile signal value before it is written', () => {
  const document = new TestDocument();
  const root = document.createElement('host');
  expect(() =>
    createFreshDom(urlProgram('href'), urlHost('javascript:alert(1)'), asNode(root)),
  ).toThrow(OpenElementError);
  expect(root.childNodes, 'a refused mount leaves no DOM behind').toHaveLength(0);
});

test('a signal update refuses a hostile value and keeps the last safe attribute', () => {
  const document = new TestDocument();
  const root = document.createElement('host');
  const url = signal('/docs/intro');
  createFreshDom(urlProgram('href'), { signals: { url }, handlers: {} }, asNode(root));
  const anchor = root.childNodes[0] as TestElement;
  expect(anchor.getAttribute('href')).toBe('/docs/intro');

  expect(() => {
    url.value = 'javascript:alert(1)';
  }).toThrow(OpenElementError);
  expect(anchor.getAttribute('href'), 'the refused value never reached the DOM').toBe(
    '/docs/intro',
  );
});

test('each-item attribute slots are screened on mount and on update', () => {
  const program = testProgram({
    tag: 'oe-url-list',
    template: [{ k: 'el', tag: 'ul', attrs: [], children: [{ k: 'part', index: 0 }] }],
    parts: [
      {
        k: 'each',
        index: 0,
        signal: 'items',
        key: 'id',
        field: 'url',
        item: [
          {
            k: 'el',
            tag: 'li',
            attrs: [],
            iattrs: [['href', 'url']],
            children: [{ k: 'text', value: 'item' }],
          },
        ],
      },
    ],
  });
  const document = new TestDocument();
  const mounting = document.createElement('host');
  expect(() =>
    createFreshDom(
      program,
      { signals: { items: signal([{ id: 'a', url: 'javascript:alert(1)' }]) }, handlers: {} },
      asNode(mounting),
    ),
  ).toThrow(OpenElementError);

  const items = signal([{ id: 'a', url: '/safe' }]);
  const root = document.createElement('host');
  createFreshDom(program, { signals: { items }, handlers: {} }, asNode(root));
  const list = root.childNodes[0] as TestElement;
  const item = list.childNodes.find((node) => node.nodeType === 1) as TestElement;
  expect(item.getAttribute('href')).toBe('/safe');

  expect(() => {
    items.value = [{ id: 'a', url: 'javascript:alert(2)' }];
  }).toThrow(OpenElementError);
  expect(item.getAttribute('href'), 'the refused item value never reached the DOM').toBe('/safe');
});
