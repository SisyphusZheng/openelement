/**
 * @openelement/router — template-page surface (#1568): defineHtmlPage.
 *
 * A template page is a page whose render is a plain function returning HTML:
 * SSG-direct output with zero client semantics — no Part Program, no
 * @property machinery, no island/static-component client emission, no SSR
 * registration. The build admits it through the existing module-vocabulary
 * admission (a host-injected page-definition binding, no compiled-grammar
 * change), and both render channels — the request-time GET handler and the
 * SSG renderRoute — produce the SAME document contract the component path
 * produces: render(props) → renderer wraps → layout wrap → wrapInDocument.
 *
 * The generated-code faces execute verbatim in a data: module against real
 * emitter output (the entry-render-ssg.test.ts / entry-og-dedup.test.ts
 * pattern).
 */
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { OpenElementError } from '@openelement/element';
import { analyzeModuleSemantics } from '@openelement/compiler';
import { ROUTER_MODULE_VOCABULARY } from '@openelement/protocol/module-vocabulary';
import { assertThrowsIncludes } from '../../../tests/lib/vitest-asserts.ts';
import { defineHtmlPage } from '../src/index.ts';
import { buildEntryDescriptor } from '../src/vite/internal/ssg/entry-descriptor.ts';
import { renderPageRoute } from '../src/vite/internal/ssg/entry-codegen.ts';
import { renderSsgSection } from '../src/vite/internal/ssg/entry-render-ssg.ts';
import { renderEntry } from '../src/vite/internal/ssg/entry-orchestrator.ts';
import { scanRoutes } from '../src/vite/internal/ssg/route-scanner.ts';
import type { RouteEntry } from '@openelement/protocol/framework';

// ─── 1. The authoring surface ───────────────────────────────────────────────

test('defineHtmlPage attaches an html-page descriptor carrying the render function', () => {
  const render = (props: Record<string, unknown>) => `<h1>${String(props.title)}</h1>`;
  const mod = defineHtmlPage(render, {
    head: { title: 'About' },
    props: ({ data }) => ({ title: (data as { title?: string })?.title ?? '' }),
  });
  const page = mod.openElementPage;
  expect(page.kind).toEqual('html-page');
  expect(page.render).toEqual(render);
  expect(page.renderIntent).toEqual({ mode: 'static' });
  expect(page.head).toEqual({ title: 'About' });
  expect(typeof page.props).toEqual('function');
});

test('defineHtmlPage rejects a non-function render', () => {
  assertThrowsIncludes(
    // @ts-expect-error — exercising the runtime contract
    () => defineHtmlPage('<h1>nope</h1>'),
    OpenElementError,
    'defineHtmlPage() requires a render function',
  );
});

test('defineHtmlPage rejects renderIntent.stream — no compiled program to front-gate', () => {
  assertThrowsIncludes(
    () =>
      defineHtmlPage(() => '<p>x</p>', {
        // @ts-expect-error — stream is not part of the template descriptor
        renderIntent: { mode: 'dynamic', stream: { defer: ['first'] } },
      }),
    OpenElementError,
    'renderIntent.stream is not supported on defineHtmlPage',
  );
});

test('defineHtmlPage rejects unknown descriptor fields and route.path', () => {
  assertThrowsIncludes(
    () => defineHtmlPage(() => '<p>x</p>', { nope: true } as never),
    OpenElementError,
    'does not accept top-level "nope"',
  );
  assertThrowsIncludes(
    () => defineHtmlPage(() => '<p>x</p>', { route: { path: '/nope' } }),
    OpenElementError,
    'route.path is not supported',
  );
});

test('defineHtmlPage validates renderIntent.mode and the projectors like definePage', () => {
  assertThrowsIncludes(
    () => defineHtmlPage(() => '<p>x</p>', { renderIntent: { mode: 'dynmaic' as never } }),
    OpenElementError,
    "renderIntent.mode must be 'static' or 'dynamic'",
  );
  assertThrowsIncludes(
    () => defineHtmlPage(() => '<p>x</p>', { props: 'nope' as never }),
    OpenElementError,
    'props must be a projector function',
  );
});

// ─── 2. Admission: the existing module-vocabulary scan ──────────────────────

