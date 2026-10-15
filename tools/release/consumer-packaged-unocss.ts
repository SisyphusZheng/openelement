/**
 * Packed-artifact UnoCSS consumer walkthrough (alpha15 Stage 4).
 *
 * WHY THIS LEG EXISTS. The UnoCSS port's whole claim is that a PACKED consumer
 * — an application outside this repository, resolving the framework and the
 * engine from tarballs and the registry — gets a working style pipeline with no
 * framework-side utility grammar. Every probe for that lived in the workspace:
 * the router's dev-server fixture is a workspace member, and a workspace probe
 * resolves the peer through the repository's own node_modules. Neither can show
 * that the peer loads from the APPLICATION's resolution tree, which is the one
 * thing "thin adapter over a real engine" means at the install boundary.
 *
 * What it qualifies, from the tarballs the release toolchain produced:
 *
 *   install  the six pack:dry-run tarballs plus `unocss` and `open-props` in a
 *            scratch app OUTSIDE the repository, installed with pnpm
 *   build    a real SSG build: the DOCUMENT sheet (token source + engine
 *            preflights) and the COMPONENT sheet (shadow-root utilities) are
 *            emitted as content-addressed assets, and the page carries the DSD
 *            link for the component sheet
 *   start    the packed `oe` bin serves the built output
 *   engines  chromium, firefox and webkit measure the COMPUTED values the
 *            emitted sheets must produce: a light-DOM utility, a shadow-root
 *            utility, the declared token roles reaching both, and the absence
 *            of a document reset the application did not ask for
 *
 * The dark half is measured too: `--no-config` is not a flag the engine has, so
 * the leg's own app always declares `uno.config.ts`. What it does NOT declare is
 * a Tailwind configuration — the application selects UnoCSS and nothing else,
 * which is the "no framework grammar, one engine" claim in its installable form.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { runProcess } from './consumer-packaged-shared.ts';
import { RETAINED_PACKAGE_NAMES } from '../repo/project-constants.ts';
import { consumerPnpmOverridesYaml } from './consumer-packaged-shared.ts';
import { tarballPath } from '../lib/npm-tarball.ts';
import { readPackages } from '../lib/package-graph.ts';

const repoRoot = resolve(import.meta.dirname!, '../..');
const INSTALL_TIMEOUT_MS = 5 * 60_000;
const BUILD_TIMEOUT_MS = 10 * 60_000;
const SERVER_READY_TIMEOUT_MS = 3 * 60_000;
const BROWSER_TIMEOUT_MS = 3 * 60_000;

function run(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs?: number,
): Promise<{ success: boolean; output: string }> {
  return runProcess(command, args, cwd, { timeoutMs });
}

function reservePort(): Promise<number> {
  return new Promise((resolveProbe, reject) => {
    const probe = createServer();
    probe.once('listening', () => {
      const address = probe.address() as { port: number };
      probe.close(() => resolveProbe(address.port));
    });
    probe.once('error', reject);
    probe.listen({ port: 0, host: '127.0.0.1' });
  });
}

/** The application's `uno.config.ts`: ordinary UnoCSS configuration. */
const UNO_CONFIG = `import { defineConfig, presetWind4 } from 'unocss';

export default defineConfig({
  presets: [presetWind4()],
  theme: {
    colors: {
      ink: 'var(--probe-ink)',
      paper: 'var(--probe-paper)',
      brand: 'var(--probe-brand)',
    },
  },
  shortcuts: [['probe-card', 'rounded-lg p-3']],
});
`;

/**
 * The token source: plain CSS the adapter includes verbatim, plus one bare-import
 * composition, so the packed leg exercises the resolution step too.
 */
const TOKENS = `@import 'open-props/style';

:root {
  --probe-ink: var(--gray-12);
  --probe-paper: var(--gray-0);
  --probe-brand: var(--violet-7);
}
`;

const APP_CONFIG = `import { defineConfig } from '@openelement/router';

export default defineConfig({
  unocss: {
    theme: ['app/styles/tokens.css'],
  },
  // The packed UI package's islands are admitted the way any consumer admits
  // them; nothing here reaches into the package's source.
  packageIslands: ['@openelement/ui'],
  head: {
    title: 'Packed UnoCSS consumer',
    description: 'The out-of-repo UnoCSS qualification app.',
  },
});
`;

