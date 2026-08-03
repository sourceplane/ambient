import {
  parseReviewPublicId,
  reviewPublicId,
  route,
  toModeratedReview,
  toPublicMetascore,
  toPublicReview,
} from "@reviews-worker/router";
import type { Env } from "@reviews-worker/env";
import type { Metascore, UserReview } from "@saas/db/reviews";
import { METASCORE_MIXED_MIN, METASCORE_POSITIVE_MIN } from "@saas/db/reviews";

const TITLE_UUID = "11111111-1111-1111-1111-111111111111";
const REVIEW_UUID = "22222222-2222-2222-2222-222222222222";
const USER_UUID = "33333333-3333-3333-3333-333333333333";
const TITLE_ID = `tt_${TITLE_UUID.replace(/-/g, "")}`;
const REVIEW_ID = `rv_${REVIEW_UUID.replace(/-/g, "")}`;
const USER_ID = `usr_${USER_UUID.replace(/-/g, "")}`;
const NOW = new Date("2026-08-03T12:00:00.000Z");

function bareEnv(): Env {
  return { ENVIRONMENT: "test" };
}

function req(path: string, method = "GET", body?: unknown, actor = false): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (actor) {
    headers.set("x-actor-subject-id", USER_ID);
    headers.set("x-actor-subject-type", "user");
  }
  return new Request(`https://reviews.internal${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const review: UserReview = {
  id: REVIEW_UUID,
  titleId: TITLE_UUID,
  userId: USER_UUID,
  headline: "A quiet masterpiece",
  body: "Long form thoughts.",
  rating: 9,
  hasSpoilers: false,
  state: "published",
  helpfulCount: 12,
  unhelpfulCount: 1,
  submittedAt: NOW,
  updatedAt: NOW,
  moderatedAt: null,
  decisionNote: null,
};

describe("public ids", () => {
  it("round-trips a review id", () => {
    expect(reviewPublicId(REVIEW_UUID)).toBe(REVIEW_ID);
    expect(parseReviewPublicId(REVIEW_ID)).toBe(REVIEW_UUID);
  });

  it("rejects a wrong prefix", () => {
    expect(parseReviewPublicId(TITLE_ID)).toBeNull();
  });
});

describe("public reads", () => {
  it.each([
    `/v1/titles/${TITLE_ID}/reviews`,
    `/v1/titles/${TITLE_ID}/critic-reviews`,
    `/v1/titles/${TITLE_ID}/metascore`,
    `/v1/reviews/${REVIEW_ID}`,
    `/v1/users/${USER_ID}/reviews`,
  ])("routes %s without a session", async (path) => {
    const response = await route(req(path), bareEnv());
    expect(response.status).toBe(503);
  });

  it("422s an unknown sort key", async () => {
    const response = await route(req(`/v1/titles/${TITLE_ID}/reviews?sort=chaos`), bareEnv());
    expect(response.status).toBe(422);
  });

  it.each(["helpfulness", "date", "rating"])("accepts the %s sort key", async (sort) => {
    const response = await route(req(`/v1/titles/${TITLE_ID}/reviews?sort=${sort}`), bareEnv());
    expect(response.status).toBe(503);
  });

  it("422s an over-cap page size", async () => {
    const response = await route(req(`/v1/titles/${TITLE_ID}/reviews?limit=500`), bareEnv());
    expect(response.status).toBe(422);
  });

  it("404s a malformed review id", async () => {
    expect((await route(req("/v1/reviews/rv_zzz"), bareEnv())).status).toBe(404);
  });
});

describe("writes require a session", () => {
  it.each([
    [`/v1/titles/${TITLE_ID}/reviews`, "POST"],
    [`/v1/reviews/${REVIEW_ID}`, "PATCH"],
    [`/v1/reviews/${REVIEW_ID}`, "DELETE"],
    [`/v1/reviews/${REVIEW_ID}/vote`, "POST"],
    [`/v1/reviews/${REVIEW_ID}/vote`, "DELETE"],
    ["/v1/moderation/reviews", "GET"],
    [`/v1/moderation/reviews/${REVIEW_ID}/decision`, "POST"],
  ])("401s %s %s without an actor", async (path, method) => {
    const response = await route(
      req(path, method, method === "GET" || method === "DELETE" ? undefined : {}),
      bareEnv(),
    );
    expect(response.status).toBe(401);
  });
});

describe("review submission validation", () => {
  const path = `/v1/titles/${TITLE_ID}/reviews`;

  it("requires a headline and a body", async () => {
    const response = await route(req(path, "POST", {}, true), bareEnv());
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { details: { fields: Record<string, string[]> } } };
    expect(Object.keys(body.error.details.fields).sort()).toEqual(["body", "headline"]);
  });

  it("rejects a whitespace-only headline", async () => {
    const response = await route(
      req(path, "POST", { headline: "   ", body: "text" }, true),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });

  it("rejects an over-long body", async () => {
    const response = await route(
      req(path, "POST", { headline: "ok", body: "x".repeat(20_001) }, true),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });

  it.each([0, 11, 5.5, "9"])("rejects the rating %p", async (rating) => {
    const response = await route(
      req(path, "POST", { headline: "ok", body: "text", rating }, true),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });

  it("accepts a review with no rating at all", async () => {
    const response = await route(
      req(path, "POST", { headline: "ok", body: "text" }, true),
      bareEnv(),
    );
    expect(response.status).toBe(503);
  });

  it("rejects a non-boolean spoiler flag", async () => {
    const response = await route(
      req(path, "POST", { headline: "ok", body: "text", hasSpoilers: "yes" }, true),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });
});

describe("voting", () => {
  it("requires a boolean helpful flag", async () => {
    const response = await route(
      req(`/v1/reviews/${REVIEW_ID}/vote`, "POST", { helpful: "yes" }, true),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });

  it("accepts an explicit false", async () => {
    const response = await route(
      req(`/v1/reviews/${REVIEW_ID}/vote`, "POST", { helpful: false }, true),
      bareEnv(),
    );
    expect(response.status).toBe(503);
  });

  it("405s an unsupported method on the vote route", async () => {
    const response = await route(
      req(`/v1/reviews/${REVIEW_ID}/vote`, "PATCH", {}, true),
      bareEnv(),
    );
    expect(response.status).toBe(405);
  });
});

describe("moderation", () => {
  it("rejects a decision that is not published or rejected", async () => {
    const response = await route(
      req(`/v1/moderation/reviews/${REVIEW_ID}/decision`, "POST", { state: "deleted" }, true),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });

  it("accepts a rejection with a note", async () => {
    const response = await route(
      req(
        `/v1/moderation/reviews/${REVIEW_ID}/decision`,
        "POST",
        { state: "rejected", note: "spoilers unmarked" },
        true,
      ),
      bareEnv(),
    );
    expect(response.status).toBe(503);
  });
});

describe("serialization", () => {
  it("renders public ids and never the raw uuids", () => {
    const out = toPublicReview(review);
    expect(out.id).toBe(REVIEW_ID);
    expect(out.titleId).toBe(TITLE_ID);
    expect(out.authorId).toBe(USER_ID);
    expect(JSON.stringify(out)).not.toContain(REVIEW_UUID);
  });

  it("does not expose moderation fields on the public shape", () => {
    const out = toPublicReview({ ...review, state: "pending", decisionNote: "held" });
    expect(out).not.toHaveProperty("state");
    expect(out).not.toHaveProperty("decisionNote");
  });

  it("exposes them on the moderator shape", () => {
    const out = toModeratedReview({ ...review, state: "pending", decisionNote: "held" });
    expect(out.state).toBe("pending");
    expect(out.decisionNote).toBe("held");
  });
});

describe("metascore bands", () => {
  function score(value: number | null, criticCount = 10): Metascore {
    return {
      titleId: TITLE_UUID,
      metascore: value,
      criticCount,
      positiveCount: 0,
      mixedCount: 0,
      negativeCount: 0,
    };
  }

  it("has no band without a score", () => {
    expect(toPublicMetascore(score(null, 0)).band).toBeNull();
  });

  it("bands at the published thresholds", () => {
    expect(toPublicMetascore(score(METASCORE_POSITIVE_MIN)).band).toBe("positive");
    expect(toPublicMetascore(score(METASCORE_POSITIVE_MIN - 1)).band).toBe("mixed");
    expect(toPublicMetascore(score(METASCORE_MIXED_MIN)).band).toBe("mixed");
    expect(toPublicMetascore(score(METASCORE_MIXED_MIN - 1)).band).toBe("negative");
  });

  it("bands the extremes", () => {
    expect(toPublicMetascore(score(100)).band).toBe("positive");
    expect(toPublicMetascore(score(0)).band).toBe("negative");
  });
});