test('the module scan admits export default defineHtmlPage(...) as a template page', () => {
  const source = [
    "import { defineHtmlPage } from '@openelement/router';",
    "export default defineHtmlPage((props) => '<p>' + props.title + '</p>');",
  ].join('\n');
  const facts = analyzeModuleSemantics(source, 'about.ts', {
    vocabulary: ROUTER_MODULE_VOCABULARY,
  });
  expect(facts.definePage).toEqual(true);
  expect(facts.templatePage).toEqual(true);
});

test('a foreign same-name defineHtmlPage binding is never admitted', () => {
  const source = [
    "import { defineHtmlPage } from './local.ts';",
    "export default defineHtmlPage(() => '<p>x</p>');",
  ].join('\n');
  const facts = analyzeModuleSemantics(source, 'about.ts', {
    vocabulary: ROUTER_MODULE_VOCABULARY,
  });
  expect(facts.definePage).toEqual(false);
  // Spread-conditional rare fact: never present on a non-template module.
  expect(facts.templatePage).toEqual(undefined);
});

test('the route scanner marks a defineHtmlPage route htmlPage and admits no element tags', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oe-html-page-'));
  await writeFile(
    join(dir, 'about.ts'),
    [
      "import { defineHtmlPage } from '@openelement/router';",
      "export default defineHtmlPage(() => '<p>about</p>');",
    ].join('\n'),
    'utf8',
  );
  const routes = await scanRoutes(dir);
  expect(routes).toHaveLength(1);
  expect(routes[0].htmlPage).toEqual(true);
  expect(routes[0].definePage).toEqual(true);
});

// ─── 3. The descriptor + generated entry surface ────────────────────────────

const templateRoute: RouteEntry = {
  path: '/about',
  filePath: 'about.ts',
  type: 'page',
  varName: 'pageAbout',
  definePage: true,
  htmlPage: true,
};

test('buildEntryDescriptor carries htmlPage and the generated entry registers nothing for it', () => {
  const desc = buildEntryDescriptor([templateRoute], { ssg: true });
  expect(desc.pageRoutes[0].htmlPage).toEqual(true);

  const entry = renderEntry(desc);
  // The template page has no class to register: the SSR registry must stay
  // untouched by it (zero client semantics — no host element exists).
  expect(entry).not.toContain('__registerSsrComponent(__resolvePageTag($pageAbout)');
  // The handler renders through the descriptor's render function, read off
  // the __page descriptor binding the handler preamble makes.
  expect(entry).toContain('__page.render(');
});

test('the template GET handler never emits an __ssr call for its route', () => {
  const desc = buildEntryDescriptor([templateRoute], {});
  const lines: string[] = [];
  renderPageRoute(
    lines,
    desc.pageRoutes[0],
    desc.renderers,
    {
      title: 't',
      lang: 'en',
      headExtras: '',
      allowHeadExtrasScripts: false,
    },
    false,
  );
  const handler = lines.join('\n');
  expect(handler).toContain('__page.render(');
  expect(handler).not.toContain('__ssr(');
});

// ─── Shared harness miniatures (the entry-og-dedup pattern) ─────────────────

const WRAP_IN_DOCUMENT_MINIATURE = `
function wrapInDocument(content, opts) {
  return '<!DOCTYPE html><html lang="' + opts.lang + '"><head><title>' + opts.title + '</title></head><body>' + content + '</body></html>';
}
`;

const CREATE_DOCUMENT_STYLE_RESOURCES_MINIATURE = `
function createDocumentStyleResources() {
  const links = [];
  return {
    get links() { return links; },
    add(urls) { for (const url of urls) if (!links.includes(url)) links.push(url); },
  };
}
`;

/** The route-module namespace the generated entry imports for a template page. */
function templateModule(options: {
  render: string;
  head?: string;
  error?: string;
  loader?: string;
}) {
  return `{
  loader: ${options.loader ?? 'undefined'},
  default: { openElementPage: { kind: 'html-page', render: ${options.render}${
    options.head ? `, head: ${options.head}` : ''
  }${options.error ? `, error: ${options.error}` : ''} } },
}`;
}

// ─── 4. Request-time parity: the generated GET handler ──────────────────────

