import { createSqlExecutor } from "@saas/db/hyperdrive";
import { createSearchRepository, SEARCH_ENTITY_TYPES } from "@saas/db/search";
import type { SearchDocument, SearchEntityType, SearchHit } from "@saas/db/search";
import { createTimings } from "@saas/contracts/timing";
import type { PublicSearchHit } from "@saas/contracts/search";
import type { Env } from "./env.js";
import { errorResponse, methodNotAllowed, notFound, successResponse, validationError, withTimings } from "./http.js";
import {
  parseLimit,
  parseNameSearch,
  parseOffset,
  parseQueryText,
  parseTitleSearch,
  parseTypes,
} from "./query.js";

const REQUEST_ID_RE = /^[\w-]{1,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PUBLISH_BATCH = 200;

const INTERNAL_DOCUMENTS = "/v1/internal/search/documents";
const INTERNAL_DOCUMENT_RE = /^\/v1\/internal\/search\/documents\/([a-z]+)\/([^/]+)$/;

function resolveRequestId(request: Request): string {
  const header = request.headers.get("x-request-id");
  if (header && REQUEST_ID_RE.test(header)) return header;
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  let hex = "";
  for (let i = 0; i < buf.length; i++) hex += buf[i]!.toString(16).padStart(2, "0");
  return `req_${hex}`;
}

function toPublicHit(hit: SearchHit): PublicSearchHit {
  return {
    type: hit.entityType,
    id: hit.publicId,
    display: hit.display,
    secondary: hit.secondary,
    imageUrl: hit.imageUrl,
    facets: hit.filters as Record<string, unknown>,
  };
}

export async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const requestId = resolveRequestId(request);

  try {
    if (url.pathname === "/health") {
      if (request.method !== "GET") return notFound(requestId, url.pathname);
      return successResponse(
        {
          status: "ok",
          service: "search-worker",
          environment: env.ENVIRONMENT ?? "local",
          timestamp: new Date().toISOString(),
          checks: { database: { configured: !!env.PLATFORM_DB } },
        },
        requestId,
      );
    }

    // Internal publish seam: service-binding only, never routed by the edge.
    if (url.pathname === INTERNAL_DOCUMENTS) {
      if (request.method !== "PUT") return methodNotAllowed(requestId);
      return publishDocuments(request, env, requestId);
    }
    const documentMatch = url.pathname.match(INTERNAL_DOCUMENT_RE);
    if (documentMatch) {
      if (request.method !== "DELETE") return methodNotAllowed(requestId);
      return unpublishDocument(env, requestId, documentMatch[1]!, documentMatch[2]!);
    }

    if (url.pathname.startsWith("/v1/search")) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      if (url.pathname === "/v1/search/suggest") return suggest(url, env, requestId);
      if (url.pathname === "/v1/search/titles") return searchTitles(url, env, requestId);
      if (url.pathname === "/v1/search/names") return searchNames(url, env, requestId);
      if (url.pathname === "/v1/search") return searchAll(url, env, requestId);
    }

    return notFound(requestId, url.pathname);
  } catch {
    return errorResponse("internal_error", "An unexpected error occurred", 500, requestId);
  }
}

async function withRepo(
  env: Env,
  requestId: string,
  route: string,
  fn: (
    repo: ReturnType<typeof createSearchRepository>,
    timings: ReturnType<typeof createTimings>,
  ) => Promise<Response>,
): Promise<Response> {
  if (!env.PLATFORM_DB) {
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  const timings = createTimings();
  const endTotal = timings.start("total");
  const executor = createSqlExecutor(env.PLATFORM_DB);
  try {
    const response = await fn(createSearchRepository(executor), timings);
    endTotal();
    return withTimings(response, requestId, route, timings);
  } catch {
    endTotal();
    return withTimings(
      errorResponse("internal_error", "Service unavailable", 503, requestId),
      requestId,
      route,
      timings,
    );
  } finally {
    await executor.dispose();
  }
}

function suggest(url: URL, env: Env, requestId: string): Promise<Response> {
  const text = parseQueryText(url, true);
  if (!text.ok) return Promise.resolve(validationError(requestId, { [text.field]: [text.reason] }));
  const limit = parseLimit(url, 8);
  if (!limit.ok) return Promise.resolve(validationError(requestId, { [limit.field]: [limit.reason] }));
  const types = parseTypes(url);
  if (!types.ok) return Promise.resolve(validationError(requestId, { [types.field]: [types.reason] }));

  return withRepo(env, requestId, "search.suggest", async (repo, timings) => {
    const result = await timings.measure("db", () =>
      repo.suggest(text.value, limit.value, types.value ?? undefined),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ suggestions: result.value.map(toPublicHit) }, requestId);
  });
}

