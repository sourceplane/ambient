# search-worker — architecture

A `cloudflare-worker-turbo` component: TypeScript Worker built by the turbo
pipeline from `apps/search-worker`, deployed per environment by its CI lane.

## Bindings and wiring

- **Hyperdrive** → `PLATFORM_DB` — pooled Postgres, fresh executor per request.
- **No service bindings.** This Worker calls nobody; it is called.
- **Wired configuration** (resolved at deploy time from job-output secrets;
  names only): `WIRING_CLOUDFLARE_HYPERDRIVE_STAGE`,
  `WIRING_CLOUDFLARE_HYPERDRIVE_PROD`.

## The index

`search.documents` is `(entity_type, entity_id)` keyed, with:

- a **generated** `tsvector` weighted A/B/C over display, secondary and body,
  so a match on the title outranks a match on buried text — and so the vector
  can never drift from the columns it summarizes;
- a **GIN trigram** index on `display` for prefix/typo-tolerant typeahead;
- a **GIN jsonb_path_ops** index on `filters` for advanced-search facets;
- `(entity_type, popularity DESC)` for the empty-query browse case.

## Query construction

Free text never reaches `to_tsquery` raw. `toPrefixTsQuery` tokenizes on
non-alphanumerics and rebuilds `token:* & token:*`, so a user typing `&` or `!`
gets no results rather than a syntax error. Sort keys map to fixed SQL
fragments chosen from a closed set — never interpolated — and an unknown key
degrades to popularity instead of erroring, so a stale client still works.

Paging is offset-based, not keyset: ranked results have no stable key to carry
in a cursor. The offset is bounded so a crawler cannot walk the whole index.

## Boundaries

The `search` schema is owned entirely by this Worker. Nothing else writes it,
and it reads nothing else — the publish seam is the only way in.
