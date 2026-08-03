# search-worker

Cloudflare Worker for the search bounded context — the denormalized search
index and its query surface.

Part of the ambient runtime: a Cloudflare Worker deployed per environment
(`stage`, `prod`; `dev` is verify-only). Not publicly routable — reached only
through `api-edge` service bindings.

## What it owns

The `search` Postgres schema: one denormalized document per searchable entity,
carrying a weighted `tsvector` for full-text ranking, a trigram-indexed display
label for typeahead, and a JSONB facet column for advanced search.

**It never reads another context's tables.** Documents are *published to it* by
the context that owns the entity — catalog-worker calls the internal publish
seam after every curation write. That keeps the boundary honest, and it is also
what makes the query fast: one index, one table, no joins on the hot path.

Because the index is a projection, publishing is best-effort: a title briefly
missing from search is a far smaller problem than a curation write that fails
because a sibling Worker was redeploying. Drift is repaired by republishing.

## Surfaces

- `GET /v1/search/suggest?q=` — typeahead. Trigram-led so `arriv` finds
  `Arrival` before the word is finished; similarity dominates the score and
  popularity only breaks ties, so a blockbuster cannot outrank an exact prefix.
- `GET /v1/search?q=&type=` — full-text across one or all entity types.
- `GET /v1/search/titles` — advanced title search: genre, year, rating, votes,
  runtime, certificate, country, language, keyword, company, kind, adult, with
  seven sort keys.
- `GET /v1/search/names` — advanced name search: profession, birth/death year
  ranges, birthplace.
- `PUT`/`DELETE /v1/internal/search/documents…` — the publish seam.
  Service-binding only; the edge refuses to route `/v1/internal/`.

## Depended on by

- **api-edge** — the public query surface
- **catalog-worker** — publishes documents on write
