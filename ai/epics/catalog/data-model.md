# Catalog epic — data model

Design rules inherited from the existing contexts:

- One Postgres **schema per bounded context**. No cross-schema foreign
  keys; cross-context references are opaque UUID/text columns.
- Every table has `created_at`/`updated_at` (`TIMESTAMPTZ NOT NULL
  DEFAULT now()`); soft-deletable rows add `archived_at`.
- Migrations are `NNN_name/up.sql`, idempotent (`IF NOT EXISTS`),
  registered in `packages/db/src/manifest.ts` with a SHA-256 checksum.
- Public identifiers follow the platform convention already used by
  `org_…` / `prj_…`: **`<prefix>_<32 hex>`**, derived from the row's UUID
  primary key by `@saas/db/ids` (`uuidToHex` / `uuidFromPublicId`). There
  is no separate `public_id` column — the id *is* the UUID, rendered.
  Prefixes: `tt` titles, `nm` people, `co` companies, `ls` lists,
  `rw` reviews, `rm` images, `vi` videos, `ni` news, `cb` contributions.

Migration numbering reserved by this epic: **200–299**.

| Migration | Context | Contents |
|---|---|---|
| `200_catalog_core` | catalog | titles, akas, genres, title_genres, release_dates, certificates, countries, languages, locations, box_office, technical_specs, external_ids, connections |
| `210_catalog_people` | catalog | people, credits, credit characters, seasons, episodes, known_for |
| `220_catalog_companies` | catalog | companies, title_companies, keywords, title_keywords |
| `230_catalog_media` | catalog | images, videos, title/person media links |
| `240_search_index` | search | denormalized search documents, FTS + trigram indexes |
| `250_ratings_core` | ratings | user ratings, title aggregates, distributions, demographics |
| `260_ratings_charts` | ratings | chart snapshots, popularity meters |
| `270_reviews_core` | reviews | user reviews, helpfulness votes, critic reviews, metascores |
| `280_lists_core` | lists | lists, list items, list likes, watchlist projection |
| `290_community_core` | community | award bodies/editions/categories/nominations, facts, parents guide, FAQ, news |
| `295_contributions` | community | contribution submissions, moderation decisions, contributor reputation |

---

## `catalog` schema

### `catalog.titles`

| column | type | notes |
|---|---|---|
| `id` | UUID PK | |
| `kind` | TEXT | `movie`, `tv_series`, `tv_mini_series`, `tv_episode`, `tv_special`, `tv_movie`, `short`, `tv_short`, `video`, `video_game`, `podcast_series`, `podcast_episode` |
| `primary_title` | TEXT | display title |
| `original_title` | TEXT | as released in origin country |
| `sort_title` | TEXT | article-stripped, for alphabetical sort |
| `start_year` | INT | release year / series start |
| `end_year` | INT NULL | series end |
| `runtime_minutes` | INT NULL | |
| `is_adult` | BOOL | default false |
| `production_status` | TEXT | `released`, `post_production`, `filming`, `announced`, `cancelled` |
| `plot_outline` | TEXT NULL | one-liner |
| `plot_summary` | TEXT NULL | paragraph |
| `synopsis` | TEXT NULL | long, always spoiler-bearing |
| `tagline` | TEXT NULL | |
| `status` | TEXT | `published`, `draft`, `archived` |
| `created_at`/`updated_at`/`archived_at` | TIMESTAMPTZ | |

Indexes: `(kind, start_year DESC)`, `(sort_title)`, `(status, created_at DESC, id DESC)`.

### Title satellites

- **`catalog.title_akas`** — `title_id`, `ordering`, `title`, `region`,
  `language`, `types TEXT[]`, `attributes TEXT[]`, `is_original_title`.
  Unique `(title_id, ordering)`.
- **`catalog.genres`** — canonical genre list (`slug` unique, `name`).
  **`catalog.title_genres`** — `(title_id, genre_id, ordering)` PK pair.
- **`catalog.title_release_dates`** — `title_id`, `country`, `released_on
  DATE`, `kind` (`premiere|limited|wide|digital|tv|festival`), `note`.
- **`catalog.title_certificates`** — `title_id`, `country`, `rating`,
  `attributes TEXT[]`. Unique `(title_id, country, rating)`.
- **`catalog.title_countries`** / **`catalog.title_languages`** —
  `title_id`, `code`, `ordering`.
