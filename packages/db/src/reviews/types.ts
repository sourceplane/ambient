export type { SqlExecutor, SqlExecutorResult, SqlRow } from "../hyperdrive/executor.js";
import type { Uuid } from "../ids/index.js";

export type ReviewsRepositoryError =
  | { kind: "not_found" }
  | { kind: "conflict"; entity: string }
  | { kind: "internal"; message: string };

export type ReviewsResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ReviewsRepositoryError };

export const REVIEW_STATES = ["published", "pending", "rejected", "deleted"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export const REVIEW_SORTS = ["helpfulness", "date", "rating"] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

export interface UserReview {
  id: string;
  titleId: string;
  userId: string;
  headline: string;
  body: string;
  rating: number | null;
  hasSpoilers: boolean;
  state: ReviewState;
  helpfulCount: number;
  unhelpfulCount: number;
  submittedAt: Date;
  updatedAt: Date;
  moderatedAt: Date | null;
  decisionNote: string | null;
}

export interface CriticReview {
  id: string;
  titleId: string;
  publication: string;
  author: string | null;
  url: string | null;
  quote: string;
  score: number | null;
  publishedOn: string | null;
}

export interface Metascore {
  titleId: string;
  metascore: number | null;
  criticCount: number;
  positiveCount: number;
  mixedCount: number;
  negativeCount: number;
}

export interface CreateReviewInput {
  id: Uuid;
  titleId: Uuid;
  userId: Uuid;
  headline: string;
  body: string;
  rating?: number | null;
  hasSpoilers?: boolean;
  state?: ReviewState;
  now: Date;
}

export interface UpdateReviewInput {
  headline?: string;
  body?: string;
  rating?: number | null;
  hasSpoilers?: boolean;
}

export interface ListReviewsQuery {
  sort: ReviewSort;
  includeSpoilers: boolean;
  limit: number;
  offset: number;
}

export interface UpsertCriticReviewInput {
  id: Uuid;
  titleId: Uuid;
  publication: string;
  author?: string | null;
  url?: string | null;
  quote: string;
  score?: number | null;
  publishedOn?: string | null;
}

export interface ReviewsRepository {
  createReview(input: CreateReviewInput): Promise<ReviewsResult<UserReview>>;
  updateReview(
    reviewId: Uuid,
    userId: Uuid,
    input: UpdateReviewInput,
    now: Date,
  ): Promise<ReviewsResult<UserReview>>;
  /** Soft delete: the row survives so the partial index frees the slot. */
  deleteReview(reviewId: Uuid, userId: Uuid, now: Date): Promise<ReviewsResult<void>>;
  getReview(reviewId: Uuid): Promise<ReviewsResult<UserReview>>;
  listTitleReviews(titleId: Uuid, query: ListReviewsQuery): Promise<ReviewsResult<UserReview[]>>;
  listUserReviews(
    userId: Uuid,
    params: { limit: number; offset: number },
  ): Promise<ReviewsResult<UserReview[]>>;

  /** Cast or flip a helpfulness vote; counters move in the same transaction. */
  voteReview(reviewId: Uuid, userId: Uuid, isHelpful: boolean): Promise<ReviewsResult<UserReview>>;
  clearVote(reviewId: Uuid, userId: Uuid): Promise<ReviewsResult<UserReview>>;

  listModerationQueue(params: { limit: number; offset: number }): Promise<ReviewsResult<UserReview[]>>;
  moderateReview(
    reviewId: Uuid,
    moderatorId: Uuid,
    state: ReviewState,
    note: string | null,
    now: Date,
  ): Promise<ReviewsResult<UserReview>>;

  listCriticReviews(titleId: Uuid, limit: number): Promise<ReviewsResult<CriticReview[]>>;
  upsertCriticReview(input: UpsertCriticReviewInput): Promise<ReviewsResult<CriticReview>>;
  getMetascore(titleId: Uuid): Promise<ReviewsResult<Metascore>>;
  /** Recompute the metascore and its band counts from the critic rows. */
  refreshMetascore(titleId: Uuid, now: Date): Promise<ReviewsResult<Metascore>>;
}
