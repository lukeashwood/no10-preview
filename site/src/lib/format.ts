const LOCALE = 'en-GB';
const MINUS = '−';

export function num(v: number, d = 0): string {
  if (!Number.isFinite(v)) return '–';
  const s = Math.abs(v).toLocaleString(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d });
  return (v < 0 && Number(s.replace(/[^\d.]/g, '')) !== 0 ? MINUS : '') + s;
}
export function signed(v: number, d = 0): string {
  if (!Number.isFinite(v)) return '–';
  const s = num(Math.abs(v), d);
  if (Number(s.replace(/[^\d.]/g, '')) === 0) return s;
  return (v > 0 ? '+' : MINUS) + s;
}

/** Format a value in a chart/headline unit: "%", "pts", "£", "£bn", "£'000", "index", "people", "homes", "" …
    A money unit that isn't handled here used to fall through to the default and print the number with no currency
    symbol at all — £123.8bn of borrowing rendered as "123.8". Anything starting with £ is now handled explicitly. */
export function withUnit(v: number, unit = '', d = 0, opts: { signed?: boolean; compact?: boolean } = {}): string {
  if (!Number.isFinite(v)) return '–';
  const f = (x: number, dd = d) => (opts.signed ? signed(x, dd) : num(x, dd));
  switch (unit) {
    case '%': return f(v) + '%';
    case 'pts': return f(v) + ' pts';
    case '£': return money(v, d, opts.signed);
    case '£bn': return money(v, d, opts.signed) + 'bn';
    case '£m': return money(v, d, opts.signed) + 'm';
    case "£'000": return money(v * 1000, 0, opts.signed, true);
    case 'index': return f(v);
    case '': return f(v);
    default:
      // A unit we don't know: keep the label rather than silently dropping it.
      if (unit.startsWith('£')) return money(v, d, opts.signed) + unit.slice(1);
      if (opts.compact && Math.abs(v) >= 10000) return compact(v, opts.signed);
      return f(v);
  }
}
/** True for any money unit. A money series is compared in pounds, never as a percentage: borrowing can cross zero,
    and a percentage of a figure that is near zero or negative is meaningless. */
export const isMoneyUnit = (unit = '') => unit.startsWith('£');

function money(v: number, d = 0, sign = false, compactBig = false): string {
  const a = Math.abs(v);
  const pre = v < 0 ? MINUS : sign && v > 0 ? '+' : '';
  if (compactBig && a >= 1e6) return `${pre}£${(a / 1e6).toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}m`;
  if (compactBig && a >= 1e3) return `${pre}£${Math.round(a / 1e3).toLocaleString(LOCALE)}k`;
  return `${pre}£${a.toLocaleString(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}
export function compact(v: number, sign = false): string {
  const a = Math.abs(v); const pre = v < 0 ? MINUS : sign && v > 0 ? '+' : '';
  if (a >= 1e9) return pre + (a / 1e9).toLocaleString(LOCALE, { maximumFractionDigits: 1 }) + 'bn';
  if (a >= 1e6) return pre + (a / 1e6).toLocaleString(LOCALE, { maximumFractionDigits: 2 }) + 'm';
  if (a >= 1e4) return pre + (a / 1e3).toLocaleString(LOCALE, { maximumFractionDigits: 0 }) + 'k';
  return pre + a.toLocaleString(LOCALE, { maximumFractionDigits: 0 });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function parseDate(s: string): Date { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, (m || 1) - 1, d || 1)); }
export function fmtDate(s: string): string { const d = parseDate(s); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
export function fmtMonth(s: string): string { const d = parseDate(s); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
/** Label a data point by its frequency: "Jun qtr 2026", "2025–26", "Jul 2026". */
export function fmtPeriod(s: string, freq?: 'q' | 'fy' | 'm' | 'd'): string {
  const d = parseDate(s); const y = d.getUTCFullYear(); const m = d.getUTCMonth();
  if (freq === 'fy') return `${m >= 6 ? y : y - 1}–${String((m >= 6 ? y + 1 : y) % 100).padStart(2, '0')}`;
  if (freq === 'q') return `${MONTHS[m]} qtr ${y}`;
  if (freq === 'd') return fmtDate(s);
  return `${MONTHS[m]} ${y}`;
}
export function fmtStamp(iso?: string): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return d.toLocaleString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Europe/London', timeZoneName: 'short' });
}
export function daysBetween(a: string, b: string): number { return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 864e5); }

/** Guess the frequency of a series from the spacing of its last points. */
export function inferFreq(points: [string, number][], hint?: 'q' | 'fy'): 'q' | 'fy' | 'm' | 'd' {
  if (hint) return hint;
  if (points.length < 3) return 'm';
  const gaps: number[] = [];
  for (let i = Math.max(1, points.length - 6); i < points.length; i++) gaps.push(daysBetween(points[i - 1][0], points[i][0]));
  const g = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  return g > 300 ? 'fy' : g > 80 ? 'q' : g > 20 ? 'm' : 'd';
}

export function headlineText(h: { value: number; unit?: string; decimals?: number; prefix?: string | boolean; suffix?: string; signed?: boolean }): string {
  const d = h.decimals ?? 0; const unit = h.unit ?? '';
  let body: string;
  // Plain pounds get the compact treatment for very large values; every other unit goes through withUnit, so a unit
  // this function doesn't recognise is still printed rather than silently dropped.
  if (unit === '£') body = Math.abs(h.value) >= 1e6 ? money(h.value, 0, !!h.signed, true) : money(h.value, d, !!h.signed);
  else body = withUnit(h.value, unit, d, { signed: !!h.signed });
  return body + (h.suffix ?? '');
}
