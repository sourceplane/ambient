-- 290_community_core
-- Awards, community-contributed facts, parents guide, FAQ, news, and the
-- contribution/moderation pipeline behind all of them.
-- Bounded context: community

CREATE SCHEMA IF NOT EXISTS community;

COMMENT ON SCHEMA community IS 'Community bounded context — awards, trivia/goofs/quotes, parents guide, FAQ, news, and contributions.';

-- ── Awards ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS community.award_bodies (
  id         UUID PRIMARY KEY,
  slug       TEXT NOT NULL,
  name       TEXT NOT NULL,
  country    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS award_bodies_slug_idx ON community.award_bodies (slug);

CREATE TABLE IF NOT EXISTS community.award_editions (
  id          UUID PRIMARY KEY,
  body_id     UUID NOT NULL REFERENCES community.award_bodies (id) ON DELETE CASCADE,
  year        INT NOT NULL,
  name        TEXT,
  ceremony_on DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS award_editions_body_year_idx
  ON community.award_editions (body_id, year);

CREATE TABLE IF NOT EXISTS community.award_categories (
  id         UUID PRIMARY KEY,
  body_id    UUID NOT NULL REFERENCES community.award_bodies (id) ON DELETE CASCADE,
  slug       TEXT NOT NULL,
  name       TEXT NOT NULL,
  ordering   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS award_categories_body_slug_idx
  ON community.award_categories (body_id, slug);

CREATE TABLE IF NOT EXISTS community.award_nominations (
  id          UUID PRIMARY KEY,
  edition_id  UUID NOT NULL REFERENCES community.award_editions (id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES community.award_categories (id) ON DELETE CASCADE,
  title_id    UUID,
  person_id   UUID,
  is_winner   BOOLEAN NOT NULL DEFAULT FALSE,
  note        TEXT,
  ordering    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A nomination with neither a title nor a person is not a nomination.
  CHECK (title_id IS NOT NULL OR person_id IS NOT NULL)
);

COMMENT ON TABLE community.award_nominations IS 'Both nominations and wins; is_winner separates them. title_id/person_id are opaque cross-context references.';

CREATE INDEX IF NOT EXISTS award_nominations_title_idx
  ON community.award_nominations (title_id, is_winner DESC) WHERE title_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS award_nominations_person_idx
  ON community.award_nominations (person_id, is_winner DESC) WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS award_nominations_edition_idx
  ON community.award_nominations (edition_id, category_id, ordering);

-- ── Community facts ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS community.title_facts (
  id                   UUID PRIMARY KEY,
  title_id             UUID NOT NULL,
  kind                 TEXT NOT NULL CHECK (kind IN (
                         'trivia', 'goof', 'quote', 'crazy_credit',
                         'alternate_version', 'soundtrack')),
  subkind              TEXT,
  body                 TEXT NOT NULL,
  has_spoilers         BOOLEAN NOT NULL DEFAULT FALSE,
  interesting_votes    INT NOT NULL DEFAULT 0 CHECK (interesting_votes >= 0),
  total_votes          INT NOT NULL DEFAULT 0 CHECK (total_votes >= 0),
  state                TEXT NOT NULL DEFAULT 'published'
                       CHECK (state IN ('published', 'pending', 'rejected')),
  contributor_user_id  UUID,
  ordering             INT NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (interesting_votes <= total_votes)
);

COMMENT ON COLUMN community.title_facts.subkind IS 'Goof type (continuity, factual_error, anachronism, revealing_mistake, plot_hole, audio_visual); NULL for other kinds.';

CREATE INDEX IF NOT EXISTS title_facts_title_kind_idx
  ON community.title_facts (title_id, kind, interesting_votes DESC, ordering)
  WHERE state = 'published';
CREATE INDEX IF NOT EXISTS title_facts_queue_idx
  ON community.title_facts (state, created_at) WHERE state = 'pending';

-- Quotes are structured, not blobs: a quote is a sequence of speaker/line
-- pairs, which is what lets the page render them as dialogue.
CREATE TABLE IF NOT EXISTS community.title_quote_lines (
  id       UUID PRIMARY KEY,
  fact_id  UUID NOT NULL REFERENCES community.title_facts (id) ON DELETE CASCADE,
  ordering INT NOT NULL,
  speaker  TEXT,
  line     TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS title_quote_lines_unique_idx
  ON community.title_quote_lines (fact_id, ordering);

-- ── Parents guide ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS community.parents_guide_entries (
  id                  UUID PRIMARY KEY,
  title_id            UUID NOT NULL,
  category            TEXT NOT NULL CHECK (category IN (
                        'sex_nudity', 'violence_gore', 'profanity',
                        'alcohol_drugs_smoking', 'frightening_intense')),
  body                TEXT NOT NULL,
  has_spoilers        BOOLEAN NOT NULL DEFAULT FALSE,
  state               TEXT NOT NULL DEFAULT 'published'
                      CHECK (state IN ('published', 'pending', 'rejected')),
  contributor_user_id UUID,
  ordering            INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS parents_guide_title_idx
  ON community.parents_guide_entries (title_id, category, ordering)
  WHERE state = 'published';

CREATE TABLE IF NOT EXISTS community.parents_guide_severity_votes (
  title_id UUID NOT NULL,
  category TEXT NOT NULL,
  user_id  UUID NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('none', 'mild', 'moderate', 'severe')),
  voted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (title_id, category, user_id)
);

COMMENT ON TABLE community.parents_guide_severity_votes IS 'One vote per user per category; the page renders the modal severity plus the tallies.';

CREATE INDEX IF NOT EXISTS parents_guide_votes_tally_idx
  ON community.parents_guide_severity_votes (title_id, category, severity);

-- ── FAQ ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS community.faq_entries (
  id                  UUID PRIMARY KEY,
  title_id            UUID NOT NULL,
  question            TEXT NOT NULL,
  answer              TEXT NOT NULL,
  has_spoilers        BOOLEAN NOT NULL DEFAULT FALSE,
  state               TEXT NOT NULL DEFAULT 'published'
                      CHECK (state IN ('published', 'pending', 'rejected')),
  contributor_user_id UUID,
  ordering            INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS faq_entries_title_idx
  ON community.faq_entries (title_id, ordering) WHERE state = 'published';

-- ── News ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS community.news_articles (
  id           UUID PRIMARY KEY,
  headline     TEXT NOT NULL,
  body         TEXT,
  source       TEXT NOT NULL,
  author       TEXT,
  url          TEXT,
  image_url    TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_articles_recent_idx
  ON community.news_articles (published_at DESC, id);

CREATE TABLE IF NOT EXISTS community.news_links (
  article_id  UUID NOT NULL REFERENCES community.news_articles (id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('title', 'person')),
  entity_id   UUID NOT NULL,
  PRIMARY KEY (article_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS news_links_entity_idx
  ON community.news_links (entity_type, entity_id, article_id);

-- ── Contributions ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS community.contributions (
  id                  UUID PRIMARY KEY,
  contributor_user_id UUID NOT NULL,
  target_type         TEXT NOT NULL CHECK (target_type IN (
                        'title', 'person', 'credit', 'fact', 'image',
                        'parents_guide', 'faq')),
  target_id           UUID,
  operation           TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
  state               TEXT NOT NULL DEFAULT 'pending'
                      CHECK (state IN ('pending', 'approved', 'rejected', 'withdrawn')),
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at          TIMESTAMPTZ,
  moderator_user_id   UUID,
  decision_note       TEXT
);

COMMENT ON TABLE community.contributions IS 'Submissions awaiting moderation. The payload is the proposed change, not the applied one — approval is what applies it.';

-- Oldest-first queue, so nothing starves.
CREATE INDEX IF NOT EXISTS contributions_queue_idx
  ON community.contributions (state, submitted_at) WHERE state = 'pending';
CREATE INDEX IF NOT EXISTS contributions_contributor_idx
  ON community.contributions (contributor_user_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS community.contributor_stats (
  user_id        UUID PRIMARY KEY,
  approved_count INT NOT NULL DEFAULT 0 CHECK (approved_count >= 0),
  rejected_count INT NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  pending_count  INT NOT NULL DEFAULT 0 CHECK (pending_count >= 0),
  reputation     INT NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN community.contributor_stats.reputation IS 'Derived from approvals minus rejections; recomputed on each decision, never edited directly.';
