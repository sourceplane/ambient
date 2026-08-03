export type {
  RatingsRepository,
  RatingsRepositoryError,
  RatingsResult,
  AgeBand,
  GenderBand,
  ChartKey,
  UserRating,
  RatedTitle,
  RatingDistribution,
  TitleAggregate,
  DemographicCell,
  ChartEntry,
  ChartDefinition,
  PopularityEntry,
  RateTitleInput,
} from "./types.js";

export { AGE_BANDS, GENDER_BANDS, CHARTS, DEMOGRAPHIC_PRIVACY_FLOOR } from "./types.js";
export { createRatingsRepository } from "./repository.js";
export { weightedRating, priorMeanOf, roundRating } from "./weighted.js";
