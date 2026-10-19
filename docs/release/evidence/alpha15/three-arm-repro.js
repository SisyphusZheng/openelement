/**
 * Three-arm regression for docs/release/alpha15-ab-evaluation.md.
 *
 * Re-reads the two new tables (alpha14 → final, mid-line → final) and asserts
 * every cell against the recorded artifacts of the three-arm session.
 *
 * usage: node three-arm-repro.mjs <path-to-evaluation.md>
 */
import { readFileSync } from 'node:fs';

const REPORT =
  process.argv[2] ?? new URL('../../../alpha15-ab-evaluation.md', import.meta.url).pathname;
const R3 = process.env.OE_AB_3ARM;
const R9 = process.env.OE_AB_FINAL;
if (!R3 || !R9) {
  console.error(
    'usage: OE_AB_3ARM=<3arm artifacts dir> OE_AB_FINAL=<d9 sweep artifacts dir> node three-arm-repro.mjs [report.md]',
  );
  process.exit(2);
}
const j = (p) => JSON.parse(readFileSync(p, 'utf8'));
const num = (s) =>
  Number(
    String(s)
      .replace(/[*\u00a0\u202f\s]/g, '')
      .replace('−', '-'),
  );
const lines = readFileSync(REPORT, 'utf8').split('\n');
const cells = (l) =>
  l
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());

const arms = {
  a14: {
    www: j(`${R3}/a14-www-nopagefind.json`),
    wwwIncl: j(`${R3}/raw/a14-www-cold-r1.json`),
    starter: j(`${R3}/raw/a14-starter-build.json`),
  },
  mid: {
    www: j(`${R3}/a-www-nopagefind.json`),
    wwwIncl: j(`${R3}/raw/a-www-cold-r1.json`),
    starter: j(`${R9}/raw/a-starter-build.json`),
  },
  fin: {
    www: j(`${R3}/c-www-nopagefind.json`),
    wwwIncl: j(`${R3}/raw/c-www-cold-r1.json`),
    starter: j(`${R9}/raw/c-starter-build.json`),
  },
};
const sideOf = { a14: 'a14', mid: 'a', fin: 'c' };
const totals = (arm, group) => {
  if (group === 'www (pagefind excluded)') return arms[arm].www.summary.grandTotal;
  if (group === 'www (pagefind included)') return arms[arm].wwwIncl.summary.grandTotal;
  if (group.startsWith('starter')) return arms[arm].starter.summary.grandTotal;
  return j(`${R3}/raw/${sideOf[arm]}-${group}-cold-r1.json`).summary.grandTotal;
};

let checked = 0;
let failed = 0;
const ok = (cond, what, detail) => {
  checked += 1;
  if (!cond) {
    failed += 1;
    console.log(`FAIL ${what}: ${detail}`);
  }
};

// --- table 1: alpha14 → final -------------------------------------------------
let i = lines.findIndex((l) => l.startsWith('| group | A14 raw | Cfinal raw |'));
for (let k = i + 2; k < lines.length && lines[k].startsWith('|'); k += 1) {
  const c = cells(lines[k]);
  const group = c[0].replace(/ \(see note \d\)/, '');
  if (group === 'router-unocss-probe') {
    ok(
      c[1] === 'n/a' && c[5] === 'n/a',
      `§3arm ${group}`,
      `expected n/a raw+gzip, got ${c[1]}/${c[5]}`,
    );
    continue;
  }
  const A = totals('a14', group);
  const C = totals('fin', group);
  const seen = [
    num(c[1]),
    num(c[2]),
    num(c[3]),
    num(c[5]),
    num(c[6]),
    num(c[7]),
    num(c[9]),
    num(c[10]),
  ];
  const exp = [A.raw, C.raw, C.raw - A.raw, A.gzip, C.gzip, C.gzip - A.gzip, A.files, C.files];
  ok(
    exp.every((v, x) => v === seen[x]),
    `§3arm a14→final ${group}`,
    `report ${seen.join(',')} vs artifacts ${exp.join(',')}`,
  );
}

// --- table 2: mid → final -----------------------------------------------------
i = lines.findIndex((l) => l.startsWith('| group | mid raw | Cfinal raw |'));
for (let k = i + 2; k < lines.length && lines[k].startsWith('|'); k += 1) {
  const c = cells(lines[k]);
  const group = c[0].replace(/ \(see note \d\)/, '');
  const A = totals('mid', group);
  const C = totals('fin', group);
  const seen = [num(c[1]), num(c[2]), num(c[3]), num(c[5]), num(c[6]), num(c[7])];
  const exp = [A.raw, C.raw, C.raw - A.raw, A.gzip, C.gzip, C.gzip - A.gzip];
  ok(
    exp.every((v, x) => v === seen[x]),
    `§3arm mid→final ${group}`,
    `report ${seen.join(',')} vs artifacts ${exp.join(',')}`,
  );
}

// --- class split + closure tables --------------------------------------------
i = lines.findIndex((l) =>
  l.startsWith('| arm | client JS raw | server-only raw | HTML raw | CSS raw |'),
);
for (let k = i + 2; k < lines.length && lines[k].startsWith('|'); k += 1) {
  const c = cells(lines[k]);
  const arm = { A14: 'a14', mid: 'mid', final: 'fin' }[c[0]];
  const s = arms[arm].www.summary;
  const seen = [num(c[1]), num(c[2]), num(c[3]), num(c[4]), num(c[5])];
  const exp = [
    s.clientJsTotal.raw,
    s.serverOnlyTotal.raw,
    s.htmlTotal.raw,
    s.cssTotal.raw,
    s.grandTotal.files,
  ];
  ok(
    exp.every((v, x) => v === seen[x]),
    `§3arm class ${c[0]}`,
    `report ${seen.join(',')} vs artifacts ${exp.join(',')}`,
  );
}

i = lines.findIndex((l) =>
  l.startsWith('| arm | stylesheet links | module scripts | modulepreload | client assets |'),
);
for (let k = i + 2; k < lines.length && lines[k].startsWith('|'); k += 1) {
  const c = cells(lines[k]);
  const arm = { A14: 'a14', mid: 'mid', final: 'fin' }[c[0]];
  const cl = arms[arm].www.closure;
  const seen = [num(c[1]), num(c[2]), num(c[3]), num(c[4]), num(c[5])];
  const exp = [
    cl.stylesheetLinkTotal,
    cl.moduleScriptTotal,
    cl.modulePreloadTotal,
    cl.clientManifestKeys,
    Object.keys(cl.islandManifestEntries).length,
  ];
  ok(
    exp.every((v, x) => v === seen[x]),
    `§3arm closure ${c[0]}`,
    `report ${seen.join(',')} vs artifacts ${exp.join(',')}`,
  );
}

console.log(`THREE-ARM↔ARTIFACT: ${checked} assertions, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
