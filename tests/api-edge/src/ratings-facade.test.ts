import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  handleRatingsRoute,
  isPersonalRatingsRoute,
  isRatingsRoute,
} from "@api-edge/ratings-facade";
import { isCatalogRoute } from "@api-edge/catalog-facade";
import { __resetRateLimitMemoryForTest } from "@api-edge/rate-limit";

const __dirname = dirname(fileURLToPath(import.meta.url));

function stripJsoncComments(text: string): string {
  return text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const TITLE_ID = "tt_11111111111111111111111111111111";
const NAME_ID = "nm_22222222222222222222222222222222";

interface FetchCall {
  url: string;
  init: RequestInit;
}

function createFetcher(status = 200): { fetcher: Fetcher; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetcher = {
    fetch(input: string | Request | URL, init?: RequestInit): Promise<Response> {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push({ url, init: init ?? {} });
      return Promise.resolve(
        new Response(JSON.stringify({ data: {}, meta: {} }), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );
    },
    connect() {
      throw new Error("not implemented");
    },
  } as unknown as Fetcher;
  return { fetcher, calls };
}

beforeEach(() => {
  __resetRateLimitMemoryForTest();
});

describe("ratings route classification", () => {
  it.each([
    `/v1/titles/${TITLE_ID}/rating`,
    `/v1/titles/${TITLE_ID}/rating/demographics`,
    `/v1/titles/${TITLE_ID}/popularity`,
    `/v1/names/${NAME_ID}/popularity`,
    "/v1/charts/top_movies",
    "/v1/me/ratings",
    `/v1/me/ratings/${TITLE_ID}`,
  ])("claims %s", (path) => {
    expect(isRatingsRoute(path)).toBe(true);
  });

  it("does not claim the internal recompute seam", () => {
    expect(isRatingsRoute("/v1/internal/ratings/charts/recompute")).toBe(false);
  });

  it("does not overlap with the catalog facade", () => {
    // Both hang off /v1/titles/:id/… — the catalog facade must not swallow
    // rating or popularity, and this one must not claim catalog sub-resources.
    for (const path of [
      `/v1/titles/${TITLE_ID}/rating`,
      `/v1/titles/${TITLE_ID}/popularity`,
    ]) {
      expect(isRatingsRoute(path)).toBe(true);
      expect(isCatalogRoute(path)).toBe(false);
    }
    for (const path of [
      `/v1/titles/${TITLE_ID}/credits`,
      `/v1/titles/${TITLE_ID}/images`,
      `/v1/names/${NAME_ID}/known-for`,
    ]) {
      expect(isCatalogRoute(path)).toBe(true);
      expect(isRatingsRoute(path)).toBe(false);
    }
  });

  it("marks only /v1/me routes as personal", () => {
    expect(isPersonalRatingsRoute("/v1/me/ratings")).toBe(true);
    expect(isPersonalRatingsRoute(`/v1/me/ratings/${TITLE_ID}`)).toBe(true);
    expect(isPersonalRatingsRoute(`/v1/titles/${TITLE_ID}/rating`)).toBe(false);
  });
});

describe("public rating reads", () => {
  it("forwards without a session and attaches a short cache window", async () => {
    const { fetcher, calls } = createFetcher();
    const response = await handleRatingsRoute(
      new Request(`https://api.test/v1/titles/${TITLE_ID}/rating`),
      { ENVIRONMENT: "test", RATINGS_WORKER: fetcher },
      "req_1",
      `/v1/titles/${TITLE_ID}/rating`,
    );

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=30, stale-while-revalidate=300",
    );
  });

  it("caches a chart for longer than an aggregate", async () => {
    const { fetcher } = createFetcher();
    const response = await handleRatingsRoute(
      new Request("https://api.test/v1/charts/top_movies"),
      { ENVIRONMENT: "test", RATINGS_WORKER: fetcher },
      "req_1",
      "/v1/charts/top_movies",
    );
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=300, stale-while-revalidate=3600",
    );
  });

  it("never forwards actor headers on a public read", async () => {
    const { fetcher, calls } = createFetcher();
    await handleRatingsRoute(
      new Request(`https://api.test/v1/titles/${TITLE_ID}/rating`, {
        headers: { authorization: "Bearer token" },
      }),
      { ENVIRONMENT: "test", RATINGS_WORKER: fetcher },
      "req_1",
      `/v1/titles/${TITLE_ID}/rating`,
    );
    const headers = new Headers(calls[0]!.init.headers as HeadersInit);
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("x-actor-subject-id")).toBeNull();
  });

  it("does not cache a downstream error", async () => {
    const { fetcher } = createFetcher(404);
    const response = await handleRatingsRoute(
      new Request(`https://api.test/v1/titles/${TITLE_ID}/rating`),
      { ENVIRONMENT: "test", RATINGS_WORKER: fetcher },
      "req_1",
      `/v1/titles/${TITLE_ID}/rating`,
    );
    expect(response.headers.get("cache-control")).toBeNull();
  });

  it("503s when the binding is absent", async () => {
    const response = await handleRatingsRoute(
      new Request("https://api.test/v1/charts/top_movies"),
      { ENVIRONMENT: "test" },
      "req_1",
      "/v1/charts/top_movies",
    );
    expect(response.status).toBe(503);
  });
});

