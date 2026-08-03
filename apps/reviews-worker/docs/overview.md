# reviews-worker

Cloudflare Worker for the reviews bounded context — user reviews, helpfulness
voting, critic reviews and metascores.

Deployed per environment (`stage`, `prod`; `dev` is verify-only). Not publicly
routable — reached only through `api-edge` service bindings.

## What it owns

The `reviews` Postgres schema: user reviews and their moderation state,
one helpfulness vote per user per review, critic reviews, and the derived
metascore with its band counts.

## Decisions worth knowing

**Delete is soft.** Votes reference a review, and a hard delete would take them
with it. The row survives with `state = 'deleted'`, and the *partial* unique
index (`WHERE state <> 'deleted'`) frees the slot so the author can write a new
review instead of being permanently locked out by their own deletion.

**Editing someone else's review is a 404, not a 403.** The update is scoped by
`user_id` in the `WHERE` clause, so a wrong author never learns the review
exists.

**Spoilers are hidden by default.** The reviews list filters
`has_spoilers = FALSE` unless the caller asks for `spoilers=show`. The veil is
the default, not an opt-in.

**A vote flip moves two counters.** Changing helpful → unhelpful decrements one
and increments the other in one transaction; it does not add a second vote.

**The moderation queue is oldest-first.** A queue sorted newest-first starves
its own tail.

## Metascore

Recomputed in SQL from the scored critic rows. A publication that issues no
score contributes a quote but must not drag the average, so `score IS NULL` is
excluded from the mean and from the band counts. The band
(`positive` ≥ 61, `mixed` ≥ 40, `negative` below) is derived once in this
worker so the pill's colour cannot drift between consumers.

## Depended on by

- **api-edge** — public review reads plus the authenticated write, vote and
  moderation surfaces
