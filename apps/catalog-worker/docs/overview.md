# catalog-worker

Cloudflare Worker for the catalog bounded context — titles, people, credits,
episodes, companies, keywords and media.

Part of the ambient runtime: a Cloudflare Worker deployed per environment
(`stage`, `prod`; `dev` is verify-only). Not publicly routable — reached only
through `api-edge` service bindings.

## What it owns

The `catalog` Postgres schema and everything in it: every catalogued work
(features, series, episodes, shorts, games, podcasts), the people credited on
them, the single cast/crew credit join, series structure, companies, plot
keywords, and image/video metadata.

An **episode is a title**. `catalog.episodes` carries only the ordering
relation (series, season number, episode number, air date); the episode's own
metadata, credits and media live in the same tables as any other title, so no
consumer downstream special-cases episodes.

## Two route classes

- **Public reads** (`GET /v1/titles/…`, `/v1/names/…`, `/v1/companies/…`,
  `/v1/keywords/…`, `/v1/genres`) — no session. Every query filters to
  `status = 'published'`, so unpublished rows are invisible rather than
  merely unauthorized. `api-edge` rate limits these per client IP and adds
  `Cache-Control` + `ETag`.
- **Curation writes** (`/v1/organizations/:orgId/catalog/…`) — session or API
  key, evaluated by the policy worker against the caller's membership in the
  editorial organization. Denials return 404, like the rest of the fleet.

## Depends on

- **membership-worker** — authorization context for curation writes
- **policy-worker** — the `catalog.*` permission decisions

## Depended on by

- **api-edge** — the only public entry point