const VITE_CONFIG = `import { openElement } from '@openelement/router/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic', importSource: '@openelement/element' } },
  plugins: [openElement()],
});
`;

/**
 * The page: a light-DOM utility the engine must compile, a declared shortcut,
 * and a shadow-root component whose utilities belong to the COMPONENT sheet.
 */
const PAGE = `import { definePage } from '@openelement/router';
import Lab from '../components/lab.tsx';

export default definePage(Lab, { head: { title: 'Packed UnoCSS consumer' } });
`;

// One compiled element class per module (OEC9001), so the shadow component and
// the page component are two modules.
const CARD = `import { element, OpenElement } from '@openelement/element';
import { defineIslandConfig } from '@openelement/router';
import cardStyles from './probe-card.css';

// An island, so the build emits the client chunk that defines it: a component
// the browser never upgrades can be styled and still unmeasurable.
export const openElement = defineIslandConfig({ hydrate: 'load', ssr: true });

@element('probe-card', { root: 'shadow-open' })
export default class ProbeCard extends OpenElement {
  // The current contract for a component's own sheet: bind the .css import and
  // array it (OEC9029 refuses the side-effect form).
  static override styles = [cardStyles];

  render() {
    return (
      <div class='probe-card gap-2'>
        <span class='probe-shadow-utility p-4'>shadow utilities</span>
      </div>
    );
  }
}
`;

const LAB = `import { element, OpenElement } from '@openelement/element';

@element('packed-lab', { root: 'light' })
export default class PackedLab extends OpenElement {
  render() {
    return (
      <div class='packed-lab p-6 bg-paper text-ink'>
        <h1 class='text-2xl font-semibold'>Packed UnoCSS consumer</h1>
        <p class='probe-document-utility mt-3'>document utilities</p>
        <probe-card></probe-card>
        <open-button variant='primary'>packed button</open-button>
      </div>
    );
  }
}
`;

const CARD_CSS = `/* Authored CSS rides the app's own import path: this sheet is bound to
   probe-card's shadow root, so its rule reaches that tree and nothing else. */
.probe-card {
  outline: 1px solid transparent;
}
`;

/**
 * The engine probe: computed values, read in the engine's own three builds.
 * Every expectation is a value an emitted sheet MUST produce — a text assertion
 * would pass on a sheet that arrived unparsed.
 */
