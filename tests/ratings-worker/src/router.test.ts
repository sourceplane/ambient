import { route, toPublicChartEntry, toPublicRating } from "@ratings-worker/router";
import type { Env } from "@ratings-worker/env";
import type { TitleAggregate } from "@saas/db/ratings";

const TITLE_UUID = "11111111-1111-1111-1111-111111111111";
const NAME_UUID = "22222222-2222-2222-2222-222222222222";
const TITLE_ID = `tt_${TITLE_UUID.replace(/-/g, "")}`;
const NAME_ID = `nm_${NAME_UUID.replace(/-/g, "")}`;

function bareEnv(): Env {
  return { ENVIRONMENT: "test" };
}

function req(path: string, method = "GET", body?: unknown, actor = false): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (actor) {
    headers.set("x-actor-subject-id", "usr_33333333333333333333333333333333");
    headers.set("x-actor-subject-type", "user");
  }
  return new Request(`https://ratings.internal${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("health", () => {
  it("reports the database binding", async () => {
    const response = await route(req("/health"), bareEnv());
    expect(response.status).toBe(200);
    const data = (await json(response)).data as Record<string, unknown>;
    expect(data.service).toBe("ratings-worker");
  });
});

describe("public reads", () => {
  it.each([
    `/v1/titles/${TITLE_ID}/rating`,
    `/v1/titles/${TITLE_ID}/rating/demographics`,
    `/v1/titles/${TITLE_ID}/popularity`,
    `/v1/names/${NAME_ID}/popularity`,
    "/v1/charts/top_movies",
    "/v1/charts/top_tv",
    "/v1/charts/bottom_movies",
  ])("routes %s without a session", async (path) => {
    const response = await route(req(path), bareEnv());
    expect(response.status).toBe(503);
  });

  it("404s an unknown chart key", async () => {
    const response = await route(req("/v1/charts/best_ever"), bareEnv());
    expect(response.status).toBe(404);
  });

  it("404s a malformed title id", async () => {
    const response = await route(req("/v1/titles/tt_zzz/rating"), bareEnv());
    expect(response.status).toBe(404);
  });

  it("422s an out-of-range chart limit", async () => {
    const response = await route(req("/v1/charts/top_movies?limit=999"), bareEnv());
    expect(response.status).toBe(422);
  });
});

describe("rating writes", () => {
  it("401s a PUT without an actor", async () => {
    const response = await route(req(`/v1/titles/${TITLE_ID}/rating`, "PUT", { value: 8 }), bareEnv());
    expect(response.status).toBe(401);
  });

  it("401s a DELETE without an actor", async () => {
    const response = await route(req(`/v1/titles/${TITLE_ID}/rating`, "DELETE"), bareEnv());
    expect(response.status).toBe(401);
  });

  it.each([0, 11, -1, 5.5, "8", null])("422s the value %p", async (value) => {
    const response = await route(
      req(`/v1/titles/${TITLE_ID}/rating`, "PUT", { value }, true),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });

  it.each([1, 5, 10])("accepts the boundary value %p", async (value) => {
    // 503 (no database) rather than 422 proves validation passed.
    const response = await route(
      req(`/v1/titles/${TITLE_ID}/rating`, "PUT", { value }, true),
      bareEnv(),
    );
    expect(response.status).toBe(503);
  });

  it("422s a malformed body", async () => {
    const request = new Request(`https://ratings.internal/v1/titles/${TITLE_ID}/rating`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-actor-subject-id": "usr_33333333333333333333333333333333",
        "x-actor-subject-type": "user",
      },
      body: "{oops",
    });
    const response = await route(request, bareEnv());
    expect(response.status).toBe(422);
  });

  it("401s an actor id that is not a decodable subject", async () => {
    const request = new Request(`https://ratings.internal/v1/titles/${TITLE_ID}/rating`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-actor-subject-id": "usr_not-hex",
        "x-actor-subject-type": "user",
      },
      body: JSON.stringify({ value: 8 }),
    });
    const response = await route(request, bareEnv());
    expect(response.status).toBe(401);
  });

  it("405s an unsupported method on the rating route", async () => {
    const response = await route(req(`/v1/titles/${TITLE_ID}/rating`, "POST", {}, true), bareEnv());
    expect(response.status).toBe(405);
  });
});

describe("personal routes", () => {
  it("401s /v1/me/ratings without an actor", async () => {
    expect((await route(req("/v1/me/ratings"), bareEnv())).status).toBe(401);
    expect((await route(req(`/v1/me/ratings/${TITLE_ID}`), bareEnv())).status).toBe(401);
  });

  it("routes with an actor", async () => {
    const response = await route(req("/v1/me/ratings", "GET", undefined, true), bareEnv());
    expect(response.status).toBe(503);
  });

  it("422s an out-of-range page limit", async () => {
    const response = await route(
      req("/v1/me/ratings?limit=500", "GET", undefined, true),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });

  it("422s a negative offset", async () => {
    const response = await route(
      req("/v1/me/ratings?offset=-1", "GET", undefined, true),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });
});

describe("chart recompute", () => {
  it("422s an unknown chart", async () => {
    const response = await route(
      req("/v1/internal/ratings/charts/recompute", "POST", { chart: "nope" }),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });

  it("405s a GET", async () => {
    const response = await route(req("/v1/internal/ratings/charts/recompute"), bareEnv());
    expect(response.status).toBe(405);
  });

  it("accepts a known chart", async () => {
    const response = await route(
      req("/v1/internal/ratings/charts/recompute", "POST", { chart: "top_movies" }),
      bareEnv(),
    );
    expect(response.status).toBe(503);
  });
});

describe("serialization", () => {
  function aggregate(counts: number[]): TitleAggregate {
    const voteCount = counts.reduce((a, b) => a + b, 0);
    const sum = counts.reduce((acc, count, i) => acc + count * (i + 1), 0);
    return {
      titleId: TITLE_UUID,
      voteCount,
      average: voteCount > 0 ? Math.round((sum / voteCount) * 100) / 100 : null,
      distribution: { buckets: counts.map((count, i) => ({ value: i + 1, count })) },
      updatedAt: null,
    };
  }

  it("renders the public title id", () => {
    expect(toPublicRating(aggregate([0, 0, 0, 0, 0, 0, 0, 1, 0, 0])).titleId).toBe(TITLE_ID);
  });

  it("precomputes each bucket's share", () => {
    const rating = toPublicRating(aggregate([1, 0, 0, 0, 0, 0, 0, 0, 0, 3]));
    expect(rating.voteCount).toBe(4);
    expect(rating.distribution[0]!.share).toBe(0.25);
    expect(rating.distribution[9]!.share).toBe(0.75);
  });

  it("returns a flat histogram rather than NaN for an unrated title", () => {
    const rating = toPublicRating(aggregate(Array(10).fill(0)));
    expect(rating.average).toBeNull();
    expect(rating.distribution.every((b) => b.share === 0)).toBe(true);
  });

  it("computes a delta that is negative when a title moved up", () => {
    const entry = toPublicChartEntry({ rank: 3, previousRank: 7, titleId: TITLE_UUID, score: 8.2 });
    expect(entry.delta).toBe(-4);
  });

  it("has no delta for a new entry", () => {
    const entry = toPublicChartEntry({ rank: 1, previousRank: null, titleId: TITLE_UUID, score: 9 });
    expect(entry.delta).toBeNull();
  });
});
