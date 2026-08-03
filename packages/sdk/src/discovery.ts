// Search, ratings, reviews, lists and community — the five catalog satellites.
//
// They live in one module because each is a handful of methods over the same
// public `/v1` surface, and splitting them into five files would be five
// near-empty files. `client.search`, `client.ratings` and so on are still
// separate namespaces; only the source is shared.

import type { SearchResponse, SuggestResponse } from "@saas/contracts/search";
import type {
  GetChartResponse,
  GetDemographicsResponse,
  GetPopularityResponse,
  GetTitleRatingResponse,
  GetUserRatingResponse,
  ListUserRatingsResponse,
  RateTitleRequest,
  RateTitleResponse,
} from "@saas/contracts/ratings";
import type {
  CreateReviewRequest,
  GetMetascoreResponse,
  GetReviewResponse,
  ListCriticReviewsResponse,
  ListReviewsResponse,
  VoteReviewRequest,
} from "@saas/contracts/reviews";
import type {
  AddListItemRequest,
  CreateListRequest,
  GetListResponse,
  ListItemsResponse,
  ListListsResponse,
  WatchlistMembershipResponse,
} from "@saas/contracts/lists";
import type {
  CreateFactRequest,
  GetParentsGuideResponse,
  ListAwardsResponse,
  ListContributionsResponse,
  ListFactsResponse,
  ListFaqResponse,
  ListNewsResponse,
  SubmitContributionRequest,
} from "@saas/contracts/community";

import type { RequestOptions, Transport } from "./transport.js";

/** Typeahead, full-text and advanced search. */
export class SearchClient {
  constructor(private readonly transport: Transport) {}

  /** GET /v1/search/suggest — typeahead, answered on every keystroke. */
  suggest(
    query: { q: string; limit?: number },
    opts: RequestOptions = {},
  ): Promise<SuggestResponse> {
    return this.transport.request<SuggestResponse>(
      { method: "GET", path: "/v1/search/suggest", query },
      opts,
    );
  }

  /** GET /v1/search */
  search(
    query: { q: string; type?: string; limit?: number },
    opts: RequestOptions = {},
  ): Promise<SearchResponse> {
    return this.transport.request<SearchResponse>(
      { method: "GET", path: "/v1/search", query },
      opts,
    );
  }

  /** GET /v1/search/titles — advanced title search. */
  titles(
    query: Record<string, string | number | undefined>,
    opts: RequestOptions = {},
  ): Promise<SearchResponse> {
    return this.transport.request<SearchResponse>(
      { method: "GET", path: "/v1/search/titles", query },
      opts,
    );
  }

  /** GET /v1/search/names — advanced name search. */
  names(
    query: Record<string, string | number | undefined>,
    opts: RequestOptions = {},
  ): Promise<SearchResponse> {
    return this.transport.request<SearchResponse>(
      { method: "GET", path: "/v1/search/names", query },
      opts,
    );
  }
}

/** Ratings, aggregates and charts. */
export class RatingsClient {
  constructor(private readonly transport: Transport) {}

