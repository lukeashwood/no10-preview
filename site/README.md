# The Scorecard (next)

A rebuilt, separate version of The Scorecard: official Australian figures, sourced line by line, with verdicts only on
commitments the government itself made. Astro + React islands + Tailwind, static output.

## Commands
- `npm run dev`: local preview at http://localhost:4321
- `npm run sync`: copy the latest data from the original site's daily pipeline (`../scorecard-site/data`)
- `npm run check`: run the tests, then build the site into `dist/`

## Where things live
- `src/lib/editorial.ts`: **the rating rules.** What counts as a commitment, how each verdict is reached, how much control
  the federal government has over each measure. The methodology page is generated from this file. Changing a rule means
  bumping `SITE.rulesVersion` in `src/config/site.ts` and adding an entry to `src/data/changelog.json`.
- `src/data/commitments.json`: commitments judged on delivery. Every item must be checked against its official page first;
  anything unconfirmed goes in `pending` and is not published.
- `src/lib/budget/model.ts` + `tests/budget.test.ts`: the Build-your-own-Budget engine and its extreme-input tests.
- `src/config/site.ts`: name, edition, government, election dates. A new country edition starts here.
- `src/islands/`: interactive pieces (charts, budget builder, explainers, the Briefing).

## Before launch
- Fill in `SITE.publisher` (who publishes, affiliations, funding). The About page shows a "being finalised" note until then.
- Move hosting off GitHub Pages before any paid tier (its terms don't allow commercial services).
