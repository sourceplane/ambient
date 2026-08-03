-- 200_catalog_core
-- Catalog persistence foundation — titles and their satellite facts.
-- Bounded context: catalog
--
-- A "title" is any catalogued work: a feature, a series, a single episode,
-- a short, a video game, a podcast. Episodes are titles too (the ordering
-- relation lives in 210_catalog_people); nothing downstream special-cases
-- them. Public ids are rendered from `id` as `tt_<32 hex>` — there is no
-- separate public-id column.

CREATE SCHEMA IF NOT EXISTS catalog;

COMMENT ON SCHEMA catalog IS 'Catalog bounded context — owns titles, people, credits, companies and media persistence.';

-- ── Titles ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog.titles (
  id                UUID PRIMARY KEY,
  kind              TEXT NOT NULL CHECK (kind IN (
                      'movie', 'tv_series', 'tv_mini_series', 'tv_episode',
                      'tv_special', 'tv_movie', 'short', 'tv_short', 'video',
                      'video_game', 'podcast_series', 'podcast_episode')),
  primary_title     TEXT NOT NULL,
  original_title    TEXT,
  sort_title        TEXT NOT NULL,
  start_year        INT,
  end_year          INT,
  runtime_minutes   INT CHECK (runtime_minutes IS NULL OR runtime_minutes >= 0),
  is_adult          BOOLEAN NOT NULL DEFAULT FALSE,
  production_status TEXT NOT NULL DEFAULT 'released' CHECK (production_status IN (
                      'released', 'post_production', 'filming',
                      'pre_production', 'announced', 'cancelled')),
  plot_outline      TEXT,
  plot_summary      TEXT,
  synopsis          TEXT,
  tagline           TEXT,
  status            TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft', 'archived')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at       TIMESTAMPTZ,
  CHECK (end_year IS NULL OR start_year IS NULL OR end_year >= start_year)
);

COMMENT ON TABLE catalog.titles IS 'Every catalogued work — features, series, episodes, shorts, games, podcasts.';
COMMENT ON COLUMN catalog.titles.sort_title IS 'Leading-article-stripped, case-folded title used for alphabetical ordering.';
COMMENT ON COLUMN catalog.titles.synopsis IS 'Long-form summary; always treated as spoiler-bearing by read surfaces.';
COMMENT ON COLUMN catalog.titles.status IS 'published rows are publicly readable; draft/archived are staff-only.';

CREATE INDEX IF NOT EXISTS titles_kind_year_idx
  ON catalog.titles (kind, start_year DESC NULLS LAST, id DESC);
CREATE INDEX IF NOT EXISTS titles_sort_title_idx
  ON catalog.titles (sort_title, id);
CREATE INDEX IF NOT EXISTS titles_status_created_idx
  ON catalog.titles (status, created_at DESC, id DESC);

