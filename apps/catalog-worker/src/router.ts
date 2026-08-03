import type { Env } from "./env.js";
import { errorResponse, methodNotAllowed, notFound } from "./http.js";
import {
  generateRequestId,
  parseCompanyPublicId,
  parseCreditPublicId,
  parseNamePublicId,
  parseOrgPublicId,
  parseTitlePublicId,
} from "./ids.js";
import { handleHealth } from "./handlers/health.js";
import {
  handleGetBoxOffice,
  handleGetTechnical,
  handleGetTitle,
  handleListAkas,
  handleListCertificates,
  handleListConnections,
  handleListEpisodes,
  handleListExternalIds,
  handleListKeywords,
  handleListReleaseDates,
  handleListSeasons,
  handleListTitleCompanies,
  handleListTitleCredits,
  handleListTitleImages,
  handleListTitleVideos,
  handleListTitles,
} from "./handlers/titles.js";
import {
  handleGetName,
  handleListGenres,
  handleListKnownFor,
  handleListNameCredits,
  handleListNameImages,
  handleListNameVideos,
  handleListNames,
} from "./handlers/names.js";
import {
  handleGetCompany,
  handleGetKeyword,
  handleListCompanyTitles,
  handleListKeywordTitles,
} from "./handlers/browse.js";
import {
  handleArchiveName,
  handleArchiveTitle,
  handleCreateCredit,
  handleCreateName,
  handleCreateTitle,
  handleCreateTitleImage,
  handleCreateTitleVideo,
  handleDeleteCredit,
  handleUpdateName,
  handleUpdateTitle,
  handleUpsertEpisode,
} from "./handlers/curation.js";

const REQUEST_ID_RE = /^[\w-]{1,128}$/;

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

// ── Public read routes ─────────────────────────────────────────────────

const TITLES_RE = /^\/v1\/titles$/;
const TITLE_RE = /^\/v1\/titles\/([^/]+)$/;
const TITLE_SUB_RE = /^\/v1\/titles\/([^/]+)\/([a-z-]+)$/;
const NAMES_RE = /^\/v1\/names$/;
const NAME_RE = /^\/v1\/names\/([^/]+)$/;
const NAME_SUB_RE = /^\/v1\/names\/([^/]+)\/([a-z-]+)$/;
const COMPANY_RE = /^\/v1\/companies\/([^/]+)$/;
const COMPANY_TITLES_RE = /^\/v1\/companies\/([^/]+)\/titles$/;
const KEYWORD_RE = /^\/v1\/keywords\/([^/]+)$/;
const KEYWORD_TITLES_RE = /^\/v1\/keywords\/([^/]+)\/titles$/;
const GENRES_RE = /^\/v1\/genres$/;

// ── Curation routes (org-scoped, authenticated) ────────────────────────

const CUR_TITLES_RE = /^\/v1\/organizations\/([^/]+)\/catalog\/titles$/;
const CUR_TITLE_RE = /^\/v1\/organizations\/([^/]+)\/catalog\/titles\/([^/]+)$/;
const CUR_TITLE_SUB_RE = /^\/v1\/organizations\/([^/]+)\/catalog\/titles\/([^/]+)\/([a-z-]+)$/;
const CUR_CREDIT_RE = /^\/v1\/organizations\/([^/]+)\/catalog\/credits\/([^/]+)$/;
const CUR_NAMES_RE = /^\/v1\/organizations\/([^/]+)\/catalog\/names$/;
const CUR_NAME_RE = /^\/v1\/organizations\/([^/]+)\/catalog\/names\/([^/]+)$/;

export async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const requestId = resolveRequestId(request);

  try {
    if (url.pathname === "/health" && request.method === "GET") {
      return handleHealth(env, requestId);
    }

    const curated = await routeCuration(request, env, requestId, url.pathname);
    if (curated) return curated;

    const read = await routeReads(request, env, requestId, url.pathname);
    if (read) return read;

    return notFound(requestId, url.pathname);
  } catch {
    return errorResponse("internal_error", "An unexpected error occurred", 500, requestId);
  }
}

/**
 * Reads are unauthenticated by design — the catalog is a public database. The
 * only gate is `status = 'published'`, applied inside every query, so a draft
 * is invisible rather than merely unauthorized.
 */
