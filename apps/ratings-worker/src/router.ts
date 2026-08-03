import { createSqlExecutor } from "@saas/db/hyperdrive";
import {
  CHARTS,
  createRatingsRepository,
  DEMOGRAPHIC_PRIVACY_FLOOR,
  priorMeanOf,
  roundRating,
  weightedRating,
} from "@saas/db/ratings";
import type { ChartKey, RatingsRepository, TitleAggregate } from "@saas/db/ratings";
import type { Uuid } from "@saas/db/ids";
import { createTimings } from "@saas/contracts/timing";
import type { PublicChartEntry, PublicTitleRating } from "@saas/contracts/ratings";
import type { Env } from "./env.js";
import {
  errorResponse,
  methodNotAllowed,
  notFound,
  successResponse,
  validationError,
  withTimings,
} from "./http.js";
import {
  generateRequestId,
  namePublicId,
  parseNamePublicId,
  parseTitlePublicId,
  titlePublicId,
} from "./ids.js";

const REQUEST_ID_RE = /^[\w-]{1,128}$/;
const MAX_CHART_LIMIT = 250;
const MAX_RATINGS_PAGE = 100;
/** Cap on the candidate scan a chart rebuild reads. */
const CHART_CANDIDATE_CAP = 20_000;

const TITLE_RATING_RE = /^\/v1\/titles\/([^/]+)\/rating$/;
const TITLE_DEMOGRAPHICS_RE = /^\/v1\/titles\/([^/]+)\/rating\/demographics$/;
const TITLE_POPULARITY_RE = /^\/v1\/titles\/([^/]+)\/popularity$/;
const NAME_POPULARITY_RE = /^\/v1\/names\/([^/]+)\/popularity$/;
const CHART_RE = /^\/v1\/charts\/([a-z_]+)$/;
const ME_RATINGS_RE = /^\/v1\/me\/ratings$/;
const ME_RATING_RE = /^\/v1\/me\/ratings\/([^/]+)$/;
const INTERNAL_RECOMPUTE = "/v1/internal/ratings/charts/recompute";

export interface ActorContext {
  subjectId: string;
  subjectType: string;
}

function resolveRequestId(request: Request): string {
  const header = request.headers.get("x-request-id");
  if (header && REQUEST_ID_RE.test(header)) return header;
  return generateRequestId();
}

function resolveActor(request: Request): ActorContext | null {
  const subjectId = request.headers.get("x-actor-subject-id");
  const subjectType = request.headers.get("x-actor-subject-type");
  if (!subjectId || !subjectType) return null;
  return { subjectId, subjectType };
}

/** Actor ids arrive as `usr_…`/`sp_…`; ratings only ever key on the uuid. */
function actorUuid(actor: ActorContext): Uuid | null {
  const sep = actor.subjectId.indexOf("_");
  const hex = sep === -1 ? actor.subjectId : actor.subjectId.slice(sep + 1);
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as Uuid;
}

export function toPublicRating(aggregate: TitleAggregate): PublicTitleRating {
  const total = aggregate.voteCount;
  return {
    titleId: titlePublicId(aggregate.titleId),
    average: aggregate.average,
    voteCount: total,
    distribution: aggregate.distribution.buckets.map((bucket) => ({
      value: bucket.value,
      count: bucket.count,
      // Precomputed so the histogram needs no client-side division, and so an
      // empty title renders a flat chart rather than NaN bars.
      share: total > 0 ? Math.round((bucket.count / total) * 10_000) / 10_000 : 0,
    })),
  };
}

