import { route } from "@search-worker/router";
import type { Env } from "@search-worker/env";

const ENTITY_UUID = "11111111-1111-1111-1111-111111111111";

function bareEnv(): Env {
  return { ENVIRONMENT: "test" };
}

function get(path: string): Request {
  return new Request(`https://search.internal${path}`, { method: "GET" });
}

function put(path: string, body: unknown): Request {
  return new Request(`https://search.internal${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("health", () => {
  it("reports the database binding", async () => {
    const response = await route(get("/health"), bareEnv());
    expect(response.status).toBe(200);
    const data = (await json(response)).data as Record<string, unknown>;
    expect(data.service).toBe("search-worker");
    expect(data.checks).toEqual({ database: { configured: false } });
  });
});

describe("query routes", () => {
  it.each([
    "/v1/search?q=arrival",
    "/v1/search/suggest?q=arr",
    "/v1/search/titles",
    "/v1/search/names",
  ])("routes %s without a session", async (path) => {
    // 503 because no database is bound — the point is that it reached a
    // handler, i.e. no 401 and no 404.
    const response = await route(get(path), bareEnv());
    expect(response.status).toBe(503);
  });

  it("requires a query for suggest and full-text search", async () => {
    for (const path of ["/v1/search", "/v1/search/suggest"]) {
      const response = await route(get(path), bareEnv());
      expect(response.status).toBe(422);
      const body = await json(response);
      expect((body.error as Record<string, unknown>).code).toBe("validation_failed");
    }
  });

  it("does not require a query for advanced search — it is also a browse", async () => {
    const response = await route(get("/v1/search/titles"), bareEnv());
    expect(response.status).toBe(503);
  });

  it("rejects an unknown entity type with 422", async () => {
    const response = await route(get("/v1/search?q=x&type=movie"), bareEnv());
    expect(response.status).toBe(422);
  });

  it("rejects an over-cap limit with 422", async () => {
    const response = await route(get("/v1/search?q=x&limit=1000"), bareEnv());
    expect(response.status).toBe(422);
  });

  it("405s a write to a query route", async () => {
    const response = await route(
      new Request("https://search.internal/v1/search?q=x", { method: "POST" }),
      bareEnv(),
    );
    expect(response.status).toBe(405);
  });

  it("404s an unknown search sub-path", async () => {
    const response = await route(get("/v1/search/nonsense?q=x"), bareEnv());
    expect(response.status).toBe(404);
  });
});

describe("internal publish seam", () => {
  const VALID = {
    type: "title",
    entityId: ENTITY_UUID,
    publicId: `tt_${ENTITY_UUID.replace(/-/g, "")}`,
    display: "Arrival",
    secondary: "2016 · movie",
    facets: { kind: "movie", year: 2016 },
  };

  it("accepts a well-formed batch", async () => {
    // 503 (no database) rather than 422 proves validation passed.
    const response = await route(
      put("/v1/internal/search/documents", { documents: [VALID] }),
      bareEnv(),
    );
    expect(response.status).toBe(503);
  });

  it("rejects a non-array documents field", async () => {
    const response = await route(
      put("/v1/internal/search/documents", { documents: "nope" }),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });

  it("rejects an oversized batch", async () => {
    const documents = Array.from({ length: 201 }, () => VALID);
    const response = await route(put("/v1/internal/search/documents", { documents }), bareEnv());
    expect(response.status).toBe(422);
  });

  it("rejects a document with an unknown type", async () => {
    const response = await route(
      put("/v1/internal/search/documents", { documents: [{ ...VALID, type: "episode" }] }),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });

  it("rejects a document whose entity id is not a uuid", async () => {
    const response = await route(
      put("/v1/internal/search/documents", { documents: [{ ...VALID, entityId: "tt_123" }] }),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });

  it("rejects a document with a blank display label", async () => {
    const response = await route(
      put("/v1/internal/search/documents", { documents: [{ ...VALID, display: "   " }] }),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });

  it("names the offending index so a batch failure is diagnosable", async () => {
    const response = await route(
      put("/v1/internal/search/documents", {
        documents: [VALID, { ...VALID, display: "" }],
      }),
      bareEnv(),
    );
    expect(response.status).toBe(422);
    const body = await json(response);
    const details = (body.error as { details: { fields: Record<string, string[]> } }).details;
    expect(Object.keys(details.fields)).toEqual(["documents.1"]);
  });

  it("rejects a malformed JSON body", async () => {
    const response = await route(
      new Request("https://search.internal/v1/internal/search/documents", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });

  it("405s a POST to the publish seam", async () => {
    const response = await route(
      new Request("https://search.internal/v1/internal/search/documents", { method: "POST" }),
      bareEnv(),
    );
    expect(response.status).toBe(405);
  });

  it("404s an unpublish with a non-uuid id", async () => {
    const response = await route(
      new Request("https://search.internal/v1/internal/search/documents/title/not-a-uuid", {
        method: "DELETE",
      }),
      bareEnv(),
    );
    expect(response.status).toBe(404);
  });

  it("routes a well-formed unpublish", async () => {
    const response = await route(
      new Request(`https://search.internal/v1/internal/search/documents/title/${ENTITY_UUID}`, {
        method: "DELETE",
      }),
      bareEnv(),
    );
    expect(response.status).toBe(503);
  });
});
