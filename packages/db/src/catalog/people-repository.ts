import type { SqlExecutor } from "../hyperdrive/executor.js";
import type { Uuid } from "../ids/index.js";
import {
  internalError,
  isForeignKeyViolation,
  isUniqueViolation,
  mapCredit,
  mapEpisode,
  mapKnownFor,
  mapPerson,
  mapSeason,
  mapTitle,
  toPage,
} from "./mappers.js";
import { titleColumns } from "./titles-repository.js";
import type {
  CatalogResult,
  CreateCreditInput,
  CreatePersonInput,
  Credit,
  CreditListFilters,
  Episode,
  KnownForEntry,
  PagedResult,
  PageQueryParams,
  Person,
  PersonCredit,
  Season,
  TitleCredit,
  UpdatePersonInput,
  UpsertEpisodeInput,
} from "./types.js";

const PERSON_FIELDS = [
  "id",
  "name",
  "sort_name",
  "birth_date",
  "birth_place",
  "death_date",
  "death_place",
  "death_cause",
  "height_cm",
  "mini_bio",
  "bio_author",
  "status",
  "created_at",
  "updated_at",
  "archived_at",
] as const;

const PERSON_COLUMNS = PERSON_FIELDS.join(", ");

function personColumns(alias: string, resultPrefix = ""): string {
  return PERSON_FIELDS.map((f) =>
    resultPrefix ? `${alias}.${f} AS ${resultPrefix}${f}` : `${alias}.${f}`,
  ).join(", ");
}

const PERSON_UPDATE_COLUMNS: Record<keyof UpdatePersonInput, string> = {
  name: "name",
  sortName: "sort_name",
  birthDate: "birth_date",
  birthPlace: "birth_place",
  deathDate: "death_date",
  deathPlace: "death_place",
  deathCause: "death_cause",
  heightCm: "height_cm",
  miniBio: "mini_bio",
  bioAuthor: "bio_author",
  status: "status",
};

// Characters are aggregated in the same round trip as the credit — a cast list
// of 60 people would otherwise be 61 queries.
const CREDIT_COLUMNS = `c.id, c.title_id, c.person_id, c.category, c.department, c.job,
  c.billing_order, c.episode_count, c.is_uncredited, c.is_voice, c.is_archive_footage,
  c.is_self, c.note,
  COALESCE((SELECT array_agg(cc.character_name ORDER BY cc.ordering)
              FROM catalog.credit_characters cc WHERE cc.credit_id = c.id), '{}') AS characters`;

export interface PeopleRepositoryPart {
  createPerson(input: CreatePersonInput): Promise<CatalogResult<Person>>;
  getPersonById(personId: Uuid): Promise<CatalogResult<Person>>;
  updatePerson(personId: Uuid, input: UpdatePersonInput, updatedAt: Date): Promise<CatalogResult<Person>>;
  archivePerson(personId: Uuid, archivedAt: Date): Promise<CatalogResult<Person>>;
  listPeoplePaged(params: PageQueryParams): Promise<CatalogResult<PagedResult<Person>>>;
  listProfessions(personId: Uuid): Promise<CatalogResult<string[]>>;
  listKnownFor(personId: Uuid, limit: number): Promise<CatalogResult<KnownForEntry[]>>;
  createCredit(input: CreateCreditInput): Promise<CatalogResult<Credit>>;
  deleteCredit(creditId: Uuid): Promise<CatalogResult<void>>;
  listTitleCredits(titleId: Uuid, filters: CreditListFilters): Promise<CatalogResult<TitleCredit[]>>;
  listPersonCredits(personId: Uuid, filters: CreditListFilters): Promise<CatalogResult<PersonCredit[]>>;
  listSeasons(seriesTitleId: Uuid): Promise<CatalogResult<Season[]>>;
  listEpisodes(
    seriesTitleId: Uuid,
    seasonNumber: number | null,
    params: { limit: number; offset?: number },
  ): Promise<CatalogResult<Episode[]>>;
  getEpisode(episodeTitleId: Uuid): Promise<CatalogResult<Episode>>;
  upsertEpisode(input: UpsertEpisodeInput): Promise<CatalogResult<Episode>>;
}

