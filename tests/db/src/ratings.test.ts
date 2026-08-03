import {
  createRatingsRepository,
  DEMOGRAPHIC_PRIVACY_FLOOR,
  priorMeanOf,
  roundRating,
  weightedRating,
} from "@saas/db/ratings";
import { asUuid } from "@saas/db";
import type { SqlExecutor, SqlExecutorResult, SqlRow } from "@saas/db/hyperdrive";

const USER = asUuid("11111111-1111-1111-1111-111111111111");
const TITLE = asUuid("22222222-2222-2222-2222-222222222222");
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

const AGGREGATE_ROW = {
  title_id: TITLE,
  vote_count: "4",
  rating_sum: "34",
  bucket_1: "0",
  bucket_2: "0",
  bucket_3: "0",
  bucket_4: "0",
  bucket_5: "0",
  bucket_6: "0",
  bucket_7: "1",
  bucket_8: "1",
  bucket_9: "1",
  bucket_10: "1",
  updated_at: NOW.toISOString(),
};

describe("weightedRating", () => {
  it("returns the prior when there are no votes", () => {
    expect(weightedRating(0, 10, 25000, 7)).toBe(7);
  });

  it("regresses a low-vote title toward the prior", () => {
    // Nine 10s must not outrank a classic. With m=25000 the score sits
    // essentially at the prior.
    const score = weightedRating(9, 10, 25000, 7);
    expect(score).toBeGreaterThan(7);
    expect(score).toBeLessThan(7.01);
  });

  it("approaches the raw average as votes accumulate", () => {
    const score = weightedRating(1_000_000, 9.2, 25000, 7);
    expect(score).toBeGreaterThan(9.1);
    expect(score).toBeLessThan(9.2);
  });

  it("is the raw average when the threshold is zero", () => {
    expect(weightedRating(10, 8.5, 0, 7)).toBe(8.5);
  });

  it("is monotonic in the raw average", () => {
    const low = weightedRating(50_000, 7.5, 25000, 7);
    const high = weightedRating(50_000, 8.5, 25000, 7);
    expect(high).toBeGreaterThan(low);
  });

  it("is monotonic in the vote count for an above-prior title", () => {
    const few = weightedRating(30_000, 8.5, 25000, 7);
    const many = weightedRating(300_000, 8.5, 25000, 7);
    expect(many).toBeGreaterThan(few);
  });
});

describe("priorMeanOf", () => {
  it("weights each candidate by its vote count", () => {
    const prior = priorMeanOf(
      [
        { voteCount: 1000, average: 9 },
        { voteCount: 9000, average: 7 },
      ],
      6,
    );
    expect(roundRating(prior)).toBe(7.2);
  });

  it("falls back when the population has no votes", () => {
    expect(priorMeanOf([], 7)).toBe(7);
    expect(priorMeanOf([{ voteCount: 0, average: 9 }], 7)).toBe(7);
  });
});

