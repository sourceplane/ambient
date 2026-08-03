import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cachePolicyFor,
  handleCatalogRoute,
  isCatalogCurationRoute,
  isCatalogPublicRoute,
  isCatalogRoute,
  matchesIfNoneMatch,
} from "@api-edge/catalog-facade";
import { __resetRateLimitMemoryForTest } from "@api-edge/rate-limit";

const __dirname = dirname(fileURLToPath(import.meta.url));

function stripJsoncComments(text: string): string {
  return text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

interface FetchCall {
  url: string;
  init: RequestInit;
}

function createCatalogFetcher(body: unknown = { data: { genres: [] }, meta: {} }, status = 200): {
  fetcher: Fetcher;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetcher = {
    fetch(input: string | Request | URL, init?: RequestInit): Promise<Response> {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push({ url, init: init ?? {} });
      return Promise.resolve(
        new Response(JSON.stringify(body), {
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

const ORG_ID = "org_55555555555555555555555555555555";
const TITLE_ID = "tt_11111111111111111111111111111111";

beforeEach(() => {
  __resetRateLimitMemoryForTest();
});

describe("catalog route classification", () => {
  const PUBLIC = [
    "/v1/titles",
    `/v1/titles/${TITLE_ID}`,
    `/v1/titles/${TITLE_ID}/credits`,
    `/v1/titles/${TITLE_ID}/box-office`,
    "/v1/names",
    "/v1/names/nm_22222222222222222222222222222222",
    "/v1/names/nm_22222222222222222222222222222222/known-for",
    "/v1/companies/co_33333333333333333333333333333333",
    "/v1/companies/co_33333333333333333333333333333333/titles",
    "/v1/keywords/time-travel",
    "/v1/keywords/time-travel/titles",
    "/v1/genres",
  ];

  it.each(PUBLIC)("classifies %s as a public read", (path) => {
    expect(isCatalogPublicRoute(path)).toBe(true);
    expect(isCatalogCurationRoute(path)).toBe(false);
    expect(isCatalogRoute(path)).toBe(true);
  });

  it.each([
    `/v1/organizations/${ORG_ID}/catalog/titles`,
    `/v1/organizations/${ORG_ID}/catalog/titles/${TITLE_ID}`,
    `/v1/organizations/${ORG_ID}/catalog/titles/${TITLE_ID}/credits`,
    `/v1/organizations/${ORG_ID}/catalog/names`,
  ])("classifies %s as curation, never public", (path) => {
    expect(isCatalogCurationRoute(path)).toBe(true);
    expect(isCatalogPublicRoute(path)).toBe(false);
  });

  it("does not claim routes owned by other facades", () => {
    for (const path of [
      "/v1/organizations",
      `/v1/organizations/${ORG_ID}`,
      `/v1/organizations/${ORG_ID}/projects`,
      "/v1/auth/session",
      "/v1/health",
    ]) {
      expect(isCatalogRoute(path)).toBe(false);
    }
  });
});

describe("cache policy", () => {
  it("gives core records a short revalidation window", () => {
    expect(cachePolicyFor(`/v1/titles/${TITLE_ID}`)).toEqual({
      maxAge: 60,
      staleWhileRevalidate: 600,
    });
  });

  it("gives reference lists a long one", () => {
    expect(cachePolicyFor(`/v1/titles/${TITLE_ID}/credits`)).toEqual({
      maxAge: 300,
      staleWhileRevalidate: 3600,
    });
    expect(cachePolicyFor("/v1/genres").maxAge).toBe(300);
  });
});

describe("if-none-match matching", () => {
  it("matches an exact tag", () => {
    expect(matchesIfNoneMatch('"abc"', '"abc"')).toBe(true);
  });

  it("matches a tag a cache weakened on the way back", () => {
    expect(matchesIfNoneMatch('W/"abc"', '"abc"')).toBe(true);
  });

  it("matches one entry in a list", () => {
    expect(matchesIfNoneMatch('"zzz", "abc"', '"abc"')).toBe(true);
  });

  it("matches the wildcard", () => {
    expect(matchesIfNoneMatch("*", '"abc"')).toBe(true);
  });

  it("does not match a different tag or an absent header", () => {
    expect(matchesIfNoneMatch('"zzz"', '"abc"')).toBe(false);
    expect(matchesIfNoneMatch(null, '"abc"')).toBe(false);
  });
});

describe("public reads at the edge", () => {
  it("forwards without requiring a session", async () => {
    const { fetcher, calls } = createCatalogFetcher();
    const response = await handleCatalogRoute(
      new Request("https://api.test/v1/genres"),
      { ENVIRONMENT: "test", CATALOG_WORKER: fetcher },
      "req_1",
      "/v1/genres",
    );

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/v1/genres");
  });

  it("never forwards actor headers on a public read", async () => {
    const { fetcher, calls } = createCatalogFetcher();
    const request = new Request("https://api.test/v1/genres", {
      headers: { authorization: "Bearer sps_ses_whatever" },
    });
    await handleCatalogRoute(request, { ENVIRONMENT: "test", CATALOG_WORKER: fetcher }, "req_1", "/v1/genres");

    const headers = new Headers(calls[0]!.init.headers as HeadersInit);
    expect(headers.get("x-actor-subject-id")).toBeNull();
    expect(headers.get("authorization")).toBeNull();
  });

  it("preserves the query string when forwarding", async () => {
    const { fetcher, calls } = createCatalogFetcher();
    await handleCatalogRoute(
      new Request("https://api.test/v1/titles?kind=movie&limit=20"),
      { ENVIRONMENT: "test", CATALOG_WORKER: fetcher },
      "req_1",
      "/v1/titles",
    );
    expect(calls[0]!.url).toContain("kind=movie");
    expect(calls[0]!.url).toContain("limit=20");
  });

  it("attaches a cache-control and a strong etag", async () => {
    const { fetcher } = createCatalogFetcher();
    const response = await handleCatalogRoute(
      new Request("https://api.test/v1/genres"),
      { ENVIRONMENT: "test", CATALOG_WORKER: fetcher },
      "req_1",
      "/v1/genres",
    );

    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=300, stale-while-revalidate=3600",
    );
    expect(response.headers.get("etag")).toMatch(/^"[0-9a-f]{32}"$/);
  });

  it("answers a matching if-none-match with 304 and no body", async () => {
    const { fetcher } = createCatalogFetcher();
    const env = { ENVIRONMENT: "test", CATALOG_WORKER: fetcher };

    const first = await handleCatalogRoute(
      new Request("https://api.test/v1/genres"),
      env,
      "req_1",
      "/v1/genres",
    );
    const etag = first.headers.get("etag")!;

    const second = await handleCatalogRoute(
      new Request("https://api.test/v1/genres", { headers: { "if-none-match": etag } }),
      env,
      "req_2",
      "/v1/genres",
    );

    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
    expect(second.headers.get("etag")).toBe(etag);
  });

  it("gives a different body a different etag", async () => {
    const a = createCatalogFetcher({ data: { genres: [{ slug: "drama" }] }, meta: {} });
    const b = createCatalogFetcher({ data: { genres: [{ slug: "comedy" }] }, meta: {} });

    const first = await handleCatalogRoute(
      new Request("https://api.test/v1/genres"),
      { ENVIRONMENT: "test", CATALOG_WORKER: a.fetcher },
      "req_1",
      "/v1/genres",
    );
    const second = await handleCatalogRoute(
      new Request("https://api.test/v1/genres"),
      { ENVIRONMENT: "test", CATALOG_WORKER: b.fetcher },
      "req_2",
      "/v1/genres",
    );

    expect(first.headers.get("etag")).not.toBe(second.headers.get("etag"));
  });

  it("does not cache a downstream error", async () => {
    const { fetcher } = createCatalogFetcher({ error: { code: "not_found" } }, 404);
    const response = await handleCatalogRoute(
      new Request(`https://api.test/v1/titles/${TITLE_ID}`),
      { ENVIRONMENT: "test", CATALOG_WORKER: fetcher },
      "req_1",
      `/v1/titles/${TITLE_ID}`,
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBeNull();
    expect(response.headers.get("etag")).toBeNull();
  });

  it("rejects a non-GET on a public read path", async () => {
    const { fetcher, calls } = createCatalogFetcher();
    const response = await handleCatalogRoute(
      new Request("https://api.test/v1/genres", { method: "POST" }),
      { ENVIRONMENT: "test", CATALOG_WORKER: fetcher },
      "req_1",
      "/v1/genres",
    );

    expect(response.status).toBe(405);
    expect(calls).toHaveLength(0);
  });

  it("503s when the catalog binding is absent", async () => {
    const response = await handleCatalogRoute(
      new Request("https://api.test/v1/genres"),
      { ENVIRONMENT: "test" },
      "req_1",
      "/v1/genres",
    );
    expect(response.status).toBe(503);
  });

  it("503s rather than throwing when the downstream fetch rejects", async () => {
    const fetcher = {
      fetch: () => Promise.reject(new Error("network error")),
      connect() {
        throw new Error("not implemented");
      },
    } as unknown as Fetcher;

    const response = await handleCatalogRoute(
      new Request("https://api.test/v1/genres"),
      { ENVIRONMENT: "test", CATALOG_WORKER: fetcher },
      "req_1",
      "/v1/genres",
    );
    expect(response.status).toBe(503);
  });
});

describe("curation at the edge", () => {
  it("401s without a bearer token", async () => {
    const { fetcher, calls } = createCatalogFetcher();
    const response = await handleCatalogRoute(
      new Request(`https://api.test/v1/organizations/${ORG_ID}/catalog/titles`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { ENVIRONMENT: "test", CATALOG_WORKER: fetcher, IDENTITY_WORKER: fetcher },
      "req_1",
      `/v1/organizations/${ORG_ID}/catalog/titles`,
    );

    expect(response.status).toBe(401);
    // The write must not reach the catalog worker.
    expect(calls.filter((c) => c.url.includes("/catalog/"))).toHaveLength(0);
  });

  it("405s a GET on a curation path", async () => {
    const { fetcher } = createCatalogFetcher();
    const response = await handleCatalogRoute(
      new Request(`https://api.test/v1/organizations/${ORG_ID}/catalog/titles`),
      { ENVIRONMENT: "test", CATALOG_WORKER: fetcher, IDENTITY_WORKER: fetcher },
      "req_1",
      `/v1/organizations/${ORG_ID}/catalog/titles`,
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

  it.each(["stage", "prod"])("%s binds CATALOG_WORKER to its own environment", (env) => {
    const services = config.env[env]?.services ?? [];
    const binding = services.find((s) => s.binding === "CATALOG_WORKER");
    expect(binding).toBeDefined();
    expect(binding!.service).toBe(`ambient-catalog-worker-${env}`);
  });

  it("never crosses environments", () => {
    const stage = (config.env.stage?.services ?? []).find((s) => s.binding === "CATALOG_WORKER");
    const prod = (config.env.prod?.services ?? []).find((s) => s.binding === "CATALOG_WORKER");
    expect(stage!.service).not.toContain("-prod");
    expect(prod!.service).not.toContain("-stage");
  });
});
