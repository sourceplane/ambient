# Catalog epic — public API surface

Everything is served by `apps/api-edge` under `/v1`. Two route classes:

- **Public** — no session, per-IP rate limited, cacheable
  (`Cache-Control: public, max-age=60, stale-while-revalidate=600` plus
  a strong `ETag`). This is new: the edge today authenticates every
  non-auth route. The catalog read surface opts in explicitly, route by
  route — the default stays deny.
- **Authenticated** — session or API key, `x-actor-subject-*` forwarded
  to the owning worker, policy-evaluated there. Writes go through the
  existing idempotency layer.

Errors, pagination cursors, request ids and `Server-Timing` follow the
existing conventions (`packages/contracts/src/errors.ts`,
`apps/*/src/pagination.ts`, `@saas/contracts/timing`).

---

## Catalog (`catalog-worker`)

### Titles — public

```
GET  /v1/titles                       list/browse (filters, cursor)
GET  /v1/titles/:titleId              core record + primary image + aggregate
GET  /v1/titles/:titleId/credits      cast + crew, ?category=&department=&limit=
GET  /v1/titles/:titleId/cast         billed cast, ordered
GET  /v1/titles/:titleId/akas
GET  /v1/titles/:titleId/release-dates
GET  /v1/titles/:titleId/certificates
GET  /v1/titles/:titleId/keywords
GET  /v1/titles/:titleId/companies
GET  /v1/titles/:titleId/technical-specs
GET  /v1/titles/:titleId/box-office
GET  /v1/titles/:titleId/connections
GET  /v1/titles/:titleId/external-ids
GET  /v1/titles/:titleId/images       ?kind=&limit=
GET  /v1/titles/:titleId/videos
GET  /v1/titles/:titleId/seasons
GET  /v1/titles/:titleId/episodes     ?season=
GET  /v1/titles/:titleId/similar      more-like-this (M4)
```

### People — public

```
GET  /v1/names/:nameId
GET  /v1/names/:nameId/credits        ?department=&sort=
GET  /v1/names/:nameId/known-for
GET  /v1/names/:nameId/images
GET  /v1/names/:nameId/videos
GET  /v1/names/:nameId/awards         (M7)
```

### Companies & keywords — public

```
GET  /v1/companies/:companyId
GET  /v1/companies/:companyId/titles
GET  /v1/keywords/:keywordSlug
GET  /v1/keywords/:keywordSlug/titles
```

### Curation — authenticated, policy `catalog.*`

```
POST   /v1/titles                     create (staff/editor)
PATCH  /v1/titles/:titleId
DELETE /v1/titles/:titleId            archive
POST   /v1/titles/:titleId/credits
PATCH  /v1/credits/:creditId
DELETE /v1/credits/:creditId
POST   /v1/names                      + PATCH/DELETE /v1/names/:nameId
POST   /v1/titles/:titleId/images     + DELETE /v1/images/:imageId
POST   /v1/titles/:titleId/videos     + DELETE /v1/videos/:videoId
POST   /v1/titles/:titleId/episodes
```

Policy actions: `catalog.title.create|update|archive`,
`catalog.credit.write`, `catalog.person.write`, `catalog.media.write`.

---

## Search (`search-worker`) — public

```
GET /v1/search/suggest?q=&limit=            typeahead, mixed entity types
GET /v1/search?q=&type=&cursor=&limit=      full-text, per-entity tabs
GET /v1/search/titles?…                     advanced title search
GET /v1/search/names?…                      advanced name search
```

Advanced title parameters: `genre` (repeatable), `year_from`, `year_to`,
`rating_from`, `rating_to`, `votes_min`, `runtime_min`, `runtime_max`,
`certificate`, `country`, `language`, `keyword`, `company`, `cast`,
`crew`, `kind`, `adult`, `sort`
(`popularity|rating|votes|release_date|alphabetical|runtime`), `order`.

Advanced name parameters: `born_from`, `born_to`, `died_from`,
`died_to`, `birth_place`, `profession`, `credited_in`, `sort`.

Internal (service binding only): `POST /v1/internal/search/reindex`.

---

## Ratings (`ratings-worker`)

Public:

