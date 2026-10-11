/**
 * KR-2 stage isolation: the island-load race on WebKit.
 *
 * Procedure: the same navigation the failing spec performs, repeated — each
 * attempt is one `goto` followed by a bounded gate requiring every
 * load-strategy island tag to define, with no retry inside an attempt. The
 * race needs a warm worker: 25 single-navigation runs in fresh browsers were
 * green, while the spec's own nine-navigation sequence fails one to three
 * tests per run.
 *
 * Observation is passive. `customElements.define`, `fetch` and the two failure
 * channels are recorded from an init script; nothing sleeps, nothing is
 * retried, and the loader's read path is untouched, so the race keeps its own
 * scheduling. A failed attempt reports which stage it reached:
 *
 *   module request/loading      a resource entry is missing or its response
 *                               never completed
 *   style asset top-level await  the style asset's response lands after the
 *                               loader's read — the export binds behind it
 *   export lookup               the loader's own rejection names the tag and
 *                               its check (`typeof n != 'function'`)
 *   custom element registration `customElements.get(tag)` after the gate
 *
 * The static half asserts the entry chunk's shape: `export{` sits after the
 * chunk's `await fetch(...)`, and the class the wrapper re-exports as
 * `default` is assigned behind that await — the window the race rides on.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

/** Every island the /combobox page activates on load. */
const ISLAND_TAGS = ['decoupled-view', 'live-counter', 'zag-combobox-light', 'zag-combobox'];

/**
 * Bounded gate. The healthy define latency on this fixture is tens of
 * milliseconds; five seconds is two orders of magnitude above it, so a tag that
 * misses the gate never defined on this page.
 */
const GATE_TIMEOUT_MS = 5_000;

/** Navigations per run; the failing spec's own suite performs nine. */
const ATTEMPTS = Number(process.env.KR2_ATTEMPTS ?? 10);

interface Kr2Record {
  defines: Array<{ tag: string; at: number }>;
  rejects: Array<{ message: string; at: number }>;
  errors: Array<{ message: string; at: number }>;
  cssFetches: Array<{ url: string; at: number }>;
}

/** The entry chunks' static shape: where the export binds relative to the TLA. */
function chunkOrderingEvidence(): string[] {
  const dir = join(import.meta.dirname!, '..', 'dist', 'client', 'islands');
  const lines: string[] = [];
  for (const name of readdirSync(dir)
    .filter((entry) => entry.startsWith('island-'))
    .sort()) {
    const text = readFileSync(join(dir, name), 'utf8');
    const awaited = text.indexOf('await fetch(');
    const exported = text.indexOf('export{');
    lines.push(
      `${name}: await fetch at ${awaited}, export{ at ${exported} — ` +
        `${exported > awaited ? 'export binds behind the style await' : 'export binds before the await'}`,
    );
  }
  return lines;
}

async function installRecorder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const record = { defines: [], rejects: [], errors: [], cssFetches: [] } as Kr2Record;
    (globalThis as unknown as { __kr2: Kr2Record }).__kr2 = record;
    const define = customElements.define.bind(customElements);
    customElements.define = ((
      name: string,
      ctor: CustomElementConstructor,
      options?: ElementDefinitionOptions,
    ) => {
      record.defines.push({ tag: name, at: Math.round(performance.now()) });
      return define(name, ctor, options);
    }) as typeof customElements.define;
    addEventListener('unhandledrejection', (event) => {
      const reason = (event as PromiseRejectionEvent).reason as { message?: string } | undefined;
      record.rejects.push({
        message: String(reason?.message ?? reason),
        at: Math.round(performance.now()),
      });
    });
    addEventListener('error', (event) => {
      record.errors.push({
        message: (event as ErrorEvent).message,
        at: Math.round(performance.now()),
      });
    });
    const originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('.css')) record.cssFetches.push({ url, at: Math.round(performance.now()) });
      return originalFetch(input, init);
    }) as typeof fetch;
  });
}

