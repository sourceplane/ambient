import type { Uuid } from "@saas/db/ids";
import type { CreditCategory, CreditDepartment, ImageKind, VideoKind } from "@saas/db/catalog";
import { sortNameFor, sortTitleFor, slugify } from "@saas/db/catalog";
import type { Env } from "../env.js";
import type { ActorContext } from "../router.js";
import { requireCatalogPermission } from "../authz.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import { newUuid, parseNamePublicId, parseTitlePublicId } from "../ids.js";
import { withRepo } from "../repo.js";
import { toPublicCreditBase, toPublicImage, toPublicName, toPublicTitle, toPublicVideo } from "../public.js";
import {
  personSearchDocument,
  publishSearchDocuments,
  titleSearchDocument,
  unpublishSearchDocument,
} from "../search-client.js";
import {
  CREDIT_DEPARTMENTS,
  IMAGE_KINDS,
  PRODUCTION_STATUSES,
  TITLE_KINDS,
  VIDEO_KINDS,
  Validator,
  readJson,
} from "../validate.js";

export const CATALOG_ACTIONS = {
  titleWrite: "catalog.title.write",
  titleArchive: "catalog.title.archive",
  personWrite: "catalog.person.write",
  personArchive: "catalog.person.archive",
  creditWrite: "catalog.credit.write",
  mediaWrite: "catalog.media.write",
  episodeWrite: "catalog.episode.write",
} as const;

const MAX_TITLE = 500;
const MAX_TEXT = 20_000;

export async function handleCreateTitle(
  request: Request,
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: string,
): Promise<Response> {
  const denied = await requireCatalogPermission(env, requestId, actor, orgId, CATALOG_ACTIONS.titleWrite);
  if (denied) return denied;

  const body = await readJson(request);
  if (!body) return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);

  const v = new Validator();
  const kind = v.oneOf("kind", body.kind, TITLE_KINDS);
  const primaryTitle = v.requiredString("primaryTitle", body.primaryTitle, MAX_TITLE);
  const originalTitle = v.optionalString("originalTitle", body.originalTitle, MAX_TITLE);
  const startYear = v.optionalInt("startYear", body.startYear, 1800, 2200);
  const endYear = v.optionalInt("endYear", body.endYear, 1800, 2200);
  const runtimeMinutes = v.optionalInt("runtimeMinutes", body.runtimeMinutes, 0, 100_000);
  const isAdult = v.optionalBool("isAdult", body.isAdult);
  const productionStatus = v.optionalOneOf("productionStatus", body.productionStatus, PRODUCTION_STATUSES);
  const plotOutline = v.optionalString("plotOutline", body.plotOutline, 2_000);
  const plotSummary = v.optionalString("plotSummary", body.plotSummary, MAX_TEXT);
  const synopsis = v.optionalString("synopsis", body.synopsis, MAX_TEXT);
  const tagline = v.optionalString("tagline", body.tagline, 1_000);
  const genres = v.stringArray("genres", body.genres, 24, 80);

  if (startYear !== null && endYear !== null && endYear < startYear) {
    v.errors.endYear = ["Must not be before startYear"];
  }
  if (!v.ok) return validationError(requestId, v.errors);

  return withRepo(env, requestId, "catalog.title.create", async ({ repo, timings }) => {
    const id = newUuid();
    const result = await timings.measure("db", () =>
      repo.createTitle({
        id,
        kind,
        primaryTitle,
        originalTitle,
        sortTitle: sortTitleFor(primaryTitle),
        startYear,
        endYear,
        runtimeMinutes,
        ...(isAdult === undefined ? {} : { isAdult }),
        ...(productionStatus === undefined ? {} : { productionStatus }),
        plotOutline,
        plotSummary,
        synopsis,
        tagline,
        createdAt: new Date(),
      }),
    );
    if (!result.ok) {
      return result.error.kind === "conflict"
        ? errorResponse("conflict", "Title already exists", 409, requestId)
        : errorResponse("internal_error", "Service unavailable", 503, requestId);
    }

    const applied = genres.length > 0 ? await repo.setGenres(id, genres.map(slugify)) : null;

    const document = titleSearchDocument(
      result.value,
      applied?.ok ? applied.value.map((g) => g.slug) : [],
      null,
    );
    await publishSearchDocuments(env.SEARCH_WORKER, document ? [document] : [], requestId);

    return successResponse(
      {
        title: toPublicTitle(
          result.value,
          applied?.ok ? applied.value.map((g) => ({ slug: g.slug, name: g.name })) : [],
        ),
      },
      requestId,
      201,
    );
  });
}

