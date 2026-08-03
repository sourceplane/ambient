import type { SqlExecutor, TransactionalSqlExecutor } from "../hyperdrive/executor.js";
import { inList } from "../hyperdrive/in-list.js";
import { DEMOGRAPHIC_PRIVACY_FLOOR } from "./types.js";
import type {
  AgeBand,
  ChartDefinition,
  ChartEntry,
  ChartKey,
  DemographicCell,
  GenderBand,
  PopularityEntry,
  RatingsRepository,
  RatingsResult,
  TitleAggregate,
  UserRating,
} from "./types.js";
import { roundRating } from "./weighted.js";

type Row = Record<string, unknown>;

const AGGREGATE_COLUMNS = `title_id, vote_count, rating_sum,
  bucket_1, bucket_2, bucket_3, bucket_4, bucket_5,
  bucket_6, bucket_7, bucket_8, bucket_9, bucket_10, updated_at`;

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function internalError(message: string): RatingsResult<never> {
  return { ok: false, error: { kind: "internal", message } };
}

function mapAggregate(row: Row): TitleAggregate {
  const voteCount = num(row.vote_count);
  const ratingSum = num(row.rating_sum);
  return {
    titleId: row.title_id as string,
    voteCount,
    average: voteCount > 0 ? roundRating(ratingSum / voteCount) : null,
    distribution: {
      buckets: Array.from({ length: 10 }, (_, i) => ({
        value: i + 1,
        count: num(row[`bucket_${i + 1}`]),
      })),
    },
    updatedAt: row.updated_at ? new Date(row.updated_at as string) : null,
  };
}

function emptyAggregate(titleId: string): TitleAggregate {
  return {
    titleId,
    voteCount: 0,
    average: null,
    distribution: {
      buckets: Array.from({ length: 10 }, (_, i) => ({ value: i + 1, count: 0 })),
    },
    updatedAt: null,
  };
}

function mapChartEntry(row: Row): ChartEntry {
  return {
    chart: row.chart as ChartKey,
    computedFor: String(row.computed_for).slice(0, 10),
    rank: num(row.rank),
    titleId: row.title_id as string,
    score: num(row.score),
    previousRank: row.previous_rank === null || row.previous_rank === undefined
      ? null
      : num(row.previous_rank),
  };
}

/**
 * Bucket columns are a fixed set of ten; the index is validated before it ever
 * reaches the SQL so the column name can never come from a caller.
 */
function bucketColumn(value: number): string {
  const index = Math.trunc(value);
  if (index < 1 || index > 10) throw new Error("rating out of range");
  return `bucket_${index}`;
}

