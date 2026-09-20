# No. 10 Report Card

An independent record of how the UK government is performing, in official figures: what it promised at the
2024 general election, what it has delivered, and what has changed since.

    pipeline/    Python: fetches every automated figure from its publisher and writes site/src/data/metrics.json
    site/        Astro + React: the website

## Commands
    python3 pipeline/update.py     refresh the data (also: cd site && npm run sync)
    cd site && npm run dev         local preview
    cd site && npm run check       build the site into site/dist

## Where things live
- `pipeline/update.py` — every automated series, with its source and its checks. ONS time series, Bank of England
  rates, Home Office small-boat data.
- `pipeline/manual.json` — figures with no machine-readable feed (the Plan for Change milestones, net migration).
  Every entry carries the date it was read and the date it must be checked again.
- `site/src/lib/editorial.ts` — **the rating rules.** What counts as a promise, how each verdict is reached, how much
  control ministers have over each measure. The methodology page is generated from it. Changing a rule means bumping
  `SITE.rulesVersion` and adding an entry to `site/src/data/changelog.json`.
- `site/src/lib/disputes-uk.ts` — the in-depth controversy entries, each strand marked established, contested or
  not supported by the record.
- `site/src/config/site.ts` — name, edition, government, election and leadership dates, publisher details.

## Before launch
- Fill in `SITE.publisher`: who publishes the site, any political affiliation, who funds it, and any authorisation
  required by electoral law. The About page and footer say "to be stated" until then.
- Set `SITE.formEndpoint` so the sign-up and error-report forms work.
- Verify every figure in `pipeline/manual.json` against its primary source, not only against a fact-checker.

## A note on other editions
This is a standalone site with its own publisher, data and editorial rules. It shares no content, branding or
ownership with any other edition.
