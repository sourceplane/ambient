-- 230_catalog_media
-- Images and videos, and their links to titles and people.
-- Bounded context: catalog
--
-- We store metadata and a URL, never bytes. Dimensions are required so the
-- web layer can reserve space and ship zero cumulative layout shift.

-- ── Images ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog.images (
  id         UUID PRIMARY KEY,
  url        TEXT NOT NULL,
  width      INT NOT NULL CHECK (width > 0),
  height     INT NOT NULL CHECK (height > 0),
  kind       TEXT NOT NULL CHECK (kind IN (
               'poster', 'still', 'backdrop', 'event', 'headshot',
               'behind_the_scenes', 'production_art', 'logo')),
  caption    TEXT,
  credit     TEXT,
  language   TEXT,
  blurhash   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalog.images IS 'Image metadata + URL. Public ids render as rm_<32 hex>.';
COMMENT ON COLUMN catalog.images.blurhash IS 'Compact placeholder encoding rendered while the real image loads.';

CREATE INDEX IF NOT EXISTS images_kind_idx ON catalog.images (kind, id);

CREATE TABLE IF NOT EXISTS catalog.title_images (
  title_id   UUID NOT NULL REFERENCES catalog.titles (id) ON DELETE CASCADE,
  image_id   UUID NOT NULL REFERENCES catalog.images (id) ON DELETE CASCADE,
  ordering   INT NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (title_id, image_id)
);

-- At most one primary image per title (the poster the site leads with).
CREATE UNIQUE INDEX IF NOT EXISTS title_images_primary_idx
  ON catalog.title_images (title_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS title_images_ordering_idx
  ON catalog.title_images (title_id, ordering, image_id);

CREATE TABLE IF NOT EXISTS catalog.person_images (
  person_id  UUID NOT NULL REFERENCES catalog.people (id) ON DELETE CASCADE,
  image_id   UUID NOT NULL REFERENCES catalog.images (id) ON DELETE CASCADE,
  ordering   INT NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, image_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS person_images_primary_idx
  ON catalog.person_images (person_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS person_images_ordering_idx
  ON catalog.person_images (person_id, ordering, image_id);

-- ── Videos ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog.videos (
  id              UUID PRIMARY KEY,
  title_id        UUID REFERENCES catalog.titles (id) ON DELETE CASCADE,
  person_id       UUID REFERENCES catalog.people (id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN (
                    'trailer', 'teaser', 'clip', 'featurette',
                    'behind_the_scenes', 'interview', 'promo', 'opening_credits')),
  name            TEXT NOT NULL,
  url             TEXT NOT NULL,
  thumbnail_url   TEXT,
  runtime_seconds INT CHECK (runtime_seconds IS NULL OR runtime_seconds >= 0),
  language        TEXT,
  published_at    TIMESTAMPTZ,
  ordering        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (title_id IS NOT NULL OR person_id IS NOT NULL)
);

COMMENT ON TABLE catalog.videos IS 'Trailers and clips referenced by URL — we host metadata, not media. Public ids render as vi_<32 hex>.';

CREATE INDEX IF NOT EXISTS videos_title_idx
  ON catalog.videos (title_id, ordering, id) WHERE title_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS videos_person_idx
  ON catalog.videos (person_id, ordering, id) WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS videos_kind_published_idx
  ON catalog.videos (kind, published_at DESC NULLS LAST);
