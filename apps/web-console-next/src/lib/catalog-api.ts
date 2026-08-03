// Typed fetch layer for the public catalog surface.
//
// The generated `@saas/sdk` covers the platform's authenticated resources; the
// catalog is a different shape — overwhelmingly public, cacheable, and read
// through one base URL with no session. Rather than bend the SDK's auth-first
// transport around that, this is a small, explicit client for the `/v1`
// catalog, search, ratings, reviews, lists and community routes.
//
// Every response type comes from `@saas/contracts`, so a wire change breaks the
// build here rather than at runtime.

import type {
  GetBoxOfficeResponse,
  GetNameResponse,
  GetTitleResponse,
  ListCertificatesResponse,
  ListConnectionsResponse,
  ListEpisodesResponse,
  ListExternalIdsResponse,
  ListGenresResponse,
  ListImagesResponse,
  ListKeywordsResponse,
  ListKnownForResponse,
  ListNameCreditsResponse,
  ListNamesResponse,
  ListReleaseDatesResponse,
  ListSeasonsResponse,
  ListTechnicalSpecsResponse,
  ListTitleCompaniesResponse,
  ListTitleCreditsResponse,
  ListTitlesResponse,
  ListVideosResponse,
} from "@saas/contracts/catalog";
import type { SearchResponse, SuggestResponse } from "@saas/contracts/search";
import type {
  GetChartResponse,
  GetDemographicsResponse,
  GetPopularityResponse,
  GetTitleRatingResponse,
  GetUserRatingResponse,
  ListUserRatingsResponse,
  RateTitleResponse,
} from "@saas/contracts/ratings";
import type {
  GetMetascoreResponse,
  ListCriticReviewsResponse,
  ListReviewsResponse,
} from "@saas/contracts/reviews";
import type {
  GetListResponse,
  ListItemsResponse,
  ListListsResponse,
  WatchlistMembershipResponse,
} from "@saas/contracts/lists";
import type {
  ListAwardsResponse,
  ListContributionsResponse,
  ListFactsResponse,
  ListFaqResponse,
  ListNewsResponse,
  GetParentsGuideResponse,
} from "@saas/contracts/community";
import { apiEdgeWorkersDevUrl } from "./app-config";

// `process.env.NEXT_PUBLIC_DEPLOY_ENV` is what Next's DefinePlugin inlines at
// build time. Declared locally (as in `solo-mode.ts`) so this module carries no
// dependency on Node's type definitions — it runs in a browser.
declare const process: { env: Record<string, string | undefined> } | undefined;

/** Which api-edge this build talks to. Locked per deploy, stage by default. */
export const CATALOG_BASE_URL =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEPLOY_ENV
    ? apiEdgeWorkersDevUrl(process.env.NEXT_PUBLIC_DEPLOY_ENV)
    : apiEdgeWorkersDevUrl("stage");

interface Envelope<T> {
  data: T;
  meta: { requestId: string; cursor: string | null };
}

export class CatalogError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CatalogError";
  }
}

/** `0` is not an HTTP status — it marks "the request never got an answer". */
export function isOffline(error: unknown): boolean {
  return error instanceof CatalogError && error.status === 0;
}

export function isNotFound(error: unknown): boolean {
  return error instanceof CatalogError && error.status === 404;
}

async function readError(response: Response): Promise<CatalogError> {
  let code = "internal_error";
  let message = `Request failed (${response.status})`;
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    if (body.error?.code) code = body.error.code;
    if (body.error?.message) message = body.error.message;
  } catch {
    // A non-JSON error body is still an error; keep the status-derived text.
  }
  return new CatalogError(response.status, code, message);
}

/**
 * A single fetch shape for every catalog read. Errors surface as
 * `CatalogError` so a caller can distinguish "nothing there" (404) from "the
 * API is down" (5xx) — the difference between an empty state and an error
 * state on the page.
 */
async function get<T>(path: string, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${CATALOG_BASE_URL}${path}`, { headers });
  } catch {
    throw new CatalogError(0, "network_error", "Could not reach the catalog");
  }

  if (!response.ok) throw await readError(response);
  const body = (await response.json()) as Envelope<T>;
  return body.data;
}

async function mutate<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  token: string,
  payload?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${token}`,
  };
  if (payload !== undefined) headers["content-type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${CATALOG_BASE_URL}${path}`, {
      method,
      headers,
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
  } catch {
    throw new CatalogError(0, "network_error", "Could not reach the catalog");
  }

  if (response.status === 204) return undefined as T;
  if (!response.ok) throw await readError(response);
  const body = (await response.json()) as Envelope<T>;
  return body.data;
}

