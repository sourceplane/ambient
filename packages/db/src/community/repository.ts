import type { SqlExecutor, TransactionalSqlExecutor } from "../hyperdrive/executor.js";
import { inList } from "../hyperdrive/in-list.js";
import { SEVERITIES } from "./types.js";
import type {
  AwardNomination,
  CommunityRepository,
  CommunityResult,
  Contribution,
  ContributionState,
  ContributorStats,
  FactKind,
  FaqEntry,
  ModerationState,
  NewsArticle,
  ParentsGuideCategory,
  ParentsGuideEntry,
  QuoteLine,
  Severity,
  SeverityTally,
  TitleFact,
} from "./types.js";

type Row = Record<string, unknown>;

const FACT_COLUMNS = `id, title_id, kind, subkind, body, has_spoilers,
  interesting_votes, total_votes, state, contributor_user_id, ordering`;

const CONTRIBUTION_COLUMNS = `id, contributor_user_id, target_type, target_id, operation,
  payload, state, submitted_at, decided_at, decision_note`;

/**
 * Award nominations join through edition → body and category. Selecting the
 * denormalized shape once here means the awards tab is one query, not three.
 */
const AWARD_SELECT = `SELECT n.id, b.slug AS body_slug, b.name AS body_name, e.year,
         c.name AS category_name, n.title_id, n.person_id, n.is_winner, n.note
    FROM community.award_nominations n
    JOIN community.award_editions e ON e.id = n.edition_id
    JOIN community.award_bodies b ON b.id = e.body_id
    JOIN community.award_categories c ON c.id = n.category_id`;

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function bool(value: unknown): boolean {
  return value === true || value === "t" || value === "true";
}

function internalError(message: string): CommunityResult<never> {
  return { ok: false, error: { kind: "internal", message } };
}

function mapAward(row: Row): AwardNomination {
  return {
    id: row.id as string,
    bodySlug: row.body_slug as string,
    bodyName: row.body_name as string,
    year: num(row.year),
    categoryName: row.category_name as string,
    titleId: (row.title_id as string) ?? null,
    personId: (row.person_id as string) ?? null,
    isWinner: bool(row.is_winner),
    note: (row.note as string) ?? null,
  };
}

function mapFact(row: Row, quoteLines: QuoteLine[] = []): TitleFact {
  return {
    id: row.id as string,
    titleId: row.title_id as string,
    kind: row.kind as FactKind,
    subkind: (row.subkind as string) ?? null,
    body: row.body as string,
    hasSpoilers: bool(row.has_spoilers),
    interestingVotes: num(row.interesting_votes),
    totalVotes: num(row.total_votes),
    state: row.state as ModerationState,
    contributorUserId: (row.contributor_user_id as string) ?? null,
    ordering: num(row.ordering),
    quoteLines,
  };
}

function mapContribution(row: Row): Contribution {
  const rawPayload = row.payload;
  let payload: Record<string, unknown> = {};
  if (typeof rawPayload === "string") {
    try {
      payload = JSON.parse(rawPayload) as Record<string, unknown>;
    } catch {
      payload = {};
    }
  } else if (rawPayload && typeof rawPayload === "object") {
    payload = rawPayload as Record<string, unknown>;
  }

  return {
    id: row.id as string,
    contributorUserId: row.contributor_user_id as string,
    targetType: row.target_type as Contribution["targetType"],
    targetId: (row.target_id as string) ?? null,
    operation: row.operation as Contribution["operation"],
    payload,
    state: row.state as ContributionState,
    submittedAt: new Date(row.submitted_at as string),
    decidedAt: row.decided_at ? new Date(row.decided_at as string) : null,
    decisionNote: (row.decision_note as string) ?? null,
  };
}

function emptyTally(category: ParentsGuideCategory): SeverityTally {
  return {
    category,
    severity: null,
    votes: { none: 0, mild: 0, moderate: 0, severe: 0 },
    totalVotes: 0,
  };
}