export function toPublicChartEntry(entry: {
  rank: number;
  previousRank: number | null;
  titleId: string;
  score: number;
}): PublicChartEntry {
  return {
    rank: entry.rank,
    previousRank: entry.previousRank,
    // Negative means "moved up" — the arrow direction, computed once here.
    delta: entry.previousRank === null ? null : entry.rank - entry.previousRank,
    titleId: titlePublicId(entry.titleId),
    score: entry.score,
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
          service: "ratings-worker",
          environment: env.ENVIRONMENT ?? "local",
          timestamp: new Date().toISOString(),
          checks: { database: { configured: !!env.PLATFORM_DB } },
        },
        requestId,
      );
    }

    if (url.pathname === INTERNAL_RECOMPUTE) {
      if (request.method !== "POST") return methodNotAllowed(requestId);
      return recomputeCharts(request, env, requestId);
    }

    const demographics = url.pathname.match(TITLE_DEMOGRAPHICS_RE);
    if (demographics) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      const titleId = parseTitlePublicId(demographics[1]!);
      if (!titleId) return notFound(requestId, url.pathname);
      return getDemographics(env, requestId, titleId);
    }

    const rating = url.pathname.match(TITLE_RATING_RE);
    if (rating) {
      const titleId = parseTitlePublicId(rating[1]!);
      if (!titleId) return notFound(requestId, url.pathname);
      if (request.method === "GET") return getRating(env, requestId, titleId);
      if (request.method === "PUT") return putRating(request, env, requestId, titleId);
      if (request.method === "DELETE") return deleteRating(request, env, requestId, titleId);
      return methodNotAllowed(requestId);
    }

    const titlePopularity = url.pathname.match(TITLE_POPULARITY_RE);
    if (titlePopularity) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      const titleId = parseTitlePublicId(titlePopularity[1]!);
      if (!titleId) return notFound(requestId, url.pathname);
      return getPopularity(env, requestId, "title", titleId);
    }

    const namePopularity = url.pathname.match(NAME_POPULARITY_RE);
    if (namePopularity) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      const personId = parseNamePublicId(namePopularity[1]!);
      if (!personId) return notFound(requestId, url.pathname);
      return getPopularity(env, requestId, "person", personId);
    }

    const chart = url.pathname.match(CHART_RE);
    if (chart) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      return getChart(url, env, requestId, chart[1]!);
    }

    const meRating = url.pathname.match(ME_RATING_RE);
    if (meRating) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      const titleId = parseTitlePublicId(meRating[1]!);
      if (!titleId) return notFound(requestId, url.pathname);
      return getMyRating(request, env, requestId, titleId);
    }

    if (ME_RATINGS_RE.test(url.pathname)) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      return listMyRatings(url, request, env, requestId);
    }

    return notFound(requestId, url.pathname);
  } catch {
    return errorResponse("internal_error", "An unexpected error occurred", 500, requestId);
  }
}

async function withRepo(
  env: Env,
  requestId: string,
  routeName: string,
  fn: (repo: RatingsRepository, timings: ReturnType<typeof createTimings>) => Promise<Response>,
): Promise<Response> {
  if (!env.PLATFORM_DB) {
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  const timings = createTimings();
  const endTotal = timings.start("total");
  const executor = createSqlExecutor(env.PLATFORM_DB);
  try {
    const response = await fn(createRatingsRepository(executor), timings);
    endTotal();
    return withTimings(response, requestId, routeName, timings);
  } catch {
    endTotal();
    return withTimings(
      errorResponse("internal_error", "Service unavailable", 503, requestId),
      requestId,
      routeName,
      timings,
    );
  } finally {
    await executor.dispose();
  }
}

function getRating(env: Env, requestId: string, titleId: Uuid): Promise<Response> {
  return withRepo(env, requestId, "ratings.title.get", async (repo, timings) => {
    const result = await timings.measure("db", () => repo.getAggregate(titleId));
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ rating: toPublicRating(result.value) }, requestId);
  });
}

function getDemographics(env: Env, requestId: string, titleId: Uuid): Promise<Response> {
  return withRepo(env, requestId, "ratings.title.demographics", async (repo, timings) => {
    const result = await timings.measure("db", () => repo.getDemographics(titleId));
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse(
      { demographics: result.value, privacyFloor: DEMOGRAPHIC_PRIVACY_FLOOR },
      requestId,
    );
  });
}