/** Stage evidence for one failed attempt; observation only, after the loss. */
async function gatherFailureEvidence(page: Page): Promise<string> {
  const evidence = await page.evaluate(async (tags: string[]) => {
    const record = (globalThis as unknown as { __kr2: Kr2Record }).__kr2;
    const resources = performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.includes('/client/'))
      .map((entry) => ({
        url: entry.name,
        file: entry.name.split('/').pop() as string,
        start: Math.round(entry.startTime),
        end: Math.round(entry.responseEnd),
      }));
    // Post-mortem only: the race is already lost, so re-reading the same module
    // cannot mask anything. It separates "never evaluates" from "read too early".
    const readNamespace = async (url: string | undefined) => {
      if (url === undefined) return 'resource never requested';
      try {
        const namespace = (await import(/* @vite-ignore */ url)) as Record<string, unknown>;
        return `resolved, default=${typeof namespace.default}`;
      } catch (error) {
        return `rejected: ${String((error as Error)?.message ?? error)}`;
      }
    };
    const wrapper = resources.find(
      (entry) => entry.file.startsWith('zag-combobox-') && entry.file.endsWith('.js'),
    );
    const islandChunk = resources.find(
      (entry) => entry.file.startsWith('island-zag-combobox-') && entry.file.endsWith('.js'),
    );
    return {
      record,
      resources,
      stillMissing: tags.filter((tag) => customElements.get(tag) === undefined),
      wrapperRead: await readNamespace(wrapper?.url),
      islandChunkRead: await readNamespace(islandChunk?.url),
    };
  }, ISLAND_TAGS);

  const styleAsset = evidence.resources.find((entry) => entry.file.endsWith('.css'));
  const firstReject = evidence.record.rejects[0];
  const firstDefine = evidence.record.defines[0];
  return [
    `never defined: ${evidence.stillMissing.join(', ')}`,
    `first loader rejection: ${
      firstReject ? `${firstReject.message} @${firstReject.at}ms` : '(none recorded)'
    }`,
    `uncaught errors: ${evidence.record.errors.length}`,
    `define calls: ${
      evidence.record.defines.map((entry) => `${entry.tag}@${entry.at}ms`).join(', ') || '(none)'
    }`,
    `style asset fetch: ${
      styleAsset
        ? `start ${styleAsset.start}ms, responseEnd ${styleAsset.end}ms`
        : '(never requested)'
    }`,
    `readBeforeStyleSettled: ${
      firstReject !== undefined && styleAsset !== undefined
        ? `${firstReject.at < styleAsset.end ? 'yes' : 'no'} (reject ${firstReject.at}ms vs style responseEnd ${styleAsset.end}ms)`
        : 'unknown (no rejection or no style request)'
    }`,
    `post-mortem wrapper read: ${evidence.wrapperRead}`,
    `post-mortem island chunk read: ${evidence.islandChunkRead}`,
    `module timeline: ${evidence.resources
      .map((entry) => `${entry.file}[${entry.start}..${entry.end}]`)
      .join(' ')}`,
    `first define before first rejection: ${
      firstDefine !== undefined && firstReject !== undefined
        ? firstDefine.at < firstReject.at
        : 'n/a'
    }`,
  ].join('\n    ');
}

test('KR-2: repeated navigations all define every load-strategy island tag', async ({ page }) => {
  // The loader's own failure is caught by the activation wrapper, so it never
  // reaches unhandledrejection. Record the page's console and page errors too:
  // a swallowed rejection still leaves a trace there.
  const consoleLines: string[] = [];
  page.on('console', (message) => consoleLines.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => consoleLines.push(`pageerror: ${error.message}`));

  // The static precondition the race rides on: the entry chunk's export binds
  // behind its style await, so a read inside that window sees `undefined`.
  const ordering = chunkOrderingEvidence();
  expect(
    ordering.every((line) => line.includes('export binds behind the style await')),
    `entry chunk shape changed; the TLA window the race rides on is gone:\n  ${ordering.join('\n  ')}`,
  ).toBe(true);

  await installRecorder(page);

  const failures: string[] = [];
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    await page.goto('/combobox', { waitUntil: 'load' });
    let missing: string[] = [];
    try {
      await page.waitForFunction(
        (tags: string[]) => tags.every((tag) => customElements.get(tag) !== undefined),
        ISLAND_TAGS,
        { timeout: GATE_TIMEOUT_MS },
      );
    } catch {
      missing = await page.evaluate(
        (tags: string[]) => tags.filter((tag) => customElements.get(tag) === undefined),
        ISLAND_TAGS,
      );
    }
    if (missing.length === 0) continue;
    const swallowed = consoleLines.slice(-6);
    consoleLines.length = 0;
    failures.push(
      `attempt ${attempt}:\n    ${await gatherFailureEvidence(page)}` +
        `\n    console trace: ${swallowed.length > 0 ? `\n      ${swallowed.join('\n      ')}` : '(nothing logged)'}`,
    );
  }

  expect(
    failures,
    `${failures.length}/${ATTEMPTS} attempts never defined an island tag:\n\n${failures.join('\n\n')}\n\nentry chunk shape:\n  ${ordering.join('\n  ')}`,
  ).toEqual([]);
});