export async function handleUpdateTitle(
  request: Request,
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: string,
  titleId: Uuid,
): Promise<Response> {
  const denied = await requireCatalogPermission(env, requestId, actor, orgId, CATALOG_ACTIONS.titleWrite);
  if (denied) return denied;

  const body = await readJson(request);
  if (!body) return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);

  const v = new Validator();
  const patch: Record<string, unknown> = {};
  if ("primaryTitle" in body) {
    const primaryTitle = v.requiredString("primaryTitle", body.primaryTitle, MAX_TITLE);
    patch.primaryTitle = primaryTitle;
    // The sort key is derived, never supplied — keeping it in lockstep here is
    // what makes the sort_title index trustworthy.
    patch.sortTitle = sortTitleFor(primaryTitle);
  }
  if ("originalTitle" in body) patch.originalTitle = v.optionalString("originalTitle", body.originalTitle, MAX_TITLE);
  if ("startYear" in body) patch.startYear = v.optionalInt("startYear", body.startYear, 1800, 2200);
  if ("endYear" in body) patch.endYear = v.optionalInt("endYear", body.endYear, 1800, 2200);
  if ("runtimeMinutes" in body) patch.runtimeMinutes = v.optionalInt("runtimeMinutes", body.runtimeMinutes, 0, 100_000);
  if ("isAdult" in body) patch.isAdult = v.optionalBool("isAdult", body.isAdult);
  if ("productionStatus" in body) {
    patch.productionStatus = v.optionalOneOf("productionStatus", body.productionStatus, PRODUCTION_STATUSES);
  }
  if ("plotOutline" in body) patch.plotOutline = v.optionalString("plotOutline", body.plotOutline, 2_000);
  if ("plotSummary" in body) patch.plotSummary = v.optionalString("plotSummary", body.plotSummary, MAX_TEXT);
  if ("synopsis" in body) patch.synopsis = v.optionalString("synopsis", body.synopsis, MAX_TEXT);
  if ("tagline" in body) patch.tagline = v.optionalString("tagline", body.tagline, 1_000);
  const genres = "genres" in body ? v.stringArray("genres", body.genres, 24, 80) : null;

  if (!v.ok) return validationError(requestId, v.errors);

  return withRepo(env, requestId, "catalog.title.update", async ({ repo, timings }) => {
    const result = await timings.measure("db", () => repo.updateTitle(titleId, patch, new Date()));
    if (!result.ok) {
      return result.error.kind === "not_found"
        ? errorResponse("not_found", "Not found", 404, requestId)
        : errorResponse("internal_error", "Service unavailable", 503, requestId);
    }
    const applied = genres ? await repo.setGenres(titleId, genres.map(slugify)) : await repo.listGenres(titleId);

    const document = titleSearchDocument(
      result.value,
      applied.ok ? applied.value.map((g) => g.slug) : [],
      null,
    );
    // A title edited into `draft` produces no document — unpublish instead, so
    // search never keeps a row the public read surface would 404.
    if (document) {
      await publishSearchDocuments(env.SEARCH_WORKER, [document], requestId);
    } else {
      await unpublishSearchDocument(env.SEARCH_WORKER, "title", titleId, requestId);
    }

    return successResponse(
      {
        title: toPublicTitle(
          result.value,
          applied.ok ? applied.value.map((g) => ({ slug: g.slug, name: g.name })) : [],
        ),
      },
      requestId,
    );
  });
}