async function routeReads(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
): Promise<Response | null> {
  if (request.method !== "GET") return null;

  if (GENRES_RE.test(pathname)) return handleListGenres(env, requestId);
  if (TITLES_RE.test(pathname)) return handleListTitles(request, env, requestId);
  if (NAMES_RE.test(pathname)) return handleListNames(request, env, requestId);

  const titleSub = pathname.match(TITLE_SUB_RE);
  if (titleSub) {
    const titleId = parseTitlePublicId(titleSub[1]!);
    if (!titleId) return notFound(requestId, pathname);
    switch (titleSub[2]!) {
      case "credits":
        return handleListTitleCredits(request, env, requestId, titleId);
      case "akas":
        return handleListAkas(env, requestId, titleId);
      case "release-dates":
        return handleListReleaseDates(env, requestId, titleId);
      case "certificates":
        return handleListCertificates(env, requestId, titleId);
      case "keywords":
        return handleListKeywords(env, requestId, titleId);
      case "companies":
        return handleListTitleCompanies(env, requestId, titleId);
      case "technical":
        return handleGetTechnical(env, requestId, titleId);
      case "box-office":
        return handleGetBoxOffice(env, requestId, titleId);
      case "connections":
        return handleListConnections(env, requestId, titleId);
      case "external-ids":
        return handleListExternalIds(env, requestId, titleId);
      case "images":
        return handleListTitleImages(request, env, requestId, titleId);
      case "videos":
        return handleListTitleVideos(request, env, requestId, titleId);
      case "seasons":
        return handleListSeasons(env, requestId, titleId);
      case "episodes":
        return handleListEpisodes(request, env, requestId, titleId);
      default:
        return notFound(requestId, pathname);
    }
  }

  const title = pathname.match(TITLE_RE);
  if (title) {
    const titleId = parseTitlePublicId(title[1]!);
    if (!titleId) return notFound(requestId, pathname);
    return handleGetTitle(env, requestId, titleId);
  }

  const nameSub = pathname.match(NAME_SUB_RE);
  if (nameSub) {
    const personId = parseNamePublicId(nameSub[1]!);
    if (!personId) return notFound(requestId, pathname);
    switch (nameSub[2]!) {
      case "credits":
        return handleListNameCredits(request, env, requestId, personId);
      case "known-for":
        return handleListKnownFor(request, env, requestId, personId);
      case "images":
        return handleListNameImages(request, env, requestId, personId);
      case "videos":
        return handleListNameVideos(request, env, requestId, personId);
      default:
        return notFound(requestId, pathname);
    }
  }

  const name = pathname.match(NAME_RE);
  if (name) {
    const personId = parseNamePublicId(name[1]!);
    if (!personId) return notFound(requestId, pathname);
    return handleGetName(env, requestId, personId);
  }

  const companyTitles = pathname.match(COMPANY_TITLES_RE);
  if (companyTitles) {
    const companyId = parseCompanyPublicId(companyTitles[1]!);
    if (!companyId) return notFound(requestId, pathname);
    return handleListCompanyTitles(request, env, requestId, companyId);
  }

  const company = pathname.match(COMPANY_RE);
  if (company) {
    const companyId = parseCompanyPublicId(company[1]!);
    if (!companyId) return notFound(requestId, pathname);
    return handleGetCompany(env, requestId, companyId);
  }

  const keywordTitles = pathname.match(KEYWORD_TITLES_RE);
  if (keywordTitles) return handleListKeywordTitles(request, env, requestId, keywordTitles[1]!);

  const keyword = pathname.match(KEYWORD_RE);
  if (keyword) return handleGetKeyword(env, requestId, keyword[1]!);

  return null;
}

async function routeCuration(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
): Promise<Response | null> {
  const match =
    pathname.match(CUR_TITLE_SUB_RE) ??
    pathname.match(CUR_TITLE_RE) ??
    pathname.match(CUR_TITLES_RE) ??
    pathname.match(CUR_CREDIT_RE) ??
    pathname.match(CUR_NAME_RE) ??
    pathname.match(CUR_NAMES_RE);
  if (!match) return null;

  const orgId = parseOrgPublicId(match[1]!);
  if (!orgId) return notFound(requestId, pathname);

  // Curation is write-only. Reject an unsupported verb before authenticating so
  // a GET here answers 405 rather than 401 — the path exists, the method
  // doesn't, and that distinction leaks nothing.
  if (request.method !== "POST" && request.method !== "PATCH" && request.method !== "DELETE") {
    return methodNotAllowed(requestId);
  }

  const actor = resolveActor(request);
  if (!actor) {
    return errorResponse("unauthenticated", "Authentication required", 401, requestId);
  }

  const titleSub = pathname.match(CUR_TITLE_SUB_RE);
  if (titleSub) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    const titleId = parseTitlePublicId(titleSub[2]!);
    if (!titleId) return notFound(requestId, pathname);
    switch (titleSub[3]!) {
      case "credits":
        return handleCreateCredit(request, env, requestId, actor, orgId, titleId);
      case "images":
        return handleCreateTitleImage(request, env, requestId, actor, orgId, titleId);
      case "videos":
        return handleCreateTitleVideo(request, env, requestId, actor, orgId, titleId);
      case "episodes":
        return handleUpsertEpisode(request, env, requestId, actor, orgId, titleId);
      default:
        return notFound(requestId, pathname);
    }
  }

  const title = pathname.match(CUR_TITLE_RE);
  if (title) {
    const titleId = parseTitlePublicId(title[2]!);
    if (!titleId) return notFound(requestId, pathname);
    if (request.method === "PATCH") {
      return handleUpdateTitle(request, env, requestId, actor, orgId, titleId);
    }
    if (request.method === "DELETE") {
      return handleArchiveTitle(env, requestId, actor, orgId, titleId);
    }
    return methodNotAllowed(requestId);
  }

  if (CUR_TITLES_RE.test(pathname)) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    return handleCreateTitle(request, env, requestId, actor, orgId);
  }

  const credit = pathname.match(CUR_CREDIT_RE);
  if (credit) {
    if (request.method !== "DELETE") return methodNotAllowed(requestId);
    const creditId = parseCreditPublicId(credit[2]!);
    if (!creditId) return notFound(requestId, pathname);
    return handleDeleteCredit(env, requestId, actor, orgId, creditId);
  }

  const name = pathname.match(CUR_NAME_RE);
  if (name) {
    const personId = parseNamePublicId(name[2]!);
    if (!personId) return notFound(requestId, pathname);
    if (request.method === "PATCH") {
      return handleUpdateName(request, env, requestId, actor, orgId, personId);
    }
    if (request.method === "DELETE") {
      return handleArchiveName(env, requestId, actor, orgId, personId);
    }
    return methodNotAllowed(requestId);
  }

  if (CUR_NAMES_RE.test(pathname)) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    return handleCreateName(request, env, requestId, actor, orgId);
  }

  return notFound(requestId, pathname);
}
