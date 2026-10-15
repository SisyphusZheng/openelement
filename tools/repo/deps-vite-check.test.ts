import { expect, test } from 'vitest';
import {
  checkBundlerImports,
  checkLockfileVite,
  checkManifests,
  VITE_DEV_PIN,
} from './deps-vite-check.ts';

test('vite gate accepts the unified Vite 8 baseline', () => {
  expect(
    checkManifests([
      { path: 'package.json', imports: { vite: 'npm:vite@8.0.16' } },
      {
        path: 'packages/router/package.json',
        imports: { vite: 'npm:vite@8.0.16' },
        peerDependencies: { vite: 'npm:vite@^8.0.0' },
      },
    ]),
  ).toEqual([]);
  expect(checkLockfileVite({ 'npm:vite@8.0.16': '8.0.16_x' })).toEqual([]);
  expect(
    checkBundlerImports([{ path: 'packages/router/src/vite/plugin.ts', text: "from 'vite'" }]),
  ).toEqual([]);
});

test('vite gate rejects legacy vite majors and transitional paths', () => {
  const violations = checkManifests([
    { path: 'tests/fixtures/legacy-example/package.json', imports: { vite: 'npm:vite@^7.1.4' } },
    {
      path: 'packages/legacy-x/package.json',
      imports: { 'rolldown-vite': 'npm:rolldown-vite@1.0.0' },
    },
    {
      path: 'packages/legacy-y/package.json',
      imports: { plugin: 'npm:@openelement/adapter-vite@1.0.0' },
    },
    {
      path: 'packages/legacy-z/package.json',
      imports: { terser: 'npm:@rollup/plugin-terser@1.0.0' },
    },
    { path: 'packages/legacy-p/package.json', peerDependencies: { vite: 'npm:vite@8.0.16' } },
  ]);
  expect(violations.length).toEqual(5);
});

test('vite gate rejects split lockfile instances and second bundlers', () => {
  expect(checkLockfileVite({ 'npm:vite@8.0.16': 'a', 'npm:vite@8.0.17': 'b' }).length).toEqual(1);
  expect(
    checkBundlerImports([{ path: 'tools/lib/x.ts', text: "import { build } from 'npm:esbuild';" }])
      .length,
  ).toEqual(1);
});

test('vite gate keeps a direct vite entry out of the starter template', () => {
  const tmpl = 'packages/create/templates/package.json.tmpl';
  // The generated project's vite tree comes from the Vite+ catalog and the
  // `vite@*` override in its workspace file, so ANY direct entry in the
  // template is a second source — including one matching the canonical dev
  // pin, and including the retired `${v.vite}` scaffold token.
  expect(
    checkManifests([{ path: tmpl, imports: { vite: `npm:vite@${VITE_DEV_PIN}` } }]).length,
  ).toEqual(1);
  expect(checkManifests([{ path: tmpl, imports: { vite: 'npm:vite@${v.vite}' } }]).length).toEqual(
    1,
  );
  expect(checkManifests([{ path: tmpl, imports: { vite: 'npm:vite@^8.0.0' } }]).length).toEqual(1);
  // The template as shipped (no vite key at all) passes.
  expect(checkManifests([{ path: tmpl, imports: { 'vite-plus': 'catalog:' } }])).toEqual([]);
});
