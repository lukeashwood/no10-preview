import raw from '../data/metrics.json';
import commitmentsRaw from '../data/commitments.json';
import { SITE } from '../config/site';

/** The last observation before the government took office: the yardstick for 'since the election'. */
const ELECTION_BASE = '2024-06-30';
import { EDITORIAL } from './editorial';
import { daysBetween, fmtPeriod, inferFreq, isMoneyUnit, signed, withUnit } from './format';
import type { Direction, Measure, Point, RawMetric, Trend, Verdict } from './types';

const data = raw as unknown as {
  summary: { generated_at: string; checks_total: number; checks_passed: number; checks_warn: number; checks_failed: number };
  sections: { id: string; title: string; blurb: string }[];
  metrics: RawMetric[];
};

export const GENERATED_AT = data.summary.generated_at;
export const TODAY = GENERATED_AT.slice(0, 10);
export const CHECKS = data.summary;
export const SECTIONS = data.sections;

/** The series a measure is judged on: an "extra" series (e.g. % of GDP) when the editorial layer says so, else series[n]. */
export function ratedSeries(m: RawMetric): { points: Point[]; unit: string; decimals: number; name: string } | null {
  const ed = EDITORIAL[m.id];
  if (ed?.useExtra != null && m.chart.extra?.[ed.useExtra]) { const e = m.chart.extra[ed.useExtra]; return { points: e.points, unit: e.unit, decimals: e.decimals, name: e.name }; }
  const s = m.chart.series?.[ed?.seriesIndex ?? 0];
  return s ? { points: s.points, unit: ed?.unitOverride ?? m.chart.unit, decimals: m.chart.decimals, name: s.name } : null;
}

/** Published actuals only: drops Budget forecasts and any point dated after the data was generated. */
function actuals(m: RawMetric, pts: Point[]): Point[] {
  const est = m.chart.estimateFrom;
  return pts.filter((p) => p[0] <= TODAY && (!est || p[0] < est));
}

function nearest(pts: Point[], target: string, maxDays: number): Point | null {
  let best: Point | null = null, bd = Infinity;
  for (const p of pts) { const d = Math.abs(daysBetween(p[0], target)); if (d < bd) { bd = d; best = p; } }
  return best && bd <= maxDays ? best : null;
}

function direction(m: RawMetric): Direction | null {
  const ed = EDITORIAL[m.id]; const rs = ratedSeries(m);
  if (!ed || ed.group === 'context' || !rs) return null;
  let pts = actuals(m, rs.points);
  // A seasonal monthly count is headlined as a rolling 12-month total, so the yearly change must be read off the same
  // rolling total. Comparing one July with the July before it set a single month against a twelve-month headline.
  if (ed.rollingSince && pts.length > ed.rollingSince) {
    const n = ed.rollingSince;
    pts = pts.map((p, i) => (i >= n - 1 ? [p[0], pts.slice(i - n + 1, i + 1).reduce((a, b) => a + b[1], 0)] as Point : null)).filter(Boolean) as Point[];
  }
  if (pts.length < 2) return null;
  const latest = pts[pts.length - 1];
  const freq = inferFreq(pts, m.chart.freq);
  // Compare with the same period a year earlier (the previous point for annual data), which also sidesteps seasonality.
  const yearAgo = new Date(Date.UTC(+latest[0].slice(0, 4) - 1, +latest[0].slice(5, 7) - 1, +latest[0].slice(8, 10))).toISOString().slice(0, 10);
  const prior = freq === 'fy' ? pts[pts.length - 2] : nearest(pts.slice(0, -1), yearAgo, freq === 'q' ? 50 : 20);
  if (!prior) return null;
  const isRate = rs.unit === '%' || rs.unit === 'pts', isMoney = isMoneyUnit(rs.unit);
  const change = isRate || isMoney ? latest[1] - prior[1] : prior[1] !== 0 ? ((latest[1] - prior[1]) / Math.abs(prior[1])) * 100 : 0;
  // "Steady" band: a fifth of a percentage point for rates, 1% for levels and indexes. Dollar series (which can be
  // negative, like public sector net borrowing) are compared in pounds, never as a percentage of a negative number.
  const band = isRate ? 0.2 : isMoney ? Math.max(0.5, Math.abs(prior[1]) * 0.01) : 1;
  const trend: Trend = Math.abs(change) < band ? 'steady' : change > 0 ? 'up' : 'down';
  const tone = trend === 'steady' || ed.better === 'none' ? 'neutral' : (trend === 'up') === (ed.better === 'higher') ? 'good' : 'bad';
  const d = isRate ? (Math.abs(change) < 1 ? 2 : 1) : 1;
  return {
    trend, tone, latest, prior, change,
    changeLabel: isRate ? `${signed(change, m.chart.decimals >= 2 ? 2 : d)} pts` : isMoney ? withUnit(change, rs.unit, 1, { signed: true }) : `${signed(change, 1)}%`,
    periodLabel: ed.rollingSince
      ? `12 months to ${fmtPeriod(prior[0], freq)} → 12 months to ${fmtPeriod(latest[0], freq)}`
      : `${fmtPeriod(prior[0], freq)} → ${fmtPeriod(latest[0], freq)}`,
  };
}

