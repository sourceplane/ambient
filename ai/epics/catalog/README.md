# Epic: Catalog — an IMDb-class title database on ambient

**Status:** active · **Owner:** platform · **Started:** 2026-08

ambient today is a live multi-tenant SaaS substrate: identity, membership,
policy, projects, config, events, metering, billing, notifications,
webhooks and integrations, all deployed as bounded-context Cloudflare
Workers behind one public edge, with a Next.js console on Workers +
Static Assets.

This epic turns that substrate into a **product**: a public, modern
movie/TV/game title database with feature parity to IMDb — titles,
people, credits, ratings, reviews, lists, charts, awards, images,
community facts and a contribution pipeline — served through a
poster-forward, cinematic web experience.

Nothing about the platform substrate is thrown away. Identity becomes
the account system; policy becomes the moderation/permission model;
events becomes the contribution audit trail; metering and rate limiting
protect the public read surface; notifications drive watchlist and
contribution mail. The SaaS control plane keeps working — the site takes
the root and the console gains `/studio` as its front door, with every
one of its existing routes (`/orgs`, `/account`, `/login`,
`/onboarding`) untouched. Moving them would have broken every link and
bookmark an operator has for no gain; taking `/` was the only change the
product actually needed.

---

## 1. Goals

1. **Feature parity with IMDb's consumer product.** Every consumer-facing
   surface IMDb ships has a counterpart here (§3 is the tracked matrix).
2. **One public API.** Everything the site renders is available at
   `/v1/…` through `api-edge`, contract-typed in `@saas/contracts` and
   exposed through `@saas/sdk`. No private back-channel.
3. **Modern design.** Not an IMDb reskin — a cinematic, poster-forward,
   dark-first interface with a real design system, fluid type, motion
   that respects `prefers-reduced-motion`, and AA contrast throughout.
4. **The architecture stays honest.** Each new domain is its own bounded
   context: its own schema, its own Worker, its own contract package
   surface, reached only through the edge or a service binding.

## 2. Non-goals

- Ingesting a licensed IMDb/TMDb dataset. The catalog is *our* data with
  our own IDs; importers are a seam (`catalog.external_ids`), not a
  dependency.
- Streaming or hosting video. Trailers and clips are references to an
  external asset URL plus our own metadata.
- IMDbPro's paid industry tooling (contact info, representation,
  submission portals). The data model leaves room; the epic does not
  build it.
- Message boards. IMDb retired them; we do not resurrect them.

## 3. Feature parity matrix

Each row is tracked to the milestone that lands it (§5).

### Catalog data

| Feature | Milestone |
|---|---|
| Title records: movie, tv_series, tv_mini_series, tv_episode, tv_special, tv_movie, short, video, video_game, podcast_series, podcast_episode | M1 |
| Primary/original title, year, end year, runtime, adult flag, status (released/post-production/announced) | M1 |
| Plot outline, plot summary, taglines, synopsis (long, spoiler-flagged) | M1 |
| Genres (many-to-many, ordered) | M1 |
| AKAs — per-region/language alternate titles with attributes | M1 |
| Release dates per country, with premiere/limited/wide/digital kinds | M1 |
| Certificates (age ratings) per country, with attributes | M1 |
| Countries of origin, spoken languages, filming locations | M1 |
| Box office (budget, opening weekend, gross domestic/worldwide) | M1 |
| Production companies, distributors, other companies (typed) | M1 |
| Keywords (plot keywords, votable) | M1 |
| Technical specs (aspect ratio, sound mix, color, camera, negative/printed format) | M1 |
| Title connections (sequel, prequel, remake, spin-off, references, featured in, spoofs) | M1 |
| Series ↔ season ↔ episode hierarchy with episode numbering and airdates | M1 |
| People: name, birth/death date + place, height, bio, mini-bio credits | M1 |
| Credits: cast (character, billing order, episode count) and crew by department/job | M1 |
| Person "known for" (derived) and per-department filmography | M1, M4 |
| External IDs (official site, Wikipedia, social) | M1 |
| Read API for all of the above | M2 |
| Write/curation API (staff-authored, policy-gated) | M2 |

### Ratings, charts, discovery

| Feature | Milestone |
|---|---|
| 1–10 user rating, one per user per title, editable and removable | M4 |
| Weighted average rating + vote count, recomputed incrementally | M4 |
| Rating distribution histogram (10 buckets) | M4 |
| Demographic breakdown (age band × gender band, privacy-floored) | M4 |
| Episode ratings roll up into a series rating panel | M4 |
| Top 250 movies, Top 250 TV, Bottom 100 (Bayesian, eligibility-gated) | M4 |
| Popularity meters: MOVIEmeter / STARmeter rank + weekly delta | M4 |
| Trending / most-popular / in-theaters / coming-soon / new-releases | M4 |
| "More like this" recommendations (genre + keyword + people overlap) | M4 |
| Personal recommendations from a user's ratings | M10 |

### Search

| Feature | Milestone |
|---|---|
| Typeahead across titles, people, companies, keywords, lists | M3 |
| Full-text search with ranking and per-entity tabs | M3 |
| Advanced title search: genre, year range, rating range, votes, runtime, certificate, country, language, keyword, company, cast/crew | M3 |
| Advanced name search: birth/death range, birthplace, profession, has-credits-in | M3 |
| Sortable, cursor-paginated results (popularity, rating, votes, release date, alphabetical, runtime) | M3 |

### Community & user