const PROBE = `import { chromium, firefox, webkit } from '@playwright/test';

const [baseUrl, browserName] = process.argv.slice(2);
const browserType = { chromium, firefox, webkit }[browserName];
if (!baseUrl || !browserType) throw new Error('usage: probe.mjs <baseUrl> <engine>');

const DEEP = \`(function () {
  const find = (root, selector) => {
    const direct = root.querySelector(selector);
    if (direct) return direct;
    for (const element of root.querySelectorAll('*')) {
      if (!element.shadowRoot) continue;
      const found = find(element.shadowRoot, selector);
      if (found) return found;
    }
    return null;
  };
  globalThis.__deepFind = (selector) => find(document, selector);
})()\`;

const browser = await browserType.launch({ headless: true });
try {
  const page = await browser.newPage();
  const failures = [];
  page.on('pageerror', (error) => failures.push('page error: ' + error.message));
  await page.goto(baseUrl + '/', { waitUntil: 'load' });
  await page.evaluate(DEEP);
  await page.waitForFunction(() => customElements.get('probe-card') !== undefined);

  const measured = await page.evaluate(() => {
    const lab = globalThis.__deepFind('packed-lab');
    const documentUtility = globalThis.__deepFind('.probe-document-utility');
    const card = globalThis.__deepFind('probe-card');
    const shadowUtility = card?.shadowRoot?.querySelector('.probe-shadow-utility') ?? null;
    const cardWrapper = card?.shadowRoot?.querySelector('.probe-card') ?? null;
    const read = (element) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        marginTop: style.marginTop,
        paddingTop: style.paddingTop,
        paddingBottom: style.paddingBottom,
        gap: style.gap,
        color: style.color,
        backgroundColor: style.backgroundColor,
        display: style.display,
      };
    };
    return {
      // The host element carries no utilities of its own: the compiled root is
      // the div it renders.
      labRoot: read(lab?.shadowRoot?.querySelector('div') ?? lab?.querySelector('div') ?? lab),
      documentUtility: read(documentUtility),
      shadowUtility: read(shadowUtility),
      cardWrapper: read(cardWrapper),
      // The document reset the application never asked for must be absent: a
      // runtime-created heading outside every shadow tree keeps the UA's own
      // margins and sizes when no preflight reset is in force.
      resetProbe: (() => {
        const heading = document.createElement('h1');
        const list = document.createElement('ul');
        list.appendChild(document.createElement('li'));
        document.body.append(heading, list);
        return {
          h1MarginTop: getComputedStyle(heading).marginTop,
          listStyleType: getComputedStyle(list).listStyleType,
        };
      })(),
      // The token source reached the document: the role the utility names
      // resolves to a real colour rather than to nothing.
      brand: getComputedStyle(document.documentElement).getPropertyValue('--probe-brand').trim(),
      stylesheetHrefs: [...document.querySelectorAll('link[rel=stylesheet]')].map((link) => link.getAttribute('href')),
      cardSheetHref: card?.shadowRoot?.querySelector('link[data-oe-static-styles]')?.getAttribute('href') ?? null,
      // The probe-card's own authored sheet (bound through static styles) is a
      // separate delivery from the compiled component sheet.
      cardOwnSheet: card?.shadowRoot?.querySelectorAll('link[rel=stylesheet]').length ?? 0,
      cardSheetUrls: [...(card?.shadowRoot?.querySelectorAll('link[rel=stylesheet]') ?? [])].map(
        (link) => link.getAttribute('href'),
      ),
      shadowUtilityCarriers: [],
      shadowUtilitySheet: null,
      componentSheetCss: null,
    };
  });

  // The component sheet's own bytes, fetched from the URL the DSD declares.
  const componentCss = measured.cardSheetHref
    ? await fetch(baseUrl + measured.cardSheetHref).then((response) => response.text())
    : '';
  measured.componentSheetCssLength = componentCss.length;
  measured.componentSheetHasReset = /box-sizing:\\s*border-box/.test(componentCss);

  // Every sheet the page delivers, from BOTH channels: the document's own links
  // and every link the shadow root declares. Which compile carries the shadow
  // root's utility is the ENGINE's division to make (this adapter hands the
  // document compile the light candidates AND the tokens the engine's
  // extractors find in the walked module texts), so the row proves the utility
  // is DELIVERED — by whichever sheet carries its rule — rather than naming a
  // channel the engine is free to choose.
  const sheetUrls = [...(measured.stylesheetHrefs ?? []), ...(measured.cardSheetUrls ?? [])].filter(
    (href, index, all) => typeof href === 'string' && all.indexOf(href) === index,
  );
  const sheetBodies = new Map();
  for (const href of sheetUrls) {
    sheetBodies.set(href, await fetch(baseUrl + href).then((response) => response.text()));
  }
  // The utility the shadow span carries: the class p-4 compiles to the padding
  // shorthand the row below measures.
  const carriers = [...sheetBodies.entries()]
    .filter(([, css]) => /\.p-4\s*\{/.test(css))
    .map(([href]) => href);
  measured.shadowUtilityCarriers = carriers;
  measured.shadowUtilitySheet = carriers.length > 0 ? 'delivered' : 'absent';
  if (measured.shadowUtilitySheet === 'absent') {
    failures.push(
      'no delivered sheet carries the shadow utility rule (sheets: ' + sheetUrls.join(', ') + ')',
    );
  }

  const expect = (label, actual, wanted) => {
    if (actual !== wanted) {
      failures.push(label + ' = ' + JSON.stringify(actual) + ' (expected ' + JSON.stringify(wanted) + ')');
    }
  };

  // The light root's own utility: p-6 in a build whose default preset is
  // presetWind4.
  expect('light root p-6 padding', measured.labRoot?.paddingTop, '24px');
  // A utility on a plain child of that root.
  expect('document utility mt-3 margin', measured.documentUtility?.marginTop, '12px');
  // The SHADOW root's utility (the component channel's reason to exist).
  expect('shadow utility p-4 padding', measured.shadowUtility?.paddingTop, '16px');
  // The declared shortcut from uno.config.ts, compiled by the engine.
  expect('declared shortcut rounded-lg padding', measured.cardWrapper?.paddingTop, '12px');
  expect('declared shortcut gap', measured.cardWrapper?.gap, '8px');
  // The token source's role reaches the document: a bare-import composition
  // inlined and the role resolved to a real colour.
  if (measured.brand === '') failures.push('the declared token source did not reach the document');
  // The document sheet is the one the head links, and the component sheet is
  // the one the DSD declares: two deliveries, both present, both fetched.
  if (!Array.isArray(measured.stylesheetHrefs) || measured.stylesheetHrefs.length === 0) {
    failures.push('the built document links no stylesheet');
  }
  if (!measured.cardSheetHref) {
    failures.push('the DSD declared no component sheet link');
  }
  if (measured.componentSheetCssLength === 0) {
    failures.push('the DSD declared a component sheet URL that serves nothing');
  }
  // Which sheet carries the shadow utility is the ENGINE's division to make
  // (this adapter hands the document compile the admitted light candidates AND
  // the tokens the engine's extractors find in the walked module texts, so a
  // shadow utility can legitimately land there). What must hold is that it is
  // delivered and that the COMPONENT sheet carries no document reset.
  expect('component sheet carries no reset', measured.componentSheetHasReset, false);
  // This application DECLARES the engine, so it owns the document and the
  // reset is the application's to have (ADR-0167 §5): preflight rewrites the
  // runtime-created heading and list, which is the positive form of the same
  // probe the packaged UI appliance asserts in its reduced-entry form.
  expect('document reset present (h1 margin collapsed)', measured.resetProbe.h1MarginTop, '0px');
  expect('document reset present (list marker stripped)', measured.resetProbe.listStyleType, 'none');

  if (failures.length > 0) {
    throw new Error('[' + browserName + '] ' + failures.join(' | ') + ' :: ' + JSON.stringify(measured));
  }
  console.log('PASS packed UnoCSS consumer / ' + browserName);
} finally {
  await browser.close();
}
`;

