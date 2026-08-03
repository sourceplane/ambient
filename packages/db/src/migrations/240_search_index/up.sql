-- 240_search_index
-- Denormalized search documents with full-text and trigram indexes.
-- Bounded context: search
--
-- The search context does NOT read the catalog tables. It owns one
-- denormalized document per searchable entity, published to it by the context
-- that owns the entity. That keeps the boundary honest (no cross-schema
-- reads), and it is also what makes the query fast: one index, one table, no
-- joins on the hot path.

CREATE SCHEMA IF NOT EXISTS search;

COMMENT ON SCHEMA search IS 'Search bounded context — owns the denormalized search index. Never reads another context''s tables.';

-- Trigram matching backs the typeahead: `arriv` must find `Arrival` before the
-- user finishes the word, which a tsquery on lexemes will not do.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS search.documents (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('title', 'person', 'company', 'keyword', 'list')),
  entity_id   UUID NOT NULL,
  public_id   TEXT NOT NULL,
  display     TEXT NOT NULL,
  secondary   TEXT NOT NULL DEFAULT '',
  image_url   TEXT,
  body        TEXT NOT NULL DEFAULT '',
  popularity  REAL NOT NULL DEFAULT 0,
  filters     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Weighted so a match on the name outranks a match on an alternate title,
  -- which outranks a match on buried body text.
  document    TSVECTOR GENERATED ALWAYS AS (
                setweight(to_tsvector('simple', coalesce(display, '')), 'A') ||
                setweight(to_tsvector('simple', coalesce(secondary, '')), 'B') ||
                setweight(to_tsvector('simple', coalesce(body, '')), 'C')
              ) STORED,
  PRIMARY KEY (entity_type, entity_id)
);

COMMENT ON TABLE search.documents IS 'One row per searchable entity, published by the owning context.';
COMMENT ON COLUMN search.documents.display IS 'Primary label — the title or name the result renders.';
COMMENT ON COLUMN search.documents.secondary IS 'Disambiguating line: year + kind for titles, professions for people.';
COMMENT ON COLUMN search.documents.body IS 'Everything else worth matching: alternate titles, aliases, known-for.';
COMMENT ON COLUMN search.documents.popularity IS 'Rank tiebreaker, refreshed by the ratings context.';
COMMENT ON COLUMN search.documents.filters IS 'Structured facets for advanced search (year, genres, rating, votes, runtime, certificate, country, language).';

CREATE INDEX IF NOT EXISTS documents_fts_idx
  ON search.documents USING GIN (document);

CREATE INDEX IF NOT EXISTS documents_display_trgm_idx
  ON search.documents USING GIN (display gin_trgm_ops);

CREATE INDEX IF NOT EXISTS documents_type_popularity_idx
  ON search.documents (entity_type, popularity DESC, entity_id);

CREATE INDEX IF NOT EXISTS documents_filters_idx
  ON search.documents USING GIN (filters jsonb_path_ops);

CREATE UNIQUE INDEX IF NOT EXISTS documents_public_id_idx
  ON search.documents (public_id);
