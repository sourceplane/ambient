# community-worker — architecture

A `cloudflare-worker-turbo` component built by the turbo pipeline from
`apps/community-worker`.

## Bindings

- **Hyperdrive** → `PLATFORM_DB`, fresh executor per request.
- No service bindings.

## Entity references

A list holds titles, people or images. The entity *type* is derived from the
public id's prefix (`tt_`, `nm_`, `rm_`), so a caller cannot claim a mismatched
type — and if they send one anyway, it is rejected rather than trusted.

## Counters

`item_count` and `like_count` are denormalized onto the list and moved in the
same transaction as the insert/delete, floored at zero. A like only moves the
counter when the `INSERT ... ON CONFLICT DO NOTHING` actually inserted.

## Deleting an item

By row id, in one statement, with ownership proven by an `EXISTS` subquery
against `lists.lists`. Scanning a page of items to find the row would silently
fail past the first page of a long list.

## Boundaries

`owner_user_id` and every `entity_id` are opaque cross-context references. This
Worker knows nothing about what a title *is*; hydration happens in the caller.
