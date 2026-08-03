import type { SqlExecutor } from "../hyperdrive/executor.js";
import { inList } from "../hyperdrive/in-list.js";
import type {
  DocumentFilters,
  SearchEntityType,
  SearchHit,
  SearchRepository,
  SearchResult,
} from "./types.js";

type Row = Record<string, unknown>;

const DOCUMENT_COLUMNS = `entity_type, entity_id, public_id, display, secondary, image_url,
  body, popularity, filters`;

function mapHit(row: Row, score = 0): SearchHit {
  return {
    entityType: row.entity_type as SearchEntityType,
    entityId: row.entity_id as string,
    publicId: row.public_id as string,
    display: row.display as string,
    secondary: (row.secondary as string) ?? "",
    imageUrl: (row.image_url as string) ?? null,
    body: (row.body as string) ?? "",
    popularity: Number(row.popularity ?? 0),
    filters: parseFilters(row.filters),
    score: row.score === undefined || row.score === null ? score : Number(row.score),
  };
}

function parseFilters(value: unknown): DocumentFilters {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as DocumentFilters;
    } catch {
      return {};
    }
  }
  return value as DocumentFilters;
}

function internalError(message: string): SearchResult<never> {
  return { ok: false, error: { kind: "internal", message } };
}

/**
 * Turn free text into a prefix tsquery: `blade run` → `blade:* & run:*`.
 * Built from tokens rather than passed to `to_tsquery` raw — a user typing
 * `&` or `!` must produce no results, not a syntax error.
 */
export function toPrefixTsQuery(input: string): string {
  const tokens = input
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0)
    .slice(0, 12);
  return tokens.map((token) => `${token}:*`).join(" & ");
}

