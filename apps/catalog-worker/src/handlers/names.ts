import type { Uuid } from "@saas/db/ids";
import type { Env } from "../env.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import { encodeCursor, parsePageParams } from "../pagination.js";
import { withRepo } from "../repo.js";
import { hydrateTitleSummaries } from "./hydrate.js";
import {
  toPublicCreditBase,
  toPublicGenre,
  toPublicImage,
  toPublicName,
  toPublicNameSummary,
  toPublicTitleSummary,
  toPublicVideo,
} from "../public.js";

const MAX_CREDITS = 500;

function boundedLimit(url: URL, key: string, fallback: number, max: number): number {
  const raw = url.searchParams.get(key);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return fallback;
  return Math.min(value, max);
}

export function handleGetName(env: Env, requestId: string, personId: Uuid): Promise<Response> {
  return withRepo(env, requestId, "catalog.name.get", async ({ repo, timings }) => {
    const result = await timings.measure("db", () => repo.getPersonById(personId));
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    if (result.value.status !== "published") {
      return errorResponse("not_found", "Not found", 404, requestId);
    }

    const [professions, headshots] = await Promise.all([
      repo.listProfessions(personId),
      repo.getPrimaryPersonImages([personId]),
    ]);

    return successResponse(
      {
        name: toPublicName(
          result.value,
          professions.ok ? professions.value : [],
          headshots.ok ? (headshots.value.get(personId) ?? null) : null,
        ),
      },
      requestId,
    );
  });
}

export function handleListNames(request: Request, env: Env, requestId: string): Promise<Response> {
  const url = new URL(request.url);
  const page = parsePageParams(url);
  if (!page.ok) {
    return Promise.resolve(validationError(requestId, { [page.field]: [page.reason] }));
  }

  return withRepo(env, requestId, "catalog.name.list", async ({ repo, timings }) => {
    const { limit, cursor } = page.value;
    const result = await timings.measure("db", () =>
      repo.listPeoplePaged({
        limit,
        cursor: cursor ? { createdAt: cursor.createdAt, id: cursor.id } : null,
      }),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);

    const personIds = result.value.items.map((p) => p.id);
    const headshots = await repo.getPrimaryPersonImages(personIds);
    const headshotByPerson = headshots.ok ? headshots.value : new Map();

    const names = result.value.items.map((person) =>
      toPublicNameSummary(person, [], headshotByPerson.get(person.id) ?? null),
    );
    const nextCursor = result.value.nextCursor
      ? encodeCursor(result.value.nextCursor.createdAt, result.value.nextCursor.id)
      : null;

    return Response.json(
      { data: { names }, meta: { requestId, cursor: nextCursor } },
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
}

export function handleListNameCredits(
  request: Request,
  env: Env,
  requestId: string,
  personId: Uuid,
): Promise<Response> {
  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const department = url.searchParams.get("department");

  return withRepo(env, requestId, "catalog.name.credits", async ({ repo, timings }) => {
    const result = await timings.measure("db", () =>
      repo.listPersonCredits(personId, {
        limit: boundedLimit(url, "limit", 200, MAX_CREDITS),
        ...(category === "cast" || category === "crew" ? { category } : {}),
        ...(department ? { department: department as never } : {}),
      }),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);

    // Reuse the same batched genre + poster hydration a rail uses, then zip the
    // summaries back onto their credits by index (the order is stable).
    const summaries = await timings.measure("hydrate", () =>
      hydrateTitleSummaries(
        repo,
        result.value.map((credit) => credit.title),
      ),
    );

    const credits = result.value.map((credit, index) => ({
      ...toPublicCreditBase(credit),
      title: summaries[index] ?? toPublicTitleSummary(credit.title),
    }));

    return successResponse({ credits }, requestId);
  });
}

export function handleListKnownFor(
  request: Request,
  env: Env,
  requestId: string,
  personId: Uuid,
): Promise<Response> {
  const url = new URL(request.url);
  return withRepo(env, requestId, "catalog.name.known_for", async ({ repo, timings }) => {
    const result = await timings.measure("db", () =>
      repo.listKnownFor(personId, boundedLimit(url, "limit", 4, 12)),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);

    const entries = result.value.filter((entry) => entry.title !== null);
    const summaries = await hydrateTitleSummaries(
      repo,
      entries.map((entry) => entry.title!),
    );

    const knownFor = entries.map((entry, index) => ({
      title: summaries[index] ?? toPublicTitleSummary(entry.title!),
      score: entry.score,
    }));

    return successResponse({ knownFor }, requestId);
  });
}

export function handleListNameImages(
  request: Request,
  env: Env,
  requestId: string,
  personId: Uuid,
): Promise<Response> {
  const url = new URL(request.url);
  return withRepo(env, requestId, "catalog.name.images", async ({ repo, timings }) => {
    const result = await timings.measure("db", () =>
      repo.listPersonImages(personId, boundedLimit(url, "limit", 48, 200)),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ images: result.value.map(toPublicImage) }, requestId);
  });
}

export function handleListNameVideos(
  request: Request,
  env: Env,
  requestId: string,
  personId: Uuid,
): Promise<Response> {
  const url = new URL(request.url);
  return withRepo(env, requestId, "catalog.name.videos", async ({ repo, timings }) => {
    const result = await timings.measure("db", () =>
      repo.listPersonVideos(personId, boundedLimit(url, "limit", 24, 200)),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ videos: result.value.map(toPublicVideo) }, requestId);
  });
}

/** Genres are a small closed vocabulary — the browse surface loads them once. */
export function handleListGenres(env: Env, requestId: string): Promise<Response> {
  return withRepo(env, requestId, "catalog.genres.list", async ({ repo, timings }) => {
    const result = await timings.measure("db", () => repo.listAllGenres());
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ genres: result.value.map(toPublicGenre) }, requestId);
  });
}
