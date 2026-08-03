# catalog-worker-tests — architecture

A `turbo-package` component in `tests/catalog-worker`, built and executed by
the turbo pipeline. It consumes `apps/catalog-worker` through the same
workspace packages production code uses, so contract drift fails here first —
before a deploy lane ever runs.

The router is exercised directly with a stubbed `Env`: no Hyperdrive, no
service bindings. That keeps the suite fast and hermetic, and it means the
tests assert the behavior the edge actually sees (status codes, ids, guards)
rather than re-testing SQL that `tests/db` already covers.
