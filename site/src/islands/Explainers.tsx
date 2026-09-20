import { useMemo, useState } from 'react';

const money = (v: number) => '£' + Math.round(Math.abs(v)).toLocaleString('en-GB');
const Slider = ({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) => (
  <label className="grid gap-1 text-[14px] font-semibold text-ink-2"><span className="flex items-baseline justify-between gap-3"><span>{label}</span><span className="num font-display text-[22px] font-semibold text-ink">{fmt(value)}</span></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-valuetext={fmt(value)} /></label>);
const Stat = ({ l, v, s }: { l: string; v: string; s?: string }) => <div className="bg-surface px-4 py-3"><dt className="eyebrow">{l}</dt><dd className="num font-display text-[26px] font-semibold leading-tight">{v}</dd>{s && <dd className="meta">{s}</dd>}</div>;
const Stats = ({ children }: { children: React.ReactNode }) => <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-rule bg-rule sm:grid-cols-3">{children}</dl>;

/* ------------------------------------------------------------------ 3. Inflation and your pay */
export function InflationPay() {
  const [inf, setInf] = useState(3.1), [pay, setPay] = useState(4.0), [years, setYears] = useState(5), [wage, setWage] = useState(38000);
  const prices = Math.pow(1 + inf / 100, years), wages = Math.pow(1 + pay / 100, years), real = wages / prices;
  return (
    <div className="grid gap-6">
      <div className="grid gap-5 sm:grid-cols-2"><Slider label="Prices rise each year by" value={inf} min={0} max={10} step={0.1} onChange={setInf} fmt={(v) => v.toFixed(1) + '%'} /><Slider label="Your pay rises each year by" value={pay} min={0} max={10} step={0.1} onChange={setPay} fmt={(v) => v.toFixed(1) + '%'} /><Slider label="For this many years" value={years} min={1} max={20} step={1} onChange={setYears} fmt={(v) => `${v} year${v > 1 ? 's' : ''}`} /><Slider label="Your pay today" value={wage} min={15000} max={150000} step={1000} onChange={setWage} fmt={money} /></div>
      <Stats><Stat l="A £100 shop will cost" v={'£' + (100 * prices).toFixed(0)} s={`prices up ${((prices - 1) * 100).toFixed(0)}%`} /><Stat l="Your pay will be" v={money(wage * wages)} s={`up ${((wages - 1) * 100).toFixed(0)}%`} /><Stat l="What it actually buys" v={money(wage * real)} s={real >= 1 ? `${((real - 1) * 100).toFixed(1)}% better off` : `${((1 - real) * 100).toFixed(1)}% worse off`} /></Stats>
      <p className="text-[15.5px] text-ink-2">A pay rise only leaves you better off if it’s bigger than the rise in prices. Economists call the difference your <b className="text-ink">real wage</b>. When prices outrun pay, your money are worth less even though there are more of them.</p>
    </div>);
}

/* ------------------------------------------------------------------ 4. Interest rates and a mortgage */
export function MortgageRates() {
  const [loan, setLoan] = useState(250000), [rate, setRate] = useState(4.92), [term] = useState(25);
  const pay = (r: number) => { const m = r / 1200, n = term * 12; return m ? loan * m / (1 - Math.pow(1 + m, -n)) : loan / n; };
  const now = pay(rate), rows = [-1, -0.5, -0.25, 0.25, 0.5, 1];
  return (
    <div className="grid gap-6">
      <div className="grid gap-5 sm:grid-cols-2"><Slider label="Loan size" value={loan} min={50000} max={1000000} step={10000} onChange={setLoan} fmt={money} /><Slider label="Your interest rate" value={rate} min={1} max={12} step={0.05} onChange={setRate} fmt={(v) => v.toFixed(2) + '%'} /></div>
      <Stats><Stat l="Monthly repayment" v={money(now)} s={`${term}-year loan, principal and interest`} /><Stat l="Interest over the loan" v={money(now * term * 12 - loan)} /><Stat l="Each 0.25 point rise adds" v={money(pay(rate + 0.25) - now)} s="a month" /></Stats>
      <table className="w-full text-[14.5px]"><thead><tr className="text-[12px] uppercase tracking-wider text-ink-3"><th className="pb-2 text-left font-semibold">If rates move by</th><th className="pb-2 text-right font-semibold">New rate</th><th className="pb-2 text-right font-semibold">Repayment</th><th className="pb-2 text-right font-semibold">Change a month</th></tr></thead><tbody>
        {rows.map((d) => { const r = Math.max(0, rate + d), p = pay(r); return <tr key={d} className="border-t border-rule"><td className="num py-1.5">{d > 0 ? '+' : '−'}{Math.abs(d).toFixed(2)} pts</td><td className="num py-1.5 text-right">{r.toFixed(2)}%</td><td className="num py-1.5 text-right">{money(p)}</td><td className="num py-1.5 text-right font-semibold">{p - now >= 0 ? '+' : '−'}{money(p - now)}</td></tr>; })}</tbody></table>
      <p className="text-[15.5px] text-ink-2">The government does not set this rate. The <b className="text-ink">Bank of England</b>, which is independent, sets Bank Rate, and lenders move mortgage rates with it. The Bank raises rates to slow spending when inflation is too high, and cuts them when the economy needs a push.</p>
    </div>);
}
