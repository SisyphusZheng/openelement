/**
 * Generated-entry module import quoting (alpha15 security lane S3).
 *
 * The generated entry embeds one `import * as $var from '<module path>'` per
 * route, renderer and middleware scope. Those paths derive from project
 * filenames, which the project controls: an apostrophe or backslash must be a
 * character INSIDE the emitted string, never a quote that ends the specifier
 * (which would inject code into the build/SSG entry the build then imports),
 * and a path the emitter cannot represent fails the build with a stable code
 * instead of being emitted as a broken specifier.
 */
import { expect, test } from 'vitest';
import ts from 'typescript';
import type { RouteEntry } from '@openelement/protocol/framework';
import { buildEntryDescriptor } from '../src/vite/internal/ssg/entry-descriptor.ts';
import { renderEntry } from '../src/vite/internal/ssg/entry-orchestrator.ts';

function entryFor(routes: RouteEntry[]): string {
  return renderEntry(buildEntryDescriptor(routes));
}

/** The generated entry must parse as a standalone module with no diagnostics. */
function parseDiagnostics(code: string): readonly unknown[] {
  const source = ts.createSourceFile('entry.mjs', code, ts.ScriptTarget.ESNext, true);
  return (source as unknown as { parseDiagnostics: readonly unknown[] }).parseDiagnostics;
}

test('a route filename containing an apostrophe is emitted as one quoted specifier', () => {
  const code = entryFor([
    { path: '/', filePath: `it's-a-route.ts`, type: 'page', varName: 'pageIndex' },
  ]);
  expect(parseDiagnostics(code)).toEqual([]);
  expect(code).toContain(`from "/app/routes/it's-a-route.ts"`);
});

test('a route filename containing a backslash is escaped, never interpreted', () => {
  const code = entryFor([
    { path: '/', filePath: 'back\\slash.ts', type: 'page', varName: 'pageIndex' },
  ]);
  expect(parseDiagnostics(code)).toEqual([]);
  // JSON.stringify escapes the backslash: the specifier text carries two
  // characters `\\` and resolves to the one-backslash filename.
  expect(code).toContain('from "/app/routes/back\\\\slash.ts"');
});

test('a route filename that looks like code cannot terminate the specifier', () => {
  const code = entryFor([
    {
      path: '/',
      filePath: `quote';globalThis.__pwned=1;//.ts`,
      type: 'page',
      varName: 'pageIndex',
    },
  ]);
  expect(parseDiagnostics(code)).toEqual([]);
  expect(code).toContain(`from "/app/routes/quote';globalThis.__pwned=1;//.ts"`);
  // The payload is inside the literal; no statement follows the import.
  expect(code).not.toContain("from '/app/routes/quote'");
});

test('renderer and middleware module paths use the same quoted emission', () => {
  const descriptor = buildEntryDescriptor([
    { path: '/', filePath: 'index.ts', type: 'page', varName: 'pageIndex' },
  ]);
  descriptor.renderers.push({
    varName: '__renderer_0',
    scope: '/',
    importPath: `/app/renderers/it's-renderer.ts`,
    depth: 1,
  });
  descriptor.middlewareScopes.push({
    varName: '__middleware_scope_0',
    scope: '/',
    importPath: `/app/middleware/it's-middleware.ts`,
  });
  const code = renderEntry(descriptor);
  expect(parseDiagnostics(code)).toEqual([]);
  expect(code).toContain(`from "/app/renderers/it's-renderer.ts"`);
  expect(code).toContain(`from "/app/middleware/it's-middleware.ts"`);
});

test('a module import path that cannot be emitted fails the build with a stable code', () => {
  const descriptor = buildEntryDescriptor([
    { path: '/', filePath: 'index.ts', type: 'page', varName: 'pageIndex' },
  ]);
  descriptor.pageRoutes[0]!.importPath = '/app/routes/bad\u0000name.ts';
  let caught: unknown;
  try {
    renderEntry(descriptor);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect((caught as { code?: string }).code).toEqual('OE_DESCRIPTOR_MODULE_IMPORT');
  expect(String((caught as Error).message)).toContain('cannot be emitted');
});
