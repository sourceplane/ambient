import type { SqlExecutor } from "../hyperdrive/executor.js";
import type { Uuid } from "../ids/index.js";
import {
  internalError,
  isUniqueViolation,
  mapAka,
  mapBoxOffice,
  mapCertificate,
  mapConnection,
  mapExternalId,
  mapGenre,
  mapLocation,
  mapReleaseDate,
  mapTechnicalSpec,
  mapTitle,
  mapTitleGenre,
  toPage,
} from "./mappers.js";
import { CONNECTION_INVERSE } from "./types.js";
import type {
  CatalogResult,
  ConnectionKind,
  CreateTitleInput,
  Genre,
  PagedResult,
  PageQueryParams,
  Title,
  TitleAka,
  TitleBoxOffice,
  TitleCertificate,
  TitleConnection,
  TitleExternalId,
  TitleGenre,
  TitleListFilters,
  TitleLocation,
  TitleReleaseDate,
  TitleTechnicalSpec,
  UpdateTitleInput,
} from "./types.js";

const TITLE_FIELDS = [
  "id",
  "kind",
  "primary_title",
  "original_title",
  "sort_title",
  "start_year",
  "end_year",
  "runtime_minutes",
  "is_adult",
  "production_status",
  "plot_outline",
  "plot_summary",
  "synopsis",
  "tagline",
  "status",
  "created_at",
  "updated_at",
  "archived_at",
] as const;

const TITLE_COLUMNS = TITLE_FIELDS.join(", ");

/** Same column list qualified with a table alias, for joined selects. */
function titleColumns(alias: string, resultPrefix = ""): string {
  return TITLE_FIELDS.map((f) =>
    resultPrefix ? `${alias}.${f} AS ${resultPrefix}${f}` : `${alias}.${f}`,
  ).join(", ");
}

export { TITLE_COLUMNS, TITLE_FIELDS, titleColumns };

/** Column name per updatable field — the allow-list that keeps UPDATE parameterized. */
const TITLE_UPDATE_COLUMNS: Record<keyof UpdateTitleInput, string> = {
  primaryTitle: "primary_title",
  originalTitle: "original_title",
  sortTitle: "sort_title",
  startYear: "start_year",
  endYear: "end_year",
  runtimeMinutes: "runtime_minutes",
  isAdult: "is_adult",
  productionStatus: "production_status",
  plotOutline: "plot_outline",
  plotSummary: "plot_summary",
  synopsis: "synopsis",
  tagline: "tagline",
  status: "status",
};

export interface TitlesRepositoryPart {
  createTitle(input: CreateTitleInput): Promise<CatalogResult<Title>>;
  getTitleById(titleId: Uuid): Promise<CatalogResult<Title>>;
  updateTitle(titleId: Uuid, input: UpdateTitleInput, updatedAt: Date): Promise<CatalogResult<Title>>;
  archiveTitle(titleId: Uuid, archivedAt: Date): Promise<CatalogResult<Title>>;
  listTitlesPaged(filters: TitleListFilters, params: PageQueryParams): Promise<CatalogResult<PagedResult<Title>>>;
  getTitlesByIds(titleIds: string[]): Promise<CatalogResult<Title[]>>;
  listAkas(titleId: Uuid): Promise<CatalogResult<TitleAka[]>>;
  replaceAkas(titleId: Uuid, akas: Omit<TitleAka, "id" | "titleId">[]): Promise<CatalogResult<TitleAka[]>>;
  listGenres(titleId: Uuid): Promise<CatalogResult<TitleGenre[]>>;
  setGenres(titleId: Uuid, genreSlugs: string[]): Promise<CatalogResult<TitleGenre[]>>;
  listAllGenres(): Promise<CatalogResult<Genre[]>>;
  listReleaseDates(titleId: Uuid): Promise<CatalogResult<TitleReleaseDate[]>>;
  listCertificates(titleId: Uuid): Promise<CatalogResult<TitleCertificate[]>>;
  listCountries(titleId: Uuid): Promise<CatalogResult<string[]>>;
  listLanguages(titleId: Uuid): Promise<CatalogResult<string[]>>;
  listLocations(titleId: Uuid): Promise<CatalogResult<TitleLocation[]>>;
  getBoxOffice(titleId: Uuid): Promise<CatalogResult<TitleBoxOffice | null>>;
  listTechnicalSpecs(titleId: Uuid): Promise<CatalogResult<TitleTechnicalSpec[]>>;
  listExternalIds(titleId: Uuid): Promise<CatalogResult<TitleExternalId[]>>;
  listConnections(titleId: Uuid): Promise<CatalogResult<TitleConnection[]>>;
  linkConnection(
    id: Uuid,
    inverseId: Uuid,
    fromTitleId: Uuid,
    toTitleId: Uuid,
    kind: ConnectionKind,
    note: string | null,
  ): Promise<CatalogResult<void>>;
}

