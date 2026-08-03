# reviews-worker-tests

Verification suite for `reviews-worker`.

A verify-only component: a red lane blocks the convergence.

## Gates

- Public reads never require a session; every write, vote and moderation route
  does.
- Spoilers are excluded unless explicitly requested.
- A non-published review is invisible to the public read surface.
- The metascore band matches the published thresholds.
