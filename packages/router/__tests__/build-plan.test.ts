import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { expect, test } from 'vitest';
import { join } from 'node:path';
import { OpenElementBuildContext } from '../src/vite/build-context.ts';
import {
  BuildEvidenceErrorCode,
  collectBuildArtifacts,
  createProductionBuildPlan,
  writeBuildEvidence,
} from '../src/vite/build-plan.ts';

test('production BuildPlan reuses Phase 1 discoveries and collects emitted artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'oe-build-plan-'));
  try {
    const ctx = new OpenElementBuildContext({});
    ctx.phase3.root = root;
    ctx.phase3.outDir = 'dist';
    ctx.phase3.islandsDir = 'app/islands';
    ctx.phase1.cachedRoutes = [
      {
        path: '/',
        filePath: 'app/routes/index.tsx',
        type: 'page',
        varName: 'Page0',
        tagName: 'home-page',
      },
    ];
    ctx.phase1.islandTagNames = ['counter-island'];
    ctx.phase1.islandFiles = ['counter.ts'];
    ctx.phase1.islandMeta = { 'counter-island': { hydrate: 'idle', ssr: true } };

    const plan = createProductionBuildPlan(ctx);
    await mkdir(join(root, 'dist', 'client'), { recursive: true });
    await writeFile(join(root, 'dist', 'index.html'), '<html>ok</html>');
    await writeFile(join(root, 'dist', 'client', 'entry.js'), 'export {};');

    const result = collectBuildArtifacts(plan);
    expect(result.success).toEqual(true);
    expect(result.manifest.routes[0].kind).toEqual('page');
    expect(result.manifest.routes[0].path).toEqual('/');
    expect(result.manifest.islands[0].tagName).toEqual('counter-island');
    expect(result.pages.length).toEqual(1);
    expect(result.clientAssets[0].sizeBytes > 0).toEqual(true);
  } finally {
    await rm(root, { recursive: true });
  }
});

test('production BuildPlan returns typed failure evidence for a missing output', () => {
  const ctx = new OpenElementBuildContext({});
  ctx.phase3.root = '/definitely/missing/openelement-build';
  const result = collectBuildArtifacts(createProductionBuildPlan(ctx));
  expect(result.success).toEqual(false);
  expect(result.errors.length).toEqual(1);
  // Node's ENOENT wording appends the failing syscall and path; match the
  // stable core case-insensitively.
  expect(result.errors[0]).toMatch(/no such file or directory/i);
  expect(result.errors[0]).toContain('/definitely/missing/openelement-build/dist');
});

test('request-time evidence is carried from the emitted server manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'oe-build-plan-request-time-'));
  try {
    const ctx = new OpenElementBuildContext({});
    ctx.phase3.root = root;
    ctx.phase3.outDir = 'dist';
    const plan = createProductionBuildPlan(ctx);
    await mkdir(join(root, 'dist', 'server'), { recursive: true });
    await writeFile(join(root, 'dist', 'index.html'), '<html>ok</html>');
    await writeFile(
      join(root, 'dist', 'server', 'server-manifest.json'),
      JSON.stringify({ requestTimeRoutes: [{ path: '/live' }, { path: 42 }] }),
    );

    const result = collectBuildArtifacts(plan);
    expect(result.success).toEqual(true);
    // The documented route paths are carried; a non-string path is dropped
    // from the evidence rather than failing the build.
    expect(result.manifest.requestTimeRoutes).toEqual(['/live']);
  } finally {
    await rm(root, { recursive: true });
  }
});

