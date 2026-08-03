# catalog-worker-tests

Verification suite for `catalog-worker`.

A verify-only component: its lane runs this suite against its target
component on every plan that includes it. Nothing deploys from here — a red
lane blocks the convergence, which is the point.

## Gates

- Public reads never require a session, and never surface a `draft` or
  `archived` row.
- Curation writes are rejected without an actor, and denied (as 404) without
  the matching `catalog.*` permission.
- Public ids round-trip; a malformed or wrong-prefix id is a 404, never a 500.
- Request validation rejects out-of-range values and non-http(s) media URLs.
