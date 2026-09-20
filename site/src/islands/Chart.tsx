import { useEffect, useMemo, useRef, useState } from 'react';
import { scaleLinear, scaleTime, scaleBand } from 'd3-scale';
import { line as d3line, curveStepAfter, curveMonotoneX } from 'd3-shape';
import { fmtPeriod, inferFreq, withUnit, parseDate } from '../lib/format';
import type { ChartSpec, Point } from '../lib/types';

interface Props {
  spec: ChartSpec;
  title: string;
  unitOverride?: string;
  elections?: { date: string; label: string }[];
  /** The government's time in office: shaded on every chart, with earlier periods faded. */
  term?: { start: string; label: string };
  /** Plot this extra series (e.g. % of GDP) instead of series[0]. */
  useExtra?: number;
  csvName?: string;
  height?: number;
}

const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)'];
const roleColor = (role: string | undefined, i: number) => (role === 'muted' ? 'var(--c4)' : COLORS[i % COLORS.length]);
const RANGES = [{ id: 'term', label: 'This government', years: -1 }, { id: '5y', label: '5 years', years: 5 }, { id: '10y', label: '10 years', years: 10 }, { id: 'all', label: 'All', years: 0 }] as const;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null); const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    setW(Math.round(ref.current.getBoundingClientRect().width)); // measure at once: a background tab may never get a resize callback
    const ro = new ResizeObserver((e) => setW(Math.round(e[0].contentRect.width)));
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export default function Chart({ spec, title, unitOverride, elections = [], term, useExtra, csvName = 'data', height = 340 }: Props) {
  const unit = unitOverride ?? (useExtra != null ? spec.extra![useExtra].unit : spec.unit);
  const decimals = useExtra != null ? spec.extra![useExtra].decimals : spec.decimals;
  const series = useMemo(() => {
    if (useExtra != null && spec.extra?.[useExtra]) return [{ name: spec.extra[useExtra].name, role: 'primary' as const, points: spec.extra[useExtra].points }];
    return spec.series ?? [];
  }, [spec, useExtra]);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const allDates = useMemo(() => series.flatMap((s) => s.points.map((p) => p[0])).sort(), [series]);
  const spanYears = allDates.length ? (parseDate(allDates[allDates.length - 1]).getTime() - parseDate(allDates[0]).getTime()) / 31557600000 : 0;
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>(spanYears > 11 ? '10y' : 'all');
  const fmt = (v: number) => withUnit(v, unit, decimals);

  const cut = useMemo(() => {
    const r = RANGES.find((x) => x.id === range)!;
    if (!r.years || !allDates.length) return '0000';
    // "This government": from the start of the year it took office, so the starting point stays in view.
    if (r.years < 0) return term ? `${term.start.slice(0, 4)}-01-01` : '0000';
    const end = parseDate(allDates[allDates.length - 1]);
    return new Date(Date.UTC(end.getUTCFullYear() - r.years, end.getUTCMonth(), end.getUTCDate())).toISOString().slice(0, 10);
  }, [range, allDates]);
  const shown = useMemo(() => series.map((s) => ({ ...s, points: s.points.filter((p) => p[0] >= cut) })), [series, cut]);
  const freq = useMemo(() => inferFreq(series[0]?.points ?? [], spec.freq), [series, spec.freq]);

  function downloadCsv() {
    let rows: string[];
    if (spec.kind === 'hbar') rows = ['category,value', ...(spec.bars ?? []).map((b) => `"${b.name.replace(/"/g, '""')}",${b.value}`)];
    else {
      const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p[0])))].sort();
      const maps = series.map((s) => new Map(s.points));
      rows = ['date,' + series.map((s) => `"${s.name.replace(/"/g, '""')}"`).join(','), ...dates.map((d) => d + ',' + maps.map((m) => m.get(d) ?? '').join(','))];
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' })); a.download = `${csvName}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return (
    <figure className="m-0">
      <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Time range">
          {spec.kind !== 'hbar' && spanYears > 6 && view === 'chart' && RANGES.filter((r) => r.years >= 0 || (term && allDates[0] < term.start)).map((r) => (
            <button key={r.id} type="button" className="btn btn-sm btn-quiet" aria-pressed={range === r.id} onClick={() => setRange(r.id)}
              style={range === r.id ? { background: 'var(--ink)', color: 'var(--paper)' } : undefined}>{r.label}</button>
          ))}
        </div>
        <div className="flex gap-1">
          <button type="button" className="btn btn-sm btn-ghost" aria-pressed={view === 'table'} onClick={() => setView(view === 'chart' ? 'table' : 'chart')}>{view === 'chart' ? 'Show as table' : 'Show as chart'}</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={downloadCsv}>Download CSV</button>
        </div>
      </div>

      {view === 'table' ? <DataTable spec={spec} series={series} unit={unit} decimals={decimals} freq={freq} />
        : spec.kind === 'hbar' ? <HBars spec={spec} unit={unit} decimals={decimals} title={title} />
        : <TimeChart spec={spec} series={shown} fmt={fmt} freq={freq} elections={elections} term={term} title={title} height={height} plottingExtra={useExtra != null} />}

      {series.length > 1 && view === 'chart' && spec.kind !== 'hbar' && (
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13.5px] text-ink-2">
          {series.map((s, i) => <li key={s.name} className="inline-flex items-center gap-2"><span aria-hidden className="inline-block h-[3px] w-5 rounded" style={{ background: roleColor(s.role, i) }} />{s.name}</li>)}
        </ul>
      )}
      {spec.note && <figcaption className="meta mt-3 max-w-[80ch]">{spec.note}</figcaption>}
    </figure>
  );
}

