/**
 * Alpha15 R4 — verify the FINAL report's tables against the final-run artifacts.
 * usage: AB_OUT=<d9 sweep artifacts dir> node report-repro-final.mjs <report.md>
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

const REPORT = process.argv[2];
const OUT = process.env.AB_OUT;
if (!REPORT || !OUT) {
  console.error('usage: AB_OUT=<d9 sweep artifacts dir> node report-repro-final.mjs <report.md>');
  process.exit(2);
}
const j = (p) => JSON.parse(readFileSync(p, 'utf8'));
const num = (c) => {
  if (c === undefined) return NaN;
  const t = c
    .replace(/[\s\u00a0\u202f*]/g, '')
    .replace(/\u2212/g, '-')
    .replace(/[^0-9.+\-]/g, '');
  return t === '' || t === '—' ? null : Number(t);
};
const lines = readFileSync(REPORT, 'utf8').split('\n');
const cells = (l) =>
  l
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());

const M = {
  'router-static-only': {
    a: `${OUT}/raw/a-router-static-only-cold-r1.json`,
    c: `${OUT}/raw/c-router-static-only-cold-r1.json`,
  },
  'router-native-framework': {
    a: `${OUT}/raw/a-router-native-framework-cold-r1.json`,
    c: `${OUT}/raw/c-router-native-framework-cold-r1.json`,
  },
  'router-lit-framework': {
    a: `${OUT}/raw/a-router-lit-framework-cold-r1.json`,
    c: `${OUT}/raw/c-router-lit-framework-cold-r1.json`,
  },
  'router-ui-dogfood': {
    a: `${OUT}/raw/a-router-ui-dogfood-cold-r1.json`,
    c: `${OUT}/raw/c-router-ui-dogfood-cold-r1.json`,
  },
  'router-unocss-probe': {
    a: `${OUT}/raw/a-router-unocss-probe-cold-r1.json`,
    c: `${OUT}/raw/c-router-unocss-probe-cold-r1.json`,
  },
  'starter (packed)': {
    a: `${OUT}/raw/a-starter-build.json`,
    c: `${OUT}/raw/c-starter-build.json`,
  },
  'www (pagefind excluded)': {
    a: `${OUT}/a-www-nopagefind.json`,
    c: `${OUT}/c-www-nopagefind.json`,
  },
  'www (pagefind included)': {
    a: `${OUT}/raw/a-www-cold-r1.json`,
    c: `${OUT}/raw/c-www-cold-r1.json`,
  },
};

let checked = 0,
  failed = 0;
const ok = (cond, what, detail) => {
  checked += 1;
  if (!cond) {
    failed += 1;
    console.log(`FAIL ${what}: ${detail}`);
  }
};

// §3.1
let i = lines.findIndex((l) => l.startsWith('| group | A raw | C raw |'));
for (let k = i + 2; k < lines.length && lines[k].startsWith('|'); k += 1) {
  const c = cells(lines[k]);
  const g = c[0].replace(/\*\*/g, '');
  const m = M[g];
  if (!m) {
    ok(false, '§3.1 ' + g, 'no artifact mapping');
    continue;
  }
  const A = j(m.a).summary.grandTotal,
    C = j(m.c).summary.grandTotal;
  // columns: 0 group | 1 A raw | 2 C raw | 3 Δraw | 4 Δraw% | 5 A gz | 6 C gz | 7 Δgz | 8 Δgz% | 9 A br | 10 C br | 11 A files | 12 C files
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
  const exp = [A.raw, C.raw, C.raw - A.raw, A.gzip, C.gzip, C.gzip - A.gzip, A.br, C.br];
  const files = [num(c[11]), num(c[12])];
  ok(
    exp.every((v, x) => v === seen[x]),
    '§3.1 ' + g,
    `report ${seen.join(',')} vs artifacts ${exp.join(',')}`,
  );
  ok(
    files[0] === A.files && files[1] === C.files,
    '§3.1 files ' + g,
    `report ${files.join(',')} vs ${A.files},${C.files}`,
  );
}