async function putRating(
  request: Request,
  env: Env,
  requestId: string,
  titleId: Uuid,
): Promise<Response> {
  const actor = resolveActor(request);
  if (!actor) return errorResponse("unauthenticated", "Authentication required", 401, requestId);
  const userId = actorUuid(actor);
  if (!userId) return errorResponse("unauthenticated", "Authentication required", 401, requestId);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);
  }

  const value = (body as { value?: unknown })?.value;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 10) {
    return validationError(requestId, { value: ["Must be an integer between 1 and 10"] });
  }

  return withRepo(env, requestId, "ratings.title.put", async (repo, timings) => {
    const result = await timings.measure("db", () =>
      repo.rateTitle({ userId, titleId, value, now: new Date() }),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse(
      { rating: toPublicRating(result.value), yourRating: value },
      requestId,
    );
  });
}

function deleteRating(
  request: Request,
  env: Env,
  requestId: string,
  titleId: Uuid,
): Promise<Response> {
  const actor = resolveActor(request);
  if (!actor) {
    return Promise.resolve(
      errorResponse("unauthenticated", "Authentication required", 401, requestId),
    );
  }
  const userId = actorUuid(actor);
  if (!userId) {
    return Promise.resolve(
      errorResponse("unauthenticated", "Authentication required", 401, requestId),
    );
  }

  return withRepo(env, requestId, "ratings.title.delete", async (repo, timings) => {
    const result = await timings.measure("db", () =>
      repo.removeRating(userId, titleId, new Date()),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    // Removing a rating you never cast is success, not 404 — the caller's
    // intent ("I have no rating on this") is satisfied either way.
    return successResponse({ rating: toPublicRating(result.value) }, requestId);
  });
}

function getPopularity(
  env: Env,
  requestId: string,
  entityType: "title" | "person",
  entityId: Uuid,
): Promise<Response> {
  return withRepo(env, requestId, "ratings.popularity.get", async (repo, timings) => {
    const result = await timings.measure("db", () => repo.getPopularity(entityType, entityId));
    if (!result.ok) {
      // Absent from the meter is a normal state, not an error.
      return successResponse({ popularity: null }, requestId);
    }
    const entry = result.value;
    return successResponse(
      {
        popularity: {
          rank: entry.rank,
          previousRank: entry.previousRank,
          delta: entry.previousRank === null ? null : entry.rank - entry.previousRank,
          computedFor: entry.computedFor,
          entityId: entityType === "title" ? titlePublicId(entry.entityId) : namePublicId(entry.entityId),
        },
      },
      requestId,
    );
  });
}

function getChart(url: URL, env: Env, requestId: string, chart: string): Promise<Response> {
  if (!(CHARTS as readonly string[]).includes(chart)) {
    return Promise.resolve(notFound(requestId, url.pathname));
  }
  const limitRaw = url.searchParams.get("limit");
  let limit = MAX_CHART_LIMIT;
  if (limitRaw !== null) {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_CHART_LIMIT) {
      return Promise.resolve(
        validationError(requestId, {
          limit: [`Must be an integer between 1 and ${MAX_CHART_LIMIT}`],
        }),
      );
    }
    limit = parsed;
  }

  return withRepo(env, requestId, "ratings.chart.get", async (repo, timings) => {
    const result = await timings.measure("db", () => repo.listChart(chart as ChartKey, limit));
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse(
      {
        chart,
        computedFor: result.value[0]?.computedFor ?? null,
        entries: result.value.map(toPublicChartEntry),
      },
      requestId,
    );
  });
}

