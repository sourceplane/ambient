# ratings-worker

Cloudflare Worker for the ratings bounded context — user ratings, aggregates,
charts and popularity meters.

Part of the ambient runtime: deployed per environment (`stage`, `prod`; `dev`
is verify-only). Not publicly routable — reached only through `api-edge`
service bindings.

## What it owns

The `ratings` Postgres schema: one vote per user per title, the per-title
aggregate and 10-bucket histogram, the demographic breakdown, chart snapshots,
and the MOVIEmeter / STARmeter popularity ranks.

## Two decisions worth knowing

**Aggregates are transactional, not derived on read.** A vote updates
`user_ratings`, `title_aggregates` and `title_demographics` in one transaction.
A title with a million votes cannot afford an `AVG()` per page view, and a
rating that does not move the average immediately reads as a bug to the person
who just cast it. Changing a vote from 8 to 5 decrements one bucket and
increments another — it does not add a second vote.

**Charts are snapshots.** Reading through to live aggregates would make the Top
250 reshuffle between two page loads and put a full sort behind every request.
A daily snapshot also carries `previous_rank`, which is what makes a delta
arrow free at read time.

## Ranking

Every ranked chart uses the Bayesian weighted average
`W = (v/(v+m))·R + (m/(v+m))·C`, with `m` (minimum votes) and `C` (prior mean)
stored per chart in `ratings.chart_definitions`. The prior is recomputed from
the *eligible population* on each rebuild, not from the whole catalog — TV and
film rate differently, and each chart should be regressed toward its own centre.

## Privacy

Demographic cells below 25 votes are omitted entirely. "The one 45+ voter who
gave it a 1" is not an aggregate; it is a person.

## Depended on by

- **api-edge** — public rating/chart reads and the authenticated `/v1/me`
  surface
