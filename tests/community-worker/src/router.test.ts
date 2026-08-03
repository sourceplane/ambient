import {
  contributionPublicId,
  factPublicId,
  route,
  toPublicAward,
  toPublicContribution,
  toPublicFact,
} from "@community-worker/router";
import type { Env } from "@community-worker/env";
import type { AwardNomination, Contribution, TitleFact } from "@saas/db/community";
import { FACT_KINDS, PARENTS_GUIDE_CATEGORIES, SEVERITIES } from "@saas/db/community";

const TITLE_UUID = "11111111-1111-1111-1111-111111111111";
const NAME_UUID = "22222222-2222-2222-2222-222222222222";
const FACT_UUID = "33333333-3333-3333-3333-333333333333";
const CONTRIB_UUID = "44444444-4444-4444-4444-444444444444";
const USER_UUID = "55555555-5555-5555-5555-555555555555";
const TITLE_ID = `tt_${TITLE_UUID.replace(/-/g, "")}`;
const NAME_ID = `nm_${NAME_UUID.replace(/-/g, "")}`;
const FACT_ID = `fa_${FACT_UUID.replace(/-/g, "")}`;
const CONTRIB_ID = `cb_${CONTRIB_UUID.replace(/-/g, "")}`;
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
  return new Request(`https://community.internal${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("public reads", () => {
  it.each([
    `/v1/titles/${TITLE_ID}/awards`,
    `/v1/names/${NAME_ID}/awards`,
    "/v1/awards/academy-awards/1995",
    `/v1/titles/${TITLE_ID}/facts`,
    `/v1/titles/${TITLE_ID}/parents-guide`,
    `/v1/titles/${TITLE_ID}/faq`,
    "/v1/news",
  ])("routes %s without a session", async (path) => {
    const response = await route(req(path), bareEnv());
    expect(response.status).toBe(503);
  });

  it("404s a malformed title id", async () => {
    expect((await route(req("/v1/titles/tt_zzz/facts"), bareEnv())).status).toBe(404);
  });

  it("404s an unknown parents-guide category", async () => {
    const response = await route(
      req(`/v1/titles/${TITLE_ID}/parents-guide/nonsense/severity`, "PUT", { severity: "mild" }, true),
      bareEnv(),
    );
    expect(response.status).toBe(404);
  });

  it.each(PARENTS_GUIDE_CATEGORIES)("accepts the %s category", async (category) => {
    const response = await route(
      req(`/v1/titles/${TITLE_ID}/parents-guide/${category}/severity`, "PUT", { severity: "mild" }, true),
      bareEnv(),
    );
    expect(response.status).toBe(503);
  });

  it("422s an unknown fact kind filter", async () => {
    const response = await route(req(`/v1/titles/${TITLE_ID}/facts?kind=rumour`), bareEnv());
    expect(response.status).toBe(422);
  });

  it.each(FACT_KINDS)("accepts the %s fact kind filter", async (kind) => {
    const response = await route(req(`/v1/titles/${TITLE_ID}/facts?kind=${kind}`), bareEnv());
    expect(response.status).toBe(503);
  });

  it("422s a news entity that is neither a title nor a name", async () => {
    const response = await route(req("/v1/news?entity=co_1234"), bareEnv());
    expect(response.status).toBe(422);
  });
});

describe("writes require a session", () => {
  it.each([
    [`/v1/titles/${TITLE_ID}/facts`, "POST"],
    [`/v1/facts/${FACT_ID}/vote`, "POST"],
    [`/v1/titles/${TITLE_ID}/parents-guide/profanity/severity`, "PUT"],
    ["/v1/contributions", "POST"],
    ["/v1/me/contributions", "GET"],
    [`/v1/contributions/${CONTRIB_ID}/withdraw`, "POST"],
    ["/v1/moderation/contributions", "GET"],
    [`/v1/moderation/contributions/${CONTRIB_ID}/decision`, "POST"],
  ])("401s %s %s without an actor", async (path, method) => {
    const response = await route(
      req(path, method, method === "GET" ? undefined : {}),
      bareEnv(),
    );
    expect(response.status).toBe(401);
  });
});

describe("fact submission", () => {
  const path = `/v1/titles/${TITLE_ID}/facts`;

  it("requires a kind and a body", async () => {
    const response = await route(req(path, "POST", {}, true), bareEnv());
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { details: { fields: Record<string, string[]> } } };
    expect(Object.keys(body.error.details.fields).sort()).toEqual(["body", "kind"]);
  });

  it("rejects an unknown kind", async () => {
    const response = await route(
      req(path, "POST", { kind: "rumour", body: "text" }, true),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });

  it("rejects an over-long body", async () => {
    const response = await route(
      req(path, "POST", { kind: "trivia", body: "x".repeat(10_001) }, true),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });

  it("accepts a structured quote", async () => {
    const response = await route(
      req(
        path,
        "POST",
        {
          kind: "quote",
          body: "Louise and Ian",
          quoteLines: [{ speaker: "Louise", line: "Now that's a proper introduction." }],
        },
        true,
      ),
      bareEnv(),
    );
    expect(response.status).toBe(503);
  });

  it("rejects a quote line that is empty", async () => {
    const response = await route(
      req(path, "POST", { kind: "quote", body: "x", quoteLines: [{ line: "  " }] }, true),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });

  it("rejects an absurd number of quote lines", async () => {
    const response = await route(
      req(
        path,
        "POST",
        { kind: "quote", body: "x", quoteLines: Array.from({ length: 51 }, () => ({ line: "a" })) },
        true,
      ),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });
});

describe("severity voting", () => {
  it.each(SEVERITIES)("accepts severity %s", async (severity) => {
    const response = await route(
      req(`/v1/titles/${TITLE_ID}/parents-guide/violence_gore/severity`, "PUT", { severity }, true),
      bareEnv(),
    );
    expect(response.status).toBe(503);
  });

  it("rejects an unknown severity", async () => {
    const response = await route(
      req(`/v1/titles/${TITLE_ID}/parents-guide/violence_gore/severity`, "PUT", { severity: "extreme" }, true),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });
});

describe("contributions", () => {
  it("rejects an unknown target type", async () => {
    const response = await route(
      req("/v1/contributions", "POST", { targetType: "planet", operation: "create" }, true),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });

  it("requires a target for an update", async () => {
    const response = await route(
      req("/v1/contributions", "POST", { targetType: "title", operation: "update" }, true),
      bareEnv(),
    );
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { details: { fields: Record<string, string[]> } } };
    expect(body.error.details.fields.targetId).toBeDefined();
  });

  it("accepts a create with no target", async () => {
    const response = await route(
      req(
        "/v1/contributions",
        "POST",
        { targetType: "title", operation: "create", payload: { primaryTitle: "New" } },
        true,
      ),
      bareEnv(),
    );
    expect(response.status).toBe(503);
  });

  it("rejects an oversized payload", async () => {
    const response = await route(
      req(
        "/v1/contributions",
        "POST",
        { targetType: "title", operation: "create", payload: { blob: "x".repeat(100_001) } },
        true,
      ),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });

  it("rejects a decision that is neither approved nor rejected", async () => {
    const response = await route(
      req(`/v1/moderation/contributions/${CONTRIB_ID}/decision`, "POST", { state: "maybe" }, true),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });
});

describe("serialization", () => {
  const fact: TitleFact = {
    id: FACT_UUID,
    titleId: TITLE_UUID,
    kind: "quote",
    subkind: null,
    body: "A quote",
    hasSpoilers: false,
    interestingVotes: 12,
    totalVotes: 20,
    state: "published",
    contributorUserId: USER_UUID,
    ordering: 0,
    quoteLines: [{ ordering: 0, speaker: "Louise", line: "Hello." }],
  };

  it("renders public ids and never the raw uuids", () => {
    const out = toPublicFact(fact);
    expect(out.id).toBe(FACT_ID);
    expect(JSON.stringify(out)).not.toContain(FACT_UUID);
  });

  it("does not leak the contributor or the moderation state on a fact", () => {
    const out = toPublicFact(fact);
    expect(out).not.toHaveProperty("contributorUserId");
    expect(out).not.toHaveProperty("state");
  });

  it("keeps quote dialogue structured", () => {
    expect(toPublicFact(fact).quoteLines).toEqual([{ speaker: "Louise", line: "Hello." }]);
  });

  it("never echoes a contribution's proposed payload", () => {
    const contribution: Contribution = {
      id: CONTRIB_UUID,
      contributorUserId: USER_UUID,
      targetType: "title",
      targetId: TITLE_UUID,
      operation: "update",
      payload: { primaryTitle: "Unmoderated edit" },
      state: "pending",
      submittedAt: NOW,
      decidedAt: null,
      decisionNote: null,
    };
    const out = toPublicContribution(contribution);
    expect(out.id).toBe(CONTRIB_ID);
    expect(out).not.toHaveProperty("payload");
    expect(JSON.stringify(out)).not.toContain("Unmoderated edit");
  });

  it("renders an award with whichever subject it has", () => {
    const base: AwardNomination = {
      id: FACT_UUID,
      bodySlug: "academy-awards",
      bodyName: "Academy Awards",
      year: 2017,
      categoryName: "Best Sound Editing",
      titleId: TITLE_UUID,
      personId: null,
      isWinner: true,
      note: null,
    };
    const titleAward = toPublicAward(base);
    expect(titleAward.titleId).toBe(TITLE_ID);
    expect(titleAward.nameId).toBeNull();

    const personAward = toPublicAward({ ...base, titleId: null, personId: NAME_UUID });
    expect(personAward.titleId).toBeNull();
    expect(personAward.nameId).toBe(NAME_ID);
  });

  it("round-trips the fact and contribution id helpers", () => {
    expect(factPublicId(FACT_UUID)).toBe(FACT_ID);
    expect(contributionPublicId(CONTRIB_UUID)).toBe(CONTRIB_ID);
  });
});