function getMyRating(
  request: Request,
  env: Env,
  requestId: string,
  titleId: Uuid,
): Promise<Response> {
  const actor = resolveActor(request);
  const userId = actor ? actorUuid(actor) : null;
  if (!userId) {
    return Promise.resolve(
      errorResponse("unauthenticated", "Authentication required", 401, requestId),
    );
  }

  return withRepo(env, requestId, "ratings.me.get", async (repo, timings) => {
    const result = await timings.measure("db", () => repo.getUserRating(userId, titleId));
    if (!result.ok) return successResponse({ rating: null }, requestId);
    return successResponse(
      {
        rating: {
          titleId: titlePublicId(result.value.titleId),
          value: result.value.value,
          ratedAt: result.value.ratedAt.toISOString(),
        },
      },
      requestId,
    );
  });
}

function listMyRatings(
  url: URL,
  request: Request,
  env: Env,
  requestId: string,
): Promise<Response> {
  const actor = resolveActor(request);
  const userId = actor ? actorUuid(actor) : null;
  if (!userId) {
    return Promise.resolve(
      errorResponse("unauthenticated", "Authentication required", 401, requestId),
    );
  }

  const limitRaw = url.searchParams.get("limit");
  let limit = 50;
  if (limitRaw !== null) {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_RATINGS_PAGE) {
      return Promise.resolve(
        validationError(requestId, {
          limit: [`Must be an integer between 1 and ${MAX_RATINGS_PAGE}`],
        }),
      );
    }
    limit = parsed;
  }
  const offsetRaw = url.searchParams.get("offset");
  let offset = 0;
  if (offsetRaw !== null) {
    const parsed = Number(offsetRaw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return Promise.resolve(
        validationError(requestId, { offset: ["Must be a non-negative integer"] }),
      );
    }
    offset = parsed;
  }

  return withRepo(env, requestId, "ratings.me.list", async (repo, timings) => {
    const result = await timings.measure("db", () => repo.listUserRatings(userId, { limit, offset }));
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse(
      {
        ratings: result.value.map((entry) => ({
          titleId: titlePublicId(entry.titleId),
          value: entry.value,
          ratedAt: entry.ratedAt.toISOString(),
        })),
      },
      requestId,
    );
  });
}

/**
 * Rebuild a chart snapshot. Internal (service-binding/cron) only — a chart is
 * a snapshot precisely so that reads never pay for this.
 */
async function recomputeCharts(request: Request, env: Env, requestId: string): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const chart = (body as { chart?: unknown })?.chart;
  if (typeof chart !== "string" || !(CHARTS as readonly string[]).includes(chart)) {
    return validationError(requestId, { chart: [`Must be one of: ${CHARTS.join(", ")}`] });
  }
  const computedForRaw = (body as { computedFor?: unknown })?.computedFor;
  const computedFor =
    typeof computedForRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(computedForRaw)
      ? computedForRaw
      : new Date().toISOString().slice(0, 10);

  return withRepo(env, requestId, "ratings.chart.recompute", async (repo, timings) => {
    const definition = await timings.measure("db", () =>
      repo.getChartDefinition(chart as ChartKey),
    );
    if (!definition.ok) return notFound(requestId, `/v1/charts/${chart}`);

    const candidates = await repo.listChartCandidates(
      definition.value.minimumVotes,
      CHART_CANDIDATE_CAP,
    );
    if (!candidates.ok) {
      return errorResponse("internal_error", "Service unavailable", 503, requestId);
    }

    // The prior is the mean of the *eligible population*, not the whole
    // catalog — TV and film rate differently, and each chart should be
    // regressed toward its own centre.
    const prior = priorMeanOf(candidates.value, definition.value.priorMean);
    const ranked = candidates.value
      .map((candidate) => ({
        titleId: candidate.titleId,
        score: roundRating(
          weightedRating(
            candidate.voteCount,
            candidate.average,
            definition.value.minimumVotes,
            prior,
          ),
        ),
      }))
      .sort((a, b) =>
        chart === "bottom_movies" ? a.score - b.score : b.score - a.score,
      )
      .slice(0, definition.value.size);

    const written = await repo.replaceChart(chart as ChartKey, computedFor, ranked);
    if (!written.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);

    return successResponse(
      { chart, computedFor, entries: written.value, priorMean: roundRating(prior) },
      requestId,
    );
  });
}
