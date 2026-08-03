// Ratings contracts — the ratings panel, the charts, and the popularity meters.

export type AgeBand = "under_18" | "18_29" | "30_44" | "45_plus" | "undisclosed";
export type GenderBand = "male" | "female" | "other" | "undisclosed";

export type ChartKey =
  | "top_movies"
  | "top_tv"
  | "bottom_movies"
  | "most_popular_movies"
  | "most_popular_tv"
  | "box_office"
  | "coming_soon"
  | "in_theaters";

export interface RatingBucket {
  value: number;
  count: number;
  /** Share of the total, 0–1, so the histogram needs no client-side math. */
  share: number;
}

export interface PublicTitleRating {
  titleId: string;
  average: number | null;
  voteCount: number;
  distribution: RatingBucket[];
}

export interface PublicDemographicCell {
  ageBand: AgeBand;
  genderBand: GenderBand;
  voteCount: number;
  average: number;
}

export interface GetTitleRatingResponse {
  rating: PublicTitleRating;
}

export interface GetDemographicsResponse {
  /** Cells below the privacy floor are absent, not zeroed. */
  demographics: PublicDemographicCell[];
  privacyFloor: number;
}

export interface RateTitleRequest {
  value: number;
}

export interface RateTitleResponse {
  rating: PublicTitleRating;
  yourRating: number;
}

export interface PublicChartEntry {
  rank: number;
  previousRank: number | null;
  /** rank − previousRank, negative meaning "moved up". Null when new. */
  delta: number | null;
  titleId: string;
  score: number;
}

export interface GetChartResponse {
  chart: ChartKey;
  computedFor: string | null;
  entries: PublicChartEntry[];
}

export interface PublicPopularity {
  rank: number;
  previousRank: number | null;
  delta: number | null;
  computedFor: string;
}

export interface GetPopularityResponse {
  popularity: PublicPopularity | null;
}

export interface PublicUserRating {
  titleId: string;
  value: number;
  ratedAt: string;
}

export interface ListUserRatingsResponse {
  ratings: PublicUserRating[];
}

export interface GetUserRatingResponse {
  rating: PublicUserRating | null;
}