/* ------------------------------------------------------------------ time charts: line, step, bar */
function TimeChart({ spec, series, fmt, freq, elections, term, title, height, plottingExtra }: {
  spec: ChartSpec; series: { name: string; role?: string; points: Point[] }[]; fmt: (v: number) => string; freq: 'q' | 'fy' | 'm' | 'd';
  elections: { date: string; label: string }[]; term?: { start: string; label: string }; title: string; height: number; plottingExtra: boolean;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const isBar = spec.kind === 'bar';
  const m = { t: 34, r: 18, b: 30, l: 52 };
  const w = Math.max(280, W), h = height, iw = w - m.l - m.r, ih = h - m.t - m.b;

  const dates = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p[0])))].sort(), [series]);
  const refs = plottingExtra ? [] : spec.ref ?? [];
  const band = plottingExtra ? undefined : spec.band;
  const vals = series.flatMap((s) => s.points.map((p) => p[1]));
  let lo = Math.min(...vals, ...refs.map((r) => r.value), band ? band.lo : Infinity), hi = Math.max(...vals, ...refs.map((r) => r.value), band ? band.hi : -Infinity);
  if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
  if (isBar || lo > 0 && lo / (hi || 1) < 0.35) lo = Math.min(0, lo); // bars and near-zero series are anchored at zero
  const padY = (hi - lo || 1) * 0.08;
  const y = scaleLinear().domain([lo < 0 ? lo - padY : lo === 0 ? 0 : lo - padY, hi + padY]).nice(5).range([ih, 0]);
  const t0 = dates.length ? parseDate(dates[0]) : new Date(), t1 = dates.length ? parseDate(dates[dates.length - 1]) : new Date();
  const x = scaleTime().domain([t0, t1]).range([0, iw]);
  const xb = scaleBand<string>().domain(series[0]?.points.map((p) => p[0]) ?? []).range([0, iw]).paddingInner(0.22).paddingOuter(0.1);
  const px = (d: string) => (isBar ? (xb(d) ?? 0) + xb.bandwidth() / 2 : x(parseDate(d)));
  const est = spec.estimateFrom;
  // A period belongs to the government's term if it ENDS after the term began and isn't the baseline period itself:
  // the June quarter 2022 and the 2021–22 financial year are the starting point, not the government's record.
  const baseEnd = term ? (freq === 'm' || freq === 'd' ? `${term.start.slice(0, 7)}-31` : `${term.start.slice(0, 4)}-06-30`) : '';
  const inTerm = (d: string) => !!term && d > baseEnd;
  const firstIn = term ? dates.find(inTerm) : undefined;
  const termX = !term || !firstIn ? null : isBar ? Math.max(0, (xb(firstIn) ?? 0) - xb.step() * 0.11) : Math.max(0, Math.min(iw, x(parseDate(term.start))));
  const uid = useMemo(() => 'c' + Math.random().toString(36).slice(2, 8), []);

  const yTicks = y.ticks(5);
  // Axis labels drop needless decimals ("4%" not "4.0%") unless the ticks themselves are fractional.
  const tickFmt = (v: number) => (yTicks.every((t) => Number.isInteger(t)) ? fmt(v).replace(/\.0+(?=\D*$)/, '') : fmt(v));
  const yearTicks = useMemo(() => {
    const ys: number[] = []; const a = t0.getUTCFullYear(), b = t1.getUTCFullYear();
    const step = Math.max(1, Math.ceil((b - a + 1) / Math.max(2, Math.floor(iw / 70))));
    for (let yr = a; yr <= b; yr++) if ((yr - a) % step === 0) ys.push(yr);
    return ys;
  }, [t0.getTime(), t1.getTime(), iw]);

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const r = e.currentTarget.getBoundingClientRect(); const mx = e.clientX - r.left;
    let best = 0, bd = Infinity;
    dates.forEach((d, i) => { const dist = Math.abs(px(d) - mx); if (dist < bd) { bd = dist; best = i; } });
    setHover(best);
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight') { setHover((v) => Math.min(dates.length - 1, (v ?? dates.length - 2) + 1)); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { setHover((v) => Math.max(0, (v ?? dates.length) - 1)); e.preventDefault(); }
    if (e.key === 'Escape') setHover(null);
  }
  const hd = hover != null ? dates[hover] : null;
  const hx = hd ? px(hd) : 0;
  const tipLeft = Math.min(Math.max(hx + m.l + 12, 8), w - 196);
  const mk = d3line<Point>().x((p) => px(p[0])).y((p) => y(p[1])).curve(spec.kind === 'step' ? curveStepAfter : curveMonotoneX);
  const last = series[0]?.points[series[0].points.length - 1];

  return (
    <div ref={ref} className="relative" style={{ height: h }}>
      {W > 0 && (
        <svg width={w} height={h} role="img" aria-label={`${title}. ${series.map((s) => s.name).join(', ')}. Use the table view for exact figures.`}
          tabIndex={0} onKeyDown={onKey} onBlur={() => setHover(null)} className="block touch-pan-y select-none rounded-lg focus-visible:outline-offset-4">
          <g transform={`translate(${m.l},${m.t})`}>
            {termX != null && termX < iw && <g><rect x={termX} y={-8} width={iw - termX} height={ih + 8} fill="var(--brand-tint)" opacity={0.6} /><line x1={termX} x2={termX} y1={-8} y2={ih} stroke="var(--brand)" strokeWidth={1.5} /><text x={termX + 6} y={-12} fontSize="11" fill="var(--brand)" fontWeight={700} fontFamily="var(--font-mono)">{term!.label.toUpperCase()} →</text>
              <clipPath id={`${uid}-pre`}><rect x={-4} y={-20} width={termX + 4} height={ih + 40} /></clipPath><clipPath id={`${uid}-in`}><rect x={termX} y={-20} width={iw - termX + 8} height={ih + 40} /></clipPath></g>}
            {est && dates.some((d) => d >= est) && (() => { const first = dates.find((d) => d >= est)!; const sx = isBar ? (xb(first) ?? 0) - xb.step() * 0.11 : x(parseDate(first)); return (
              <g><rect x={sx} y={-8} width={Math.max(0, iw - sx)} height={ih + 8} fill="var(--panel)" /><text x={sx + 6} y={4} fontSize="11" fill="var(--ink-3)" fontFamily="var(--font-mono)">BUDGET FORECAST →</text></g>); })()}
            {band && <g><rect x={0} y={y(band.hi)} width={iw} height={Math.max(1, y(band.lo) - y(band.hi))} fill="var(--good-tint)" /><text x={6} y={y(band.hi) - 5} fontSize="11.5" fill="var(--good)" fontWeight={700}>{band.label}</text></g>}
            {yTicks.map((tv) => (
              <g key={tv}><line x1={0} x2={iw} y1={y(tv)} y2={y(tv)} stroke={tv === 0 ? 'var(--ink-3)' : 'var(--grid)'} strokeWidth={1} />
                <text x={-8} y={y(tv)} dy="0.32em" textAnchor="end" fontSize="12" fill="var(--ink-3)" style={{ fontVariantNumeric: 'tabular-nums' }}>{tickFmt(tv)}</text></g>
            ))}
            {yearTicks.map((yr) => { const d = `${yr}-${isBar && freq === 'fy' ? '06-30' : '01-01'}`; const xx = isBar ? (xb(series[0].points.find((p) => p[0].startsWith(String(yr)))?.[0] ?? '') ?? null) : x(parseDate(d)); if (xx == null || xx < 0 || xx > iw) return null;
              return <text key={yr} x={isBar ? xx + xb.bandwidth() / 2 : xx} y={ih + 20} textAnchor="middle" fontSize="12" fill="var(--ink-3)">{freq === 'fy' ? `${String(yr - 1).slice(2)}–${String(yr).slice(2)}` : yr}</text>; })}
            {elections.map((el) => { const ex = isBar ? null : x(parseDate(el.date)); if (ex == null || ex < 0 || ex > iw) return null; return (
              <g key={el.date}><line x1={ex} x2={ex} y1={-4} y2={ih} stroke="var(--rule-strong)" strokeDasharray="3 4" /><text x={ex + 4} y={ih - 6} fontSize="10.5" fill="var(--ink-3)" fontFamily="var(--font-mono)">{el.label.toUpperCase()}</text></g>); })}
            {refs.map((r) => <g key={r.label + r.value}><line x1={0} x2={iw} y1={y(r.value)} y2={y(r.value)} stroke="var(--ink-2)" strokeDasharray="5 4" strokeWidth={1.2} />{r.label && <text x={iw} y={y(r.value) - 5} textAnchor="end" fontSize="11.5" fill="var(--ink-2)" fontWeight={600}>{r.label}</text>}</g>)}

            {isBar ? series[0]?.points.map((p) => { const y0 = y(0), yv = y(p[1]); const bh = Math.max(1, Math.abs(yv - y0)); const fc = est && p[0] >= est; return (
              <rect key={p[0]} x={xb(p[0])} y={Math.min(y0, yv)} width={xb.bandwidth()} height={bh} rx={Math.min(3, xb.bandwidth() / 3)} fill={term && !inTerm(p[0]) ? 'var(--c4)' : 'var(--c1)'} opacity={fc ? 0.42 : term && !inTerm(p[0]) ? 0.5 : hd && hd !== p[0] ? 0.6 : 1} />); })
              : series.map((s, i) => { const d = mk(s.points) ?? '', sw = s.role === 'muted' ? 1.6 : 2.4, c = roleColor(s.role, i); return termX != null
                ? <g key={s.name}><path d={d} fill="none" stroke={c} strokeWidth={sw * 0.8} opacity={0.38} strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${uid}-pre)`} /><path d={d} fill="none" stroke={c} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${uid}-in)`} /></g>
                : <path key={s.name} d={d} fill="none" stroke={c} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" />; })}
            {!isBar && last && hover == null && <circle cx={px(last[0])} cy={y(last[1])} r={4} fill="var(--c1)" stroke="var(--surface)" strokeWidth={2} />}

            {hd && <g pointerEvents="none"><line x1={hx} x2={hx} y1={0} y2={ih} stroke="var(--ink-3)" strokeWidth={1} />
              {!isBar && series.map((s, i) => { const p = s.points.find((q) => q[0] === hd); return p ? <circle key={s.name} cx={hx} cy={y(p[1])} r={4.5} fill={roleColor(s.role, i)} stroke="var(--surface)" strokeWidth={2} /> : null; })}</g>}
            <rect x={0} y={0} width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
          </g>
        </svg>
      )}
      {hd && (
        <div role="status" className="pointer-events-none absolute top-2 z-10 w-[188px] rounded-lg border border-rule bg-surface p-2.5 text-[13px] shadow-card" style={{ left: tipLeft }}>
          <p className="mono mb-1 text-[11.5px] uppercase text-ink-3">{fmtPeriod(hd, freq)}{est && hd >= est ? ' · forecast' : term && !inTerm(hd) ? ' · before this government' : ''}</p>
          {series.map((s, i) => { const p = s.points.find((q) => q[0] === hd); return p ? (
            <p key={s.name} className="flex items-baseline justify-between gap-2"><span className="flex items-center gap-1.5 text-ink-2"><span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: roleColor(s.role, i) }} />{series.length > 1 ? s.name.split(/[,(]/)[0].slice(0, 22) : 'Value'}</span><b className="num">{fmt(p[1])}</b></p>) : null; })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ categorical horizontal bars */
function HBars({ spec, unit, decimals, title }: { spec: ChartSpec; unit: string; decimals: number; title: string }) {
  const bars = spec.bars ?? []; const vals = bars.map((b) => b.value);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals, spec.refValue ?? 0), span = hi - lo || 1;
  const pos = (v: number) => ((v - lo) / span) * 100;
  const moneyish = unit === '$';
  const f = (v: number) => withUnit(v, unit, decimals, { signed: moneyish });
  return (
    <div role="img" aria-label={`${title}. Bar chart; use the table view for exact figures.`}>
      <ul className="grid gap-2">
        {bars.map((b) => { const a = pos(Math.min(0, b.value)), wv = Math.abs(pos(b.value) - pos(0)); const strong = b.role === 'accent' || b.role === 'good' || b.role === 'primary'; return (
          <li key={b.name} className="grid grid-cols-[minmax(96px,32%)_1fr_auto] items-center gap-3 text-[14px]">
            <span className={strong ? 'font-bold' : 'text-ink-2'}>{b.name}</span>
            <span className="relative h-6 rounded bg-panel">
              <span className="absolute top-0 h-6 rounded" style={{ left: `${a}%`, width: `${Math.max(0.6, wv)}%`, background: b.role === 'accent' ? 'var(--c1)' : b.role === 'good' || b.role === 'primary' ? 'var(--c2)' : 'var(--c4)', opacity: strong ? 1 : 0.55 }} />
              {spec.refValue != null && <span aria-hidden className="absolute -top-1 h-8 w-[2px] bg-ink" style={{ left: `${pos(spec.refValue)}%` }} />}
            </span>
            <b className="num min-w-[64px] text-right">{f(b.value)}</b>
          </li>); })}
      </ul>
      {spec.legend && <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-2">{spec.legend.map((l) => <li key={l.name} className="inline-flex items-center gap-2"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: l.role === 'accent' ? 'var(--c1)' : l.role === 'muted' ? 'var(--c4)' : 'var(--c2)' }} />{l.name.replace(/\s*\(blue line[^)]*\)/i, ' (black line)')}</li>)}</ul>}
    </div>
  );
}

/* ------------------------------------------------------------------ table view (also the accessible fallback) */
function DataTable({ spec, series, unit, decimals, freq }: { spec: ChartSpec; series: { name: string; points: Point[] }[]; unit: string; decimals: number; freq: 'q' | 'fy' | 'm' | 'd' }) {
  const f = (v: number) => withUnit(v, unit, decimals);
  if (spec.kind === 'hbar') return (
    <div className="table-scroll max-h-[340px] overflow-y-auto rounded-lg border border-rule"><table className="dt"><thead><tr><th>Category</th><th className="r">Value{unit ? ` (${unit})` : ''}</th></tr></thead>
      <tbody>{(spec.bars ?? []).map((b) => <tr key={b.name}><td>{b.name}</td><td className="r num">{f(b.value)}</td></tr>)}</tbody></table></div>);
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p[0])))].sort().reverse(); const maps = series.map((s) => new Map(s.points));
  return (
    <div className="table-scroll max-h-[340px] overflow-y-auto rounded-lg border border-rule"><table className="dt"><thead><tr><th>Period</th>{series.map((s) => <th key={s.name} className="r">{s.name}</th>)}</tr></thead>
      <tbody>{dates.map((d) => <tr key={d}><td className="whitespace-nowrap">{fmtPeriod(d, freq)}{spec.estimateFrom && d >= spec.estimateFrom ? ' (forecast)' : ''}</td>{maps.map((mm, i) => <td key={i} className="r num">{mm.has(d) ? f(mm.get(d)!) : '–'}</td>)}</tr>)}</tbody></table></div>);
}
