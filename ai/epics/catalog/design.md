# Catalog epic — design system and page specs

The console today is a competent Linear/Vercel-style admin surface:
neutral carbon, indigo primary, dense tables. That vocabulary is right
for `/studio` and wrong for a consumer film site.

The public site gets its own layer on the same primitives: same Tailwind
config, same Radix components, same tokens file — a second theme scope
plus a set of media-first components. Nothing is forked.

## 1. Design direction

**Cinematic, poster-forward, dark-first.** The interface is a frame
around artwork; artwork provides the color. Chrome is near-black and
recedes; a single warm accent carries interaction.

- **Surface** — layered near-black (`#0A0A0B` → `#141416` → `#1C1C20`),
  no pure black, so posters keep their shadows.
- **Accent** — warm amber (`43 96% 56%`). Ratings, primary actions,
  focus. One accent only; genre chips and charts borrow from a
  categorical ramp, never from the accent.
- **Light theme** is real, not an afterthought: warm paper white,
  same amber accent darkened for AA on white.
- **Type** — a display face for titles (fluid `clamp()` scale up to
  `3.5rem`), the existing sans for body, tabular numerals for ratings,
  years and runtimes.
- **Density** — generous. Content rails scroll horizontally; grids are
  `repeat(auto-fill, minmax(…))` so nothing is pinned to a breakpoint.
- **Motion** — 150–250 ms ease-out, transform/opacity only. Poster
  hover lifts 2 px and reveals the quick-actions overlay. All of it
  collapses under `prefers-reduced-motion`.

### Tokens added (`--site-*` scope)

```
--site-bg            near-black base
--site-surface       card
--site-surface-2     raised (hover, popovers)
--site-overlay       scrim over artwork
--site-accent        amber
--site-accent-fg     on-accent text
--site-rating        rating star gold
--site-meta          secondary metadata text
--site-hairline      1px separators
--site-radius-poster 0.5rem
--site-shadow-poster layered, warm-tinted
```

Applied via a `.site` class on the public shell so `/studio` is
untouched. Both themes are defined; the toggle stays `next-themes`.

## 2. Component inventory (M8)

| Component | Notes |
|---|---|
| `PosterCard` | 2:3 aspect, lazy image, rating pill, watchlist ribbon, hover quick-actions, skeleton variant |
| `PosterRail` | horizontally scrolling rail, snap points, edge fades, keyboard arrows, "see all" tail |
| `TitleHero` | backdrop with gradient scrim, poster, title block, meta row, rating cluster, trailer CTA |
| `RatingPill` / `RatingStars` | display + interactive 1–10 star picker with keyboard support |
| `RatingHistogram` | 10-bucket bar chart, accessible table fallback |
| `MetascorePill` | green/yellow/red bands |
| `PersonCard` | circular headshot, name, known-for line |
| `CreditRow` | person, character/job, episode count |
| `MediaGrid` / `Lightbox` | image grid with keyboard-navigable lightbox |
| `VideoCard` / `VideoPlayer` | thumbnail + duration badge; player with related rail |
| `ChipGroup` | genres, keywords, filters — toggleable, links |
| `FactList` | trivia/goofs/quotes with spoiler blur and reveal |
| `SpoilerVeil` | click/keyboard to reveal, remembers per session |
| `SeverityMeter` | parents-guide severity with vote tallies |
| `EpisodeRow` | still, number, title, airdate, rating, synopsis |
| `SectionHeader` | title + "see all" + count |
| `MegaSearch` | typeahead overlay: grouped results, recent searches, keyboard-first |
| `FilterPanel` | advanced search sidebar; syncs to URL |
| `EmptyState` / skeletons | one per surface, no layout shift |

## 3. Shell (M8)

- **Top bar** — logo, category menu (Movies / TV / Celebs / Awards /
  Charts / Watchlist), search (expands to `MegaSearch` overlay,
  `/` focuses), watchlist count, account menu, theme toggle. Sticky,
  translucent with backdrop blur, hairline under scroll.
- **Mobile** — hamburger drawer for menus, persistent bottom tab bar
  (Home, Search, Watchlist, Account), safe-area aware (the existing
  `pt-safe`/`pb-safe` utilities already exist).
- **Footer** — sitemap columns, region/language, legal, "operated on
  ambient".
- **Skip link** to `#main`; focus ring is a 2 px accent outline with
  2 px offset, visible on every interactive element.

## 4. Page specs

### Home (M8)
Hero rail of featured titles (backdrop, logo/title, synopsis, trailer +
watchlist CTAs, autoplay-free). Then rails: *Trending*, *Top picks for
you* (falls back to *Fan favorites* when signed out), *In theaters*,
*Coming soon*, *Top rated*, *Popular celebrities*, *Latest news*, and
*Explore by genre* as a chip cloud.

### Title page (M9)
Hero → primary rail (top cast) → *Storyline* (synopsis, keywords,
taglines, genres, certificate) → *Media* strip (videos + photos) →
*Ratings panel* (histogram, demographics, your rating) → *Reviews*
(top user review, critic reviews, metascore) → *More like this* rail →
*Details* (release dates, akas, countries, languages, companies,
official sites) → *Box office* → *Technical specs* → *Did you know*
(trivia/goofs/quotes teasers) → *Parents guide* summary → *Connections*.
Series titles insert an *Episodes* section with a season switcher.
Sub-routes: `/title/[id]/fullcredits`, `/reviews`, `/ratings`,
`/mediaindex`, `/videogallery`, `/trivia`, `/goofs`, `/quotes`,
`/parentalguide`, `/awards`, `/technical`, `/releaseinfo`, `/keywords`,
`/faq`, `/episodes`.

### Name page (M9)
Headshot + bio block, professions, *Known for* rail, *Credits* grouped
by department with year-descending lists and expand-all, photos rail,
awards summary, personal details (born, died, height, alternate names),
trivia.

### Search & browse (M10)
`/find?q=` tabbed results. `/search/title` and `/search/name` advanced
forms with a sticky `FilterPanel` and three view modes (detailed / grid
/ compact), sort control, result count, URL-synced state.

### Charts (M10)
`/chart/top`, `/chart/toptv`, `/chart/bottom`, `/chart/moviemeter`,
`/chart/tvmeter`, `/chart/boxoffice`. Rank, delta arrow, poster, title,
year, rating, your-rating column, watchlist toggle; view-mode switch.

### User surfaces (M10)
`/watchlist` (sort, filter, grid/detail, bulk remove), `/list/[id]`,
`/list/[id]/edit` (drag reorder, notes), `/user/[id]` public profile
(ratings, reviews, lists, contribution badge), `/account` (profile,
preferences, contribution history).

## 5. Accessibility & performance budget

- AA contrast for all text; the amber accent is verified in both themes.
- Every interactive element reachable and operable by keyboard; the
  rating picker, rail, lightbox and mega-search have explicit key maps.
- Images carry width/height (or aspect-ratio boxes) — zero CLS.
- Above-the-fold poster/backdrop are `priority`; everything else is
  lazy with a blurhash placeholder.
- Route-level `Suspense` with skeletons that match final layout.
- Budget: LCP < 2.5 s on the title page at 4G, CLS < 0.05,
  route JS < 180 kB gzip.
