import type { Env } from "./env.js";
import { errorResponse, withEdgeTimings } from "./http.js";
import { replayOrExecute } from "./idempotency.js";
import { enforceRateLimit, mergeRateLimitHeaders } from "./rate-limit.js";
import { resolveActor } from "./resolve-actor.js";
import { createTimings } from "@saas/contracts/timing";

const TITLE_RATING_RE = /^\/v1\/titles\/[^/]+\/rating$/;
const TITLE_DEMOGRAPHICS_RE = /^\/v1\/titles\/[^/]+\/rating\/demographics$/;
const TITLE_POPULARITY_RE = /^\/v1\/titles\/[^/]+\/popularity$/;
const NAME_POPULARITY_RE = /^\/v1\/names\/[^/]+\/popularity$/;
const CHART_RE = /^\/v1\/charts\/[a-z_]+$/;
const ME_RATINGS_RE = /^\/v1\/me\/ratings(\/[^/]+)?$/;

const FORWARDED_HEADERS = ["content-type", "x-request-id", "traceparent", "idempotency-key"];

export function isRatingsRoute(pathname: string): boolean {
  if (pathname.startsWith("/v1/internal/")) return false;
  return (
    TITLE_RATING_RE.test(pathname) ||
    TITLE_DEMOGRAPHICS_RE.test(pathname) ||
    TITLE_POPULARITY_RE.test(pathname) ||
    NAME_POPULARITY_RE.test(pathname) ||
    CHART_RE.test(pathname) ||
    ME_RATINGS_RE.test(pathname)
  );
}

/**
 * `/v1/me/*` is the caller's own data, and a GET rating on a title is public.
 * The split is by path, not by method, so a cache can never be handed a
 * personalized body.
 */
export function isPersonalRatingsRoute(pathname: string): boolean {
  return ME_RATINGS_RE.test(pathname);
}

function cacheControlFor(pathname: string): string {
  // Aggregates move with every vote, so the window is short; a chart is a
  // daily snapshot and can sit still much longer.
  if (CHART_RE.test(pathname)) return "public, max-age=300, stale-while-revalidate=3600";
  return "public, max-age=30, stale-while-revalidate=300";
}

export async function handleRatingsRoute(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
): Promise<Response> {
  const isWrite = request.method === "PUT" || request.method === "DELETE";
  const personal = isPersonalRatingsRoute(pathname);

  if (personal && request.method !== "GET") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }
  if (!personal && !isWrite && request.method !== "GET") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }
  if (isWrite && !TITLE_RATING_RE.test(pathname)) {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  if (isWrite || personal) {
    return handleAuthenticated(request, env, requestId, pathname, isWrite);
  }
  return handlePublicRead(request, env, requestId, pathname);
}

async function handlePublicRead(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
): Promise<Response> {
  if (!env.RATINGS_WORKER) {
    return errorResponse("internal_error", "Ratings service unavailable", 503, requestId);
  }

  const timings = createTimings();
  const endTotal = timings.start("edge_total");

  const rate = await timings.measure("edge_ratelimit", () =>
    enforceRateLimit(request, requestId, env, "catalog"),
  );
  if (rate.kind === "denied") {
    endTotal();
    return withEdgeTimings(rate.response, requestId, "edge.ratings", timings);
  }

  const headers = new Headers();
  headers.set("x-request-id", requestId);
  const traceparent = request.headers.get("traceparent");
  if (traceparent) headers.set("traceparent", traceparent);

  const url = new URL(request.url);
  const target = new URL(pathname + url.search, "https://ratings.internal");

  try {
    const downstream = await timings.measure("edge_downstream", () =>
      env.RATINGS_WORKER!.fetch(target.toString(), { method: "GET", headers }),
    );
    const response = new Response(downstream.body, {
      status: downstream.status,
      headers: downstream.headers,
    });
    if (downstream.ok) {
      response.headers.set("cache-control", cacheControlFor(pathname));
      response.headers.set("vary", "Accept-Encoding");
    }
    endTotal();
    return withEdgeTimings(
      mergeRateLimitHeaders(response, rate.headers),
      requestId,
      "edge.ratings",
      timings,
    );
  } catch {
    endTotal();
    return withEdgeTimings(
      errorResponse("internal_error", "Ratings service unavailable", 503, requestId),
      requestId,
      "edge.ratings",
      timings,
    );
  }
}

async function handleAuthenticated(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
  isWrite: boolean,
): Promise<Response> {
  const execute = async (): Promise<Response> => {
    if (!env.IDENTITY_WORKER) {
      return errorResponse("internal_error", "Authentication service unavailable", 503, requestId);
    }
    if (!env.RATINGS_WORKER) {
      return errorResponse("internal_error", "Ratings service unavailable", 503, requestId);
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
    const target = new URL(pathname + url.search, "https://ratings.internal");
    const init: RequestInit = { method: request.method, headers };
    if (request.method === "PUT") init.body = request.body;

    try {
      const downstream = await timings.measure("edge_downstream", () =>
        env.RATINGS_WORKER!.fetch(target.toString(), init),
      );
      const response = new Response(downstream.body, {
        status: downstream.status,
        headers: downstream.headers,
      });
      // Personalized or mutating — never cacheable, by any hop.
      response.headers.set("cache-control", "no-store");
      endTotal();
      return withEdgeTimings(response, requestId, "edge.ratings.personal", timings);
    } catch {
      return errorResponse("internal_error", "Ratings service unavailable", 503, requestId);
    }
  };

  // Only mutations go through the idempotency layer; a personal GET has
  // nothing to replay.
  return isWrite ? replayOrExecute(request, requestId, env, "catalog", execute) : execute();
}
