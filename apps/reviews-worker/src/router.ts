import { createSqlExecutor } from "@saas/db/hyperdrive";
import {
  createReviewsRepository,
  METASCORE_MIXED_MIN,
  METASCORE_POSITIVE_MIN,
  REVIEW_SORTS,
} from "@saas/db/reviews";
import type {
  CriticReview,
  Metascore,
  ReviewSort,
  ReviewsRepository,
  UserReview,
} from "@saas/db/reviews";
import type { Uuid } from "@saas/db/ids";
import { createTimings } from "@saas/contracts/timing";
import type {
  ModeratedReview,
  PublicCriticReview,
  PublicMetascore,
  PublicReview,
} from "@saas/contracts/reviews";
import type { Env } from "./env.js";
import {
  errorResponse,
  methodNotAllowed,
  notFound,
  successResponse,
  validationError,
  withTimings,
} from "./http.js";
import { generateRequestId, newUuid, titlePublicId } from "./ids.js";
import { uuidToHex } from "@saas/db/ids";

const REQUEST_ID_RE = /^[\w-]{1,128}$/;
const REVIEW_PREFIX = "rv";
const MAX_HEADLINE = 300;
const MAX_BODY = 20_000;
const MAX_PAGE = 100;

const TITLE_REVIEWS_RE = /^\/v1\/titles\/([^/]+)\/reviews$/;
const TITLE_CRITIC_RE = /^\/v1\/titles\/([^/]+)\/critic-reviews$/;
const TITLE_METASCORE_RE = /^\/v1\/titles\/([^/]+)\/metascore$/;
const REVIEW_RE = /^\/v1\/reviews\/([^/]+)$/;
const REVIEW_VOTE_RE = /^\/v1\/reviews\/([^/]+)\/vote$/;
const USER_REVIEWS_RE = /^\/v1\/users\/([^/]+)\/reviews$/;
const MODERATION_QUEUE = "/v1/moderation/reviews";
const MODERATION_DECISION_RE = /^\/v1\/moderation\/reviews\/([^/]+)\/decision$/;

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

function subjectUuid(subjectId: string): Uuid | null {
  const sep = subjectId.indexOf("_");
  const hex = sep === -1 ? subjectId : subjectId.slice(sep + 1);
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as Uuid;
}

export function reviewPublicId(uuid: string): string {
  return `${REVIEW_PREFIX}_${uuidToHex(uuid)}`;
}

export function parseReviewPublicId(publicId: string): Uuid | null {
  if (!publicId.startsWith(`${REVIEW_PREFIX}_`)) return null;
  return subjectUuid(publicId);
}

function userPublicId(uuid: string): string {
  return `usr_${uuidToHex(uuid)}`;
}

export function toPublicReview(review: UserReview): PublicReview {
  return {
    id: reviewPublicId(review.id),
    titleId: titlePublicId(review.titleId),
    authorId: userPublicId(review.userId),
    headline: review.headline,
    body: review.body,
    rating: review.rating,
    hasSpoilers: review.hasSpoilers,
    helpfulCount: review.helpfulCount,
    unhelpfulCount: review.unhelpfulCount,
    submittedAt: review.submittedAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
  };
}

/** Moderator view — the state and decision note a reader must never see. */
export function toModeratedReview(review: UserReview): ModeratedReview {
  return {
    ...toPublicReview(review),
    state: review.state,
    moderatedAt: review.moderatedAt ? review.moderatedAt.toISOString() : null,
    decisionNote: review.decisionNote,
  };
}

function toPublicCritic(review: CriticReview): PublicCriticReview {
  return {
    id: review.id,
    publication: review.publication,
    author: review.author,
    url: review.url,
    quote: review.quote,
    score: review.score,
    publishedOn: review.publishedOn,
  };
}

export function toPublicMetascore(metascore: Metascore): PublicMetascore {
  // Band is derived once here so the pill's colour cannot drift between the
  // web app, the SDK and any other consumer.
  const band =
    metascore.metascore === null
      ? null
      : metascore.metascore >= METASCORE_POSITIVE_MIN
        ? "positive"
        : metascore.metascore >= METASCORE_MIXED_MIN
          ? "mixed"
          : "negative";
  return {
    metascore: metascore.metascore,
    criticCount: metascore.criticCount,
    positiveCount: metascore.positiveCount,
    mixedCount: metascore.mixedCount,
    negativeCount: metascore.negativeCount,
    band,
  };
}

function parseTitleId(raw: string): Uuid | null {
  if (!raw.startsWith("tt_")) return null;
  return subjectUuid(raw);
}