/**
 * Controlled trigger for the same failure mode. The chunk's export binding is
 * created behind `await fetch(styleAsset)` and `await sheet.replace(...)`, so
 * holding the style asset open widens exactly the window the loader must not
 * read inside. The delay is test-side and the only perturbation: the product's
 * scheduling, read path and gates are untouched, and the unperturbed procedure
 * above stays the baseline.
 *
 * A correct loader must define every tag regardless of how long the style asset
 * takes — the gate is deliberately above the injected delay. A loader that
 * reads the entry namespace inside the window never defines the tag at all,
 * which is the original failure observed in the field.
 */
test('KR-2 controlled trigger: a held style asset must not cost the island its definition', async ({
  page,
}) => {
  const styleDelayMs = Number(process.env.KR2_STYLE_DELAY_MS ?? 1_500);
  await installRecorder(page);
  await page.route('**/*.css', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, styleDelayMs));
    await route.continue();
  });

  await page.goto('/combobox', { waitUntil: 'load' });
  let missing: string[] = [];
  try {
    await page.waitForFunction(
      (tags: string[]) => tags.every((tag) => customElements.get(tag) !== undefined),
      ISLAND_TAGS,
      { timeout: GATE_TIMEOUT_MS },
    );
  } catch {
    missing = await page.evaluate(
      (tags: string[]) => tags.filter((tag) => customElements.get(tag) === undefined),
      ISLAND_TAGS,
    );
  }

  const detail =
    missing.length === 0
      ? 'every tag defined'
      : `held style asset (${styleDelayMs}ms) left tags undefined:\n    ${await gatherFailureEvidence(page)}`;
  expect(missing, detail).toEqual([]);
});

/**
 * Post-fix contract for the late-style handoff, on the real module graph. The
 * style asset is held open, so the islands must define *before* the sheet
 * settles and the two ownership paths are observable in the window:
 *
 *   shadow — the DSD `<style data-oe-static-styles>` fallback is the styling
 *            channel until the replacing sheet is installed, so it must still
 *            be there while the asset is held and gone once it landed;
 *   light  — the owned head node is rewritten when the sheet lands, so the
 *            component ends up styled even though it activated unstyled.
 */