async function loadRequestTimeHandler(routes: RouteEntry[], modules: string) {
  const desc = buildEntryDescriptor(routes, {});
  const lines: string[] = [];
  for (const route of desc.pageRoutes) {
    renderPageRoute(
      lines,
      route,
      desc.renderers,
      {
        title: desc.document.title,
        lang: desc.document.lang,
        headExtras: desc.document.headExtras,
        allowHeadExtrasScripts: desc.document.allowHeadExtrasScripts,
      },
      desc.isSSG,
      desc.renderer,
    );
  }
  const harness = `
const __pageHandlers = { ${routes.map((route) => `${JSON.stringify(route.path)}: {}`).join(', ')} };
${modules}
function __requestScope(request) {
  const headers = {};
  return {
    header: (name, value) => { headers[name] = value; },
    get: () => undefined,
    req: { raw: request, path: new URL(request.url).pathname },
    env: {},
    html: (body, status) => new Response(body, { status: status || 200, headers }),
    redirect: (location, status) =>
      new Response(null, { status: status || 302, headers: { Location: String(location) } }),
  };
}
function __mergeChannelHeaders(promise) { return promise; }
function __resolvePageTag(routeModule, fallback) { return fallback; }
function __pageDefinition(m) { return m?.default?.openElementPage || {}; }
function __routeMeta(m) { return {}; }
function __isOpenElementRedirect(e) { return e && e.__openRedirect === true; }
function __isOpenElementNotFound(e) { return e && e.__openNotFound === true; }
function __statusHtml(title, message) { return '<main><h1>' + title + '</h1></main>'; }
function escapeHtml(text) { return String(text); }
const __locales = [];
function __getDefaultLocale() { return 'en'; }
function __localeFromPath(locales, path, fallback) { return fallback; }
${WRAP_IN_DOCUMENT_MINIATURE}
${CREATE_DOCUMENT_STYLE_RESOURCES_MINIATURE}
function __ssr(tag, props) { return '<main>' + tag + '</main>'; }
function __pageProps(routeModule, context) { return { title: (context.data && context.data.title) || '' }; }
function __pageErrorProps(routeModule, error, context) { return { title: 'err:' + String(error && error.message) }; }
function __renderLayout(content, path) { return '<layout>' + content + '</layout>'; }
function __clientScriptDescriptors() { return []; }
function __resolvePageDocument(head, context, clientScripts) {
  const resolved = typeof head === 'function' ? head(context) : head;
  return Object.assign({ links: [] }, resolved);
}
${lines.join('\n')}
export async function run(path) {
  const [handler] = __pageHandlers[path].GET;
  const response = await handler(new Request('http://localhost' + path), { params: {} });
  return { status: response.status, html: await response.text() };
}
`;
  const mod = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(harness));
  return mod.run as (path: string) => Promise<{ status: number; html: string }>;
}

test('request time: the template render output flows through renderer, layout, and document wraps', async () => {
  const run = await loadRequestTimeHandler(
    [templateRoute],
    `const $pageAbout = ${templateModule({
      render: `() => '<article>static</article>'`,
      head: `{ title: 'About' }`,
    })}`,
  );
  const { status, html } = await run('/about');
  expect(status).toEqual(200);
  // render(props) → layout wrap → wrapInDocument, same contract as components.
  expect(html).toEqual(
    '<!DOCTYPE html><html lang="en"><head><title>About</title></head><body><layout><article>static</article></layout></body></html>',
  );
});

test('request time: the template page renders loader data through the props projector', async () => {
  const run = await loadRequestTimeHandler(
    [templateRoute],
    `const $pageAbout = ${templateModule({
      render: `(props) => '<article>' + props.title + '</article>'`,
      loader: `async () => ({ title: 'From loader' })`,
    })}`,
  );
  const { html } = await run('/about');
  expect(html).toContain('<article>From loader</article>');
});

test('request time: the error projector re-renders the template with status 500', async () => {
  const run = await loadRequestTimeHandler(
    [templateRoute],
    `const $pageAbout = ${templateModule({
      render: `(props) => '<article>' + props.title + '</article>'`,
      error: `(error) => ({ title: 'err:' + String(error && error.message) })`,
      loader: `async () => { throw new Error('loader exploded'); }`,
    })}`,
  );
  const { status, html } = await run('/about');
  expect(status).toEqual(500);
  expect(html).toContain('<article>err:loader exploded</article>');
});

