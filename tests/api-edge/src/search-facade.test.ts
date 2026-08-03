import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { handleSearchRoute, isSearchRoute } from "@api-edge/search-facade";
import { __resetRateLimitMemoryForTest } from "@api-edge/rate-limit";

const __dirname = dirname(fileURLToPath(import.meta.url));

function stripJsoncComments(text: string): string {
  return text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

interface FetchCall {
  url: string;
  init: RequestInit;
}

function createSearchFetcher(status = 200): { fetcher: Fetcher; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetcher = {
    fetch(input: string | Request | URL, init?: RequestInit): Promise<Response> {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push({ url, init: init ?? {} });
      return Promise.resolve(
        new Response(JSON.stringify({ data: { results: [] }, meta: {} }), {
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

describe("search route classification", () => {
  it.each(["/v1/search", "/v1/search/suggest", "/v1/search/titles", "/v1/search/names"])(
    "claims %s",
    (path) => {
      expect(isSearchRoute(path)).toBe(true);
    },
  );

  it("never routes the internal publish seam", () => {
    // The seam is service-binding only. Guarding it here as well as in the
    // worker means a future route addition cannot accidentally expose it.
    expect(isSearchRoute("/v1/internal/search/documents")).toBe(false);
    expect(isSearchRoute("/v1/internal/search/documents/title/abc")).toBe(false);
  });

  it("does not claim neighbouring paths", () => {
    for (const path of ["/v1/searching", "/v1/search/titles/extra", "/v1/titles", "/v1/genres"]) {
      expect(isSearchRoute(path)).toBe(false);
    }
  });
});

describe("search at the edge", () => {
  it("forwards a query without a session", async () => {
    const { fetcher, calls } = createSearchFetcher();
    const response = await handleSearchRoute(
      new Request("https://api.test/v1/search?q=arrival"),
      { ENVIRONMENT: "test", SEARCH_WORKER: fetcher },
      "req_1",
      "/v1/search",
    );

    expect(response.status).toBe(200);
    expect(calls[0]!.url).toContain("q=arrival");
  });

  it("does not forward the authorization header", async () => {
    const { fetcher, calls } = createSearchFetcher();
    await handleSearchRoute(
      new Request("https://api.test/v1/search?q=x", {
        headers: { authorization: "Bearer sps_ses_token" },
      }),
      { ENVIRONMENT: "test", SEARCH_WORKER: fetcher },
      "req_1",
      "/v1/search",
    );
    const headers = new Headers(calls[0]!.init.headers as HeadersInit);
    expect(headers.get("authorization")).toBeNull();
  });

  it("caches typeahead briefly and result pages longer", async () => {
    const suggest = createSearchFetcher();
    const results = createSearchFetcher();

    const a = await handleSearchRoute(
      new Request("https://api.test/v1/search/suggest?q=arr"),
      { ENVIRONMENT: "test", SEARCH_WORKER: suggest.fetcher },
      "req_1",
      "/v1/search/suggest",
    );
    const b = await handleSearchRoute(
      new Request("https://api.test/v1/search?q=arr"),
      { ENVIRONMENT: "test", SEARCH_WORKER: results.fetcher },
      "req_2",
      "/v1/search",
    );

    expect(a.headers.get("cache-control")).toBe("public, max-age=30, stale-while-revalidate=120");
    expect(b.headers.get("cache-control")).toBe("public, max-age=60, stale-while-revalidate=300");
  });

  it("does not cache a downstream error", async () => {
    const { fetcher } = createSearchFetcher(422);
    const response = await handleSearchRoute(
      new Request("https://api.test/v1/search"),
      { ENVIRONMENT: "test", SEARCH_WORKER: fetcher },
      "req_1",
      "/v1/search",
    );
    expect(response.status).toBe(422);
    expect(response.headers.get("cache-control")).toBeNull();
  });

  it("405s a non-GET", async () => {
    const { fetcher, calls } = createSearchFetcher();
    const response = await handleSearchRoute(
      new Request("https://api.test/v1/search", { method: "POST" }),
      { ENVIRONMENT: "test", SEARCH_WORKER: fetcher },
      "req_1",
      "/v1/search",
    );
    expect(response.status).toBe(405);
    expect(calls).toHaveLength(0);
  });

  it("503s when the binding is absent", async () => {
    const response = await handleSearchRoute(
      new Request("https://api.test/v1/search?q=x"),
      { ENVIRONMENT: "test" },
      "req_1",
      "/v1/search",
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
    const response = await handleSearchRoute(
      new Request("https://api.test/v1/search?q=x"),
      { ENVIRONMENT: "test", SEARCH_WORKER: fetcher },
      "req_1",
      "/v1/search",
    );
    expect(response.status).toBe(503);
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

  it.each(["stage", "prod"])("%s binds SEARCH_WORKER to its own environment", (env) => {
    const binding = (config.env[env]?.services ?? []).find((s) => s.binding === "SEARCH_WORKER");
    expect(binding).toBeDefined();
    expect(binding!.service).toBe(`ambient-search-worker-${env}`);
  });
});
