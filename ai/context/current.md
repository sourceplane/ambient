# Current Context (compact)

Last updated: 2026-08-02 (by the bootstrap close-out; keep this file
current as product work begins).

## State

ambient is a FRESHLY BOOTSTRAPPED baseline — instantiated from
`sourceplane/lumen` by the phased bootstrap (phases 01–06 + 08), live on
stage and prod, with **no product-specific feature work yet**.

- **What is deployed, where:** [deployment.md](deployment.md) — the
  generated manifest (verified URLs, identity, secrets inventory,
  provenance). Refresh it by re-running `flows/phases/08-docs`.
- **How to operate it:** [operations.md](operations.md) — the standing
  contract (deploy pipeline, tenancy, secrets model, verification).
- **Where it came from:** [fork-from-baseline.md](fork-from-baseline.md);
  inherited design decisions and risks: [decisions.md](decisions.md),
  [open-risks.md](open-risks.md) (both carry a provenance banner —
  baseline-session items may not apply here).

## Known tails inherited from the baseline

- Production OAuth/magic-link auth and Stripe need human-supplied
  credentials (`orun secrets set … --env <env>`; wire-now-seed-later).
- Notifications email needs one-time Cloudflare Email Service setup
  (Workers Paid plan + sending-domain DKIM/SPF).
- The custom domain (phase 07) has not been run — the product serves on
  workers.dev URLs; run 07 once the zone exists, then re-run 08.

## Next

Product work starts here. Replace this section with the active epic/task
state as it forms.