test('request time: redirect out of a template render short-circuits with the authored status', async () => {
  const run = await loadRequestTimeHandler(
    [templateRoute],
    `const $pageAbout = ${templateModule({
      render: `() => { throw { __openRedirect: true, location: '/login', status: 302 }; }`,
    })}`,
  );
  const response = await run('/about');
  expect(response.status).toEqual(302);
});

// ─── 5. SSG renderRoute parity ───────────────────────────────────────────────

async function loadSsgRenderRoute(routes: RouteEntry[], modules: string) {
  const desc = buildEntryDescriptor(routes, { ssg: true });
  const harness = `
const __headExtras = '';
${modules}
function __pageDefinition(m) { return m?.default?.openElementPage || {}; }
function __resolvePageTag(routeModule, fallback) { return fallback; }
function __routeMeta() { return {}; }
function __isOpenElementRedirect(e) { return e && e.__openRedirect === true; }
function __isOpenElementNotFound(e) { return e && e.__openNotFound === true; }
function __statusHtml(title, message) { return '<main><h1>' + title + '</h1></main>'; }
${WRAP_IN_DOCUMENT_MINIATURE}
${CREATE_DOCUMENT_STYLE_RESOURCES_MINIATURE}
function __ssr(tag, props) { return '<main>' + tag + '</main>'; }
function __pageProps(routeModule, context) { return { title: (context.data && context.data.title) || '' }; }
function __pageErrorProps(routeModule, error, context) { return { title: 'err:' + String(error && error.message) }; }
function __clientScriptDescriptors() { return []; }
function __resolvePageDocument(head, context, clientScripts) {
  const resolved = typeof head === 'function' ? head(context) : head;
  return Object.assign({ links: [] }, resolved);
}
function __renderLayout(pageHtml, routePath) { return '<layout>' + pageHtml + '</layout>'; }
${renderSsgSection(desc)}
`.replaceAll('import.meta.env.PROD', 'false');
  const mod = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(harness));
  return mod.renderRoute as (
    path: string,
    opts?: Record<string, unknown>,
  ) => Promise<{ html: string; status?: number; errors: Array<{ message: string }> }>;
}

const ssgRoutes: RouteEntry[] = [
  templateRoute,
  {
    path: '/boom',
    filePath: 'boom.tsx',
    type: 'page',
    varName: 'pageBoom',
    tagName: 'boom-page',
  },
];

test('SSG renderRoute: the template branch renders render(props) through the same wraps', async () => {
  const renderRoute = await loadSsgRenderRoute(
    ssgRoutes,
    `const $pageAbout = ${templateModule({
      render: `(props) => '<article>' + props.title + '</article>'`,
      head: `{ title: 'About' }`,
      loader: `async () => ({ title: 'About' })`,
    })};
const $pageBoom = { default: class BoomPage {} };`,
  );
  const result = await renderRoute('/about');
  expect(result.status).toEqual(undefined);
  expect(result.errors).toEqual([]);
  expect(result.html).toEqual(
    '<!DOCTYPE html><html lang="en"><head><title>About</title></head><body><layout><article>About</article></layout></body></html>',
  );
  // The component path in the same module is untouched.
  const compiled = await renderRoute('/boom');
  expect(compiled.html).toContain('<main>boom-page</main>');
});

test('SSG renderRoute: the template error projector re-renders with status 500', async () => {
  const renderRoute = await loadSsgRenderRoute(
    [templateRoute],
    `const $pageAbout = ${templateModule({
      render: `(props) => { if (props.title === 'boom') throw new Error('render exploded'); return '<article>' + props.title + '</article>'; }`,
      error: `(error) => ({ title: 'err:' + String(error && error.message) })`,
      loader: `async () => ({ title: 'boom' })`,
    })}`,
  );
  const result = await renderRoute('/about');
  expect(result.status).toEqual(500);
  expect(result.html).toContain('<article>err:render exploded</article>');
  expect(result.errors).toHaveLength(1);
  expect(result.errors[0].message).toEqual('render exploded');
});

// ─── 6. Zero client semantics ────────────────────────────────────────────────

test('a template-only project admits no islands and no static components', () => {
  const desc = buildEntryDescriptor([templateRoute], { ssg: true });
  expect(desc.islands).toEqual([]);
  expect(desc.staticComponents).toEqual([]);
  // No islands and no enhanced forms → no client entry exists to ship.
  expect(desc.islands.length > 0 || desc.hasEnhancedForms === true).toEqual(false);
});