test('KR-2 post-fix: held styles still define every island, keep the SSR fallback, and land late', async ({
  page,
}) => {
  const styleDelayMs = Number(process.env.KR2_STYLE_DELAY_MS ?? 1_500);
  await installRecorder(page);
  await page.route('**/*.css', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, styleDelayMs));
    await route.continue();
  });

  await page.goto('/combobox', { waitUntil: 'load' });
  // The gate must pass while the sheet is still held: registration no longer
  // waits for the style asset.
  await page.waitForFunction(
    (tags: string[]) => tags.every((tag) => customElements.get(tag) !== undefined),
    ISLAND_TAGS,
    { timeout: GATE_TIMEOUT_MS },
  );

  // One in-page pass: read the state while the sheet is still held, then wait
  // (bounded) for the sheet to land and both channels to settle — the light
  // owner rewrites its node, hydration retires the shadow fallback only now.
  const observed = await page.evaluate(async () => {
    const read = () => {
      const frame = document.querySelector('combobox-page')?.shadowRoot;
      const host = frame?.querySelector('zag-combobox[machine-id="shadow-a"]');
      const first = host?.shadowRoot?.firstChild;
      const head = document.querySelector('style[data-open-element-compiled-style]');
      const headText = head?.textContent ?? '';
      return {
        fallback:
          !!first &&
          first.nodeType === 1 &&
          (first as Element).hasAttribute('data-oe-static-styles'),
        // The owned light node is the only channel the light island has; its
        // content is engine-independent evidence of the late refresh.
        lightRules: headText.includes('zag-combobox-input'),
        headChars: headText.length,
      };
    };
    const held = read();
    const deadline = performance.now() + 10_000;
    for (;;) {
      const state = read();
      if (!state.fallback && state.lightRules) {
        return { held, settled: { ...state, timedOut: false } };
      }
      if (performance.now() > deadline) return { held, settled: { ...state, timedOut: true } };
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  });

  expect(
    observed.held.fallback,
    `the shadow fallback must survive until its replacement is installed ` +
      `(light rules while held: ${observed.held.lightRules}, head chars: ${observed.held.headChars})`,
  ).toBe(true);
  expect(
    observed.settled.timedOut,
    `the replacement never landed: fallback=${observed.settled.fallback}, ` +
      `light rules=${observed.settled.lightRules}, head chars=${observed.settled.headChars}`,
  ).toBe(false);
  expect(observed.settled.fallback, 'the fallback retires once the sheet is installed').toBe(false);
  expect(observed.settled.lightRules, 'the light owner rewrites its node with the late rules').toBe(
    true,
  );
});

/**
 * Q1-A: a disconnect before readiness must leave no late style write. The sheet
 * is held open, the light island is removed while its handoff is still pending,
 * and the release must not touch the DOM on behalf of the dropped connection.
 */
