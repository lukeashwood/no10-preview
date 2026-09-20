export interface Lesson { slug: string; title: string; question: string; minutes: number; intro: string[]; takeaways: string[]; related: { label: string; href: string }[]; tool: 'tax' | 'debt' | 'inflation' | 'mortgage' }

export const LESSONS: Lesson[] = [
  { slug: 'inflation-and-your-pay', tool: 'inflation', minutes: 2, title: 'Inflation and your pay', question: 'Why can a pay rise still leave you worse off?',
    intro: ['Inflation is the speed at which prices rise. A little is normal: the Bank of England is set a target of 2% a year. What matters to your household is whether your pay rises faster or slower than prices.', 'Try different combinations. Notice how a gap of just one percentage point compounds over the years.'],
    takeaways: ['Falling inflation does not mean prices fall. It means they rise more slowly.', 'If pay grows more slowly than prices, living standards fall even while pay packets grow.', 'Small differences compound: a 1-point gap for five years is a 5% change in what your pay buys.'],
    related: [{ label: 'Inflation', href: 'measures/inflation/' }, { label: 'Real wages', href: 'measures/real_wages/' }] },
  { slug: 'interest-rates-and-mortgages', tool: 'mortgage', minutes: 2, title: 'Interest rates and mortgages', question: 'Who decides your mortgage rate, and what does a rate rise really cost?',
    intro: ['When the news says “rates went up”, it means the Bank of England changed Bank Rate. Lenders pass that on to people with variable and tracker mortgages, and it feeds into the fixed rates offered to everyone else.', 'Enter a loan and a rate to see the repayment, and what each quarter-point move adds or saves.'],
    takeaways: ['The Bank of England sets Bank Rate independently of ministers.', 'Its job is to keep inflation at 2%. Higher rates slow spending; lower rates encourage it.', 'Most UK mortgages are fixed for two or five years, so a rate change reaches households gradually, as deals end.'],
    related: [{ label: 'Interest rates', href: 'measures/bank_rate/' }, { label: 'Inflation', href: 'measures/inflation/' }] },
];
