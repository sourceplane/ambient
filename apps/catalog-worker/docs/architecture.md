# catalog-worker — architecture

A `cloudflare-worker-turbo` component: TypeScript Worker built by the turbo
pipeline from `apps/catalog-worker`, deployed per environment by its CI lane.

## Bindings and wiring

- **Hyperdrive** → `PLATFORM_DB` — pooled Postgres. A fresh SQL executor per
  request (see the note in `@saas/db/hyperdrive`: the Workers runtime rejects
  reusing a client across requests).
- **Service bindings** → `membership-worker`, `policy-worker` — consulted only
  on curation writes. A public read never touches either.
- **Wired configuration** (resolved at deploy time from job-output secrets
  published by the infrastructure terraform; names only):
  `WIRING_CLOUDFLARE_HYPERDRIVE_STAGE`, `WIRING_CLOUDFLARE_HYPERDRIVE_PROD`.

## Request shape

```
api-edge ──service binding──▶ router.ts
                               ├─ routeCuration  → authz → handlers/curation.ts
                               └─ routeReads     →         handlers/{titles,names,browse}.ts
                                                            └─ withRepo → @saas/db/catalog
```

`withRepo` (`src/repo.ts`) is the one place that opens the executor, starts the
timing envelope, and guarantees dispose — 30 handlers would otherwise each
re-derive it, and the dispose is the part someone eventually forgets.

## Read-path shape

Detail pages fan out to many small lists, so the read path is built to avoid
per-row queries:

- Cast characters are aggregated **inside** the credit query (`array_agg`), not
  fetched per credit.
- Poster and headshot lookups are batched by id
  (`getPrimaryImages`, `getPrimaryPersonImages`), so a rail of 50 titles is
  three queries rather than 101.
- The technical panel returns specs, countries, languages and filming
  locations in one response, because the page always renders them together.

## Boundaries

This Worker owns the `catalog` schema: its data, its invariants, its API
surface. No other context reads those tables; cross-context references
(a contributor's user id, an editorial org id) are opaque values, never FKs.
Public ids (`tt_…`, `nm_…`, `co_…`, `rm_…`, `vi_…`, `cr_…`) are decoded at the
router edge, so internal UUIDs never leave the worker.
