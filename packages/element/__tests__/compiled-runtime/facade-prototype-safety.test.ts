/**
 * @openelement/element — the facade host records are prototype-safe.
 *
 * Compiled property and handler names are metadata, and the facade builds its
 * per-instance host records from them. A plain `{}` turns a name like
 * `__proto__` into a prototype assignment instead of an entry, so the records
 * the compiled contract hands to the runtime are null-prototype by
 * construction: every compiled name is an own entry, and no name can replace
 * the prototype.
 */
import { expect, test } from 'vitest';
import type { CompiledPropertyMetadata } from '@openelement/protocol/part-program';
import {
  bindProgramHandlers,
  createFacadePropertyState,
  type FacadeElementLike,
} from '../../src/internal/compiled/facade-host.ts';
import { testProgram } from './test-program.ts';

function facadeElement(): FacadeElementLike {
  return {
    hasAttribute: () => false,
    getAttribute: () => null,
    setAttribute: () => {},
    removeAttribute: () => {},
  };
}

function propertyRecord(name: string, fallback: string): CompiledPropertyMetadata {
  return {
    name,
    attribute: name,
    type: 'string',
    converter: 'string',
    reflect: false,
    default: fallback,
  };
}

test('a compiled property named __proto__ is an own signal, not the prototype', () => {
  const state = createFacadePropertyState(facadeElement(), [
    propertyRecord('__proto__', 'fallback'),
    propertyRecord('label', 'ready'),
  ]);

  expect(Object.getPrototypeOf(state.signals), 'the host record carries no prototype').toBeNull();
  expect(Object.prototype.hasOwnProperty.call(state.signals, '__proto__')).toBe(true);
  expect(state.signals['__proto__']?.value).toBe('fallback');
  expect(state.signals['label']?.value, 'sibling properties still seed normally').toBe('ready');
});

test('a compiled handler named __proto__ is an own bound handler, not the prototype', () => {
  const program = testProgram({
    tag: 'oe-proto-handler',
    template: [{ k: 'el', tag: 'button', attrs: [], children: [] }],
    parts: [
      {
        k: 'event',
        index: 0,
        event: 'click',
        handler: '__proto__',
        action: { kind: 'method', name: '__proto__' },
        path: [0],
      },
    ],
  });
  const element = Object.create(null) as { __proto__: (event: unknown) => void };
  const calls: unknown[] = [];
  Object.defineProperty(element, '__proto__', {
    configurable: true,
    enumerable: true,
    writable: true,
    value(this: unknown, event: unknown) {
      calls.push([this, event]);
    },
  });

  const handlers = bindProgramHandlers(element, class {}, program);

  expect(Object.getPrototypeOf(handlers), 'the handler record carries no prototype').toBeNull();
  expect(Object.prototype.hasOwnProperty.call(handlers, '__proto__')).toBe(true);
  handlers['__proto__']({ type: 'click' });
  expect(calls, 'the bound handler runs with the instance as its receiver').toEqual([
    [element, { type: 'click' }],
  ]);
});
