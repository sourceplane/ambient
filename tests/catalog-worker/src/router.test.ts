import { route } from "@catalog-worker/router";
import type { Env } from "@catalog-worker/env";
import {
  companyPublicId,
  creditPublicId,
  namePublicId,
  parseNamePublicId,
  parseTitlePublicId,
  titlePublicId,
} from "@catalog-worker/ids";

const TITLE_UUID = "11111111-1111-1111-1111-111111111111";
const NAME_UUID = "22222222-2222-2222-2222-222222222222";
const COMPANY_UUID = "33333333-3333-3333-3333-333333333333";
const CREDIT_UUID = "44444444-4444-4444-4444-444444444444";
const ORG_UUID = "55555555-5555-5555-5555-555555555555";

const TITLE_ID = titlePublicId(TITLE_UUID);
const NAME_ID = namePublicId(NAME_UUID);
const COMPANY_ID = companyPublicId(COMPANY_UUID);
const CREDIT_ID = creditPublicId(CREDIT_UUID);
const ORG_ID = `org_${ORG_UUID.replace(/-/g, "")}`;

/** No Hyperdrive, no service bindings: exercises routing and guards only. */
function bareEnv(overrides: Partial<Env> = {}): Env {
  return { ENVIRONMENT: "test", ...overrides };
}

function get(path: string): Request {
  return new Request(`https://catalog.internal${path}`, { method: "GET" });
}