export function createCommunityRepository(
  executor: SqlExecutor | TransactionalSqlExecutor,
): CommunityRepository {
  const tx = executor as TransactionalSqlExecutor;
  const canTransact = typeof tx.transaction === "function";

  async function withTx<T>(fn: (sql: SqlExecutor) => Promise<T>): Promise<T> {
    return canTransact ? tx.transaction(fn) : fn(executor);
  }

  async function readTallies(
    sql: SqlExecutor,
    titleId: string,
  ): Promise<Map<string, SeverityTally>> {
    const result = await sql.execute(
      `SELECT category, severity, COUNT(*)::int AS votes
         FROM community.parents_guide_severity_votes
        WHERE title_id = $1
        GROUP BY category, severity`,
      [titleId],
    );
    const map = new Map<string, SeverityTally>();
    for (const row of result.rows) {
      const category = row.category as ParentsGuideCategory;
      const tally = map.get(category) ?? emptyTally(category);
      const severity = row.severity as Severity;
      const votes = num(row.votes);
      tally.votes[severity] = votes;
      tally.totalVotes += votes;
      map.set(category, tally);
    }
    // The displayed severity is the modal vote, resolved after all buckets are
    // in — picking it inside the loop would depend on row order.
    for (const tally of map.values()) {
      let best: Severity | null = null;
      for (const severity of SEVERITIES) {
        if (tally.votes[severity] > 0 && (best === null || tally.votes[severity] > tally.votes[best])) {
          best = severity;
        }
      }
      tally.severity = best;
    }
    return map;
  }

  return {
    async listTitleAwards(titleId) {
      try {
        const result = await executor.execute(
          `${AWARD_SELECT} WHERE n.title_id = $1
            ORDER BY n.is_winner DESC, e.year DESC, c.ordering`,
          [titleId],
        );
        return { ok: true, value: result.rows.map(mapAward) };
      } catch {
        return internalError("Failed to load awards");
      }
    },

    async listPersonAwards(personId) {
      try {
        const result = await executor.execute(
          `${AWARD_SELECT} WHERE n.person_id = $1
            ORDER BY n.is_winner DESC, e.year DESC, c.ordering`,
          [personId],
        );
        return { ok: true, value: result.rows.map(mapAward) };
      } catch {
        return internalError("Failed to load awards");
      }
    },

    async listEditionAwards(bodySlug, year) {
      try {
        const result = await executor.execute(
          `${AWARD_SELECT} WHERE b.slug = $1 AND e.year = $2
            ORDER BY c.ordering, n.is_winner DESC, n.ordering`,
          [bodySlug, year],
        );
        return { ok: true, value: result.rows.map(mapAward) };
      } catch {
        return internalError("Failed to load awards");
      }
    },

    async listFacts(titleId, kind, limit) {
      const where = [`f.title_id = $1`, `f.state = 'published'`];
      const values: unknown[] = [titleId];
      if (kind) {
        values.push(kind);
        where.push(`f.kind = $${values.length}`);
      }
      values.push(limit);

      try {
        const result = await executor.execute(
          `SELECT ${FACT_COLUMNS.split(", ").map((c) => `f.${c.trim()}`).join(", ")}
             FROM community.title_facts f
            WHERE ${where.join(" AND ")}
            ORDER BY f.interesting_votes DESC, f.ordering, f.id
            LIMIT $${values.length}`,
          values,
        );
        const facts = result.rows.map((row) => mapFact(row));
        const quoteIds = facts.filter((f) => f.kind === "quote").map((f) => f.id);
        if (quoteIds.length === 0) return { ok: true, value: facts };

        // Quote lines batch by fact id — a quotes tab would otherwise be one
        // query per quote.
        const quoteValues: unknown[] = [];
        const lines = await executor.execute(
          `SELECT fact_id, ordering, speaker, line
             FROM community.title_quote_lines
            WHERE fact_id IN (${inList(quoteIds, quoteValues, "uuid")})
            ORDER BY fact_id, ordering`,
          quoteValues,
        );
        const byFact = new Map<string, QuoteLine[]>();
        for (const row of lines.rows) {
          const list = byFact.get(row.fact_id as string) ?? [];
          list.push({
            ordering: num(row.ordering),
            speaker: (row.speaker as string) ?? null,
            line: row.line as string,
          });
          byFact.set(row.fact_id as string, list);
        }
        for (const fact of facts) {
          fact.quoteLines = byFact.get(fact.id) ?? [];
        }
        return { ok: true, value: facts };
      } catch {
        return internalError("Failed to load facts");
      }
    },

    async createFact(input) {
      try {
        return await withTx(async (sql) => {
          const result = await sql.execute(
            `INSERT INTO community.title_facts
               (id, title_id, kind, subkind, body, has_spoilers, state, contributor_user_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             RETURNING ${FACT_COLUMNS}`,
            [
              input.id,
              input.titleId,
              input.kind,
              input.subkind ?? null,
              input.body,
              input.hasSpoilers ?? false,
              input.state ?? "pending",
              input.contributorUserId ?? null,
            ],
          );
          const row = result.rows[0];
          if (!row) return { ok: false as const, error: { kind: "internal" as const, message: "Failed to create fact" } };

          const quoteLines: QuoteLine[] = [];
          for (const [index, entry] of (input.quoteLines ?? []).entries()) {
            await sql.execute(
              `INSERT INTO community.title_quote_lines (id, fact_id, ordering, speaker, line)
               VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
              [input.id, index, entry.speaker, entry.line],
            );
            quoteLines.push({ ordering: index, speaker: entry.speaker, line: entry.line });
          }
          return { ok: true as const, value: mapFact(row, quoteLines) };
        });
      } catch {
        return internalError("Failed to create fact");
      }
    },

    async voteFact(factId, interesting) {
      try {
        // Anonymous tally, not one row per voter: "was this interesting" is a
        // signal for ordering, not an identity-bearing vote like a rating.
        const result = await executor.execute(
          `UPDATE community.title_facts
              SET interesting_votes = interesting_votes + $2,
                  total_votes = total_votes + 1,
                  updated_at = now()
            WHERE id = $1
            RETURNING ${FACT_COLUMNS}`,
          [factId, interesting ? 1 : 0],
        );
        const row = result.rows[0];
        if (!row) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapFact(row) };
      } catch {
        return internalError("Failed to record vote");
      }
    },

    async listParentsGuide(titleId) {
      try {
        const result = await executor.execute(
          `SELECT id, title_id, category, body, has_spoilers, state
             FROM community.parents_guide_entries
            WHERE title_id = $1 AND state = 'published'
            ORDER BY category, ordering`,
          [titleId],
        );
        return {
          ok: true,
          value: result.rows.map((row) => ({
            id: row.id as string,
            titleId: row.title_id as string,
            category: row.category as ParentsGuideCategory,
            body: row.body as string,
            hasSpoilers: bool(row.has_spoilers),
            state: row.state as ModerationState,
          })) satisfies ParentsGuideEntry[],
        };
      } catch {
        return internalError("Failed to load parents guide");
      }
    },

    async getSeverityTallies(titleId) {
      try {
        const map = await readTallies(executor, titleId);
        return { ok: true, value: [...map.values()] };
      } catch {
        return internalError("Failed to load severity votes");
      }
    },

    async setSeverityVote(titleId, category, userId, severity) {
      try {
        return await withTx(async (sql) => {
          await sql.execute(
            `INSERT INTO community.parents_guide_severity_votes
               (title_id, category, user_id, severity)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (title_id, category, user_id) DO UPDATE
               SET severity = EXCLUDED.severity, voted_at = now()`,
            [titleId, category, userId, severity],
          );
          const map = await readTallies(sql, titleId);
          return { ok: true as const, value: map.get(category) ?? emptyTally(category) };
        });
      } catch {
        return internalError("Failed to record severity vote");
      }
    },

    async listFaq(titleId) {
      try {
        const result = await executor.execute(
          `SELECT id, title_id, question, answer, has_spoilers, state
             FROM community.faq_entries
            WHERE title_id = $1 AND state = 'published'
            ORDER BY ordering, id`,
          [titleId],
        );
        return {
          ok: true,
          value: result.rows.map((row) => ({
            id: row.id as string,
            titleId: row.title_id as string,
            question: row.question as string,
            answer: row.answer as string,
            hasSpoilers: bool(row.has_spoilers),
            state: row.state as ModerationState,
          })) satisfies FaqEntry[],
        };
      } catch {
        return internalError("Failed to load FAQ");
      }
    },

    async listNews(entity, params) {
      const values: unknown[] = [];
      let from = `FROM community.news_articles a`;
      const where: string[] = [];
      if (entity) {
        values.push(entity.entityType, entity.entityId);
        from += ` JOIN community.news_links l ON l.article_id = a.id`;
        where.push(`l.entity_type = $1 AND l.entity_id = $2`);
      }
      values.push(params.limit, params.offset);

      try {
        const result = await executor.execute(
          `SELECT a.id, a.headline, a.body, a.source, a.author, a.url, a.image_url, a.published_at
             ${from}
            ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
            ORDER BY a.published_at DESC, a.id
            LIMIT $${values.length - 1} OFFSET $${values.length}`,
          values,
        );
        return {
          ok: true,
          value: result.rows.map((row) => ({
            id: row.id as string,
            headline: row.headline as string,
            body: (row.body as string) ?? null,
            source: row.source as string,
            author: (row.author as string) ?? null,
            url: (row.url as string) ?? null,
            imageUrl: (row.image_url as string) ?? null,
            publishedAt: new Date(row.published_at as string),
          })) satisfies NewsArticle[],
        };
      } catch {
        return internalError("Failed to load news");
      }
    },

    async submitContribution(input) {
      try {
        return await withTx(async (sql) => {
          const result = await sql.execute(
            `INSERT INTO community.contributions
               (id, contributor_user_id, target_type, target_id, operation, payload)
             VALUES ($1,$2,$3,$4,$5,$6::jsonb)
             RETURNING ${CONTRIBUTION_COLUMNS}`,
            [
              input.id,
              input.contributorUserId,
              input.targetType,
              input.targetId ?? null,
              input.operation,
              JSON.stringify(input.payload ?? {}),
            ],
          );
          const row = result.rows[0];
          if (!row) {
            return { ok: false as const, error: { kind: "internal" as const, message: "Failed to submit" } };
          }
          await bumpStats(sql, input.contributorUserId, { pending: 1 });
          return { ok: true as const, value: mapContribution(row) };
        });
      } catch {
        return internalError("Failed to submit contribution");
      }
    },

    async listMyContributions(userId, params) {
      try {
        const result = await executor.execute(
          `SELECT ${CONTRIBUTION_COLUMNS} FROM community.contributions
            WHERE contributor_user_id = $1
            ORDER BY submitted_at DESC
            LIMIT $2 OFFSET $3`,
          [userId, params.limit, params.offset],
        );
        return { ok: true, value: result.rows.map(mapContribution) };
      } catch {
        return internalError("Failed to load contributions");
      }
    },

    async withdrawContribution(contributionId, userId) {
      try {
        return await withTx(async (sql) => {
          const result = await sql.execute(
            `UPDATE community.contributions
                SET state = 'withdrawn', decided_at = now()
              WHERE id = $1 AND contributor_user_id = $2 AND state = 'pending'
              RETURNING ${CONTRIBUTION_COLUMNS}`,
            [contributionId, userId],
          );
          const row = result.rows[0];
          if (!row) return { ok: false as const, error: { kind: "not_found" as const } };
          await bumpStats(sql, userId, { pending: -1 });
          return { ok: true as const, value: mapContribution(row) };
        });
      } catch {
        return internalError("Failed to withdraw contribution");
      }
    },

    async listModerationQueue(params) {
      try {
        const result = await executor.execute(
          `SELECT ${CONTRIBUTION_COLUMNS} FROM community.contributions
            WHERE state = 'pending'
            ORDER BY submitted_at
            LIMIT $1 OFFSET $2`,
          [params.limit, params.offset],
        );
        return { ok: true, value: result.rows.map(mapContribution) };
      } catch {
        return internalError("Failed to load moderation queue");
      }
    },

    async decideContribution(contributionId, moderatorUserId, state, note) {
      try {
        return await withTx(async (sql) => {
          const result = await sql.execute(
            `UPDATE community.contributions
                SET state = $2, moderator_user_id = $3, decision_note = $4, decided_at = now()
              WHERE id = $1 AND state = 'pending'
              RETURNING ${CONTRIBUTION_COLUMNS}`,
            [contributionId, state, moderatorUserId, note],
          );
          const row = result.rows[0];
          if (!row) return { ok: false as const, error: { kind: "not_found" as const } };
          const contribution = mapContribution(row);
          await bumpStats(sql, contribution.contributorUserId, {
            pending: -1,
            approved: state === "approved" ? 1 : 0,
            rejected: state === "rejected" ? 1 : 0,
          });
          return { ok: true as const, value: contribution };
        });
      } catch {
        return internalError("Failed to decide contribution");
      }
    },

    async getContributorStats(userId) {
      try {
        const result = await executor.execute(
          `SELECT user_id, approved_count, rejected_count, pending_count, reputation
             FROM community.contributor_stats WHERE user_id = $1`,
          [userId],
        );
        const row = result.rows[0];
        if (!row) {
          return {
            ok: true,
            value: {
              userId,
              approvedCount: 0,
              rejectedCount: 0,
              pendingCount: 0,
              reputation: 0,
            } satisfies ContributorStats,
          };
        }
        return {
          ok: true,
          value: {
            userId: row.user_id as string,
            approvedCount: num(row.approved_count),
            rejectedCount: num(row.rejected_count),
            pendingCount: num(row.pending_count),
            reputation: num(row.reputation),
          },
        };
      } catch {
        return internalError("Failed to load contributor stats");
      }
    },
  };
}

/**
 * Contributor counters move with the submission/decision that caused them, and
 * reputation is recomputed from the counters rather than stored independently
 * — so it can never disagree with the history it summarizes.
 */
async function bumpStats(
  sql: SqlExecutor,
  userId: string,
  delta: { pending?: number; approved?: number; rejected?: number },
): Promise<void> {
  await sql.execute(
    `INSERT INTO community.contributor_stats
       (user_id, approved_count, rejected_count, pending_count, reputation, updated_at)
     VALUES ($1, GREATEST($2,0), GREATEST($3,0), GREATEST($4,0), GREATEST($2,0) * 3 - GREATEST($3,0), now())
     ON CONFLICT (user_id) DO UPDATE
       SET approved_count = GREATEST(community.contributor_stats.approved_count + $2, 0),
           rejected_count = GREATEST(community.contributor_stats.rejected_count + $3, 0),
           pending_count  = GREATEST(community.contributor_stats.pending_count + $4, 0),
           reputation     = GREATEST(community.contributor_stats.approved_count + $2, 0) * 3
                          - GREATEST(community.contributor_stats.rejected_count + $3, 0),
           updated_at     = now()`,
    [userId, delta.approved ?? 0, delta.rejected ?? 0, delta.pending ?? 0],
  );
}