export function createRatingsRepository(
  executor: SqlExecutor | TransactionalSqlExecutor,
): RatingsRepository {
  const tx = executor as TransactionalSqlExecutor;
  const runInTransaction = typeof tx.transaction === "function";

  async function withTx<T>(fn: (sql: SqlExecutor) => Promise<T>): Promise<T> {
    // The mock executors in tests are not transactional; the statements are
    // identical either way, so degrade rather than refuse to run.
    return runInTransaction ? tx.transaction(fn) : fn(executor);
  }

  async function readAggregate(sql: SqlExecutor, titleId: string): Promise<TitleAggregate> {
    const result = await sql.execute(
      `SELECT ${AGGREGATE_COLUMNS} FROM ratings.title_aggregates WHERE title_id = $1`,
      [titleId],
    );
    const row = result.rows[0];
    return row ? mapAggregate(row) : emptyAggregate(titleId);
  }

  return {
    async rateTitle(input) {
      let column: string;
      try {
        column = bucketColumn(input.value);
      } catch {
        return internalError("Rating out of range");
      }
      const ageBand: AgeBand = input.ageBand ?? "undisclosed";
      const genderBand: GenderBand = input.genderBand ?? "undisclosed";

      try {
        return await withTx(async (sql) => {
          // Read the prior vote first: changing 8 → 5 must decrement one
          // bucket and increment another, not just add a vote.
          const prior = await sql.execute(
            `SELECT value, age_band, gender_band FROM ratings.user_ratings
              WHERE user_id = $1 AND title_id = $2
              FOR UPDATE`,
            [input.userId, input.titleId],
          );
          const previous = prior.rows[0];

          await sql.execute(
            `INSERT INTO ratings.user_ratings
               (user_id, title_id, value, age_band, gender_band, rated_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$6)
             ON CONFLICT (user_id, title_id) DO UPDATE
               SET value = EXCLUDED.value,
                   age_band = EXCLUDED.age_band,
                   gender_band = EXCLUDED.gender_band,
                   updated_at = EXCLUDED.updated_at`,
            [
              input.userId,
              input.titleId,
              input.value,
              ageBand,
              genderBand,
              input.now.toISOString(),
            ],
          );

          if (previous) {
            const previousColumn = bucketColumn(num(previous.value));
            await sql.execute(
              `UPDATE ratings.title_aggregates
                  SET rating_sum = rating_sum - $2 + $3,
                      ${previousColumn} = GREATEST(${previousColumn} - 1, 0),
                      ${column} = ${column} + 1,
                      updated_at = $4
                WHERE title_id = $1`,
              [input.titleId, num(previous.value), input.value, input.now.toISOString()],
            );
            await adjustDemographic(
              sql,
              input.titleId,
              previous.age_band as string,
              previous.gender_band as string,
              -1,
              -num(previous.value),
              input.now,
            );
          } else {
            await sql.execute(
              `INSERT INTO ratings.title_aggregates
                 (title_id, vote_count, rating_sum, ${column}, updated_at)
               VALUES ($1, 1, $2, 1, $3)
               ON CONFLICT (title_id) DO UPDATE
                 SET vote_count = ratings.title_aggregates.vote_count + 1,
                     rating_sum = ratings.title_aggregates.rating_sum + $2,
                     ${column}  = ratings.title_aggregates.${column} + 1,
                     updated_at = $3`,
              [input.titleId, input.value, input.now.toISOString()],
            );
          }

          await adjustDemographic(
            sql,
            input.titleId,
            ageBand,
            genderBand,
            1,
            input.value,
            input.now,
          );

          return { ok: true as const, value: await readAggregate(sql, input.titleId) };
        });
      } catch {
        return internalError("Failed to record rating");
      }
    },

    async removeRating(userId, titleId, now) {
      try {
        return await withTx(async (sql) => {
          const prior = await sql.execute(
            `DELETE FROM ratings.user_ratings
              WHERE user_id = $1 AND title_id = $2
              RETURNING value, age_band, gender_band`,
            [userId, titleId],
          );
          const previous = prior.rows[0];
          if (!previous) {
            return { ok: true as const, value: await readAggregate(sql, titleId) };
          }

          const column = bucketColumn(num(previous.value));
          await sql.execute(
            `UPDATE ratings.title_aggregates
                SET vote_count = GREATEST(vote_count - 1, 0),
                    rating_sum = GREATEST(rating_sum - $2, 0),
                    ${column} = GREATEST(${column} - 1, 0),
                    updated_at = $3
              WHERE title_id = $1`,
            [titleId, num(previous.value), now.toISOString()],
          );
          await adjustDemographic(
            sql,
            titleId,
            previous.age_band as string,
            previous.gender_band as string,
            -1,
            -num(previous.value),
            now,
          );

          return { ok: true as const, value: await readAggregate(sql, titleId) };
        });
      } catch {
        return internalError("Failed to remove rating");
      }
    },

    async getUserRating(userId, titleId) {
      try {
        const result = await executor.execute(
          `SELECT user_id, title_id, value, age_band, gender_band, rated_at, updated_at
             FROM ratings.user_ratings WHERE user_id = $1 AND title_id = $2`,
          [userId, titleId],
        );
        const row = result.rows[0];
        if (!row) return { ok: false, error: { kind: "not_found" } };
        return {
          ok: true,
          value: {
            userId: row.user_id as string,
            titleId: row.title_id as string,
            value: num(row.value),
            ageBand: row.age_band as UserRating["ageBand"],
            genderBand: row.gender_band as UserRating["genderBand"],
            ratedAt: new Date(row.rated_at as string),
            updatedAt: new Date(row.updated_at as string),
          },
        };
      } catch {
        return internalError("Failed to load rating");
      }
    },

    async listUserRatings(userId, params) {
      try {
        const result = await executor.execute(
          `SELECT title_id, value, rated_at FROM ratings.user_ratings
            WHERE user_id = $1
            ORDER BY rated_at DESC, title_id
            LIMIT $2 OFFSET $3`,
          [userId, params.limit, params.offset],
        );
        return {
          ok: true,
          value: result.rows.map((row) => ({
            titleId: row.title_id as string,
            value: num(row.value),
            ratedAt: new Date(row.rated_at as string),
          })),
        };
      } catch {
        return internalError("Failed to list ratings");
      }
    },

    async getUserRatingsFor(userId, titleIds) {
      if (titleIds.length === 0) return { ok: true, value: new Map() };
      const values: unknown[] = [userId];
      try {
        // One query for a whole grid's "your rating" column.
        const result = await executor.execute(
          `SELECT title_id, value FROM ratings.user_ratings
            WHERE user_id = $1 AND title_id IN (${inList(titleIds, values, "uuid")})`,
          values,
        );
        const map = new Map<string, number>();
        for (const row of result.rows) map.set(row.title_id as string, num(row.value));
        return { ok: true, value: map };
      } catch {
        return internalError("Failed to load ratings");
      }
    },

    async getAggregate(titleId) {
      try {
        return { ok: true, value: await readAggregate(executor, titleId) };
      } catch {
        return internalError("Failed to load rating");
      }
    },

    async getAggregates(titleIds) {
      if (titleIds.length === 0) return { ok: true, value: new Map() };
      const values: unknown[] = [];
      try {
        const result = await executor.execute(
          `SELECT ${AGGREGATE_COLUMNS} FROM ratings.title_aggregates
            WHERE title_id IN (${inList(titleIds, values, "uuid")})`,
          values,
        );
        const map = new Map<string, TitleAggregate>();
        for (const row of result.rows) {
          const aggregate = mapAggregate(row);
          map.set(aggregate.titleId, aggregate);
        }
        return { ok: true, value: map };
      } catch {
        return internalError("Failed to load ratings");
      }
    },

    async getDemographics(titleId) {
      try {
        const result = await executor.execute(
          `SELECT age_band, gender_band, vote_count, rating_sum
             FROM ratings.title_demographics
            WHERE title_id = $1 AND vote_count >= $2
            ORDER BY age_band, gender_band`,
          [titleId, DEMOGRAPHIC_PRIVACY_FLOOR],
        );
        const cells: DemographicCell[] = result.rows.map((row) => ({
          ageBand: row.age_band as DemographicCell["ageBand"],
          genderBand: row.gender_band as DemographicCell["genderBand"],
          voteCount: num(row.vote_count),
          average: roundRating(num(row.rating_sum) / Math.max(num(row.vote_count), 1)),
        }));
        return { ok: true, value: cells };
      } catch {
        return internalError("Failed to load demographics");
      }
    },

    async listChart(chart, limit) {
      try {
        // Only the newest snapshot: a chart read must never blend two days.
        const result = await executor.execute(
          `SELECT chart, computed_for, rank, title_id, score, previous_rank
             FROM ratings.chart_entries
            WHERE chart = $1
              AND computed_for = (SELECT MAX(computed_for) FROM ratings.chart_entries WHERE chart = $1)
            ORDER BY rank
            LIMIT $2`,
          [chart, limit],
        );
        return { ok: true, value: result.rows.map(mapChartEntry) };
      } catch {
        return internalError("Failed to load chart");
      }
    },

    async getChartDefinition(chart) {
      try {
        const result = await executor.execute(
          `SELECT chart, minimum_votes, prior_mean, size, description
             FROM ratings.chart_definitions WHERE chart = $1`,
          [chart],
        );
        const row = result.rows[0];
        if (!row) return { ok: false, error: { kind: "not_found" } };
        return {
          ok: true,
          value: {
            chart: row.chart as ChartKey,
            minimumVotes: num(row.minimum_votes),
            priorMean: num(row.prior_mean),
            size: num(row.size),
            description: (row.description as string) ?? "",
          } satisfies ChartDefinition,
        };
      } catch {
        return internalError("Failed to load chart definition");
      }
    },

    async replaceChart(chart, computedFor, entries) {
      try {
        return await withTx(async (sql) => {
          // Carry the previous snapshot's ranks in so the delta arrow needs no
          // second query at read time.
          const priorRows = await sql.execute(
            `SELECT title_id, rank FROM ratings.chart_entries
              WHERE chart = $1
                AND computed_for = (SELECT MAX(computed_for) FROM ratings.chart_entries
                                     WHERE chart = $1 AND computed_for < $2)`,
            [chart, computedFor],
          );
          const previousRanks = new Map<string, number>();
          for (const row of priorRows.rows) {
            previousRanks.set(row.title_id as string, num(row.rank));
          }

          await sql.execute(
            `DELETE FROM ratings.chart_entries WHERE chart = $1 AND computed_for = $2`,
            [chart, computedFor],
          );

          let rank = 0;
          for (const entry of entries) {
            rank += 1;
            await sql.execute(
              `INSERT INTO ratings.chart_entries
                 (chart, computed_for, rank, title_id, score, previous_rank)
               VALUES ($1,$2,$3,$4,$5,$6)`,
              [
                chart,
                computedFor,
                rank,
                entry.titleId,
                entry.score,
                previousRanks.get(entry.titleId) ?? null,
              ],
            );
          }
          return { ok: true as const, value: rank };
        });
      } catch {
        return internalError("Failed to write chart");
      }
    },

    async listChartCandidates(minimumVotes, limit) {
      try {
        const result = await executor.execute(
          `SELECT title_id, vote_count, rating_sum
             FROM ratings.title_aggregates
            WHERE vote_count >= $1
            ORDER BY vote_count DESC
            LIMIT $2`,
          [minimumVotes, limit],
        );
        return {
          ok: true,
          value: result.rows.map((row) => ({
            titleId: row.title_id as string,
            voteCount: num(row.vote_count),
            average: num(row.rating_sum) / Math.max(num(row.vote_count), 1),
          })),
        };
      } catch {
        return internalError("Failed to load chart candidates");
      }
    },

    async getPopularity(entityType, entityId) {
      try {
        const result = await executor.execute(
          `SELECT entity_type, entity_id, computed_for, rank, previous_rank, score
             FROM ratings.popularity
            WHERE entity_type = $1 AND entity_id = $2
            ORDER BY computed_for DESC
            LIMIT 1`,
          [entityType, entityId],
        );
        const row = result.rows[0];
        if (!row) return { ok: false, error: { kind: "not_found" } };
        return {
          ok: true,
          value: {
            entityType: row.entity_type as PopularityEntry["entityType"],
            entityId: row.entity_id as string,
            computedFor: String(row.computed_for).slice(0, 10),
            rank: num(row.rank),
            previousRank:
              row.previous_rank === null || row.previous_rank === undefined
                ? null
                : num(row.previous_rank),
            score: num(row.score),
          },
        };
      } catch {
        return internalError("Failed to load popularity");
      }
    },

    async replacePopularity(entityType, computedFor, entries) {
      try {
        return await withTx(async (sql) => {
          const priorRows = await sql.execute(
            `SELECT entity_id, rank FROM ratings.popularity
              WHERE entity_type = $1
                AND computed_for = (SELECT MAX(computed_for) FROM ratings.popularity
                                     WHERE entity_type = $1 AND computed_for < $2)`,
            [entityType, computedFor],
          );
          const previousRanks = new Map<string, number>();
          for (const row of priorRows.rows) {
            previousRanks.set(row.entity_id as string, num(row.rank));
          }

          await sql.execute(
            `DELETE FROM ratings.popularity WHERE entity_type = $1 AND computed_for = $2`,
            [entityType, computedFor],
          );

          let rank = 0;
          for (const entry of entries) {
            rank += 1;
            await sql.execute(
              `INSERT INTO ratings.popularity
                 (entity_type, entity_id, computed_for, rank, previous_rank, score)
               VALUES ($1,$2,$3,$4,$5,$6)`,
              [
                entityType,
                entry.entityId,
                computedFor,
                rank,
                previousRanks.get(entry.entityId) ?? null,
                entry.score,
              ],
            );
          }
          return { ok: true as const, value: rank };
        });
      } catch {
        return internalError("Failed to write popularity");
      }
    },
  };
}

/**
 * Demographic cells are counts only. A removal passes negative deltas rather
 * than a separate statement, and the row is floored at zero so a double
 * decrement can never produce a negative count.
 */
async function adjustDemographic(
  sql: SqlExecutor,
  titleId: string,
  ageBand: string,
  genderBand: string,
  voteDelta: number,
  sumDelta: number,
  now: Date,
): Promise<void> {
  await sql.execute(
    `INSERT INTO ratings.title_demographics
       (title_id, age_band, gender_band, vote_count, rating_sum, updated_at)
     VALUES ($1,$2,$3,GREATEST($4,0),GREATEST($5,0),$6)
     ON CONFLICT (title_id, age_band, gender_band) DO UPDATE
       SET vote_count = GREATEST(ratings.title_demographics.vote_count + $4, 0),
           rating_sum = GREATEST(ratings.title_demographics.rating_sum + $5, 0),
           updated_at = $6`,
    [titleId, ageBand, genderBand, voteDelta, sumDelta, now.toISOString()],
  );
}
