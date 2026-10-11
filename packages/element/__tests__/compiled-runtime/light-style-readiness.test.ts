/**
 * The light style sink must never read a sheet that is still filling.
 *
 * A generated style adapter creates its `CSSStyleSheet` synchronously and
 * installs the rules asynchronously (`STYLE_SHEET_READY`). While `replace()` is
 * settling, Firefox answers a `cssRules` read by *throwing* ("Can't access
 * rules of still-loading style sheet") where Chromium and WebKit return an
 * empty list. The light scope snapshots the rules into its owned head node, so
 * a synchronous read on connect was a cross-engine race: any reconnect that
 * landed inside the sheet's filling window threw on Firefox — the intermittent
 * `Q1-B/B1` failure. The sink now creates its node immediately and defers the
 * snapshot to the readiness continuation that already existed.
 */
import { expect, test } from 'vitest';
import { STYLE_SHEET_READY } from '@openelement/protocol/style-sheet';
import { CompiledElementKernel } from '../../src/internal/compiled/runtime/kernel.ts';
import { TestDocument, type TestElement } from './test-dom.ts';
import { testProgram } from './test-program.ts';

const PROGRAM = testProgram({
  tag: 'oe-light-ready',
  template: [{ k: 'el', tag: 'div', attrs: [], children: [] }],
  parts: [],
});

interface FillingSheet {
  cssRules: Array<{ cssText: string }>;
  replaceSync(text: string): void;
  [STYLE_SHEET_READY]: Promise<void>;
}

function fillingSheet(): { sheet: FillingSheet; settle(): void; markLoaded(): void } {
  let settle!: () => void;
  const ready = new Promise<void>((resolve) => {
    settle = resolve;
  });
  let loading = true;
  const sheet: FillingSheet = {
    get cssRules() {
      if (loading) throw new Error("Can't access rules of still-loading style sheet");
      return [{ cssText: 'oe-light-ready { color: red; }' }];
    },
    replaceSync() {},
    [STYLE_SHEET_READY]: ready,
  };
  return {
    sheet,
    settle: () => settle(),
    markLoaded: () => {
      loading = false;
    },
  };
}

test('a light root defers the style snapshot while a sheet is still filling', async () => {
  const document = new TestDocument();
  const element = document.createElement('oe-light-ready');
  const { sheet, settle, markLoaded } = fillingSheet();
  const kernel = new CompiledElementKernel(element as unknown as HTMLElement, PROGRAM, {
    signals: {},
    handlers: {},
    rootMode: 'light',
    styles: sheet,
  });

  expect(
    () => kernel.connect(),
    'connecting must not read a filling sheet (Firefox throws on that read)',
  ).not.toThrow();
  const owned = document.head.childNodes[0] as unknown as TestElement;
  expect(owned.getAttribute('data-open-element-compiled-style')).toEqual('');
  expect(
    (owned as unknown as { textContent?: string }).textContent,
    'no snapshot is invented from an unreadable sheet',
  ).toEqual(undefined);

  markLoaded();
  settle();
  await sheet[STYLE_SHEET_READY];
  await Promise.resolve();
  expect(
    (owned as unknown as { textContent?: string }).textContent,
    'the readiness continuation writes the same owned node',
  ).toContain('oe-light-ready');
  expect(document.head.childNodes.length, 'still one owned node').toEqual(1);
  kernel.dispose();
  expect(document.head.childNodes.length, 'dispose removes it').toEqual(0);
});

test('a ready sheet still snapshots synchronously on connect', () => {
  const document = new TestDocument();
  const element = document.createElement('oe-light-ready');
  const sheet = {
    cssRules: [{ cssText: 'oe-light-ready { color: blue; }' }],
    replaceSync() {},
  };
  const kernel = new CompiledElementKernel(element as unknown as HTMLElement, PROGRAM, {
    signals: {},
    handlers: {},
    rootMode: 'light',
    styles: sheet,
  });
  kernel.connect();
  const owned = document.head.childNodes[0] as unknown as { textContent?: string };
  expect(owned.textContent).toContain('oe-light-ready');
  kernel.dispose();
});
