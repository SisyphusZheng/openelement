/**
 * UI behaviour matrix (alpha15 Stage 2) — the components the Site renders,
 * measured on the SERVER-RENDERED build in real engines.
 *
 * Site coverage: `open-button` and `open-code-block` (the contributing page,
 * plus the home page's code blocks), and `open-theme-toggle` (the layout
 * chrome of every page). `open-input`, `open-dialog` and `open-dropdown` are
 * not rendered by the Site; their matrix rows are exercised where they do
 * render — the packed appliance's ui-lab (tools/release/consumer-packaged-ui-app.ts).
 *
 * What this spec adds over the existing suites: real keyboard focus rings
 * (never simulated `:focus-visible`), the disabled and aria-disabled states of
 * the button's two forms, the copy control's success/failure feedback after a
 * real click, every declared `::part`, the shipped colour pairs against WCAG
 * AA, forced-colors behaviour where the engine can emulate it, and the
 * no-JavaScript path.
 */
import { expect, test } from '@playwright/test';

const PAGE = '/contributing';

/**
 * The contributing page's content renders inside the page component's own
 * shadow tree, so plain `document.querySelector` cannot see its components.
 * This walks every open shadow root, the way a user agent renders the tree.
 */
const DEEP_QUERY = `((selector) => {
  const found = [];
  const walk = (root) => {
    for (const element of root.querySelectorAll('*')) {
      if (element.matches(selector)) found.push(element);
      if (element.shadowRoot) walk(element.shadowRoot);
    }
  };
  walk(document);
  return found;
})`;

/** The deepest focused element, through every open shadow root. */
function deepActive(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    let element: Element | null = document.activeElement;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
    if (!element) return null;
    const style = getComputedStyle(element);
    return {
      tag: element.tagName.toLowerCase(),
      part: element.getAttribute('part'),
      text: (element.textContent ?? '').trim().slice(0, 24),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      outlineOffset: style.outlineOffset,
    };
  });
}

/** Press Tab until `matches` accepts the deep active element (real keyboard). */
async function tabTo(
  page: import('@playwright/test').Page,
  matches: (active: { tag: string; part: string | null; text: string }) => boolean,
  maxPresses = 80,
) {
  for (let i = 0; i < maxPresses; i += 1) {
    await page.keyboard.press('Tab');
    const active = await deepActive(page);
    if (active && matches(active)) return active;
  }
  throw new Error(`no focusable element matched within ${maxPresses} Tab presses`);
}