/* Some measures are published as a handful of periods rather than a running series (a bar chart, not a line). They
   still have a stated starting point at the election, so the comparison is real — it just can't be read off a series.
   Where the hand-checked figure supplies one, use it, and label both ends with the periods the source itself names. */
function sinceElectionFromBaseline(m: RawMetric) {
  const ed = EDITORIAL[m.id];
  const base = m.baseline;
  if (!ed || !base || typeof base.value !== 'number' || !Number.isFinite(base.value) || base.value === 0) return null;
  const unit = base.unit ?? m.headline.unit ?? '';
  const isRate = unit === '%' || unit === 'pts', isMoney = isMoneyUnit(unit);
  const to = m.headline.value, from = base.value;
  const change = isRate || isMoney ? to - from : ((to - from) / Math.abs(from)) * 100;
  const band = isRate ? 0.2 : isMoney ? Math.max(0.5, Math.abs(from) * 0.01) : 1;
  const trend: Trend = Math.abs(change) < band ? 'steady' : change > 0 ? 'up' : 'down';
  const tone = trend === 'steady' || ed.better === 'none' ? 'neutral' : (trend === 'up') === (ed.better === 'higher') ? 'good' : 'bad';
  const label = isRate ? `${signed(change, 1)} pts` : isMoney ? withUnit(change, unit, 1, { signed: true }) : `${signed(change, 1)}%`;
  return {
    from: [base.label ?? '', from] as Point, to: [m.headline.period ?? '', to] as Point,
    change, trend, tone, label,
    periodLabel: `${base.label ?? 'at the election'} → ${m.headline.period ?? 'latest'}`,
  };
}

function sinceElection(m: RawMetric) {
  const ed = EDITORIAL[m.id]; const rs = ratedSeries(m);
  if (!ed || ed.group === 'context' || ed.noSince) return null;
  if (!rs) return sinceElectionFromBaseline(m);
  let pts = actuals(m, rs.points);
  // Seasonal monthly counts are compared as rolling totals, so a summer month is never set against a winter one.
  if (ed.rollingSince && pts.length > ed.rollingSince) {
    const n = ed.rollingSince;
    pts = pts.map((p, i) => (i >= n - 1 ? [p[0], pts.slice(i - n + 1, i + 1).reduce((a, b) => a + b[1], 0)] as Point : null)).filter(Boolean) as Point[];
  }
  // A newer series (the monthly CPI began in 2025) can't reach back to 2022: fall back to the long-running first series.
  if ((!pts.length || pts[0][0] > '2024-09-30') && ed.useExtra == null && m.chart.series?.[0]) pts = actuals(m, m.chart.series[0].points);
  if (pts.length < 2) return null;
  const freq = inferFreq(pts, m.chart.freq);
  const anchor = ELECTION_BASE;
  const from = nearest(pts, anchor, freq === 'fy' ? 10 : 50); const to = pts[pts.length - 1];
  if (!from || from[0] === to[0]) return null;
  const isRate = rs.unit === '%' || rs.unit === 'pts', isMoney = isMoneyUnit(rs.unit);
  const change = isRate || isMoney ? to[1] - from[1] : from[1] !== 0 ? ((to[1] - from[1]) / Math.abs(from[1])) * 100 : 0;
  const band = isRate ? 0.2 : isMoney ? Math.max(0.5, Math.abs(from[1]) * 0.01) : 1;
  const trend: Trend = Math.abs(change) < band ? 'steady' : change > 0 ? 'up' : 'down';
  const tone = trend === 'steady' || ed.better === 'none' ? 'neutral' : (trend === 'up') === (ed.better === 'higher') ? 'good' : 'bad';
  const label = isRate ? `${signed(change, m.chart.decimals >= 2 ? 2 : 1)} pts` : isMoney ? withUnit(change, rs.unit, 1, { signed: true }) : `${signed(change, 1)}%`;
  const periodLabel = ed.rollingSince
    ? `12 months to ${fmtPeriod(from[0], freq)} → 12 months to ${fmtPeriod(to[0], freq)}`
    : `${fmtPeriod(from[0], freq)} → ${fmtPeriod(to[0], freq)}`;
  return { from, to, change, trend, tone, periodLabel, label };
}

