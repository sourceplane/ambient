# community-worker-tests

Verification suite for `community-worker`.

A verify-only component: a red lane blocks the convergence.

## Gates

- Public reads never require a session; contributing, voting and moderating
  always do.
- A submitted fact is created `pending`, never `published`.
- A contribution's payload is never echoed back on the public shape.
- Vocabularies (fact kind, parents-guide category, severity, contribution
  target) are closed and validated.
