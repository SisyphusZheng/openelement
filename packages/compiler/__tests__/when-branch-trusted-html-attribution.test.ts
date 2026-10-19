/**
 * When-branch trusted-HTML sink attribution (alpha15 C2, P1).
 *
 * A branch element's sink Parts are addressed branch-relative: each branch
 * root's own address is [0], so sibling branches share a path. Sink ownership
 * must therefore be the OWNING ELEMENT's identity, never path equality — the
 * path-equality check attributed one branch's sink to its sibling and rejected
 * the legal on-branch component with the wrong-cause OEC9026 (the sibling is
 * childless, the real owner is not its child).
 *
 * The matrix pins the admitted forms — outside a branch, on the on-branch, on
 * the off-branch, both branches — and the reverse direction: a sibling
 * branch's sink can never satisfy another branch's capability marker.
 */

import { describe, expect, test } from 'vitest';
import {
  CompiledElementError,
  compileElementProgram,
} from '../src/internal/compiler/semantic-core/compile.ts';
import type { PartProgramV2, ProgramTreeNode } from '@openelement/protocol/part-program';

const FILE = '/proj/app/components/oe-branch-trusted-html.tsx';

const FIELDS = `
  @property({ type: Boolean, reflect: false }) flag = true;
  @property({ type: Object, reflect: false, attribute: false })
  bodyHtml: ReturnType<typeof trustedHtml> = trustedHtml('');
`;

function component(render: string): string {
  return [
    "import { element, OpenElement, property, trustedHtml } from '@openelement/element';",
    "@element('oe-branch-trusted-html')",
    'export class BranchTrustedHtml extends OpenElement {',
    FIELDS,
    `  render() { return ${render}; }`,
    '}',
    '',
  ].join('\n');
}

/** Every template node list the program owns: the root and each Block's trees. */
function treesOf(program: PartProgramV2): ProgramTreeNode[][] {
  return [
    program.template,
    ...program.parts.flatMap((part) => {
      if (part.k === 'when') return [part.on, part.off];
      if (part.k === 'each') return [part.item];
      return [];
    }),
  ];
}

/** The element node carrying `id`, anywhere in the program's trees. */
function elementById(program: PartProgramV2, id: string): ProgramTreeNode | null {
  const search = (nodes: ProgramTreeNode[]): ProgramTreeNode | null => {
    for (const node of nodes) {
      if (node.k !== 'el') continue;
      if (node.id === id) return node;
      const nested = search(node.children);
      if (nested) return nested;
    }
    return null;
  };
  for (const nodes of treesOf(program)) {
    const found = search(nodes);
    if (found) return found;
  }
  return null;
}

const CASES: ReadonlyArray<readonly [string, string, number]> = [
  ['outside a branch', '<main><p innerHTML={this.bodyHtml} trustedHtml></p></main>', 1],
  [
    'on the on-branch',
    '<main>{this.flag ? <p innerHTML={this.bodyHtml} trustedHtml></p> : <p>y</p>}</main>',
    1,
  ],
  [
    'on the off-branch',
    '<main>{this.flag ? <p>y</p> : <p innerHTML={this.bodyHtml} trustedHtml></p>}</main>',
    1,
  ],
  [
    'on both branches',
    '<main>{this.flag ? <p innerHTML={this.bodyHtml} trustedHtml></p> : <p innerHTML={this.bodyHtml} trustedHtml></p>}</main>',
    2,
  ],
];

describe('a trusted-HTML sink in a when branch stays admitted', () => {
  for (const [label, render, sinkCount] of CASES) {
    test(label, () => {
      const { program } = compileElementProgram(component(render), FILE);
      const sinks = program.parts.filter((part) => part.k === 'html');
      expect(sinks.length, `${label}: one html Part per authored sink`).toBe(sinkCount);
      for (const sink of sinks) {
        const ownerId = sink.location.node;
        expect(ownerId, 'every html Part names its owning element').toBeTypeOf('string');
        const owner = elementById(program, ownerId!);
        expect(owner, 'the owning element exists in the template tree').not.toBeNull();
        expect(owner!.k === 'el' ? owner!.tag : '').toBe('p');
        expect(owner!.k === 'el' ? owner!.children : []).toEqual([]);
      }
    });
  }

  test('a sibling branch sink never satisfies another branch capability marker', () => {
    // The on-branch carries the sink; the off-branch carries only the marker.
    // Attribution by identity fails the off-branch with the marker's own
    // diagnostic — never the sibling's childless complaint.
    const source = component(
      '<main>{this.flag ? <p innerHTML={this.bodyHtml} trustedHtml></p> : <p trustedHtml>y</p>}</main>',
    );
    let thrown: unknown;
    try {
      compileElementProgram(source, FILE);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CompiledElementError);
    const diagnostics = (thrown as CompiledElementError).diagnostics;
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['OEC9026']);
    expect(diagnostics[0]?.message).toContain('requires an innerHTML sink');
  });
});
