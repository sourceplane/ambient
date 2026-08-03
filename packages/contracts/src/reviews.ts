// Reviews contracts — user reviews, helpfulness, critic reviews, metascore.

export type ReviewState = "published" | "pending" | "rejected" | "deleted";
export type ReviewSort = "helpfulness" | "date" | "rating";

export interface PublicReview {
  id: string;
  titleId: string;
  authorId: string;
  headline: string;
  body: string;
  rating: number | null;
  hasSpoilers: boolean;
  helpfulCount: number;
  unhelpfulCount: number;
  submittedAt: string;
  updatedAt: string;
}

/** What a moderator sees — adds the fields a reader must never be shown. */
export interface ModeratedReview extends PublicReview {
  state: ReviewState;
  moderatedAt: string | null;
  decisionNote: string | null;
}

export interface PublicCriticReview {
  id: string;
  publication: string;
  author: string | null;
  url: string | null;
  quote: string;
  score: number | null;
  publishedOn: string | null;
}

export interface PublicMetascore {
  metascore: number | null;
  criticCount: number;
  positiveCount: number;
  mixedCount: number;
  negativeCount: number;
  /** `positive` | `mixed` | `negative` | null — the pill's colour band. */
  band: "positive" | "mixed" | "negative" | null;
}

export interface CreateReviewRequest {
  headline: string;
  body: string;
  rating?: number | null;
  hasSpoilers?: boolean;
}

export type UpdateReviewRequest = Partial<CreateReviewRequest>;

export interface VoteReviewRequest {
  helpful: boolean;
}

export interface ModerateReviewRequest {
  state: "published" | "rejected";
  note?: string | null;
}

export interface ListReviewsResponse {
  reviews: PublicReview[];
}

export interface GetReviewResponse {
  review: PublicReview;
}

export interface ListCriticReviewsResponse {
  criticReviews: PublicCriticReview[];
}

export interface GetMetascoreResponse {
  metascore: PublicMetascore;
}

export interface ListModerationQueueResponse {
  reviews: ModeratedReview[];
}
