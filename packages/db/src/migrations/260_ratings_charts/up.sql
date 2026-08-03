-- 260_ratings_charts
-- Chart snapshots and popularity meters.
-- Bounded context: ratings
--
-- Charts are SNAPSHOTS, computed on a schedule and read as-is. Reading through
-- to live aggregates would make the Top 250 reshuffle between two page loads
-- and would put a full sort behind every request. A snapshot also gives us
-- `previous_rank` for free, which is the whole point of a meter.

CREATE TABLE IF NOT EXISTS ratings.chart_entries (
  chart         TEXT NOT NULL CHECK (chart IN (
                  'top_movies', 'top_tv', 'bottom_movies',
                  'most_popular_movies', 'most_popular_tv',
                  'box_office', 'coming_soon', 'in_theaters')),
  computed_for  DATE NOT NULL,
  rank          INTEGER NOT NULL CHECK (rank >= 1),
  title_id      UUID NOT NULL,
  score         NUMERIC(12, 4) NOT NULL DEFAULT 0,
  previous_rank INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chart, computed_for, rank)
);

COMMENT ON TABLE ratings.chart_entries IS 'One immutable snapshot per chart per day; the newest computed_for is what reads serve.';
COMMENT ON COLUMN ratings.chart_entries.previous_rank IS 'Rank in the previous snapshot — NULL means new to the chart.';

-- A title appears at most once per snapshot.
CREATE UNIQUE INDEX IF NOT EXISTS chart_entries_title_idx
  ON ratings.chart_entries (chart, computed_for, title_id);

-- Reads always want the newest snapshot for a chart.
CREATE INDEX IF NOT EXISTS chart_entries_latest_idx
  ON ratings.chart_entries (chart, computed_for DESC, rank);

CREATE TABLE IF NOT EXISTS ratings.popularity (
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('title', 'person')),
  entity_id     UUID NOT NULL,
  computed_for  DATE NOT NULL,
  rank          INTEGER NOT NULL CHECK (rank >= 1),
  previous_rank INTEGER,
  score         NUMERIC(12, 4) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_id, computed_for)
);

COMMENT ON TABLE ratings.popularity IS 'MOVIEmeter / STARmeter — rank plus the previous snapshot''s rank, so the delta arrow needs no second query.';

CREATE INDEX IF NOT EXISTS popularity_rank_idx
  ON ratings.popularity (entity_type, computed_for DESC, rank);

-- ── Chart eligibility ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ratings.chart_definitions (
  chart          TEXT PRIMARY KEY,
  minimum_votes  INTEGER NOT NULL DEFAULT 0,
  prior_mean     NUMERIC(4, 2) NOT NULL DEFAULT 7.00,
  size           INTEGER NOT NULL DEFAULT 250,
  description    TEXT NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ratings.chart_definitions IS 'Per-chart Bayesian parameters: m (minimum_votes) and C (prior_mean) in W = (v/(v+m))·R + (m/(v+m))·C.';

INSERT INTO ratings.chart_definitions (chart, minimum_votes, prior_mean, size, description)
VALUES
  ('top_movies',          25000, 7.00, 250, 'Top 250 movies by weighted rating'),
  ('top_tv',              10000, 7.00, 250, 'Top 250 TV series by weighted rating'),
  ('bottom_movies',       10000, 7.00, 100, 'Lowest rated movies by weighted rating'),
  ('most_popular_movies',     0, 7.00, 100, 'Most popular movies this week'),
  ('most_popular_tv',         0, 7.00, 100, 'Most popular TV this week'),
  ('box_office',              0, 7.00,  10, 'Weekend box office'),
  ('coming_soon',             0, 7.00,  50, 'Announced and upcoming releases'),
  ('in_theaters',             0, 7.00,  50, 'Currently in theaters')
ON CONFLICT (chart) DO NOTHING;
