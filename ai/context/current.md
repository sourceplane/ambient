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

### Milestone status

| # | Milestone | State |
|---|---|---|
| M1 | Catalog data foundation + contracts | not started |
| M2 | catalog-worker + edge routes | not started |
| M3 | search-worker | not started |
| M4 | ratings-worker + charts | not started |
| M5 | reviews-worker | not started |
| M6 | lists-worker | not started |
| M7 | community-worker (awards, facts, contributions) | not started |
| M8 | Web design system + shell + home | not started |
| M9 | Web title + name pages | not started |
| M10 | Web discovery + user surfaces, SDK/CLI/seed/docs | not started |

Keep this table current — it is the epic's progress ledger.
