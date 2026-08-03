import type { Env } from "./env.js";
import { errorResponse, withEdgeTimings } from "./http.js";
import { replayOrExecute } from "./idempotency.js";
import { enforceRateLimit, mergeRateLimitHeaders } from "./rate-limit.js";
import { resolveActor } from "./resolve-actor.js";
import { createTimings } from "@saas/contracts/timing";

// ── Route shapes ───────────────────────────────────────────────────────

const PUBLIC_ROUTES: RegExp[] = [
  /^\/v1\/titles$/,
  /^\/v1\/titles\/[^/]+$/,
  /^\/v1\/titles\/[^/]+\/[a-z-]+$/,
  /^\/v1\/names$/,
  /^\/v1\/names\/[^/]+$/,
  /^\/v1\/names\/[^/]+\/[a-z-]+$/,
  /^\/v1\/companies\/[^/]+$/,
  /^\/v1\/companies\/[^/]+\/titles$/,
  /^\/v1\/keywords\/[^/]+$/,
  /^\/v1\/keywords\/[^/]+\/titles$/,
  /^\/v1\/genres$/,
];

const CURATION_ROUTE_RE = /^\/v1\/organizations\/[^/]+\/catalog(\/|$)/;

const FORWARDED_HEADERS = ["content-type", "x-request-id", "traceparent", "idempotency-key"];

/**
 * Cache policy per read shape. The catalog is the one surface in this system
 * that is genuinely public and overwhelmingly read — leaving it uncached would
 * put a Hyperdrive round trip behind every poster on every page.
 *
 * Reference data that only changes when an editor touches it gets a long
 * stale-while-revalidate window; the core records get a short one so a
 * correction shows up quickly.
 */
interface CachePolicy {
  maxAge: number;
  staleWhileRevalidate: number;
}

const CORE_POLICY: CachePolicy = { maxAge: 60, staleWhileRevalidate: 600 };
const REFERENCE_POLICY: CachePolicy = { maxAge: 300, staleWhileRevalidate: 3600 };

const REFERENCE_SUFFIXES = new Set([
  "akas",
  "release-dates",
  "certificates",
  "keywords",
  "companies",
  "technical",
  "box-office",
  "connections",
  "external-ids",
  "images",
  "videos",
  "credits",
  "seasons",
  "episodes",
  "known-for",
]);

export function cachePolicyFor(pathname: string): CachePolicy {
  const suffix = pathname.split("/").pop() ?? "";
  if (REFERENCE_SUFFIXES.has(suffix)) return REFERENCE_POLICY;
  if (pathname === "/v1/genres") return REFERENCE_POLICY;
  return CORE_POLICY;
}

export function isCatalogPublicRoute(pathname: string): boolean {
  if (CURATION_ROUTE_RE.test(pathname)) return false;
  return PUBLIC_ROUTES.some((re) => re.test(pathname));
}

export function isCatalogCurationRoute(pathname: string): boolean {
  return CURATION_ROUTE_RE.test(pathname);
}

export function isCatalogRoute(pathname: string): boolean {
  return isCatalogPublicRoute(pathname) || isCatalogCurationRoute(pathname);
}

// ── Dispatch ───────────────────────────────────────────────────────────

export async function handleCatalogRoute(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
): Promise<Response> {
  if (isCatalogCurationRoute(pathname)) {
    return handleCuration(request, env, requestId, pathname);
  }
  return handlePublicRead(request, env, requestId, pathname);
}

/**
 * The public read class: no session, per-IP rate limited, cacheable.
 *
 * This is the first route family in the fleet that is intentionally
 * unauthenticated, so the gate is explicit rather than inherited — a route
 * only lands here if it matched `PUBLIC_ROUTES`, and everything else still
 * falls through to the authenticated facades.
 */