- **`catalog.title_locations`** — `title_id`, `location`, `note`,
  `ordering`.
- **`catalog.title_box_office`** — one row per title: `budget_cents`,
  `budget_currency`, `opening_weekend_cents`, `opening_weekend_country`,
  `opening_weekend_on`, `gross_domestic_cents`, `gross_worldwide_cents`.
- **`catalog.title_technical_specs`** — `title_id`, `spec` (`runtime`,
  `sound_mix`, `color`, `aspect_ratio`, `camera`, `negative_format`,
  `printed_format`, `laboratory`, `film_length`), `value`, `note`,
  `ordering`.
- **`catalog.title_external_ids`** — `title_id`, `provider`
  (`official_site`, `wikipedia`, `wikidata`, `x`, `instagram`,
  `facebook`, `tiktok`, `youtube`, `import:*`), `value`, `label`.
  Unique `(title_id, provider, value)` — the importer seam.
- **`catalog.title_connections`** — `from_title_id`, `to_title_id`,
  `kind` (`follows`, `followed_by`, `remake_of`, `remade_as`,
  `spin_off_from`, `spin_off`, `references`, `referenced_in`,
  `features`, `featured_in`, `spoofs`, `spoofed_in`, `version_of`,
  `alternate_language_version_of`), `note`. Symmetric pairs are written
  by the repository, not by the caller.

### People and credits

- **`catalog.people`** — `id` (rendered `nm_…`), `name`,
  `sort_name`, `birth_date DATE NULL`, `birth_place TEXT NULL`,
  `death_date DATE NULL`, `death_place TEXT NULL`, `death_cause`,
  `height_cm INT NULL`, `mini_bio TEXT NULL`, `bio_author TEXT NULL`,
  `status`, timestamps.
- **`catalog.person_professions`** — `person_id`, `profession`,
  `ordering` (`actor`, `actress`, `director`, `writer`, `producer`,
  `composer`, `cinematographer`, `editor`, `production_designer`,
  `casting_director`, `stunts`, `visual_effects`, `sound_department`,
  `self`, …).
- **`catalog.credits`** — the join that carries everything:

  | column | notes |
  |---|---|
  | `id` UUID PK | |
  | `title_id`, `person_id` | opaque within-schema FKs |
  | `category` | `cast` or `crew` |
  | `department` | `directing`, `writing`, `production`, `camera`, `editing`, `sound`, `music`, `art`, `costume_makeup`, `visual_effects`, `stunts`, `cast`, `additional_crew`, `thanks` |
  | `job` | free text within department (`Director`, `Screenplay`, `Key Grip`) |
  | `billing_order` INT NULL | cast billing |
  | `episode_count` INT NULL | for series-level cast |
  | `is_uncredited`, `is_voice`, `is_archive_footage`, `is_self` BOOL | attributes |
  | `note` TEXT NULL | |

  Unique `(title_id, person_id, department, job, COALESCE(billing_order,-1))`.
  Indexes `(title_id, category, billing_order)`, `(person_id, department)`.
- **`catalog.credit_characters`** — `credit_id`, `character_name`,
  `ordering` (a cast credit can play several characters).
- **`catalog.person_known_for`** — derived, refreshed by M4:
  `person_id`, `title_id`, `ordering`, `score`.

### Series structure

- **`catalog.seasons`** — `series_title_id`, `season_number`, `name`,
  `overview`, `air_date`. Unique `(series_title_id, season_number)`.
- **`catalog.episodes`** — `episode_title_id` (a `catalog.titles` row of
  kind `tv_episode`), `series_title_id`, `season_number`,
  `episode_number`, `aired_on DATE NULL`. Unique
  `(series_title_id, season_number, episode_number)` and unique
  `episode_title_id`. Index `(series_title_id, season_number, episode_number)`.

### Companies and keywords

- **`catalog.companies`** — `id` (rendered `co_…`), `name`,
  `country`, `founded_year`, `kind` (`production`, `distributor`,
  `special_effects`, `miscellaneous`, `studio`, `network`).
- **`catalog.title_companies`** — `title_id`, `company_id`, `role`
  (`production`, `distribution`, `special_effects`, `miscellaneous`,
  `network`), `note`, `year_range`, `ordering`.
- **`catalog.keywords`** — `id`, `slug` unique, `name`.
- **`catalog.title_keywords`** — `title_id`, `keyword_id`,
  `relevant_votes`, `total_votes`, `ordering`.