  /** GET /v1/titles/:titleId/rating */
  getTitleRating(titleId: string, opts: RequestOptions = {}): Promise<GetTitleRatingResponse> {
    return this.transport.request<GetTitleRatingResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/rating` },
      opts,
    );
  }

  /** GET /v1/titles/:titleId/rating/demographics */
  getDemographics(titleId: string, opts: RequestOptions = {}): Promise<GetDemographicsResponse> {
    return this.transport.request<GetDemographicsResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/rating/demographics` },
      opts,
    );
  }

  /** GET /v1/titles/:titleId/popularity */
  getPopularity(titleId: string, opts: RequestOptions = {}): Promise<GetPopularityResponse> {
    return this.transport.request<GetPopularityResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/popularity` },
      opts,
    );
  }

  /**
   * GET /v1/charts/:chart
   *
   * Entries carry `titleId` only — the ratings context cannot read the
   * catalog's schema. Pair this with `client.catalog.batchTitles()` to render
   * them.
   */
  getChart(
    chart: string,
    query: { limit?: number } = {},
    opts: RequestOptions = {},
  ): Promise<GetChartResponse> {
    return this.transport.request<GetChartResponse>(
      { method: "GET", path: `/v1/charts/${encodeURIComponent(chart)}`, query },
      opts,
    );
  }

  /** PUT /v1/titles/:titleId/rating — requires auth. */
  rate(
    titleId: string,
    body: RateTitleRequest,
    opts: RequestOptions = {},
  ): Promise<RateTitleResponse> {
    return this.transport.request<RateTitleResponse>(
      { method: "PUT", path: `/v1/titles/${encodeURIComponent(titleId)}/rating`, body },
      opts,
    );
  }

  /** DELETE /v1/titles/:titleId/rating — requires auth. */
  unrate(titleId: string, opts: RequestOptions = {}): Promise<GetTitleRatingResponse> {
    return this.transport.request<GetTitleRatingResponse>(
      { method: "DELETE", path: `/v1/titles/${encodeURIComponent(titleId)}/rating` },
      opts,
    );
  }

  /** GET /v1/me/ratings — requires auth. */
  listMyRatings(opts: RequestOptions = {}): Promise<ListUserRatingsResponse> {
    return this.transport.request<ListUserRatingsResponse>(
      { method: "GET", path: "/v1/me/ratings" },
      opts,
    );
  }

  /** GET /v1/me/ratings/:titleId — requires auth. */
  getMyRating(titleId: string, opts: RequestOptions = {}): Promise<GetUserRatingResponse> {
    return this.transport.request<GetUserRatingResponse>(
      { method: "GET", path: `/v1/me/ratings/${encodeURIComponent(titleId)}` },
      opts,
    );
  }
}

/** User reviews, critic reviews and the metascore. */
export class ReviewsClient {
  constructor(private readonly transport: Transport) {}

  /** GET /v1/titles/:titleId/reviews */
  listTitleReviews(
    titleId: string,
    query: { sort?: string; spoilers?: string; limit?: number } = {},
    opts: RequestOptions = {},
  ): Promise<ListReviewsResponse> {
    return this.transport.request<ListReviewsResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/reviews`, query },
      opts,
    );
  }

  /** GET /v1/titles/:titleId/critic-reviews */
  listCriticReviews(titleId: string, opts: RequestOptions = {}): Promise<ListCriticReviewsResponse> {
    return this.transport.request<ListCriticReviewsResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/critic-reviews` },
      opts,
    );
  }

  /** GET /v1/titles/:titleId/metascore */
  getMetascore(titleId: string, opts: RequestOptions = {}): Promise<GetMetascoreResponse> {
    return this.transport.request<GetMetascoreResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/metascore` },
      opts,
    );
  }

  /** GET /v1/users/:userId/reviews */
  listUserReviews(userId: string, opts: RequestOptions = {}): Promise<ListReviewsResponse> {
    return this.transport.request<ListReviewsResponse>(
      { method: "GET", path: `/v1/users/${encodeURIComponent(userId)}/reviews` },
      opts,
    );
  }

  /** POST /v1/titles/:titleId/reviews — requires auth. */
  create(
    titleId: string,
    body: CreateReviewRequest,
    opts: RequestOptions = {},
  ): Promise<GetReviewResponse> {
    return this.transport.request<GetReviewResponse>(
      { method: "POST", path: `/v1/titles/${encodeURIComponent(titleId)}/reviews`, body },
      opts,
    );
  }

  /** POST /v1/reviews/:reviewId/vote — requires auth. */
  vote(
    reviewId: string,
    body: VoteReviewRequest,
    opts: RequestOptions = {},
  ): Promise<GetReviewResponse> {
    return this.transport.request<GetReviewResponse>(
      { method: "POST", path: `/v1/reviews/${encodeURIComponent(reviewId)}/vote`, body },
      opts,
    );
  }
}

/** Watchlist and user-curated lists. */
export class ListsClient {
  constructor(private readonly transport: Transport) {}

  /** GET /v1/me/watchlist — requires auth. Returns the list and its items. */
  getWatchlist(
    query: { sort?: string; limit?: number } = {},
    opts: RequestOptions = {},
  ): Promise<GetListResponse & ListItemsResponse> {
    return this.transport.request<GetListResponse & ListItemsResponse>(
      { method: "GET", path: "/v1/me/watchlist", query },
      opts,
    );
  }

  /** GET /v1/me/watchlist/:entityId — requires auth. */
  onWatchlist(
    entityId: string,
    opts: RequestOptions = {},
  ): Promise<WatchlistMembershipResponse> {
    return this.transport.request<WatchlistMembershipResponse>(
      { method: "GET", path: `/v1/me/watchlist/${encodeURIComponent(entityId)}` },
      opts,
    );
  }

  /** PUT /v1/me/watchlist/:entityId — idempotent; requires auth. */
  addToWatchlist(
    entityId: string,
    opts: RequestOptions = {},
  ): Promise<WatchlistMembershipResponse> {
    return this.transport.request<WatchlistMembershipResponse>(
      { method: "PUT", path: `/v1/me/watchlist/${encodeURIComponent(entityId)}`, body: {} },
      opts,
    );
  }

  /** DELETE /v1/me/watchlist/:entityId — requires auth. */
  removeFromWatchlist(
    entityId: string,
    opts: RequestOptions = {},
  ): Promise<WatchlistMembershipResponse> {
    return this.transport.request<WatchlistMembershipResponse>(
      { method: "DELETE", path: `/v1/me/watchlist/${encodeURIComponent(entityId)}` },
      opts,
    );
  }