describe("personal and mutating routes", () => {
  it("401s a rating write with no bearer token", async () => {
    const { fetcher, calls } = createFetcher();
    const response = await handleRatingsRoute(
      new Request(`https://api.test/v1/titles/${TITLE_ID}/rating`, {
        method: "PUT",
        body: JSON.stringify({ value: 8 }),
      }),
      { ENVIRONMENT: "test", RATINGS_WORKER: fetcher, IDENTITY_WORKER: fetcher },
      "req_1",
      `/v1/titles/${TITLE_ID}/rating`,
    );
    expect(response.status).toBe(401);
    expect(calls.filter((c) => c.url.includes("/rating"))).toHaveLength(0);
  });

  it("401s a personal read with no bearer token", async () => {
    const { fetcher } = createFetcher();
    const response = await handleRatingsRoute(
      new Request("https://api.test/v1/me/ratings"),
      { ENVIRONMENT: "test", RATINGS_WORKER: fetcher, IDENTITY_WORKER: fetcher },
      "req_1",
      "/v1/me/ratings",
    );
    expect(response.status).toBe(401);
  });

  it("405s a write to a personal route", async () => {
    const { fetcher } = createFetcher();
    const response = await handleRatingsRoute(
      new Request("https://api.test/v1/me/ratings", { method: "POST" }),
      { ENVIRONMENT: "test", RATINGS_WORKER: fetcher, IDENTITY_WORKER: fetcher },
      "req_1",
      "/v1/me/ratings",
    );
    expect(response.status).toBe(405);
  });

  it("405s a write to a chart", async () => {
    const { fetcher } = createFetcher();
    const response = await handleRatingsRoute(
      new Request("https://api.test/v1/charts/top_movies", { method: "PUT" }),
      { ENVIRONMENT: "test", RATINGS_WORKER: fetcher, IDENTITY_WORKER: fetcher },
      "req_1",
      "/v1/charts/top_movies",
    );
    expect(response.status).toBe(405);
  });
});

describe("binding verification config", () => {
  const raw = readFileSync(
    resolve(__dirname, "../../../apps/api-edge/wrangler.template.jsonc"),
    "utf8",
  );
  const config = JSON.parse(stripJsoncComments(raw)) as {
    env: Record<string, { services?: Array<{ binding: string; service: string }> }>;
  };

  it.each(["stage", "prod"])("%s binds RATINGS_WORKER to its own environment", (env) => {
    const binding = (config.env[env]?.services ?? []).find((s) => s.binding === "RATINGS_WORKER");
    expect(binding).toBeDefined();
    expect(binding!.service).toBe(`ambient-ratings-worker-${env}`);
  });
});