| Feature | Milestone |
|---|---|
| User reviews: title, body, rating, spoiler flag, permalink | M5 |
| Review helpfulness voting and sort (helpfulness/date/rating) | M5 |
| Critic reviews + aggregate metascore | M5 |
| Review moderation states (published/pending/rejected) | M5 |
| Watchlist (add/remove, ordering, sort) | M6 |
| Custom lists: ranked or unranked, public/private, descriptions per item | M6 |
| List likes, list search, list embeds | M6 |
| Public user profile: ratings, reviews, lists, activity | M10 |
| Trivia, goofs, quotes, crazy credits, alternate versions | M7 |
| Parents guide with per-category severity votes | M7 |
| FAQ entries per title | M7 |
| Awards: bodies, editions, categories, nominations and wins | M7 |
| Contribution submission + moderation queue + contributor reputation | M7 |
| News articles attached to titles/people | M7 |

### Media

| Feature | Milestone |
|---|---|
| Images: poster, still, backdrop, event photo, headshot — with dimensions, caption, credit | M1, M2 |
| Image galleries per title/person, filterable | M9 |
| Videos: trailer, teaser, clip, featurette, behind-the-scenes with runtime and thumbnail | M1, M2 |
| Video player surface with related-video rail | M9 |

### Web experience

| Feature | Milestone |
|---|---|
| Cinematic design system (tokens, type scale, poster/rating/media primitives) | M8 |
| Public shell: sticky nav, mega search, menus, footer, responsive + mobile tabs | M8 |
| Home: hero rail, trending, top picks, fan favorites, coming soon, news | M8 |
| Title page with all tabs (cast, credits, episodes, media, trivia, parents guide, awards, reviews, technical) | M9 |
| Name page: known-for, filmography by department, bio, photos, awards | M9 |
| Search results + advanced search forms | M10 |
| Chart pages (Top 250, popular, box office) with poster/detail/grid view modes | M10 |
| Watchlist, list detail/editor, ratings history, review composer | M10 |
| Account: profile, preferences, contribution history | M10 |
| Accessibility: keyboard nav, focus rings, skip links, AA contrast, reduced motion | M8–M10 |

## 4. Architecture

New bounded contexts, one Cloudflare Worker each, all private and reached
through `api-edge` service bindings — exactly the existing pattern:

```
apps/catalog-worker        titles, people, credits, episodes, media, companies, keywords
apps/search-worker         search index maintenance + query (FTS/trigram)
apps/ratings-worker        user ratings, aggregates, charts, popularity meters
apps/reviews-worker        user + critic reviews, helpfulness votes, moderation
apps/lists-worker          watchlist and custom lists
apps/community-worker      awards, trivia/goofs/quotes, parents guide, FAQ, news, contributions
```

Supporting changes:

- `packages/db/src/catalog|ratings|reviews|lists|community` — repositories
  per context, each owning its own Postgres schema. No cross-schema FKs;
  ids are opaque references, as the existing contexts do.
- `packages/contracts/src/catalog|search|ratings|reviews|lists|community`
  — request/response types shared by workers, SDK and console.
- `apps/api-edge` — one facade module per context, with public
  (unauthenticated, cacheable) and authenticated route classes.
- `apps/web-console-next` — becomes the public site. The existing
  org/project console keeps working under `/studio`.

### Public vs authenticated reads

The catalog read surface is public and heavily cached; the personal
surface (ratings, watchlist, lists, contributions) is session-bound.
`api-edge` gains a *public route class*: no session required, per-IP rate
limited, `Cache-Control` + `ETag` set at the edge. Deny-by-default policy
still governs every write.

### Identity mapping

| Platform concept | Product meaning |
|---|---|
| user | account (ratings, lists, reviews, contributions) |
| organization | studio/partner workspace for API access and staff |
| policy role | `viewer` → public, `contributor`, `moderator`, `editor`, `staff` |
| events | contribution + moderation audit trail |
| metering | API partner quota; public-read abuse metering |
| billing | API partner plans (already live) |
| notifications | watchlist digests, contribution decisions |

## 5. Milestones

Every milestone is one PR, verified (`typecheck`, `lint`, `test`, build)
before merge. Merging converges the stack — see
[operations.md](../../context/operations.md).

| # | Milestone | Lands |
|---|---|---|
| M1 | Catalog data foundation | migrations `200`–`230`, `@saas/db/catalog`, `@saas/contracts/catalog`, repo tests |
| M2 | catalog-worker + edge | title/name/episode/media read + curation API, public route class at the edge |
| M3 | search-worker | typeahead, full-text, advanced title/name search |
| M4 | ratings-worker | ratings, aggregates, distributions, charts, popularity, more-like-this |
| M5 | reviews-worker | user reviews, helpfulness, critic reviews, metascore, moderation |
| M6 | lists-worker | watchlist, custom lists, likes, visibility |
| M7 | community-worker | awards, trivia/goofs/quotes, parents guide, FAQ, news, contributions + moderation |
| M8 | Web foundation | design system, public shell, home page |
| M9 | Web title + name | title page and all its tabs, name page, media galleries |
| M10 | Web discovery + user | search/browse/charts, watchlist/lists/ratings/reviews/profile, SDK + CLI + seed + docs |

**Dependency order:** M1 → M2 → {M3, M4, M5, M6, M7} → M8 → M9 → M10.
M3–M7 depend only on M1/M2 and may land in any order.

## 6. Definition of done

- Every row in §3 is implemented and reachable from the public API and
  from the web app.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` is green.
- Each new component ships `docs/overview.md`, `docs/architecture.md`,
  `docs/runbook.md` and a `component.yaml` subscribed to `dev`/`stage`/`prod`.
- Every migration is registered in `packages/db/src/manifest.ts` with a
  checksum and applies cleanly from an empty database.
- `ai/context/current.md` reflects the shipped state.

## 7. Reference documents

- [data-model.md](data-model.md) — schemas, tables, invariants
- [api.md](api.md) — the public `/v1` surface
- [design.md](design.md) — the design system and page specs