// §3.2
i = lines.findIndex((l) => l.startsWith('| group | A (3 cold reps) |'));
for (let k = i + 2; k < lines.length && lines[k].startsWith('|'); k += 1) {
  const c = cells(lines[k]);
  const g = c[0].replace(/\*\*/g, '');
  const m = M[g];
  if (!m) continue;
  const rep = (side) =>
    [1, 2, 3].map((r) => j(m[side].replace('-cold-r1', `-cold-r${r}`)).summary.grandTotal);
  const fmt = (t) => `${t.files}:${t.raw}:${t.gzip}`;
  const A = rep('a'),
    C = rep('c');
  ok(c[1].includes(fmt(A[0])), '§3.2 A ' + g, `report ${c[1]} vs ${fmt(A[0])}`);
  ok(c[2].includes(fmt(C[0])), '§3.2 C ' + g, `report ${c[2]} vs ${fmt(C[0])}`);
}

// §3.3
i = lines.findIndex((l) => l.startsWith('| group | stylesheet links |'));
for (let k = i + 2; k < lines.length && lines[k].startsWith('|'); k += 1) {
  const c = cells(lines[k]);
  const g = c[0].replace(/\*\*/g, '');
  const m = M[g];
  if (!m) continue;
  const a = j(m.a).closure,
    b = j(m.c).closure;
  const pair = (s) => {
    const t = s.replace(/[*\s\u00a0\u202f]/g, '').split('→');
    return t;
  };
  const sheets = pair(c[1]),
    mods = pair(c[2]),
    pre = pair(c[3]),
    isl = pair(c[5]);
  ok(
    sheets[0] === String(a.stylesheetLinkTotal) && sheets[1] === String(b.stylesheetLinkTotal),
    '§3.3 sheets ' + g,
    `${c[1]} vs ${a.stylesheetLinkTotal}→${b.stylesheetLinkTotal}`,
  );
  ok(
    mods[0] === String(a.moduleScriptTotal) && mods[1] === String(b.moduleScriptTotal),
    '§3.3 scripts ' + g,
    `${c[2]} vs ${a.moduleScriptTotal}→${b.moduleScriptTotal}`,
  );
  ok(
    pre[0] === String(a.modulePreloadTotal) && pre[1] === String(b.modulePreloadTotal),
    '§3.3 preload ' + g,
    `${c[3]} vs ${a.modulePreloadTotal}→${b.modulePreloadTotal}`,
  );
  ok(
    isl[0] === String(Object.keys(a.islandManifestEntries).length) &&
      isl[1] === String(Object.keys(b.islandManifestEntries).length),
    '§3.3 islands ' + g,
    c[5],
  );
}

// §3.5
i = lines.findIndex((l) => l.startsWith('| group | client JS A→C (raw) |'));
for (let k = i + 2; k < lines.length && lines[k].startsWith('|'); k += 1) {
  const c = cells(lines[k]);
  const g = c[0].replace(/\*\*/g, '');
  const m = M[g];
  if (!m) continue;
  const A = j(m.a).summary,
    C = j(m.c).summary;
  const arrow = (s) => s.replace(/[*\s\u00a0\u202f]/g, '').split('→');
  const js = arrow(c[1]),
    sv = arrow(c[3]),
    html = arrow(c[5]);
  ok(
    js[0] === String(A.clientJsTotal.raw) && js[1] === String(C.clientJsTotal.raw),
    '§3.5 js ' + g,
    `${c[1]} vs ${A.clientJsTotal.raw}→${C.clientJsTotal.raw}`,
  );
  ok(
    sv[0] === String(A.serverOnlyTotal.raw) && sv[1] === String(C.serverOnlyTotal.raw),
    '§3.5 server ' + g,
    `${c[3]} vs ${A.serverOnlyTotal.raw}→${C.serverOnlyTotal.raw}`,
  );
  ok(
    html[0] === String(A.htmlTotal.raw) && html[1] === String(C.htmlTotal.raw),
    '§3.5 html ' + g,
    `${c[5]} vs ${A.htmlTotal.raw}→${C.htmlTotal.raw}`,
  );
}

console.log(`REPORT↔ARTIFACT (final): ${checked} assertions, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
