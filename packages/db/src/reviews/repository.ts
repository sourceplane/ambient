import type { SqlExecutor, TransactionalSqlExecutor } from "../hyperdrive/executor.js";
import type {
  CriticReview,
  Metascore,
  ReviewSort,
  ReviewState,
  ReviewsRepository,
  ReviewsResult,
  UpdateReviewInput,
  UserReview,
} from "./types.js";

type Row = Record<string, unknown>;

const REVIEW_COLUMNS = `id, title_id, user_id, headline, body, rating, has_spoilers, state,
  helpful_count, unhelpful_count, submitted_at, updated_at, moderated_at, decision_note`;

const CRITIC_COLUMNS = `id, title_id, publication, author, url, quote, score, published_on`;

/**
 * Metacritic-style bands. The counts they produce are what the coloured pill
 * renders, so the thresholds live in one place rather than in the UI.
 */
export const METASCORE_POSITIVE_MIN = 61;
export const METASCORE_MIXED_MIN = 40;

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function nnum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function internalError(message: string): ReviewsResult<never> {
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

function mapReview(row: Row): UserReview {
  return {
    id: row.id as string,
    titleId: row.title_id as string,
    userId: row.user_id as string,
    headline: row.headline as string,
    body: row.body as string,
    rating: nnum(row.rating),
    hasSpoilers: row.has_spoilers === true || row.has_spoilers === "t",
    state: row.state as ReviewState,
    helpfulCount: num(row.helpful_count),
    unhelpfulCount: num(row.unhelpful_count),
    submittedAt: new Date(row.submitted_at as string),
    updatedAt: new Date(row.updated_at as string),
    moderatedAt: row.moderated_at ? new Date(row.moderated_at as string) : null,
    decisionNote: (row.decision_note as string) ?? null,
  };
}

function mapCritic(row: Row): CriticReview {
  return {
    id: row.id as string,
    titleId: row.title_id as string,
    publication: row.publication as string,
    author: (row.author as string) ?? null,
    url: (row.url as string) ?? null,
    quote: row.quote as string,
    score: nnum(row.score),
    publishedOn: row.published_on ? String(row.published_on).slice(0, 10) : null,
  };
}

/** Sort keys map to fixed SQL — never interpolated caller text. */
function orderBy(sort: ReviewSort): string {
  switch (sort) {
    case "date":
      return "submitted_at DESC, id";
    case "rating":
      return "rating DESC NULLS LAST, submitted_at DESC";
    case "helpfulness":
    default:
      return "helpful_count DESC, submitted_at DESC, id";
  }
}

export function createReviewsRepository(
  executor: SqlExecutor | TransactionalSqlExecutor,
): ReviewsRepository {
  const tx = executor as TransactionalSqlExecutor;
  const canTransact = typeof tx.transaction === "function";

  async function withTx<T>(fn: (sql: SqlExecutor) => Promise<T>): Promise<T> {
    return canTransact ? tx.transaction(fn) : fn(executor);
  }

  async function readReview(sql: SqlExecutor, reviewId: string): Promise<UserReview | null> {
    const result = await sql.execute(
      `SELECT ${REVIEW_COLUMNS} FROM reviews.user_reviews WHERE id = $1`,
      [reviewId],
    );
    const row = result.rows[0];
    return row ? mapReview(row) : null;
  }

  return {
    async createReview(input) {
      try {
        const result = await executor.execute(
          `INSERT INTO reviews.user_reviews
             (id, title_id, user_id, headline, body, rating, has_spoilers, state,
              submitted_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
           RETURNING ${REVIEW_COLUMNS}`,
          [
            input.id,
            input.titleId,
            input.userId,
            input.headline,
            input.body,
            input.rating ?? null,
            input.hasSpoilers ?? false,
            input.state ?? "published",
            input.now.toISOString(),
          ],
        );
        const row = result.rows[0];
        if (!row) return { ok: false, error: { kind: "conflict", entity: "review" } };
        return { ok: true, value: mapReview(row) };
      } catch (err) {
        if (isUniqueViolation(err)) {
          return { ok: false, error: { kind: "conflict", entity: "review" } };
        }
        return internalError("Failed to create review");
      }
    },

    async updateReview(reviewId, userId, input: UpdateReviewInput, now) {
      const sets: string[] = [];
      const params: unknown[] = [reviewId, userId];
      const columns: Record<keyof UpdateReviewInput, string> = {
        headline: "headline",
        body: "body",
        rating: "rating",
        hasSpoilers: "has_spoilers",
      };
      for (const [field, column] of Object.entries(columns)) {
        const value = input[field as keyof UpdateReviewInput];
        if (value === undefined) continue;
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      }
      if (sets.length === 0) {
        const current = await this.getReview(reviewId);
        return current;
      }
      params.push(now.toISOString());
      sets.push(`updated_at = $${params.length}`);

      try {
        // Scoped by user_id: editing someone else's review reads as
        // "not found", never as a permission error that confirms it exists.
        const result = await executor.execute(
          `UPDATE reviews.user_reviews SET ${sets.join(", ")}
            WHERE id = $1 AND user_id = $2 AND state <> 'deleted'
            RETURNING ${REVIEW_COLUMNS}`,
          params,
        );
        const row = result.rows[0];
        if (!row) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapReview(row) };
      } catch {
        return internalError("Failed to update review");
      }
    },

    async deleteReview(reviewId, userId, now) {
      try {
        // Soft delete: the row survives (votes reference it), and the partial
        // unique index frees the slot so the author can write a new one.
        const result = await executor.execute(
          `UPDATE reviews.user_reviews
              SET state = 'deleted', updated_at = $3
            WHERE id = $1 AND user_id = $2 AND state <> 'deleted'`,
          [reviewId, userId, now.toISOString()],
        );
        if (result.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: undefined };
      } catch {
        return internalError("Failed to delete review");
      }
    },

    async getReview(reviewId) {
      try {
        const review = await readReview(executor, reviewId);
        if (!review || review.state === "deleted") {
          return { ok: false, error: { kind: "not_found" } };
        }
        return { ok: true, value: review };
      } catch {
        return internalError("Failed to load review");
      }
    },

    async listTitleReviews(titleId, query) {
      const where: string[] = [`title_id = $1`, `state = 'published'`];
      const params: unknown[] = [titleId];
      if (!query.includeSpoilers) where.push(`has_spoilers = FALSE`);
      params.push(query.limit, query.offset);

      try {
        const result = await executor.execute(
          `SELECT ${REVIEW_COLUMNS} FROM reviews.user_reviews
            WHERE ${where.join(" AND ")}
            ORDER BY ${orderBy(query.sort)}
            LIMIT $${params.length - 1} OFFSET $${params.length}`,
          params,
        );
        return { ok: true, value: result.rows.map(mapReview) };
      } catch {
        return internalError("Failed to list reviews");
      }
    },

    async listUserReviews(userId, params) {
      try {
        const result = await executor.execute(
          `SELECT ${REVIEW_COLUMNS} FROM reviews.user_reviews
            WHERE user_id = $1 AND state = 'published'
            ORDER BY submitted_at DESC
            LIMIT $2 OFFSET $3`,
          [userId, params.limit, params.offset],
        );
        return { ok: true, value: result.rows.map(mapReview) };
      } catch {
        return internalError("Failed to list reviews");
      }
    },

    async voteReview(reviewId, userId, isHelpful) {
      try {
        return await withTx(async (sql) => {
          // Read the prior vote so a flip moves one counter down and the other
          // up, rather than double-counting.
          const prior = await sql.execute(
            `SELECT is_helpful FROM reviews.review_votes
              WHERE review_id = $1 AND user_id = $2 FOR UPDATE`,
            [reviewId, userId],
          );
          const previous = prior.rows[0];
          const previousHelpful =
            previous === undefined
              ? null
              : previous.is_helpful === true || previous.is_helpful === "t";

          if (previousHelpful === isHelpful) {
            const unchanged = await readReview(sql, reviewId);
            return unchanged
              ? { ok: true as const, value: unchanged }
              : { ok: false as const, error: { kind: "not_found" as const } };
          }

          await sql.execute(
            `INSERT INTO reviews.review_votes (review_id, user_id, is_helpful)
             VALUES ($1,$2,$3)
             ON CONFLICT (review_id, user_id) DO UPDATE
               SET is_helpful = EXCLUDED.is_helpful, voted_at = now()`,
            [reviewId, userId, isHelpful],
          );

          const helpfulDelta = (isHelpful ? 1 : 0) - (previousHelpful === true ? 1 : 0);
          const unhelpfulDelta = (isHelpful ? 0 : 1) - (previousHelpful === false ? 1 : 0);

          const updated = await sql.execute(
            `UPDATE reviews.user_reviews
                SET helpful_count = GREATEST(helpful_count + $2, 0),
                    unhelpful_count = GREATEST(unhelpful_count + $3, 0)
              WHERE id = $1
              RETURNING ${REVIEW_COLUMNS}`,
            [reviewId, helpfulDelta, unhelpfulDelta],
          );
          const row = updated.rows[0];
          if (!row) return { ok: false as const, error: { kind: "not_found" as const } };
          return { ok: true as const, value: mapReview(row) };
        });
      } catch {
        return internalError("Failed to record vote");
      }
    },

    async clearVote(reviewId, userId) {
      try {
        return await withTx(async (sql) => {
          const removed = await sql.execute(
            `DELETE FROM reviews.review_votes
              WHERE review_id = $1 AND user_id = $2
              RETURNING is_helpful`,
            [reviewId, userId],
          );
          const previous = removed.rows[0];
          if (!previous) {
            const unchanged = await readReview(sql, reviewId);
            return unchanged
              ? { ok: true as const, value: unchanged }
              : { ok: false as const, error: { kind: "not_found" as const } };
          }

          const wasHelpful = previous.is_helpful === true || previous.is_helpful === "t";
          const updated = await sql.execute(
            `UPDATE reviews.user_reviews
                SET helpful_count = GREATEST(helpful_count + $2, 0),
                    unhelpful_count = GREATEST(unhelpful_count + $3, 0)
              WHERE id = $1
              RETURNING ${REVIEW_COLUMNS}`,
            [reviewId, wasHelpful ? -1 : 0, wasHelpful ? 0 : -1],
          );
          const row = updated.rows[0];
          if (!row) return { ok: false as const, error: { kind: "not_found" as const } };
          return { ok: true as const, value: mapReview(row) };
        });
      } catch {
        return internalError("Failed to clear vote");
      }
    },

    async listModerationQueue(params) {
      try {
        // Oldest first: a queue that sorts newest-first starves its tail.
        const result = await executor.execute(
          `SELECT ${REVIEW_COLUMNS} FROM reviews.user_reviews
            WHERE state = 'pending'
            ORDER BY submitted_at
            LIMIT $1 OFFSET $2`,
          [params.limit, params.offset],
        );
        return { ok: true, value: result.rows.map(mapReview) };
      } catch {
        return internalError("Failed to load moderation queue");
      }
    },

    async moderateReview(reviewId, moderatorId, state, note, now) {
      try {
        const result = await executor.execute(
          `UPDATE reviews.user_reviews
              SET state = $2, moderator_id = $3, decision_note = $4,
                  moderated_at = $5, updated_at = $5
            WHERE id = $1
            RETURNING ${REVIEW_COLUMNS}`,
          [reviewId, state, moderatorId, note, now.toISOString()],
        );
        const row = result.rows[0];
        if (!row) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapReview(row) };
      } catch {
        return internalError("Failed to moderate review");
      }
    },

    async listCriticReviews(titleId, limit) {
      try {
        const result = await executor.execute(
          `SELECT ${CRITIC_COLUMNS} FROM reviews.critic_reviews
            WHERE title_id = $1
            ORDER BY score DESC NULLS LAST, publication
            LIMIT $2`,
          [titleId, limit],
        );
        return { ok: true, value: result.rows.map(mapCritic) };
      } catch {
        return internalError("Failed to list critic reviews");
      }
    },

    async upsertCriticReview(input) {
      try {
        const result = await executor.execute(
          `INSERT INTO reviews.critic_reviews
             (id, title_id, publication, author, url, quote, score, published_on)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (title_id, publication, COALESCE(author, '')) DO UPDATE
             SET url = EXCLUDED.url,
                 quote = EXCLUDED.quote,
                 score = EXCLUDED.score,
                 published_on = EXCLUDED.published_on,
                 updated_at = now()
           RETURNING ${CRITIC_COLUMNS}`,
          [
            input.id,
            input.titleId,
            input.publication,
            input.author ?? null,
            input.url ?? null,
            input.quote,
            input.score ?? null,
            input.publishedOn ?? null,
          ],
        );
        const row = result.rows[0];
        if (!row) return internalError("Failed to write critic review");
        return { ok: true, value: mapCritic(row) };
      } catch {
        return internalError("Failed to write critic review");
      }
    },

    async getMetascore(titleId) {
      try {
        const result = await executor.execute(
          `SELECT title_id, metascore, critic_count, positive_count, mixed_count, negative_count
             FROM reviews.title_metascores WHERE title_id = $1`,
          [titleId],
        );
        const row = result.rows[0];
        if (!row) {
          return {
            ok: true,
            value: {
              titleId,
              metascore: null,
              criticCount: 0,
              positiveCount: 0,
              mixedCount: 0,
              negativeCount: 0,
            },
          };
        }
        return {
          ok: true,
          value: {
            titleId: row.title_id as string,
            metascore: nnum(row.metascore),
            criticCount: num(row.critic_count),
            positiveCount: num(row.positive_count),
            mixedCount: num(row.mixed_count),
            negativeCount: num(row.negative_count),
          } satisfies Metascore,
        };
      } catch {
        return internalError("Failed to load metascore");
      }
    },

    async refreshMetascore(titleId, now) {
      try {
        // Derived in SQL from the scored critic rows: an unscored publication
        // contributes a quote but must not drag the average.
        await executor.execute(
          `INSERT INTO reviews.title_metascores
             (title_id, metascore, critic_count, positive_count, mixed_count, negative_count, updated_at)
           SELECT $1,
                  ROUND(AVG(score))::smallint,
                  COUNT(*)::int,
                  COUNT(*) FILTER (WHERE score >= $3)::int,
                  COUNT(*) FILTER (WHERE score >= $4 AND score < $3)::int,
                  COUNT(*) FILTER (WHERE score < $4)::int,
                  $2
             FROM reviews.critic_reviews
            WHERE title_id = $1 AND score IS NOT NULL
           ON CONFLICT (title_id) DO UPDATE
             SET metascore      = EXCLUDED.metascore,
                 critic_count   = EXCLUDED.critic_count,
                 positive_count = EXCLUDED.positive_count,
                 mixed_count    = EXCLUDED.mixed_count,
                 negative_count = EXCLUDED.negative_count,
                 updated_at     = EXCLUDED.updated_at`,
          [titleId, now.toISOString(), METASCORE_POSITIVE_MIN, METASCORE_MIXED_MIN],
        );
        return await this.getMetascore(titleId);
      } catch {
        return internalError("Failed to refresh metascore");
      }
    },
  };
}
