# Catalog — the web surface

What shipped in M8–M10, where it lives, and how to fill it with data.

The public site and the operator console are one deployment
(`apps/web-console-next`) and two products. They share the Tailwind
config, the Radix primitives and the tokens file; they share no chrome.

## Routes

### Public site — inside the `(site)` route group

| Route | What it is |
|---|---|
| `/` | Home: hero strip, chart-driven rails, popular people, news, genre chips |
| `/title/:titleId` | Title overview |
| `/title/:titleId/{fullcredits,episodes,reviews,ratings,mediaindex,videogallery,trivia,goofs,quotes,awards,parentalguide,faq,keywords,releaseinfo,technical}` | Title sub-routes |
| `/name/:nameId` | Person: bio, known-for, filmography by department, photos, awards |
| `/find?q=` | Full-text results, tabbed by entity type |
| `/search/title`, `/search/name` | Advanced search, URL-synced, three view modes |
| `/chart/:chartSlug` | `top`, `toptv`, `bottom`, `moviemeter`, `tvmeter`, `boxoffice`, `coming-soon`, `in-theaters` |
| `/watchlist` | The signed-in user's watchlist |
| `/list/:listId` | A list |
| `/user/:userId` | Public profile: lists and reviews |
| `/news` | News index |
| `/awards` | Points at where awards actually live (see below) |

### Console — unchanged, plus one new entry point

`/studio` resolves an operator to their last-used org, or to
`/onboarding`, or to `/login`. Every console route it used to reach
(`/orgs/…`, `/account`, `/login`, `/onboarding`) is exactly where it was.

## The seams that matter

**The client is where contexts meet.** Charts, watchlists and lists all
return bare entity ids, because the service that produced them cannot
read the catalog's schema. `GET /v1/titles?ids=…` is the batch read that
joins them — in the caller's order, dropping ids that no longer resolve.
Without it every one of those surfaces costs one request per poster.

**Chart score is the weighted rating.** A chart rail therefore needs no
per-title rating fetch: two requests render fifty posters with their
numbers.

**Rails fall back; empty rails hide.** A chart needs rated titles to
rank. Where a plain catalogue browse would show the same thing, the rail
degrades to one; where it would not — *In theaters* and *Coming soon* are
defined by release timing — the rail hides rather than padding itself
with unrelated films.

**`/awards` is honest about what it can't do.** The API exposes awards
per title, per person and per edition, but has no route listing awarding
bodies. Rather than fake a directory, the page says where awards are
visible and stops. Add `GET /v1/awards` and this page becomes real.

**A public profile has no ratings section.** `/v1/me/ratings` is
caller-scoped and there is no public equivalent. An empty "Ratings"
heading would claim the user has rated nothing, which is a different
statement from "we don't publish those".

## Design system

`.site` is a theme scope, not a second design system — one class on the
public shell, defined in `src/styles/globals.css`:

- near-black layered surfaces (never pure black, so posters keep shadows)
- one warm amber accent, darkened in light mode until it clears AA
- fluid display type via `clamp()`, tabular figures for every number
- `--site-*` custom properties plus utilities (`.site-surface`,
  `.site-meta`, `.site-rail`, `.site-focus`, …)

Components live in `src/components/site/`. Logic that has a rule in it
lives in `src/lib/site-*.ts` and is unit-tested:
`site-format`, `site-routes`, `site-home`, `site-credits`, `site-title`,
`site-search`.

## Seeding a catalog

A fresh deployment has a working site and an empty catalog. The site
says so — but to see it with content:

```bash
AMBIENT_TOKEN=<bearer for a catalog curator> \
node tooling/seed/catalog.mjs \
  --api-url https://<api-edge host> \
  --org org_<32hex>
```

`--dry-run` prints the plan without writing. `--dataset <path>` uses a
different file; the default is `tooling/seed/dataset.json`.

The token's actor needs `catalog.title.write`, `catalog.person.write`,
`catalog.credit.write` and `catalog.media.write` in the target org — the
owner role has all four.

**It seeds through the curation API, not through SQL.** Curation is what
validates input, derives sort titles and slugs, publishes documents to
the search index, and writes audit entries. A direct `INSERT` skips all
four and leaves search silently stale.

**It is idempotent.** Each title is looked up by primary title and year
before being created, so re-running tops the catalog up rather than
duplicating it.

**It ships no artwork.** The curation API requires a real `http(s)` image
URL — correctly, since a catalog full of data-URI placeholders is a
catalog full of junk. Titles seeded without images render the site's
poster fallback. Add `images` entries to the dataset pointing at a host
you control.

## SDK and CLI

`@saas/sdk` gained six namespaces over the same public surface:
`client.catalog`, `.search`, `.ratings`, `.reviews`, `.lists`,
`.community`. `catalog.batchTitles()` performs no request for an empty
input, which is what makes it safe to call unconditionally.

`@saas/cli` gained five read commands. They are the only commands in the
CLI that work signed out, because the routes are public:

```
ambient catalog search <query> [--type=…] [--limit=N]
ambient catalog title <tt_id>
ambient catalog credits <tt_id> [--category=cast|crew] [--limit=N]
ambient catalog name <nm_id>
ambient catalog chart <chart-key> [--limit=N]
```

`catalog chart` demonstrates the batch seam: one chart read plus one
hydrate, regardless of `--limit`.

## Verified on stage

Every `/v1` route answers through `api-edge`, and the site serves at the
root of the stage console host with the console intact at `/studio` and
`/orgs`. The catalog is empty until someone seeds it, which is what the
home page says.

Two bugs were found by exercising the deployment rather than the test
suite, and both are worth remembering:

- **`= ANY($n)` with a JS array throws at bind time.** `/v1/titles`
  returned 503 while `/v1/names` — the same shape of query without an
  array parameter — returned 200. See
  [decisions.md](../../context/decisions.md).
- **A component whose deploy lane fails is never retried** until its own
  files change again, because `orun plan --changed` is per-push and
  path-based. That is why stage's `api-edge` served M3 for hours after
  M4–M7 had merged. The six catalog workers now declare their `db`
  dependency; the platform workers still do not.

## Accessibility and budget

- Skip link, visible 2 px accent focus ring on every interactive element.
- The rating picker is a `radiogroup` (arrow keys walk the scale); the
  lightbox and mega-search have explicit key maps; rails scroll natively
  so their content stays in the accessibility tree and in find-in-page.
- Spoiler veils keep the block's real height and are `aria-hidden` while
  veiled — revealing one never shifts the page, and a screen reader is
  never read the thing the veil exists to hide.
- Every image sits in an `aspect-ratio` box: no layout shift.
- All motion is transform/opacity and collapses under
  `prefers-reduced-motion`.
- Every route is 130–143 kB First Load JS against the 180 kB budget.
