/**
 * Unit tests for @openelement/router/server-runtime action runtime
 * (ADR-0160 rule a, #1470 block c): the request-time action POST protocol
 * the generated entries import instead of carrying emitted function bodies —
 * the same-origin CSRF floor (#611, #921, #938, #1382), named-action
 * dispatch with its own-key gate (#542), the canonical classification
 * (#541), the fetch/native channel fork, the RFC 9457 problem+json error
 * channel (#863, #549), the PRG flow (#548), the default body limit (#568)
 * bound to the S1c policy constant, the ADR-0121 303 coercion, the 500 error
 * mapping (#558).
 *
 * The generated WIRING stays pinned by entry-renderer.test.ts; the
 * end-to-end behavior stays pinned by the read-only request-time-parity
 * oracle on both the dev and the build runtime.
 */
import { expect, test } from 'vitest';
import { fail } from '../src/authoring.ts';
import {
  ACTION_FETCH_HEADER,
  actionErrorResponse,
  actionRedirectResponse,
  createActionBodyLimit,
  runActionProtocol,
  safeRedirectLocation,
} from '../src/vite/internal/server-runtime/action-runtime.ts';
import {
  boundRequestScope,
  createRequestScope,
  createWinterCgApp,
} from '../src/vite/internal/server-runtime/wintercg.ts';
import type { OpenElementRequestScope } from '../src/vite/internal/server-runtime/wintercg.ts';

const PROBLEM_JSON = 'application/problem+json';

/**
 * The REAL per-request scope from the WinterCG composition layer (#1560):
 * the protocol runs against the same request mechanics the generated
 * handlers bind, so the scope's channel merge (c.header() folding into
 * every constructed response) is exercised verbatim.
 */
function actionContext(options: {
  url: string;
  headers?: Record<string, string>;
  body?: string | null;
  env?: Record<string, unknown>;
}): OpenElementRequestScope {
  const raw = new Request(options.url, {
    method: 'POST',
    headers: options.headers,
    body: options.body === undefined ? undefined : options.body,
  });
  return createRequestScope(raw, options.env ?? {});
}

function statusPage(title: string, message: string, status: number): Response {
  return new Response(`${title}|${message}`, { status });
}

function formPost(options: {
  path?: string;
  origin?: string;
  fetchHeader?: boolean;
  contentType?: string;
  accept?: string;
  upgradeInsecureRequests?: string;
  secFetchSite?: string;
  env?: Record<string, unknown>;
  body?: string;
}): { context: OpenElementRequestScope; state: { isFetch: boolean } } {
  const headers: Record<string, string> = {
    'content-type': options.contentType ?? 'application/x-www-form-urlencoded',
  };
  if (options.origin !== undefined) headers['origin'] = options.origin;
  if (options.fetchHeader) headers[ACTION_FETCH_HEADER] = 'true';
  if (options.accept !== undefined) headers['accept'] = options.accept;
  if (options.upgradeInsecureRequests !== undefined) {
    headers['upgrade-insecure-requests'] = options.upgradeInsecureRequests;
  }
  if (options.secFetchSite !== undefined) headers['sec-fetch-site'] = options.secFetchSite;
  const context = actionContext({
    url: `https://pages.example.test${options.path ?? '/form'}`,
    headers,
    body: options.body ?? 'message=hello',
    env: options.env,
  });
  return { context, state: { isFetch: false } };
}

test('named action dispatch answers success with PRG 303, marker stripped, search kept', async () => {
  const { context, state } = formPost({
    path: '/form?/save&keep=1',
    origin: 'https://pages.example.test',
  });
  const execution = await runActionProtocol(
    context,
    { actions: { save: () => ({ ok: true }) } },
    { env: {} },
    statusPage,
    state,
  );
  expect(state.isFetch).toEqual(false);
  expect(execution.response, 'success answers a PRG response').toBeTruthy();
  expect(execution.response.status).toEqual(303);
  expect(execution.response.headers.get('Location')).toEqual('/form?keep=1');
});

