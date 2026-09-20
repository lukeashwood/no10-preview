/* Rating rules v1.0 (United Kingdom). This file is the whole editorial layer: it decides what is a PROMISE (the
   government made a measurable commitment, so it gets a verdict), what is a CONDITION (a fact about the country, shown
   with its direction and no verdict), and how much of each the government actually controls. The methodology page is
   generated from this file, so what readers are told is exactly what the code does. Change a rule => bump
   SITE.rulesVersion and log it in changelog.json. */
import type { Editorial, RawMetric, Verdict } from './types';

const v = (verdict: Verdict, reason: string) => ({ verdict, reason });

export const EDITORIAL: Record<string, Editorial> = {
  /* ------------------------------------------------------------ promises: the government's own commitments */
  homes: {
    group: 'target', influence: 'shared', better: 'higher', labels: ['England only', 'Net additional dwellings'],
    influenceNote: 'Ministers set planning rules, grant funding and targets, but homes are built by private developers and consented by councils, and the industry follows interest rates and build costs.',
    target: {
      owner: 'government', ownerLabel: 'Manifesto and Plan for Change', deadline: '2029-07-04',
      commitment: 'Build 1.5 million new homes in England during this parliament.',
      sourceLabel: 'Labour manifesto 2024, page 36', sourceUrl: 'https://fullfact.org/government-tracker/1-5-million-homes/',
      rule: 'On track if homes are being added at or above the pace needed (about 300,000 a year); at risk within 10% of that pace; off track below it.',
      rate: (m) => {
        const pace = 300000, latest = m.headline.value;
        return latest >= pace ? v('on_track', `${latest.toLocaleString('en-GB')} homes added in the latest year, at or above the pace needed.`)
          : latest >= pace * 0.9 ? v('at_risk', `${latest.toLocaleString('en-GB')} homes added in the latest year, against about ${pace.toLocaleString('en-GB')} needed.`)
          : v('off_track', `${latest.toLocaleString('en-GB')} homes were added in the latest year, around ${Math.round((1 - latest / pace) * 100)}% below the pace needed to reach 1.5 million.`);
      },
    },
  },
  nhs_18_weeks: {
    group: 'target', influence: 'direct', better: 'higher', labels: ['England only'],
    influenceNote: 'The government funds the NHS in England, sets its priorities and appoints its leadership. Staffing, demand and social care all affect how quickly the list moves.',
    target: {
      owner: 'government', ownerLabel: 'Manifesto and Plan for Change', deadline: '2029-03-31',
      commitment: 'Return to the NHS standard of 92% of patients waiting no longer than 18 weeks for planned treatment.',
      sourceLabel: 'Labour manifesto 2024, page 95', sourceUrl: 'https://fullfact.org/government-tracker/cut-waiting-times-18-week-standard/',
      rule: 'Met at 92% or more. Before the March 2029 deadline it is “in progress” while the share is rising, and “at risk” if it is flat or falling.',
      rate: (m) => (m.headline.value >= 92 ? v('met', 'The 92% standard is being met.')
        : m.headline.value > (m.baseline?.value ?? 0) ? v('in_progress', `${m.headline.value}% of patients are seen within 18 weeks, up from ${m.baseline?.value}% when the government took office. The deadline is March 2029.`)
        : v('at_risk', `${m.headline.value}% of patients are seen within 18 weeks and the share is not rising.`)),
    },
  },
  neighbourhood_police: {
    group: 'target', influence: 'shared', better: 'higher', labels: ['England and Wales', 'Management information, not official statistics'],
    influenceNote: 'The Home Office funds and sets the target, but chief constables and police and crime commissioners decide how officers are deployed.',
    target: {
      owner: 'government', ownerLabel: 'Plan for Change', deadline: '2029-07-04',
      commitment: 'Put 13,000 more police officers, PCSOs and special constables into neighbourhood roles.',
      sourceLabel: 'Plan for Change, December 2024', sourceUrl: 'https://fullfact.org/government-tracker/13000-neighbourhood-police/',
      rule: 'Judged against the share of the parliament elapsed: on track if recruitment is at or ahead of that share of 13,000, at risk within 10 percentage points of it, off track below that.',
      rate: (m) => {
        const start = new Date('2024-07-04').getTime(), end = new Date('2029-07-04').getTime();
        const elapsed = Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
        const share = m.headline.value / 13000;
        const txt = `${m.headline.value.toLocaleString('en-GB')} of 13,000 are in post (${Math.round(share * 100)}%), with about ${Math.round(elapsed * 100)}% of the parliament gone.`;
        return share >= elapsed ? v('on_track', txt) : share >= elapsed - 0.1 ? v('at_risk', txt) : v('off_track', txt);
      },
    },
  },
  school_readiness: {
    group: 'target', influence: 'shared', better: 'higher', labels: ['England only', 'Teacher assessment'],
    influenceNote: 'Early years funding, childcare entitlements and the curriculum are set by ministers; outcomes also depend on families, nurseries and schools.',
    target: {
      owner: 'government', ownerLabel: 'Plan for Change', deadline: '2028-12-31',
      commitment: 'Have 75% of five-year-olds in England ready to learn when they start school.',
      sourceLabel: 'Plan for Change, December 2024', sourceUrl: 'https://fullfact.org/government-tracker/75-percent-ready-to-learn/',
      rule: 'Met at 75% or more. Before the deadline it is “in progress” while the share is rising, and “at risk” if it is flat or falling.',
      rate: (m) => (m.headline.value >= 75 ? v('met', 'Three in four children are reaching a good level of development.')
        : m.headline.value > (m.baseline?.value ?? 0) ? v('in_progress', `${m.headline.value}% reached a good level of development, up from ${m.baseline?.value}% the year before. The target is 75% by 2028.`)
        : v('at_risk', `${m.headline.value}% reached a good level of development, no higher than the year before.`)),
    },
  },
  clean_power: {
    group: 'target', influence: 'shared', better: 'higher', labels: ['Great Britain', 'Government’s own definition'],
    influenceNote: 'Ministers set the target, the planning regime and the subsidy auctions. Delivery depends on grid connections, supply chains and private investment.',
    target: {
      owner: 'government', ownerLabel: 'Manifesto and Clean Power 2030 Action Plan', deadline: '2030-12-31',
      commitment: 'Get at least 95% of Great Britain’s electricity from clean sources by 2030.',
      sourceLabel: 'Clean Power 2030 Action Plan', sourceUrl: 'https://www.gov.uk/government/publications/clean-power-2030-action-plan',
      rule: 'Judged on the latest official clean-power share against the straight-line path from the 2024 starting point (73.7%) to 95% in 2030: on track if at or above that path, at risk within 5 percentage points of it, off track below that. No verdict is given while the only published figure is the 2024 starting point itself, because comparing it with itself would score the promise on nothing. The figure is published once a year, so it can be some months old.',
      rate: (m) => {
        const startYear = 2024, startVal = 73.7, endYear = 2030, endVal = 95;
        const year = Number((m.headline.period ?? '2024').slice(0, 4));
        if (year <= startYear)
          return v('in_progress', `${m.headline.value}% of electricity was clean in ${year}. That is the starting point the target was set from, and no figure covering a full year of this government has been published on this definition yet, so there is nothing to judge progress against.`);
        const path = startVal + ((endVal - startVal) * (year - startYear)) / (endYear - startYear);
        const base = m.baseline?.value;
        const moved = typeof base === 'number' ? (m.headline.value < base ? `down from ${base}% in ${startYear}` : m.headline.value > base ? `up from ${base}% in ${startYear}` : `unchanged on ${startYear}`) : '';
        const txt = `${m.headline.value}% of electricity was clean in ${year}${moved ? `, ${moved}` : ''}, against about ${path.toFixed(1)}% on a straight line from ${startVal}% in ${startYear} to 95% in 2030.`;
        return m.headline.value >= path ? v('on_track', txt) : m.headline.value >= path - 5 ? v('at_risk', txt) : v('off_track', txt);
      },
    },
  },
  /* ------------------------------------------------------------ an official target that isn't the government's to hit */
  inflation: {
    group: 'target', influence: 'indirect', better: 'lower', labels: ['UK', 'Annual % change'],
    influenceNote: 'The Bank of England sets interest rates to control inflation, independently of ministers. Tax, spending and energy policy push at the margin.',
    target: {
      owner: 'official', ownerLabel: 'Bank of England target',
      commitment: 'Keep consumer price inflation at 2%.',
      sourceLabel: 'Bank of England: the inflation target', sourceUrl: 'https://www.bankofengland.co.uk/monetary-policy/inflation',
      verdictLabels: { on_track: 'At target', at_risk: 'Near target', off_track: 'Above target' },
      rule: 'At target within 0.5 percentage points of 2%; near target within 1 point; otherwise outside it. This is the Bank of England’s job, so it is shown but does not count in the government’s tally.',
      rate: (m) => {
        const gap = Math.abs(m.headline.value - 2);
        return gap <= 0.5 ? v('on_track', `Inflation is ${m.headline.value}%, close to the 2% target.`)
          : gap <= 1 ? v('at_risk', `Inflation is ${m.headline.value}%, above the 2% target but within a percentage point of it.`)
          : v('off_track', `Inflation is ${m.headline.value}%, more than a percentage point from the 2% target.`);
      },
    },
  },

  /* ------------------------------------------------------------ conditions: direction only, no verdict */
  real_wages: { group: 'condition', influence: 'indirect', better: 'higher', labels: ['Great Britain', 'Real (after inflation)'], influenceNote: 'Pay is set by employers and workers. The minimum wage, public-sector pay and employment taxes are the government’s levers.' },
  unemployment: { group: 'condition', influence: 'indirect', better: 'lower', labels: ['UK', 'Seasonally adjusted'], baselineNote: 'Survey response rates have fallen, and the ONS has warned its labour market estimates are less reliable than usual.', influenceNote: 'Follows the business cycle and interest rates more than any single decision, though employment taxes and welfare rules matter at the margin.' },
  productivity: { group: 'condition', influence: 'indirect', better: 'higher', labels: ['UK', 'Output per hour'], influenceNote: 'Depends on business investment, skills and technology over many years. Policy matters, slowly.' },
  gdp_vs_capita: { group: 'condition', influence: 'indirect', better: 'higher', labels: ['UK', 'Real (after inflation)'], influenceNote: 'The broad result of the whole economy, including interest rates, world demand and population growth.' },
  debt: { group: 'condition', influence: 'direct', better: 'lower', labels: ['UK', 'Share of GDP'], influenceNote: 'The running total of past borrowing, which follows directly from Budget decisions and from downturns that cut tax revenue.' },
  borrowing: { group: 'condition', influence: 'direct', better: 'lower', rollingSince: 12, labels: ['UK', 'Cash terms'], influenceNote: 'The direct result of Budget decisions, plus swings in tax revenue and debt interest.' },
  bank_rate: { group: 'condition', influence: 'indirect', better: 'none', betterNote: 'A higher or lower Bank Rate is a tool, not a goal, so its direction is not coloured.', labels: ['UK', 'Policy rate'], influenceNote: 'Set by the Bank of England’s Monetary Policy Committee, not by ministers.' },
  small_boats: { group: 'condition', influence: 'direct', better: 'lower', rollingSince: 12, labels: ['UK', 'Detected arrivals'], baselineNote: 'Crossings are strongly seasonal and depend on weather, so single months move sharply for reasons no government controls.', influenceNote: 'Border enforcement, the asylum system and deals with France are the government’s own responsibility, but crossings also follow weather, smuggling networks and conditions abroad.' },
  net_migration: { group: 'condition', influence: 'direct', better: 'none', sinceFromBaseline: true, betterNote: 'The right level of migration is a political judgement, so the direction is not coloured.', labels: ['UK', 'ONS estimate, revised'], influenceNote: 'Visa rules are set by ministers. Departures, returning British citizens and world events are not controlled by anyone.' },
};