describe("RatingsRepository — aggregates", () => {
  it("derives the average from sum and count rather than storing a float", async () => {
    const { executor } = createFakeExecutor(() => [AGGREGATE_ROW]);
    const result = await createRatingsRepository(executor).getAggregate(TITLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.voteCount).toBe(4);
    expect(result.value.average).toBe(8.5);
  });

  it("always returns ten buckets, in order", async () => {
    const { executor } = createFakeExecutor(() => [AGGREGATE_ROW]);
    const result = await createRatingsRepository(executor).getAggregate(TITLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.distribution.buckets.map((b) => b.value)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("returns an empty aggregate for a title nobody has rated", async () => {
    const { executor } = createFakeExecutor(() => []);
    const result = await createRatingsRepository(executor).getAggregate(TITLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.voteCount).toBe(0);
    expect(result.value.average).toBeNull();
    expect(result.value.distribution.buckets).toHaveLength(10);
  });

  it("skips the query when asked for no titles", async () => {
    const { executor, queries } = createFakeExecutor();
    const result = await createRatingsRepository(executor).getAggregates([]);
    expect(result.ok && result.value.size).toBe(0);
    expect(queries).toHaveLength(0);
  });
});

describe("RatingsRepository — voting", () => {
  it("increments the bucket matching the value", async () => {
    const { executor, queries } = createFakeExecutor((text) =>
      text.includes("SELECT value") ? [] : [],
    );
    await createRatingsRepository(executor).rateTitle({
      userId: USER,
      titleId: TITLE,
      value: 8,
      now: NOW,
    });

    const aggregateWrite = queries.find((q) => q.text.includes("ratings.title_aggregates"))!;
    expect(aggregateWrite.text).toContain("bucket_8");
    expect(aggregateWrite.text).not.toContain("bucket_7");
  });

  it("moves the vote between buckets when a rating changes", async () => {
    // The prior vote must be decremented, not left behind as a second vote.
    const { executor, queries } = createFakeExecutor((text) =>
      text.includes("SELECT value")
        ? [{ value: 8, age_band: "undisclosed", gender_band: "undisclosed" }]
        : [],
    );
    await createRatingsRepository(executor).rateTitle({
      userId: USER,
      titleId: TITLE,
      value: 5,
      now: NOW,
    });

    const update = queries.find((q) => q.text.includes("UPDATE ratings.title_aggregates"))!;
    expect(update.text).toContain("GREATEST(bucket_8 - 1, 0)");
    expect(update.text).toContain("bucket_5 = bucket_5 + 1");
    expect(update.text).toContain("rating_sum = rating_sum - $2 + $3");
  });

  it("does not change the vote count when a rating is only edited", async () => {
    const { executor, queries } = createFakeExecutor((text) =>
      text.includes("SELECT value")
        ? [{ value: 8, age_band: "undisclosed", gender_band: "undisclosed" }]
        : [],
    );
    await createRatingsRepository(executor).rateTitle({
      userId: USER,
      titleId: TITLE,
      value: 5,
      now: NOW,
    });
    const update = queries.find((q) => q.text.includes("UPDATE ratings.title_aggregates"))!;
    expect(update.text).not.toContain("vote_count");
  });

  it("locks the prior vote so two concurrent edits cannot both read it", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    await createRatingsRepository(executor).rateTitle({
      userId: USER,
      titleId: TITLE,
      value: 8,
      now: NOW,
    });
    expect(queries[0]!.text).toContain("FOR UPDATE");
  });

  it("rejects a value outside 1..10 without issuing a query", async () => {
    const { executor, queries } = createFakeExecutor();
    const result = await createRatingsRepository(executor).rateTitle({
      userId: USER,
      titleId: TITLE,
      value: 11,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    expect(queries).toHaveLength(0);
  });

  it("upserts the vote so re-rating does not create a duplicate", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    await createRatingsRepository(executor).rateTitle({
      userId: USER,
      titleId: TITLE,
      value: 8,
      now: NOW,
    });
    const insert = queries.find((q) => q.text.includes("INSERT INTO ratings.user_ratings"))!;
    expect(insert.text).toContain("ON CONFLICT (user_id, title_id) DO UPDATE");
  });

  it("floors aggregate columns so a removal cannot go negative", async () => {
    const { executor, queries } = createFakeExecutor((text) =>
      text.includes("DELETE FROM ratings.user_ratings")
        ? [{ value: 8, age_band: "undisclosed", gender_band: "undisclosed" }]
        : [],
    );
    await createRatingsRepository(executor).removeRating(USER, TITLE, NOW);
    const update = queries.find((q) => q.text.includes("UPDATE ratings.title_aggregates"))!;
    expect(update.text).toContain("GREATEST(vote_count - 1, 0)");
    expect(update.text).toContain("GREATEST(rating_sum - $2, 0)");
    expect(update.text).toContain("GREATEST(bucket_8 - 1, 0)");
  });

  it("treats removing a rating that was never cast as success", async () => {
    const { executor } = createFakeExecutor(() => []);
    const result = await createRatingsRepository(executor).removeRating(USER, TITLE, NOW);
    expect(result.ok).toBe(true);
  });
});

describe("RatingsRepository — demographics", () => {
  it("suppresses cells below the privacy floor in the query itself", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    await createRatingsRepository(executor).getDemographics(TITLE);
    expect(queries[0]!.text).toContain("vote_count >= $2");
    expect(queries[0]!.params[1]).toBe(DEMOGRAPHIC_PRIVACY_FLOOR);
  });

  it("has a privacy floor high enough that a cell cannot identify one person", () => {
    expect(DEMOGRAPHIC_PRIVACY_FLOOR).toBeGreaterThanOrEqual(10);
  });

  it("computes the cell average from counts, never from stored floats", async () => {
    const { executor } = createFakeExecutor(() => [
      { age_band: "18_29", gender_band: "female", vote_count: "40", rating_sum: "340" },
    ]);
    const result = await createRatingsRepository(executor).getDemographics(TITLE);
    expect(result.ok && result.value[0]!.average).toBe(8.5);
  });
});

describe("RatingsRepository — charts", () => {
  it("reads only the newest snapshot", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    await createRatingsRepository(executor).listChart("top_movies", 250);
    // Blending two days would make the chart reshuffle mid-scroll.
    expect(queries[0]!.text).toContain("computed_for = (SELECT MAX(computed_for)");
  });

  it("carries the previous snapshot's ranks into a rebuild", async () => {
    const { executor, queries } = createFakeExecutor((text) =>
      text.includes("SELECT title_id, rank") ? [{ title_id: "t1", rank: 5 }] : [],
    );
    const result = await createRatingsRepository(executor).replaceChart(
      "top_movies",
      "2026-08-03",
      [{ titleId: "t1", score: 9.1 }],
    );
    expect(result.ok && result.value).toBe(1);
    const insert = queries.find((q) => q.text.includes("INSERT INTO ratings.chart_entries"))!;
    expect(insert.params).toEqual(["top_movies", "2026-08-03", 1, "t1", 9.1, 5]);
  });

  it("records a new entry with no previous rank", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    await createRatingsRepository(executor).replaceChart("top_movies", "2026-08-03", [
      { titleId: "t9", score: 8 },
    ]);
    const insert = queries.find((q) => q.text.includes("INSERT INTO ratings.chart_entries"))!;
    expect(insert.params.at(-1)).toBeNull();
  });

  it("replaces the snapshot for that date so a rebuild is idempotent", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    await createRatingsRepository(executor).replaceChart("top_movies", "2026-08-03", []);
    expect(
      queries.some((q) => q.text.includes("DELETE FROM ratings.chart_entries")),
    ).toBe(true);
  });

  it("filters chart candidates by the vote threshold", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    await createRatingsRepository(executor).listChartCandidates(25000, 100);
    expect(queries[0]!.text).toContain("vote_count >= $1");
    expect(queries[0]!.params[0]).toBe(25000);
  });
});

describe("RatingsRepository — failure handling", () => {
  it("never leaks a driver error", async () => {
    const executor: SqlExecutor = {
      async execute() {
        throw new Error("deadlock detected on ratings.title_aggregates");
      },
    };
    const result = await createRatingsRepository(executor).getAggregate(TITLE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("internal");
    if (result.error.kind !== "internal") return;
    expect(result.error.message).not.toContain("deadlock");
  });
});
