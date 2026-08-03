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

import type { RequestOptions, Transport } from "./transport.js";

/**
 * Catalog resource client — titles, people, credits and media.
 *
 * Every route here is public: `api-edge` answers them without a session, rate
 * limits by IP, and returns a cacheable response with a strong ETag. The SDK
 * still sends whatever auth the client was constructed with, because a caller
 * who has a token has no reason to strip it — but none of these calls require
 * one.
 */
export class CatalogClient {
  constructor(private readonly transport: Transport) {}

  /** GET /v1/titles — browse with filters and a cursor. */
  listTitles(
    query: { kind?: string; genre?: string; limit?: number; cursor?: string } = {},
    opts: RequestOptions = {},
  ): Promise<ListTitlesResponse> {
    return this.transport.request<ListTitlesResponse>(
      { method: "GET", path: "/v1/titles", query },
      opts,
    );
  }

  /**
   * GET /v1/titles?ids=… — hydrate an ordered set of public ids.
   *
   * The response preserves the order of `titleIds` and omits ids that do not
   * resolve, which is what makes it safe to drive from a chart or a stale
   * watchlist. An empty input performs no request.
   */
  batchTitles(titleIds: string[], opts: RequestOptions = {}): Promise<ListTitlesResponse> {
    if (titleIds.length === 0) return Promise.resolve({ titles: [] });
    return this.transport.request<ListTitlesResponse>(
      { method: "GET", path: "/v1/titles", query: { ids: titleIds.join(",") } },
      opts,
    );
  }

  /** GET /v1/titles/:titleId */
  getTitle(titleId: string, opts: RequestOptions = {}): Promise<GetTitleResponse> {
    return this.transport.request<GetTitleResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}` },
      opts,
    );
  }

  /** GET /v1/titles/:titleId/credits */
  listTitleCredits(
    titleId: string,
    query: { category?: string; department?: string; limit?: number } = {},
    opts: RequestOptions = {},
  ): Promise<ListTitleCreditsResponse> {
    return this.transport.request<ListTitleCreditsResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/credits`, query },
      opts,
    );
  }

  /** GET /v1/titles/:titleId/images */
  listTitleImages(
    titleId: string,
    query: { kind?: string; limit?: number } = {},
    opts: RequestOptions = {},
  ): Promise<ListImagesResponse> {
    return this.transport.request<ListImagesResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/images`, query },
      opts,
    );
  }

  /** GET /v1/titles/:titleId/videos */
  listTitleVideos(titleId: string, opts: RequestOptions = {}): Promise<ListVideosResponse> {
    return this.transport.request<ListVideosResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/videos` },
      opts,
    );
  }

  /** GET /v1/titles/:titleId/keywords */
  listTitleKeywords(titleId: string, opts: RequestOptions = {}): Promise<ListKeywordsResponse> {
    return this.transport.request<ListKeywordsResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/keywords` },
      opts,
    );
  }

  /** GET /v1/titles/:titleId/technical */
  getTechnicalSpecs(
    titleId: string,
    opts: RequestOptions = {},
  ): Promise<ListTechnicalSpecsResponse> {
    return this.transport.request<ListTechnicalSpecsResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/technical` },
      opts,
    );
  }

  /** GET /v1/titles/:titleId/release-dates */
  listReleaseDates(titleId: string, opts: RequestOptions = {}): Promise<ListReleaseDatesResponse> {
    return this.transport.request<ListReleaseDatesResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/release-dates` },
      opts,
    );
  }

  /** GET /v1/titles/:titleId/certificates */
  listCertificates(titleId: string, opts: RequestOptions = {}): Promise<ListCertificatesResponse> {
    return this.transport.request<ListCertificatesResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/certificates` },
      opts,
    );
  }

  /** GET /v1/titles/:titleId/companies */
  listTitleCompanies(
    titleId: string,
    opts: RequestOptions = {},
  ): Promise<ListTitleCompaniesResponse> {
    return this.transport.request<ListTitleCompaniesResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/companies` },
      opts,
    );
  }

  /** GET /v1/titles/:titleId/box-office */
  getBoxOffice(titleId: string, opts: RequestOptions = {}): Promise<GetBoxOfficeResponse> {
    return this.transport.request<GetBoxOfficeResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/box-office` },
      opts,
    );
  }

  /** GET /v1/titles/:titleId/connections */
  listConnections(titleId: string, opts: RequestOptions = {}): Promise<ListConnectionsResponse> {
    return this.transport.request<ListConnectionsResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/connections` },
      opts,
    );
  }

  /** GET /v1/titles/:titleId/external-ids */
  listExternalIds(titleId: string, opts: RequestOptions = {}): Promise<ListExternalIdsResponse> {
    return this.transport.request<ListExternalIdsResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/external-ids` },
      opts,
    );
  }

  /** GET /v1/titles/:titleId/seasons */
  listSeasons(titleId: string, opts: RequestOptions = {}): Promise<ListSeasonsResponse> {
    return this.transport.request<ListSeasonsResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/seasons` },
      opts,
    );
  }

  /** GET /v1/titles/:titleId/episodes */
  listEpisodes(
    titleId: string,
    query: { season?: number } = {},
    opts: RequestOptions = {},
  ): Promise<ListEpisodesResponse> {
    return this.transport.request<ListEpisodesResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/episodes`, query },
      opts,
    );
  }

  /** GET /v1/names */
  listNames(
    query: { limit?: number; cursor?: string } = {},
    opts: RequestOptions = {},
  ): Promise<ListNamesResponse> {
    return this.transport.request<ListNamesResponse>(
      { method: "GET", path: "/v1/names", query },
      opts,
    );
  }

  /** GET /v1/names/:nameId */
  getName(nameId: string, opts: RequestOptions = {}): Promise<GetNameResponse> {
    return this.transport.request<GetNameResponse>(
      { method: "GET", path: `/v1/names/${encodeURIComponent(nameId)}` },
      opts,
    );
  }

  /** GET /v1/names/:nameId/credits */
  listNameCredits(
    nameId: string,
    query: { department?: string; limit?: number } = {},
    opts: RequestOptions = {},
  ): Promise<ListNameCreditsResponse> {
    return this.transport.request<ListNameCreditsResponse>(
      { method: "GET", path: `/v1/names/${encodeURIComponent(nameId)}/credits`, query },
      opts,
    );
  }

  /** GET /v1/names/:nameId/known-for */
  listKnownFor(nameId: string, opts: RequestOptions = {}): Promise<ListKnownForResponse> {
    return this.transport.request<ListKnownForResponse>(
      { method: "GET", path: `/v1/names/${encodeURIComponent(nameId)}/known-for` },
      opts,
    );
  }

  /** GET /v1/names/:nameId/images */
  listNameImages(nameId: string, opts: RequestOptions = {}): Promise<ListImagesResponse> {
    return this.transport.request<ListImagesResponse>(
      { method: "GET", path: `/v1/names/${encodeURIComponent(nameId)}/images` },
      opts,
    );
  }

  /** GET /v1/genres */
  listGenres(opts: RequestOptions = {}): Promise<ListGenresResponse> {
    return this.transport.request<ListGenresResponse>(
      { method: "GET", path: "/v1/genres" },
      opts,
    );
  }
}
