# reviews-worker — architecture

A `cloudflare-worker-turbo` component built by the turbo pipeline from
`apps/reviews-worker`.

## Bindings

- **Hyperdrive** → `PLATFORM_DB`, fresh executor per request.
- No service bindings — called, calls nobody.

## Route classes

| Class | Routes |
|---|---|
| Public | `GET /v1/titles/:id/reviews`, `/critic-reviews`, `/metascore`, `GET /v1/reviews/:id`, `GET /v1/users/:id/reviews` |
| Authenticated | `POST /v1/titles/:id/reviews`, `PATCH`/`DELETE /v1/reviews/:id`, `POST`/`DELETE /v1/reviews/:id/vote` |
| Moderator | `GET /v1/moderation/reviews`, `POST /v1/moderation/reviews/:id/decision` |

The moderator surface is authenticated at the edge and authorized here — it
must never be reachable without a token at all, which is why `requiresSession`
treats it as authenticated regardless of method.

A `pending` or `rejected` review reads as **absent** from the public surface;
only the moderator view carries `state`, `moderatedAt` and `decisionNote`.

## Transactional counters

Helpfulness counts live on the review row and move in the same transaction as
the vote, with the prior vote read `FOR UPDATE`. Both counters are floored at
zero, so a double-clear cannot drive them negative.

## Boundaries

`title_id` and `user_id` are opaque cross-context references. The review body
is stored as submitted; escaping is the rendering layer's job, and doing it
here would corrupt the stored text.
