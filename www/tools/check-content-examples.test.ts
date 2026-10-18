/**
 * check-content-examples.test.ts — negative proof for the content gate's
 * docs-bug invariant (documented code must compile).
 *
 * The gate now runs every maintained-surface fence that authors a compiled
 * unit through the real compiler. This file pins the failure direction with
 * the exact shape the user-path audit reported as D4 (`recipe-form-actions`
 * branch text interpolation, `www/content/docs/guide/recipe-form-actions.md`
 * at the base SHA): that page is being rewritten in parallel, so the snippet
 * lives here as a stable local fixture rather than reaching into the doc:
 *
 *   - the D4 branch-text shape is RED (OEC9012), carrying the compiler's own
 *     boundary+fix message;
 *   - the working shape the fixtures use (static branch text plus an
 *     attribute-bound value) is GREEN;
 *   - a fragment fence (no compiled unit) is not compile-run, by the
 *     compiler's own admission boundary;
 *   - the only excluded pages are the documented-rejection grammar reference
 *     (en + zh) and the exclusion is explicit, never a silent skip.
 */
import { expect, test } from 'vitest';
import {
  compileExample,
  compileExamples,
  isCompileExcluded,
  type ContentExample,
} from './check-content-examples.ts';

let serial = 0;

function example(code: string, file = 'www/content/docs/guide/fixture.md'): ContentExample {
  serial++;
  return { file, index: serial, lang: 'tsx', code };
}

/** The D4 shape from the base-SHA form-actions recipe (branch text interpolation). */
const D4_BRANCH_TEXT = `import { element, OpenElement, property } from '@openelement/element';

@element('contact-page')
export default class ContactPage extends OpenElement {
  @property({ reflect: false, attribute: false })
  error = '';

  render() {
    return (
      <main>
        <h1>contact</h1>
        {this.error ? <p role='alert'>{this.error}</p> : <span></span>}
      </main>
    );
  }
}
`;

/** The compiled working shape the router fixtures use: static branch text. */
const STATIC_BRANCH_TEXT = `import { element, OpenElement, property } from '@openelement/element';

@element('contact-page')
export default class ContactPage extends OpenElement {
  @property({ reflect: false, attribute: false })
  error = '';

  render() {
    return (
      <main>
        <h1>contact</h1>
        {this.error ? <p role='alert' data-message={this.error}>Please fix the errors above.</p> : <span></span>}
      </main>
    );
  }
}
`;

test('the D4 branch-text recipe is caught red with the compiler diagnostic', () => {
  const failures = compileExample(example(D4_BRANCH_TEXT));
  expect(failures.length).toBeGreaterThan(0);
  expect(failures[0]!.message).toContain('OEC9012');
  expect(failures[0]!.message).toContain('a branch cannot interpolate text');
  expect(failures[0]!.file).toContain('fixture.md');
});

test('the working static-branch-text shape compiles clean', () => {
  expect(compileExample(example(STATIC_BRANCH_TEXT))).toEqual([]);
});

test('an island config sidecar is admitted exactly like the real build', () => {
  const island = `import { defineIslandConfig } from '@openelement/router';
import { element, OpenElement, property } from '@openelement/element';

export const openElement = defineIslandConfig({ hydrate: 'idle', ssr: true, dsd: true });

@element('hello-counter')
export default class HelloCounter extends OpenElement {
  @property({ reflect: false, attribute: false })
  count = 0;

  render() {
    return <button type='button'>{this.count}</button>;
  }
}
`;
  expect(compileExample(example(island))).toEqual([]);
});

test('a fragment fence is not compile-run (the compiler boundary rejects it as a unit)', () => {
  const fragment = `const view = <div>{this.flag ? <b>a</b> : <i>b</i>}</div>;`;
  expect(compileExample(example(fragment))).toEqual([]);
});

test('the documented-rejection grammar reference is the explicit exclusion; nothing else is', () => {
  expect(isCompileExcluded('www/content/docs/guide/compiled-grammar.md')).toBe(true);
  expect(isCompileExcluded('www/content/docs/guide/compiled-grammar.zh.md')).toBe(true);
  for (const page of [
    'www/content/docs/guide/routing-and-data.md',
    'www/content/docs/guide/error-handling.md',
    'www/content/docs/guide/configuration.md',
    'www/content/docs/guide/i18n.md',
  ]) {
    expect(isCompileExcluded(page), `${page} must not be excluded`).toBe(false);
  }
});

test('compileExamples runs every fence it is given and aggregates the failures', () => {
  const failures = compileExamples([example(D4_BRANCH_TEXT), example(STATIC_BRANCH_TEXT)]);
  expect(failures.length).toBeGreaterThan(0);
  expect(failures.every((failure) => failure.message.includes('OEC9012'))).toBe(true);
});