function searchAll(url: URL, env: Env, requestId: string): Promise<Response> {
  const text = parseQueryText(url, true);
  if (!text.ok) return Promise.resolve(validationError(requestId, { [text.field]: [text.reason] }));
  const limit = parseLimit(url, 20);
  if (!limit.ok) return Promise.resolve(validationError(requestId, { [limit.field]: [limit.reason] }));
  const offset = parseOffset(url);
  if (!offset.ok) return Promise.resolve(validationError(requestId, { [offset.field]: [offset.reason] }));
  const types = parseTypes(url);
  if (!types.ok) return Promise.resolve(validationError(requestId, { [types.field]: [types.reason] }));

  return withRepo(env, requestId, "search.query", async (repo, timings) => {
    const result = await timings.measure("db", () =>
      repo.search(text.value, types.value, limit.value, offset.value),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ results: result.value.map(toPublicHit) }, requestId);
  });
}

function searchTitles(url: URL, env: Env, requestId: string): Promise<Response> {
  const parsed = parseTitleSearch(url);
  if (!parsed.ok) {
    return Promise.resolve(validationError(requestId, { [parsed.field]: [parsed.reason] }));
  }
  return withRepo(env, requestId, "search.titles", async (repo, timings) => {
    const result = await timings.measure("db", () => repo.searchTitles(parsed.value));
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ results: result.value.map(toPublicHit) }, requestId);
  });
}

function searchNames(url: URL, env: Env, requestId: string): Promise<Response> {
  const parsed = parseNameSearch(url);
  if (!parsed.ok) {
    return Promise.resolve(validationError(requestId, { [parsed.field]: [parsed.reason] }));
  }
  return withRepo(env, requestId, "search.names", async (repo, timings) => {
    const result = await timings.measure("db", () => repo.searchNames(parsed.value));
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ results: result.value.map(toPublicHit) }, requestId);
  });
}

async function publishDocuments(request: Request, env: Env, requestId: string): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);
  }

  const raw = (body as { documents?: unknown })?.documents;
  if (!Array.isArray(raw)) {
    return validationError(requestId, { documents: ["Must be an array"] });
  }
  if (raw.length > MAX_PUBLISH_BATCH) {
    return validationError(requestId, {
      documents: [`Must contain at most ${MAX_PUBLISH_BATCH} entries`],
    });
  }

  const documents: SearchDocument[] = [];
  for (const [index, entry] of raw.entries()) {
    const parsed = parseDocument(entry);
    if (!parsed) {
      return validationError(requestId, { [`documents.${index}`]: ["Invalid document"] });
    }
    documents.push(parsed);
  }

  return withRepo(env, requestId, "search.publish", async (repo, timings) => {
    const result = await timings.measure("db", () => repo.upsertDocuments(documents));
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ published: result.value }, requestId);
  });
}

function parseDocument(entry: unknown): SearchDocument | null {
  if (!entry || typeof entry !== "object") return null;
  const value = entry as Record<string, unknown>;
  const type = value.type;
  if (typeof type !== "string" || !(SEARCH_ENTITY_TYPES as readonly string[]).includes(type)) {
    return null;
  }
  if (typeof value.entityId !== "string" || !UUID_RE.test(value.entityId)) return null;
  if (typeof value.publicId !== "string" || value.publicId.length === 0) return null;
  if (typeof value.display !== "string" || value.display.trim().length === 0) return null;

  return {
    entityType: type as SearchEntityType,
    entityId: value.entityId,
    publicId: value.publicId,
    display: value.display.trim().slice(0, 500),
    secondary: typeof value.secondary === "string" ? value.secondary.slice(0, 500) : "",
    imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : null,
    body: typeof value.body === "string" ? value.body.slice(0, 20_000) : "",
    popularity: typeof value.popularity === "number" && Number.isFinite(value.popularity)
      ? value.popularity
      : 0,
    filters:
      value.facets && typeof value.facets === "object" && !Array.isArray(value.facets)
        ? (value.facets as SearchDocument["filters"])
        : {},
  };
}

function unpublishDocument(
  env: Env,
  requestId: string,
  type: string,
  entityId: string,
): Promise<Response> {
  if (!(SEARCH_ENTITY_TYPES as readonly string[]).includes(type) || !UUID_RE.test(entityId)) {
    return Promise.resolve(notFound(requestId, `/v1/internal/search/documents/${type}/${entityId}`));
  }
  return withRepo(env, requestId, "search.unpublish", async (repo, timings) => {
    const result = await timings.measure("db", () =>
      repo.deleteDocument(type as SearchEntityType, entityId),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return new Response(null, { status: 204 });
  });
}