/** WCAG 2.x contrast of an element's own colour over its composited backdrop. */
const measuredContrast = (element: Element): number => {
  const toRgb = (value: string): [number, number, number, number] | null => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { colorSpace: 'srgb' });
    if (!context) return null;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const { data } = context.getImageData(0, 0, 1, 1);
    return [data[0] / 255, data[1] / 255, data[2] / 255, data[3] / 255];
  };
  const over = (
    front: [number, number, number, number],
    back: [number, number, number, number],
  ): [number, number, number, number] => {
    const alpha = front[3] + back[3] * (1 - front[3]);
    if (alpha === 0) return [1, 1, 1, 1];
    const channel = (index: number) =>
      (front[index] * front[3] + back[index] * back[3] * (1 - front[3])) / alpha;
    return [channel(0), channel(1), channel(2), alpha];
  };
  const backdrop = (start: Element): [number, number, number, number] => {
    let layer: [number, number, number, number] = [1, 1, 1, 1];
    const stack: [number, number, number, number][] = [];
    let node: Element | null = start;
    while (node) {
      const rgb = toRgb(getComputedStyle(node).backgroundColor);
      if (rgb && rgb[3] > 0) {
        stack.push(rgb);
        if (rgb[3] >= 1) break;
      }
      node = node.parentElement;
    }
    for (const rgb of stack.reverse()) layer = over(rgb, layer);
    return layer;
  };
  const luminance = ([r, g, b]: [number, number, number, number]): number => {
    const linear = [r, g, b].map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const style = getComputedStyle(element);
  const front = toRgb(style.color) ?? [0, 0, 0, 1];
  const composited = over(front, backdrop(element));
  const a = luminance(composited);
  const b = luminance(backdrop(element));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

test.describe('focus-visible rings on a real keyboard path', () => {
  // WebKit's default keyboard navigation only stops at elements it considers
  // keyboard-reachable (measured on this build: Tab reaches the code block's
  // `pre[tabindex=0]` and the body, never the links or buttons the other two
  // engines reach), so the real-Tab rows are asserted where the engine has a
  // real tab path and recorded as not-measurable here.
  test.skip(
    ({ browserName }) => browserName === 'webkit',
    'WebKit does not tab to links or buttons without the OS-level keyboard-navigation preference',
  );

  test('the button control takes a real Tab ring that is not clipped', async ({ page }) => {
    await page.goto(PAGE);
    const active = await tabTo(page, (a) => a.part === 'control');
    expect(active.outlineStyle, 'the ring is painted').toBe('solid');
    expect(active.outlineWidth).toBe('2px');
    expect(active.outlineColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(active.outlineOffset).toBe('3px');
    const box = await page.locator('open-button [part=control]').first().boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    const viewport = page.viewportSize()!;
    expect(box!.x, 'the focused control is inside the viewport').toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  });

  test('the theme toggle takes a real Tab ring', async ({ page }) => {
    await page.goto(PAGE);
    const active = await tabTo(page, (a) => a.tag === 'button' && a.part === 'toggle');
    expect(active.outlineStyle, 'the ring is painted').toBe('solid');
    expect(parseFloat(active.outlineWidth)).toBeGreaterThanOrEqual(2);
  });

  test('shift+tab walks back to the previous control', async ({ page }) => {
    await page.goto(PAGE);
    await tabTo(page, (a) => a.part === 'control');
    const first = await deepActive(page);
    await page.keyboard.press('Shift+Tab');
    const back = await deepActive(page);
    expect(back?.part, 'Shift+Tab leaves the control it arrived at').not.toBe(first?.part);
    await page.keyboard.press('Tab');
    const again = await deepActive(page);
    expect(again?.part).toBe(first?.part);
  });
});

test.describe('open-button disabled states', () => {
  test('the native form: disabled attribute, inert pointer, no event', async ({ page }) => {
    await page.goto(PAGE);
    const fired = await page.evaluate(
      ([query]) => {
        const find = eval(query) as (selector: string) => Element[];
        const rendered = find('open-button')[0]!;
        const host = rendered.cloneNode(false) as Element;
        host.removeAttribute('href');
        host.setAttribute('disabled', '');
        host.append('Disabled');
        rendered.after(host);
        return new Promise<number>((resolve) => {
          let count = 0;
          host.addEventListener('open-click', () => {
            count += 1;
          });
          setTimeout(() => resolve(count), 60);
        });
      },
      [DEEP_QUERY],
    );
    expect(fired).toBe(0);
    const control = page.locator('open-button[disabled] button').last();
    await expect(control).toHaveAttribute('disabled', '');
    const style = await control.evaluate((element) => {
      const cs = getComputedStyle(element);
      return { opacity: cs.opacity, pointerEvents: cs.pointerEvents };
    });
    expect(style.opacity, 'the disabled control dims').toBe('0.5');
    expect(style.pointerEvents, 'the disabled control is inert').toBe('none');
  });

  test('the link form: aria-disabled, inert pointer, no navigation', async ({ page }) => {
    await page.goto(PAGE);
    await page.evaluate(
      ([query]) => {
        const find = eval(query) as (selector: string) => Element[];
        const rendered = find('open-button')[0]!;
        const host = rendered.cloneNode(false) as Element;
        host.setAttribute('href', '/roadmap');
        host.setAttribute('disabled', '');
        host.append('Disabled link');
        rendered.after(host);
      },
      [DEEP_QUERY],
    );
    const control = page.locator('open-button[href][disabled] a').last();
    await expect(control).toHaveAttribute('aria-disabled', 'true');
    const style = await control.evaluate((element) => {
      const cs = getComputedStyle(element);
      return { opacity: cs.opacity, pointerEvents: cs.pointerEvents };
    });
    expect(style.opacity).toBe('0.5');
    expect(style.pointerEvents).toBe('none');
  });
});

test.describe('open-theme-toggle', () => {
  test('clicking flips the button state and the resolved theme', async ({ page }) => {
    await page.goto(PAGE);
    // The toggle's handler arrives with its upgrade; without this wait a click
    // can land on a still-inert server-rendered button.
    await page.waitForFunction(() => customElements.get('open-theme-toggle') !== undefined);
    const toggle = page.locator('open-theme-toggle button[part=toggle]').first();
    const before = await toggle.getAttribute('data-theme');
    const themeBefore = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    );
    await toggle.click();
    await expect
      .poll(() => toggle.getAttribute('data-theme'), { timeout: 10_000 })
      .not.toBe(before);
    const themeAfter = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    );
    expect(themeAfter).not.toBe(themeBefore);
    expect(await toggle.getAttribute('data-theme')).toBe(themeAfter);
  });

  test('the system preference decides the first paint', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(PAGE);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(
      'dark',
    );
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(PAGE);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(
      'light',
    );
  });
});

