-- 280_lists_core
-- Watchlist and user-curated lists.
-- Bounded context: lists
--
-- The watchlist is not a special table: it is a list with kind = 'watchlist',
-- one per user. That means every list feature (ordering, notes, sorting,
-- bulk removal) works on the watchlist for free, and the "add to watchlist"
-- toggle and "add to list" menu share one code path.

CREATE SCHEMA IF NOT EXISTS lists;

COMMENT ON SCHEMA lists IS 'Lists bounded context — owns the watchlist and user-curated lists.';

CREATE TABLE IF NOT EXISTS lists.lists (
  id            UUID PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  kind          TEXT NOT NULL DEFAULT 'custom' CHECK (kind IN ('watchlist', 'custom')),
  visibility    TEXT NOT NULL DEFAULT 'private'
                CHECK (visibility IN ('public', 'private', 'unlisted')),
  is_ranked     BOOLEAN NOT NULL DEFAULT FALSE,
  item_count    INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  like_count    INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE lists.lists IS 'A watchlist is a list with kind = watchlist, so every list feature works on it unchanged.';
COMMENT ON COLUMN lists.lists.is_ranked IS 'A ranked list renders positions; an unranked one is a set the owner still ordered.';
COMMENT ON COLUMN lists.lists.item_count IS 'Denormalized; maintained in the same transaction as the item insert/delete.';

-- Exactly one watchlist per user. Partial so custom lists are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS lists_one_watchlist_idx
  ON lists.lists (owner_user_id) WHERE kind = 'watchlist';

CREATE INDEX IF NOT EXISTS lists_owner_idx
  ON lists.lists (owner_user_id, updated_at DESC, id);
-- Public list discovery: popular first.
CREATE INDEX IF NOT EXISTS lists_public_idx
  ON lists.lists (like_count DESC, updated_at DESC)
  WHERE visibility = 'public';

CREATE TABLE IF NOT EXISTS lists.list_items (
  id          UUID PRIMARY KEY,
  list_id     UUID NOT NULL REFERENCES lists.lists (id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('title', 'person', 'image')),
  entity_id   UUID NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  note        TEXT,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE lists.list_items IS 'Entity references are opaque — a list can hold titles, people or images.';

-- The same entity cannot appear twice in one list.
CREATE UNIQUE INDEX IF NOT EXISTS list_items_unique_idx
  ON lists.list_items (list_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS list_items_order_idx
  ON lists.list_items (list_id, position, added_at);
-- "Is this title on any of my lists?" — the watchlist toggle's probe.
CREATE INDEX IF NOT EXISTS list_items_entity_idx
  ON lists.list_items (entity_type, entity_id, list_id);

CREATE TABLE IF NOT EXISTS lists.list_likes (
  list_id  UUID NOT NULL REFERENCES lists.lists (id) ON DELETE CASCADE,
  user_id  UUID NOT NULL,
  liked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, user_id)
);

COMMENT ON TABLE lists.list_likes IS 'One like per user per list; lists.like_count moves in the same transaction.';