export async function handleArchiveTitle(
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: string,
  titleId: Uuid,
): Promise<Response> {
  const denied = await requireCatalogPermission(env, requestId, actor, orgId, CATALOG_ACTIONS.titleArchive);
  if (denied) return denied;

  return withRepo(env, requestId, "catalog.title.archive", async ({ repo, timings }) => {
    const result = await timings.measure("db", () => repo.archiveTitle(titleId, new Date()));
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    await unpublishSearchDocument(env.SEARCH_WORKER, "title", titleId, requestId);
    return successResponse({ title: toPublicTitle(result.value) }, requestId);
  });
}

export async function handleCreateName(
  request: Request,
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: string,
): Promise<Response> {
  const denied = await requireCatalogPermission(env, requestId, actor, orgId, CATALOG_ACTIONS.personWrite);
  if (denied) return denied;

  const body = await readJson(request);
  if (!body) return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);

  const v = new Validator();
  const name = v.requiredString("name", body.name, 300);
  const birthDate = v.optionalDate("birthDate", body.birthDate);
  const deathDate = v.optionalDate("deathDate", body.deathDate);
  const birthPlace = v.optionalString("birthPlace", body.birthPlace, 500);
  const deathPlace = v.optionalString("deathPlace", body.deathPlace, 500);
  const deathCause = v.optionalString("deathCause", body.deathCause, 500);
  const heightCm = v.optionalInt("heightCm", body.heightCm, 1, 300);
  const miniBio = v.optionalString("miniBio", body.miniBio, MAX_TEXT);
  const bioAuthor = v.optionalString("bioAuthor", body.bioAuthor, 300);
  const professions = v.stringArray("professions", body.professions, 24, 80);

  if (birthDate && deathDate && deathDate < birthDate) {
    v.errors.deathDate = ["Must not be before birthDate"];
  }
  if (!v.ok) return validationError(requestId, v.errors);

  return withRepo(env, requestId, "catalog.name.create", async ({ repo, timings }) => {
    const result = await timings.measure("db", () =>
      repo.createPerson({
        id: newUuid(),
        name,
        sortName: sortNameFor(name),
        birthDate,
        birthPlace,
        deathDate,
        deathPlace,
        deathCause,
        heightCm,
        miniBio,
        bioAuthor,
        professions: professions.map((p) => slugify(p)),
        createdAt: new Date(),
      }),
    );
    if (!result.ok) {
      return result.error.kind === "conflict"
        ? errorResponse("conflict", "Person already exists", 409, requestId)
        : errorResponse("internal_error", "Service unavailable", 503, requestId);
    }
    const slugs = professions.map((p) => slugify(p));
    const document = personSearchDocument(result.value, slugs, null);
    await publishSearchDocuments(env.SEARCH_WORKER, document ? [document] : [], requestId);

    return successResponse({ name: toPublicName(result.value, slugs) }, requestId, 201);
  });
}

