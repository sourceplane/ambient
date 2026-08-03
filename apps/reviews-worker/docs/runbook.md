# reviews-worker — runbook

## How it deploys

Merges to `main` converge automatically. The `reviews` schema is created by the
`db-migrate` component (migration `270`).

## Rollback

Revert the commit; the next convergence applies the previous desired state.
Review content is unaffected by a deploy. A wrongly moderated review is fixed
by another decision, not by a rollback.

## Verify

```bash
curl -s 'https://<api-edge>/v1/titles/<tt_id>/reviews?sort=helpfulness'
curl -s 'https://<api-edge>/v1/titles/<tt_id>/metascore'
```

## Common failures

- **409 on a new review**: the author already has a live review for that
  title. Editing the existing one is the intended path; deleting it first also
  works, because the unique index is partial.
- **A review vanished after an edit**: check its `state`. A moderator moving it
  to `rejected` removes it from every public read.
- **Metascore is null with critic reviews present**: none of them carry a
  score. That is correct — an unscored publication contributes a quote only.
- **Counts look wrong**: they are transactional, so drift means something other
  than this Worker wrote the row.
