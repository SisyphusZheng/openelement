/**
 * The server function component codegen boundaries (alpha15 R5, alert #4236).
 *
 * Two boundaries, one contract each:
 *
 *   1. String-literal emission (`codeStringLiteral`): the generated module's
 *      quoted text must stay byte-identical to `JSON.stringify`'s rendering of
 *      the same string. Proven DIFFERENTIALLY — every code point, every
 *      surrogate pairing (paired and unpaired), and targeted hostile literals —
 *      rather than by re-reading the spec.
 *   2. Identifier emission (the emitter's identifier boundary): a
 *      lowering-produced name that is not a plain identifier must fail the
 *      compile CLOSED with OEC9032. The emitter refuses to write such a name
 *      into an identifier position, so nothing can leave its slot and inject
 *      source into the generated module.
 */

import { describe, expect, test } from 'vitest';
import {
  ConstructorEmitter,
  codeStringLiteral,
  compileServerComponentModule,
} from '../src/internal/compiler/semantic-core/server-component.ts';
import { CompiledElementError } from '../src/internal/compiler/semantic-core/compiler-diagnostics.ts';
import { failAt } from '../src/internal/compiler/semantic-core/compiler-diagnostics.ts';
import { typescriptParser } from '../src/internal/compiler/semantic-core/parse-module.ts';
import type { Lowering } from '../src/internal/compiler/semantic-core/lower-program.ts';

const FILE = '/proj/app/server/card.tsx';

/** Literal-rendering mismatches against `JSON.stringify`, capped for a readable failure. */
function literalMismatches(values: Iterable<string>, limit = 5): string[] {
  const bad: string[] = [];
  for (const value of values) {
    const actual = codeStringLiteral(value);
    const expected = JSON.stringify(value);
    if (actual !== expected) {
      bad.push(`${expected} !== ${actual}`);
      if (bad.length >= limit) return bad;
    }
  }
  return bad;
}

const codePoint = (value: number): string =>
  `U+${value.toString(16).toUpperCase().padStart(4, '0')}`;

describe('codeStringLiteral: byte-identical to JSON.stringify', () => {
  test('every code point from U+0000 to U+10FFFF', () => {
    const bad: string[] = [];
    for (let value = 0; value <= 0x10ffff; value += 1) {
      // Lone surrogates are not code points; the next case covers every one.
      if (value >= 0xd800 && value <= 0xdfff) continue;
      const text = String.fromCodePoint(value);
      if (codeStringLiteral(text) !== JSON.stringify(text)) bad.push(codePoint(value));
    }
    expect(bad).toEqual([]);
  });

  test('every unpaired surrogate code unit', () => {
    const bad: string[] = [];
    for (let unit = 0xd800; unit <= 0xdfff; unit += 1) {
      const text = String.fromCharCode(unit);
      if (codeStringLiteral(text) !== JSON.stringify(text)) bad.push(codePoint(unit));
    }
    expect(bad).toEqual([]);
  });

  test('every high/low surrogate pairing', () => {
    const bad: string[] = [];
    for (let high = 0xd800; high <= 0xdbff; high += 1) {
      for (let low = 0xdc00; low <= 0xdfff; low += 1) {
        const text = String.fromCharCode(high, low);
        if (codeStringLiteral(text) !== JSON.stringify(text)) {
          bad.push(`${codePoint(high)} ${codePoint(low)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  test('targeted hostile literals', () => {
    const cases: string[] = [
      '',
      '"',
      '\\',
      '\\\\',
      "'",
      '\u0000',
      '\u001f',
      '\u007f',
      '\u2028',
      '\u2029',
      '\ufeff',
      'a"b\\c\nd\re\tf\bf',
      '<script>alert(1)</script>',
      '</script>',
      '${__h("script", {}, [])}',
      String.fromCharCode(0xd800),
      String.fromCharCode(0xdfff),
      String.fromCharCode(0xdc00, 0xd800),
      String.fromCharCode(0xdbff, 0xdfff),
      String.fromCharCode(0xd83d, 0xde00),
      `q"n\n\u2028\u2029z${String.fromCharCode(0xd800)}${String.fromCharCode(0xd83d, 0xde00)}`,
    ];
    expect(literalMismatches(cases)).toEqual([]);
    // The hostile rows above are only meaningful if the escape is real.
    expect(codeStringLiteral('a"b')).toBe('"a\\"b"');
    // JSON.stringify leaves U+2028/U+2029 raw inside the quoted literal, and
    // the emitter matches it exactly — the escape belongs to the *embedding*
    // context (a script element), which is the caller's boundary, not this one.
    expect(codeStringLiteral('\u2028')).toBe('"\u2028"');
    expect(codeStringLiteral('\u2029')).toBe(JSON.stringify('\u2029'));
    expect(codeStringLiteral(String.fromCharCode(0xd800))).toBe('"\\ud800"');
  });

  test('deterministic fuzz over a hostile alphabet', () => {
    const alphabet: number[] = [];
    for (let unit = 0; unit < 0x20; unit += 1) alphabet.push(unit);
    for (const unit of [
      0x22, 0x27, 0x5c, 0x7f, 0x80, 0x7ff, 0x800, 0x2028, 0x2029, 0xfeff, 0xffff,
    ]) {
      alphabet.push(unit);
    }
    for (let unit = 0xd7ff; unit <= 0xe001; unit += 1) alphabet.push(unit);
    let seed = 0x2f6e2b1;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };
    const values: string[] = [];
    for (let index = 0; index < 4000; index += 1) {
      const length = random() % 24;
      let text = '';
      for (let position = 0; position < length; position += 1) {
        text += String.fromCharCode(alphabet[random() % alphabet.length]!);
      }
      values.push(text);
    }
    expect(literalMismatches(values)).toEqual([]);
  });
});

/** One emitter over a lowering-shaped source tree, with a real fail closure. */
function emitterOf(
  lowering: {
    parts?: unknown[];
    componentCalls?: Map<string, unknown>;
    ssrCalls?: Set<string>;
    synthesizedFields?: unknown[];
  },
  parameter = 'props',
): ConstructorEmitter {
  const { sourceFile } = typescriptParser.parseModule(
    'export const probe = 1;\n',
    '/proj/probe.tsx',
  );
  return new ConstructorEmitter(
    sourceFile,
    {
      parts: [],
      componentCalls: new Map(),
      ssrCalls: new Set(),
      synthesizedFields: [],
      ...lowering,
    } as unknown as Lowering,
    parameter,
    failAt(sourceFile),
  );
}

function codesOf(run: () => unknown): string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof CompiledElementError) {
      return error.diagnostics.map((diagnostic) => diagnostic.code);
    }
    throw error;
  }
  return [];
}

