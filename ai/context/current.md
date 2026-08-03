# Current Context (compact)

Keep this file current as product work begins.

## State

ambient is live on stage and prod. The platform substrate (identity,
membership, policy, projects, config, events, metering, billing,
notifications, webhooks, integrations) is deployed and operating.

- **What is deployed, where:** [deployment.md](deployment.md) - the
  generated manifest (verified URLs, identity, secrets inventory).
- **How to operate it:** [operations.md](operations.md).
- Established design decisions and risks: [decisions.md](decisions.md),
  [open-risks.md](open-risks.md).

## Active epic

**[Catalog — an IMDb-class title database](../epics/catalog/README.md)**
turns the substrate into the product: titles, people, credits, ratings,
reviews, lists, charts, awards, media, community facts and contributions,
served through a modern cinematic web experience.

- Epic + parity matrix: [ai/epics/catalog/README.md](../epics/catalog/README.md)
- Schemas: [data-model.md](../epics/catalog/data-model.md)
- Public API: [api.md](../epics/catalog/api.md)
- Design system + page specs: [design.md](../epics/catalog/design.md)
- What shipped on the web + how to seed: [web.md](../epics/catalog/web.md)

### Milestone status

| # | Milestone | State |
|---|---|---|
| M1 | Catalog data foundation + contracts | **done** — migrations `200`–`230`, `@saas/db/catalog`, `@saas/contracts/catalog` |
| M2 | catalog-worker + edge routes | **done** — read + curation API, public cacheable edge route class |
| M3 | search-worker | **done** — typeahead, full-text, advanced title/name search, publish seam |
| M4 | ratings-worker + charts | **done** — votes, transactional aggregates, demographics, Bayesian charts, popularity |
| M5 | reviews-worker | **done** — user reviews, helpfulness, spoiler veil, moderation, critic reviews + metascore |
| M6 | lists-worker | **done** — watchlist as a list, custom lists, items, likes, visibility |
| M7 | community-worker (awards, facts, contributions) | **done** — awards, facts, parents guide, FAQ, news, contribution queue |
| M8 | Web design system + shell + home | **done** — `.site` theme scope, site shell, mega-search, home rails; console keeps its routes and gains `/studio` |
| M9 | Web title + name pages | **done** — title overview + 15 sub-routes, name page, spoiler veil, lightbox, rating panel |
| M10 | Web discovery + user surfaces, SDK/CLI/seed/docs | **done** — search/charts/watchlist/lists/profile, SDK catalog namespaces, `ambient catalog` CLI, seed tool |

Keep this table current — it is the epic's progress ledger.
