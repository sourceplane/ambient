# lists-worker

Cloudflare Worker for the lists bounded context — the watchlist and
user-curated lists.

Deployed per environment (`stage`, `prod`; `dev` is verify-only). Not publicly
routable — reached only through `api-edge` service bindings.

## The watchlist is a list

`kind = 'watchlist'`, one per user, enforced by a partial unique index. That is
the whole design: every list feature — ordering, notes, sorting, bulk removal,
item counts — works on the watchlist unchanged, and the "add to watchlist"
toggle and the "add to list" menu share one code path instead of two that
drift.

`ensureWatchlist` is a true get-or-create (`ON CONFLICT` against that partial
index), so two concurrent first-adds cannot produce two watchlists.

The watchlist cannot be deleted. It is structural: the toggle needs somewhere
to write. Renaming or emptying it is allowed.

## Visibility

`public`, `unlisted` and `private`. A private list is a **404** to anyone but
its owner, never a 403 — a wrong viewer must not learn it exists. Someone
else's profile shows their public and unlisted lists; only the owner sees
private ones.

## Idempotent by design

- `PUT /v1/me/watchlist/:entityId` on a title already there succeeds.
- `DELETE` on something that was never there succeeds.
- Liking twice moves the counter once.

In each case the caller's intent — "this should (not) be on my list" — is
satisfied, and a toggle that errors on double-click is a worse product than
one that doesn't.

## Depended on by

- **api-edge** — the personal `/v1/me` surface and public list reads