/** `?a=1&b=2` from a sparse record, skipping empty values. */
export function queryString(
  params: Record<string, string | number | boolean | undefined | null | string[]>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      search.set(key, value.join(","));
      continue;
    }
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

// ── Catalog ────────────────────────────────────────────────────────────

export const catalogApi = {
  listTitles: (params: { kind?: string; genre?: string; limit?: number } = {}) =>
    get<ListTitlesResponse>(`/v1/titles${queryString(params)}`),

  /**
   * Hydrate an ordered set of ids in one request. Charts, watchlists and
   * "more like this" all arrive as ids from a service that cannot read the
   * catalog; without this each poster would cost its own round trip.
   */
  batchTitles: (titleIds: string[]) =>
    titleIds.length === 0
      ? Promise.resolve({ titles: [] } as ListTitlesResponse)
      : get<ListTitlesResponse>(`/v1/titles${queryString({ ids: titleIds })}`),

  getTitle: (titleId: string) => get<GetTitleResponse>(`/v1/titles/${titleId}`),

  titleCredits: (titleId: string, params: { category?: string; department?: string; limit?: number } = {}) =>
    get<ListTitleCreditsResponse>(`/v1/titles/${titleId}/credits${queryString(params)}`),

  titleImages: (titleId: string, params: { kind?: string; limit?: number } = {}) =>
    get<ListImagesResponse>(`/v1/titles/${titleId}/images${queryString(params)}`),

  titleVideos: (titleId: string) => get<ListVideosResponse>(`/v1/titles/${titleId}/videos`),

  titleKeywords: (titleId: string) => get<ListKeywordsResponse>(`/v1/titles/${titleId}/keywords`),

  titleTechnical: (titleId: string) =>
    get<ListTechnicalSpecsResponse>(`/v1/titles/${titleId}/technical`),

  titleReleaseDates: (titleId: string) =>
    get<ListReleaseDatesResponse>(`/v1/titles/${titleId}/release-dates`),

  titleCertificates: (titleId: string) =>
    get<ListCertificatesResponse>(`/v1/titles/${titleId}/certificates`),

  titleCompanies: (titleId: string) =>
    get<ListTitleCompaniesResponse>(`/v1/titles/${titleId}/companies`),

  titleBoxOffice: (titleId: string) => get<GetBoxOfficeResponse>(`/v1/titles/${titleId}/box-office`),

  titleConnections: (titleId: string) =>
    get<ListConnectionsResponse>(`/v1/titles/${titleId}/connections`),

  titleExternalIds: (titleId: string) =>
    get<ListExternalIdsResponse>(`/v1/titles/${titleId}/external-ids`),

  titleSeasons: (titleId: string) => get<ListSeasonsResponse>(`/v1/titles/${titleId}/seasons`),

  titleEpisodes: (titleId: string, season?: number) =>
    get<ListEpisodesResponse>(`/v1/titles/${titleId}/episodes${queryString({ season })}`),

  getName: (nameId: string) => get<GetNameResponse>(`/v1/names/${nameId}`),

  nameCredits: (nameId: string, params: { department?: string; limit?: number } = {}) =>
    get<ListNameCreditsResponse>(`/v1/names/${nameId}/credits${queryString(params)}`),

  nameKnownFor: (nameId: string) => get<ListKnownForResponse>(`/v1/names/${nameId}/known-for`),

  nameImages: (nameId: string) => get<ListImagesResponse>(`/v1/names/${nameId}/images`),

  listNames: (params: { limit?: number } = {}) =>
    get<ListNamesResponse>(`/v1/names${queryString(params)}`),

  genres: () => get<ListGenresResponse>("/v1/genres"),
};

// ── Search ─────────────────────────────────────────────────────────────

export const searchApi = {
  suggest: (q: string, limit = 8) =>
    get<SuggestResponse>(`/v1/search/suggest${queryString({ q, limit })}`),

  search: (q: string, type?: string, limit = 20) =>
    get<SearchResponse>(`/v1/search${queryString({ q, type, limit })}`),

  titles: (params: Record<string, string | number | string[] | undefined>) =>
    get<SearchResponse>(`/v1/search/titles${queryString(params)}`),

  names: (params: Record<string, string | number | string[] | undefined>) =>
    get<SearchResponse>(`/v1/search/names${queryString(params)}`),
};