export function createTitlesRepository(executor: SqlExecutor): TitlesRepositoryPart {
  const repo: TitlesRepositoryPart = {
    async createTitle(input) {
      try {
        const result = await executor.execute(
          `INSERT INTO catalog.titles
             (id, kind, primary_title, original_title, sort_title, start_year, end_year,
              runtime_minutes, is_adult, production_status, plot_outline, plot_summary,
              synopsis, tagline, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)
           ON CONFLICT (id) DO NOTHING
           RETURNING ${TITLE_COLUMNS}`,
          [
            input.id,
            input.kind,
            input.primaryTitle,
            input.originalTitle ?? null,
            input.sortTitle,
            input.startYear ?? null,
            input.endYear ?? null,
            input.runtimeMinutes ?? null,
            input.isAdult ?? false,
            input.productionStatus ?? "released",
            input.plotOutline ?? null,
            input.plotSummary ?? null,
            input.synopsis ?? null,
            input.tagline ?? null,
            input.status ?? "published",
            input.createdAt.toISOString(),
          ],
        );
        if (result.rowCount === 0) {
          return { ok: false, error: { kind: "conflict", entity: "title" } };
        }
        return { ok: true, value: mapTitle(result.rows[0]!) };
      } catch (err) {
        if (isUniqueViolation(err)) {
          return { ok: false, error: { kind: "conflict", entity: "title" } };
        }
        return internalError("Failed to create title");
      }
    },

    async getTitleById(titleId) {
      try {
        const result = await executor.execute(
          `SELECT ${TITLE_COLUMNS} FROM catalog.titles WHERE id = $1`,
          [titleId],
        );
        const row = result.rows[0];
        if (!row) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapTitle(row) };
      } catch {
        return internalError("Failed to load title");
      }
    },

    async updateTitle(titleId, input, updatedAt) {
      const sets: string[] = [];
      const params: unknown[] = [titleId];
      for (const [field, column] of Object.entries(TITLE_UPDATE_COLUMNS)) {
        const value = input[field as keyof UpdateTitleInput];
        if (value === undefined) continue;
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      }
      if (sets.length === 0) return repo.getTitleById(titleId);
      params.push(updatedAt.toISOString());
      sets.push(`updated_at = $${params.length}`);

      try {
        const result = await executor.execute(
          `UPDATE catalog.titles SET ${sets.join(", ")} WHERE id = $1 RETURNING ${TITLE_COLUMNS}`,
          params,
        );
        const row = result.rows[0];
        if (!row) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapTitle(row) };
      } catch {
        return internalError("Failed to update title");
      }
    },

    async archiveTitle(titleId, archivedAt) {
      try {
        const result = await executor.execute(
          `UPDATE catalog.titles
              SET status = 'archived', archived_at = $2, updated_at = $2
            WHERE id = $1 AND status <> 'archived'
            RETURNING ${TITLE_COLUMNS}`,
          [titleId, archivedAt.toISOString()],
        );
        const row = result.rows[0];
        if (!row) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapTitle(row) };
      } catch {
        return internalError("Failed to archive title");
      }
    },

    async listTitlesPaged(filters, params) {
      const where: string[] = [];
      const values: unknown[] = [];

      const statuses = filters.statuses ?? ["published"];
      values.push(statuses);
      where.push(`t.status = ANY($${values.length}::text[])`);

      if (filters.kinds && filters.kinds.length > 0) {
        values.push(filters.kinds);
        where.push(`t.kind = ANY($${values.length}::text[])`);
      }
      if (filters.yearFrom != null) {
        values.push(filters.yearFrom);
        where.push(`t.start_year >= $${values.length}`);
      }
      if (filters.yearTo != null) {
        values.push(filters.yearTo);
        where.push(`t.start_year <= $${values.length}`);
      }
      if (!filters.includeAdult) {
        where.push(`t.is_adult = FALSE`);
      }
      if (filters.genreSlugs && filters.genreSlugs.length > 0) {
        values.push(filters.genreSlugs);
        where.push(
          `EXISTS (SELECT 1 FROM catalog.title_genres tg
                     JOIN catalog.genres g ON g.id = tg.genre_id
                    WHERE tg.title_id = t.id AND g.slug = ANY($${values.length}::text[]))`,
        );
      }
      if (params.cursor) {
        values.push(params.cursor.createdAt, params.cursor.id);
        where.push(`(t.created_at, t.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
      }
      values.push(params.limit + 1);

      try {
        const result = await executor.execute(
          `SELECT ${titleColumns("t")}
             FROM catalog.titles t
            WHERE ${where.join(" AND ")}
            ORDER BY t.created_at DESC, t.id DESC
            LIMIT $${values.length}`,
          values,
        );
        return { ok: true, value: toPage(result.rows.map(mapTitle), params.limit) };
      } catch {
        return internalError("Failed to list titles");
      }
    },

    async getTitlesByIds(titleIds) {
      if (titleIds.length === 0) return { ok: true, value: [] };
      try {
        const result = await executor.execute(
          `SELECT ${TITLE_COLUMNS} FROM catalog.titles WHERE id = ANY($1::uuid[])`,
          [titleIds],
        );
        return { ok: true, value: result.rows.map(mapTitle) };
      } catch {
        return internalError("Failed to load titles");
      }
    },

    async listAkas(titleId) {
      try {
        const result = await executor.execute(
          `SELECT id, title_id, ordering, title, region, language, types, attributes, is_original_title
             FROM catalog.title_akas WHERE title_id = $1 ORDER BY ordering`,
          [titleId],
        );
        return { ok: true, value: result.rows.map(mapAka) };
      } catch {
        return internalError("Failed to list alternate titles");
      }
    },

    async replaceAkas(titleId, akas) {
      try {
        await executor.execute(`DELETE FROM catalog.title_akas WHERE title_id = $1`, [titleId]);
        for (const aka of akas) {
          await executor.execute(
            `INSERT INTO catalog.title_akas
               (id, title_id, ordering, title, region, language, types, attributes, is_original_title)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              titleId,
              aka.ordering,
              aka.title,
              aka.region,
              aka.language,
              aka.types,
              aka.attributes,
              aka.isOriginalTitle,
            ],
          );
        }
        return repo.listAkas(titleId);
      } catch {
        return internalError("Failed to replace alternate titles");
      }
    },

    async listGenres(titleId) {
      try {
        const result = await executor.execute(
          `SELECT g.id, g.slug, g.name, tg.ordering
             FROM catalog.title_genres tg
             JOIN catalog.genres g ON g.id = tg.genre_id
            WHERE tg.title_id = $1
            ORDER BY tg.ordering, g.name`,
          [titleId],
        );
        return { ok: true, value: result.rows.map(mapTitleGenre) };
      } catch {
        return internalError("Failed to list genres");
      }
    },

    async setGenres(titleId, genreSlugs) {
      try {
        await executor.execute(`DELETE FROM catalog.title_genres WHERE title_id = $1`, [titleId]);
        if (genreSlugs.length > 0) {
          // Genres are a closed vocabulary seeded by migration; unknown slugs
          // are created on demand so curation never blocks on a lookup table.
          for (let i = 0; i < genreSlugs.length; i++) {
            const slug = genreSlugs[i]!;
            await executor.execute(
              `INSERT INTO catalog.genres (id, slug, name)
               VALUES (gen_random_uuid(), $1, initcap(replace($1, '-', ' ')))
               ON CONFLICT (slug) DO NOTHING`,
              [slug],
            );
            await executor.execute(
              `INSERT INTO catalog.title_genres (title_id, genre_id, ordering)
               SELECT $1, g.id, $3 FROM catalog.genres g WHERE g.slug = $2
               ON CONFLICT (title_id, genre_id) DO UPDATE SET ordering = EXCLUDED.ordering`,
              [titleId, slug, i],
            );
          }
        }
        return repo.listGenres(titleId);
      } catch {
        return internalError("Failed to set genres");
      }
    },

    async listAllGenres() {
      try {
        const result = await executor.execute(
          `SELECT id, slug, name FROM catalog.genres ORDER BY name`,
        );
        return { ok: true, value: result.rows.map(mapGenre) };
      } catch {
        return internalError("Failed to list genres");
      }
    },

    async listReleaseDates(titleId) {
      try {
        const result = await executor.execute(
          `SELECT id, title_id, country, released_on, kind, note
             FROM catalog.title_release_dates WHERE title_id = $1
            ORDER BY released_on, country`,
          [titleId],
        );
        return { ok: true, value: result.rows.map(mapReleaseDate) };
      } catch {
        return internalError("Failed to list release dates");
      }
    },

    async listCertificates(titleId) {
      try {
        const result = await executor.execute(
          `SELECT id, title_id, country, rating, attributes
             FROM catalog.title_certificates WHERE title_id = $1 ORDER BY country`,
          [titleId],
        );
        return { ok: true, value: result.rows.map(mapCertificate) };
      } catch {
        return internalError("Failed to list certificates");
      }
    },

    async listCountries(titleId) {
      try {
        const result = await executor.execute(
          `SELECT code FROM catalog.title_countries WHERE title_id = $1 ORDER BY ordering, code`,
          [titleId],
        );
        return { ok: true, value: result.rows.map((r) => r.code as string) };
      } catch {
        return internalError("Failed to list countries");
      }
    },

    async listLanguages(titleId) {
      try {
        const result = await executor.execute(
          `SELECT code FROM catalog.title_languages WHERE title_id = $1 ORDER BY ordering, code`,
          [titleId],
        );
        return { ok: true, value: result.rows.map((r) => r.code as string) };
      } catch {
        return internalError("Failed to list languages");
      }
    },

    async listLocations(titleId) {
      try {
        const result = await executor.execute(
          `SELECT id, title_id, location, note, ordering
             FROM catalog.title_locations WHERE title_id = $1 ORDER BY ordering`,
          [titleId],
        );
        return { ok: true, value: result.rows.map(mapLocation) };
      } catch {
        return internalError("Failed to list filming locations");
      }
    },

    async getBoxOffice(titleId) {
      try {
        const result = await executor.execute(
          `SELECT title_id, budget_cents, opening_weekend_cents, opening_weekend_country,
                  opening_weekend_on, gross_domestic_cents, gross_worldwide_cents, currency
             FROM catalog.title_box_office WHERE title_id = $1`,
          [titleId],
        );
        const row = result.rows[0];
        return { ok: true, value: row ? mapBoxOffice(row) : null };
      } catch {
        return internalError("Failed to load box office");
      }
    },

    async listTechnicalSpecs(titleId) {
      try {
        const result = await executor.execute(
          `SELECT id, title_id, spec, value, note, ordering
             FROM catalog.title_technical_specs WHERE title_id = $1 ORDER BY spec, ordering`,
          [titleId],
        );
        return { ok: true, value: result.rows.map(mapTechnicalSpec) };
      } catch {
        return internalError("Failed to list technical specs");
      }
    },

    async listExternalIds(titleId) {
      try {
        const result = await executor.execute(
          `SELECT id, title_id, provider, value, label
             FROM catalog.title_external_ids WHERE title_id = $1 ORDER BY provider`,
          [titleId],
        );
        return { ok: true, value: result.rows.map(mapExternalId) };
      } catch {
        return internalError("Failed to list external ids");
      }
    },

    async listConnections(titleId) {
      try {
        const result = await executor.execute(
          `SELECT tc.id, tc.from_title_id, tc.to_title_id, tc.kind, tc.note,
                  ${titleColumns("t", "c_")}
             FROM catalog.title_connections tc
             JOIN catalog.titles t ON t.id = tc.to_title_id
            WHERE tc.from_title_id = $1 AND t.status = 'published'
            ORDER BY tc.kind, t.start_year NULLS LAST`,
          [titleId],
        );
        return { ok: true, value: result.rows.map(mapConnection) };
      } catch {
        return internalError("Failed to list connections");
      }
    },

    async linkConnection(id, inverseId, fromTitleId, toTitleId, kind, note) {
      try {
        // Both directions in one statement pair: a caller who records
        // "B follows A" gets "A followed_by B" for free, so neither read path
        // needs a UNION over the reversed columns.
        await executor.execute(
          `INSERT INTO catalog.title_connections (id, from_title_id, to_title_id, kind, note)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (from_title_id, to_title_id, kind) DO UPDATE SET note = EXCLUDED.note`,
          [id, fromTitleId, toTitleId, kind, note],
        );
        await executor.execute(
          `INSERT INTO catalog.title_connections (id, from_title_id, to_title_id, kind, note)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (from_title_id, to_title_id, kind) DO UPDATE SET note = EXCLUDED.note`,
          [inverseId, toTitleId, fromTitleId, CONNECTION_INVERSE[kind], note],
        );
        return { ok: true, value: undefined };
      } catch {
        return internalError("Failed to link titles");
      }
    },
  };

  return repo;
}
