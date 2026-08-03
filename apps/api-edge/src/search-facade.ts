import type { Env } from "./env.js";
import { errorResponse, withEdgeTimings } from "./http.js";
import { enforceRateLimit, mergeRateLimitHeaders } from "./rate-limit.js";
import { createTimings } from "@saas/contracts/timing";

const SEARCH_ROUTES = [
  /^\/v1\/search$/,
  /^\/v1\/search\/suggest$/,
  /^\/v1\/search\/titles$/,
  /^\/v1\/search\/names$/,
];

/**
 * The internal publish seam is service-binding only. Guarding it here as well
 * as in the worker means a route added later cannot accidentally expose it.
 */
const INTERNAL_PREFIX = "/v1/internal/";

export function isSearchRoute(pathname: string): boolean {
  if (pathname.startsWith(INTERNAL_PREFIX)) return false;
  return SEARCH_ROUTES.some((re) => re.test(pathname));
}

/**
 * Typeahead is answered on every keystroke, so its cache window is short but
 * non-zero: repeated prefixes within a few seconds are common and should not
 * each reach Postgres. Result pages get a little longer.
 */
function cacheControlFor(pathname: string): string {
  if (pathname === "/v1/search/suggest") {
    return "public, max-age=30, stale-while-revalidate=120";
  }
  return "public, max-age=60, stale-while-revalidate=300";
}

export async function handleSearchRoute(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }
  if (!env.SEARCH_WORKER) {
    return errorResponse("internal_error", "Search service unavailable", 503, requestId);
  }

  const timings = createTimings();
  const endTotal = timings.start("edge_total");

  const rate = await timings.measure("edge_ratelimit", () =>
    enforceRateLimit(request, requestId, env, "catalog"),
  );
  if (rate.kind === "denied") {
    endTotal();
    return withEdgeTimings(rate.response, requestId, "edge.search", timings);
  }

  const headers = new Headers();
  headers.set("x-request-id", requestId);
  const traceparent = request.headers.get("traceparent");
  if (traceparent) headers.set("traceparent", traceparent);

  const url = new URL(request.url);
  const target = new URL(pathname + url.search, "https://search.internal");

  try {
    const downstream = await timings.measure("edge_downstream", () =>
      env.SEARCH_WORKER!.fetch(target.toString(), { method: "GET", headers }),
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
      "edge.search",
      timings,
    );
  } catch {
    endTotal();
    return withEdgeTimings(
      errorResponse("internal_error", "Search service unavailable", 503, requestId),
      requestId,
      "edge.search",
      timings,
    );
  }
}
