import type { SqlExecutor } from "../hyperdrive/executor.js";
import type { Uuid } from "../ids/index.js";
import {
  internalError,
  isForeignKeyViolation,
  isUniqueViolation,
  mapCompany,
  mapImage,
  mapKeyword,
  mapTitle,
  mapTitleCompany,
  mapTitleKeyword,
  mapVideo,
  toPage,
} from "./mappers.js";
import { titleColumns } from "./titles-repository.js";
import type {
  AttachImageInput,
  CatalogResult,
  Company,
  CreateCompanyInput,
  CreateImageInput,
  CreateVideoInput,
  Image,
  ImageKind,
  Keyword,
  PagedResult,
  PageQueryParams,
  Title,
  TitleCompany,
  TitleKeyword,
  Video,
} from "./types.js";

const COMPANY_COLUMNS = `id, name, sort_name, country, founded_year, kind, status`;
const IMAGE_FIELDS = [
  "id",
  "url",
  "width",
  "height",
  "kind",
  "caption",
  "credit",
  "language",
  "blurhash",
] as const;

const IMAGE_COLUMNS = IMAGE_FIELDS.join(", ");

function imageColumns(alias: string): string {
  return IMAGE_FIELDS.map((f) => `${alias}.${f}`).join(", ");
}
const VIDEO_COLUMNS = `id, title_id, person_id, kind, name, url, thumbnail_url,
  runtime_seconds, language, published_at, ordering`;

export interface MediaRepositoryPart {
  createCompany(input: CreateCompanyInput): Promise<CatalogResult<Company>>;
  getCompanyById(companyId: Uuid): Promise<CatalogResult<Company>>;
  listTitleCompanies(titleId: Uuid): Promise<CatalogResult<TitleCompany[]>>;
  listCompanyTitlesPaged(companyId: Uuid, params: PageQueryParams): Promise<CatalogResult<PagedResult<Title>>>;
  listTitleKeywords(titleId: Uuid): Promise<CatalogResult<TitleKeyword[]>>;
  getKeywordBySlug(slug: string): Promise<CatalogResult<Keyword>>;
  listKeywordTitlesPaged(keywordId: string, params: PageQueryParams): Promise<CatalogResult<PagedResult<Title>>>;
  addTitleKeyword(titleId: Uuid, slug: string, name: string, keywordId: Uuid): Promise<CatalogResult<TitleKeyword>>;
  createImage(input: CreateImageInput): Promise<CatalogResult<Image>>;
  attachTitleImage(titleId: Uuid, input: AttachImageInput): Promise<CatalogResult<void>>;
  attachPersonImage(personId: Uuid, input: AttachImageInput): Promise<CatalogResult<void>>;
  listTitleImages(titleId: Uuid, kind: ImageKind | null, limit: number): Promise<CatalogResult<Image[]>>;
  listPersonImages(personId: Uuid, limit: number): Promise<CatalogResult<Image[]>>;
  getPrimaryImages(titleIds: string[]): Promise<CatalogResult<Map<string, Image>>>;
  getPrimaryPersonImages(personIds: string[]): Promise<CatalogResult<Map<string, Image>>>;
  createVideo(input: CreateVideoInput): Promise<CatalogResult<Video>>;
  listTitleVideos(titleId: Uuid, limit: number): Promise<CatalogResult<Video[]>>;
  listPersonVideos(personId: Uuid, limit: number): Promise<CatalogResult<Video[]>>;
  deleteImage(imageId: Uuid): Promise<CatalogResult<void>>;
  deleteVideo(videoId: Uuid): Promise<CatalogResult<void>>;
}

