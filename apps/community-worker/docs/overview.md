# community-worker

Cloudflare Worker for the community bounded context — awards, contributed
facts, parents guide, FAQ, news and the contribution queue.

Deployed per environment (`stage`, `prod`; `dev` is verify-only). Not publicly
routable — reached only through `api-edge` service bindings.

## What it owns

The `community` Postgres schema: award bodies, editions, categories and
nominations; trivia/goofs/quotes/crazy credits/alternate versions/soundtrack
entries; the parents guide with per-category severity voting; per-title FAQ;
news articles and their entity links; and the contribution queue with
contributor reputation.

## Decisions worth knowing

**Contributed content lands in the queue, not on the page.** A submitted fact
is created `pending`. Publishing is a moderator decision, never a side effect
of submitting — otherwise "contribute" is just "write".

**Quotes are structured.** A quote is a sequence of speaker/line pairs in
`title_quote_lines`, not a text blob, which is what lets the page render
dialogue. They batch-load by fact id so a quotes tab is two queries, not one
per quote.

**A nomination needs a subject.** `CHECK (title_id IS NOT NULL OR person_id IS
NOT NULL)` — a nomination attached to neither is not a nomination.

**Severity is the modal vote.** The parents guide shows the most-voted severity
per category plus the full tallies, resolved after all buckets are counted
rather than while iterating rows.

**Fact votes are an anonymous tally.** "Was this interesting" orders the list;
it is not an identity-bearing vote like a rating, so it needs no per-user row.

**Reputation is derived.** `approved × 3 − rejected`, recomputed from the
counters on every decision, so it can never disagree with the history it
summarizes.

**The payload is not echoed back.** A contribution's proposed change is
withheld from the public shape — returning it invites clients to render
unmoderated content as if it were live.

## Depended on by

- **api-edge** — public award/fact/guide/FAQ/news reads, plus the
  authenticated contribute, vote and moderate surfaces