test('the bare `action` export dispatches when no ?/name is present', async () => {
  const { context, state } = formPost({ origin: 'https://pages.example.test' });
  const execution = await runActionProtocol(
    context,
    { action: () => 'ok' },
    { env: {} },
    statusPage,
    state,
  );
  expect(execution.response?.status).toEqual(303);
});

test('a successful action discards its return value: 303 PRG, no success envelope anywhere (#I4/KR-13)', async () => {
  // ADR-0120 decision 3: success data has no envelope. The native channel is
  // a bare 303; the fetch channel is the `redirect` ActionResult. The
  // authored success value never rides either response on either channel.
  const authValue = { saved: true, id: 7 };
  const nativePost = formPost({ origin: 'https://pages.example.test' });
  const nativeExecution = await runActionProtocol(
    nativePost.context,
    { action: () => authValue },
    { env: {} },
    statusPage,
    nativePost.state,
  );
  expect(nativeExecution.actionResult, 'success never enters the re-render channel').toEqual(
    undefined,
  );
  expect(nativeExecution.response!.status).toEqual(303);
  expect(await nativeExecution.response!.text()).not.toContain('saved');

  const fetchPost = formPost({
    origin: 'https://pages.example.test',
    fetchHeader: true,
  });
  const fetchExecution = await runActionProtocol(
    fetchPost.context,
    { action: () => authValue },
    { env: {} },
    statusPage,
    fetchPost.state,
  );
  const body = (await fetchExecution.response!.json()) as { type: string };
  expect(body.type).toEqual('redirect');
  expect(JSON.stringify(body)).not.toContain('saved');
});

test('fail() re-render channel: native callers receive the classified outcome at 422', async () => {
  const { context, state } = formPost({ origin: 'https://pages.example.test' });
  const execution = await runActionProtocol(
    context,
    { action: () => fail(422, { message: 'message is required' }) },
    { env: {} },
    statusPage,
    state,
  );
  expect(execution.response).toEqual(undefined);
  expect(execution.actionResult).toEqual({
    kind: 'failure',
    status: 422,
    data: { message: 'message is required' },
  });
});

test('fail() fetch channel answers the ActionResult JSON with degraded unserializable data', async () => {
  for (const data of [
    undefined,
    () => 'nope',
    Symbol('sym'),
    1n,
    (() => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      return circular;
    })(),
  ]) {
    const { context, state } = formPost({
      origin: 'https://pages.example.test',
      fetchHeader: true,
    });
    const execution = await runActionProtocol(
      context,
      { action: () => fail(422, data) },
      { env: {} },
      statusPage,
      state,
    );
    const response = execution.response!;
    expect(response.status, 'the author status survives the fetch channel').toEqual(422);
    expect(response.headers.get('Content-Type')).toEqual('application/json');
    expect(await response.json()).toEqual({ type: 'failure', status: 422, data: null });
  }
});

test('fail() fetch channel keeps serializable data intact', async () => {
  const { context, state } = formPost({
    origin: 'https://pages.example.test',
    fetchHeader: true,
  });
  const execution = await runActionProtocol(
    context,
    { action: () => fail(422, { message: 'echo' }) },
    { env: {} },
    statusPage,
    state,
  );
  expect(await execution.response!.json()).toEqual({
    type: 'failure',
    status: 422,
    data: { message: 'echo' },
  });
});

test('unknown named action: fetch callers get problem+json 404, native callers the status page', async () => {
  const fetchPost = formPost({
    path: '/form?/nope',
    origin: 'https://pages.example.test',
    fetchHeader: true,
  });
  const fetchExecution = await runActionProtocol(
    fetchPost.context,
    { actions: { save: () => 'ok' } },
    { env: {} },
    statusPage,
    fetchPost.state,
  );
  const problem = fetchExecution.response!;
  expect(problem.status).toEqual(404);
  expect(problem.headers.get('Content-Type')).toEqual(PROBLEM_JSON);
  expect(await problem.json()).toEqual({
    type: 'about:blank',
    title: 'Not Found',
    status: 404,
    detail: 'No action named "nope" on this route.',
  });

  const nativePost = formPost({ path: '/form?/nope', origin: 'https://pages.example.test' });
  const nativeExecution = await runActionProtocol(
    nativePost.context,
    { actions: { save: () => 'ok' } },
    { env: {} },
    statusPage,
    nativePost.state,
  );
  expect(nativeExecution.response!.status).toEqual(404);
  expect(await nativeExecution.response!.text()).toContain('404 Not Found|');
});

