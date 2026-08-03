export type { SqlExecutor, SqlExecutorResult, SqlRow } from "../hyperdrive/executor.js";
import type { Uuid } from "../ids/index.js";

export type RatingsRepositoryError =
  | { kind: "not_found" }
  | { kind: "internal"; message: string };

export type RatingsResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RatingsRepositoryError };

export const AGE_BANDS = ["under_18", "18_29", "30_44", "45_plus", "undisclosed"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const GENDER_BANDS = ["male", "female", "other", "undisclosed"] as const;
export type GenderBand = (typeof GENDER_BANDS)[number];

export const CHARTS = [
  "top_movies",
  "top_tv",
  "bottom_movies",
  "most_popular_movies",
  "most_popular_tv",
  "box_office",
  "coming_soon",
  "in_theaters",
] as const;
export type ChartKey = (typeof CHARTS)[number];

/**
 * A demographic cell is hidden below this many votes. Small cells identify
 * people: "the one 45+ voter who gave it a 1" is not an aggregate.
 */
export const DEMOGRAPHIC_PRIVACY_FLOOR = 25;

export interface UserRating {
  userId: string;
  titleId: string;
  value: number;
  ageBand: AgeBand;
  genderBand: GenderBand;
  ratedAt: Date;
  updatedAt: Date;
}

export interface RatingDistribution {
  /** Ten entries, value 1..10, each with its vote count. */
  buckets: Array<{ value: number; count: number }>;
}

export interface TitleAggregate {
  titleId: string;
  voteCount: number;
  /** Arithmetic mean to two decimals; null when there are no votes. */
  average: number | null;
  distribution: RatingDistribution;
  updatedAt: Date | null;
}

export interface DemographicCell {
  ageBand: AgeBand;
  genderBand: GenderBand;
  voteCount: number;
  average: number;
}

export interface ChartEntry {
  chart: ChartKey;
  computedFor: string;
  rank: number;
  titleId: string;
  score: number;
  previousRank: number | null;
}

export interface PopularityEntry {
  entityType: "title" | "person";
  entityId: string;
  computedFor: string;
  rank: number;
  previousRank: number | null;
  score: number;
}

export interface ChartDefinition {
  chart: ChartKey;
  minimumVotes: number;
  priorMean: number;
  size: number;
  description: string;
}

export interface RateTitleInput {
  userId: Uuid;
  titleId: Uuid;
  value: number;
  ageBand?: AgeBand;
  genderBand?: GenderBand;
  now: Date;
}

export interface RatedTitle {
  titleId: string;
  value: number;
  ratedAt: Date;
}

export interface RatingsRepository {
  /**
   * Cast or change a rating. The vote, the title aggregate and the demographic
   * cell all move in one transaction, so the panel can never show an average
   * that disagrees with the histogram.
   */
  rateTitle(input: RateTitleInput): Promise<RatingsResult<TitleAggregate>>;
  removeRating(userId: Uuid, titleId: Uuid, now: Date): Promise<RatingsResult<TitleAggregate>>;
  getUserRating(userId: Uuid, titleId: Uuid): Promise<RatingsResult<UserRating>>;
  listUserRatings(
    userId: Uuid,
    params: { limit: number; offset: number },
  ): Promise<RatingsResult<RatedTitle[]>>;
  getUserRatingsFor(userId: Uuid, titleIds: string[]): Promise<RatingsResult<Map<string, number>>>;

  getAggregate(titleId: Uuid): Promise<RatingsResult<TitleAggregate>>;
  getAggregates(titleIds: string[]): Promise<RatingsResult<Map<string, TitleAggregate>>>;
  getDemographics(titleId: Uuid): Promise<RatingsResult<DemographicCell[]>>;

  listChart(chart: ChartKey, limit: number): Promise<RatingsResult<ChartEntry[]>>;
  getChartDefinition(chart: ChartKey): Promise<RatingsResult<ChartDefinition>>;
  replaceChart(
    chart: ChartKey,
    computedFor: string,
    entries: Array<{ titleId: string; score: number }>,
  ): Promise<RatingsResult<number>>;
  /** Candidates for a Bayesian chart: aggregates above the vote threshold. */
  listChartCandidates(
    minimumVotes: number,
    limit: number,
  ): Promise<RatingsResult<Array<{ titleId: string; voteCount: number; average: number }>>>;

  getPopularity(
    entityType: "title" | "person",
    entityId: Uuid,
  ): Promise<RatingsResult<PopularityEntry>>;
  replacePopularity(
    entityType: "title" | "person",
    computedFor: string,
    entries: Array<{ entityId: string; score: number }>,
  ): Promise<RatingsResult<number>>;
}