  /** GET /v1/me/lists — requires auth. */
  listMine(opts: RequestOptions = {}): Promise<ListListsResponse> {
    return this.transport.request<ListListsResponse>(
      { method: "GET", path: "/v1/me/lists" },
      opts,
    );
  }

  /** GET /v1/users/:userId/lists */
  listForUser(userId: string, opts: RequestOptions = {}): Promise<ListListsResponse> {
    return this.transport.request<ListListsResponse>(
      { method: "GET", path: `/v1/users/${encodeURIComponent(userId)}/lists` },
      opts,
    );
  }

  /** GET /v1/lists/:listId */
  get(listId: string, opts: RequestOptions = {}): Promise<GetListResponse> {
    return this.transport.request<GetListResponse>(
      { method: "GET", path: `/v1/lists/${encodeURIComponent(listId)}` },
      opts,
    );
  }

  /** GET /v1/lists/:listId/items */
  items(listId: string, opts: RequestOptions = {}): Promise<ListItemsResponse> {
    return this.transport.request<ListItemsResponse>(
      { method: "GET", path: `/v1/lists/${encodeURIComponent(listId)}/items` },
      opts,
    );
  }

  /** POST /v1/me/lists — requires auth. */
  create(body: CreateListRequest, opts: RequestOptions = {}): Promise<GetListResponse> {
    return this.transport.request<GetListResponse>(
      { method: "POST", path: "/v1/me/lists", body },
      opts,
    );
  }

  /** POST /v1/lists/:listId/items — requires auth. */
  addItem(
    listId: string,
    body: AddListItemRequest,
    opts: RequestOptions = {},
  ): Promise<ListItemsResponse> {
    return this.transport.request<ListItemsResponse>(
      { method: "POST", path: `/v1/lists/${encodeURIComponent(listId)}/items`, body },
      opts,
    );
  }
}

/** Awards, contributed facts, parents guide, FAQ, news and contributions. */
export class CommunityClient {
  constructor(private readonly transport: Transport) {}

  /** GET /v1/titles/:titleId/awards */
  listTitleAwards(titleId: string, opts: RequestOptions = {}): Promise<ListAwardsResponse> {
    return this.transport.request<ListAwardsResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/awards` },
      opts,
    );
  }

  /** GET /v1/names/:nameId/awards */
  listNameAwards(nameId: string, opts: RequestOptions = {}): Promise<ListAwardsResponse> {
    return this.transport.request<ListAwardsResponse>(
      { method: "GET", path: `/v1/names/${encodeURIComponent(nameId)}/awards` },
      opts,
    );
  }

  /** GET /v1/titles/:titleId/facts */
  listFacts(
    titleId: string,
    query: { kind?: string } = {},
    opts: RequestOptions = {},
  ): Promise<ListFactsResponse> {
    return this.transport.request<ListFactsResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/facts`, query },
      opts,
    );
  }

  /** GET /v1/titles/:titleId/parents-guide */
  getParentsGuide(titleId: string, opts: RequestOptions = {}): Promise<GetParentsGuideResponse> {
    return this.transport.request<GetParentsGuideResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/parents-guide` },
      opts,
    );
  }

  /** GET /v1/titles/:titleId/faq */
  listFaq(titleId: string, opts: RequestOptions = {}): Promise<ListFaqResponse> {
    return this.transport.request<ListFaqResponse>(
      { method: "GET", path: `/v1/titles/${encodeURIComponent(titleId)}/faq` },
      opts,
    );
  }

  /** GET /v1/news */
  listNews(
    query: { entity?: string; limit?: number } = {},
    opts: RequestOptions = {},
  ): Promise<ListNewsResponse> {
    return this.transport.request<ListNewsResponse>(
      { method: "GET", path: "/v1/news", query },
      opts,
    );
  }

  /**
   * POST /v1/titles/:titleId/facts — requires auth.
   *
   * The fact is created `pending`. Publishing is a moderator decision, never a
   * side effect of submitting.
   */
  submitFact(
    titleId: string,
    body: CreateFactRequest,
    opts: RequestOptions = {},
  ): Promise<{ fact: { id: string } }> {
    return this.transport.request<{ fact: { id: string } }>(
      { method: "POST", path: `/v1/titles/${encodeURIComponent(titleId)}/facts`, body },
      opts,
    );
  }

  /** POST /v1/contributions — requires auth. */
  submitContribution(
    body: SubmitContributionRequest,
    opts: RequestOptions = {},
  ): Promise<{ contribution: { id: string } }> {
    return this.transport.request<{ contribution: { id: string } }>(
      { method: "POST", path: "/v1/contributions", body },
      opts,
    );
  }

  /** GET /v1/me/contributions — requires auth. */
  listMyContributions(opts: RequestOptions = {}): Promise<ListContributionsResponse> {
    return this.transport.request<ListContributionsResponse>(
      { method: "GET", path: "/v1/me/contributions" },
      opts,
    );
  }
}