test('prototype-chain action names are not dispatchable (#542)', async () => {
  const { context, state } = formPost({
    path: '/form?/constructor',
    origin: 'https://pages.example.test',
    fetchHeader: true,
  });
  const execution = await runActionProtocol(
    context,
    { actions: { save: () => 'ok' } },
    { env: {} },
    statusPage,
    state,
  );
  expect(execution.response!.status).toEqual(404);
});

test('a route without any action export is a defined 404, not a render', async () => {
  const { context, state } = formPost({
    origin: 'https://pages.example.test',
    fetchHeader: true,
  });
  const execution = await runActionProtocol(context, {}, { env: {} }, statusPage, state);
  expect(await execution.response!.json()).toEqual({
    type: 'about:blank',
    title: 'Not Found',
    status: 404,
    detail: 'This route does not accept submissions.',
  });
});

test('the CSRF floor rejects cross-site posts: problem+json on fetch, plain text native (#611)', async () => {
  const fetchPost = formPost({
    origin: 'https://evil.example',
    fetchHeader: true,
  });
  const fetchExecution = await runActionProtocol(
    fetchPost.context,
    { action: () => 'ok' },
    { env: {} },
    statusPage,
    fetchPost.state,
  );
  const problem = fetchExecution.response!;
  expect(problem.status).toEqual(403);
  expect(problem.headers.get('Content-Type')).toEqual(PROBLEM_JSON);
  expect(await problem.json()).toEqual({
    type: 'about:blank',
    title: 'Forbidden',
    status: 403,
    detail: 'Cross-site form submission rejected',
  });

  const nativePost = formPost({ origin: 'https://evil.example' });
  const nativeExecution = await runActionProtocol(
    nativePost.context,
    { action: () => 'ok' },
    { env: {} },
    statusPage,
    nativePost.state,
  );
  expect(nativeExecution.response!.status).toEqual(403);
  expect(await nativeExecution.response!.text()).toEqual('Forbidden');
});

test('OPEN_ELEMENT_DISABLE_CSRF=1 turns the floor off', async () => {
  const { context, state } = formPost({
    origin: 'https://evil.example',
    fetchHeader: true,
    env: { OPEN_ELEMENT_DISABLE_CSRF: '1' },
  });
  const execution = await runActionProtocol(
    context,
    { action: () => 'ok' },
    { env: { OPEN_ELEMENT_DISABLE_CSRF: '1' } },
    statusPage,
    state,
  );
  // The fetch redirect outcome rides HTTP 200 with the 303 in the ActionResult
  // body (the shape the request-time-parity oracle pins).
  expect(await execution.response!.json()).toEqual({
    type: 'redirect',
    status: 303,
    location: '/form',
  });
});

test('same-origin posts pass; the http loopback allowance covers host variety (#921)', async () => {
  const raw = new Request('http://127.0.0.1:8000/form', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'http://localhost:3000',
    },
    body: 'message=hello',
  });
  const context = createRequestScope(raw);
  const execution = await runActionProtocol(
    context,
    { action: () => 'ok' },
    { env: {} },
    statusPage,
    { isFetch: false },
  );
  expect(execution.response!.status).toEqual(303);
});

test('an Origin of literal null is the no-referrer case and is allowed (#938)', async () => {
  const { context, state } = formPost({
    origin: 'null',
    fetchHeader: true,
  });
  const execution = await runActionProtocol(
    context,
    { action: () => 'ok' },
    { env: {} },
    statusPage,
    state,
  );
  expect((await execution.response!.json()).status).toEqual(303);
});

test('same-site Fetch Metadata without a matching origin fails closed', async () => {
  const { context, state } = formPost({
    fetchHeader: true,
    secFetchSite: 'same-site',
  });
  const execution = await runActionProtocol(
    context,
    { action: () => 'ok' },
    { env: {} },
    statusPage,
    state,
  );
  expect(execution.response!.status).toEqual(403);
});