test.describe('open-code-block copy control', () => {
  test('a real click copies and reports what the clipboard did', async ({ page, context }) => {
    // Chromium takes the permission grant; Firefox and WebKit reject the
    // permission names, so the assertion below follows what the platform
    // actually did rather than assuming a granted clipboard.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
    await page.goto(PAGE);
    const button = page.locator('open-code-block .copy-btn').first();
    await expect(button).toHaveText('Copy');
    const source = await page.evaluate(
      ([query]) => {
        const find = eval(query) as (selector: string) => Element[];
        return (find('open-code-block')[0] as HTMLElement | undefined)?.textContent ?? '';
      },
      [DEEP_QUERY],
    );
    const canWrite = await page.evaluate(() =>
      navigator.clipboard
        .writeText('probe')
        .then(() => true)
        .catch(() => false),
    );
    await button.click();
    await expect.poll(() => button.textContent(), { timeout: 3000 }).not.toBe('Copy');
    const label = (await button.textContent())!.trim();
    if (canWrite) {
      expect(label, 'the control reports the copy that happened').toBe('Copied!');
      const clipboard = await page
        .evaluate(() => navigator.clipboard.readText().catch(() => null))
        .catch(() => null);
      if (clipboard !== null) expect(clipboard).toBe(source);
    } else {
      expect(label, 'the control reports the copy that could not happen').toBe('Failed');
    }
    // The feedback is transient: the label returns to the idle one.
    await expect(button).toHaveText('Copy', { timeout: 5000 });
  });

  test('a real click reports the failure when the write is refused', async ({ page }) => {
    await page.goto(PAGE);
    // The failure is induced in the page, not in the engine: the platform
    // clipboard is replaced by one whose write always rejects, so the
    // component's failure path is exercised deterministically in every engine
    // while the control that is clicked stays the real one.
    await page.evaluate(() => {
      const walk = (root: Document | ShadowRoot): Element | null => {
        for (const element of root.querySelectorAll('*')) {
          if (element.tagName === 'OPEN-CODE-BLOCK') return element;
          if (element.shadowRoot) {
            const inner = walk(element.shadowRoot);
            if (inner) return inner;
          }
        }
        return null;
      };
      const block = walk(document)!;
      Object.defineProperty(block.shadowRoot!, 'host', { value: block });
      const clipboard = block.shadowRoot!.querySelector('button')!;
      // The component reads `navigator.clipboard` at click time.
      Object.defineProperty(Navigator.prototype, 'clipboard', {
        configurable: true,
        get() {
          return {
            writeText: () => Promise.reject(new Error('denied by the probe')),
          };
        },
      });
      void clipboard;
    });
    const button = page.locator('open-code-block .copy-btn').first();
    await button.click();
    await expect.poll(() => button.textContent(), { timeout: 3000 }).toBe('Failed');
    await expect(button).toHaveText('Copy', { timeout: 5000 });
  });
});

