import type { Env } from "./env.js";
import { errorResponse, withEdgeTimings } from "./http.js";
import { replayOrExecute } from "./idempotency.js";
import { enforceRateLimit, mergeRateLimitHeaders } from "./rate-limit.js";
import { resolveActor } from "./resolve-actor.js";
import { createTimings } from "@saas/contracts/timing";

const TITLE_REVIEWS_RE = /^\/v1\/titles\/[^/]+\/reviews$/;
const TITLE_CRITIC_RE = /^\/v1\/titles\/[^/]+\/critic-reviews$/;
const TITLE_METASCORE_RE = /^\/v1\/titles\/[^/]+\/metascore$/;
const REVIEW_RE = /^\/v1\/reviews\/[^/]+$/;
const REVIEW_VOTE_RE = /^\/v1\/reviews\/[^/]+\/vote$/;
const USER_REVIEWS_RE = /^\/v1\/users\/[^/]+\/reviews$/;
const MODERATION_RE = /^\/v1\/moderation\/reviews(\/[^/]+\/decision)?$/;

const FORWARDED_HEADERS = ["content-type", "x-request-id", "traceparent", "idempotency-key"];

export function isReviewsRoute(pathname: string): boolean {
  if (pathname.startsWith("/v1/internal/")) return false;
  return (
    TITLE_REVIEWS_RE.test(pathname) ||
    TITLE_CRITIC_RE.test(pathname) ||
    TITLE_METASCORE_RE.test(pathname) ||
    REVIEW_VOTE_RE.test(pathname) ||
    REVIEW_RE.test(pathname) ||
    USER_REVIEWS_RE.test(pathname) ||
    MODERATION_RE.test(pathname)
  );
}

/**
 * A review read is public; everything that writes, votes, or moderates needs a
 * session. Moderation is authenticated at the edge and authorized downstream —
 * the queue must never be reachable without a token at all.
 */
export function requiresSession(pathname: string, method: string): boolean {
  if (MODERATION_RE.test(pathname)) return true;
  return method !== "GET";
}

export async function handleReviewsRoute(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
): Promise<Response> {
  const method = request.method;
  const allowed = allowedMethods(pathname);
  if (!allowed.includes(method)) {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  if (requiresSession(pathname, method)) {
    return handleAuthenticated(request, env, requestId, pathname);
  }
  return handlePublicRead(request, env, requestId, pathname);
}

function allowedMethods(pathname: string): string[] {
  if (TITLE_REVIEWS_RE.test(pathname)) return ["GET", "POST"];
  if (REVIEW_VOTE_RE.test(pathname)) return ["POST", "DELETE"];
  if (REVIEW_RE.test(pathname)) return ["GET", "PATCH", "DELETE"];
  if (MODERATION_RE.test(pathname)) return pathname.endsWith("/decision") ? ["POST"] : ["GET"];
  return ["GET"];
}

async function handlePublicRead(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
): Promise<Response> {
  if (!env.REVIEWS_WORKER) {
    return errorResponse("internal_error", "Reviews service unavailable", 503, requestId);
  }

  const timings = createTimings();
  const endTotal = timings.start("edge_total");
  const rate = await timings.measure("edge_ratelimit", () =>
    enforceRateLimit(request, requestId, env, "catalog"),
  );
  if (rate.kind === "denied") {
    endTotal();
    return withEdgeTimings(rate.response, requestId, "edge.reviews", timings);
  }

  const headers = new Headers();
  headers.set("x-request-id", requestId);
  const traceparent = request.headers.get("traceparent");
  if (traceparent) headers.set("traceparent", traceparent);

  const url = new URL(request.url);
  const target = new URL(pathname + url.search, "https://reviews.internal");

  try {
    const downstream = await timings.measure("edge_downstream", () =>
      env.REVIEWS_WORKER!.fetch(target.toString(), { method: "GET", headers }),
    );
    const response = new Response(downstream.body, {
      status: downstream.status,
      headers: downstream.headers,
    });
    if (downstream.ok) {
      // Helpfulness counts move constantly; a short window keeps the list
      // fresh while still absorbing the burst a popular title attracts.
      response.headers.set("cache-control", "public, max-age=60, stale-while-revalidate=600");
      response.headers.set("vary", "Accept-Encoding");
    }
    endTotal();
    return withEdgeTimings(
      mergeRateLimitHeaders(response, rate.headers),
      requestId,
      "edge.reviews",
      timings,
    );
  } catch {
    endTotal();
    return withEdgeTimings(
      errorResponse("internal_error", "Reviews service unavailable", 503, requestId),
      requestId,
      "edge.reviews",
      timings,
    );
  }
}

async function handleAuthenticated(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
): Promise<Response> {
  const isMutation = request.method !== "GET";

  const execute = async (): Promise<Response> => {
    if (!env.IDENTITY_WORKER) {
      return errorResponse("internal_error", "Authentication service unavailable", 503, requestId);
    }
    if (!env.REVIEWS_WORKER) {
      return errorResponse("internal_error", "Reviews service unavailable", 503, requestId);
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
    const target = new URL(pathname + url.search, "https://reviews.internal");
    const init: RequestInit = { method: request.method, headers };
    if (request.method === "POST" || request.method === "PATCH") init.body = request.body;

    try {
      const downstream = await timings.measure("edge_downstream", () =>
        env.REVIEWS_WORKER!.fetch(target.toString(), init),
      );
      const response = new Response(downstream.body, {
        status: downstream.status,
        headers: downstream.headers,
      });
      response.headers.set("cache-control", "no-store");
      endTotal();
      return withEdgeTimings(response, requestId, "edge.reviews.authed", timings);
    } catch {
      return errorResponse("internal_error", "Reviews service unavailable", 503, requestId);
    }
  };

  return isMutation ? replayOrExecute(request, requestId, env, "catalog", execute) : execute();
}