test('browser-shaped form body without Origin or Fetch Metadata fails closed (#1382)', async () => {
  for (const evidence of [
    { upgradeInsecureRequests: '1' },
    { accept: 'text/html,application/xhtml+xml' },
  ]) {
    const { context, state } = formPost({ fetchHeader: true, ...evidence });
    const execution = await runActionProtocol(
      context,
      { action: () => 'ok' },
      { env: {} },
      statusPage,
      state,
    );
    expect(execution.response!.status).toEqual(403);
  }
});

test('an unparseable body answers 400 per channel', async () => {
  const fetchPost = formPost({
    origin: 'https://pages.example.test',
    fetchHeader: true,
    contentType: 'text/plain',
    body: 'not a form',
  });
  const fetchExecution = await runActionProtocol(
    fetchPost.context,
    { action: () => 'ok' },
    { env: {} },
    statusPage,
    fetchPost.state,
  );
  const problem = fetchExecution.response!;
  expect(problem.status).toEqual(400);
  expect(problem.headers.get('Content-Type')).toEqual(PROBLEM_JSON);
  expect((await problem.json()).detail).toEqual('Could not parse the form body.');

  const nativePost = formPost({
    origin: 'https://pages.example.test',
    contentType: 'text/plain',
    body: 'not a form',
  });
  const nativeExecution = await runActionProtocol(
    nativePost.context,
    { action: () => 'ok' },
    { env: {} },
    statusPage,
    nativePost.state,
  );
  expect(nativeExecution.response!.status).toEqual(400);
});

test('the fetch redirect outcome is the ActionResult shape, not a 303 document (#548)', async () => {
  const { context, state } = formPost({
    path: '/form?/save',
    origin: 'https://pages.example.test',
    fetchHeader: true,
  });
  const execution = await runActionProtocol(
    context,
    { actions: { save: () => 'ok' } },
    { env: {} },
    statusPage,
    state,
  );
  expect(state.isFetch).toEqual(true);
  expect(await execution.response!.json()).toEqual({
    type: 'redirect',
    status: 303,
    location: '/form',
  });
});

test('actionRedirectResponse: native 303, fetch HTTP 200 with the ActionResult body (ADR-0121)', async () => {
  const context = actionContext({ url: 'https://pages.example.test/form' });
  const native = actionRedirectResponse(context, '/elsewhere', false);
  expect(native.status).toEqual(303);
  expect(native.headers.get('Location')).toEqual('/elsewhere');

  // The serialized client executor matches on the body, not the HTTP status:
  // the fetch channel answers 200 with the 303 carried in the redirect shape.
  const fetchResponse = actionRedirectResponse(context, '/elsewhere', true);
  expect(fetchResponse.status).toEqual(200);
  expect(await fetchResponse.json()).toEqual({
    type: 'redirect',
    status: 303,
    location: '/elsewhere',
  });
});

test('actionErrorResponse answers problem+json 500 and scrubs internals in production (#558)', () => {
  const capture: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    capture.push(args);
  };
  try {
    const dev = actionErrorResponse(
      actionContext({ url: 'https://pages.example.test/form' }),
      '/form',
      new Error('secret stack detail'),
      false,
    );
    expect(dev.status).toEqual(500);
    expect(dev.headers.get('Content-Type')).toEqual(PROBLEM_JSON);

    const production = actionErrorResponse(
      actionContext({ url: 'https://pages.example.test/form' }),
      '/form',
      new Error('secret stack detail'),
      true,
    );
    expect(production.status).toEqual(500);
  } finally {
    console.error = originalError;
  }
  expect(capture.length).toEqual(2);
  expect(capture[0][0]).toEqual('[openElement] Action POST failed for /form:');
});