function boundedPage(url: URL): { limit: number; offset: number } | { error: string; field: string } {
  const limitRaw = url.searchParams.get("limit");
  let limit = 25;
  if (limitRaw !== null) {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PAGE) {
      return { field: "limit", error: `Must be an integer between 1 and ${MAX_PAGE}` };
    }
    limit = parsed;
  }
  const offsetRaw = url.searchParams.get("offset");
  let offset = 0;
  if (offsetRaw !== null) {
    const parsed = Number(offsetRaw);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_000) {
      return { field: "offset", error: "Must be an integer between 0 and 10000" };
    }
    offset = parsed;
  }
  return { limit, offset };
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
          service: "reviews-worker",
          environment: env.ENVIRONMENT ?? "local",
          timestamp: new Date().toISOString(),
          checks: { database: { configured: !!env.PLATFORM_DB } },
        },
        requestId,
      );
    }

    const titleReviews = url.pathname.match(TITLE_REVIEWS_RE);
    if (titleReviews) {
      const titleId = parseTitleId(titleReviews[1]!);
      if (!titleId) return notFound(requestId, url.pathname);
      if (request.method === "GET") return listTitleReviews(url, env, requestId, titleId);
      if (request.method === "POST") return createReview(request, env, requestId, titleId);
      return methodNotAllowed(requestId);
    }

    const critic = url.pathname.match(TITLE_CRITIC_RE);
    if (critic) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      const titleId = parseTitleId(critic[1]!);
      if (!titleId) return notFound(requestId, url.pathname);
      return listCriticReviews(env, requestId, titleId);
    }

    const metascore = url.pathname.match(TITLE_METASCORE_RE);
    if (metascore) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      const titleId = parseTitleId(metascore[1]!);
      if (!titleId) return notFound(requestId, url.pathname);
      return getMetascore(env, requestId, titleId);
    }

    const vote = url.pathname.match(REVIEW_VOTE_RE);
    if (vote) {
      const reviewId = parseReviewPublicId(vote[1]!);
      if (!reviewId) return notFound(requestId, url.pathname);
      if (request.method === "POST") return voteReview(request, env, requestId, reviewId);
      if (request.method === "DELETE") return clearVote(request, env, requestId, reviewId);
      return methodNotAllowed(requestId);
    }

    const decision = url.pathname.match(MODERATION_DECISION_RE);
    if (decision) {
      if (request.method !== "POST") return methodNotAllowed(requestId);
      const reviewId = parseReviewPublicId(decision[1]!);
      if (!reviewId) return notFound(requestId, url.pathname);
      return moderateReview(request, env, requestId, reviewId);
    }

    if (url.pathname === MODERATION_QUEUE) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      return listModerationQueue(url, request, env, requestId);
    }

    const review = url.pathname.match(REVIEW_RE);
    if (review) {
      const reviewId = parseReviewPublicId(review[1]!);
      if (!reviewId) return notFound(requestId, url.pathname);
      if (request.method === "GET") return getReview(env, requestId, reviewId);
      if (request.method === "PATCH") return updateReview(request, env, requestId, reviewId);
      if (request.method === "DELETE") return deleteReview(request, env, requestId, reviewId);
      return methodNotAllowed(requestId);
    }

    const userReviews = url.pathname.match(USER_REVIEWS_RE);
    if (userReviews) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      const userId = subjectUuid(userReviews[1]!);
      if (!userId) return notFound(requestId, url.pathname);
      return listUserReviews(url, env, requestId, userId);
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
  fn: (repo: ReviewsRepository, timings: ReturnType<typeof createTimings>) => Promise<Response>,
): Promise<Response> {
  if (!env.PLATFORM_DB) {
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  const timings = createTimings();
  const endTotal = timings.start("total");
  const executor = createSqlExecutor(env.PLATFORM_DB);
  try {
    const response = await fn(createReviewsRepository(executor), timings);
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

function listTitleReviews(
  url: URL,
  env: Env,
  requestId: string,
  titleId: Uuid,
): Promise<Response> {
  const page = boundedPage(url);
  if ("error" in page) {
    return Promise.resolve(validationError(requestId, { [page.field]: [page.error] }));
  }
  const sortRaw = url.searchParams.get("sort") ?? "helpfulness";
  if (!(REVIEW_SORTS as readonly string[]).includes(sortRaw)) {
    return Promise.resolve(
      validationError(requestId, { sort: [`Must be one of: ${REVIEW_SORTS.join(", ")}`] }),
    );
  }
  // Spoilers are hidden unless explicitly requested — the veil is the default.
  const includeSpoilers = url.searchParams.get("spoilers") === "show";

  return withRepo(env, requestId, "reviews.title.list", async (repo, timings) => {
    const result = await timings.measure("db", () =>
      repo.listTitleReviews(titleId, {
        sort: sortRaw as ReviewSort,
        includeSpoilers,
        limit: page.limit,
        offset: page.offset,
      }),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ reviews: result.value.map(toPublicReview) }, requestId);
  });
}

async function createReview(
  request: Request,
  env: Env,
  requestId: string,
  titleId: Uuid,
): Promise<Response> {
  const actor = resolveActor(request);
  const userId = actor ? subjectUuid(actor.subjectId) : null;
  if (!userId) return errorResponse("unauthenticated", "Authentication required", 401, requestId);

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("bad");
    body = parsed as Record<string, unknown>;
  } catch {
    return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);
  }

  const errors: Record<string, string[]> = {};
  const headline = typeof body.headline === "string" ? body.headline.trim() : "";
  if (headline.length === 0) errors.headline = ["Required"];
  else if (headline.length > MAX_HEADLINE) {
    errors.headline = [`Must be at most ${MAX_HEADLINE} characters`];
  }
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text.length === 0) errors.body = ["Required"];
  else if (text.length > MAX_BODY) errors.body = [`Must be at most ${MAX_BODY} characters`];

  let rating: number | null = null;
  if (body.rating !== undefined && body.rating !== null) {
    if (
      typeof body.rating !== "number" ||
      !Number.isInteger(body.rating) ||
      body.rating < 1 ||
      body.rating > 10
    ) {
      errors.rating = ["Must be an integer between 1 and 10"];
    } else {
      rating = body.rating;
    }
  }
  const hasSpoilers = body.hasSpoilers === true;
  if (body.hasSpoilers !== undefined && typeof body.hasSpoilers !== "boolean") {
    errors.hasSpoilers = ["Must be a boolean"];
  }

  if (Object.keys(errors).length > 0) return validationError(requestId, errors);

  return withRepo(env, requestId, "reviews.create", async (repo, timings) => {
    const result = await timings.measure("db", () =>
      repo.createReview({
        id: newUuid(),
        titleId,
        userId,
        headline,
        body: text,
        rating,
        hasSpoilers,
        now: new Date(),
      }),
    );
    if (!result.ok) {
      return result.error.kind === "conflict"
        ? errorResponse("conflict", "You have already reviewed this title", 409, requestId)
        : errorResponse("internal_error", "Service unavailable", 503, requestId);
    }
    return successResponse({ review: toPublicReview(result.value) }, requestId, 201);
  });
}

