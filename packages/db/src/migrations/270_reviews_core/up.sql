-- 270_reviews_core
-- User reviews, helpfulness voting, critic reviews and the metascore.
-- Bounded context: reviews

CREATE SCHEMA IF NOT EXISTS reviews;

COMMENT ON SCHEMA reviews IS 'Reviews bounded context — owns user reviews, helpfulness votes, critic reviews and metascores.';

-- ── User reviews ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reviews.user_reviews (
  id              UUID PRIMARY KEY,
  title_id        UUID NOT NULL,
  user_id         UUID NOT NULL,
  headline        TEXT NOT NULL,
  body            TEXT NOT NULL,
  rating          SMALLINT CHECK (rating IS NULL OR rating BETWEEN 1 AND 10),
  has_spoilers    BOOLEAN NOT NULL DEFAULT FALSE,
  state           TEXT NOT NULL DEFAULT 'published'
                  CHECK (state IN ('published', 'pending', 'rejected', 'deleted')),
  helpful_count   INTEGER NOT NULL DEFAULT 0 CHECK (helpful_count >= 0),
  unhelpful_count INTEGER NOT NULL DEFAULT 0 CHECK (unhelpful_count >= 0),
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  moderated_at    TIMESTAMPTZ,
  moderator_id    UUID,
  decision_note   TEXT
);

COMMENT ON TABLE reviews.user_reviews IS 'One live review per user per title. user_id and title_id are opaque cross-context references.';
COMMENT ON COLUMN reviews.user_reviews.has_spoilers IS 'Drives the spoiler veil; also the default filter on the reviews tab.';

-- One live review per user per title. A deleted review does not block a
-- rewrite, which is why the index is partial rather than a plain unique.
CREATE UNIQUE INDEX IF NOT EXISTS user_reviews_one_live_idx
  ON reviews.user_reviews (title_id, user_id)
  WHERE state <> 'deleted';

-- The reviews tab sorts by helpfulness, then by date.
CREATE INDEX IF NOT EXISTS user_reviews_title_helpful_idx
  ON reviews.user_reviews (title_id, helpful_count DESC, submitted_at DESC)
  WHERE state = 'published';
CREATE INDEX IF NOT EXISTS user_reviews_title_recent_idx
  ON reviews.user_reviews (title_id, submitted_at DESC)
  WHERE state = 'published';
CREATE INDEX IF NOT EXISTS user_reviews_author_idx
  ON reviews.user_reviews (user_id, submitted_at DESC);
-- The moderation queue reads oldest-first so nothing starves.
CREATE INDEX IF NOT EXISTS user_reviews_queue_idx
  ON reviews.user_reviews (state, submitted_at)
  WHERE state = 'pending';

-- ── Helpfulness votes ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reviews.review_votes (
  review_id  UUID NOT NULL REFERENCES reviews.user_reviews (id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  is_helpful BOOLEAN NOT NULL,
  voted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, user_id)
);

COMMENT ON TABLE reviews.review_votes IS 'One vote per user per review; the counters on user_reviews are maintained in the same transaction.';

CREATE INDEX IF NOT EXISTS review_votes_user_idx ON reviews.review_votes (user_id, review_id);

-- ── Critic reviews and metascore ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS reviews.critic_reviews (
  id           UUID PRIMARY KEY,
  title_id     UUID NOT NULL,
  publication  TEXT NOT NULL,
  author       TEXT,
  url          TEXT,
  quote        TEXT NOT NULL,
  score        SMALLINT CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  published_on DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN reviews.critic_reviews.score IS 'Normalized to 0-100 on ingest; NULL means the publication issues no score.';

CREATE UNIQUE INDEX IF NOT EXISTS critic_reviews_unique_idx
  ON reviews.critic_reviews (title_id, publication, COALESCE(author, ''));
CREATE INDEX IF NOT EXISTS critic_reviews_title_idx
  ON reviews.critic_reviews (title_id, score DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS reviews.title_metascores (
  title_id       UUID PRIMARY KEY,
  metascore      SMALLINT CHECK (metascore IS NULL OR metascore BETWEEN 0 AND 100),
  critic_count   INTEGER NOT NULL DEFAULT 0 CHECK (critic_count >= 0),
  positive_count INTEGER NOT NULL DEFAULT 0,
  mixed_count    INTEGER NOT NULL DEFAULT 0,
  negative_count INTEGER NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE reviews.title_metascores IS 'Recomputed from critic_reviews on write — the band counts are what the coloured pill renders.';
