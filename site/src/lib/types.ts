export type Point = [string, number];
export type Role = 'primary' | 'accent' | 'muted' | 'good';

export interface Series { name: string; role?: Role; points: Point[] }
export interface Bar { name: string; value: number; role?: Role }
export interface RefLine { value: number; label: string }

export interface ChartSpec {
  kind: 'line' | 'step' | 'bar' | 'hbar';
  unit: string;
  decimals: number;
  series?: Series[];
  bars?: Bar[];
  band?: { lo: number; hi: number; label: string };
  ref?: RefLine[];
  refValue?: number;
  estimateFrom?: string;
  freq?: 'q' | 'fy';
  note?: string;
  legend?: { name: string; role: Role }[];
  extra?: { name: string; unit: string; decimals: number; points: Point[] }[];
}

export interface Source {
  publisher: string; title: string; url: string; data_url?: string; series?: string[];
  retrieved_at?: string; published?: string; automated?: boolean;
}

export interface RawMetric {
  id: string; section: string; title: string; question: string;
  headline: { value: number; unit?: string; decimals?: number; period?: string; caption: string; prefix?: string | boolean; suffix?: string; signed?: boolean };
  benchmark: { label: string; text: string };
  baseline?: { label: string; value: number; unit?: string };
  status: 'pass' | 'warn' | 'fail' | 'info';
  status_rule: string;
  context: string[];
  chart: ChartSpec;
  sources: Source[];
  method: string;
  automated?: boolean; cross_checked?: boolean;
  updated_at?: string; verified_on?: string; recheck_by?: string;
  explainer?: { what: string; why: string };
  promise?: { quote: string; attribution: string };
}

export type Influence = 'direct' | 'shared' | 'indirect';
export type Better = 'higher' | 'lower' | 'none';
export type Verdict = 'met' | 'on_track' | 'in_progress' | 'at_risk' | 'off_track' | 'not_met';
export type Trend = 'up' | 'down' | 'steady';

export interface TargetSpec {
  /** Who made the commitment. Only 'government' targets count in the headline tally. */
  owner: 'government' | 'official';
  ownerLabel: string;
  commitment: string;
  deadline?: string;
  sourceLabel: string;
  sourceUrl: string;
  /** The rule in plain English, shown on the page and in the methodology. */
  rule: string;
  /** Optional wording for verdicts where the generic label misleads (the RBA is 'within target', not 'on track'). */
  verdictLabels?: Partial<Record<Verdict, string>>;
  rate: (m: RawMetric) => { verdict: Verdict; reason: string };
}

export interface Editorial {
  group: 'target' | 'condition' | 'context';
  influence: Influence;
  influenceNote: string;
  better: Better;
  /** Why a direction is or isn't coloured as better/worse. */
  betterNote?: string;
  labels: string[];
  seriesIndex?: number;
  /** Use the chart's "extra" series (e.g. % of GDP) as the rated/plotted headline series. */
  useExtra?: number;
  unitOverride?: string;
  /** Replace the data feed's chart note/title where it describes colours or series this site doesn't use. */
  chartNote?: string;
  chartTitle?: string;
  supports?: string;
  /** Leave this measure out of since-office comparisons (e.g. an unadjusted quarterly series, where comparing a June
      quarter with a March quarter would mostly measure the season). */
  noSince?: boolean;
  /** An honest note about the starting point in mid-2022, shown beside every since-office comparison. */
  baselineNote?: string;
  /** Context lines from the data feed that are dropped because they argue rather than inform. */
  dropContext?: RegExp[];
  target?: TargetSpec;
}

export interface Direction {
  trend: Trend;
  /** good / bad only when there's broad agreement on which way is better. */
  tone: 'good' | 'bad' | 'neutral';
  latest: Point; prior: Point;
  change: number; changeLabel: string; periodLabel: string;
}

export interface Measure extends RawMetric {
  ed: Editorial;
  sectionTitle: string;
  direction: Direction | null;
  /** The change since the government took office: the site's primary comparison. */
  sinceElection: { from: Point; to: Point; change: number; label: string; trend: Trend; tone: 'good' | 'bad' | 'neutral'; periodLabel: string } | null;
  verdict: { verdict: Verdict; reason: string } | null;
  lastDataDate: string | null;
  isForecastHeadline: boolean;
}
