-- 250_ratings_core
-- User ratings and the aggregates the ratings panel renders.
-- Bounded context: ratings
--
-- Aggregates are maintained transactionally alongside the vote rather than
-- recomputed on read. A title with a million votes cannot afford an AVG() per
-- page view, and a rating that does not move the average immediately reads as
-- a bug to the person who just cast it.

CREATE SCHEMA IF NOT EXISTS ratings;

COMMENT ON SCHEMA ratings IS 'Ratings bounded context — owns user ratings, title aggregates, demographics, charts and popularity.';

-- ── Votes ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ratings.user_ratings (
  user_id    UUID NOT NULL,
  title_id   UUID NOT NULL,
  value      SMALLINT NOT NULL CHECK (value BETWEEN 1 AND 10),
  age_band    TEXT NOT NULL DEFAULT 'undisclosed'
              CHECK (age_band IN ('under_18', '18_29', '30_44', '45_plus', 'undisclosed')),
  gender_band TEXT NOT NULL DEFAULT 'undisclosed'
              CHECK (gender_band IN ('male', 'female', 'other', 'undisclosed')),
  rated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, title_id)
);

COMMENT ON TABLE ratings.user_ratings IS 'One rating per user per title. user_id and title_id are opaque cross-context references.';
COMMENT ON COLUMN ratings.user_ratings.age_band IS 'Snapshotted at vote time so the demographic breakdown is stable and needs no join to identity.';

CREATE INDEX IF NOT EXISTS user_ratings_title_idx ON ratings.user_ratings (title_id);
CREATE INDEX IF NOT EXISTS user_ratings_user_recent_idx
  ON ratings.user_ratings (user_id, rated_at DESC, title_id);

-- ── Per-title aggregate ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ratings.title_aggregates (
  title_id    UUID PRIMARY KEY,
  vote_count  INTEGER NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
  rating_sum  BIGINT NOT NULL DEFAULT 0 CHECK (rating_sum >= 0),
  bucket_1    INTEGER NOT NULL DEFAULT 0,
  bucket_2    INTEGER NOT NULL DEFAULT 0,
  bucket_3    INTEGER NOT NULL DEFAULT 0,
  bucket_4    INTEGER NOT NULL DEFAULT 0,
  bucket_5    INTEGER NOT NULL DEFAULT 0,
  bucket_6    INTEGER NOT NULL DEFAULT 0,
  bucket_7    INTEGER NOT NULL DEFAULT 0,
  bucket_8    INTEGER NOT NULL DEFAULT 0,
  bucket_9    INTEGER NOT NULL DEFAULT 0,
  bucket_10   INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ratings.title_aggregates IS 'Maintained in the same transaction as the vote — never recomputed on read.';
COMMENT ON COLUMN ratings.title_aggregates.rating_sum IS 'Sum of values; the average is sum/count, kept exact rather than stored as a rounded float.';

-- The chart builder scans by vote count, so index it.
CREATE INDEX IF NOT EXISTS title_aggregates_votes_idx
  ON ratings.title_aggregates (vote_count DESC, title_id);

-- ── Demographic breakdown ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ratings.title_demographics (
  title_id    UUID NOT NULL,
  age_band    TEXT NOT NULL,
  gender_band TEXT NOT NULL,
  vote_count  INTEGER NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
  rating_sum  BIGINT NOT NULL DEFAULT 0 CHECK (rating_sum >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (title_id, age_band, gender_band)
);

COMMENT ON TABLE ratings.title_demographics IS 'Counts only — never individual votes. Cells below the read-time privacy floor are suppressed, not stored differently.';