function messagesOf(run: () => unknown): string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof CompiledElementError) {
      return error.diagnostics.map((diagnostic) => diagnostic.message);
    }
    throw error;
  }
  return [];
}

describe('the emitter identifier boundary fails CLOSED', () => {
  const HOSTILE = 'x); __h("script", {}, []) //';

  test('a non-identifier item field is rejected, not emitted', () => {
    const emitter = emitterOf({});
    expect(codesOf(() => emitter.emit({ k: 'ival', field: HOSTILE }))).toEqual(['OEC9032']);
    expect(messagesOf(() => emitter.emit({ k: 'ival', field: HOSTILE }))[0]).toContain(
      'the item field',
    );
  });

  test('a non-identifier text sink is rejected', () => {
    const emitter = emitterOf({ parts: [{ k: 'text', signal: 'name; globalThis.pwned = 1' }] });
    expect(codesOf(() => emitter.emit({ k: 'part', index: 0 }))).toEqual(['OEC9032']);
  });

  test('a non-identifier list sink is rejected', () => {
    const emitter = emitterOf({
      parts: [
        {
          k: 'each',
          signal: 'rows; evil(',
          key: 'id',
          item: [{ k: 'text', value: 'x' }],
        },
      ],
    });
    expect(codesOf(() => emitter.emit({ k: 'part', index: 0 }))).toEqual(['OEC9032']);
  });

  test('a non-identifier attribute sink is rejected', () => {
    const emitter = emitterOf({
      parts: [{ k: 'attr', signal: 'title-x', name: 'title', path: [], location: { node: 'e1' } }],
    });
    const node = { k: 'el', id: 'e1', tag: 'div', attrs: [], children: [] } as never;
    expect(codesOf(() => emitter.emit(node))).toEqual(['OEC9032']);
  });

  test('a non-identifier props parameter is rejected at construction', () => {
    expect(codesOf(() => emitterOf({}, 'props); evil('))).toEqual(['OEC9032']);
  });

  test('valid identifiers still emit exactly the expected member access', () => {
    const emitter = emitterOf({});
    expect(emitter.emit({ k: 'ival', field: 'label' })).toBe('__t(item.label)');
    const list = emitterOf({
      parts: [{ k: 'each', signal: 'rows', key: 'id', item: [{ k: 'ival', field: 'label' }] }],
    });
    expect(list.emit({ k: 'part', index: 0 })).toBe(
      "props.rows.map((item) => __t(item.label)).join('')",
    );
  });
});

describe('hostile literals through the real compile path', () => {
  test('a hostile slot value emits the JSON.stringify rendering byte-for-byte', () => {
    const slot = `q"n\n\u2028\\z${String.fromCharCode(0xd800)}${String.fromCharCode(0xd83d, 0xde00)}`;
    const result = compileServerComponentModule(
      `export function Host(props: { t: string }) {
  return <my-el><span slot={${JSON.stringify(slot)}}>x</span></my-el>;
}
`,
      FILE,
      { compiledTags: ['my-el'] },
    );
    expect(result).not.toBeNull();
    expect(result!.code).toContain(JSON.stringify(slot));
    expect(result!.code).toContain(codeStringLiteral(slot));
  });
});
