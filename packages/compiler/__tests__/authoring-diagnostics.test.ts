/**
 * @openelement/compiler — the authoring diagnostics a consumer actually meets.
 *
 * ADR-0143's verification clause is "unsupported syntax fails at build time
 * with source-located diagnostics". These are the `@property` and class-member
 * diagnostics that carry NO other pin: each case is a plausible authoring
 * mistake (a computed default, a spread option, a duplicated option, an
 * attribute name that cannot be an HTML attribute, a static method), and each
 * must fail with its own code rather than compile into something surprising.
 *
 * A diagnostic is asserted, never just "it threw": the code is the contract the
 * author reads, and the position is what makes it actionable.
 */

import { describe, expect, test } from 'vitest';
import {
  CompiledElementError,
  compileElementProgram,
} from '../src/internal/compiler/semantic-core/compile.ts';

const FILE = '/proj/app/components/oe-probe.tsx';

function moduleWith(member: string, options = '{ root: "light" }'): string {
  return [
    "import { element, OpenElement, property } from '@openelement/element';",
    `@element('oe-probe', ${options})`,
    'export class Probe extends OpenElement {',
    member,
    '  render() { return <div>probe</div>; }',
    '}',
    '',
  ].join('\n');
}

/** One `@property` declaration, for the positive deny-list case. */
function property(name: string, initializer: string): string {
  return `  @property({ reflect: false })\n  ${name} = ${initializer};`;
}

function diagnosticsOf(source: string): Array<{ code: string; line?: number }> {
  try {
    compileElementProgram(source, FILE);
  } catch (error) {
    if (error instanceof CompiledElementError) return error.diagnostics;
    throw error;
  }
  throw new Error('the module compiled; a diagnostic was expected');
}

describe('@property diagnostics', () => {
  const cases: ReadonlyArray<readonly [string, string, string]> = [
    [
      'a default that is not a serializable literal',
      '  @property({ reflect: false })\n  count = Math.max(1, 2);',
      'OEC9020',
    ],
    [
      'an option that is not a named literal assignment',
      '  @property({ ...shared })\n  count = 0;',
      'OEC9022',
    ],
    [
      'the same option twice',
      '  @property({ reflect: true, reflect: false })\n  count = 0;',
      'OEC9022',
    ],
    [
      'an option the framework does not implement',
      '  @property({ reflect: false, bogus: 1 })\n  count = 0;',
      'OEC9022',
    ],
    [
      'an attribute name that cannot be an HTML attribute',
      "  @property({ attribute: 'not a name!' })\n  count = 0;",
      'OEC9023',
    ],
    [
      'an attribute that is neither a string nor false',
      '  @property({ attribute: 1 })\n  count = 0;',
      'OEC9023',
    ],
    [
      'two properties claiming the same attribute',
      "  @property({ attribute: 'shared-name' })\n  first = 0;\n\n  @property({ attribute: 'shared-name' })\n  second = 0;",
      'OEC9023',
    ],
    [
      'a property name on the prototype-pollution deny list',
      "  @property({ reflect: false })\n  __proto__ = 'x';",
      'OEC9005',
    ],
    [
      'the prototype name that would replace the class prototype',
      "  @property({ reflect: false })\n  prototype = 'x';",
      'OEC9005',
    ],
    [
      'a property name on the deny list in any casing',
      "  @property({ reflect: false })\n  __PROTO__ = 'x';",
      'OEC9005',
    ],
  ];

  for (const [label, member, code] of cases) {
    test(label, () => {
      const diagnostics = diagnosticsOf(moduleWith(member));
      expect(
        diagnostics.map((diagnostic) => diagnostic.code),
        `${label} must be ${code}`,
      ).toContain(code);
      expect(
        diagnostics[0]?.line,
        'the diagnostic is source-located, not a bare failure',
      ).toBeTypeOf('number');
    });
  }

  test('ordinary property names stay admitted', () => {
    // The deny list is exact: names that merely resemble a forbidden primitive
    // compile, so the check cannot over-reject an ordinary component.
    for (const name of ['label', '__proto', 'constructorName', 'prototypeOf']) {
      expect(() => compileElementProgram(moduleWith(property(name, "'x'")), FILE)).not.toThrow();
    }
  });

  test('the constructor spelling is refused by the parser before the deny list sees it', () => {
    const diagnostics = diagnosticsOf(moduleWith(property('constructor', "'x'")));
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('OEC9000');
  });
});

describe('class-member diagnostics', () => {
  test('a static method is refused: compiled members are concrete instance members', () => {
    const diagnostics = diagnosticsOf(moduleWith('  static build() { return 1; }'));
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('OEC9006');
  });
});