export function createMediaRepository(executor: SqlExecutor): MediaRepositoryPart {
  const repo: MediaRepositoryPart = {
    async createCompany(input) {
      try {
        const result = await executor.execute(
          `INSERT INTO catalog.companies (id, name, sort_name, country, founded_year, kind, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
           ON CONFLICT (id) DO NOTHING
           RETURNING ${COMPANY_COLUMNS}`,
          [
            input.id,
            input.name,
            input.sortName,
            input.country ?? null,
            input.foundedYear ?? null,
            input.kind ?? "production",
            input.createdAt.toISOString(),
          ],
        );
        if (result.rowCount === 0) {
          return { ok: false, error: { kind: "conflict", entity: "company" } };
        }
        return { ok: true, value: mapCompany(result.rows[0]!) };
      } catch (err) {
        if (isUniqueViolation(err)) {
          return { ok: false, error: { kind: "conflict", entity: "company" } };
        }
        return internalError("Failed to create company");
      }
    },

    async getCompanyById(companyId) {
      try {
        const result = await executor.execute(
          `SELECT ${COMPANY_COLUMNS} FROM catalog.companies WHERE id = $1`,
          [companyId],
        );
        const row = result.rows[0];
        if (!row) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapCompany(row) };
      } catch {
        return internalError("Failed to load company");
      }
    },

    async listTitleCompanies(titleId) {
      try {
        const result = await executor.execute(
          `SELECT tc.id, tc.title_id, tc.company_id, tc.role, tc.note, tc.year_from, tc.year_to,
                  tc.ordering,
                  co.id AS co_id, co.name AS co_name, co.sort_name AS co_sort_name,
                  co.country AS co_country, co.founded_year AS co_founded_year,
                  co.kind AS co_kind, co.status AS co_status
             FROM catalog.title_companies tc
             JOIN catalog.companies co ON co.id = tc.company_id
            WHERE tc.title_id = $1
            ORDER BY tc.role, tc.ordering, co.sort_name`,
          [titleId],
        );
        return { ok: true, value: result.rows.map(mapTitleCompany) };
      } catch {
        return internalError("Failed to list companies");
      }
    },

    async listCompanyTitlesPaged(companyId, params) {
      const where: string[] = [`tc.company_id = $1`, `t.status = 'published'`];
      const values: unknown[] = [companyId];
      if (params.cursor) {
        values.push(params.cursor.createdAt, params.cursor.id);
        where.push(`(t.created_at, t.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
      }
      values.push(params.limit + 1);
      try {
        const result = await executor.execute(
          `SELECT DISTINCT ${titleColumns("t")}
             FROM catalog.title_companies tc
             JOIN catalog.titles t ON t.id = tc.title_id
            WHERE ${where.join(" AND ")}
            ORDER BY t.created_at DESC, t.id DESC
            LIMIT $${values.length}`,
          values,
        );
        return { ok: true, value: toPage(result.rows.map(mapTitle), params.limit) };
      } catch {
        return internalError("Failed to list company titles");
      }
    },

    async listTitleKeywords(titleId) {
      try {
        const result = await executor.execute(
          `SELECT k.id, k.slug, k.name, k.title_count,
                  tk.relevant_votes, tk.total_votes, tk.ordering
             FROM catalog.title_keywords tk
             JOIN catalog.keywords k ON k.id = tk.keyword_id
            WHERE tk.title_id = $1
            ORDER BY tk.ordering, tk.relevant_votes DESC, k.name`,
          [titleId],
        );
        return { ok: true, value: result.rows.map(mapTitleKeyword) };
      } catch {
        return internalError("Failed to list keywords");
      }
    },

    async getKeywordBySlug(slug) {
      try {
        const result = await executor.execute(
          `SELECT id, slug, name, title_count FROM catalog.keywords WHERE slug = $1`,
          [slug],
        );
        const row = result.rows[0];
        if (!row) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapKeyword(row) };
      } catch {
        return internalError("Failed to load keyword");
      }
    },

    async listKeywordTitlesPaged(keywordId, params) {
      const where: string[] = [`tk.keyword_id = $1`, `t.status = 'published'`];
      const values: unknown[] = [keywordId];
      if (params.cursor) {
        values.push(params.cursor.createdAt, params.cursor.id);
        where.push(`(t.created_at, t.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
      }
      values.push(params.limit + 1);
      try {
        const result = await executor.execute(
          `SELECT ${titleColumns("t")}
             FROM catalog.title_keywords tk
             JOIN catalog.titles t ON t.id = tk.title_id
            WHERE ${where.join(" AND ")}
            ORDER BY t.created_at DESC, t.id DESC
            LIMIT $${values.length}`,
          values,
        );
        return { ok: true, value: toPage(result.rows.map(mapTitle), params.limit) };
      } catch {
        return internalError("Failed to list keyword titles");
      }
    },

    async addTitleKeyword(titleId, slug, name, keywordId) {
      try {
        await executor.execute(
          `INSERT INTO catalog.keywords (id, slug, name) VALUES ($1, $2, $3)
           ON CONFLICT (slug) DO NOTHING`,
          [keywordId, slug, name],
        );
        const inserted = await executor.execute(
          `INSERT INTO catalog.title_keywords (title_id, keyword_id, ordering)
           SELECT $1, k.id, COALESCE((SELECT MAX(ordering) + 1 FROM catalog.title_keywords WHERE title_id = $1), 0)
             FROM catalog.keywords k WHERE k.slug = $2
           ON CONFLICT (title_id, keyword_id) DO NOTHING
           RETURNING keyword_id`,
          [titleId, slug],
        );
        // title_count is denormalized: bump it only when the link is new, so a
        // repeated add is idempotent rather than inflating the count.
        if (inserted.rowCount > 0) {
          await executor.execute(
            `UPDATE catalog.keywords SET title_count = title_count + 1, updated_at = now()
              WHERE slug = $1`,
            [slug],
          );
        }
        const result = await executor.execute(
          `SELECT k.id, k.slug, k.name, k.title_count, tk.relevant_votes, tk.total_votes, tk.ordering
             FROM catalog.title_keywords tk
             JOIN catalog.keywords k ON k.id = tk.keyword_id
            WHERE tk.title_id = $1 AND k.slug = $2`,
          [titleId, slug],
        );
        const row = result.rows[0];
        if (!row) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapTitleKeyword(row) };
      } catch (err) {
        if (isForeignKeyViolation(err)) return { ok: false, error: { kind: "not_found" } };
        return internalError("Failed to add keyword");
      }
    },

    async createImage(input) {
      try {
        const result = await executor.execute(
          `INSERT INTO catalog.images
             (id, url, width, height, kind, caption, credit, language, blurhash, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
           ON CONFLICT (id) DO NOTHING
           RETURNING ${IMAGE_COLUMNS}`,
          [
            input.id,
            input.url,
            input.width,
            input.height,
            input.kind,
            input.caption ?? null,
            input.credit ?? null,
            input.language ?? null,
            input.blurhash ?? null,
            input.createdAt.toISOString(),
          ],
        );
        if (result.rowCount === 0) {
          return { ok: false, error: { kind: "conflict", entity: "image" } };
        }
        return { ok: true, value: mapImage(result.rows[0]!) };
      } catch (err) {
        if (isUniqueViolation(err)) {
          return { ok: false, error: { kind: "conflict", entity: "image" } };
        }
        return internalError("Failed to create image");
      }
    },

    async attachTitleImage(titleId, input) {
      try {
        // One primary per owner is a partial unique index; demote the incumbent
        // in the same round trip so the insert can never trip it.
        if (input.isPrimary) {
          await executor.execute(
            `UPDATE catalog.title_images SET is_primary = FALSE WHERE title_id = $1 AND is_primary`,
            [titleId],
          );
        }
        await executor.execute(
          `INSERT INTO catalog.title_images (title_id, image_id, ordering, is_primary)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (title_id, image_id) DO UPDATE
             SET ordering = EXCLUDED.ordering, is_primary = EXCLUDED.is_primary`,
          [titleId, input.imageId, input.ordering ?? 0, input.isPrimary ?? false],
        );
        return { ok: true, value: undefined };
      } catch (err) {
        if (isForeignKeyViolation(err)) return { ok: false, error: { kind: "not_found" } };
        return internalError("Failed to attach image");
      }
    },

    async attachPersonImage(personId, input) {
      try {
        if (input.isPrimary) {
          await executor.execute(
            `UPDATE catalog.person_images SET is_primary = FALSE WHERE person_id = $1 AND is_primary`,
            [personId],
          );
        }
        await executor.execute(
          `INSERT INTO catalog.person_images (person_id, image_id, ordering, is_primary)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (person_id, image_id) DO UPDATE
             SET ordering = EXCLUDED.ordering, is_primary = EXCLUDED.is_primary`,
          [personId, input.imageId, input.ordering ?? 0, input.isPrimary ?? false],
        );
        return { ok: true, value: undefined };
      } catch (err) {
        if (isForeignKeyViolation(err)) return { ok: false, error: { kind: "not_found" } };
        return internalError("Failed to attach image");
      }
    },

    async listTitleImages(titleId, kind, limit) {
      const where: string[] = [`ti.title_id = $1`];
      const values: unknown[] = [titleId];
      if (kind) {
        values.push(kind);
        where.push(`i.kind = $${values.length}`);
      }
      values.push(limit);
      try {
        const result = await executor.execute(
          `SELECT ${imageColumns("i")},
                  ti.ordering, ti.is_primary
             FROM catalog.title_images ti
             JOIN catalog.images i ON i.id = ti.image_id
            WHERE ${where.join(" AND ")}
            ORDER BY ti.is_primary DESC, ti.ordering, i.id
            LIMIT $${values.length}`,
          values,
        );
        return { ok: true, value: result.rows.map(mapImage) };
      } catch {
        return internalError("Failed to list images");
      }
    },

    async listPersonImages(personId, limit) {
      try {
        const result = await executor.execute(
          `SELECT ${imageColumns("i")},
                  pi.ordering, pi.is_primary
             FROM catalog.person_images pi
             JOIN catalog.images i ON i.id = pi.image_id
            WHERE pi.person_id = $1
            ORDER BY pi.is_primary DESC, pi.ordering, i.id
            LIMIT $2`,
          [personId, limit],
        );
        return { ok: true, value: result.rows.map(mapImage) };
      } catch {
        return internalError("Failed to list images");
      }
    },

    async getPrimaryImages(titleIds) {
      if (titleIds.length === 0) return { ok: true, value: new Map() };
      try {
        // One query for a whole rail of posters — the N+1 this avoids is the
        // difference between a fast grid and a dead one.
        const result = await executor.execute(
          `SELECT ti.title_id,
                  ${imageColumns("i")},
                  ti.ordering, ti.is_primary
             FROM catalog.title_images ti
             JOIN catalog.images i ON i.id = ti.image_id
            WHERE ti.title_id = ANY($1::uuid[]) AND ti.is_primary`,
          [titleIds],
        );
        const map = new Map<string, Image>();
        for (const row of result.rows) {
          map.set(row.title_id as string, mapImage(row));
        }
        return { ok: true, value: map };
      } catch {
        return internalError("Failed to load primary images");
      }
    },

    async getPrimaryPersonImages(personIds) {
      if (personIds.length === 0) return { ok: true, value: new Map() };
      try {
        const result = await executor.execute(
          `SELECT pi.person_id, ${imageColumns("i")}, pi.ordering, pi.is_primary
             FROM catalog.person_images pi
             JOIN catalog.images i ON i.id = pi.image_id
            WHERE pi.person_id = ANY($1::uuid[]) AND pi.is_primary`,
          [personIds],
        );
        const map = new Map<string, Image>();
        for (const row of result.rows) {
          map.set(row.person_id as string, mapImage(row));
        }
        return { ok: true, value: map };
      } catch {
        return internalError("Failed to load headshots");
      }
    },

    async createVideo(input) {
      try {
        const result = await executor.execute(
          `INSERT INTO catalog.videos
             (id, title_id, person_id, kind, name, url, thumbnail_url, runtime_seconds,
              language, published_at, ordering, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
           ON CONFLICT (id) DO NOTHING
           RETURNING ${VIDEO_COLUMNS}`,
          [
            input.id,
            input.titleId ?? null,
            input.personId ?? null,
            input.kind,
            input.name,
            input.url,
            input.thumbnailUrl ?? null,
            input.runtimeSeconds ?? null,
            input.language ?? null,
            input.publishedAt ? input.publishedAt.toISOString() : null,
            input.ordering ?? 0,
            input.createdAt.toISOString(),
          ],
        );
        if (result.rowCount === 0) {
          return { ok: false, error: { kind: "conflict", entity: "video" } };
        }
        return { ok: true, value: mapVideo(result.rows[0]!) };
      } catch (err) {
        if (isUniqueViolation(err)) {
          return { ok: false, error: { kind: "conflict", entity: "video" } };
        }
        if (isForeignKeyViolation(err)) return { ok: false, error: { kind: "not_found" } };
        return internalError("Failed to create video");
      }
    },

    async listTitleVideos(titleId, limit) {
      try {
        const result = await executor.execute(
          `SELECT ${VIDEO_COLUMNS} FROM catalog.videos
            WHERE title_id = $1 ORDER BY ordering, published_at DESC NULLS LAST LIMIT $2`,
          [titleId, limit],
        );
        return { ok: true, value: result.rows.map(mapVideo) };
      } catch {
        return internalError("Failed to list videos");
      }
    },

    async listPersonVideos(personId, limit) {
      try {
        const result = await executor.execute(
          `SELECT ${VIDEO_COLUMNS} FROM catalog.videos
            WHERE person_id = $1 ORDER BY ordering, published_at DESC NULLS LAST LIMIT $2`,
          [personId, limit],
        );
        return { ok: true, value: result.rows.map(mapVideo) };
      } catch {
        return internalError("Failed to list videos");
      }
    },

    async deleteImage(imageId) {
      try {
        const result = await executor.execute(`DELETE FROM catalog.images WHERE id = $1`, [imageId]);
        if (result.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: undefined };
      } catch {
        return internalError("Failed to delete image");
      }
    },

    async deleteVideo(videoId) {
      try {
        const result = await executor.execute(`DELETE FROM catalog.videos WHERE id = $1`, [videoId]);
        if (result.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: undefined };
      } catch {
        return internalError("Failed to delete video");
      }
    },
  };

  return repo;
}