export function createSearchRepository(executor: SqlExecutor): SearchRepository {
  return {
    async upsertDocuments(documents) {
      if (documents.length === 0) return { ok: true, value: 0 };
      try {
        let written = 0;
        for (const doc of documents) {
          await executor.execute(
            `INSERT INTO search.documents
               (entity_type, entity_id, public_id, display, secondary, image_url, body, popularity, filters)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
             ON CONFLICT (entity_type, entity_id) DO UPDATE
               SET public_id  = EXCLUDED.public_id,
                   display    = EXCLUDED.display,
                   secondary  = EXCLUDED.secondary,
                   image_url  = EXCLUDED.image_url,
                   body       = EXCLUDED.body,
                   popularity = EXCLUDED.popularity,
                   filters    = EXCLUDED.filters,
                   updated_at = now()`,
            [
              doc.entityType,
              doc.entityId,
              doc.publicId,
              doc.display,
              doc.secondary,
              doc.imageUrl,
              doc.body,
              doc.popularity,
              JSON.stringify(doc.filters ?? {}),
            ],
          );
          written += 1;
        }
        return { ok: true, value: written };
      } catch {
        return internalError("Failed to publish search documents");
      }
    },

    async deleteDocument(entityType, entityId) {
      try {
        await executor.execute(
          `DELETE FROM search.documents WHERE entity_type = $1 AND entity_id = $2`,
          [entityType, entityId],
        );
        // Deleting an absent document is success: unpublishing twice must not
        // be an error for the caller.
        return { ok: true, value: undefined };
      } catch {
        return internalError("Failed to remove search document");
      }
    },

    async suggest(query, limit, types) {
      const trimmed = query.trim();
      if (trimmed.length === 0) return { ok: true, value: [] };

      const values: unknown[] = [trimmed];
      const where: string[] = [];
      if (types && types.length > 0) {
        where.push(`entity_type IN (${inList(types, values)})`);
      }
      const tsquery = toPrefixTsQuery(trimmed);
      if (tsquery) {
        values.push(tsquery);
        where.push(
          `(display ILIKE '%' || $1 || '%' OR document @@ to_tsquery('simple', $${values.length}))`,
        );
      } else {
        where.push(`display ILIKE '%' || $1 || '%'`);
      }
      values.push(limit);

      try {
        const result = await executor.execute(
          `SELECT ${DOCUMENT_COLUMNS},
                  -- Similarity dominates; popularity only breaks ties, so a
                  -- blockbuster cannot outrank an exact prefix match.
                  (similarity(display, $1) * 10
                   + CASE WHEN display ILIKE $1 || '%' THEN 5 ELSE 0 END
                   + LEAST(popularity, 1)) AS score
             FROM search.documents
            WHERE ${where.join(" AND ")}
            ORDER BY score DESC, popularity DESC, display
            LIMIT $${values.length}`,
          values,
        );
        return { ok: true, value: result.rows.map((row) => mapHit(row)) };
      } catch {
        return internalError("Search is unavailable");
      }
    },

    async search(query, types, limit, offset) {
      const trimmed = query.trim();
      const tsquery = toPrefixTsQuery(trimmed);
      if (!tsquery) return { ok: true, value: [] };

      const values: unknown[] = [tsquery, trimmed];
      const where: string[] = [`document @@ to_tsquery('simple', $1)`];
      if (types && types.length > 0) {
        where.push(`entity_type IN (${inList(types, values)})`);
      }
      values.push(limit, offset);

      try {
        const result = await executor.execute(
          `SELECT ${DOCUMENT_COLUMNS},
                  (ts_rank(document, to_tsquery('simple', $1)) * 10
                   + similarity(display, $2)
                   + LEAST(popularity, 1)) AS score
             FROM search.documents
            WHERE ${where.join(" AND ")}
            ORDER BY score DESC, popularity DESC, display
            LIMIT $${values.length - 1} OFFSET $${values.length}`,
          values,
        );
        return { ok: true, value: result.rows.map((row) => mapHit(row)) };
      } catch {
        return internalError("Search is unavailable");
      }
    },

    async searchTitles(query) {
      const where: string[] = [`entity_type = 'title'`];
      const values: unknown[] = [];
      let rankExpr = "0";

      const text = query.text?.trim();
      if (text) {
        const tsquery = toPrefixTsQuery(text);
        if (tsquery) {
          values.push(tsquery, text);
          where.push(`document @@ to_tsquery('simple', $${values.length - 1})`);
          rankExpr = `(ts_rank(document, to_tsquery('simple', $${values.length - 1})) * 10 + similarity(display, $${values.length}))`;
        }
      }

      pushArrayOverlap(where, values, "genres", query.genres);
      pushArrayOverlap(where, values, "certificates", query.certificates);
      pushArrayOverlap(where, values, "countries", query.countries);
      pushArrayOverlap(where, values, "languages", query.languages);
      pushArrayOverlap(where, values, "keywords", query.keywords);
      pushArrayOverlap(where, values, "companies", query.companies);

      if (query.kinds && query.kinds.length > 0) {
        where.push(`filters ->> 'kind' IN (${inList(query.kinds, values)})`);
      }
      pushNumericRange(where, values, "year", query.yearFrom, query.yearTo);
      pushNumericRange(where, values, "rating", query.ratingFrom, query.ratingTo);
      pushNumericRange(where, values, "runtime", query.runtimeMin, query.runtimeMax);
      if (query.votesMin != null) {
        values.push(query.votesMin);
        where.push(`COALESCE((filters ->> 'votes')::numeric, 0) >= $${values.length}`);
      }
      if (!query.includeAdult) {
        where.push(`COALESCE((filters ->> 'adult')::boolean, FALSE) = FALSE`);
      }

      const order = titleOrderBy(query.sort ?? (text ? "relevance" : "popularity"), query.order ?? "desc");
      values.push(query.limit, query.offset);

      try {
        const result = await executor.execute(
          `SELECT ${DOCUMENT_COLUMNS}, ${rankExpr} AS score
             FROM search.documents
            WHERE ${where.join(" AND ")}
            ORDER BY ${order}
            LIMIT $${values.length - 1} OFFSET $${values.length}`,
          values,
        );
        return { ok: true, value: result.rows.map((row) => mapHit(row)) };
      } catch {
        return internalError("Search is unavailable");
      }
    },

    async searchNames(query) {
      const where: string[] = [`entity_type = 'person'`];
      const values: unknown[] = [];
      let rankExpr = "0";

      const text = query.text?.trim();
      if (text) {
        const tsquery = toPrefixTsQuery(text);
        if (tsquery) {
          values.push(tsquery, text);
          where.push(`document @@ to_tsquery('simple', $${values.length - 1})`);
          rankExpr = `(ts_rank(document, to_tsquery('simple', $${values.length - 1})) * 10 + similarity(display, $${values.length}))`;
        }
      }

      pushArrayOverlap(where, values, "professions", query.professions);
      pushNumericRange(where, values, "bornYear", query.bornFrom, query.bornTo);
      pushNumericRange(where, values, "diedYear", query.diedFrom, query.diedTo);
      if (query.birthPlace) {
        values.push(`%${query.birthPlace}%`);
        where.push(`filters ->> 'birthPlace' ILIKE $${values.length}`);
      }

      const order = nameOrderBy(query.sort ?? (text ? "relevance" : "popularity"), query.order ?? "desc");
      values.push(query.limit, query.offset);

      try {
        const result = await executor.execute(
          `SELECT ${DOCUMENT_COLUMNS}, ${rankExpr} AS score
             FROM search.documents
            WHERE ${where.join(" AND ")}
            ORDER BY ${order}
            LIMIT $${values.length - 1} OFFSET $${values.length}`,
          values,
        );
        return { ok: true, value: result.rows.map((row) => mapHit(row)) };
      } catch {
        return internalError("Search is unavailable");
      }
    },

    async countDocuments(entityType) {
      try {
        const result = entityType
          ? await executor.execute(
              `SELECT COUNT(*)::int AS count FROM search.documents WHERE entity_type = $1`,
              [entityType],
            )
          : await executor.execute(`SELECT COUNT(*)::int AS count FROM search.documents`);
        return { ok: true, value: Number(result.rows[0]?.count ?? 0) };
      } catch {
        return internalError("Search is unavailable");
      }
    },
  };
}