export async function handleUpdateName(
  request: Request,
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: string,
  personId: Uuid,
): Promise<Response> {
  const denied = await requireCatalogPermission(env, requestId, actor, orgId, CATALOG_ACTIONS.personWrite);
  if (denied) return denied;

  const body = await readJson(request);
  if (!body) return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);

  const v = new Validator();
  const patch: Record<string, unknown> = {};
  if ("name" in body) {
    const name = v.requiredString("name", body.name, 300);
    patch.name = name;
    patch.sortName = sortNameFor(name);
  }
  if ("birthDate" in body) patch.birthDate = v.optionalDate("birthDate", body.birthDate);
  if ("deathDate" in body) patch.deathDate = v.optionalDate("deathDate", body.deathDate);
  if ("birthPlace" in body) patch.birthPlace = v.optionalString("birthPlace", body.birthPlace, 500);
  if ("deathPlace" in body) patch.deathPlace = v.optionalString("deathPlace", body.deathPlace, 500);
  if ("deathCause" in body) patch.deathCause = v.optionalString("deathCause", body.deathCause, 500);
  if ("heightCm" in body) patch.heightCm = v.optionalInt("heightCm", body.heightCm, 1, 300);
  if ("miniBio" in body) patch.miniBio = v.optionalString("miniBio", body.miniBio, MAX_TEXT);
  if ("bioAuthor" in body) patch.bioAuthor = v.optionalString("bioAuthor", body.bioAuthor, 300);

  if (!v.ok) return validationError(requestId, v.errors);

  return withRepo(env, requestId, "catalog.name.update", async ({ repo, timings }) => {
    const result = await timings.measure("db", () => repo.updatePerson(personId, patch, new Date()));
    if (!result.ok) {
      return result.error.kind === "not_found"
        ? errorResponse("not_found", "Not found", 404, requestId)
        : errorResponse("internal_error", "Service unavailable", 503, requestId);
    }
    const professions = await repo.listProfessions(personId);
    const slugs = professions.ok ? professions.value : [];

    const document = personSearchDocument(result.value, slugs, null);
    if (document) {
      await publishSearchDocuments(env.SEARCH_WORKER, [document], requestId);
    } else {
      await unpublishSearchDocument(env.SEARCH_WORKER, "person", personId, requestId);
    }

    return successResponse({ name: toPublicName(result.value, slugs) }, requestId);
  });
}

export async function handleArchiveName(
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: string,
  personId: Uuid,
): Promise<Response> {
  const denied = await requireCatalogPermission(env, requestId, actor, orgId, CATALOG_ACTIONS.personArchive);
  if (denied) return denied;

  return withRepo(env, requestId, "catalog.name.archive", async ({ repo, timings }) => {
    const result = await timings.measure("db", () => repo.archivePerson(personId, new Date()));
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    await unpublishSearchDocument(env.SEARCH_WORKER, "person", personId, requestId);
    return successResponse({ name: toPublicName(result.value) }, requestId);
  });
}

export async function handleCreateCredit(
  request: Request,
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: string,
  titleId: Uuid,
): Promise<Response> {
  const denied = await requireCatalogPermission(env, requestId, actor, orgId, CATALOG_ACTIONS.creditWrite);
  if (denied) return denied;

  const body = await readJson(request);
  if (!body) return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);

  const v = new Validator();
  const nameIdRaw = v.requiredString("nameId", body.nameId, 64);
  const category = v.oneOf("category", body.category, ["cast", "crew"] as const) as CreditCategory;
  const department = v.oneOf("department", body.department, CREDIT_DEPARTMENTS) as CreditDepartment;
  const job = v.requiredString("job", body.job, 200);
  const billingOrder = v.optionalInt("billingOrder", body.billingOrder, 0, 100_000);
  const episodeCount = v.optionalInt("episodeCount", body.episodeCount, 0, 100_000);
  const characters = v.stringArray("characters", body.characters, 24, 300);
  const note = v.optionalString("note", body.note, 1_000);
  const isUncredited = v.optionalBool("isUncredited", body.isUncredited);
  const isVoice = v.optionalBool("isVoice", body.isVoice);
  const isArchiveFootage = v.optionalBool("isArchiveFootage", body.isArchiveFootage);
  const isSelf = v.optionalBool("isSelf", body.isSelf);

  // The schema enforces this too, but a 422 naming the field beats a 503 from
  // a CHECK constraint the caller cannot see.
  if ((category === "cast") !== (department === "cast")) {
    v.errors.department = ["Cast credits must use the 'cast' department, crew credits must not"];
  }

  const personId = parseNamePublicId(nameIdRaw);
  if (!personId) v.errors.nameId = ["Must be a valid name id"];

  if (!v.ok || !personId) return validationError(requestId, v.errors);

  return withRepo(env, requestId, "catalog.credit.create", async ({ repo, timings }) => {
    const result = await timings.measure("db", () =>
      repo.createCredit({
        id: newUuid(),
        titleId,
        personId,
        category,
        department,
        job,
        billingOrder,
        episodeCount,
        characters,
        note,
        ...(isUncredited === undefined ? {} : { isUncredited }),
        ...(isVoice === undefined ? {} : { isVoice }),
        ...(isArchiveFootage === undefined ? {} : { isArchiveFootage }),
        ...(isSelf === undefined ? {} : { isSelf }),
        createdAt: new Date(),
      }),
    );
    if (!result.ok) {
      if (result.error.kind === "conflict") {
        return errorResponse("conflict", "Credit already exists", 409, requestId);
      }
      if (result.error.kind === "not_found") {
        return errorResponse("not_found", "Not found", 404, requestId);
      }
      return errorResponse("internal_error", "Service unavailable", 503, requestId);
    }
    return successResponse({ credit: toPublicCreditBase(result.value) }, requestId, 201);
  });
}