async function updateReview(
  request: Request,
  env: Env,
  requestId: string,
  reviewId: Uuid,
): Promise<Response> {
  const actor = resolveActor(request);
  const userId = actor ? subjectUuid(actor.subjectId) : null;
  if (!userId) return errorResponse("unauthenticated", "Authentication required", 401, requestId);

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("bad");
    body = parsed as Record<string, unknown>;
  } catch {
    return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);
  }

  const errors: Record<string, string[]> = {};
  const patch: Record<string, unknown> = {};
  if ("headline" in body) {
    const value = typeof body.headline === "string" ? body.headline.trim() : "";
    if (value.length === 0 || value.length > MAX_HEADLINE) errors.headline = ["Invalid headline"];
    else patch.headline = value;
  }
  if ("body" in body) {
    const value = typeof body.body === "string" ? body.body.trim() : "";
    if (value.length === 0 || value.length > MAX_BODY) errors.body = ["Invalid body"];
    else patch.body = value;
  }
  if ("rating" in body) {
    if (body.rating === null) patch.rating = null;
    else if (
      typeof body.rating !== "number" ||
      !Number.isInteger(body.rating) ||
      body.rating < 1 ||
      body.rating > 10
    ) {
      errors.rating = ["Must be an integer between 1 and 10"];
    } else patch.rating = body.rating;
  }
  if ("hasSpoilers" in body) {
    if (typeof body.hasSpoilers !== "boolean") errors.hasSpoilers = ["Must be a boolean"];
    else patch.hasSpoilers = body.hasSpoilers;
  }
  if (Object.keys(errors).length > 0) return validationError(requestId, errors);

  return withRepo(env, requestId, "reviews.update", async (repo, timings) => {
    const result = await timings.measure("db", () =>
      repo.updateReview(reviewId, userId, patch, new Date()),
    );
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    return successResponse({ review: toPublicReview(result.value) }, requestId);
  });
}

function deleteReview(
  request: Request,
  env: Env,
  requestId: string,
  reviewId: Uuid,
): Promise<Response> {
  const actor = resolveActor(request);
  const userId = actor ? subjectUuid(actor.subjectId) : null;
  if (!userId) {
    return Promise.resolve(
      errorResponse("unauthenticated", "Authentication required", 401, requestId),
    );
  }
  return withRepo(env, requestId, "reviews.delete", async (repo, timings) => {
    const result = await timings.measure("db", () =>
      repo.deleteReview(reviewId, userId, new Date()),
    );
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    return new Response(null, { status: 204 });
  });
}