export function createPeopleRepository(executor: SqlExecutor): PeopleRepositoryPart {
  const repo: PeopleRepositoryPart = {
    async createPerson(input) {
      try {
        const result = await executor.execute(
          `INSERT INTO catalog.people
             (id, name, sort_name, birth_date, birth_place, death_date, death_place,
              death_cause, height_cm, mini_bio, bio_author, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
           ON CONFLICT (id) DO NOTHING
           RETURNING ${PERSON_COLUMNS}`,
          [
            input.id,
            input.name,
            input.sortName,
            input.birthDate ?? null,
            input.birthPlace ?? null,
            input.deathDate ?? null,
            input.deathPlace ?? null,
            input.deathCause ?? null,
            input.heightCm ?? null,
            input.miniBio ?? null,
            input.bioAuthor ?? null,
            input.status ?? "published",
            input.createdAt.toISOString(),
          ],
        );
        if (result.rowCount === 0) {
          return { ok: false, error: { kind: "conflict", entity: "person" } };
        }
        for (const [i, profession] of (input.professions ?? []).entries()) {
          await executor.execute(
            `INSERT INTO catalog.person_professions (person_id, profession, ordering)
             VALUES ($1, $2, $3) ON CONFLICT (person_id, profession) DO UPDATE SET ordering = EXCLUDED.ordering`,
            [input.id, profession, i],
          );
        }
        return { ok: true, value: mapPerson(result.rows[0]!) };
      } catch (err) {
        if (isUniqueViolation(err)) {
          return { ok: false, error: { kind: "conflict", entity: "person" } };
        }
        return internalError("Failed to create person");
      }
    },

    async getPersonById(personId) {
      try {
        const result = await executor.execute(
          `SELECT ${PERSON_COLUMNS} FROM catalog.people WHERE id = $1`,
          [personId],
        );
        const row = result.rows[0];
        if (!row) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapPerson(row) };
      } catch {
        return internalError("Failed to load person");
      }
    },

    async updatePerson(personId, input, updatedAt) {
      const sets: string[] = [];
      const params: unknown[] = [personId];
      for (const [field, column] of Object.entries(PERSON_UPDATE_COLUMNS)) {
        const value = input[field as keyof UpdatePersonInput];
        if (value === undefined) continue;
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      }
      if (sets.length === 0) return repo.getPersonById(personId);
      params.push(updatedAt.toISOString());
      sets.push(`updated_at = $${params.length}`);

      try {
        const result = await executor.execute(
          `UPDATE catalog.people SET ${sets.join(", ")} WHERE id = $1 RETURNING ${PERSON_COLUMNS}`,
          params,
        );
        const row = result.rows[0];
        if (!row) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapPerson(row) };
      } catch {
        return internalError("Failed to update person");
      }
    },

    async archivePerson(personId, archivedAt) {
      try {
        const result = await executor.execute(
          `UPDATE catalog.people
              SET status = 'archived', archived_at = $2, updated_at = $2
            WHERE id = $1 AND status <> 'archived'
            RETURNING ${PERSON_COLUMNS}`,
          [personId, archivedAt.toISOString()],
        );
        const row = result.rows[0];
        if (!row) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapPerson(row) };
      } catch {
        return internalError("Failed to archive person");
      }
    },

    async listPeoplePaged(params) {
      const where: string[] = [`status = 'published'`];
      const values: unknown[] = [];
      if (params.cursor) {
        values.push(params.cursor.createdAt, params.cursor.id);
        where.push(`(created_at, id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
      }
      values.push(params.limit + 1);
      try {
        const result = await executor.execute(
          `SELECT ${PERSON_COLUMNS} FROM catalog.people
            WHERE ${where.join(" AND ")}
            ORDER BY created_at DESC, id DESC
            LIMIT $${values.length}`,
          values,
        );
        return { ok: true, value: toPage(result.rows.map(mapPerson), params.limit) };
      } catch {
        return internalError("Failed to list people");
      }
    },

    async listProfessions(personId) {
      try {
        const result = await executor.execute(
          `SELECT profession FROM catalog.person_professions
            WHERE person_id = $1 ORDER BY ordering, profession`,
          [personId],
        );
        return { ok: true, value: result.rows.map((r) => r.profession as string) };
      } catch {
        return internalError("Failed to list professions");
      }
    },

    async listKnownFor(personId, limit) {
      try {
        const result = await executor.execute(
          `SELECT kf.person_id, kf.title_id, kf.ordering, kf.score, ${titleColumns("t", "t_")}
             FROM catalog.person_known_for kf
             JOIN catalog.titles t ON t.id = kf.title_id
            WHERE kf.person_id = $1 AND t.status = 'published'
            ORDER BY kf.ordering
            LIMIT $2`,
          [personId, limit],
        );
        return { ok: true, value: result.rows.map(mapKnownFor) };
      } catch {
        return internalError("Failed to list known-for titles");
      }
    },

    async createCredit(input) {
      try {
        const result = await executor.execute(
          `INSERT INTO catalog.credits
             (id, title_id, person_id, category, department, job, billing_order, episode_count,
              is_uncredited, is_voice, is_archive_footage, is_self, note, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
           ON CONFLICT (title_id, person_id, department, job, COALESCE(billing_order, -1)) DO NOTHING
           RETURNING id, title_id, person_id, category, department, job, billing_order,
                     episode_count, is_uncredited, is_voice, is_archive_footage, is_self, note`,
          [
            input.id,
            input.titleId,
            input.personId,
            input.category,
            input.department,
            input.job,
            input.billingOrder ?? null,
            input.episodeCount ?? null,
            input.isUncredited ?? false,
            input.isVoice ?? false,
            input.isArchiveFootage ?? false,
            input.isSelf ?? false,
            input.note ?? null,
            input.createdAt.toISOString(),
          ],
        );
        if (result.rowCount === 0) {
          return { ok: false, error: { kind: "conflict", entity: "credit" } };
        }
        for (const [i, character] of (input.characters ?? []).entries()) {
          await executor.execute(
            `INSERT INTO catalog.credit_characters (id, credit_id, character_name, ordering)
             VALUES (gen_random_uuid(), $1, $2, $3)
             ON CONFLICT (credit_id, ordering) DO UPDATE SET character_name = EXCLUDED.character_name`,
            [input.id, character, i],
          );
        }
        return {
          ok: true,
          value: mapCredit({ ...result.rows[0]!, characters: input.characters ?? [] }),
        };
      } catch (err) {
        if (isUniqueViolation(err)) {
          return { ok: false, error: { kind: "conflict", entity: "credit" } };
        }
        if (isForeignKeyViolation(err)) {
          return { ok: false, error: { kind: "not_found" } };
        }
        return internalError("Failed to create credit");
      }
    },

    async deleteCredit(creditId) {
      try {
        const result = await executor.execute(`DELETE FROM catalog.credits WHERE id = $1`, [creditId]);
        if (result.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: undefined };
      } catch {
        return internalError("Failed to delete credit");
      }
    },

    async listTitleCredits(titleId, filters) {
      const where: string[] = [`c.title_id = $1`, `p.status = 'published'`];
      const values: unknown[] = [titleId];
      if (filters.category) {
        values.push(filters.category);
        where.push(`c.category = $${values.length}`);
      }
      if (filters.department) {
        values.push(filters.department);
        where.push(`c.department = $${values.length}`);
      }
      values.push(filters.limit, filters.offset ?? 0);
      try {
        const result = await executor.execute(
          `SELECT ${CREDIT_COLUMNS}, ${personColumns("p", "p_")}
             FROM catalog.credits c
             JOIN catalog.people p ON p.id = c.person_id
            WHERE ${where.join(" AND ")}
            ORDER BY c.category, c.billing_order NULLS LAST, c.department, c.job, p.sort_name
            LIMIT $${values.length - 1} OFFSET $${values.length}`,
          values,
        );
        return {
          ok: true,
          value: result.rows.map((row) => ({
            ...mapCredit(row),
            person: mapPerson(stripPrefix(row, "p_")),
          })),
        };
      } catch {
        return internalError("Failed to list title credits");
      }
    },

    async listPersonCredits(personId, filters) {
      const where: string[] = [`c.person_id = $1`, `t.status = 'published'`];
      const values: unknown[] = [personId];
      if (filters.category) {
        values.push(filters.category);
        where.push(`c.category = $${values.length}`);
      }
      if (filters.department) {
        values.push(filters.department);
        where.push(`c.department = $${values.length}`);
      }
      values.push(filters.limit, filters.offset ?? 0);
      try {
        const result = await executor.execute(
          `SELECT ${CREDIT_COLUMNS}, ${titleColumns("t", "t_")}
             FROM catalog.credits c
             JOIN catalog.titles t ON t.id = c.title_id
            WHERE ${where.join(" AND ")}
            ORDER BY t.start_year DESC NULLS FIRST, t.sort_title
            LIMIT $${values.length - 1} OFFSET $${values.length}`,
          values,
        );
        return {
          ok: true,
          value: result.rows.map((row) => ({
            ...mapCredit(row),
            title: mapTitle(stripPrefix(row, "t_")),
          })),
        };
      } catch {
        return internalError("Failed to list person credits");
      }
    },

    async listSeasons(seriesTitleId) {
      try {
        const result = await executor.execute(
          `SELECT s.id, s.series_title_id, s.season_number, s.name, s.overview, s.air_date,
                  COALESCE(e.episode_count, 0) AS episode_count
             FROM catalog.seasons s
             LEFT JOIN (
               SELECT series_title_id, season_number, COUNT(*) AS episode_count
                 FROM catalog.episodes GROUP BY series_title_id, season_number
             ) e ON e.series_title_id = s.series_title_id AND e.season_number = s.season_number
            WHERE s.series_title_id = $1
            ORDER BY s.season_number`,
          [seriesTitleId],
        );
        return { ok: true, value: result.rows.map(mapSeason) };
      } catch {
        return internalError("Failed to list seasons");
      }
    },

    async listEpisodes(seriesTitleId, seasonNumber, params) {
      const where: string[] = [`e.series_title_id = $1`, `t.status = 'published'`];
      const values: unknown[] = [seriesTitleId];
      if (seasonNumber !== null) {
        values.push(seasonNumber);
        where.push(`e.season_number = $${values.length}`);
      }
      values.push(params.limit, params.offset ?? 0);
      try {
        const result = await executor.execute(
          `SELECT e.episode_title_id, e.series_title_id, e.season_number, e.episode_number,
                  e.aired_on, ${titleColumns("t", "t_")}
             FROM catalog.episodes e
             JOIN catalog.titles t ON t.id = e.episode_title_id
            WHERE ${where.join(" AND ")}
            ORDER BY e.season_number, e.episode_number
            LIMIT $${values.length - 1} OFFSET $${values.length}`,
          values,
        );
        return { ok: true, value: result.rows.map(mapEpisode) };
      } catch {
        return internalError("Failed to list episodes");
      }
    },

    async getEpisode(episodeTitleId) {
      try {
        const result = await executor.execute(
          `SELECT e.episode_title_id, e.series_title_id, e.season_number, e.episode_number,
                  e.aired_on, ${titleColumns("t", "t_")}
             FROM catalog.episodes e
             JOIN catalog.titles t ON t.id = e.episode_title_id
            WHERE e.episode_title_id = $1`,
          [episodeTitleId],
        );
        const row = result.rows[0];
        if (!row) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapEpisode(row) };
      } catch {
        return internalError("Failed to load episode");
      }
    },

    async upsertEpisode(input) {
      try {
        await executor.execute(
          `INSERT INTO catalog.episodes
             (episode_title_id, series_title_id, season_number, episode_number, aired_on)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (episode_title_id) DO UPDATE
             SET series_title_id = EXCLUDED.series_title_id,
                 season_number   = EXCLUDED.season_number,
                 episode_number  = EXCLUDED.episode_number,
                 aired_on        = EXCLUDED.aired_on,
                 updated_at      = now()`,
          [
            input.episodeTitleId,
            input.seriesTitleId,
            input.seasonNumber,
            input.episodeNumber,
            input.airedOn ?? null,
          ],
        );
        return repo.getEpisode(input.episodeTitleId);
      } catch (err) {
        if (isUniqueViolation(err)) {
          return { ok: false, error: { kind: "conflict", entity: "episode" } };
        }
        if (isForeignKeyViolation(err)) {
          return { ok: false, error: { kind: "not_found" } };
        }
        return internalError("Failed to upsert episode");
      }
    },
  };

  return repo;
}

function stripPrefix(row: Record<string, unknown>, prefix: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith(prefix)) out[key.slice(prefix.length)] = value;
  }
  return out;
}