export async function handleDeleteCredit(
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: string,
  creditId: Uuid,
): Promise<Response> {
  const denied = await requireCatalogPermission(env, requestId, actor, orgId, CATALOG_ACTIONS.creditWrite);
  if (denied) return denied;

  return withRepo(env, requestId, "catalog.credit.delete", async ({ repo, timings }) => {
    const result = await timings.measure("db", () => repo.deleteCredit(creditId));
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    return new Response(null, { status: 204 });
  });
}

export async function handleCreateTitleImage(
  request: Request,
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: string,
  titleId: Uuid,
): Promise<Response> {
  const denied = await requireCatalogPermission(env, requestId, actor, orgId, CATALOG_ACTIONS.mediaWrite);
  if (denied) return denied;

  const body = await readJson(request);
  if (!body) return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);

  const v = new Validator();
  const url = v.requiredUrl("url", body.url);
  const width = v.optionalInt("width", body.width, 1, 100_000);
  const height = v.optionalInt("height", body.height, 1, 100_000);
  const kind = v.oneOf("kind", body.kind, IMAGE_KINDS) as ImageKind;
  const caption = v.optionalString("caption", body.caption, 2_000);
  const credit = v.optionalString("credit", body.credit, 500);
  const language = v.optionalString("language", body.language, 32);
  const blurhash = v.optionalString("blurhash", body.blurhash, 200);
  const isPrimary = v.optionalBool("isPrimary", body.isPrimary);

  if (width === null) v.errors.width = ["Required"];
  if (height === null) v.errors.height = ["Required"];
  if (!v.ok || width === null || height === null) return validationError(requestId, v.errors);

  return withRepo(env, requestId, "catalog.title.image.create", async ({ repo, timings }) => {
    const imageId = newUuid();
    const created = await timings.measure("db", () =>
      repo.createImage({
        id: imageId,
        url,
        width,
        height,
        kind,
        caption,
        credit,
        language,
        blurhash,
        createdAt: new Date(),
      }),
    );
    if (!created.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);

    const attached = await repo.attachTitleImage(titleId, {
      imageId,
      ...(isPrimary === undefined ? {} : { isPrimary }),
    });
    if (!attached.ok) return errorResponse("not_found", "Not found", 404, requestId);

    return successResponse(
      { image: toPublicImage({ ...created.value, isPrimary: isPrimary ?? false }) },
      requestId,
      201,
    );
  });
}

