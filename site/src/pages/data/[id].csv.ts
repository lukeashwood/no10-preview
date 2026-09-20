import type { APIRoute } from 'astro';
import { MEASURES } from '../../lib/measures';

export function getStaticPaths() { return MEASURES.map((m) => ({ params: { id: m.id } })); }
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

export const GET: APIRoute = ({ params }) => {
  const m = MEASURES.find((x) => x.id === params.id)!;
  let rows: string[];
  if (m.chart.bars) rows = ['category,value,unit', ...m.chart.bars.map((b) => `${q(b.name)},${b.value},${q(m.chart.unit)}`)];
  else {
    const series = m.chart.series ?? []; const maps = series.map((s) => new Map(s.points));
    const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p[0])))].sort();
    rows = ['date,' + series.map((s) => q(s.name)).join(',') + ',forecast', ...dates.map((d) => d + ',' + maps.map((mm) => mm.get(d) ?? '').join(',') + ',' + (m.chart.estimateFrom && d >= m.chart.estimateFrom ? 'yes' : 'no'))];
  }
  const head = [`# ${m.title}`, `# Unit: ${m.ed.unitOverride ?? m.chart.unit}`, ...m.sources.map((s) => `# Source: ${s.publisher}, ${s.title}, ${s.url}`)];
  return new Response([...head, ...rows].join('\n') + '\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
};