function lastDataDate(m: RawMetric): string | null {
  const all = (m.chart.series ?? []).flatMap((s) => actuals(m, s.points).map((p) => p[0]));
  return all.length ? all.sort()[all.length - 1] : null;
}

const secTitle = Object.fromEntries(SECTIONS.map((s) => [s.id, s.title]));

export const MEASURES: Measure[] = data.metrics
  .filter((m) => EDITORIAL[m.id])
  .map((m) => {
    const ed = EDITORIAL[m.id];
    // When a measure is judged on an "extra" series (debt as a share of GDP), lead with that series' latest ACTUAL,
    // not with a dollar forecast, so the headline and the verdict are about the same thing.
    if (ed.useExtra != null && m.chart.extra?.[ed.useExtra]) {
      const e = m.chart.extra[ed.useExtra]; const a = actuals(m, e.points); const last = a[a.length - 1];
      if (last) m = { ...m, headline: { value: last[1], unit: e.unit, decimals: e.decimals, caption: `${m.title.toLowerCase()} as a share of GDP (latest actual)`, period: fmtPeriod(last[0], 'fy') }, chart: { ...m.chart, estimateFrom: m.chart.estimateFrom } };
    }
    const usesActual = ed.useExtra != null;
    return {
      ...m, ed,
      sectionTitle: secTitle[m.section] ?? m.section,
      direction: direction(m),
      sinceElection: sinceElection(m),
      verdict: ed.target ? ed.target.rate(m) : null,
      lastDataDate: lastDataDate(m),
      isForecastHeadline: !usesActual && /estimate|forecast|budget/i.test(m.headline.period ?? ''),
    };
  });

export const byId = (id: string) => MEASURES.find((m) => m.id === id);
export const TARGETS = MEASURES.filter((m) => m.ed.group === 'target');
export const GOV_TARGETS = TARGETS.filter((m) => m.ed.target!.owner === 'government');
export const CONDITIONS = MEASURES.filter((m) => m.ed.group === 'condition');
export const CONTEXT = MEASURES.filter((m) => m.ed.group === 'context');

export interface Delivery { id: string; topic: string; title: string; owner: string; deadline?: string; commitment: string; verdict: Verdict; reason: string; sources: { label: string; url: string }[] }
/** Commitments judged on delivery (a law passed, a scheme opened) rather than on a running data series. */
export const DELIVERIES = commitmentsRaw.items as Delivery[];
export const DELIVERIES_VERIFIED = commitmentsRaw.verified_on;

export function tally() {
  const c = { good: 0, progress: 0, risk: 0, bad: 0 };
  const all: Verdict[] = [...GOV_TARGETS.map((m) => m.verdict!.verdict), ...DELIVERIES.map((d) => d.verdict)];
  for (const v of all) { if (v === 'met' || v === 'on_track') c.good++; else if (v === 'in_progress') c.progress++; else if (v === 'at_risk') c.risk++; else c.bad++; }
  return { ...c, total: all.length };
}

/** Freshness of a measure: days since its latest data point, and whether that is older than its usual rhythm allows. */
export function freshness(m: Measure) {
  if (!m.lastDataDate) return null;
  const rs = ratedSeries(m); const freq = rs ? inferFreq(actuals(m, rs.points), m.chart.freq) : 'm';
  const age = daysBetween(m.lastDataDate, TODAY);
  const limit = freq === 'fy' ? 500 : freq === 'q' ? 200 : freq === 'm' ? 80 : 45;
  return { age, stale: age > limit, freq };
}

/** The record since taking office, counted only over measures where nearly everyone agrees which way is better. */
export function record() {
  const rated = MEASURES.filter((m) => m.sinceElection && m.ed.group !== 'context' && m.ed.better !== 'none');
  return { better: rated.filter((m) => m.sinceElection!.tone === 'good'), worse: rated.filter((m) => m.sinceElection!.tone === 'bad'), steady: rated.filter((m) => m.sinceElection!.tone === 'neutral'), total: rated.length };
}

export const GOVERNMENT = SITE.government;
