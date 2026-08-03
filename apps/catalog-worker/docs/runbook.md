# catalog-worker — runbook

## How it deploys

Merges to `main` converge automatically: CI plans changed components
(`orun plan --changed`) and runs this component's lane via
`orun run --remote-state` with credential-free OIDC auth. The convergence run
is the deployment; the DAG orders this component after everything it depends
on. Failed lanes resume with `gh run rerun --failed`.

The `catalog` schema is created by the `db-migrate` component
(migrations `200`–`230`), which plans on PRs and applies on merge. This Worker
has no migration step of its own — if a deploy lands before the migration,
reads return 503 rather than corrupting anything.

## Rollback

Revert the offending commit on `main`; the next convergence applies the
previous desired state. Catalog data itself is not rolled back by a revert —
an archive is a status change (`status = 'archived'`), so restoring a title is
a curation write, not a deploy.

## Verify

The deploy lane's own verify/smoke is the gate. End-to-end behavior is
exercised through `api-edge` (this Worker has no public URL):

```bash
# public read — no auth, expect 200 and a cache validator
curl -si https://<api-edge>/v1/genres | head -20

# the ETag round trip should come back 304
etag=$(curl -sI https://<api-edge>/v1/genres | awk -F'"' '/etag/{print $2}')
curl -so /dev/null -w '%{http_code}\n' -H "If-None-Match: \"$etag\"" https://<api-edge>/v1/genres
```

## Common failures

- **503 on every read**: `PLATFORM_DB` is unbound, or the `catalog` schema does
  not exist yet — check the `db-migrate` lane first.
- **404 on a title you just created**: the row is `draft` or `archived`. The
  public read surface filters to `published` and does not distinguish "hidden"
  from "absent" on purpose.
- **404 on a curation write**: policy denied. Deny returns 404 by design, so
  check the caller's role in the editorial org rather than looking for a 403.
- **Service-binding target missing (Cloudflare 10143)**: the target Worker does
  not exist yet on this account — converge the fleet before this lane.
- **409 on a credit write**: the `(title, person, department, job, billing
  slot)` uniqueness index rejected a duplicate. Two identical credits are a
  data-entry mistake, not a supported state.