// ── Ratings ────────────────────────────────────────────────────────────

export const ratingsApi = {
  titleRating: (titleId: string) => get<GetTitleRatingResponse>(`/v1/titles/${titleId}/rating`),

  demographics: (titleId: string) =>
    get<GetDemographicsResponse>(`/v1/titles/${titleId}/rating/demographics`),

  popularity: (titleId: string) => get<GetPopularityResponse>(`/v1/titles/${titleId}/popularity`),

  chart: (chart: string, limit = 50) =>
    get<GetChartResponse>(`/v1/charts/${chart}${queryString({ limit })}`),

  myRating: (titleId: string, token: string) =>
    get<GetUserRatingResponse>(`/v1/me/ratings/${titleId}`, token),

  myRatings: (token: string) => get<ListUserRatingsResponse>("/v1/me/ratings", token),

  rate: (titleId: string, value: number, token: string) =>
    mutate<RateTitleResponse>("PUT", `/v1/titles/${titleId}/rating`, token, { value }),

  unrate: (titleId: string, token: string) =>
    mutate<GetTitleRatingResponse>("DELETE", `/v1/titles/${titleId}/rating`, token),
};

// ── Reviews ────────────────────────────────────────────────────────────

export const reviewsApi = {
  titleReviews: (
    titleId: string,
    params: { sort?: string; spoilers?: string; limit?: number } = {},
  ) => get<ListReviewsResponse>(`/v1/titles/${titleId}/reviews${queryString(params)}`),

  criticReviews: (titleId: string) =>
    get<ListCriticReviewsResponse>(`/v1/titles/${titleId}/critic-reviews`),

  metascore: (titleId: string) => get<GetMetascoreResponse>(`/v1/titles/${titleId}/metascore`),

  create: (titleId: string, payload: unknown, token: string) =>
    mutate<{ review: unknown }>("POST", `/v1/titles/${titleId}/reviews`, token, payload),

  vote: (reviewId: string, helpful: boolean, token: string) =>
    mutate<{ review: unknown }>("POST", `/v1/reviews/${reviewId}/vote`, token, { helpful }),
};

// ── Lists ──────────────────────────────────────────────────────────────

export const listsApi = {
  /** The watchlist read returns the list and its items together — one round trip. */
  watchlist: (token: string, params: { sort?: string; limit?: number } = {}) =>
    get<GetListResponse & ListItemsResponse>(`/v1/me/watchlist${queryString(params)}`, token),

  onWatchlist: (entityId: string, token: string) =>
    get<WatchlistMembershipResponse>(`/v1/me/watchlist/${entityId}`, token),

  addToWatchlist: (entityId: string, token: string) =>
    mutate<WatchlistMembershipResponse>("PUT", `/v1/me/watchlist/${entityId}`, token, {}),

  removeFromWatchlist: (entityId: string, token: string) =>
    mutate<WatchlistMembershipResponse>("DELETE", `/v1/me/watchlist/${entityId}`, token),

  myLists: (token: string) => get<ListListsResponse>("/v1/me/lists", token),

  getList: (listId: string, token?: string | null) =>
    get<GetListResponse>(`/v1/lists/${listId}`, token),

  listItems: (listId: string, token?: string | null) =>
    get<ListItemsResponse>(`/v1/lists/${listId}/items`, token),
};

// ── Community ──────────────────────────────────────────────────────────

export const communityApi = {
  titleAwards: (titleId: string) => get<ListAwardsResponse>(`/v1/titles/${titleId}/awards`),

  nameAwards: (nameId: string) => get<ListAwardsResponse>(`/v1/names/${nameId}/awards`),

  titleFacts: (titleId: string, kind?: string) =>
    get<ListFactsResponse>(`/v1/titles/${titleId}/facts${queryString({ kind })}`),

  parentsGuide: (titleId: string) =>
    get<GetParentsGuideResponse>(`/v1/titles/${titleId}/parents-guide`),

  faq: (titleId: string) => get<ListFaqResponse>(`/v1/titles/${titleId}/faq`),

  news: (params: { entity?: string; limit?: number } = {}) =>
    get<ListNewsResponse>(`/v1/news${queryString(params)}`),

  myContributions: (token: string) =>
    get<ListContributionsResponse>("/v1/me/contributions", token),
};
