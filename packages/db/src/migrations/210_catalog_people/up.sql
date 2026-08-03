-- 210_catalog_people
-- Catalog people, credits and series structure.
-- Bounded context: catalog
--
-- `catalog.credits` is the single join that carries both cast and crew:
-- a cast credit is `category = 'cast'` with a billing order and character
-- rows; a crew credit is `category = 'crew'` with a department + job.
-- One table means one filmography query, one "full credits" page, and one
-- place to enforce credit attributes (uncredited / voice / archive).

-- ── People ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog.people (
  id          UUID PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_name   TEXT NOT NULL,
  birth_date  DATE,
  birth_place TEXT,
  death_date  DATE,
  death_place TEXT,
  death_cause TEXT,
  height_cm   INT CHECK (height_cm IS NULL OR height_cm > 0),
  mini_bio    TEXT,
  bio_author  TEXT,
  status      TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft', 'archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  CHECK (death_date IS NULL OR birth_date IS NULL OR death_date >= birth_date)
);

COMMENT ON TABLE catalog.people IS 'Cast and crew members. Public ids render as nm_<32 hex>.';
COMMENT ON COLUMN catalog.people.sort_name IS 'Surname-first, case-folded, for alphabetical ordering.';

CREATE INDEX IF NOT EXISTS people_sort_name_idx ON catalog.people (sort_name, id);
CREATE INDEX IF NOT EXISTS people_status_created_idx ON catalog.people (status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS people_birth_date_idx ON catalog.people (birth_date) WHERE birth_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS catalog.person_professions (
  person_id  UUID NOT NULL REFERENCES catalog.people (id) ON DELETE CASCADE,
  profession TEXT NOT NULL,
  ordering   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, profession)
);

CREATE INDEX IF NOT EXISTS person_professions_profession_idx
  ON catalog.person_professions (profession, person_id);

-- ── Credits ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog.credits (
  id                 UUID PRIMARY KEY,
  title_id           UUID NOT NULL REFERENCES catalog.titles (id) ON DELETE CASCADE,
  person_id          UUID NOT NULL REFERENCES catalog.people (id) ON DELETE CASCADE,
  category           TEXT NOT NULL CHECK (category IN ('cast', 'crew')),
  department         TEXT NOT NULL CHECK (department IN (
                       'cast', 'directing', 'writing', 'production', 'camera',
                       'editing', 'sound', 'music', 'art', 'costume_makeup',
                       'visual_effects', 'stunts', 'casting', 'animation',
                       'additional_crew', 'thanks')),
  job                TEXT NOT NULL,
  billing_order      INT,
  episode_count      INT CHECK (episode_count IS NULL OR episode_count >= 0),
  is_uncredited      BOOLEAN NOT NULL DEFAULT FALSE,
  is_voice           BOOLEAN NOT NULL DEFAULT FALSE,
  is_archive_footage BOOLEAN NOT NULL DEFAULT FALSE,
  is_self            BOOLEAN NOT NULL DEFAULT FALSE,
  note               TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((category = 'cast') = (department = 'cast'))
);

COMMENT ON TABLE catalog.credits IS 'Cast and crew credits. category=cast implies department=cast; crew rows carry department+job.';
COMMENT ON COLUMN catalog.credits.billing_order IS 'Cast billing position; NULL for crew and unbilled appearances.';
COMMENT ON COLUMN catalog.credits.episode_count IS 'Series-level credits only — how many episodes the person appears in.';

-- One credit per (title, person, department, job, billing slot). COALESCE keeps
-- NULL billing orders from defeating the uniqueness check.
CREATE UNIQUE INDEX IF NOT EXISTS credits_unique_idx
  ON catalog.credits (title_id, person_id, department, job, COALESCE(billing_order, -1));
CREATE INDEX IF NOT EXISTS credits_title_billing_idx
  ON catalog.credits (title_id, category, billing_order NULLS LAST, id);
CREATE INDEX IF NOT EXISTS credits_person_department_idx
  ON catalog.credits (person_id, department, id);

CREATE TABLE IF NOT EXISTS catalog.credit_characters (
  id             UUID PRIMARY KEY,
  credit_id      UUID NOT NULL REFERENCES catalog.credits (id) ON DELETE CASCADE,
  character_name TEXT NOT NULL,
  ordering       INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalog.credit_characters IS 'A cast credit may play several characters; one row each, ordered.';

CREATE UNIQUE INDEX IF NOT EXISTS credit_characters_unique_idx
  ON catalog.credit_characters (credit_id, ordering);

-- ── Derived "known for" ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog.person_known_for (
  person_id  UUID NOT NULL REFERENCES catalog.people (id) ON DELETE CASCADE,
  title_id   UUID NOT NULL REFERENCES catalog.titles (id) ON DELETE CASCADE,
  ordering   INT NOT NULL DEFAULT 0,
  score      REAL NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, title_id)
);

COMMENT ON TABLE catalog.person_known_for IS 'Derived projection refreshed from ratings/popularity; safe to rebuild from scratch.';

CREATE INDEX IF NOT EXISTS person_known_for_ordering_idx
  ON catalog.person_known_for (person_id, ordering);

-- ── Series structure ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog.seasons (
  id              UUID PRIMARY KEY,
  series_title_id UUID NOT NULL REFERENCES catalog.titles (id) ON DELETE CASCADE,
  season_number   INT NOT NULL CHECK (season_number >= 0),
  name            TEXT,
  overview        TEXT,
  air_date        DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS seasons_series_number_idx
  ON catalog.seasons (series_title_id, season_number);

CREATE TABLE IF NOT EXISTS catalog.episodes (
  episode_title_id UUID PRIMARY KEY REFERENCES catalog.titles (id) ON DELETE CASCADE,
  series_title_id  UUID NOT NULL REFERENCES catalog.titles (id) ON DELETE CASCADE,
  season_number    INT NOT NULL CHECK (season_number >= 0),
  episode_number   INT NOT NULL CHECK (episode_number >= 0),
  aired_on         DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (episode_title_id <> series_title_id)
);

COMMENT ON TABLE catalog.episodes IS 'Ordering relation only — the episode''s own metadata lives in catalog.titles.';

CREATE UNIQUE INDEX IF NOT EXISTS episodes_series_season_episode_idx
  ON catalog.episodes (series_title_id, season_number, episode_number);
CREATE INDEX IF NOT EXISTS episodes_series_order_idx
  ON catalog.episodes (series_title_id, season_number, episode_number, episode_title_id);
CREATE INDEX IF NOT EXISTS episodes_aired_idx
  ON catalog.episodes (aired_on DESC NULLS LAST);