test('createActionBodyLimit answers an oversized body per channel (#568)', async () => {
  const limit = createActionBodyLimit(1024);

  // An oversized body: the fetch channel speaks problem+json with the
  // negotiation headers; the native channel keeps plain text. The handler
  // runs inside the WinterCG app's dispatch, so the scope channel carries
  // the negotiation headers into the response exactly as the generated
  // POST chain does.
  function oversize(fetchHeader: boolean): Promise<Response> {
    const headers: Record<string, string> = {};
    if (fetchHeader) headers[ACTION_FETCH_HEADER] = 'true';
    const app = createWinterCgApp();
    app.use('*', (request, next) =>
      limit(request, {}, () => {
        void next;
        return new Response('reached');
      }),
    );
    return app.fetch(
      new Request('https://pages.example.test/form', {
        method: 'POST',
        headers,
        body: new Uint8Array(2048),
      }),
    );
  }

  const problem = await oversize(true);
  expect(problem.status).toEqual(413);
  expect(problem.headers.get('Content-Type')).toEqual(PROBLEM_JSON);
  expect(problem.headers.get('Cache-Control')).toEqual('no-store');
  expect(problem.headers.get('Vary')).toEqual(ACTION_FETCH_HEADER);
  expect((await problem.json()).detail).toEqual(
    'The request body exceeded the 10 MiB action limit.',
  );

  const plain = await oversize(false);
  expect(plain.status).toEqual(413);
  expect(await plain.text()).toEqual('Payload Too Large');
});

test('createActionBodyLimit passes an under-limit body through to next()', async () => {
  const limit = createActionBodyLimit(1024);
  const app = createWinterCgApp();
  let reachedNext = false;
  app.use('*', (request, next) =>
    limit(request, {}, () => {
      reachedNext = true;
      void request;
      void next;
      return new Response('ok');
    }),
  );
  await app.fetch(
    new Request('https://pages.example.test/form', {
      method: 'POST',
      headers: { 'content-length': '10' },
      body: 'message=ok',
    }),
  );
  expect(reachedNext).toEqual(true);
});

test('createActionBodyLimit swaps the bound request for the buffered twin on stream bodies', async () => {
  const limit = createActionBodyLimit(1024);
  const app = createWinterCgApp();
  let buffered: Request | undefined;
  app.use('*', (request) =>
    limit(request, {}, async () => {
      buffered = boundRequestScope(request)!.req.raw;
      return new Response(await buffered!.text());
    }),
  );
  const response = await app.fetch(
    new Request('https://pages.example.test/form', {
      method: 'POST',
      headers: { 'transfer-encoding': 'chunked' },
      body: 'message=streamed',
      duplex: 'half',
    } as RequestInit),
  );
  expect(await response.text()).toEqual('message=streamed');
  expect(buffered).not.toBeNull();
});

// ─── PRG Location normalization (alpha15 security lane S4) ────────────
//
// The PRG target is derived from the request's own pathname. A pathname that
// starts with `//` (reachable whenever a catch-all route matches, e.g.
// `POST //evil.example/x`) is protocol-relative once emitted as `Location`
// (and in the fetch channel's `redirect` ActionResult), so the browser
// navigates to another origin. The target is one canonical absolute path on
// this origin: exactly one leading `/`, no control characters, search kept.

async function successRedirect(
  path: string,
  fetchChannel: boolean,
): Promise<{ status: number; location: string | null }> {
  const { context, state } = formPost({
    path,
    origin: 'https://pages.example.test',
    fetchHeader: fetchChannel,
  });
  const execution = await runActionProtocol(
    context,
    { action: () => ({ ok: true }) },
    { env: {} },
    statusPage,
    state,
  );
  const response = execution.response!;
  if (fetchChannel) {
    const body = (await response.json()) as { type: string; status: number; location: string };
    return { status: body.status, location: body.location };
  }
  return { status: response.status, location: response.headers.get('Location') };
}

test('PRG Location never emits a protocol-relative target (both channels)', async () => {
  for (const fetchChannel of [false, true]) {
    expect(await successRedirect('//evil.example/x', fetchChannel)).toEqual({
      status: 303,
      location: '/evil.example/x',
    });
    expect(await successRedirect('///evil.example/x', fetchChannel)).toEqual({
      status: 303,
      location: '/evil.example/x',
    });
  }
});