test.describe('declared ::part surface', () => {
  test('every part the components declare is reachable from the consumer', async ({ page }) => {
    await page.goto(PAGE);
    // The components render inside the page component's shadow tree, and a
    // `::part()` rule only reaches the parts of hosts its own tree scope can
    // see — so the consumer rule is declared where the hosts are: the page's
    // shadow root.
    const reached = await page.evaluate(
      async ([query]) => {
        const find = eval(query) as (selector: string) => Element[];
        const button = find('open-button')[0]!;
        const toggle = find('open-theme-toggle')[0]!;
        const codeBlock = find('open-code-block')[0]!;

        // A `::part()` rule only reaches the parts of hosts its own tree scope
        // can see, and these hosts sit in different trees (the page component's
        // shadow root, and wherever the layout renders the toggle). So the rule
        // set is written into every root along each host's ancestor chain.
        const rootsOf = (element: Element): (Document | ShadowRoot)[] => {
          const roots: (Document | ShadowRoot)[] = [];
          let node: Element | null = element;
          while (node) {
            const root = node.getRootNode() as Document | ShadowRoot;
            roots.push(root);
            node = root instanceof ShadowRoot ? root.host : null;
          }
          return roots;
        };
        // `transition: none` is part of the probe: the components transition
        // `all`, so a computed read taken while the injected value animates in
        // reports the pre-injection value (measured: opacity read 1 while the
        // rule was already taking effect).
        const text = [
          'open-button::part(control) { outline-color: rgb(1, 2, 3) !important; transition: none !important; }',
          'open-theme-toggle::part(toggle) { outline-color: rgb(1, 2, 3) !important; transition: none !important; }',
          'open-theme-toggle::part(icon-sun) { outline-color: rgb(1, 2, 3) !important; }',
          'open-theme-toggle::part(icon-moon) { outline-color: rgb(1, 2, 3) !important; }',
          'open-code-block::part(copy) { outline-color: rgb(1, 2, 3) !important; transition: none !important; }',
        ].join('\n');
        for (const host of [button, toggle, codeBlock]) {
          for (const root of rootsOf(host)) {
            const style = document.createElement('style');
            style.textContent = text;
            (root instanceof Document ? root.head : root).appendChild(style);
          }
        }

        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
        const outlineOf = (element: Element | null | undefined) =>
          element ? getComputedStyle(element).outlineColor : 'absent';
        return {
          shadowScoped: button.getRootNode() instanceof ShadowRoot,
          control: outlineOf(button.shadowRoot?.querySelector('[part=control]')),
          toggle: outlineOf(toggle.shadowRoot?.querySelector('[part=toggle]')),
          iconSun: outlineOf(toggle.shadowRoot?.querySelector('[part=icon-sun]')),
          iconMoon: outlineOf(toggle.shadowRoot?.querySelector('[part=icon-moon]')),
          copy: outlineOf(codeBlock.shadowRoot?.querySelector('[part=copy]')),
        };
      },
      [DEEP_QUERY],
    );
    expect(reached.shadowScoped).toBe(true);
    for (const [part, color] of Object.entries(reached)) {
      if (part === 'shadowScoped') continue;
      expect(color, `::part(${part}) is reachable`).toBe('rgb(1, 2, 3)');
    }
  });
});

