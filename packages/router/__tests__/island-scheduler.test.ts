/**
 * Unit tests for the real island-scheduler module (#610) — the code the
 * generated client entry inlines verbatim. Covers the #605 open:ready
 * contract (every non-empty strategy bucket fires) and the #606 deep,
 * shadow-root-aware visible scheduling.
 */
import { expect, test } from 'vitest';
import { createIslandScheduler } from '../src/vite/internal/ssg/island-scheduler.ts';

type Win = Window & typeof globalThis;

interface ReadyEvent {
  strategy: string;
  islands: readonly string[];
}

/** Minimal fake element tree with optional shadow roots (for queryAllDeep). */
class FakeElement {
  tagName: string;
  children: FakeElement[] = [];
  shadowRoot: FakeElement | null = null;
  constructor(tagName: string) {
    this.tagName = tagName;
  }
  querySelectorAll(selector: string): FakeElement[] {
    const out: FakeElement[] = [];
    const walk = (el: FakeElement): void => {
      for (const child of el.children) {
        if (selector === '*' || child.tagName.toLowerCase() === selector.toLowerCase()) {
          out.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return out;
  }
}

function makeDoc(root: FakeElement, readyEvents: ReadyEvent[]) {
  return {
    readyState: 'complete',
    addEventListener: () => {},
    dispatchEvent: (event: { type: string; detail: ReadyEvent }) => {
      if (event.type === 'open:ready') readyEvents.push(event.detail);
      return true;
    },
    querySelectorAll: (selector: string) => root.querySelectorAll(selector),
  } as unknown as Document;
}

function makeWin(overrides: Partial<Record<string, unknown>> = {}): Win {
  return {
    setTimeout: (fn: () => void) => fn(),
    CustomEvent: class {
      type: string;
      detail: unknown;
      constructor(type: string, init: { detail: unknown }) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    ...overrides,
  } as unknown as Win;
}

function mapWith(tags: string[]): Record<string, () => Promise<unknown>> {
  const map: Record<string, () => Promise<unknown>> = {};
  for (const tag of tags) map[tag] = () => Promise.resolve();
  return map;
}

/**
 * A fake document tree carrying one host element per named island tag — the
 * page scope the scheduler's activation decision reads (B2). Nesting a tag
 * inside another element's shadow root exercises the deep query (#562).
 */
function treeWithTags(...tags: string[]): FakeElement {
  const body = new FakeElement('body');
  for (const tag of tags) body.children.push(new FakeElement(tag));
  return body;
}

/** The same tree with every host inside a child's shadow root. */
function treeWithShadowTags(...tags: string[]): FakeElement {
  const body = new FakeElement('body');
  const host = new FakeElement('x-page');
  host.shadowRoot = new FakeElement('shadow');
  for (const tag of tags) host.shadowRoot.children.push(new FakeElement(tag));
  body.children.push(host);
  return body;
}

const STRATEGIES = (
  overrides: Partial<{
    load: string[];
    idle: string[];
    visible: string[];
    media: string[];
    only: string[];
  }> = {},
) => ({
  load: overrides.load ?? [],
  idle: overrides.idle ?? [],
  visible: overrides.visible ?? [],
  media: overrides.media ?? [],
  only: overrides.only ?? [],
});

// B2 DEVIATION FROM THE LETTER OF #605, pinned deliberately.
//
// #605's letter, and this test's original name, was "EVERY non-empty strategy
// bucket fires open:ready as its loads are initiated" — the detail carried the
// DECLARED tag list and the event fired whenever the bucket was non-empty,
// whether or not this page could activate anything. B2's page-scope gate makes
// an activation decision a page-scope decision (an island a page has no host
// for is never fetched, the runtime form of the per-page island manifest), and
// that has the logical consequence this test names: a declared-but-unhosted
// bucket is now SILENT, and `detail.islands` is the ACTIVATED subset.
//
// This is a behaviour change for any consumer counting open:ready events per
// page rather than per activation, so it is pinned here as a change rather
// than left as a side effect of the gate. Keep it unless the owner rules
// otherwise — do not "restore" the declared-list event.
test('#605/B2 deviation: a declared bucket with no host is silent, and detail.islands is the activated subset', () => {
  // Side by side, the letter and the current behaviour: the declared lists are
  // all non-empty (so #605's letter fires four events), and the page hosts one
  // tag, so exactly one event fires and it names only what activated.
  const readyEvents: ReadyEvent[] = [];
  const loaded: string[] = [];
  let idleCallback: (() => void) | null = null;
  createIslandScheduler({
    log: { warn: () => {} },
    idleFallbackTimeoutMs: 25,
    win: makeWin({
      requestIdleCallback: (fn: () => void) => (idleCallback = fn),
      // No IntersectionObserver: `visible` resolves synchronously, so the
      // bucket's decision is observable without a fake observer.
    }),
    doc: makeDoc(treeWithTags('x-load'), readyEvents),
    map: {
      'x-load': () => {
        loaded.push('x-load');
        return Promise.resolve();
      },
      'x-only': () => {
        loaded.push('x-only');
        return Promise.resolve();
      },
      'x-idle': () => {
        loaded.push('x-idle');
        return Promise.resolve();
      },
      'x-visible': () => {
        loaded.push('x-visible');
        return Promise.resolve();
      },
    },
    strategies: STRATEGIES({
      load: ['x-load', 'x-only'],
      only: ['x-only'],
      idle: ['x-idle'],
      visible: ['x-visible'],
    }),
    onIslandLoaded: null,
  });
  idleCallback!();
  // Only the hosted tag ever loaded, and only its bucket spoke.
  expect(loaded).toEqual(['x-load']);
  expect(readyEvents).toEqual([{ strategy: 'load', islands: ['x-load'] }]);
  // The unhosted declarations were NOT consumed, so a host appearing later
  // (a media-query change, a streamed-in fragment) can still activate them —
  // this is a deferral, never a drop.
  expect(readyEvents.every((event) => event.islands.every((tag) => tag === 'x-load'))).toEqual(
    true,
  );
});

test('#605 load and only buckets fire open:ready immediately for the tags this page hosts', async () => {
  const readyEvents: ReadyEvent[] = [];
  const scheduler = createIslandScheduler({
    log: { warn: () => {} },
    idleFallbackTimeoutMs: 25,
    win: makeWin(),
    doc: makeDoc(treeWithTags('x-load', 'x-only'), readyEvents),
    map: mapWith(['x-load', 'x-only']),
    strategies: STRATEGIES({ load: ['x-load'], only: ['x-only'] }),
    onIslandLoaded: null,
  });
  expect(typeof scheduler.observeVisible).toEqual('function');
  expect(readyEvents).toEqual([
    { strategy: 'load', islands: ['x-load'] },
    { strategy: 'only', islands: ['x-only'] },
  ]);
  // The import factories were invoked (entries consumed).
  await Promise.resolve();
});

test('#605 idle bucket fires open:ready when idle time arrives', () => {
  const readyEvents: ReadyEvent[] = [];
  let idleCallback: (() => void) | null = null;
  createIslandScheduler({
    log: { warn: () => {} },
    idleFallbackTimeoutMs: 25,
    win: makeWin({ requestIdleCallback: (fn: () => void) => (idleCallback = fn) }),
    doc: makeDoc(treeWithTags('x-idle'), readyEvents),
    map: mapWith(['x-idle']),
    strategies: STRATEGIES({ idle: ['x-idle'] }),
    onIslandLoaded: null,
  });
  // Not yet: idle deferral means no import and no event so far.
  expect(readyEvents).toEqual([]);
  idleCallback!();
  expect(readyEvents).toEqual([{ strategy: 'idle', islands: ['x-idle'] }]);
});

test('#605 idle fallback defers through setTimeout with the injected policy timeout', () => {
  const readyEvents: ReadyEvent[] = [];
  const scheduled: [() => void, number][] = [];
  createIslandScheduler({
    log: { warn: () => {} },
    idleFallbackTimeoutMs: 25,
    // Neither requestIdleCallback nor requestAnimationFrame exists: the
    // injected element policy constant (IDLE_FALLBACK_TIMEOUT_MS) is the delay.
    win: makeWin({
      setTimeout: (fn: () => void, delay?: number) => {
        scheduled.push([fn, delay ?? 0]);
        return 0;
      },
    }),
    doc: makeDoc(treeWithTags('x-idle'), readyEvents),
    map: mapWith(['x-idle']),
    strategies: STRATEGIES({ idle: ['x-idle'] }),
    onIslandLoaded: null,
  });
  expect(readyEvents).toEqual([]);
  expect(scheduled.length).toEqual(1);
  expect(scheduled[0][1]).toEqual(25);
  scheduled[0][0]();
  expect(readyEvents).toEqual([{ strategy: 'idle', islands: ['x-idle'] }]);
});

test('#605 empty buckets never fire open:ready', () => {
  const readyEvents: ReadyEvent[] = [];
  createIslandScheduler({
    log: { warn: () => {} },
    idleFallbackTimeoutMs: 25,
    win: makeWin(),
    doc: makeDoc(new FakeElement('body'), readyEvents),
    map: {},
    strategies: STRATEGIES(),
    onIslandLoaded: null,
  });
  expect(readyEvents).toEqual([]);
});

test('#606 visible scheduling finds islands inside shadow roots (deep query)', () => {
  const readyEvents: ReadyEvent[] = [];
  const observed: FakeElement[] = [];
  class FakeIO {
    static instances: FakeIO[] = [];
    cb: (entries: { isIntersecting: boolean }[]) => void;
    constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
      this.cb = cb;
      FakeIO.instances.push(this);
    }
    observe(el: FakeElement): void {
      observed.push(el);
    }
    disconnect(): void {}
    intersect(): void {
      this.cb([{ isIntersecting: true }]);
    }
  }

  // <body> -> <x-page shadow> -> <x-vis>: a light-DOM querySelectorAll never
  // sees x-vis (#562); the scheduler must descend into shadow roots.
  const page = new FakeElement('body');
  const host = new FakeElement('x-page');
  const shadow = new FakeElement('shadow');
  const island = new FakeElement('x-vis');
  shadow.children.push(island);
  host.shadowRoot = shadow;
  page.children.push(host);

  let loaded = 0;
  createIslandScheduler({
    log: { warn: () => {} },
    idleFallbackTimeoutMs: 25,
    win: makeWin({ IntersectionObserver: FakeIO }),
    doc: makeDoc(page, readyEvents),
    map: {
      'x-vis': () => {
        loaded++;
        return Promise.resolve();
      },
    },
    strategies: STRATEGIES({ visible: ['x-vis'] }),
    onIslandLoaded: null,
  });
  expect(observed).toEqual([island]);
  expect(loaded).toEqual(0);
  FakeIO.instances[0].intersect();
  expect(loaded).toEqual(1);
  expect(readyEvents).toEqual([{ strategy: 'visible', islands: ['x-vis'] }]);
});

test('#606 visible without IntersectionObserver loads every visible tag', () => {
  const readyEvents: ReadyEvent[] = [];
  const loaded: string[] = [];
  createIslandScheduler({
    log: { warn: () => {} },
    idleFallbackTimeoutMs: 25,
    win: makeWin(), // no IntersectionObserver
    doc: makeDoc(treeWithTags('x-vis'), readyEvents),
    map: {
      'x-vis': () => {
        loaded.push('x-vis');
        return Promise.resolve();
      },
    },
    strategies: STRATEGIES({ visible: ['x-vis'] }),
    onIslandLoaded: null,
  });
  expect(loaded).toEqual(['x-vis']);
  expect(readyEvents).toEqual([{ strategy: 'visible', islands: ['x-vis'] }]);
});

test('#584 onIslandLoaded runs (macrotask-deferred) after an island module resolves', async () => {
  const calls: string[] = [];
  const timeouts: (() => void)[] = [];
  createIslandScheduler({
    log: { warn: () => {} },
    idleFallbackTimeoutMs: 25,
    win: makeWin({ setTimeout: (fn: () => void) => timeouts.push(fn) }),
    doc: makeDoc(treeWithTags('x-load'), []),
    map: {
      'x-load': () =>
        Promise.resolve().then(() => {
          calls.push('import');
        }),
    },
    strategies: STRATEGIES({ load: ['x-load'] }),
    onIslandLoaded: () => calls.push('rescan'),
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(calls).toEqual(['import']);
  expect(timeouts.length).toEqual(1);
  timeouts[0]();
  expect(calls).toEqual(['import', 'rescan']);
});

test('#1039 detached visible island is released and a reinsert gets a fresh observer', () => {
  const readyEvents: ReadyEvent[] = [];
  const observed: FakeElement[] = [];
  const disconnected: FakeIO[] = [];
  class FakeIO {
    static instances: FakeIO[] = [];
    cb: (entries: { isIntersecting: boolean }[]) => void;
    constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
      this.cb = cb;
      FakeIO.instances.push(this);
    }
    observe(el: FakeElement): void {
      observed.push(el);
    }
    disconnect(): void {
      disconnected.push(this);
    }
    intersect(): void {
      this.cb([{ isIntersecting: true }]);
    }
  }

  const page = new FakeElement('body');
  const island = new FakeElement('x-vis') as FakeElement & { isConnected?: boolean };
  page.children.push(island);

  let loaded = 0;
  const scheduler = createIslandScheduler({
    log: { warn: () => {} },
    idleFallbackTimeoutMs: 25,
    win: makeWin({ IntersectionObserver: FakeIO }),
    doc: makeDoc(page, readyEvents),
    map: {
      'x-vis': () => {
        loaded++;
        return Promise.resolve();
      },
    },
    strategies: STRATEGIES({ visible: ['x-vis'] }),
    onIslandLoaded: null,
  });
  expect(observed).toEqual([island]);
  expect(FakeIO.instances.length).toEqual(1);

  // The island leaves the DOM before ever intersecting: its observer can
  // never fire again, so it must be released (not pinned forever).
  island.isConnected = false;
  page.children.length = 0;
  scheduler.observeVisible();
  expect(disconnected.length).toEqual(1);
  expect(FakeIO.instances.length).toEqual(1);

  // Reinserted before intersection: a fresh observer is attached so the
  // island still loads when it scrolls into view.
  island.isConnected = true;
  page.children.push(island);
  scheduler.observeVisible();
  expect(FakeIO.instances.length).toEqual(2);
  expect(observed).toEqual([island, island]);
  FakeIO.instances[1].intersect();
  expect(loaded).toEqual(1);
  expect(readyEvents).toEqual([{ strategy: 'visible', islands: ['x-vis'] }]);
});

// ─── B2 page scope: an island no page host reaches is never fetched ────
//
// The build records the per-page island set; the runtime form of that fact is
// this activation gate. Without it an `idle`/`load`/`only` bucket imported
// EVERY declared island chunk on EVERY page — which also dragged the shared
// element runtime into pages whose island manifest is empty.

test('#1544/B2: a bucket whose tags have no host on this page starts no load and fires no open:ready', async () => {
  const readyEvents: ReadyEvent[] = [];
  const loaded: string[] = [];
  const map: Record<string, () => Promise<unknown>> = {
    'x-load': () => {
      loaded.push('x-load');
      return Promise.resolve();
    },
    'x-idle': () => {
      loaded.push('x-idle');
      return Promise.resolve();
    },
  };
  let idleCallback: (() => void) | null = null;
  createIslandScheduler({
    log: { warn: () => {} },
    idleFallbackTimeoutMs: 25,
    win: makeWin({ requestIdleCallback: (fn: () => void) => (idleCallback = fn) }),
    // A page with NO island host at all — the zero-island page shape.
    doc: makeDoc(treeWithTags(), readyEvents),
    map,
    strategies: STRATEGIES({ load: ['x-load'], idle: ['x-idle'] }),
    onIslandLoaded: null,
  });
  idleCallback!();
  await Promise.resolve();
  expect(loaded).toEqual([]);
  expect(readyEvents).toEqual([]);
  // The factories are still in the map: nothing was consumed, so a host that
  // appears later can still activate the island.
  expect(typeof map['x-load']).toEqual('function');
  expect(typeof map['x-idle']).toEqual('function');
});

// #1544/B2 follow-up (R3 lane): the ready-time scan is not the last word.
// An enhanced response morphs new HTML into the page, so an island host can
// arrive AFTER the initial scan — and a host this page did not carry at ready
// time used to keep its island dead forever (user-visible: an island delivered
// by an enhanced response never became interactive, while the same island
// hydrated normally on a page that declared the host up front). observeVisible()
// is the post-morph rescan path the client runtime already calls (#562); it must
// re-run the eager buckets too.
test('#1544/B2 follow-up: a host arriving after the ready scan activates on the next rescan, exactly once', async () => {
  const readyEvents: ReadyEvent[] = [];
  const loaded: string[] = [];
  const body = treeWithTags(); // zero-island page shape at ready time
  const scheduler = createIslandScheduler({
    log: { warn: () => {} },
    idleFallbackTimeoutMs: 25,
    win: makeWin(),
    doc: makeDoc(body, readyEvents),
    map: {
      'x-late': () => {
        loaded.push('x-late');
        return Promise.resolve();
      },
    },
    strategies: STRATEGIES({ load: ['x-late'] }),
    onIslandLoaded: null,
  });
  // Ready time: no host, so no load and no event (the B2 gate above).
  expect(loaded).toEqual([]);
  expect(readyEvents).toEqual([]);

  // The morph lands: the host is in the tree, and the post-morph rescan runs.
  body.children.push(new FakeElement('x-late'));
  scheduler.observeVisible();
  await Promise.resolve();
  expect(loaded).toEqual(['x-late']);
  expect(readyEvents).toEqual([{ strategy: 'load', islands: ['x-late'] }]);

  // Idempotent: repeated rescans are silent — the activated tag is out of the
  // map, so open:ready stays one event per activation rather than one per scan.
  scheduler.observeVisible();
  scheduler.observeVisible();
  await Promise.resolve();
  expect(loaded).toEqual(['x-late']);
  expect(readyEvents).toEqual([{ strategy: 'load', islands: ['x-late'] }]);
});

test('#1544/B2: a bucket fires open:ready with exactly the tags this page carries', () => {
  const readyEvents: ReadyEvent[] = [];
  const loaded: string[] = [];
  createIslandScheduler({
    log: { warn: () => {} },
    idleFallbackTimeoutMs: 25,
    win: makeWin(),
    // Two declared islands, one host: only the hosted tag activates.
    doc: makeDoc(treeWithTags('x-present'), readyEvents),
    map: {
      'x-present': () => {
        loaded.push('x-present');
        return Promise.resolve();
      },
      'x-absent': () => {
        loaded.push('x-absent');
        return Promise.resolve();
      },
    },
    strategies: STRATEGIES({ load: ['x-present', 'x-absent'] }),
    onIslandLoaded: null,
  });
  expect(loaded).toEqual(['x-present']);
  expect(readyEvents).toEqual([{ strategy: 'load', islands: ['x-present'] }]);
});

test('#1544/B2: the host is found through shadow roots (#562), not only in the light DOM', () => {
  const readyEvents: ReadyEvent[] = [];
  const loaded: string[] = [];
  createIslandScheduler({
    log: { warn: () => {} },
    idleFallbackTimeoutMs: 25,
    win: makeWin(),
    // Islands live inside page-element DSD shadow roots: a document-level
    // querySelectorAll never sees them, so the gate must descend.
    doc: makeDoc(treeWithShadowTags('x-nested'), readyEvents),
    map: {
      'x-nested': () => {
        loaded.push('x-nested');
        return Promise.resolve();
      },
    },
    strategies: STRATEGIES({ load: ['x-nested'] }),
    onIslandLoaded: null,
  });
  expect(loaded).toEqual(['x-nested']);
  expect(readyEvents).toEqual([{ strategy: 'load', islands: ['x-nested'] }]);
});

test('#1544/B2: a media island with no host fires nothing, and a later matching query still cannot start it', () => {
  const readyEvents: ReadyEvent[] = [];
  const loaded: string[] = [];
  const listeners: Array<(event: { matches: boolean }) => void> = [];
  createIslandScheduler({
    log: { warn: () => {} },
    idleFallbackTimeoutMs: 25,
    win: makeWin(),
    doc: makeDoc(treeWithTags('x-other'), readyEvents),
    map: {
      'x-media': () => {
        loaded.push('x-media');
        return Promise.resolve();
      },
    },
    strategies: STRATEGIES({ media: ['x-media'] }),
    mediaQueries: {
      'x-media': {
        matches: false,
        addEventListener: (_type: string, fn: (event: { matches: boolean }) => void) => {
          listeners.push(fn);
        },
      },
    } as unknown as Record<string, MediaQueryList>,
    onIslandLoaded: null,
  });
  expect(listeners.length).toEqual(1);
  listeners[0]({ matches: true });
  expect(loaded).toEqual([]);
  expect(readyEvents).toEqual([]);
});

// ─── F01: the post-morph rescan covers every deferred strategy ─────────
//
// Each strategy's ready-time opportunity is one-shot: load/only run at
// construct, idle runs when the browser first idles, media runs at construct
// or on a match change, visible observes the hosts that exist. A morph can
// deliver the FIRST host for a tag after that opportunity was spent; the map
// entry is the only one-shot guard, so a still-unconsumed factory must be
// re-armed by the post-morph rescan or the island stays dead forever (F01).

type LateStrategy = 'load' | 'only' | 'visible' | 'idle' | 'media';

interface LateHostRow {
  strategy: LateStrategy;
  importsBeforeMorph: number;
  factoryUnconsumedBeforeMorph: boolean;
  idleSchedulesBeforeMorph: number;
  importsAfterRescan: number;
  readyEventsAfterRescan: ReadyEvent[];
  importsAfterSecondRescan: number;
  readyEventsAfterSecondRescan: ReadyEvent[];
}

/** Run the five-strategy "no host → opportunity spent → morph → activate" scenario. */
function runLateHostScenario(strategy: LateStrategy): LateHostRow {
  const tag = 'x-late';
  const readyEvents: ReadyEvent[] = [];
  let imports = 0;
  const body = new FakeElement('body');
  const idleCallbacks: (() => void)[] = [];
  let mediaListener: ((event: { matches: boolean }) => void) | null = null;

  class FakeIO {
    static instances: FakeIO[] = [];
    cb: (entries: { isIntersecting: boolean }[]) => void;
    constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
      this.cb = cb;
      FakeIO.instances.push(this);
    }
    observe(): void {}
    disconnect(): void {}
    intersect(): void {
      this.cb([{ isIntersecting: true }]);
    }
  }

  const win = makeWin({
    requestIdleCallback: (fn: () => void) => {
      idleCallbacks.push(fn);
    },
    ...(strategy === 'visible' ? { IntersectionObserver: FakeIO } : {}),
  });
  const map: Record<string, (() => Promise<unknown>) | null> = {
    [tag]: () => {
      imports += 1;
      return Promise.resolve();
    },
  };
  const strategies =
    strategy === 'load'
      ? STRATEGIES({ load: [tag] })
      : strategy === 'only'
        ? STRATEGIES({ only: [tag] })
        : strategy === 'visible'
          ? STRATEGIES({ visible: [tag] })
          : strategy === 'idle'
            ? STRATEGIES({ idle: [tag] })
            : STRATEGIES({ media: [tag] });
  const scheduler = createIslandScheduler({
    log: { warn: () => {} },
    idleFallbackTimeoutMs: 25,
    win,
    doc: makeDoc(body, readyEvents),
    map,
    strategies,
    ...(strategy === 'media'
      ? {
          mediaQueries: {
            [tag]: {
              matches: true,
              addEventListener: (_type: string, fn: (event: { matches: boolean }) => void) => {
                mediaListener = fn;
              },
            },
          } as unknown as Record<string, MediaQueryList>,
        }
      : {}),
    onIslandLoaded: null,
  });

  // 1. Spend the strategy's initial opportunity while the page has no host.
  if (strategy === 'idle') {
    idleCallbacks[idleCallbacks.length - 1]();
  } else if (strategy === 'visible') {
    // The ready scan found no host, so it observed nothing; nothing to fire.
  }
  const importsBeforeMorph = imports;
  const factoryUnconsumedBeforeMorph = typeof map[tag] === 'function';
  const idleSchedulesBeforeMorph = idleCallbacks.length;

  // 2. The morph inserts the first host, then the post-morph rescan runs.
  body.children.push(new FakeElement(tag));
  scheduler.observeVisible();
  // Resolve whatever the strategy needs to finish its activation step.
  if (strategy === 'idle') idleCallbacks[idleCallbacks.length - 1]();
  if (strategy === 'visible') FakeIO.instances[FakeIO.instances.length - 1].intersect();
  const importsAfterRescan = imports;
  const readyEventsAfterRescan = readyEvents.slice();

  // 3. A second rescan (plus any opportunity it schedules) must stay silent.
  scheduler.observeVisible();
  if (strategy === 'idle' && idleCallbacks.length > idleSchedulesBeforeMorph + 1) {
    idleCallbacks[idleCallbacks.length - 1]();
  }
  if (strategy === 'visible' && FakeIO.instances.length > 1) {
    FakeIO.instances[FakeIO.instances.length - 1].intersect();
  }
  if (strategy === 'media') mediaListener?.({ matches: true });
  return {
    strategy,
    importsBeforeMorph,
    factoryUnconsumedBeforeMorph,
    idleSchedulesBeforeMorph,
    importsAfterRescan,
    readyEventsAfterRescan,
    importsAfterSecondRescan: imports,
    readyEventsAfterSecondRescan: readyEvents.slice(),
  };
}

test('#F01 five-strategy symmetry: a host arriving after the spent opportunity activates on the next rescan, exactly once', () => {
  const rows = (['load', 'only', 'visible', 'idle', 'media'] as const).map(runLateHostScenario);
  for (const row of rows) {
    // The initial opportunity was spent with no host: nothing loaded, no event,
    // and the factory stayed deferred rather than being dropped.
    expect(row.importsBeforeMorph, `${row.strategy}: no import before the host`).toEqual(0);
    expect(row.factoryUnconsumedBeforeMorph, `${row.strategy}: factory left for the retry`).toEqual(
      true,
    );
    // The post-morph rescan activates the island exactly once and names the
    // strategy in open:ready.
    expect(row.importsAfterRescan, `${row.strategy}: one import after the rescan`).toEqual(1);
    expect(row.readyEventsAfterRescan, `${row.strategy}: one ready event`).toEqual([
      { strategy: row.strategy, islands: ['x-late'] },
    ]);
    // Repeated rescans are silent: the consumed map entry is the one-shot guard.
    expect(row.importsAfterSecondRescan, `${row.strategy}: no duplicate import`).toEqual(1);
    expect(row.readyEventsAfterSecondRescan, `${row.strategy}: no duplicate ready event`).toEqual([
      { strategy: row.strategy, islands: ['x-late'] },
    ]);
  }
});

test('#F01 idle: a spent construction attempt is re-armed after a morph (same idle selection) and activates once', () => {
  const readyEvents: ReadyEvent[] = [];
  const body = new FakeElement('body');
  const idleCallbacks: (() => void)[] = [];
  let imports = 0;
  const map: Record<string, (() => Promise<unknown>) | null> = {
    'x-idle': () => {
      imports += 1;
      return Promise.resolve();
    },
  };
  const scheduler = createIslandScheduler({
    log: { warn: () => {} },
    idleFallbackTimeoutMs: 25,
    win: makeWin({ requestIdleCallback: (fn: () => void) => idleCallbacks.push(fn) }),
    doc: makeDoc(body, readyEvents),
    map,
    strategies: STRATEGIES({ idle: ['x-idle'] }),
    onIslandLoaded: null,
  });
  // The construction-time attempt runs with no host and is then spent.
  expect(idleCallbacks.length).toEqual(1);
  idleCallbacks[0]();
  expect(imports).toEqual(0);
  expect(readyEvents).toEqual([]);

  // The morph delivers the first host; the rescan re-arms the idle attempt but
  // never loads synchronously (idle semantics are the browser's decision).
  body.children.push(new FakeElement('x-idle'));
  scheduler.observeVisible();
  expect(idleCallbacks.length).toEqual(2);
  expect(imports).toEqual(0);
  // Repeated rescans share the one pending attempt instead of stacking them.
  scheduler.observeVisible();
  scheduler.observeVisible();
  expect(idleCallbacks.length).toEqual(2);

  idleCallbacks[1]();
  expect(imports).toEqual(1);
  expect(readyEvents).toEqual([{ strategy: 'idle', islands: ['x-idle'] }]);

  // Consumed: no third attempt, no duplicate event.
  scheduler.observeVisible();
  expect(idleCallbacks.length).toEqual(2);
  expect(imports).toEqual(1);
  expect(readyEvents).toEqual([{ strategy: 'idle', islands: ['x-idle'] }]);
});

test('#F01 idle: the re-armed attempt keeps the fallback selection (injected policy timeout)', () => {
  const readyEvents: ReadyEvent[] = [];
  const body = new FakeElement('body');
  const scheduled: [() => void, number][] = [];
  let imports = 0;
  const scheduler = createIslandScheduler({
    log: { warn: () => {} },
    idleFallbackTimeoutMs: 25,
    // Neither requestIdleCallback nor requestAnimationFrame exists.
    win: makeWin({
      setTimeout: (fn: () => void, delay?: number) => {
        scheduled.push([fn, delay ?? 0]);
        return 0;
      },
    }),
    doc: makeDoc(body, readyEvents),
    map: {
      'x-idle': () => {
        imports += 1;
        return Promise.resolve();
      },
    },
    strategies: STRATEGIES({ idle: ['x-idle'] }),
    onIslandLoaded: null,
  });
  expect(scheduled.length).toEqual(1);
  expect(scheduled[0][1]).toEqual(25);
  scheduled[0][0](); // spent with no host
  expect(imports).toEqual(0);

  body.children.push(new FakeElement('x-idle'));
  scheduler.observeVisible();
  expect(scheduled.length).toEqual(2);
  expect(scheduled[1][1]).toEqual(25); // same policy timeout, same selection chain
  scheduled[1][0]();
  expect(imports).toEqual(1);
  expect(readyEvents).toEqual([{ strategy: 'idle', islands: ['x-idle'] }]);
});

function mediaFixture(options: { matches: boolean; hostAtStart: boolean }) {
  const readyEvents: ReadyEvent[] = [];
  const body = options.hostAtStart
    ? treeWithTags('x-media')
    : (new FakeElement('body') as FakeElement);
  let imports = 0;
  let listeners = 0;
  const mediaQueries = {
    'x-media': {
      matches: options.matches,
      addEventListener: (_type: string, _fn: (event: { matches: boolean }) => void) => {
        listeners += 1;
      },
    },
  } as unknown as Record<string, MediaQueryList>;
  const scheduler = createIslandScheduler({
    log: { warn: () => {} },
    idleFallbackTimeoutMs: 25,
    win: makeWin(),
    doc: makeDoc(body, readyEvents),
    map: {
      'x-media': () => {
        imports += 1;
        return Promise.resolve();
      },
    },
    strategies: STRATEGIES({ media: ['x-media'] }),
    mediaQueries,
    onIslandLoaded: null,
  });
  return {
    readyEvents,
    body,
    scheduler,
    mediaQueries,
    listeners: () => listeners,
    imports: () => imports,
  };
}

test('#F01 media: an already-matching query with no host activates on the post-morph rescan, once', () => {
  const fixture = mediaFixture({ matches: true, hostAtStart: false });
  expect(fixture.listeners()).toEqual(1);
  expect(fixture.imports()).toEqual(0);
  expect(fixture.readyEvents).toEqual([]);

  fixture.body.children.push(new FakeElement('x-media'));
  fixture.scheduler.observeVisible();
  expect(fixture.imports()).toEqual(1);
  expect(fixture.readyEvents).toEqual([{ strategy: 'media', islands: ['x-media'] }]);

  // One-shot: rescans and later change events cannot re-import or re-fire.
  fixture.scheduler.observeVisible();
  expect(fixture.imports()).toEqual(1);
  expect(fixture.readyEvents).toEqual([{ strategy: 'media', islands: ['x-media'] }]);
});

test('#F01 media: a non-matching query stays silent on the rescan; its change listener still activates the late host', () => {
  const readyEvents: ReadyEvent[] = [];
  const body = new FakeElement('body');
  const listeners: Array<(event: { matches: boolean }) => void> = [];
  let imports = 0;
  const scheduler = createIslandScheduler({
    log: { warn: () => {} },
    idleFallbackTimeoutMs: 25,
    win: makeWin(),
    doc: makeDoc(body, readyEvents),
    map: {
      'x-media': () => {
        imports += 1;
        return Promise.resolve();
      },
    },
    strategies: STRATEGIES({ media: ['x-media'] }),
    mediaQueries: {
      'x-media': {
        matches: false,
        addEventListener: (_type: string, fn: (event: { matches: boolean }) => void) => {
          listeners.push(fn);
        },
      },
    } as unknown as Record<string, MediaQueryList>,
    onIslandLoaded: null,
  });
  // Host arrives, query still false: the rescan re-reads it and stays silent.
  body.children.push(new FakeElement('x-media'));
  scheduler.observeVisible();
  expect(imports).toEqual(0);
  expect(readyEvents).toEqual([]);
  // The preserved change listener is the recovery path once it matches.
  listeners[0]({ matches: true });
  expect(imports).toEqual(1);
  expect(readyEvents).toEqual([{ strategy: 'media', islands: ['x-media'] }]);
});
