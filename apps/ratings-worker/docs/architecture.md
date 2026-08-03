# ratings-worker — architecture

A `cloudflare-worker-turbo` component built by the turbo pipeline from
`apps/ratings-worker`, deployed per environment by its CI lane.

## Bindings

- **Hyperdrive** → `PLATFORM_DB`, fresh executor per request.
- No service bindings — this Worker is called, and calls nobody.

## Route classes

| Class | Routes | Auth |
|---|---|---|
| Public read | `GET /v1/titles/:id/rating`, `/rating/demographics`, `/v1/titles/:id/popularity`, `/v1/names/:id/popularity`, `/v1/charts/:chart` | none |
| Personal | `PUT`/`DELETE /v1/titles/:id/rating`, `GET /v1/me/ratings[/:titleId]` | actor headers required |
| Internal | `POST /v1/internal/ratings/charts/recompute` | service binding only |

The split is by **path**, not by method, so a cache can never be handed a
personalized body: `/v1/me/*` is `no-store` at the edge, everything public
carries a `Cache-Control`.

## Bucket columns

The histogram lives in ten fixed columns rather than a child table, so a vote
is one `UPDATE` instead of an insert plus a re-count. The column name is
derived from a validated integer 1–10 and can never come from a caller.

## Boundaries

`user_id` and `title_id` are opaque cross-context references — no FK, no join
to identity or catalog. The demographic bands are snapshotted onto the vote at
the time it is cast, so the breakdown is stable and needs no lookup.
