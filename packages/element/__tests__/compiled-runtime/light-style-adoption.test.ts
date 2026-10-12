/**
 * A light root ADOPTS its stylesheets; it never snapshots them (alpha15 S lane,
 * S-C1.2).
 *
 * The retired light sink copied a sheet's rules into an owned `<style>` node,
 * which forced a synchronous `cssRules` read on connect — a cross-engine race
 * (Firefox throws on a still-loading sheet while Chromium and WebKit answer an
 * empty list), the intermittent KR-2/Q1-B failure. Adoption has no read at
 * all: the scope installs the sheet object on the document that holds the
 * component's DOM, and a sheet that is still filling fills itself in place,
 * for every target that adopted it, when its `replace()` settles.
 *
 * What these tests therefore pin is the absence of a read, the document-level
 * shared ownership (a disconnect removes nothing another instance needs, a
 * reconnect adds nothing twice), the fail-closed path for a document that
 * cannot adopt, and the one continuation the scope still owns — reporting a
 * rejected sheet once, against the connection that held it.
 */
import { afterEach, beforeEach, expect, test } from 'vitest';
import { STYLE_SHEET_READY } from '@openelement/protocol/style-sheet';
import { StyleErrorCode } from '@openelement/protocol/errors';
import {
  resetErrorTelemetryHookForTests,
  setErrorTelemetryHook,
} from '../../src/internal/core/errors.ts';
import { CompiledElementKernel } from '../../src/internal/compiled/runtime/kernel.ts';
import { TestDocument } from './test-dom.ts';
import { testProgram } from './test-program.ts';

const PROGRAM = testProgram({
  tag: 'oe-light-adopt',
  template: [{ k: 'el', tag: 'div', attrs: [], children: [] }],
  parts: [],
});

interface FillingSheet {
  cssRules: Array<{ cssText: string }>;
  replaceSync(text: string): void;
  [STYLE_SHEET_READY]: Promise<void>;
}

/** A sheet whose rules throw while they are still arriving (Firefox's answer). */
function fillingSheet(): { sheet: FillingSheet; settle(): void; markLoaded(): void } {
  let settle!: () => void;
  const ready = new Promise<void>((resolve) => {
    settle = resolve;
  });
  let loading = true;
  const sheet: FillingSheet = {
    get cssRules() {
      if (loading) throw new Error("Can't access rules of still-loading style sheet");
      return [{ cssText: 'oe-light-adopt { color: red; }' }];
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

function connect(
  document: TestDocument,
  styles: unknown,
  tag = 'oe-light-adopt',
): CompiledElementKernel {
  const element = document.createElement(tag);
  const kernel = new CompiledElementKernel(element as unknown as HTMLElement, PROGRAM, {
    signals: {},
    handlers: {},
    rootMode: 'light',
    styles: styles as never,
  });
  kernel.connect();
  return kernel;
}

beforeEach(() => {
  resetErrorTelemetryHookForTests();
});

afterEach(() => {
  resetErrorTelemetryHookForTests();
});

test('connecting never reads a filling sheet: the sheet itself is adopted', async () => {
  const document = new TestDocument();
  const { sheet, settle, markLoaded } = fillingSheet();
  let kernel!: CompiledElementKernel;
  expect(() => {
    kernel = connect(document, sheet);
  }, 'connecting must not read a filling sheet (Firefox throws on that read)').not.toThrow();

  // The read is gone, not deferred: connecting must not touch `cssRules`, and
  // no node is invented to hold a snapshot that could not be read.
  expect(document.head.childNodes.length, 'no runtime style node is created').toEqual(0);
  expect(document.adoptedStyleSheets, 'the document adopts the sheet object').toEqual([sheet]);

  markLoaded();
  settle();
  await sheet[STYLE_SHEET_READY];
  await Promise.resolve();
  expect(document.adoptedStyleSheets, 'a late settlement needs no second pass').toEqual([sheet]);
  expect(document.head.childNodes.length, 'and creates nothing').toEqual(0);
  kernel.dispose();
});

test('same-document instances share one adopted sheet and a disconnect removes nothing', () => {
  const document = new TestDocument();
  const sheet = {
    replaceSync() {},
    cssRules: [{ cssText: 'oe-light-adopt { color: red; }' }],
  };

  const first = connect(document, sheet);
  const second = connect(document, sheet);
  expect(document.adoptedStyleSheets, 'adoption is idempotent per sheet object').toEqual([sheet]);

  first.disconnect();
  expect(document.adoptedStyleSheets, 'the second live instance still needs the sheet').toEqual([
    sheet,
  ]);
  second.disconnect();
  expect(
    document.adoptedStyleSheets,
    'the document owns the sheet: it is shared, document-lifetime state',
  ).toEqual([sheet]);

  // Reconnect/revive: the sheet is already listed, so nothing is added twice.
  first.connect();
  expect(document.adoptedStyleSheets).toEqual([sheet]);
  first.dispose();
  second.dispose();
});

test('a document that cannot adopt fails closed instead of falling back', () => {
  const document = new TestDocument();
  Reflect.deleteProperty(document, 'adoptedStyleSheets');
  let failure: { code?: string } | undefined;
  try {
    connect(document, { replaceSync() {}, cssRules: [] });
  } catch (error) {
    failure = error as { code?: string };
  }
  expect(failure?.code, 'the failure carries the catalogued code').toEqual(
    StyleErrorCode.ADOPTED_STYLES_UNSUPPORTED,
  );
  expect(document.head.childNodes.length, 'and injects nothing').toEqual(0);
});

test('a rejected sheet is reported once, and only for its own connection', async () => {
  const reported: string[] = [];
  setErrorTelemetryHook((error) => reported.push(error.code ?? ''));
  const document = new TestDocument();
  const failing = {
    replaceSync() {},
    cssRules: [],
    [STYLE_SHEET_READY]: Promise.reject(new Error('asset unreachable')),
  };

  const live = connect(document, failing);
  const stale = connect(document, { ...failing });
  stale.disconnect();

  await Promise.allSettled([failing[STYLE_SHEET_READY]]);
  await Promise.resolve();
  await Promise.resolve();

  expect(reported, 'the live connection reports the failure exactly once').toEqual([
    StyleErrorCode.SHEET_LOAD_FAILED,
  ]);
  live.dispose();
});