test.describe('shipped colour pairs', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`${theme}: the components' text pairs clear WCAG AA`, async ({ page }) => {
      await page.goto(PAGE);
      await page.evaluate((value) => {
        document.documentElement.setAttribute('data-theme', value);
      }, theme);
      const ratios = await page.evaluate(
        ([source, query]) => {
          // eslint-disable-next-line no-eval
          const measure = eval(`(${source})`) as (element: Element) => number;
          const find = eval(query) as (selector: string) => Element[];
          const button = find('open-button')[0]!;
          const codeBlock = find('open-code-block')[0]!;
          const toggle = find('open-theme-toggle')[0]!;
          return {
            buttonLabel: measure(button.shadowRoot!.querySelector('[part=control]')!),
            copyLabel: measure(codeBlock.shadowRoot!.querySelector('.copy-btn')!),
            codeSurface: measure(codeBlock.shadowRoot!.querySelector('pre') ?? codeBlock),
            toggleLabel: measure(toggle.shadowRoot!.querySelector('[part=toggle]')!),
          };
        },
        [measuredContrast.toString(), DEEP_QUERY],
      );
      for (const [pair, ratio] of Object.entries(ratios)) {
        expect(ratio, `${theme} ${pair} contrast`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

test.describe('forced colours', () => {
  test('the control maps onto system colours where the engine can emulate', async ({ page }) => {
    await page.goto(PAGE);
    const authored = await page.evaluate(
      ([query]) => {
        const find = eval(query) as (selector: string) => Element[];
        const control = find('open-button')[0]!.shadowRoot!.querySelector('[part=control]')!;
        return getComputedStyle(control).color;
      },
      [DEEP_QUERY],
    );
    await page.emulateMedia({ forcedColors: 'active' });
    // Support is probed by effect: some engines accept the emulation call and
    // report the media query as active yet resolve no system colour.
    const emulated = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'rgb(7, 8, 9)';
      document.documentElement.appendChild(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return matchMedia('(forced-colors: active)').matches && value !== 'rgb(7, 8, 9)';
    });
    test.skip(
      !emulated,
      'this engine does not resolve system colours under forced-colors emulation',
    );
    const forced = await page.evaluate(
      ([query]) => {
        const find = eval(query) as (selector: string) => Element[];
        const resolve = (systemColour: string): string => {
          const probe = document.createElement('span');
          probe.style.color = systemColour;
          document.documentElement.appendChild(probe);
          const value = getComputedStyle(probe).color;
          probe.remove();
          return value;
        };
        const control = find('open-button')[0]!.shadowRoot!.querySelector('[part=control]')!;
        return {
          color: getComputedStyle(control).color,
          system: ['ButtonText', 'CanvasText', 'Canvas', 'Highlight', 'LinkText', 'GrayText'].map(
            resolve,
          ),
        };
      },
      [DEEP_QUERY],
    );
    // The UA owns hue in this mode: the authored role colour must be gone and
    // the ink must be one of the system colours the roles re-seat on.
    expect(forced.color).not.toBe(authored);
    expect(forced.system, `${forced.color} is a system colour`).toContain(forced.color);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the server-rendered components keep their styling', async ({ page }) => {
    await page.goto(PAGE);
    const measured = await page.evaluate(
      ([query]) => {
        const find = eval(query) as (selector: string) => Element[];
        const control = find('open-button')[0]!.shadowRoot!.querySelector('[part=control]')!;
        const copy = find('open-code-block')[0]!.shadowRoot!.querySelector('[part=copy]')!;
        const toggle = find('open-theme-toggle')[0]!.shadowRoot!.querySelector('[part=toggle]')!;
        const read = (element: Element) => {
          const cs = getComputedStyle(element);
          return {
            display: cs.display,
            radius: cs.borderRadius,
            padding: cs.padding,
            position: cs.position,
          };
        };
        return { control: read(control), copy: read(copy), toggle: read(toggle) };
      },
      [DEEP_QUERY],
    );
    expect(measured.control.display).toBe('inline-flex');
    expect(measured.control.padding).not.toBe('0px');
    expect(measured.control.radius).not.toBe('0px');
    expect(measured.copy.position).toBe('absolute');
    expect(measured.toggle.display).not.toBe('none');
  });
});