```
GET /v1/titles/:titleId/rating              average, votes, histogram
GET /v1/titles/:titleId/rating/demographics
GET /v1/charts/:chart                       top_movies|top_tv|bottom_movies|
                                            most_popular_movies|most_popular_tv|
                                            box_office|coming_soon|in_theaters
GET /v1/titles/:titleId/popularity          MOVIEmeter rank + delta
GET /v1/names/:nameId/popularity            STARmeter rank + delta
```

Authenticated:

```
PUT    /v1/titles/:titleId/rating          { value: 1..10 }
DELETE /v1/titles/:titleId/rating
GET    /v1/me/ratings                      ?sort=&cursor=
GET    /v1/me/ratings/:titleId
GET    /v1/me/recommendations
```

Internal: `POST /v1/internal/ratings/charts/recompute` (cron/staff).

---

## Reviews (`reviews-worker`)

Public:

```
GET /v1/titles/:titleId/reviews    ?sort=helpfulness|date|rating&spoilers=hide|show
GET /v1/reviews/:reviewId
GET /v1/titles/:titleId/critic-reviews
GET /v1/titles/:titleId/metascore
GET /v1/users/:userId/reviews
```

Authenticated:

```
POST   /v1/titles/:titleId/reviews
PATCH  /v1/reviews/:reviewId
DELETE /v1/reviews/:reviewId
POST   /v1/reviews/:reviewId/vote    { helpful: boolean }
DELETE /v1/reviews/:reviewId/vote
GET    /v1/moderation/reviews        moderator only
POST   /v1/moderation/reviews/:reviewId/decision
```

---

## Lists (`lists-worker`)

Authenticated:

```
GET    /v1/me/watchlist              ?sort=&cursor=
PUT    /v1/me/watchlist/:titleId
DELETE /v1/me/watchlist/:titleId
GET    /v1/me/watchlist/:titleId     membership probe for the toggle
GET    /v1/me/lists
POST   /v1/me/lists
PATCH  /v1/lists/:listId
DELETE /v1/lists/:listId
POST   /v1/lists/:listId/items
PATCH  /v1/lists/:listId/items/:itemId    reorder / note
DELETE /v1/lists/:listId/items/:itemId
POST   /v1/lists/:listId/like  ·  DELETE /v1/lists/:listId/like
```

Public: `GET /v1/lists/:listId`, `GET /v1/lists/:listId/items`,
`GET /v1/users/:userId/lists` — public and unlisted lists only.

---

## Community (`community-worker`)

Public:

```
GET /v1/titles/:titleId/awards
GET /v1/awards/:bodySlug/:year
GET /v1/titles/:titleId/facts?kind=trivia|goof|quote|crazy_credit|alternate_version|soundtrack
GET /v1/titles/:titleId/parents-guide
GET /v1/titles/:titleId/faq
GET /v1/news?entity=&cursor=
GET /v1/news/:articleId
```

Authenticated:

```
POST   /v1/titles/:titleId/facts                 contribution submission
POST   /v1/titles/:titleId/parents-guide
PUT    /v1/titles/:titleId/parents-guide/:category/severity
POST   /v1/facts/:factId/vote                    { interesting: boolean }
POST   /v1/contributions                         generic submission
GET    /v1/me/contributions
POST   /v1/contributions/:contributionId/withdraw
GET    /v1/moderation/contributions              moderator queue
POST   /v1/moderation/contributions/:id/decision
```

---

## Response envelope

Unchanged from the platform:

```jsonc
{
  "data": { /* resource or { items, ... } */ },
  "meta": { "requestId": "…", "cursor": "…|null" }
}
```

Errors: `{ "error": { "code", "message", "details?" }, "meta": { "requestId" } }`
with the existing code vocabulary (`not_found`, `validation_failed`,
`unauthenticated`, `forbidden`, `conflict`, `rate_limited`,
`internal_error`).

## Caching contract

| Surface | max-age | swr |
|---|---|---|
| title/name core records | 60s | 600s |
| credits, akas, specs, connections | 300s | 3600s |
| images, videos | 300s | 3600s |
| ratings aggregate | 30s | 300s |
| charts | 300s | 3600s |
| search suggest | 30s | 120s |
| anything under `/v1/me` or authenticated | `no-store` | — |

`ETag` is the strong hash of the serialized body; the edge answers
`If-None-Match` with 304 without waking the downstream worker.
