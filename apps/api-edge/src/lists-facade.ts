import type { Env } from "./env.js";
import { errorResponse, withEdgeTimings } from "./http.js";
import { replayOrExecute } from "./idempotency.js";
import { enforceRateLimit, mergeRateLimitHeaders } from "./rate-limit.js";
import { resolveActor } from "./resolve-actor.js";
import { createTimings } from "@saas/contracts/timing";

const ME_LISTS_RE = /^\/v1\/me\/(watchlist|lists)(\/[^/]+)?$/;
const LIST_RE = /^\/v1\/lists\/[^/]+$/;
const LIST_ITEMS_RE = /^\/v1\/lists\/[^/]+\/items$/;
const LIST_ITEM_RE = /^\/v1\/lists\/[^/]+\/items\/[^/]+$/;
const LIST_LIKE_RE = /^\/v1\/lists\/[^/]+\/like$/;
const USER_LISTS_RE = /^\/v1\/users\/[^/]+\/lists$/;

const FORWARDED_HEADERS = ["content-type", "x-request-id", "traceparent", "idempotency-key"];

export function isListsRoute(pathname: string): boolean {
  if (pathname.startsWith("/v1/internal/")) return false;
  return (
    ME_LISTS_RE.test(pathname) ||
    LIST_LIKE_RE.test(pathname) ||
    LIST_ITEM_RE.test(pathname) ||
    LIST_ITEMS_RE.test(pathname) ||
    LIST_RE.test(pathname) ||
    USER_LISTS_RE.test(pathname)
  );
}

/** `/v1/me/*` is always the caller's own data and always needs a session. */
export function isPersonalListsRoute(pathname: string): boolean {
  return ME_LISTS_RE.test(pathname);
}

export async function handleListsRoute(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
): Promise<Response> {
  const method = request.method;
  if (!allowedMethods(pathname).includes(method)) {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  const personal = isPersonalListsRoute(pathname);
  const mutating = method !== "GET";

  if (personal || mutating) {
    return handleAuthenticated(request, env, requestId, pathname, mutating);
  }
  return handleOptionalSessionRead(request, env, requestId, pathname);
}

function allowedMethods(pathname: string): string[] {
  if (ME_LISTS_RE.test(pathname)) {
    // /v1/me/watchlist/:entityId toggles; the collections are read/create.
    return pathname.split("/").length > 4 ? ["GET", "PUT", "DELETE"] : ["GET", "POST"];
  }
  if (LIST_LIKE_RE.test(pathname)) return ["POST", "DELETE"];
  if (LIST_ITEM_RE.test(pathname)) return ["PATCH", "DELETE"];
  if (LIST_ITEMS_RE.test(pathname)) return ["GET", "POST"];
  if (LIST_RE.test(pathname)) return ["GET", "PATCH", "DELETE"];
  return ["GET"];
}

/**
 * A list read is public — but the *owner* of a private list must still be able
 * to read it at the same URL. So the session is resolved only when the caller
 * offered one, and a failed resolution degrades to anonymous rather than 401.
 * The response is never cached, because the same URL can legitimately return
 * different bodies to different viewers.
 */
async function handleOptionalSessionRead(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
): Promise<Response> {
  if (!env.LISTS_WORKER) {
    return errorResponse("internal_error", "Lists service unavailable", 503, requestId);
  }

  const timings = createTimings();
  const endTotal = timings.start("edge_total");
  const rate = await timings.measure("edge_ratelimit", () =>
    enforceRateLimit(request, requestId, env, "catalog"),
  );
  if (rate.kind === "denied") {
    endTotal();
    return withEdgeTimings(rate.response, requestId, "edge.lists", timings);
  }

  const headers = new Headers();
  headers.set("x-request-id", requestId);
  const traceparent = request.headers.get("traceparent");
  if (traceparent) headers.set("traceparent", traceparent);

  if (request.headers.get("authorization") && env.IDENTITY_WORKER) {
    const session = await timings.measure("edge_auth", () => resolveActor(request, env, requestId));
    if (!("error" in session)) {
      headers.set("x-actor-subject-id", session.subjectId);
      headers.set("x-actor-subject-type", session.subjectType);
    }
  }

  const url = new URL(request.url);
  const target = new URL(pathname + url.search, "https://lists.internal");

  try {
    const downstream = await timings.measure("edge_downstream", () =>
      env.LISTS_WORKER!.fetch(target.toString(), { method: "GET", headers }),
    );
    const response = new Response(downstream.body, {
      status: downstream.status,
      headers: downstream.headers,
    });
    response.headers.set("cache-control", "no-store");
    endTotal();
    return withEdgeTimings(
      mergeRateLimitHeaders(response, rate.headers),
      requestId,
      "edge.lists",
      timings,
    );
  } catch {
    endTotal();
    return withEdgeTimings(
      errorResponse("internal_error", "Lists service unavailable", 503, requestId),
      requestId,
      "edge.lists",
      timings,
    );
  }
}

async function handleAuthenticated(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
  mutating: boolean,
): Promise<Response> {
  const execute = async (): Promise<Response> => {
    if (!env.IDENTITY_WORKER) {
      return errorResponse("internal_error", "Authentication service unavailable", 503, requestId);
    }
    if (!env.LISTS_WORKER) {
      return errorResponse("internal_error", "Lists service unavailable", 503, requestId);
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
    const target = new URL(pathname + url.search, "https://lists.internal");
    const init: RequestInit = { method: request.method, headers };
    if (request.method === "POST" || request.method === "PATCH" || request.method === "PUT") {
      init.body = request.body;
    }

    try {
      const downstream = await timings.measure("edge_downstream", () =>
        env.LISTS_WORKER!.fetch(target.toString(), init),
      );
      const response = new Response(downstream.body, {
        status: downstream.status,
        headers: downstream.headers,
      });
      response.headers.set("cache-control", "no-store");
      endTotal();
      return withEdgeTimings(response, requestId, "edge.lists.personal", timings);
    } catch {
      return errorResponse("internal_error", "Lists service unavailable", 503, requestId);
    }
  };

  return mutating ? replayOrExecute(request, requestId, env, "catalog", execute) : execute();
}