export const VERDICT_LABEL: Record<Verdict, string> = {
  met: 'Met', on_track: 'On track', in_progress: 'In progress', at_risk: 'At risk', off_track: 'Off track', not_met: 'Not met',
};
export const VERDICT_TONE: Record<Verdict, 'good' | 'warn' | 'bad' | 'neutral'> = {
  met: 'good', on_track: 'good', in_progress: 'neutral', at_risk: 'warn', off_track: 'bad', not_met: 'bad',
};
export const VERDICT_MEANING: Record<Verdict, string> = {
  met: 'The commitment has been delivered.',
  on_track: 'The latest official figures are consistent with the commitment being delivered.',
  in_progress: 'The deadline is still ahead and the figures are moving the right way; it is too early for a verdict.',
  at_risk: 'The figures are behind where they need to be, but the commitment could still be delivered.',
  off_track: 'On the latest official figures, the commitment will not be delivered without a clear change.',
  not_met: 'The deadline has passed and the commitment was not delivered.',
};
export const INFLUENCE_LABEL = { direct: 'Direct government control', shared: 'Shared control', indirect: 'Indirect influence' } as const;
export const INFLUENCE_MEANING = {
  direct: 'Ministers decide this themselves, mainly through the Budget, legislation or the departments they run.',
  shared: 'Ministers are one of several hands on the wheel, alongside councils, devolved governments, regulators or private business.',
  indirect: 'Decided mostly by others (the Bank of England, world markets, employers and households). Government policy nudges it.',
} as const;