### Media

- **`catalog.images`** — `id` (rendered `rm_…`), `url`, `width`,
  `height`, `kind` (`poster`, `still`, `backdrop`, `event`, `headshot`,
  `behind_the_scenes`, `production_art`), `caption`, `credit`,
  `language`, `blurhash`, `is_primary`.
- **`catalog.title_images`** / **`catalog.person_images`** — link rows
  with `ordering`; a partial unique index enforces at most one
  `is_primary` per owner.
- **`catalog.videos`** — `id` (rendered `vi_…`), `title_id NULL`,
  `person_id NULL`, `kind` (`trailer`, `teaser`, `clip`, `featurette`,
  `behind_the_scenes`, `interview`, `promo`), `name`, `url`,
  `thumbnail_url`, `runtime_seconds`, `language`, `published_at`,
  `ordering`.

---

## `search` schema

**`search.documents`** — one row per searchable entity.

| column | notes |
|---|---|
| `entity_type` | `title`, `person`, `company`, `keyword`, `list` |
| `entity_id` UUID | |
| `public_id` TEXT | |
| `display` TEXT | primary label |
| `secondary` TEXT | year + kind, or professions |
| `image_url` TEXT NULL | |
| `body` TEXT | concatenated searchable text (akas, aliases, known-for) |
| `document TSVECTOR` | generated from `display` (A), `secondary` (B), `body` (C) |
| `popularity` REAL | rank tiebreaker, refreshed by M4 |
| `filters JSONB` | year, genres, rating, votes, runtime, certificate, country, language for advanced search |

PK `(entity_type, entity_id)`. Indexes: GIN on `document`, GIN
`gin_trgm_ops` on `display`, btree on `(entity_type, popularity DESC)`,
GIN on `filters`.

Maintenance: `search-worker` exposes an internal reindex seam; catalog
writes enqueue a refresh for the affected entity.

---

## `ratings` schema

- **`ratings.user_ratings`** — `user_id`, `title_id`, `value` (1–10
  CHECK), `rated_at`, `updated_at`. PK `(user_id, title_id)`. Index
  `(title_id)`, `(user_id, rated_at DESC)`.
- **`ratings.title_aggregates`** — `title_id` PK, `vote_count`,
  `rating_sum`, `average` (NUMERIC(4,2)), `weighted_average`,
  `bucket_1…bucket_10` INT, `updated_at`. Written incrementally in the
  same transaction as the vote so the panel never lags.
- **`ratings.title_demographics`** — `title_id`, `age_band`
  (`under_18`, `18_29`, `30_44`, `45_plus`), `gender_band` (`male`,
  `female`, `other`, `undisclosed`), `vote_count`, `rating_sum`.
  Rows below a privacy floor (25 votes) are suppressed at read time.
- **`ratings.chart_entries`** — `chart` (`top_movies`, `top_tv`,
  `bottom_movies`, `most_popular_movies`, `most_popular_tv`,
  `box_office`, `coming_soon`, `in_theaters`), `computed_for DATE`,
  `rank`, `title_id`, `score`, `previous_rank`. PK `(chart,
  computed_for, rank)`.
- **`ratings.popularity`** — `entity_type` (`title`, `person`),
  `entity_id`, `rank`, `previous_rank`, `score`, `computed_for`.
  PK `(entity_type, entity_id, computed_for)`.

Weighted (Bayesian) average: `W = (v/(v+m))·R + (m/(v+m))·C`, with
`m` = minimum-votes threshold (per chart) and `C` = the mean rating
across eligible titles. Eligibility per chart is a stored predicate
(kind, minimum votes, released, non-adult).

---

## `reviews` schema

- **`reviews.user_reviews`** — `id` (rendered `rw_…`), `title_id`,
  `user_id`, `headline`, `body`, `rating INT NULL`, `has_spoilers BOOL`,
  `state` (`published`, `pending`, `rejected`, `deleted`),
  `helpful_count`, `unhelpful_count`, `submitted_at`, `moderated_at`,
  `moderator_id`. Unique `(title_id, user_id)` where state <> deleted.
- **`reviews.review_votes`** — `review_id`, `user_id`, `is_helpful`.
  PK `(review_id, user_id)`; counts maintained transactionally.
