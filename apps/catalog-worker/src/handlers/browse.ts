import type { Uuid } from "@saas/db/ids";
import type { Env } from "../env.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import { encodeCursor, parsePageParams } from "../pagination.js";
import { withRepo } from "../repo.js";
import { hydrateTitleSummaries } from "./hydrate.js";
import { toPublicCompany, toPublicKeywordRecord } from "../public.js";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;

export function handleGetCompany(env: Env, requestId: string, companyId: Uuid): Promise<Response> {
  return withRepo(env, requestId, "catalog.company.get", async ({ repo, timings }) => {
    const result = await timings.measure("db", () => repo.getCompanyById(companyId));
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    if (result.value.status !== "published") {
      return errorResponse("not_found", "Not found", 404, requestId);
    }
    return successResponse({ company: toPublicCompany(result.value) }, requestId);
  });
}

export function handleListCompanyTitles(
  request: Request,
  env: Env,
  requestId: string,
  companyId: Uuid,
): Promise<Response> {
  const page = parsePageParams(new URL(request.url));
  if (!page.ok) {
    return Promise.resolve(validationError(requestId, { [page.field]: [page.reason] }));
  }

  return withRepo(env, requestId, "catalog.company.titles", async ({ repo, timings }) => {
    const { limit, cursor } = page.value;
    const result = await timings.measure("db", () =>
      repo.listCompanyTitlesPaged(companyId, {
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

export function handleGetKeyword(env: Env, requestId: string, slug: string): Promise<Response> {
  if (!SLUG_RE.test(slug)) {
    return Promise.resolve(errorResponse("not_found", "Not found", 404, requestId));
  }
  return withRepo(env, requestId, "catalog.keyword.get", async ({ repo, timings }) => {
    const result = await timings.measure("db", () => repo.getKeywordBySlug(slug));
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    return successResponse({ keyword: toPublicKeywordRecord(result.value) }, requestId);
  });
}

export function handleListKeywordTitles(
  request: Request,
  env: Env,
  requestId: string,
  slug: string,
): Promise<Response> {
  if (!SLUG_RE.test(slug)) {
    return Promise.resolve(errorResponse("not_found", "Not found", 404, requestId));
  }
  const page = parsePageParams(new URL(request.url));
  if (!page.ok) {
    return Promise.resolve(validationError(requestId, { [page.field]: [page.reason] }));
  }

  return withRepo(env, requestId, "catalog.keyword.titles", async ({ repo, timings }) => {
    const keyword = await timings.measure("db", () => repo.getKeywordBySlug(slug));
    if (!keyword.ok) return errorResponse("not_found", "Not found", 404, requestId);

    const { limit, cursor } = page.value;
    const result = await repo.listKeywordTitlesPaged(keyword.value.id, {
      limit,
      cursor: cursor ? { createdAt: cursor.createdAt, id: cursor.id } : null,
    });
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
