const playwrightSpecifier = process.env.OE_PLAYWRIGHT_MODULE ?? 'playwright';
const playwrightModule = await import(playwrightSpecifier);
const { chromium } = playwrightModule.default ?? playwrightModule;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
const result = await page.evaluate(() => {
  // Build a ~10k-element composed tree: 100 light-DOM hosts, each with an open
  // shadow root holding 50 nodes, plus 5k light nodes. One pending tag, no host.
  const root = document.getElementById('root');
  for (let i = 0; i < 100; i++) {
    const host = document.createElement('div');
    host.className = 'host-' + i;
    root.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    for (let j = 0; j < 50; j++) {
      const n = document.createElement(j % 5 === 0 ? 'span' : 'div');
      n.textContent = 'node-' + i + '-' + j;
      shadow.appendChild(n);
    }
  }
  for (let i = 0; i < 5000; i++) {
    const n = document.createElement('p');
    n.textContent = 'light-' + i;
    root.appendChild(n);
  }
  // Replica of production collectHosts (same selector-list + shadowRoot descent).
  const tags = ['x-pending-tag'];
  const collectHosts = (scope, tags) => {
    const found = [];
    if (tags.length === 0) return found;
    const selector = tags.join(',');
    const pending = new Set(tags);
    const visit = (node) => {
      if (pending.size === 0) return;
      const hits = node.querySelectorAll(selector);
      for (let i = 0; i < hits.length; i++) {
        const name = hits[i].localName;
        if (pending.delete(name)) found.push(name);
      }
      if (pending.size === 0) return;
      const all = node.querySelectorAll('*');
      for (let j = 0; j < all.length; j++) {
        const shadow = all[j].shadowRoot;
        if (shadow) visit(shadow);
      }
    };
    visit(scope);
    return tags.filter((tag) => found.indexOf(tag) !== -1);
  };
  const times = [];
  for (let k = 0; k < 21; k++) {
    const t0 = performance.now();
    const hits = collectHosts(root, tags);
    const t1 = performance.now();
    if (hits.length !== 0) throw new Error('unexpected host');
    times.push(t1 - t0);
  }
  const measured = times.slice(1).sort((a, b) => a - b);
  const pick = (p) =>
    measured[Math.min(measured.length - 1, Math.floor(p * (measured.length - 1)))];
  const elements = root.querySelectorAll('*').length + 100 * 50;
  return {
    elements,
    singleWalkP50Ms: pick(0.5),
    singleWalkP95Ms: pick(0.95),
    worstMs: measured[measured.length - 1],
    eighteenWalkUpperBoundMs: pick(0.95) * 18,
  };
});
console.log(JSON.stringify(result));
await browser.close();