test('a malformed server manifest fails the build with its code, never a silent drop', async () => {
  // Negative proof for the build-plan fail-open: an existing-but-unparseable
  // server manifest used to return {} from a bare `catch {}`, so the build
  // reported success with evidence indistinguishable from a pure-static one.
  const root = await mkdtemp(join(tmpdir(), 'oe-build-plan-request-time-bad-'));
  try {
    const ctx = new OpenElementBuildContext({});
    ctx.phase3.root = root;
    ctx.phase3.outDir = 'dist';
    const plan = createProductionBuildPlan(ctx);
    await mkdir(join(root, 'dist', 'server'), { recursive: true });
    await writeFile(join(root, 'dist', 'index.html'), '<html>ok</html>');
    const manifestPath = join(root, 'dist', 'server', 'server-manifest.json');
    await writeFile(manifestPath, '{ not json');

    const result = collectBuildArtifacts(plan);
    expect(result.success).toEqual(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain(BuildEvidenceErrorCode.REQUEST_TIME_MANIFEST_UNREADABLE);
    expect(result.errors[0]).toContain(manifestPath);
  } finally {
    await rm(root, { recursive: true });
  }
});

test('a non-array requestTimeRoutes field fails the build with its code', async () => {
  const root = await mkdtemp(join(tmpdir(), 'oe-build-plan-request-time-shape-'));
  try {
    const ctx = new OpenElementBuildContext({});
    ctx.phase3.root = root;
    ctx.phase3.outDir = 'dist';
    const plan = createProductionBuildPlan(ctx);
    await mkdir(join(root, 'dist', 'server'), { recursive: true });
    await writeFile(join(root, 'dist', 'index.html'), '<html>ok</html>');
    await writeFile(
      join(root, 'dist', 'server', 'server-manifest.json'),
      JSON.stringify({ requestTimeRoutes: '/live' }),
    );

    const result = collectBuildArtifacts(plan);
    expect(result.success).toEqual(false);
    expect(result.errors[0]).toContain(BuildEvidenceErrorCode.REQUEST_TIME_MANIFEST_UNREADABLE);
  } finally {
    await rm(root, { recursive: true });
  }
});

test('writeBuildEvidence writes the build artifacts manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'oe-build-plan-evidence-'));
  try {
    const ctx = new OpenElementBuildContext({});
    ctx.phase3.root = root;
    ctx.phase3.outDir = 'dist';
    ctx.phase1.cachedRoutes = [
      {
        path: '/',
        filePath: 'app/routes/index.tsx',
        type: 'page',
        varName: 'Page0',
        tagName: 'home-page',
      },
    ];
    const plan = createProductionBuildPlan(ctx);
    await mkdir(join(root, 'dist'), { recursive: true });
    await writeFile(join(root, 'dist', 'index.html'), '<html>ok</html>');

    const result = collectBuildArtifacts(plan);
    expect(result.success).toEqual(true);
    await mkdir(join(root, '.openElement'), { recursive: true });
    writeBuildEvidence(plan, result);
    const evidence = JSON.parse(
      await readFile(join(root, '.openElement', 'build-artifacts.json'), 'utf8'),
    );
    expect(evidence.success).toEqual(true);
    expect(evidence.pages.length).toEqual(1);
    expect(evidence.manifest.routes[0].kind).toEqual('page');
  } finally {
    await rm(root, { recursive: true });
  }
});

test('writeBuildEvidence creates the evidence dir on a clean tree (#741)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'oe-build-plan-evidence-clean-'));
  try {
    const ctx = new OpenElementBuildContext({});
    ctx.phase3.root = root;
    ctx.phase3.outDir = 'dist';
    ctx.phase1.cachedRoutes = [
      {
        path: '/',
        filePath: 'app/routes/index.tsx',
        type: 'page',
        varName: 'Page0',
        tagName: 'home-page',
      },
    ];
    const plan = createProductionBuildPlan(ctx);
    await mkdir(join(root, 'dist'), { recursive: true });
    await writeFile(join(root, 'dist', 'index.html'), '<html>ok</html>');

    const result = collectBuildArtifacts(plan);
    expect(result.success).toEqual(true);
    // Deliberately no .openElement mkdir: CI clean checkouts hit this path.
    writeBuildEvidence(plan, result);
    const evidence = JSON.parse(
      await readFile(join(root, '.openElement', 'build-artifacts.json'), 'utf8'),
    );
    expect(evidence.success).toEqual(true);
  } finally {
    await rm(root, { recursive: true });
  }
});

test('build-plan defaults the output root to the current working directory', async () => {
  // The output root defaults to the process working directory (build-plan.ts
  // reads process.cwd() when the plan carries no root), so the test chdirs
  // into a fresh temp dir to pin the default.
  const originalCwd = process.cwd();
  const root = await mkdtemp(join(tmpdir(), 'oe-build-plan-cwd-'));
  try {
    process.chdir(root);
    const ctx = new OpenElementBuildContext({});
    ctx.phase3.outDir = 'dist';
    const plan = createProductionBuildPlan(ctx);
    await mkdir(join(root, 'dist'), { recursive: true });
    await writeFile(join(root, 'dist', 'index.html'), '<html>ok</html>');

    const artifacts = collectBuildArtifacts(plan);
    expect(artifacts.success).toEqual(true);
    await mkdir(join(root, '.openElement'), { recursive: true });
    writeBuildEvidence(plan, artifacts);
    const evidence = await readFile(join(root, '.openElement', 'build-artifacts.json'), 'utf8');
    expect(evidence).toContain('"success": true');
  } finally {
    process.chdir(originalCwd);
    await rm(root, { recursive: true });
  }
});