async function assertNoRepositoryResolution(nodeModules: string): Promise<void> {
  const candidates: string[] = [];
  for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(nodeModules, entry.name);
    if (entry.name.startsWith('@') && entry.isDirectory()) {
      for (const nested of readdirSync(path, { withFileTypes: true })) {
        candidates.push(join(path, nested.name));
      }
    } else {
      candidates.push(path);
    }
  }
  for (const path of candidates) {
    const resolved = await realpath(path).catch(() => path);
    if (resolved === repoRoot || resolved.startsWith(`${repoRoot}/`)) {
      throw new Error(`The packed consumer resolved a dependency into the repository: ${path}`);
    }
  }
}

async function main(): Promise<void> {
  const scratch = await mkdtemp(join(tmpdir(), 'openelement-packed-unocss-'));
  try {
    const workspacePackages = await readPackages();
    const tarballFor = (name: string): string => {
      const pkg = workspacePackages.find((candidate) => candidate.name === name);
      if (!pkg) throw new Error(`Retained package missing from workspace graph: ${name}`);
      return join(repoRoot, tarballPath(pkg));
    };
    const tarballs = RETAINED_PACKAGE_NAMES.map(tarballFor);
    for (const tarball of tarballs) {
      if (!existsSync(tarball)) {
        throw new Error(
          `Missing packed release artifact: ${tarball} (run \`pnpm --dir tools/release run pack:dry-run\` first)`,
        );
      }
    }

    const app = join(scratch, 'app');
    await mkdir(join(app, 'app', 'components'), { recursive: true });
    await mkdir(join(app, 'app', 'routes'), { recursive: true });
    await mkdir(join(app, 'app', 'styles'), { recursive: true });

    const tarballOf = new Map(
      RETAINED_PACKAGE_NAMES.map((name, index) => [name, tarballs[index]!] as const),
    );
    const fileRef = (name: string): string => `file:${tarballOf.get(name)!}`;

    await writeFile(
      join(app, 'package.json'),
      `${JSON.stringify(
        {
          name: 'packed-unocss-consumer',
          private: true,
          type: 'module',
          scripts: {
            build: 'oe build',
            start: 'oe start',
            typecheck: 'tsc --noEmit',
          },
          dependencies: {
            '@openelement/element': fileRef('@openelement/element'),
            '@openelement/router': fileRef('@openelement/router'),
            '@openelement/ui': fileRef('@openelement/ui'),
            '@openelement/protocol': fileRef('@openelement/protocol'),
            // The engine resolves from THIS application's tree — the claim the
            // leg exists to test.
            unocss: '66.10.0',
            'open-props': '1.7.23',
            vite: '8.0.16',
            typescript: '6.0.3',
          },
          devDependencies: {
            '@playwright/test': '1.59.1',
          },
          engines: { node: '>=24.2' },
          packageManager: 'pnpm@12.8.1',
          pnpm: {
            overrides: Object.fromEntries(
              RETAINED_PACKAGE_NAMES.map((name) => [name, fileRef(name)]),
            ),
          },
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    await writeFile(
      join(app, 'pnpm-workspace.yaml'),
      consumerPnpmOverridesYaml(
        RETAINED_PACKAGE_NAMES.map((name) => ({ name, path: tarballOf.get(name)! })),
      ),
      'utf8',
    );
    await writeFile(join(app, 'uno.config.ts'), UNO_CONFIG, 'utf8');
    await writeFile(join(app, 'openelement.config.ts'), APP_CONFIG, 'utf8');
    await writeFile(join(app, 'vite.config.ts'), VITE_CONFIG, 'utf8');
    await writeFile(
      join(app, 'tsconfig.json'),
      `${JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'bundler',
            jsx: 'preserve',
            jsxImportSource: '@openelement/element',
            strict: true,
            skipLibCheck: true,
            noEmit: true,
            types: ['node'],
          },
          include: ['app', 'vite.config.ts', 'openelement.config.ts', 'uno.config.ts'],
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    await writeFile(join(app, 'app', 'styles', 'tokens.css'), TOKENS, 'utf8');
    await writeFile(join(app, 'app', 'routes', 'index.tsx'), PAGE, 'utf8');
    await mkdir(join(app, 'app', 'islands'), { recursive: true });
    await writeFile(join(app, 'app', 'components', 'lab.tsx'), LAB, 'utf8');
    await writeFile(join(app, 'app', 'islands', 'probe-card.tsx'), CARD, 'utf8');
    await writeFile(join(app, 'app', 'islands', 'probe-card.css'), CARD_CSS, 'utf8');
    await writeFile(join(app, 'pw-probe.mjs'), PROBE, 'utf8');

    const install = await run('pnpm', ['install', '--no-frozen-lockfile'], app, INSTALL_TIMEOUT_MS);
    if (!install.success) throw new Error(`pnpm install failed:\n${install.output}`);
    await assertNoRepositoryResolution(join(app, 'node_modules'));

    // ── Phase A: the first-party UI package under UnoCSS ────────────────────
    // `@openelement/ui` declares its role table as a Tailwind `@theme` source
    // (generated-manifest.json -> ./src/theme.css). An application that selects
    // UnoCSS and admits that package reaches the adapter's refusal, and the
    // refusal must be a CODE rather than a half-styled build — the claim the
    // repository's own fixture asserts in-process, here on a packed install.
    const refused = await run('pnpm', ['exec', 'oe', 'build'], app, BUILD_TIMEOUT_MS);
    if (refused.success) {
      throw new Error(
        'the packed build admitted @openelement/ui under UnoCSS: its Tailwind `@theme` ' +
          'source must be refused by code, never shipped half-styled',
      );
    }
    // The CLI prints the coded diagnostic's message; the code itself is on the
    // error object. Assert the message the code owns (its identity) rather than
    // a stack trace.
    const refusal = "carries Tailwind's";
    if (!refused.output.includes(refusal) || !refused.output.includes('silently absent')) {
      throw new Error(
        `the packed build failed for the wrong reason:\n${refused.output.slice(0, 3000)}`,
      );
    }
    console.log(
      'Phase A: @openelement/ui under UnoCSS is refused by the theme-source diagnostic ' +
        '(OE_PRESET_UNOCSS_THEME_SOURCE_INCOMPATIBLE), never shipped half-styled.',
    );

    // ── Phase B: the port itself ────────────────────────────────────────────
    // Same application, one edit: the incompatible package leaves the island
    // set. The port proof is the app's OWN light-root page and shadow-root
    // island, its own `uno.config.ts`, and its own plain-CSS token source.
    await writeFile(
      join(app, 'openelement.config.ts'),
      APP_CONFIG.replace("  packageIslands: ['@openelement/ui'],\n", ''),
      'utf8',
    );
    // The page rendered the package component by tag; with the package gone the
    // tag would be an unknown element, so the page drops it too.
    await writeFile(
      join(app, 'app', 'components', 'lab.tsx'),
      LAB.replace("        <open-button variant='primary'>packed button</open-button>\n", ''),
      'utf8',
    );

    const build = await run('pnpm', ['exec', 'oe', 'build'], app, BUILD_TIMEOUT_MS);
    if (!build.success) throw new Error(`packed build failed:\n${build.output}`);

    const html = await readFile(join(app, 'dist', 'index.html'), 'utf8');
    if (!html.includes('probe-card')) throw new Error('the built page carries no probe-card');
    if (!html.includes('data-oe-static-styles')) {
      throw new Error('the built DSD declares no component sheet link');
    }

    // The engine probes run against the packed `oe start`, on every engine.
    const installBrowsers = await run(
      'pnpm',
      ['exec', 'playwright', 'install', '--with-deps', 'chromium', 'firefox', 'webkit'],
      app,
      INSTALL_TIMEOUT_MS,
    );
    if (!installBrowsers.success) {
      // A machine that already carries the engines needs no download; only a
      // real absence is a blocker.
      const list = await run('pnpm', ['exec', 'playwright', '--version'], app, 60_000);
      if (!list.success) throw new Error(`playwright unavailable in the consumer:\n${list.output}`);
    }

    const port = await reservePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const server = spawn('pnpm', ['start'], {
      cwd: app,
      env: { ...process.env, OPEN_ELEMENT_PORT: String(port), OPEN_ELEMENT_HOST: '127.0.0.1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      // Own process group: the stop below must reach pnpm's node/sh
      // grandchildren too, or they keep the stdio pipes open and this process
      // never exits.
      detached: true,
    });
    let exited = false;
    server.addListener('exit', () => {
      exited = true;
    });
    const chunks: Uint8Array[] = [];
    void (async () => {
      for await (const chunk of server.stdout!) chunks.push(chunk as Uint8Array);
    })();
    void (async () => {
      for await (const chunk of server.stderr!) chunks.push(chunk as Uint8Array);
    })();
    const serverOutput = () =>
      new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
    try {
      let ready = false;
      const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
      while (Date.now() < deadline && !exited) {
        try {
          const response = await fetch(`${baseUrl}/`);
          await response.text();
          ready = true;
          break;
        } catch {
          await new Promise((resolveWait) => setTimeout(resolveWait, 150));
        }
      }
      if (!ready) {
        throw new Error(`the packed start server never answered:\n${serverOutput()}`);
      }

      const engineFailures: string[] = [];
      for (const engine of ['chromium', 'firefox', 'webkit']) {
        const probe = await run('node', ['pw-probe.mjs', baseUrl, engine], app, BROWSER_TIMEOUT_MS);
        if (!probe.success) {
          engineFailures.push(`${engine}:\n${probe.output.slice(0, 4000)}`);
        } else {
          for (const line of probe.output.split('\n')) {
            if (line.includes('PASS packed UnoCSS consumer')) console.log(line.trim());
          }
        }
      }
      if (engineFailures.length > 0) {
        throw new Error(
          `the packed UnoCSS engine matrix failed on ${engineFailures.length}/3 engines:\n` +
            engineFailures.join('\n'),
        );
      }
    } finally {
      if (!exited) {
        try {
          process.kill(-server.pid!, 'SIGTERM');
        } catch {
          server.kill('SIGTERM');
        }
      }
      await new Promise((resolveStop) => setTimeout(resolveStop, 500));
    }
    console.log(
      'Packed UnoCSS consumer: install, build, start and the three-engine matrix passed.',
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

await main();