function getReview(env: Env, requestId: string, reviewId: Uuid): Promise<Response> {
  return withRepo(env, requestId, "reviews.get", async (repo, timings) => {
    const result = await timings.measure("db", () => repo.getReview(reviewId));
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    // A pending or rejected review is not public — it reads as absent.
    if (result.value.state !== "published") {
      return errorResponse("not_found", "Not found", 404, requestId);
    }
    return successResponse({ review: toPublicReview(result.value) }, requestId);
  });
}

function listUserReviews(url: URL, env: Env, requestId: string, userId: Uuid): Promise<Response> {
  const page = boundedPage(url);
  if ("error" in page) {
    return Promise.resolve(validationError(requestId, { [page.field]: [page.error] }));
  }
  return withRepo(env, requestId, "reviews.user.list", async (repo, timings) => {
    const result = await timings.measure("db", () => repo.listUserReviews(userId, page));
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ reviews: result.value.map(toPublicReview) }, requestId);
  });
}

async function voteReview(
  request: Request,
  env: Env,
  requestId: string,
  reviewId: Uuid,
): Promise<Response> {
  const actor = resolveActor(request);
  const userId = actor ? subjectUuid(actor.subjectId) : null;
  if (!userId) return errorResponse("unauthenticated", "Authentication required", 401, requestId);

  let helpful: unknown;
  try {
    helpful = ((await request.json()) as { helpful?: unknown })?.helpful;
  } catch {
    return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);
  }
  if (typeof helpful !== "boolean") {
    return validationError(requestId, { helpful: ["Must be a boolean"] });
  }

  return withRepo(env, requestId, "reviews.vote", async (repo, timings) => {
    const result = await timings.measure("db", () => repo.voteReview(reviewId, userId, helpful));
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    return successResponse({ review: toPublicReview(result.value) }, requestId);
  });
}

function clearVote(
  request: Request,
  env: Env,
  requestId: string,
  reviewId: Uuid,
): Promise<Response> {
  const actor = resolveActor(request);
  const userId = actor ? subjectUuid(actor.subjectId) : null;
  if (!userId) {
    return Promise.resolve(
      errorResponse("unauthenticated", "Authentication required", 401, requestId),
    );
  }
  return withRepo(env, requestId, "reviews.vote.clear", async (repo, timings) => {
    const result = await timings.measure("db", () => repo.clearVote(reviewId, userId));
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    return successResponse({ review: toPublicReview(result.value) }, requestId);
  });
}

function listCriticReviews(env: Env, requestId: string, titleId: Uuid): Promise<Response> {
  return withRepo(env, requestId, "reviews.critic.list", async (repo, timings) => {
    const result = await timings.measure("db", () => repo.listCriticReviews(titleId, 50));
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ criticReviews: result.value.map(toPublicCritic) }, requestId);
  });
}

function getMetascore(env: Env, requestId: string, titleId: Uuid): Promise<Response> {
  return withRepo(env, requestId, "reviews.metascore.get", async (repo, timings) => {
    const result = await timings.measure("db", () => repo.getMetascore(titleId));
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ metascore: toPublicMetascore(result.value) }, requestId);
  });
}

function listModerationQueue(
  url: URL,
  request: Request,
  env: Env,
  requestId: string,
): Promise<Response> {
  const actor = resolveActor(request);
  if (!actor) {
    return Promise.resolve(
      errorResponse("unauthenticated", "Authentication required", 401, requestId),
    );
  }
  const page = boundedPage(url);
  if ("error" in page) {
    return Promise.resolve(validationError(requestId, { [page.field]: [page.error] }));
  }
  return withRepo(env, requestId, "reviews.moderation.list", async (repo, timings) => {
    const result = await timings.measure("db", () => repo.listModerationQueue(page));
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ reviews: result.value.map(toModeratedReview) }, requestId);
  });
}

async function moderateReview(
  request: Request,
  env: Env,
  requestId: string,
  reviewId: Uuid,
): Promise<Response> {
  const actor = resolveActor(request);
  const moderatorId = actor ? subjectUuid(actor.subjectId) : null;
  if (!moderatorId) {
    return errorResponse("unauthenticated", "Authentication required", 401, requestId);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object") throw new Error("bad");
    body = parsed as Record<string, unknown>;
  } catch {
    return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);
  }

  const state = body.state;
  if (state !== "published" && state !== "rejected") {
    return validationError(requestId, { state: ["Must be published or rejected"] });
  }
  const note = typeof body.note === "string" ? body.note.slice(0, 2_000) : null;

  return withRepo(env, requestId, "reviews.moderate", async (repo, timings) => {
    const result = await timings.measure("db", () =>
      repo.moderateReview(reviewId, moderatorId, state, note, new Date()),
    );
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    return successResponse({ review: toModeratedReview(result.value) }, requestId);
  });
}