test('PRG Location canonicalizes a backslash target and keeps the same-origin path', async () => {
  for (const fetchChannel of [false, true]) {
    // WHATWG URL parsing folds a raw backslash into `/` for special schemes,
    // so `/\evil.example/x` arrives as `//evil.example/x` and must canonicalize.
    expect(await successRedirect('/\\evil.example/x', fetchChannel)).toEqual({
      status: 303,
      location: '/evil.example/x',
    });
    // A percent-encoded backslash is a path character, not a separator: the
    // canonical form keeps it and stays on this origin.
    expect(await successRedirect('/%5Cevil.example/x', fetchChannel)).toEqual({
      status: 303,
      location: '/%5Cevil.example/x',
    });
  }
});

test('PRG Location keeps search params and stays a single absolute path', async () => {
  for (const fetchChannel of [false, true]) {
    expect(await successRedirect('/form?keep=1&other=2', fetchChannel)).toEqual({
      status: 303,
      location: '/form?keep=1&other=2',
    });
    // Percent-encoded CR/LF never become raw bytes in the header.
    expect(await successRedirect('/form%0D%0Azip', fetchChannel)).toEqual({
      status: 303,
      location: '/form%0D%0Azip',
    });
  }
});

test('safeRedirectLocation: one canonical absolute path, whatever the input shape', () => {
  // Normal targets are unchanged (existing PRG behaviour, search kept).
  expect(safeRedirectLocation('/form', 'keep=1')).toEqual('/form?keep=1');
  expect(safeRedirectLocation('/form', '')).toEqual('/form');
  // Protocol-relative and multi-slash pathnames collapse to exactly one `/`.
  expect(safeRedirectLocation('//evil.example/x', '')).toEqual('/evil.example/x');
  expect(safeRedirectLocation('///evil.example/x', '')).toEqual('/evil.example/x');
  expect(safeRedirectLocation('//', '')).toEqual('/');
  expect(safeRedirectLocation('', '')).toEqual('/');
  // Raw backslashes are path separators to the WHATWG parser: canonicalize.
  expect(safeRedirectLocation('\\\\evil.example/x', '')).toEqual('/evil.example/x');
  expect(safeRedirectLocation('/a\\b', '')).toEqual('/a/b');
  // Control characters never reach the header/JSON target.
  expect(safeRedirectLocation('/a\r\nb\tc\u0000d', '')).toEqual('/abcd');
  expect(safeRedirectLocation('/form', 'x=1\r\ny=2')).toEqual('/form?x=1y=2');
  // Percent-encoded bytes are already header-safe path/query characters.
  expect(safeRedirectLocation('/%5Cevil.example/x', 'q=%0D%0A')).toEqual(
    '/%5Cevil.example/x?q=%0D%0A',
  );
});

// ── CSRF/channel/body-limit runtime branches (coverage lane, test-only) ───

test('a success path with no loadContext env still answers PRG 303', async () => {
  const { context, state } = formPost({ origin: 'https://pages.example.test' });
  const execution = await runActionProtocol(context, { action: () => 'ok' }, {}, statusPage, state);
  expect(execution.response?.status).toEqual(303);
});

test('the http loopback allowance covers IPv6 loopback and rejects non-loopback http origins', async () => {
  const ipv6 = new Request('http://[::1]:8000/form', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'http://localhost:3000',
    },
    body: 'message=hello',
  });
  const ipv6Execution = await runActionProtocol(
    createRequestScope(ipv6),
    { action: () => 'ok' },
    { env: {} },
    statusPage,
    { isFetch: false },
  );
  expect(ipv6Execution.response?.status).toEqual(303);

  const plain = new Request('http://example.test/form', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'http://other.test',
    },
    body: 'message=hello',
  });
  const plainExecution = await runActionProtocol(
    createRequestScope(plain),
    { action: () => 'ok' },
    { env: {} },
    statusPage,
    { isFetch: false },
  );
  expect(plainExecution.response?.status).toEqual(403);
});

