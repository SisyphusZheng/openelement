/**
 * Unit tests for the report-only site-budget comparison (T10 R7).
 *
 * The measurement half needs a built tree (the CLI runs it); what this pins is
 * the comparison contract: the tolerance band, the over/ok decision, and the
 * shape of the report rows. A budget checker whose comparison is wrong is worse
 * than none, because it will be promoted to a gate later.
 */
import { expect, test } from 'vitest';
import { evaluateSiteBudget, type SiteBudgetMetrics } from './check-site-budget.ts';
import { SITE_BUDGET_REPORT_ONLY } from '../site-budget.ts';

const baseline: SiteBudgetMetrics = {
  htmlMedianBytes: SITE_BUDGET_REPORT_ONLY.htmlMedianKB * 1024,
  htmlMaxBytes: SITE_BUDGET_REPORT_ONLY.htmlMaxKB * 1024,
  htmlMaxRoute: '/reference',
  cssBytes: SITE_BUDGET_REPORT_ONLY.cssKB * 1024,
  fontBytes: SITE_BUDGET_REPORT_ONLY.fontKB * 1024,
  mediaBytes: SITE_BUDGET_REPORT_ONLY.mediaKB * 1024,
};

test('site budget: exactly at baseline is inside the band', () => {
  const rows = evaluateSiteBudget(baseline);
  expect(rows.length).toBe(5);
  for (const row of rows) {
    expect(row.over, `${row.dimension} at baseline must not be flagged`).toBe(false);
    // A zero baseline (the in-artifact media dimension) has no ratio to compare:
    // the row reports 0 and is never flagged.
    if (row.baseline === 0) expect(row.ratio).toBe(0);
    else expect(row.ratio).toBeCloseTo(1, 5);
  }
});

test('site budget: the +5% band is inclusive, beyond it is flagged', () => {
  const inside = evaluateSiteBudget({
    ...baseline,
    cssBytes: Math.floor(SITE_BUDGET_REPORT_ONLY.cssKB * 1024 * 1.05),
  });
  expect(inside.find((row) => row.dimension.startsWith('first-view'))?.over).toBe(false);

  const outside = evaluateSiteBudget({
    ...baseline,
    cssBytes: Math.ceil(SITE_BUDGET_REPORT_ONLY.cssKB * 1024 * 1.051),
  });
  const css = outside.find((row) => row.dimension.startsWith('first-view'));
  expect(css?.over).toBe(true);
  expect(css!.ratio).toBeGreaterThan(1.05);
});

test('site budget: a shrink is never flagged', () => {
  const rows = evaluateSiteBudget({
    ...baseline,
    htmlMaxBytes: Math.floor(SITE_BUDGET_REPORT_ONLY.htmlMaxKB * 512),
    fontBytes: 0,
  });
  expect(rows.some((row) => row.over)).toBe(false);
});

test('site budget: every report-only dimension has a row', () => {
  const rows = evaluateSiteBudget(baseline);
  const dimensions = rows.map((row) => row.dimension);
  expect(dimensions).toEqual([
    'html median (gzip)',
    'html max (gzip)',
    'first-view css (gzip)',
    'fonts (raw)',
    'page media (raw)',
  ]);
});
