import { CATALOG_BASE_URL, CatalogError, catalogApi, isNotFound, isOffline, queryString } from "@/lib/catalog-api";

describe("queryString", () => {
  it("builds a query string from the values that exist", () => {
    expect(queryString({ kind: "movie", limit: 20 })).toBe("?kind=movie&limit=20");
  });

  it("omits empty values rather than sending blanks", () => {
    expect(queryString({ a: undefined, b: null, c: "" })).toBe("");
    expect(queryString({ a: "x", b: undefined })).toBe("?a=x");
  });

  it("keeps a zero, which is a value", () => {
    expect(queryString({ limit: 0 })).toBe("?limit=0");
  });

  it("keeps `false`, which is also a value", () => {
    expect(queryString({ adult: false })).toBe("?adult=false");
  });

  it("joins an array into one repeated-value parameter", () => {
    expect(queryString({ ids: ["tt_1", "tt_2"] })).toBe("?ids=tt_1%2Ctt_2");
  });

  it("omits an empty array", () => {
    expect(queryString({ ids: [] })).toBe("");
  });

  it("encodes values that would otherwise break the URL", () => {
    expect(queryString({ q: "a&b=c" })).toBe("?q=a%26b%3Dc");
  });
});

describe("CatalogError", () => {
  it("separates 'nothing there' from 'nothing answered'", () => {
    expect(isNotFound(new CatalogError(404, "not_found", "Not found"))).toBe(true);
    expect(isOffline(new CatalogError(404, "not_found", "Not found"))).toBe(false);
    expect(isOffline(new CatalogError(0, "network_error", "unreachable"))).toBe(true);
  });

  it("is not confused by an unrelated error", () => {
    expect(isNotFound(new Error("boom"))).toBe(false);
    expect(isOffline(new Error("boom"))).toBe(false);
  });
});

describe("reads", () => {
  const originalFetch = globalThis.fetch;
  let calls: string[] = [];

  function respond(body: unknown, status = 200) {
    globalThis.fetch = ((url: string) => {
      calls.push(String(url));
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );
    }) as typeof fetch;
  }

  beforeEach(() => {
    calls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("unwraps the response envelope", async () => {
    respond({ data: { genres: [{ slug: "drama", name: "Drama" }] }, meta: {} });
    await expect(catalogApi.genres()).resolves.toEqual({
      genres: [{ slug: "drama", name: "Drama" }],
    });
  });

  it("addresses the configured api-edge", async () => {
    respond({ data: { genres: [] }, meta: {} });
    await catalogApi.genres();
    expect(calls[0]).toBe(`${CATALOG_BASE_URL}/v1/genres`);
  });

  it("surfaces the API's error code, not just the status", async () => {
    respond({ error: { code: "not_found", message: "Not found" } }, 404);
    await expect(catalogApi.getTitle("tt_1")).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
  });

  it("still fails usefully when the error body is not JSON", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response("<html>502</html>", { status: 502 }))) as typeof fetch;
    await expect(catalogApi.genres()).rejects.toMatchObject({
      status: 502,
      code: "internal_error",
    });
  });

  it("reports an unreachable API as status 0, not as a 5xx", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("ECONNREFUSED"))) as typeof fetch;
    await expect(catalogApi.genres()).rejects.toMatchObject({ status: 0 });
  });

  it("does not call the API at all for an empty batch", async () => {
    respond({ data: { titles: [] }, meta: {} });
    await expect(catalogApi.batchTitles([])).resolves.toEqual({ titles: [] });
    expect(calls).toHaveLength(0);
  });

  it("hydrates a batch of ids in one request", async () => {
    respond({ data: { titles: [] }, meta: {} });
    await catalogApi.batchTitles(["tt_1", "tt_2", "tt_3"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("ids=tt_1%2Ctt_2%2Ctt_3");
  });
});
