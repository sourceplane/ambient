# lists-worker-tests

Verification suite for `lists-worker`.

A verify-only component: a red lane blocks the convergence.

## Gates

- Every `/v1/me` route and every mutation requires an actor.
- A private list is a 404 to a non-owner, on both the list and its items.
- Entity type is derived from the id prefix and a mismatched claim is rejected.
- The watchlist cannot be deleted.