export async function handleCreateTitleVideo(
  request: Request,
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: string,
  titleId: Uuid,
): Promise<Response> {
  const denied = await requireCatalogPermission(env, requestId, actor, orgId, CATALOG_ACTIONS.mediaWrite);
  if (denied) return denied;

  const body = await readJson(request);
  if (!body) return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);

  const v = new Validator();
  const kind = v.oneOf("kind", body.kind, VIDEO_KINDS) as VideoKind;
  const name = v.requiredString("name", body.name, 500);
  const url = v.requiredUrl("url", body.url);
  const thumbnailUrl = v.optionalUrl("thumbnailUrl", body.thumbnailUrl);
  const runtimeSeconds = v.optionalInt("runtimeSeconds", body.runtimeSeconds, 0, 1_000_000);
  const language = v.optionalString("language", body.language, 32);
  const publishedAtRaw = v.optionalString("publishedAt", body.publishedAt, 64);

  let publishedAt: Date | null = null;
  if (publishedAtRaw) {
    const parsed = new Date(publishedAtRaw);
    if (Number.isNaN(parsed.getTime())) v.errors.publishedAt = ["Must be an ISO timestamp"];
    else publishedAt = parsed;
  }
  if (!v.ok) return validationError(requestId, v.errors);

  return withRepo(env, requestId, "catalog.title.video.create", async ({ repo, timings }) => {
    const result = await timings.measure("db", () =>
      repo.createVideo({
        id: newUuid(),
        titleId,
        kind,
        name,
        url,
        thumbnailUrl,
        runtimeSeconds,
        language,
        publishedAt,
        createdAt: new Date(),
      }),
    );
    if (!result.ok) {
      return result.error.kind === "not_found"
        ? errorResponse("not_found", "Not found", 404, requestId)
        : errorResponse("internal_error", "Service unavailable", 503, requestId);
    }
    return successResponse({ video: toPublicVideo(result.value) }, requestId, 201);
  });
}

export async function handleUpsertEpisode(
  request: Request,
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: string,
  seriesId: Uuid,
): Promise<Response> {
  const denied = await requireCatalogPermission(env, requestId, actor, orgId, CATALOG_ACTIONS.episodeWrite);
  if (denied) return denied;

  const body = await readJson(request);
  if (!body) return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);

  const v = new Validator();
  const episodeIdRaw = v.requiredString("episodeId", body.episodeId, 64);
  const seasonNumber = v.optionalInt("seasonNumber", body.seasonNumber, 0, 10_000);
  const episodeNumber = v.optionalInt("episodeNumber", body.episodeNumber, 0, 100_000);
  const airedOn = v.optionalDate("airedOn", body.airedOn);

  const episodeTitleId = parseTitlePublicId(episodeIdRaw);
  if (!episodeTitleId) v.errors.episodeId = ["Must be a valid title id"];
  if (seasonNumber === null) v.errors.seasonNumber = ["Required"];
  if (episodeNumber === null) v.errors.episodeNumber = ["Required"];
  if (episodeTitleId === seriesId) {
    v.errors.episodeId = ["An episode cannot be its own series"];
  }
  if (!v.ok || !episodeTitleId || seasonNumber === null || episodeNumber === null) {
    return validationError(requestId, v.errors);
  }

  return withRepo(env, requestId, "catalog.episode.upsert", async ({ repo, timings }) => {
    const result = await timings.measure("db", () =>
      repo.upsertEpisode({
        episodeTitleId,
        seriesTitleId: seriesId,
        seasonNumber,
        episodeNumber,
        airedOn,
      }),
    );
    if (!result.ok) {
      if (result.error.kind === "conflict") {
        return errorResponse("conflict", "That episode number is already taken", 409, requestId);
      }
      return errorResponse("not_found", "Not found", 404, requestId);
    }
    return successResponse(
      {
        episode: {
          seriesId: episodeIdRaw,
          seasonNumber: result.value.seasonNumber,
          episodeNumber: result.value.episodeNumber,
          airedOn: result.value.airedOn,
        },
      },
      requestId,
    );
  });
}
