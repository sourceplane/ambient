import type { Env } from "./env.js";
import { errorResponse, withEdgeTimings } from "./http.js";
import { replayOrExecute } from "./idempotency.js";
import { enforceRateLimit, mergeRateLimitHeaders } from "./rate-limit.js";
import { resolveActor } from "./resolve-actor.js";
import { createTimings } from "@saas/contracts/timing";

const TITLE_AWARDS_RE = /^\/v1\/titles\/[^/]+\/awards$/;
const NAME_AWARDS_RE = /^\/v1\/names\/[^/]+\/awards$/;
const EDITION_RE = /^\/v1\/awards\/[a-z0-9-]+\/\d{4}$/;
const FACTS_RE = /^\/v1\/titles\/[^/]+\/facts$/;
const FACT_VOTE_RE = /^\/v1\/facts\/[^/]+\/vote$/;
const PARENTS_GUIDE_RE = /^\/v1\/titles\/[^/]+\/parents-guide$/;
const SEVERITY_RE = /^\/v1\/titles\/[^/]+\/parents-guide\/[a-z_]+\/severity$/;
const FAQ_RE = /^\/v1\/titles\/[^/]+\/faq$/;
const NEWS_RE = /^\/v1\/news$/;
const CONTRIBUTIONS_RE = /^\/v1\/(me\/)?contributions$/;
const WITHDRAW_RE = /^\/v1\/contributions\/[^/]+\/withdraw$/;
const MODERATION_RE = /^\/v1\/moderation\/contributions(\/[^/]+\/decision)?$/;

const FORWARDED_HEADERS = ["content-type", "x-request-id", "traceparent", "idempotency-key"];

const PUBLIC_READS = [
  TITLE_AWARDS_RE,
  NAME_AWARDS_RE,
  EDITION_RE,
  FACTS_RE,
  PARENTS_GUIDE_RE,
  FAQ_RE,
  NEWS_RE,
];

export function isCommunityRoute(pathname: string): boolean {
  if (pathname.startsWith("/v1/internal/")) return false;
  return (
    SEVERITY_RE.test(pathname) ||
    FACT_VOTE_RE.test(pathname) ||
    WITHDRAW_RE.test(pathname) ||
    MODERATION_RE.test(pathname) ||
    CONTRIBUTIONS_RE.test(pathname) ||
    PUBLIC_READS.some((re) => re.test(pathname))
  );
}

/**
 * A community read is public; contributing, voting, and moderating are not.
 * Moderation is authenticated regardless of method — the queue must never be
 * reachable without a token at all.
 */
export function requiresSession(pathname: string, method: string): boolean {
  if (MODERATION_RE.test(pathname)) return true;
  if (pathname === "/v1/me/contributions") return true;
  return method !== "GET";
}

export async function handleCommunityRoute(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
): Promise<Response> {
  const method = request.method;
  if (!allowedMethods(pathname).includes(method)) {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  if (requiresSession(pathname, method)) {
    return handleAuthenticated(request, env, requestId, pathname);
  }
  return handlePublicRead(request, env, requestId, pathname);
}

function allowedMethods(pathname: string): string[] {
  if (SEVERITY_RE.test(pathname)) return ["PUT"];
  if (FACT_VOTE_RE.test(pathname)) return ["POST"];
  if (WITHDRAW_RE.test(pathname)) return ["POST"];
  if (MODERATION_RE.test(pathname)) {
    return pathname.endsWith("/decision") ? ["POST"] : ["GET"];
  }
  if (pathname === "/v1/contributions") return ["POST"];
  if (pathname === "/v1/me/contributions") return ["GET"];
  if (FACTS_RE.test(pathname)) return ["GET", "POST"];
  return ["GET"];
}

async function handlePublicRead(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
): Promise<Response> {
  if (!env.COMMUNITY_WORKER) {
    return errorResponse("internal_error", "Community service unavailable", 503, requestId);
  }

  const timings = createTimings();
  const endTotal = timings.start("edge_total");
  const rate = await timings.measure("edge_ratelimit", () =>
    enforceRateLimit(request, requestId, env, "catalog"),
  );
  if (rate.kind === "denied") {
    endTotal();
    return withEdgeTimings(rate.response, requestId, "edge.community", timings);
  }

  const headers = new Headers();
  headers.set("x-request-id", requestId);
  const traceparent = request.headers.get("traceparent");
  if (traceparent) headers.set("traceparent", traceparent);

  const url = new URL(request.url);
  const target = new URL(pathname + url.search, "https://community.internal");

  try {
    const downstream = await timings.measure("edge_downstream", () =>
      env.COMMUNITY_WORKER!.fetch(target.toString(), { method: "GET", headers }),
    );
    const response = new Response(downstream.body, {
      status: downstream.status,
      headers: downstream.headers,
    });
    if (downstream.ok) {
      // Awards and trivia change on an editorial cadence, not a live one.
      response.headers.set("cache-control", "public, max-age=300, stale-while-revalidate=3600");
      response.headers.set("vary", "Accept-Encoding");
    }
    endTotal();
    return withEdgeTimings(
      mergeRateLimitHeaders(response, rate.headers),
      requestId,
      "edge.community",
      timings,
    );
  } catch {
    endTotal();
    return withEdgeTimings(
      errorResponse("internal_error", "Community service unavailable", 503, requestId),
      requestId,
      "edge.community",
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
    if (!env.COMMUNITY_WORKER) {
      return errorResponse("internal_error", "Community service unavailable", 503, requestId);
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
    const target = new URL(pathname + url.search, "https://community.internal");
    const init: RequestInit = { method: request.method, headers };
    if (request.method === "POST" || request.method === "PUT") init.body = request.body;

    try {
      const downstream = await timings.measure("edge_downstream", () =>
        env.COMMUNITY_WORKER!.fetch(target.toString(), init),
      );
      const response = new Response(downstream.body, {
        status: downstream.status,
        headers: downstream.headers,
      });
      response.headers.set("cache-control", "no-store");
      endTotal();
      return withEdgeTimings(response, requestId, "edge.community.authed", timings);
    } catch {
      return errorResponse("internal_error", "Community service unavailable", 503, requestId);
    }
  };

  return isMutation ? replayOrExecute(request, requestId, env, "catalog", execute) : execute();
}