test('browser-shaped form bodies without Origin/Fetch Metadata: multipart and non-form bodies', async () => {
  const multipart = new Request('https://pages.example.test/form', {
    method: 'POST',
    headers: {
      'content-type': 'multipart/form-data; boundary=x',
      'upgrade-insecure-requests': '1',
    },
    body: '--x--',
  });
  const multipartExecution = await runActionProtocol(
    createRequestScope(multipart),
    { action: () => 'ok' },
    { env: {} },
    statusPage,
    { isFetch: false },
  );
  expect(multipartExecution.response?.status).toEqual(403);

  // A non-form body without navigation evidence is not browser-shaped: the
  // CSRF floor admits it and the form parser then rejects it as 400.
  const json = new Request('https://pages.example.test/form', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: '{"message":"hello"}',
  });
  const jsonExecution = await runActionProtocol(
    createRequestScope(json),
    { action: () => 'ok' },
    { env: {} },
    statusPage,
    { isFetch: false },
  );
  expect(jsonExecution.response?.status).toEqual(400);
});

test('the action body limit fails closed on an unbound request and honours declared length', async () => {
  const limit = createActionBodyLimit(16);
  const next = () => Promise.resolve(new Response('next', { status: 200 }));

  // No body at all: the middleware skips itself.
  expect(
    await (
      await limit(new Request('https://pages.example.test/form', { method: 'POST' }), {}, next)
    ).text(),
  ).toEqual('next');

  // Declared length under the limit: next() runs.
  const small = new Request('https://pages.example.test/form', {
    method: 'POST',
    headers: { 'content-length': '4' },
    body: 'a=b',
  });
  expect(await (await limit(small, {}, next)).text()).toEqual('next');

  // Declared length over the limit and no bound scope: the plain native-form
  // answer, because there is no negotiation channel to consult.
  const big = new Request('https://pages.example.test/form', {
    method: 'POST',
    headers: { 'content-length': '100' },
    body: 'x'.repeat(100),
  });
  const bigResponse = await limit(big, {}, next);
  expect(bigResponse.status).toEqual(413);
  expect(await bigResponse.text()).toEqual('Payload Too Large');
});

test('the action body limit drains an unbound stream body without swapping a scope', async () => {
  const limit = createActionBodyLimit(1024);
  let reached = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('message=hello'));
      controller.close();
    },
  });
  const response = await limit(
    new Request('https://pages.example.test/form', {
      method: 'POST',
      headers: { 'transfer-encoding': 'chunked' },
      body: stream,
      duplex: 'half',
    } as RequestInit),
    {},
    () => {
      reached = true;
      return Promise.resolve(new Response('next', { status: 200 }));
    },
  );
  expect(reached).toEqual(true);
  expect(await response.text()).toEqual('next');
});

test('actionErrorResponse surfaces a thrown scalar or object without a message as the dev detail', async () => {
  const context = actionContext({ url: 'https://pages.example.test/form' });
  const fromString = actionErrorResponse(context, '/form', 'plain failure', false);
  expect(((await fromString.json()) as { detail: string }).detail).toEqual('plain failure');
  const fromObject = actionErrorResponse(context, '/form', { code: 7 }, false);
  expect(((await fromObject.json()) as { detail: string }).detail).toEqual('[object Object]');
});

test('browser-shaped bodies: a same-origin Fetch Metadata verdict admits the action; non-navigation evidence admits it', async () => {
  // `sec-fetch-site: same-origin` with no Origin: the metadata branch decides
  // first (not cross-site), then the no-Origin/no-Fetch-Site heuristic is
  // skipped because Fetch Metadata was present.
  const sameOrigin = new Request('https://pages.example.test/form', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'sec-fetch-site': 'same-origin',
    },
    body: 'message=hello',
  });
  const sameOriginExecution = await runActionProtocol(
    createRequestScope(sameOrigin),
    { action: () => 'ok' },
    { env: {} },
    statusPage,
    { isFetch: false },
  );
  expect(sameOriginExecution.response?.status).toEqual(303);

  // A browser form body with neither navigation marker is not browser-shaped:
  // no text/html Accept, no Upgrade-Insecure-Requests.
  const nonNavigation = new Request('https://pages.example.test/form', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: 'message=hello',
  });
  const nonNavigationExecution = await runActionProtocol(
    createRequestScope(nonNavigation),
    { action: () => 'ok' },
    { env: {} },
    statusPage,
    { isFetch: false },
  );
  expect(nonNavigationExecution.response?.status).toEqual(303);
});
