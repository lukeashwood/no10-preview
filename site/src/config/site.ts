/* One place for everything that identifies this edition. A sister edition (Canada, say) starts by copying this file. */
export const SITE = {
  name: 'No. 10 Report Card',
  edition: 'United Kingdom',
  tagline: 'Holding the government to account, in its own numbers.',
  description:
    'What the UK government promised, what it has delivered, and what has changed since the 2024 general election. Official figures, every one sourced and checked, in plain English.',
  locale: 'en-GB',
  currency: 'GBP',
  government: {
    name: 'Labour government',
    swornIn: '2024-07-05',
    /* Shown on every time-series chart. The mandate runs from the general election; a change of Prime Minister
       inside the same parliament is marked but does not restart the clock. */
    elections: [
      { date: '2024-07-04', label: '2024 election' },
      { date: '2026-07-20', label: 'Burnham becomes PM' },
    ],
    leaders: [
      { name: 'Sir Keir Starmer', from: '2024-07-05', to: '2026-07-20' },
      { name: 'Andy Burnham', from: '2026-07-20' },
    ],
  },
  /* Who publishes the site, who pays for it, and any political affiliation. Left null until the publisher supplies
     the facts; the About page and footer say so plainly rather than inventing details or implying independence. */
  publisher: null as null | { name: string; statement: string; funding: string; contact: string; authorisation: string },
  rulesVersion: '1.2',
  rulesDate: '2026-09-21',
  repo: '',
  /* Form endpoint for sign-ups and error reports. Set this before launch; until then the forms say so. */
  formEndpoint: '',
} as const;

export const NAV = [
  { href: 'promises/', label: 'Promises' },
  { href: 'measures/', label: 'Measures' },
  { href: 'learn/', label: 'Learn' },
  { href: 'controversies/', label: 'Controversies' },
  { href: 'briefing/', label: 'Briefing' },
] as const;

export const FOOTER_NAV = [
  { href: 'methodology/', label: 'Methodology' },
  { href: 'about/', label: 'About & funding' },
  { href: 'corrections/', label: 'Corrections' },
  { href: 'data/', label: 'Data & downloads' },
  { href: 'subscribe/', label: 'Email updates' },
] as const;

/** Prefix an internal path with the deploy base ("/" on a custom domain, "/repo/" on a preview). */
export function url(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  return base + path.replace(/^\//, '');
}
