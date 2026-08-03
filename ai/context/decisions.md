# Decisions

Architecture and process decisions for ambient. Add an entry per
decision (date, decision, rationale); prune superseded ones.

## Active Decisions

- The `dev` environment is verify-only by design: plan/verify lanes
  run, nothing deploys and no dev database exists.
- Provider credentials are brokered per-run from workspace
  integrations; no long-lived provider secrets at rest, and no
  tooling may print a secret value.
- Merges to `main` converge automatically; the convergence run is
  the deployment (see [operations.md](operations.md)).
- **No repository binds a JavaScript array as a query parameter.**
  `createSqlExecutor` must run postgres.js with `fetch_types: false`
  (the client is per-request), which leaves an array parameter without a
  resolvable element-type OID — the driver throws at bind time, so the
  request 500s rather than returning nothing. Use `inList()` from
  `@saas/db/hyperdrive` to expand a list into scalar placeholders. This
  has bitten twice (org members list, task 0132; the whole catalog read
  surface, M10) and is now enforced by a test that scans every
  repository source.
