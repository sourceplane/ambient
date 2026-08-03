# ratings-worker — runbook

## How it deploys

Merges to `main` converge automatically. The `ratings` schema is created by the
`db-migrate` component (migrations `250`, `260`), which plans on PRs and
applies on merge.

## Rebuilding a chart

Charts do not rebuild themselves; something must call the internal seam:

```
POST /v1/internal/ratings/charts/recompute
{ "chart": "top_movies", "computedFor": "2026-08-03" }
```

It is idempotent for a given `(chart, computedFor)` — the snapshot for that
date is replaced, and `previous_rank` is carried from the newest earlier
snapshot. Re-running it after a bad rebuild is safe.

## Rollback

Revert the commit; the next convergence applies the previous desired state.
Votes are not affected by a deploy. A bad chart snapshot is fixed by
recomputing it, not by rolling back.

## Verify

```bash
curl -s https://<api-edge>/v1/charts/top_movies?limit=10
curl -s https://<api-edge>/v1/titles/<tt_id>/rating
```

## Common failures

- **Average and histogram disagree**: should be impossible — they move in one
  transaction. If it happens, the aggregate row was written by something other
  than this Worker.
- **Chart is empty**: no snapshot has been computed, or no title clears the
  chart's `minimum_votes`. Check `ratings.chart_definitions`.
- **Demographics come back empty on a popular title**: every cell is below the
  25-vote privacy floor. That is the designed behavior, not a bug.
- **503 on every route**: `PLATFORM_DB` unbound or the `ratings` schema is
  missing — check the `db-migrate` lane first.
