import type { Uuid } from "@saas/db/ids";
import type { RecordStatus, TitleKind, TitleListFilters } from "@saas/db/catalog";
import { TITLE_KINDS } from "@saas/db/catalog";
import type { Env } from "../env.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import { encodeCursor, parsePageParams } from "../pagination.js";
import { withRepo } from "../repo.js";
import { hydrateTitleSummaries } from "./hydrate.js";
import {
  toPublicAka,
  toPublicBoxOffice,
  toPublicCertificate,
  toPublicConnection,
  toPublicCreditBase,
  toPublicExternalId,
  toPublicGenre,
  toPublicImage,
  toPublicKeyword,
  toPublicLocation,
  toPublicNameSummary,
  toPublicReleaseDate,
  toPublicSeason,
  toPublicTechnicalSpec,
  toPublicTitle,
  toPublicTitleCompany,
  toPublicEpisode,
  toPublicVideo,
} from "../public.js";

const MAX_CREDITS = 500;
const MAX_MEDIA = 200;

function parseKinds(url: URL): TitleKind[] | undefined {
  const values = url.searchParams.getAll("kind").flatMap((v) => v.split(","));
  const kinds = values.filter((v): v is TitleKind => (TITLE_KINDS as readonly string[]).includes(v));
  return kinds.length > 0 ? kinds : undefined;
}

function parseYear(url: URL, key: string): number | null {
  const raw = url.searchParams.get(key);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

function boundedLimit(url: URL, key: string, fallback: number, max: number): number {
  const raw = url.searchParams.get(key);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return fallback;
  return Math.min(value, max);
}

export function handleGetTitle(env: Env, requestId: string, titleId: Uuid): Promise<Response> {
  return withRepo(env, requestId, "catalog.title.get", async ({ repo, timings }) => {
    const result = await timings.measure("db", () => repo.getTitleById(titleId));
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    // Drafts and archived rows exist for staff; the public read surface must
    // not confirm they exist at all.
    if (result.value.status !== "published") {
      return errorResponse("not_found", "Not found", 404, requestId);
    }

    const [genres, images] = await Promise.all([
      repo.listGenres(titleId),
      repo.getPrimaryImages([titleId]),
    ]);

    return successResponse(
      {
        title: toPublicTitle(
          result.value,
          genres.ok ? genres.value.map(toPublicGenre) : [],
          images.ok ? (images.value.get(titleId) ?? null) : null,
        ),
      },
      requestId,
    );
  });
}

export function handleListTitles(request: Request, env: Env, requestId: string): Promise<Response> {
  const url = new URL(request.url);
  const page = parsePageParams(url);
  if (!page.ok) {
    return Promise.resolve(validationError(requestId, { [page.field]: [page.reason] }));
  }

  const genreSlugs = url.searchParams.getAll("genre").flatMap((v) => v.split(","));
  const kinds = parseKinds(url);
  const filters: TitleListFilters = {
    ...(kinds ? { kinds } : {}),
    ...(genreSlugs.length > 0 ? { genreSlugs } : {}),
    yearFrom: parseYear(url, "year_from"),
    yearTo: parseYear(url, "year_to"),
    statuses: ["published"] as RecordStatus[],
  };

  return withRepo(env, requestId, "catalog.title.list", async ({ repo, timings }) => {
    const { limit, cursor } = page.value;
    const result = await timings.measure("db", () =>
      repo.listTitlesPaged(filters, {
        limit,
        cursor: cursor ? { createdAt: cursor.createdAt, id: cursor.id } : null,
      }),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);

    const titles = await timings.measure("hydrate", () =>
      hydrateTitleSummaries(repo, result.value.items),
    );
    const nextCursor = result.value.nextCursor
      ? encodeCursor(result.value.nextCursor.createdAt, result.value.nextCursor.id)
      : null;

    return Response.json(
      { data: { titles }, meta: { requestId, cursor: nextCursor } },
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
}

export function handleListTitleCredits(
  request: Request,
  env: Env,
  requestId: string,
  titleId: Uuid,
): Promise<Response> {
  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const department = url.searchParams.get("department");

  return withRepo(env, requestId, "catalog.title.credits", async ({ repo, timings }) => {
    const result = await timings.measure("db", () =>
      repo.listTitleCredits(titleId, {
        limit: boundedLimit(url, "limit", 100, MAX_CREDITS),
        ...(category === "cast" || category === "crew" ? { category } : {}),
        ...(department ? { department: department as never } : {}),
      }),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);

    // A cast list renders a headshot per row; batch them by person id rather
    // than issuing one image query per credit.
    const personIds = [...new Set(result.value.map((credit) => credit.person.id))];
    const headshots = await timings.measure("headshots", () =>
      repo.getPrimaryPersonImages(personIds),
    );
    const headshotByPerson = headshots.ok ? headshots.value : new Map();

    const credits = result.value.map((credit) => ({
      ...toPublicCreditBase(credit),
      name: toPublicNameSummary(credit.person, [], headshotByPerson.get(credit.person.id) ?? null),
    }));

    return successResponse({ credits }, requestId);
  });
}

export function handleListAkas(env: Env, requestId: string, titleId: Uuid): Promise<Response> {
  return withRepo(env, requestId, "catalog.title.akas", async ({ repo, timings }) => {
    const result = await timings.measure("db", () => repo.listAkas(titleId));
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ akas: result.value.map(toPublicAka) }, requestId);
  });
}

export function handleListReleaseDates(env: Env, requestId: string, titleId: Uuid): Promise<Response> {
  return withRepo(env, requestId, "catalog.title.release_dates", async ({ repo, timings }) => {
    const result = await timings.measure("db", () => repo.listReleaseDates(titleId));
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ releaseDates: result.value.map(toPublicReleaseDate) }, requestId);
  });
}