async function handlePublicRead(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }
  if (!env.CATALOG_WORKER) {
    return errorResponse("internal_error", "Catalog service unavailable", 503, requestId);
  }

  const timings = createTimings();
  const endTotal = timings.start("edge_total");

  // No bearer token on a public read, so `enforceRateLimit` keys the bucket by
  // client IP — which is exactly the abuse boundary we want here.
  const rate = await timings.measure("edge_ratelimit", () =>
    enforceRateLimit(request, requestId, env, "catalog"),
  );
  if (rate.kind === "denied") {
    endTotal();
    return withEdgeTimings(rate.response, requestId, "edge.catalog", timings);
  }

  const headers = new Headers();
  headers.set("x-request-id", requestId);
  for (const name of FORWARDED_HEADERS) {
    if (name === "x-request-id") continue;
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const url = new URL(request.url);
  const target = new URL(pathname + url.search, "https://catalog.internal");

  let downstream: Response;
  try {
    downstream = await timings.measure("edge_downstream", () =>
      env.CATALOG_WORKER!.fetch(target.toString(), { method: "GET", headers }),
    );
  } catch {
    endTotal();
    return withEdgeTimings(
      errorResponse("internal_error", "Catalog service unavailable", 503, requestId),
      requestId,
      "edge.catalog",
      timings,
    );
  }

  const response = await decorateCacheable(downstream, request, pathname);
  endTotal();
  return withEdgeTimings(
    mergeRateLimitHeaders(response, rate.headers),
    requestId,
    "edge.catalog",
    timings,
  );
}

/**
 * Attach `Cache-Control` + a strong `ETag`, and answer a matching
 * `If-None-Match` with 304 so a revalidation costs no bytes.
 *
 * The body has to be read to hash it — acceptable because these payloads are
 * small JSON documents, and it buys every downstream cache a validator.
 * Non-2xx responses are passed through untouched: caching an error would
 * outlive the condition that caused it.
 */
async function decorateCacheable(
  downstream: Response,
  request: Request,
  pathname: string,
): Promise<Response> {
  if (!downstream.ok) {
    return new Response(downstream.body, {
      status: downstream.status,
      headers: downstream.headers,
    });
  }

  const body = await downstream.text();
  const etag = await strongEtag(body);
  const policy = cachePolicyFor(pathname);

  const headers = new Headers(downstream.headers);
  headers.set(
    "cache-control",
    `public, max-age=${policy.maxAge}, stale-while-revalidate=${policy.staleWhileRevalidate}`,
  );
  headers.set("etag", etag);
  headers.set("vary", "Accept-Encoding");

  if (matchesIfNoneMatch(request.headers.get("if-none-match"), etag)) {
    headers.delete("content-length");
    return new Response(null, { status: 304, headers });
  }

  return new Response(body, { status: downstream.status, headers });
}

export function matchesIfNoneMatch(header: string | null, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === "*") return true;
  return header
    .split(",")
    .map((candidate) => candidate.trim())
    // A cache may echo our strong tag back weakened; both forms mean "unchanged".
    .some((candidate) => candidate === etag || candidate === `W/${etag}`);
}

async function strongEtag(body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const bytes = new Uint8Array(digest).subarray(0, 16);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i]!.toString(16).padStart(2, "0");
  return `"${hex}"`;
}

/** Curation: authenticated, idempotency-replayed, never cached. */
async function handleCuration(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
): Promise<Response> {
  const method = request.method;
  if (method !== "POST" && method !== "PATCH" && method !== "DELETE") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  return replayOrExecute(request, requestId, env, "catalog", async () => {
    if (!env.IDENTITY_WORKER) {
      return errorResponse("internal_error", "Authentication service unavailable", 503, requestId);
    }
    if (!env.CATALOG_WORKER) {
      return errorResponse("internal_error", "Catalog service unavailable", 503, requestId);
    }

    const timings = createTimings();
    const endTotal = timings.start("edge_total");
    const session = await timings.measure("edge_auth", () => resolveActor(request, env, requestId));
    if ("error" in session) return session.error;

    const headers = new Headers();
    headers.set("x-request-id", requestId);
    headers.set("x-actor-subject-id", session.subjectId);
    headers.set("x-actor-subject-type", session.subjectType);
    headers.set("x-actor-email", session.email);
    for (const name of FORWARDED_HEADERS) {
      if (name === "x-request-id") continue;
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    const url = new URL(request.url);
    const target = new URL(pathname + url.search, "https://catalog.internal");
    const init: RequestInit = { method, headers };
    if (method === "POST" || method === "PATCH") init.body = request.body;

    try {
      const downstream = await timings.measure("edge_downstream", () =>
        env.CATALOG_WORKER!.fetch(target.toString(), init),
      );
      const response = new Response(downstream.body, {
        status: downstream.status,
        headers: downstream.headers,
      });
      // Curation responses reflect a caller's own mutation — never cacheable.
      response.headers.set("cache-control", "no-store");
      endTotal();
      return withEdgeTimings(response, requestId, "edge.catalog.curation", timings);
    } catch {
      return errorResponse("internal_error", "Catalog service unavailable", 503, requestId);
    }
  });
}