-- ── Alternate titles (AKAs) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog.title_akas (
  id                UUID PRIMARY KEY,
  title_id          UUID NOT NULL REFERENCES catalog.titles (id) ON DELETE CASCADE,
  ordering          INT NOT NULL,
  title             TEXT NOT NULL,
  region            TEXT,
  language          TEXT,
  types             TEXT[] NOT NULL DEFAULT '{}',
  attributes        TEXT[] NOT NULL DEFAULT '{}',
  is_original_title BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalog.title_akas IS 'Region/language alternate titles, ordered for display.';

CREATE UNIQUE INDEX IF NOT EXISTS title_akas_title_ordering_idx
  ON catalog.title_akas (title_id, ordering);

-- ── Genres ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog.genres (
  id         UUID PRIMARY KEY,
  slug       TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS genres_slug_idx ON catalog.genres (slug);

CREATE TABLE IF NOT EXISTS catalog.title_genres (
  title_id   UUID NOT NULL REFERENCES catalog.titles (id) ON DELETE CASCADE,
  genre_id   UUID NOT NULL REFERENCES catalog.genres (id) ON DELETE CASCADE,
  ordering   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (title_id, genre_id)
);

CREATE INDEX IF NOT EXISTS title_genres_genre_idx ON catalog.title_genres (genre_id, title_id);
CREATE INDEX IF NOT EXISTS title_genres_title_ordering_idx ON catalog.title_genres (title_id, ordering);

-- ── Release dates and certificates ────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog.title_release_dates (
  id          UUID PRIMARY KEY,
  title_id    UUID NOT NULL REFERENCES catalog.titles (id) ON DELETE CASCADE,
  country     TEXT NOT NULL,
  released_on DATE NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'wide' CHECK (kind IN (
                'premiere', 'limited', 'wide', 'digital', 'physical', 'tv', 'festival')),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS title_release_dates_unique_idx
  ON catalog.title_release_dates (title_id, country, released_on, kind);
CREATE INDEX IF NOT EXISTS title_release_dates_country_date_idx
  ON catalog.title_release_dates (country, released_on DESC);

CREATE TABLE IF NOT EXISTS catalog.title_certificates (
  id         UUID PRIMARY KEY,
  title_id   UUID NOT NULL REFERENCES catalog.titles (id) ON DELETE CASCADE,
  country    TEXT NOT NULL,
  rating     TEXT NOT NULL,
  attributes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalog.title_certificates IS 'Age/content certificates per country (e.g. US:PG-13, GB:15).';

CREATE UNIQUE INDEX IF NOT EXISTS title_certificates_unique_idx
  ON catalog.title_certificates (title_id, country, rating);

-- ── Origin facts ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog.title_countries (
  title_id   UUID NOT NULL REFERENCES catalog.titles (id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  ordering   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (title_id, code)
);

CREATE TABLE IF NOT EXISTS catalog.title_languages (
  title_id   UUID NOT NULL REFERENCES catalog.titles (id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  ordering   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (title_id, code)
);

CREATE TABLE IF NOT EXISTS catalog.title_locations (
  id         UUID PRIMARY KEY,
  title_id   UUID NOT NULL REFERENCES catalog.titles (id) ON DELETE CASCADE,
  location   TEXT NOT NULL,
  note       TEXT,
  ordering   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS title_locations_title_idx ON catalog.title_locations (title_id, ordering);

-- ── Box office ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog.title_box_office (
  title_id                 UUID PRIMARY KEY REFERENCES catalog.titles (id) ON DELETE CASCADE,
  budget_cents             BIGINT,
  opening_weekend_cents    BIGINT,
  opening_weekend_country  TEXT,
  opening_weekend_on       DATE,
  gross_domestic_cents     BIGINT,
  gross_worldwide_cents    BIGINT,
  currency                 TEXT NOT NULL DEFAULT 'USD',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalog.title_box_office IS 'Money is stored in minor units (cents) with an explicit currency — never floats.';

-- ── Technical specifications ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog.title_technical_specs (
  id         UUID PRIMARY KEY,
  title_id   UUID NOT NULL REFERENCES catalog.titles (id) ON DELETE CASCADE,
  spec       TEXT NOT NULL CHECK (spec IN (
               'runtime', 'sound_mix', 'color', 'aspect_ratio', 'camera',
               'negative_format', 'printed_format', 'laboratory', 'film_length')),
  value      TEXT NOT NULL,
  note       TEXT,
  ordering   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS title_technical_specs_title_idx
  ON catalog.title_technical_specs (title_id, spec, ordering);

-- ── External identifiers (the importer / official-site seam) ──────────

CREATE TABLE IF NOT EXISTS catalog.title_external_ids (
  id         UUID PRIMARY KEY,
  title_id   UUID NOT NULL REFERENCES catalog.titles (id) ON DELETE CASCADE,
  provider   TEXT NOT NULL,
  value      TEXT NOT NULL,
  label      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalog.title_external_ids IS 'Official sites, social handles, and import provenance (provider = import:<source>).';

CREATE UNIQUE INDEX IF NOT EXISTS title_external_ids_unique_idx
  ON catalog.title_external_ids (title_id, provider, value);
CREATE INDEX IF NOT EXISTS title_external_ids_lookup_idx
  ON catalog.title_external_ids (provider, value);

-- ── Connections between titles ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog.title_connections (
  id            UUID PRIMARY KEY,
  from_title_id UUID NOT NULL REFERENCES catalog.titles (id) ON DELETE CASCADE,
  to_title_id   UUID NOT NULL REFERENCES catalog.titles (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN (
                  'follows', 'followed_by', 'remake_of', 'remade_as',
                  'spin_off_from', 'spin_off', 'references', 'referenced_in',
                  'features', 'featured_in', 'spoofs', 'spoofed_in',
                  'version_of', 'alternate_language_version_of', 'edited_from',
                  'edited_into')),
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_title_id <> to_title_id)
);

COMMENT ON TABLE catalog.title_connections IS 'Directed edges; the repository writes the inverse edge so both sides read symmetrically.';

CREATE UNIQUE INDEX IF NOT EXISTS title_connections_unique_idx
  ON catalog.title_connections (from_title_id, to_title_id, kind);
CREATE INDEX IF NOT EXISTS title_connections_from_kind_idx
  ON catalog.title_connections (from_title_id, kind);
