import type { SqlExecutor, TransactionalSqlExecutor } from "../hyperdrive/executor.js";
import type {
  List,
  ListItem,
  ListItemSort,
  ListsRepository,
  ListsResult,
  UpdateListInput,
} from "./types.js";

type Row = Record<string, unknown>;

const LIST_COLUMNS = `id, owner_user_id, name, description, kind, visibility, is_ranked,
  item_count, like_count, created_at, updated_at`;
const ITEM_COLUMNS = `id, list_id, entity_type, entity_id, position, note, added_at`;

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function bool(value: unknown): boolean {
  return value === true || value === "t" || value === "true";
}

function internalError(message: string): ListsResult<never> {
  return { ok: false, error: { kind: "internal", message } };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

function mapList(row: Row): List {
  return {
    id: row.id as string,
    ownerUserId: row.owner_user_id as string,
    name: row.name as string,
    description: (row.description as string) ?? null,
    kind: row.kind as List["kind"],
    visibility: row.visibility as List["visibility"],
    isRanked: bool(row.is_ranked),
    itemCount: num(row.item_count),
    likeCount: num(row.like_count),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapItem(row: Row): ListItem {
  return {
    id: row.id as string,
    listId: row.list_id as string,
    entityType: row.entity_type as ListItem["entityType"],
    entityId: row.entity_id as string,
    position: num(row.position),
    note: (row.note as string) ?? null,
    addedAt: new Date(row.added_at as string),
  };
}

function itemOrderBy(sort: ListItemSort): string {
  switch (sort) {
    case "added":
      return "added_at DESC, id";
    case "alphabetical":
      // The display label lives in the owning context, so alphabetical falls
      // back to insertion order here and is re-sorted after hydration.
      return "position, added_at";
    case "position":
    default:
      return "position, added_at, id";
  }
}

export function createListsRepository(
  executor: SqlExecutor | TransactionalSqlExecutor,
): ListsRepository {
  const tx = executor as TransactionalSqlExecutor;
  const canTransact = typeof tx.transaction === "function";

  async function withTx<T>(fn: (sql: SqlExecutor) => Promise<T>): Promise<T> {
    return canTransact ? tx.transaction(fn) : fn(executor);
  }

  async function readList(sql: SqlExecutor, listId: string): Promise<List | null> {
    const result = await sql.execute(`SELECT ${LIST_COLUMNS} FROM lists.lists WHERE id = $1`, [
      listId,
    ]);
    const row = result.rows[0];
    return row ? mapList(row) : null;
  }

  return {
    async createList(input) {
      try {
        const result = await executor.execute(
          `INSERT INTO lists.lists
             (id, owner_user_id, name, description, kind, visibility, is_ranked, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
           RETURNING ${LIST_COLUMNS}`,
          [
            input.id,
            input.ownerUserId,
            input.name,
            input.description ?? null,
            input.kind ?? "custom",
            input.visibility ?? "private",
            input.isRanked ?? false,
            input.now.toISOString(),
          ],
        );
        const row = result.rows[0];
        if (!row) return { ok: false, error: { kind: "conflict", entity: "list" } };
        return { ok: true, value: mapList(row) };
      } catch (err) {
        if (isUniqueViolation(err)) {
          return { ok: false, error: { kind: "conflict", entity: "list" } };
        }
        return internalError("Failed to create list");
      }
    },

    async ensureWatchlist(userId, id, now) {
      try {
        // ON CONFLICT against the partial index makes this a true
        // get-or-create: two concurrent first-adds cannot make two watchlists.
        const inserted = await executor.execute(
          `INSERT INTO lists.lists
             (id, owner_user_id, name, kind, visibility, created_at, updated_at)
           VALUES ($1,$2,'Watchlist','watchlist','private',$3,$3)
           ON CONFLICT (owner_user_id) WHERE kind = 'watchlist' DO NOTHING
           RETURNING ${LIST_COLUMNS}`,
          [id, userId, now.toISOString()],
        );
        const row = inserted.rows[0];
        if (row) return { ok: true, value: mapList(row) };

        const existing = await executor.execute(
          `SELECT ${LIST_COLUMNS} FROM lists.lists
            WHERE owner_user_id = $1 AND kind = 'watchlist'`,
          [userId],
        );
        const found = existing.rows[0];
        if (!found) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapList(found) };
      } catch {
        return internalError("Failed to resolve watchlist");
      }
    },

    async getList(listId) {
      try {
        const list = await readList(executor, listId);
        if (!list) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: list };
      } catch {
        return internalError("Failed to load list");
      }
    },

    async listUserLists(userId, params) {
      const where = [`owner_user_id = $1`];
      const values: unknown[] = [userId];
      if (params.visibleOnly) {
        // Someone else's profile shows public and unlisted, never private.
        where.push(`visibility <> 'private'`);
      }
      values.push(params.limit, params.offset);
      try {
        const result = await executor.execute(
          `SELECT ${LIST_COLUMNS} FROM lists.lists
            WHERE ${where.join(" AND ")}
            ORDER BY kind = 'watchlist' DESC, updated_at DESC, id
            LIMIT $${values.length - 1} OFFSET $${values.length}`,
          values,
        );
        return { ok: true, value: result.rows.map(mapList) };
      } catch {
        return internalError("Failed to list lists");
      }
    },

    async updateList(listId, ownerUserId, input: UpdateListInput, now) {
      const sets: string[] = [];
      const params: unknown[] = [listId, ownerUserId];
      const columns: Record<keyof UpdateListInput, string> = {
        name: "name",
        description: "description",
        visibility: "visibility",
        isRanked: "is_ranked",
      };
      for (const [field, column] of Object.entries(columns)) {
        const value = input[field as keyof UpdateListInput];
        if (value === undefined) continue;
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      }
      if (sets.length === 0) return this.getList(listId);
      params.push(now.toISOString());
      sets.push(`updated_at = $${params.length}`);

      try {
        const result = await executor.execute(
          `UPDATE lists.lists SET ${sets.join(", ")}
            WHERE id = $1 AND owner_user_id = $2
            RETURNING ${LIST_COLUMNS}`,
          params,
        );
        const row = result.rows[0];
        if (!row) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapList(row) };
      } catch {
        return internalError("Failed to update list");
      }
    },

    async deleteList(listId, ownerUserId) {
      try {
        // The watchlist is structural: deleting it would leave the toggle with
        // nowhere to write. Renaming or emptying it is allowed; removing is not.
        const result = await executor.execute(
          `DELETE FROM lists.lists
            WHERE id = $1 AND owner_user_id = $2 AND kind <> 'watchlist'`,
          [listId, ownerUserId],
        );
        if (result.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: undefined };
      } catch {
        return internalError("Failed to delete list");
      }
    },

    async addItem(input) {
      try {
        return await withTx(async (sql) => {
          const inserted = await sql.execute(
            `INSERT INTO lists.list_items
               (id, list_id, entity_type, entity_id, position, note, added_at)
             SELECT $1, $2, $3, $4,
                    COALESCE($5, (SELECT COALESCE(MAX(position) + 1, 0)
                                    FROM lists.list_items WHERE list_id = $2)),
                    $6, $7
             WHERE EXISTS (SELECT 1 FROM lists.lists WHERE id = $2)
             ON CONFLICT (list_id, entity_type, entity_id) DO NOTHING
             RETURNING ${ITEM_COLUMNS}`,
            [
              input.id,
              input.listId,
              input.entityType,
              input.entityId,
              input.position ?? null,
              input.note ?? null,
              input.now.toISOString(),
            ],
          );
          const row = inserted.rows[0];
          if (!row) {
            // Either the list is gone or the entity is already on it. Adding a
            // title that is already on the watchlist is not an error — the
            // caller's intent ("this should be on my list") is satisfied.
            const existing = await sql.execute(
              `SELECT ${ITEM_COLUMNS} FROM lists.list_items
                WHERE list_id = $1 AND entity_type = $2 AND entity_id = $3`,
              [input.listId, input.entityType, input.entityId],
            );
            const found = existing.rows[0];
            if (!found) return { ok: false as const, error: { kind: "not_found" as const } };
            return { ok: true as const, value: mapItem(found) };
          }

          await sql.execute(
            `UPDATE lists.lists SET item_count = item_count + 1, updated_at = $2 WHERE id = $1`,
            [input.listId, input.now.toISOString()],
          );
          return { ok: true as const, value: mapItem(row) };
        });
      } catch {
        return internalError("Failed to add item");
      }
    },

    async removeItem(listId, ownerUserId, entityType, entityId, now) {
      try {
        return await withTx(async (sql) => {
          const removed = await sql.execute(
            `DELETE FROM lists.list_items
              WHERE list_id = $1 AND entity_type = $2 AND entity_id = $3
                AND EXISTS (SELECT 1 FROM lists.lists
                             WHERE id = $1 AND owner_user_id = $4)`,
            [listId, entityType, entityId, ownerUserId],
          );
          if (removed.rowCount === 0) {
            return { ok: false as const, error: { kind: "not_found" as const } };
          }
          await sql.execute(
            `UPDATE lists.lists
                SET item_count = GREATEST(item_count - 1, 0), updated_at = $2
              WHERE id = $1`,
            [listId, now.toISOString()],
          );
          return { ok: true as const, value: undefined };
        });
      } catch {
        return internalError("Failed to remove item");
      }
    },

    async removeItemById(itemId, ownerUserId, now) {
      try {
        return await withTx(async (sql) => {
          const removed = await sql.execute(
            `DELETE FROM lists.list_items
              WHERE id = $1
                AND EXISTS (SELECT 1 FROM lists.lists
                             WHERE id = lists.list_items.list_id AND owner_user_id = $2)
              RETURNING list_id`,
            [itemId, ownerUserId],
          );
          const row = removed.rows[0];
          if (!row) return { ok: false as const, error: { kind: "not_found" as const } };
          await sql.execute(
            `UPDATE lists.lists
                SET item_count = GREATEST(item_count - 1, 0), updated_at = $2
              WHERE id = $1`,
            [row.list_id, now.toISOString()],
          );
          return { ok: true as const, value: undefined };
        });
      } catch {
        return internalError("Failed to remove item");
      }
    },

    async updateItem(itemId, ownerUserId, changes, now) {
      const sets: string[] = [];
      const params: unknown[] = [itemId, ownerUserId];
      if (changes.position !== undefined) {
        params.push(changes.position);
        sets.push(`position = $${params.length}`);
      }
      if (changes.note !== undefined) {
        params.push(changes.note);
        sets.push(`note = $${params.length}`);
      }
      if (sets.length === 0) return { ok: false, error: { kind: "not_found" } };

      try {
        const result = await executor.execute(
          `UPDATE lists.list_items SET ${sets.join(", ")}
            WHERE id = $1
              AND EXISTS (SELECT 1 FROM lists.lists
                           WHERE id = lists.list_items.list_id AND owner_user_id = $2)
            RETURNING ${ITEM_COLUMNS}`,
          params,
        );
        const row = result.rows[0];
        if (!row) return { ok: false, error: { kind: "not_found" } };
        await executor.execute(`UPDATE lists.lists SET updated_at = $2 WHERE id = $1`, [
          row.list_id,
          now.toISOString(),
        ]);
        return { ok: true, value: mapItem(row) };
      } catch {
        return internalError("Failed to update item");
      }
    },

    async listItems(listId, params) {
      try {
        const result = await executor.execute(
          `SELECT ${ITEM_COLUMNS} FROM lists.list_items
            WHERE list_id = $1
            ORDER BY ${itemOrderBy(params.sort)}
            LIMIT $2 OFFSET $3`,
          [listId, params.limit, params.offset],
        );
        return { ok: true, value: result.rows.map(mapItem) };
      } catch {
        return internalError("Failed to list items");
      }
    },

    async containsEntity(listId, entityType, entityId) {
      try {
        const result = await executor.execute(
          `SELECT 1 FROM lists.list_items
            WHERE list_id = $1 AND entity_type = $2 AND entity_id = $3`,
          [listId, entityType, entityId],
        );
        return { ok: true, value: result.rowCount > 0 };
      } catch {
        return internalError("Failed to check list membership");
      }
    },

    async likeList(listId, userId) {
      try {
        return await withTx(async (sql) => {
          const inserted = await sql.execute(
            `INSERT INTO lists.list_likes (list_id, user_id) VALUES ($1,$2)
             ON CONFLICT (list_id, user_id) DO NOTHING
             RETURNING list_id`,
            [listId, userId],
          );
          // Only a NEW like moves the counter, so liking twice is idempotent.
          if (inserted.rowCount > 0) {
            await sql.execute(
              `UPDATE lists.lists SET like_count = like_count + 1 WHERE id = $1`,
              [listId],
            );
          }
          const list = await readList(sql, listId);
          if (!list) return { ok: false as const, error: { kind: "not_found" as const } };
          return { ok: true as const, value: list };
        });
      } catch {
        return internalError("Failed to like list");
      }
    },

    async unlikeList(listId, userId) {
      try {
        return await withTx(async (sql) => {
          const removed = await sql.execute(
            `DELETE FROM lists.list_likes WHERE list_id = $1 AND user_id = $2 RETURNING list_id`,
            [listId, userId],
          );
          if (removed.rowCount > 0) {
            await sql.execute(
              `UPDATE lists.lists SET like_count = GREATEST(like_count - 1, 0) WHERE id = $1`,
              [listId],
            );
          }
          const list = await readList(sql, listId);
          if (!list) return { ok: false as const, error: { kind: "not_found" as const } };
          return { ok: true as const, value: list };
        });
      } catch {
        return internalError("Failed to unlike list");
      }
    },
  };
}
