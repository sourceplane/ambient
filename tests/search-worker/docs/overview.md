# search-worker-tests

Verification suite for `search-worker`.

A verify-only component: its lane runs this suite on every plan that includes
it. Nothing deploys from here — a red lane blocks the convergence.

## Gates

- Free text can never produce a `to_tsquery` syntax error: punctuation-only
  input returns empty, and operator characters are stripped, not passed through.
- Query parsing rejects out-of-range limits, offsets, years, ratings and
  unknown sort keys with a 422 naming the field.
- The internal publish seam validates every document and is never reachable
  through the edge.
