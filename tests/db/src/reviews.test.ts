import { createReviewsRepository, METASCORE_MIXED_MIN, METASCORE_POSITIVE_MIN } from "@saas/db/reviews";
import { asUuid } from "@saas/db";
import type { SqlExecutor, SqlExecutorResult, SqlRow } from "@saas/db/hyperdrive";

const REVIEW = asUuid("11111111-1111-1111-1111-111111111111");
const TITLE = asUuid("22222222-2222-2222-2222-222222222222");
const USER = asUuid("33333333-3333-3333-3333-333333333333");
const OTHER = asUuid("44444444-4444-4444-4444-444444444444");
const NOW = new Date("2026-08-03T12:00:00.000Z");

type QueryRecord = { text: string; params: unknown[] };

function createFakeExecutor(
  handler?: (text: string, params: unknown[]) => Record<string, unknown>[],
): { executor: SqlExecutor; queries: QueryRecord[] } {
  const queries: QueryRecord[] = [];
  const executor: SqlExecutor = {
    async execute<T extends SqlRow = SqlRow>(
      text: string,
      params?: unknown[],
    ): Promise<SqlExecutorResult<T>> {
      queries.push({ text, params: params ?? [] });
      const rows = (handler?.(text, params ?? []) ?? []) as unknown as T[];
      return { rows, rowCount: rows.length };
    },
  };
  return { executor, queries };
}

const REVIEW_ROW = {
  id: REVIEW,
  title_id: TITLE,
  user_id: USER,
  headline: "A quiet masterpiece",
  body: "Long form thoughts.",
  rating: "9",
  has_spoilers: false,
  state: "published",
  helpful_count: "12",
  unhelpful_count: "1",
  submitted_at: NOW.toISOString(),
  updated_at: NOW.toISOString(),
  moderated_at: null,
  decision_note: null,
};

describe("ReviewsRepository — authorship", () => {
  it("scopes an update by author so a wrong author gets not_found", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    const result = await createReviewsRepository(executor).updateReview(
      REVIEW,
      OTHER,
      { headline: "hijacked" },
      NOW,
    );
    // 404, never 403: a wrong author must not learn the review exists.
    expect(result).toEqual({ ok: false, error: { kind: "not_found" } });
    expect(queries[0]!.text).toContain("user_id = $2");
  });

  it("refuses to edit a deleted review", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    await createReviewsRepository(executor).updateReview(REVIEW, USER, { body: "x" }, NOW);
    expect(queries[0]!.text).toContain("state <> 'deleted'");
  });

  it("soft-deletes so votes survive and the slot frees up", async () => {
    const { executor, queries } = createFakeExecutor(() => [{ ok: true }]);
    await createReviewsRepository(executor).deleteReview(REVIEW, USER, NOW);
    expect(queries[0]!.text).toContain("SET state = 'deleted'");
    expect(queries[0]!.text).not.toContain("DELETE FROM");
  });
});

describe("ReviewsRepository — listing", () => {
  it("hides spoilers unless asked", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    await createReviewsRepository(executor).listTitleReviews(TITLE, {
      sort: "helpfulness",
      includeSpoilers: false,
      limit: 25,
      offset: 0,
    });
    expect(queries[0]!.text).toContain("has_spoilers = FALSE");
  });

  it("includes spoilers when explicitly requested", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    await createReviewsRepository(executor).listTitleReviews(TITLE, {
      sort: "helpfulness",
      includeSpoilers: true,
      limit: 25,
      offset: 0,
    });
    expect(queries[0]!.text).not.toContain("has_spoilers = FALSE");
  });

  it("only ever lists published reviews", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    await createReviewsRepository(executor).listTitleReviews(TITLE, {
      sort: "date",
      includeSpoilers: true,
      limit: 25,
      offset: 0,
    });
    expect(queries[0]!.text).toContain("state = 'published'");
  });

  it("maps each sort key to a fixed fragment", async () => {
    for (const [sort, fragment] of [
      ["helpfulness", "helpful_count DESC"],
      ["date", "submitted_at DESC, id"],
      ["rating", "rating DESC NULLS LAST"],
    ] as const) {
      const { executor, queries } = createFakeExecutor(() => []);
      await createReviewsRepository(executor).listTitleReviews(TITLE, {
        sort,
        includeSpoilers: true,
        limit: 25,
        offset: 0,
      });
      expect(queries[0]!.text).toContain(fragment);
    }
  });

  it("reads the moderation queue oldest-first", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    await createReviewsRepository(executor).listModerationQueue({ limit: 50, offset: 0 });
    // Newest-first would starve the tail of the queue forever.
    expect(queries[0]!.text).toContain("ORDER BY submitted_at\n");
    expect(queries[0]!.text).toContain("state = 'pending'");
  });

  it("treats a non-published review as absent", async () => {
    const { executor } = createFakeExecutor(() => [{ ...REVIEW_ROW, state: "deleted" }]);
    const result = await createReviewsRepository(executor).getReview(REVIEW);
    expect(result).toEqual({ ok: false, error: { kind: "not_found" } });
  });

  it("coerces counter columns that arrive as strings", async () => {
    const { executor } = createFakeExecutor(() => [REVIEW_ROW]);
    const result = await createReviewsRepository(executor).getReview(REVIEW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.helpfulCount).toBe(12);
    expect(result.value.rating).toBe(9);
  });
});