export function handleListCertificates(env: Env, requestId: string, titleId: Uuid): Promise<Response> {
  return withRepo(env, requestId, "catalog.title.certificates", async ({ repo, timings }) => {
    const result = await timings.measure("db", () => repo.listCertificates(titleId));
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ certificates: result.value.map(toPublicCertificate) }, requestId);
  });
}

export function handleListKeywords(env: Env, requestId: string, titleId: Uuid): Promise<Response> {
  return withRepo(env, requestId, "catalog.title.keywords", async ({ repo, timings }) => {
    const result = await timings.measure("db", () => repo.listTitleKeywords(titleId));
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ keywords: result.value.map(toPublicKeyword) }, requestId);
  });
}

export function handleListTitleCompanies(env: Env, requestId: string, titleId: Uuid): Promise<Response> {
  return withRepo(env, requestId, "catalog.title.companies", async ({ repo, timings }) => {
    const result = await timings.measure("db", () => repo.listTitleCompanies(titleId));
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    const companies = result.value.map(toPublicTitleCompany).filter((c) => c !== null);
    return successResponse({ companies }, requestId);
  });
}

/**
 * The "technical" panel is four related lists that always render together;
 * shipping them as one response saves the page three round trips.
 */
export function handleGetTechnical(env: Env, requestId: string, titleId: Uuid): Promise<Response> {
  return withRepo(env, requestId, "catalog.title.technical", async ({ repo, timings }) => {
    const [specs, countries, languages, locations] = await timings.measure("db", () =>
      Promise.all([
        repo.listTechnicalSpecs(titleId),
        repo.listCountries(titleId),
        repo.listLanguages(titleId),
        repo.listLocations(titleId),
      ]),
    );

    return successResponse(
      {
        technicalSpecs: specs.ok ? specs.value.map(toPublicTechnicalSpec) : [],
        countries: countries.ok ? countries.value : [],
        languages: languages.ok ? languages.value : [],
        filmingLocations: locations.ok ? locations.value.map(toPublicLocation) : [],
      },
      requestId,
    );
  });
}

export function handleGetBoxOffice(env: Env, requestId: string, titleId: Uuid): Promise<Response> {
  return withRepo(env, requestId, "catalog.title.box_office", async ({ repo, timings }) => {
    const result = await timings.measure("db", () => repo.getBoxOffice(titleId));
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse(
      { boxOffice: result.value ? toPublicBoxOffice(result.value) : null },
      requestId,
    );
  });
}

export function handleListConnections(env: Env, requestId: string, titleId: Uuid): Promise<Response> {
  return withRepo(env, requestId, "catalog.title.connections", async ({ repo, timings }) => {
    const result = await timings.measure("db", () => repo.listConnections(titleId));
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    const connections = result.value.map(toPublicConnection).filter((c) => c !== null);
    return successResponse({ connections }, requestId);
  });
}

export function handleListExternalIds(env: Env, requestId: string, titleId: Uuid): Promise<Response> {
  return withRepo(env, requestId, "catalog.title.external_ids", async ({ repo, timings }) => {
    const result = await timings.measure("db", () => repo.listExternalIds(titleId));
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ externalIds: result.value.map(toPublicExternalId) }, requestId);
  });
}

export function handleListTitleImages(
  request: Request,
  env: Env,
  requestId: string,
  titleId: Uuid,
): Promise<Response> {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");

  return withRepo(env, requestId, "catalog.title.images", async ({ repo, timings }) => {
    const result = await timings.measure("db", () =>
      repo.listTitleImages(titleId, (kind as never) ?? null, boundedLimit(url, "limit", 48, MAX_MEDIA)),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ images: result.value.map(toPublicImage) }, requestId);
  });
}

export function handleListTitleVideos(
  request: Request,
  env: Env,
  requestId: string,
  titleId: Uuid,
): Promise<Response> {
  const url = new URL(request.url);
  return withRepo(env, requestId, "catalog.title.videos", async ({ repo, timings }) => {
    const result = await timings.measure("db", () =>
      repo.listTitleVideos(titleId, boundedLimit(url, "limit", 24, MAX_MEDIA)),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ videos: result.value.map(toPublicVideo) }, requestId);
  });
}

export function handleListSeasons(env: Env, requestId: string, seriesId: Uuid): Promise<Response> {
  return withRepo(env, requestId, "catalog.title.seasons", async ({ repo, timings }) => {
    const result = await timings.measure("db", () => repo.listSeasons(seriesId));
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ seasons: result.value.map(toPublicSeason) }, requestId);
  });
}

export function handleListEpisodes(
  request: Request,
  env: Env,
  requestId: string,
  seriesId: Uuid,
): Promise<Response> {
  const url = new URL(request.url);
  const seasonRaw = url.searchParams.get("season");
  const season = seasonRaw === null ? null : Number(seasonRaw);
  if (season !== null && !Number.isInteger(season)) {
    return Promise.resolve(validationError(requestId, { season: ["Must be an integer"] }));
  }

  return withRepo(env, requestId, "catalog.title.episodes", async ({ repo, timings }) => {
    const result = await timings.measure("db", () =>
      repo.listEpisodes(seriesId, season, { limit: boundedLimit(url, "limit", 50, 200) }),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    const episodes = result.value.map(toPublicEpisode).filter((e) => e !== null);
    return successResponse({ episodes }, requestId);
  });
}
