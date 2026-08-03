# ratings-worker-tests

Verification suite for `ratings-worker`.

A verify-only component: its lane runs this suite on every plan that includes
it. Nothing deploys from here — a red lane blocks the convergence.

## Gates

- A rating outside 1–10, or a non-integer, is a 422 and never reaches the
  bucket columns.
- Personal routes 401 without an actor; public routes never require one.
- Chart reads never blend two snapshots, and an unknown chart key is a 404.
- The weighted average regresses a low-vote title toward the prior.
