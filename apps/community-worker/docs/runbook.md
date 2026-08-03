# community-worker — runbook

## How it deploys

Merges to `main` converge automatically. The `community` schema is created by the
`db-migrate` component (migration `290`).

## Rollback

Revert the commit; the next convergence applies the previous desired state.
List contents are unaffected by a deploy.

## Verify

```bash
# with a session token
curl -s -H "Authorization: Bearer $TOKEN" https://<api-edge>/v1/me/watchlist
curl -s -X PUT -H "Authorization: Bearer $TOKEN" \
     https://<api-edge>/v1/me/watchlist/<tt_id>
```

## Common failures

- **404 on someone's list**: it is private, and the caller is not the owner.
  That is the designed response — private lists do not announce themselves.
- **404 deleting the watchlist**: the watchlist cannot be deleted. Empty it or
  rename it instead.
- **`item_count` looks wrong**: it is transactional, so drift means something
  other than this Worker wrote the row.
- **503 on every route**: `PLATFORM_DB` unbound or the `community` schema missing —
  check the `db-migrate` lane first.
