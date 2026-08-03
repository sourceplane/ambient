-- 220_catalog_companies
-- Companies (production, distribution, networks) and plot keywords.
-- Bounded context: catalog

-- ── Companies ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog.companies (
  id           UUID PRIMARY KEY,
  name         TEXT NOT NULL,
  sort_name    TEXT NOT NULL,
  country      TEXT,
  founded_year INT,
  kind         TEXT NOT NULL DEFAULT 'production' CHECK (kind IN (
                 'production', 'distributor', 'special_effects',
                 'miscellaneous', 'studio', 'network')),
  status       TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft', 'archived')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at  TIMESTAMPTZ
);

COMMENT ON TABLE catalog.companies IS 'Studios, distributors, networks and service companies. Public ids render as co_<32 hex>.';

CREATE INDEX IF NOT EXISTS companies_sort_name_idx ON catalog.companies (sort_name, id);
CREATE INDEX IF NOT EXISTS companies_kind_idx ON catalog.companies (kind, sort_name);

CREATE TABLE IF NOT EXISTS catalog.title_companies (
  id         UUID PRIMARY KEY,
  title_id   UUID NOT NULL REFERENCES catalog.titles (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES catalog.companies (id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN (
               'production', 'distribution', 'special_effects',
               'miscellaneous', 'network')),
  note       TEXT,
  year_from  INT,
  year_to    INT,
  ordering   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (year_to IS NULL OR year_from IS NULL OR year_to >= year_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS title_companies_unique_idx
  ON catalog.title_companies (title_id, company_id, role);
CREATE INDEX IF NOT EXISTS title_companies_title_idx
  ON catalog.title_companies (title_id, role, ordering);
CREATE INDEX IF NOT EXISTS title_companies_company_idx
  ON catalog.title_companies (company_id, title_id);

-- ── Keywords ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog.keywords (
  id          UUID PRIMARY KEY,
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL,
  title_count INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN catalog.keywords.title_count IS 'Denormalized fan-out count maintained by the repository on link/unlink.';

CREATE UNIQUE INDEX IF NOT EXISTS keywords_slug_idx ON catalog.keywords (slug);
CREATE INDEX IF NOT EXISTS keywords_count_idx ON catalog.keywords (title_count DESC, slug);

CREATE TABLE IF NOT EXISTS catalog.title_keywords (
  title_id       UUID NOT NULL REFERENCES catalog.titles (id) ON DELETE CASCADE,
  keyword_id     UUID NOT NULL REFERENCES catalog.keywords (id) ON DELETE CASCADE,
  relevant_votes INT NOT NULL DEFAULT 0,
  total_votes    INT NOT NULL DEFAULT 0,
  ordering       INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (title_id, keyword_id),
  CHECK (relevant_votes <= total_votes)
);

COMMENT ON TABLE catalog.title_keywords IS 'Plot keywords with relevance voting (relevant/total), ordered for display.';

CREATE INDEX IF NOT EXISTS title_keywords_keyword_idx
  ON catalog.title_keywords (keyword_id, title_id);
CREATE INDEX IF NOT EXISTS title_keywords_title_ordering_idx
  ON catalog.title_keywords (title_id, ordering);