function pushArrayOverlap(
  where: string[],
  values: unknown[],
  key: keyof DocumentFilters,
  list: string[] | undefined,
): void {
  if (!list || list.length === 0) return;
  values.push(JSON.stringify(list));
  // `?|` would need the operator escaped through the driver; comparing the
  // extracted array against a jsonb literal keeps the query parameterized.
  where.push(
    `EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(filters -> '${String(key)}', '[]'::jsonb)) AS f(v)
              WHERE f.v = ANY(SELECT jsonb_array_elements_text($${values.length}::jsonb)))`,
  );
}

function pushNumericRange(
  where: string[],
  values: unknown[],
  key: keyof DocumentFilters,
  from: number | null | undefined,
  to: number | null | undefined,
): void {
  if (from != null) {
    values.push(from);
    where.push(`(filters ->> '${String(key)}')::numeric >= $${values.length}`);
  }
  if (to != null) {
    values.push(to);
    where.push(`(filters ->> '${String(key)}')::numeric <= $${values.length}`);
  }
}

/**
 * Sort keys map to fixed SQL fragments — never interpolated user input. An
 * unknown key falls back to popularity rather than erroring, so a stale client
 * degrades instead of breaking.
 */
function titleOrderBy(sort: string, order: "asc" | "desc"): string {
  const dir = order === "asc" ? "ASC" : "DESC";
  switch (sort) {
    case "relevance":
      return `score DESC, popularity DESC, display`;
    case "rating":
      return `(filters ->> 'rating')::numeric ${dir} NULLS LAST, popularity DESC`;
    case "votes":
      return `(filters ->> 'votes')::numeric ${dir} NULLS LAST, popularity DESC`;
    case "release_date":
      return `(filters ->> 'year')::numeric ${dir} NULLS LAST, display`;
    case "alphabetical":
      return `display ${dir === "DESC" ? "DESC" : "ASC"}`;
    case "runtime":
      return `(filters ->> 'runtime')::numeric ${dir} NULLS LAST, display`;
    case "popularity":
    default:
      return `popularity ${dir}, display`;
  }
}

function nameOrderBy(sort: string, order: "asc" | "desc"): string {
  const dir = order === "asc" ? "ASC" : "DESC";
  switch (sort) {
    case "relevance":
      return `score DESC, popularity DESC, display`;
    case "alphabetical":
      return `display ${dir === "DESC" ? "DESC" : "ASC"}`;
    case "birth_date":
      return `(filters ->> 'bornYear')::numeric ${dir} NULLS LAST, display`;
    case "popularity":
    default:
      return `popularity ${dir}, display`;
  }
}