describe("ReviewsRepository — helpfulness voting", () => {
  it("locks the prior vote before changing counters", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    await createReviewsRepository(executor).voteReview(REVIEW, USER, true);
    expect(queries[0]!.text).toContain("FOR UPDATE");
  });

  it("moves both counters when a vote flips", async () => {
    const { executor, queries } = createFakeExecutor((text) =>
      text.includes("SELECT is_helpful")
        ? [{ is_helpful: true }]
        : text.includes("UPDATE reviews.user_reviews")
          ? [REVIEW_ROW]
          : [],
    );
    await createReviewsRepository(executor).voteReview(REVIEW, USER, false);
    const update = queries.find((q) => q.text.includes("UPDATE reviews.user_reviews"))!;
    // helpful -1, unhelpful +1 — not a second vote.
    expect(update.params.slice(1)).toEqual([-1, 1]);
  });

  it("does nothing when the same vote is cast twice", async () => {
    const { executor, queries } = createFakeExecutor((text) =>
      text.includes("SELECT is_helpful")
        ? [{ is_helpful: true }]
        : text.includes("SELECT")
          ? [REVIEW_ROW]
          : [],
    );
    await createReviewsRepository(executor).voteReview(REVIEW, USER, true);
    expect(queries.some((q) => q.text.includes("UPDATE reviews.user_reviews"))).toBe(false);
  });

  it("increments only the chosen counter on a first vote", async () => {
    const { executor, queries } = createFakeExecutor((text) =>
      text.includes("UPDATE reviews.user_reviews") ? [REVIEW_ROW] : [],
    );
    await createReviewsRepository(executor).voteReview(REVIEW, USER, true);
    const update = queries.find((q) => q.text.includes("UPDATE reviews.user_reviews"))!;
    expect(update.params.slice(1)).toEqual([1, 0]);
  });

  it("floors both counters so a double clear cannot go negative", async () => {
    const { executor, queries } = createFakeExecutor((text) =>
      text.includes("DELETE FROM reviews.review_votes")
        ? [{ is_helpful: true }]
        : text.includes("UPDATE")
          ? [REVIEW_ROW]
          : [],
    );
    await createReviewsRepository(executor).clearVote(REVIEW, USER);
    const update = queries.find((q) => q.text.includes("UPDATE reviews.user_reviews"))!;
    expect(update.text).toContain("GREATEST(helpful_count + $2, 0)");
    expect(update.text).toContain("GREATEST(unhelpful_count + $3, 0)");
  });

  it("is a no-op when clearing a vote that was never cast", async () => {
    const { executor, queries } = createFakeExecutor((text) =>
      text.includes("SELECT") ? [REVIEW_ROW] : [],
    );
    const result = await createReviewsRepository(executor).clearVote(REVIEW, USER);
    expect(result.ok).toBe(true);
    expect(queries.some((q) => q.text.includes("UPDATE reviews.user_reviews"))).toBe(false);
  });
});

describe("ReviewsRepository — metascore", () => {
  it("excludes unscored critic rows from the average and the bands", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    await createReviewsRepository(executor).refreshMetascore(TITLE, NOW);
    const refresh = queries[0]!;
    // A publication that issues no score contributes a quote, not a number.
    expect(refresh.text).toContain("score IS NOT NULL");
    expect(refresh.params).toContain(METASCORE_POSITIVE_MIN);
    expect(refresh.params).toContain(METASCORE_MIXED_MIN);
  });

  it("bands are ordered so every score falls in exactly one", () => {
    expect(METASCORE_POSITIVE_MIN).toBeGreaterThan(METASCORE_MIXED_MIN);
    expect(METASCORE_MIXED_MIN).toBeGreaterThan(0);
    expect(METASCORE_POSITIVE_MIN).toBeLessThanOrEqual(100);
  });

  it("returns an empty metascore for a title with no critic reviews", async () => {
    const { executor } = createFakeExecutor(() => []);
    const result = await createReviewsRepository(executor).getMetascore(TITLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.metascore).toBeNull();
    expect(result.value.criticCount).toBe(0);
  });

  it("upserts a critic review so a re-ingest does not duplicate", async () => {
    const { executor, queries } = createFakeExecutor(() => [
      {
        id: REVIEW,
        title_id: TITLE,
        publication: "The Paper",
        author: null,
        url: null,
        quote: "Superb.",
        score: 88,
        published_on: "2026-01-01",
      },
    ]);
    await createReviewsRepository(executor).upsertCriticReview({
      id: REVIEW,
      titleId: TITLE,
      publication: "The Paper",
      quote: "Superb.",
      score: 88,
    });
    expect(queries[0]!.text).toContain("ON CONFLICT (title_id, publication, COALESCE(author, ''))");
  });
});

describe("ReviewsRepository — failure handling", () => {
  it("translates a unique violation into a conflict", async () => {
    const executor: SqlExecutor = {
      async execute() {
        throw Object.assign(new Error("duplicate key"), { code: "23505" });
      },
    };
    const result = await createReviewsRepository(executor).createReview({
      id: REVIEW,
      titleId: TITLE,
      userId: USER,
      headline: "h",
      body: "b",
      now: NOW,
    });
    expect(result).toEqual({ ok: false, error: { kind: "conflict", entity: "review" } });
  });

  it("never leaks a driver error", async () => {
    const executor: SqlExecutor = {
      async execute() {
        throw new Error("relation reviews.user_reviews does not exist");
      },
    };
    const result = await createReviewsRepository(executor).getReview(REVIEW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("internal");
    if (result.error.kind !== "internal") return;
    expect(result.error.message).not.toContain("relation");
  });
});
