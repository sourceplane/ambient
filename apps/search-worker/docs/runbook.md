# search-worker — runbook

## How it deploys

Merges to `main` converge automatically: CI plans changed components and runs
this component's lane via `orun run --remote-state`. The `search` schema is
created by the `db-migrate` component (migration `240`), which plans on PRs and
applies on merge.

## Rollback

Revert the offending commit on `main`; the next convergence applies the
previous desired state. The index itself needs no rollback — it is a
projection, and republishing restores it.

## Verify

```bash
# typeahead — no auth
curl -s 'https://<api-edge>/v1/search/suggest?q=arr' | head -20

# a query that is only punctuation must return empty, not 500
curl -s -o /dev/null -w '%{http_code}\n' 'https://<api-edge>/v1/search?q=%26%26%26'
```

## Common failures

- **Empty results after a catalog write**: the publish is best-effort. Check
  the catalog-worker logs for `search_publish_failed` /
  `search_publish_unreachable`, then republish by re-saving the record.
- **503 on every query**: `PLATFORM_DB` unbound, or the `search` schema does
  not exist — check the `db-migrate` lane first.
- **`extension "pg_trgm" does not exist`**: migration `240` creates it. If the
  database role cannot create extensions, the extension must be enabled by an
  operator before the migration will apply.
- **A stale row keeps appearing**: the title was archived but the unpublish
  call failed. `DELETE /v1/internal/search/documents/title/<uuid>` over the
  service binding removes it.
