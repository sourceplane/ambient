# search-worker-tests — architecture

A `turbo-package` component in `tests/search-worker`, built and executed by the
turbo pipeline. It exercises the router with a stubbed `Env` (no Hyperdrive)
and unit-tests the query builder directly, so the suite is fast, hermetic, and
asserts the behavior the edge actually sees.