test('Q1-A: a disconnect before the sheet is ready leaves no late style write', async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/*.css', async (route) => {
    await held;
    await route.continue();
  });

  await page.goto('/combobox', { waitUntil: 'load' });
  await page.waitForFunction(
    (tags: string[]) => tags.every((tag) => customElements.get(tag) !== undefined),
    ISLAND_TAGS,
    { timeout: GATE_TIMEOUT_MS },
  );

  const removed = await page.evaluate(() => {
    const frame = document.querySelector('combobox-page')?.shadowRoot;
    const host = frame?.querySelector('zag-combobox-light');
    const parent = host?.parentNode ?? null;
    host?.remove();
    return { hadHost: host !== null, hadParent: parent !== null };
  });
  expect(removed, 'the fixture must expose the light island to disconnect it').toEqual({
    hadHost: true,
    hadParent: true,
  });

  release();
  const after = await page.evaluate(async () => {
    const settle = async () => {
      const deadline = performance.now() + 5_000;
      for (;;) {
        const frame = document.querySelector('combobox-page')?.shadowRoot;
        const host = frame?.querySelector('zag-combobox[machine-id="shadow-a"]');
        const first = host?.shadowRoot?.firstChild;
        const fallback =
          !!first &&
          first.nodeType === 1 &&
          (first as Element).hasAttribute('data-oe-static-styles');
        if (!fallback || performance.now() > deadline) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    };
    await settle();
    const node = document.querySelector('style[data-open-element-compiled-style]');
    return { headText: node?.textContent ?? null };
  });

  expect(
    after.headText?.includes('zag-combobox-input') ?? false,
    `a stale continuation wrote the light rules after the disconnect (node: ${String(after.headText).slice(0, 160)})`,
  ).toBe(false);
});

/**
 * Q1-B: disconnect then reconnect, recorded as a characterization.
 *
 * What KR-2 owns is the stale continuation: the first connection's handoff
 * settling after the component moved on must not write, remove or duplicate
 * anything (proved by Q1-A above). This test records what the framework does
 * with a *reconnected light root* today, on the real graph: the element is
 * connected again, but no owned head node is re-created, so the light island
 * carries no component styles after the move. The assertion below states that
 * observed behaviour rather than the ideal, so the finding stays visible
 * instead of being smoothed over — it is a pre-existing lifecycle gap outside
 * the KR-2 seam (no product code in this batch touches the light connect path)
 * and is reported as a residual finding rather than fixed here.
 */
test('Q1-B: a moved light root is recorded — no stale write, and no owned node re-created', async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/*.css', async (route) => {
    await held;
    await route.continue();
  });

  await page.goto('/combobox', { waitUntil: 'load' });
  await page.waitForFunction(
    (tags: string[]) => tags.every((tag) => customElements.get(tag) !== undefined),
    ISLAND_TAGS,
    { timeout: GATE_TIMEOUT_MS },
  );

  const moved = await page.evaluate(() => {
    const frame = document.querySelector('combobox-page')?.shadowRoot;
    const host = frame?.querySelector('zag-combobox-light') as HTMLElement | null;
    if (!host || !frame) return false;
    const parent = host.parentNode as ParentNode;
    host.remove();
    parent.appendChild(host); // reconnect the same element
    return true;
  });
  expect(moved, 'the fixture must expose the light island to move it').toBe(true);

  release();
  const settled = await page.evaluate(async () => {
    const deadline = performance.now() + 10_000;
    for (;;) {
      const nodes = [...document.querySelectorAll('style[data-open-element-compiled-style]')];
      const text = nodes.map((node) => node.textContent ?? '').join('\n');
      const frame = document.querySelector('combobox-page')?.shadowRoot;
      const host = frame?.querySelector('zag-combobox[machine-id="shadow-a"]');
      const first = host?.shadowRoot?.firstChild;
      const fallback =
        !!first && first.nodeType === 1 && (first as Element).hasAttribute('data-oe-static-styles');
      // Wait for the *shadow* island's handoff: the sheet settling is the event
      // that would fire a stale light continuation.
      if (!fallback) {
        const liveHost = frame?.querySelector('zag-combobox-light') as HTMLElement | null;
        return {
          nodes: nodes.length,
          rules: text.includes('zag-combobox-input'),
          hostConnected: liveHost?.isConnected ?? false,
          timedOut: false,
        };
      }
      if (performance.now() > deadline) {
        const liveHost = frame?.querySelector('zag-combobox-light') as HTMLElement | null;
        return {
          nodes: nodes.length,
          rules: text.includes('zag-combobox-input'),
          hostConnected: liveHost?.isConnected ?? false,
          timedOut: true,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  });

  expect(settled.timedOut, `the sheet never settled (${JSON.stringify(settled)})`).toBe(false);
  expect(settled.hostConnected, 'the moved element is connected again').toBe(true);
  // Recorded behaviour: the stale continuation wrote nothing (no node, no
  // rules) — the generation guard holds.
  expect(
    settled.rules,
    `a stale continuation wrote the light rules after the move (${JSON.stringify(settled)})`,
  ).toBe(false);
  expect(
    settled.nodes,
    `recorded: a reconnected light root carries ${settled.nodes} owned node(s) — the ` +
      `pre-existing lifecycle gap this test documents`,
  ).toEqual(0);
});

/**
 * Q1-C: two light instances share the sheet. One disconnecting must not break
 * the other; the last owner disconnecting must clean up. The node count is
 * reported either way so the sharing model is visible in the log.
 */
test('Q1-C: one light instance disconnecting leaves the other styled', async ({ page }) => {
  await page.goto('/combobox', { waitUntil: 'load' });
  await page.waitForFunction(
    (tags: string[]) => tags.every((tag) => customElements.get(tag) !== undefined),
    ISLAND_TAGS,
    { timeout: GATE_TIMEOUT_MS },
  );

  const observed = await page.evaluate(async () => {
    const frame = document.querySelector('combobox-page')?.shadowRoot;
    const first = frame?.querySelector('zag-combobox-light') as HTMLElement | null;
    if (!frame || !first) return null;
    const second = document.createElement('zag-combobox-light');
    second.setAttribute('machine-id', 'second-instance');
    frame.appendChild(second);
    // Same sheet object: the class owns one static styles list.
    const sharedSheet = customElements.get('zag-combobox-light') as unknown as {
      styles?: readonly unknown[];
    };
    await new Promise((resolve) => setTimeout(resolve, 200));
    const nodesBefore = document.querySelectorAll('style[data-open-element-compiled-style]').length;
    second.remove();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const afterRemoval = [...document.querySelectorAll('style[data-open-element-compiled-style]')]
      .map((node) => node.textContent ?? '')
      .join('\n');
    first.remove();
    await new Promise((resolve) => setTimeout(resolve, 200));
    return {
      nodesBefore,
      nodesAfterRemoval: document.querySelectorAll('style[data-open-element-compiled-style]')
        .length,
      nodesAfterLastDisconnect: document.querySelectorAll('style[data-open-element-compiled-style]')
        .length,
      survivorHasRules: afterRemoval.includes('zag-combobox-input'),
      sharedSheetCount: sharedSheet?.styles?.length ?? -1,
    };
  });

  expect(observed, 'the fixture must expose the light island').not.toBeNull();
  expect(
    observed!.survivorHasRules,
    `the remaining instance lost its rules (nodes before=${observed!.nodesBefore}, ` +
      `after removal=${observed!.nodesAfterRemoval})`,
  ).toBe(true);
  expect(
    observed!.nodesAfterLastDisconnect,
    `cleanup must leave no owned node (sheet slots: ${observed!.sharedSheetCount})`,
  ).toEqual(0);
});

/**
 * Q2: a stylesheet that never loads is not success. The islands still define,
 * the failure is reported through the framework's diagnostic (not a silent
 * console-less drop), the SSR fallback survives, the light owner is never told
 * its rules arrived, and no unhandled rejection escapes.
 */
for (const mode of ['http-500', 'network-abort'] as const) {
  test(`Q2: a ${mode} stylesheet failure is diagnosed, never read as ready`, async ({ page }) => {
    const consoleLines: string[] = [];
    page.on('console', (message) => consoleLines.push(`${message.type()}: ${message.text()}`));
    await installRecorder(page);
    await page.route('**/*.css', async (route) => {
      if (mode === 'http-500') await route.fulfill({ status: 500, body: '' });
      else await route.abort('failed');
    });

    await page.goto('/combobox', { waitUntil: 'load' });
    // The constructor still becomes available: the failure is a style failure,
    // not a registration failure.
    await page.waitForFunction(
      (tags: string[]) => tags.every((tag) => customElements.get(tag) !== undefined),
      ISLAND_TAGS,
      { timeout: GATE_TIMEOUT_MS },
    );

    // Bounded wait for the diagnostic; the scope reports it once it observes
    // the rejected readiness.
    const deadline = Date.now() + 10_000;
    while (
      Date.now() < deadline &&
      !consoleLines.some((line) => line.includes('OE_STYLES_SHEET_LOAD_FAILED'))
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const state = await page.evaluate(() => {
      const frame = document.querySelector('combobox-page')?.shadowRoot;
      const host = frame?.querySelector('zag-combobox[machine-id="shadow-a"]');
      const first = host?.shadowRoot?.firstChild;
      return {
        fallback:
          !!first &&
          first.nodeType === 1 &&
          (first as Element).hasAttribute('data-oe-static-styles'),
        headText:
          document.querySelector('style[data-open-element-compiled-style]')?.textContent ?? null,
        unhandled: (globalThis as unknown as { __kr2: { rejects: unknown[]; errors: unknown[] } })
          .__kr2,
      };
    });

    const diagnostic = consoleLines.find((line) => line.includes('OE_STYLES_SHEET_LOAD_FAILED'));
    expect(
      diagnostic,
      `no diagnostic was reported (console: ${consoleLines.slice(-4).join(' | ')})`,
    ).toBeTruthy();
    expect(diagnostic, 'the diagnostic names the failing sheet').toContain('style sheet');
    expect(
      (state.unhandled.rejects as unknown[]).length,
      'a style failure must not surface as an unhandled rejection',
    ).toEqual(0);
    expect((state.unhandled.errors as unknown[]).length, 'no uncaught page error').toEqual(0);
    expect(state.fallback, 'the SSR fallback must survive a failed sheet').toBe(true);
    expect(
      state.headText?.includes('zag-combobox-input') ?? false,
      'a failed sheet must never be read as ready by the light owner',
    ).toBe(false);
  });
}

/**
 * Mechanism probe, no fixture or product files: the shipped graph's exact
 * shape, built from two blob modules in the page.
 *
 *   B  — an async module whose exported binding is assigned behind a top-level
 *        await (the island chunk: `await fetch(styleAsset)` before the class).
 *   A  — a pure re-export facade over B (the wrapper chunk: `import … from
 *        './island-…'` plus `export { … as default }`).
 *
 * B is started and observed inside its await, then A is imported. A dynamic
 * import of A must resolve only after B's evaluation completes, so `default`
 * must be a function. This test pins the engine differential as a platform
 * fact — WebKit resolves A early and the read lands inside B's window — because
 * that is the read the generated loader performs, and the only shape that turns
 * a held style asset into a never-defined tag. It is a characterization of the
 * engine, not of our code: a fix has to make the loader (or the emitted module
 * shape) survive the early resolution, it cannot rely on the engine changing.
 */
test('KR-2 engine characterization: resolving a re-export facade while its async dependency is held', async ({
  page,
  browserName,
}) => {
  await page.goto('/combobox');
  const probe = await page.evaluate(async () => {
    const holdMs = 400;
    const bUrl = URL.createObjectURL(
      new Blob(
        [
          `
          globalThis.__kr2ProbeEntered = true;
          await new Promise((resolve) => setTimeout(resolve, ${holdMs}));
          var exported = class { static probe = 'B'; };
          export { exported as default };
          `,
        ],
        { type: 'text/javascript' },
      ),
    );
    const aUrl = URL.createObjectURL(
      new Blob(
        [
          `
          import reexported from ${JSON.stringify(bUrl)};
          export { reexported as default };
          `,
        ],
        { type: 'text/javascript' },
      ),
    );

    const bPromise = import(bUrl);
    // Bounded setup poll: module evaluation is a task, so a microtask spin
    // never lets it run. One macrotask turn per step, deadline-bounded.
    const deadline = performance.now() + 2_000;
    while (
      (globalThis as { __kr2ProbeEntered?: boolean }).__kr2ProbeEntered !== true &&
      performance.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const enteredHold = (globalThis as { __kr2ProbeEntered?: boolean }).__kr2ProbeEntered === true;

    const startedAt = performance.now();
    const facade = (await import(aUrl)) as Record<string, unknown>;
    const facadeReturnedAfterMs = Math.round(performance.now() - startedAt);
    const readInsideWindow = typeof facade.default;

    await bPromise;
    const readAfterEvaluation = typeof facade.default;

    return { enteredHold, holdMs, facadeReturnedAfterMs, readInsideWindow, readAfterEvaluation };
  });

  const detail =
    `facade import() returned after ${probe.facadeReturnedAfterMs}ms ` +
    `(dependency held ${probe.holdMs}ms) and read default=${probe.readInsideWindow}; ` +
    `after the dependency completed, default=${probe.readAfterEvaluation}.`;

  expect(probe.enteredHold, `probe setup failed: B never entered its await. ${detail}`).toBe(true);
  if (browserName === 'webkit') {
    // The recorded defect: the read happens inside the async module's window.
    expect(probe.readInsideWindow, detail).toEqual('undefined');
    expect(probe.facadeReturnedAfterMs, detail).toBeLessThan(probe.holdMs / 2);
  } else {
    expect(probe.readInsideWindow, detail).toEqual('function');
  }
  // Every engine agrees the binding is correct once the dependency completes:
  // the module is fine, only the moment it is observed differs.
  expect(probe.readAfterEvaluation, detail).toEqual('function');
});

/**
 * K0: can the facade be dropped for a direct import of the module that defines
 * the class? The loader currently imports the re-export facade, which WebKit
 * resolves while its async dependency is still evaluating. Three shapes are
 * measured against the same held dependency:
 *
 *   cold      `import(B)` — B defines and exports the class behind its await;
 *             nothing has started B yet.
 *   second    `import(B)` again while B is already evaluating through another
 *             consumer — the product's real situation, where the light island's
 *             chunk has already pulled the shared chunk in.
 *   facade    `import(A)` where A only re-exports B (the shipped loader path).
 *
 * A direct import is only a candidate fix if `second` waits for the dependency
 * and yields the constructor; a cold-only success would leave the loader
 * reading early exactly when another island reached the chunk first.
 */
test('K0: direct import of the defining module versus the re-export facade', async ({
  page,
  browserName,
}) => {
  await page.goto('/combobox');
  const measured = await page.evaluate(async () => {
    const holdMs = 400;
    // One flag per module: a shared flag would let one shape's entry satisfy
    // another shape's wait.
    const makeB = (flagName: string) =>
      URL.createObjectURL(
        new Blob(
          [
            `
          globalThis[${JSON.stringify(flagName)}] = true;
          await new Promise((resolve) => setTimeout(resolve, ${holdMs}));
          var exported = class { static probe = 'B'; };
          export { exported as default };
          `,
          ],
          { type: 'text/javascript' },
        ),
      );

    const waitForHold = async (flagName: string) => {
      const deadline = performance.now() + 2_000;
      while (
        (globalThis as Record<string, unknown>)[flagName] !== true &&
        performance.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return (globalThis as Record<string, unknown>)[flagName] === true;
    };
    const read = async (url: string) => {
      const startedAt = performance.now();
      const namespace = (await import(/* @vite-ignore */ url)) as Record<string, unknown>;
      return {
        elapsedMs: Math.round(performance.now() - startedAt),
        defaultType: typeof namespace.default,
      };
    };

    // cold: first consumer, nothing else has started the module.
    const cold = await read(makeB('__k0Cold'));

    // second: the module is mid-evaluation through another consumer.
    const runningB = makeB('__k0Second');
    const running = read(runningB);
    const secondEntered = await waitForHold('__k0Second');
    const second = await read(runningB);
    await running;

    // facade: the shipped loader path, over the same held shape.
    const facadeB = makeB('__k0Facade');
    const started = read(facadeB);
    const facadeEntered = await waitForHold('__k0Facade');
    const facadeUrl = URL.createObjectURL(
      new Blob(
        [
          `
          import reexported from ${JSON.stringify(facadeB)};
          export { reexported as default };
          `,
        ],
        { type: 'text/javascript' },
      ),
    );
    const facade = await read(facadeUrl);
    await started;

    return { holdMs, cold, second, facade, secondEntered, facadeEntered };
  });

  const summary =
    `held dependency ${measured.holdMs}ms — ` +
    `cold import ${measured.cold.elapsedMs}ms/${measured.cold.defaultType}, ` +
    `second import ${measured.second.elapsedMs}ms/${measured.second.defaultType}, ` +
    `facade import ${measured.facade.elapsedMs}ms/${measured.facade.defaultType}`;
  expect(
    measured.secondEntered && measured.facadeEntered,
    `probe setup failed (secondEntered=${measured.secondEntered}, ` +
      `facadeEntered=${measured.facadeEntered}): ${summary}`,
  ).toBe(true);
  if (browserName === 'webkit') {
    // The recorded behaviour: the first, cold import is spec-ordered, while any
    // import of a module that is already evaluating resolves early — the facade
    // and a direct re-import alike. This is why dropping the facade cannot fix
    // the loader: another consumer always reaches the shared chunk first.
    expect(measured.cold.defaultType, summary).toEqual('function');
    expect(measured.cold.elapsedMs, summary).toBeGreaterThanOrEqual(measured.holdMs / 2);
    expect(measured.second.defaultType, summary).toEqual('undefined');
    expect(measured.facade.defaultType, summary).toEqual('undefined');
  } else {
    // Every shape waits for the dependency and sees the constructor.
    for (const shape of [measured.cold, measured.second, measured.facade]) {
      expect(shape.defaultType, summary).toEqual('function');
      expect(shape.elapsedMs, summary).toBeGreaterThanOrEqual(measured.holdMs / 2);
    }
  }
});