- **`reviews.critic_reviews`** — `title_id`, `publication`, `author`,
  `url`, `quote`, `score INT NULL` (0–100), `published_on`.
- **`reviews.title_metascores`** — `title_id` PK, `metascore`,
  `critic_count`, `positive/mixed/negative` counts, `updated_at`.

---

## `lists` schema

- **`lists.lists`** — `id` (rendered `ls_…`), `owner_user_id`,
  `name`, `description`, `kind` (`watchlist`, `custom`),
  `visibility` (`public`, `private`, `unlisted`), `is_ranked`,
  `item_count`, `like_count`, timestamps. A partial unique index
  guarantees exactly one `watchlist` per user.
- **`lists.list_items`** — `list_id`, `entity_type` (`title`, `person`,
  `image`), `entity_id`, `position`, `note`, `added_at`. Unique
  `(list_id, entity_type, entity_id)`; index `(list_id, position)`.
- **`lists.list_likes`** — `list_id`, `user_id`, `liked_at`.

---

## `community` schema

- **`community.award_bodies`** — `slug` unique, `name`, `country`.
- **`community.award_editions`** — `body_id`, `year`, `name`,
  `ceremony_on`. Unique `(body_id, year)`.
- **`community.award_categories`** — `body_id`, `name`, `slug`,
  `ordering`.
- **`community.award_nominations`** — `edition_id`, `category_id`,
  `title_id NULL`, `person_id NULL`, `is_winner`, `note`, `ordering`.
  CHECK: at least one of title/person is present.
- **`community.title_facts`** — `title_id`, `kind` (`trivia`, `goof`,
  `quote`, `crazy_credit`, `alternate_version`, `soundtrack`),
  `body`, `subkind` (goof type: `continuity`, `factual_error`,
  `anachronism`, `revealing_mistake`, `plot_hole`, `audio_visual`),
  `has_spoilers`, `interesting_votes`, `total_votes`, `state`,
  `contributor_user_id`, `ordering`.
- **`community.title_quote_lines`** — `fact_id`, `ordering`,
  `speaker`, `line` — quotes are structured, not blobs.
- **`community.parents_guide_entries`** — `title_id`, `category`
  (`sex_nudity`, `violence_gore`, `profanity`, `alcohol_drugs_smoking`,
  `frightening_intense`), `body`, `has_spoilers`, `state`,
  `contributor_user_id`.
- **`community.parents_guide_severity_votes`** — `title_id`,
  `category`, `user_id`, `severity` (`none`, `mild`, `moderate`,
  `severe`). PK `(title_id, category, user_id)`; the page shows the
  modal severity and the tallies.
- **`community.faq_entries`** — `title_id`, `question`, `answer`,
  `has_spoilers`, `state`, `ordering`.
- **`community.news_articles`** — `id` (rendered `ni_…`), `headline`,
  `body`, `source`, `author`, `url`, `image_url`, `published_at`;
  **`community.news_links`** — `article_id`, `entity_type`, `entity_id`.
- **`community.contributions`** — `id` (rendered `cb_…`),
  `contributor_user_id`, `target_type` (`title`, `person`, `credit`,
  `fact`, `image`, `parents_guide`, `faq`), `target_id NULL`,
  `operation` (`create`, `update`, `delete`), `payload JSONB`,
  `state` (`pending`, `approved`, `rejected`, `withdrawn`),
  `submitted_at`, `decided_at`, `moderator_user_id`, `decision_note`.
  Index `(state, submitted_at)` for the queue.
- **`community.contributor_stats`** — `user_id` PK, `approved_count`,
  `rejected_count`, `pending_count`, `reputation`, `updated_at`.

---

## Invariants worth calling out

1. **An episode is a title.** `catalog.episodes` is the ordering
   relation; the episode's own metadata, credits, ratings and reviews
   live in the same tables as any other title. No special-casing
   downstream.
2. **Aggregates are transactional.** A rating write updates
   `user_ratings`, `title_aggregates` and `title_demographics` in one
   transaction. Charts are snapshots, computed on a schedule — never read
   through to live aggregates.
3. **Curated vs contributed.** Every user-contributed row carries
   `state` and `contributor_user_id`. Public reads filter to
   `state = 'published'`; moderators read the rest.
4. **Public ids are the API.** Internal UUIDs never leave a worker.
   Parsing happens at the router edge (`parse*PublicId`), mirroring
   `apps/projects-worker/src/ids.ts`.