function write(path: string, method: string, body?: unknown, actor = true): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (actor) {
    headers.set("x-actor-subject-id", "usr_1");
    headers.set("x-actor-subject-type", "user");
  }
  return new Request(`https://catalog.internal${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("public ids", () => {
  it("round-trips a title id", () => {
    expect(parseTitlePublicId(TITLE_ID)).toBe(TITLE_UUID);
  });

  it("round-trips a name id", () => {
    expect(parseNamePublicId(NAME_ID)).toBe(NAME_UUID);
  });

  it("rejects a title id with the wrong prefix", () => {
    expect(parseTitlePublicId(NAME_ID)).toBeNull();
  });

  it("rejects a malformed body", () => {
    expect(parseTitlePublicId("tt_not-hex")).toBeNull();
    expect(parseTitlePublicId("tt_")).toBeNull();
    expect(parseTitlePublicId("nonsense")).toBeNull();
  });
});

describe("health", () => {
  it("reports which bindings are configured", async () => {
    const response = await route(get("/health"), bareEnv());
    expect(response.status).toBe(200);
    const body = await json(response);
    const data = body.data as Record<string, unknown>;
    expect(data.service).toBe("catalog-worker");
    expect(data.checks).toEqual({
      database: { configured: false },
      membership: { configured: false },
      policy: { configured: false },
    });
  });

  it("does not answer health on a non-GET", async () => {
    const response = await route(
      new Request("https://catalog.internal/health", { method: "POST" }),
      bareEnv(),
    );
    expect(response.status).toBe(404);
  });
});

describe("public reads", () => {
  const READ_PATHS = [
    "/v1/titles",
    `/v1/titles/${TITLE_ID}`,
    `/v1/titles/${TITLE_ID}/credits`,
    `/v1/titles/${TITLE_ID}/akas`,
    `/v1/titles/${TITLE_ID}/release-dates`,
    `/v1/titles/${TITLE_ID}/certificates`,
    `/v1/titles/${TITLE_ID}/keywords`,
    `/v1/titles/${TITLE_ID}/companies`,
    `/v1/titles/${TITLE_ID}/technical`,
    `/v1/titles/${TITLE_ID}/box-office`,
    `/v1/titles/${TITLE_ID}/connections`,
    `/v1/titles/${TITLE_ID}/external-ids`,
    `/v1/titles/${TITLE_ID}/images`,
    `/v1/titles/${TITLE_ID}/videos`,
    `/v1/titles/${TITLE_ID}/seasons`,
    `/v1/titles/${TITLE_ID}/episodes`,
    "/v1/names",
    `/v1/names/${NAME_ID}`,
    `/v1/names/${NAME_ID}/credits`,
    `/v1/names/${NAME_ID}/known-for`,
    `/v1/names/${NAME_ID}/images`,
    `/v1/names/${NAME_ID}/videos`,
    `/v1/companies/${COMPANY_ID}`,
    `/v1/companies/${COMPANY_ID}/titles`,
    "/v1/keywords/time-travel",
    "/v1/keywords/time-travel/titles",
    "/v1/genres",
  ];

  it.each(READ_PATHS)("routes %s without a session", async (path) => {
    // With no database bound the handler answers 503 — the point is that it
    // reached a handler at all, i.e. no 401 and no 404.
    const response = await route(get(path), bareEnv());
    expect(response.status).toBe(503);
  });

  it("404s an unknown title sub-resource instead of reaching a handler", async () => {
    const response = await route(get(`/v1/titles/${TITLE_ID}/nonsense`), bareEnv());
    expect(response.status).toBe(404);
  });

  it("404s a malformed title id without touching the database", async () => {
    const response = await route(get("/v1/titles/tt_zzz"), bareEnv());
    expect(response.status).toBe(404);
  });

  it("404s a name id used where a title id belongs", async () => {
    const response = await route(get(`/v1/titles/${NAME_ID}`), bareEnv());
    expect(response.status).toBe(404);
  });

  it("404s a write attempt against a public read path", async () => {
    const response = await route(write("/v1/titles", "POST", {}), bareEnv());
    expect(response.status).toBe(404);
  });

  it("rejects an out-of-range page limit with 422", async () => {
    const response = await route(get("/v1/titles?limit=5000"), bareEnv());
    expect(response.status).toBe(422);
    const body = await json(response);
    expect((body.error as Record<string, unknown>).code).toBe("validation_failed");
  });

  it("rejects an unparseable cursor with 422", async () => {
    const response = await route(get("/v1/titles?cursor=%%%"), bareEnv());
    expect(response.status).toBe(422);
  });

  it("rejects a non-integer season filter with 422", async () => {
    const response = await route(get(`/v1/titles/${TITLE_ID}/episodes?season=abc`), bareEnv());
    expect(response.status).toBe(422);
  });

  it("404s a keyword slug that is not slug-shaped", async () => {
    const response = await route(get("/v1/keywords/NOT A SLUG"), bareEnv());
    expect(response.status).toBe(404);
  });
});

describe("curation guards", () => {
  const CURATION_PATHS: Array<[string, string]> = [
    [`/v1/organizations/${ORG_ID}/catalog/titles`, "POST"],
    [`/v1/organizations/${ORG_ID}/catalog/titles/${TITLE_ID}`, "PATCH"],
    [`/v1/organizations/${ORG_ID}/catalog/titles/${TITLE_ID}`, "DELETE"],
    [`/v1/organizations/${ORG_ID}/catalog/titles/${TITLE_ID}/credits`, "POST"],
    [`/v1/organizations/${ORG_ID}/catalog/titles/${TITLE_ID}/images`, "POST"],
    [`/v1/organizations/${ORG_ID}/catalog/titles/${TITLE_ID}/videos`, "POST"],
    [`/v1/organizations/${ORG_ID}/catalog/titles/${TITLE_ID}/episodes`, "POST"],
    [`/v1/organizations/${ORG_ID}/catalog/credits/${CREDIT_ID}`, "DELETE"],
    [`/v1/organizations/${ORG_ID}/catalog/names`, "POST"],
    [`/v1/organizations/${ORG_ID}/catalog/names/${NAME_ID}`, "PATCH"],
    [`/v1/organizations/${ORG_ID}/catalog/names/${NAME_ID}`, "DELETE"],
  ];

  it.each(CURATION_PATHS)("401s %s %s without an actor", async (path, method) => {
    const response = await route(write(path, method, {}, false), bareEnv());
    expect(response.status).toBe(401);
  });

  it.each(CURATION_PATHS)(
    "503s %s %s when the policy bindings are absent",
    async (path, method) => {
      // Never 200: with no membership/policy binding the permission check
      // cannot succeed, so the write must not proceed.
      const response = await route(write(path, method, {}), bareEnv());
      expect(response.status).toBe(503);
    },
  );

  it("405s an unsupported method on a curation collection", async () => {
    const response = await route(
      write(`/v1/organizations/${ORG_ID}/catalog/titles`, "PUT", {}),
      bareEnv(),
    );
    expect(response.status).toBe(405);
  });

  it("404s a malformed org id before authenticating", async () => {
    const response = await route(
      write("/v1/organizations/org_zzz/catalog/titles", "POST", {}, false),
      bareEnv(),
    );
    expect(response.status).toBe(404);
  });

  it("404s an unknown curation sub-resource", async () => {
    const response = await route(
      write(`/v1/organizations/${ORG_ID}/catalog/titles/${TITLE_ID}/nonsense`, "POST", {}),
      bareEnv(),
    );
    expect(response.status).toBe(404);
  });

  it("keeps curation paths out of the public read class", async () => {
    // A GET on a curation path is not a public read: it must not fall through
    // to a handler that would answer without authentication.
    const response = await route(get(`/v1/organizations/${ORG_ID}/catalog/titles`), bareEnv());
    expect(response.status).toBe(405);
  });
});
