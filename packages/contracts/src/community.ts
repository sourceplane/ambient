// Community contracts — awards, contributed facts, parents guide, FAQ, news,
// and the contribution queue.

export type FactKind =
  | "trivia"
  | "goof"
  | "quote"
  | "crazy_credit"
  | "alternate_version"
  | "soundtrack";

export type ParentsGuideCategory =
  | "sex_nudity"
  | "violence_gore"
  | "profanity"
  | "alcohol_drugs_smoking"
  | "frightening_intense";

export type Severity = "none" | "mild" | "moderate" | "severe";

export type ContributionTarget =
  | "title"
  | "person"
  | "credit"
  | "fact"
  | "image"
  | "parents_guide"
  | "faq";

export type ContributionState = "pending" | "approved" | "rejected" | "withdrawn";

export interface PublicQuoteLine {
  speaker: string | null;
  line: string;
}

export interface PublicFact {
  id: string;
  kind: FactKind;
  subkind: string | null;
  body: string;
  hasSpoilers: boolean;
  interestingVotes: number;
  totalVotes: number;
  /** Structured dialogue for `quote` facts; empty for every other kind. */
  quoteLines: PublicQuoteLine[];
}

export interface PublicAward {
  id: string;
  body: string;
  bodySlug: string;
  year: number;
  category: string;
  isWinner: boolean;
  note: string | null;
  titleId: string | null;
  nameId: string | null;
}

export interface PublicParentsGuideEntry {
  id: string;
  category: ParentsGuideCategory;
  body: string;
  hasSpoilers: boolean;
}

export interface PublicSeverityTally {
  category: ParentsGuideCategory;
  severity: Severity | null;
  votes: Record<Severity, number>;
  totalVotes: number;
}

export interface PublicFaqEntry {
  id: string;
  question: string;
  answer: string;
  hasSpoilers: boolean;
}

export interface PublicNewsArticle {
  id: string;
  headline: string;
  body: string | null;
  source: string;
  author: string | null;
  url: string | null;
  imageUrl: string | null;
  publishedAt: string;
}

export interface PublicContribution {
  id: string;
  targetType: ContributionTarget;
  targetId: string | null;
  operation: "create" | "update" | "delete";
  state: ContributionState;
  submittedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface PublicContributorStats {
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
  reputation: number;
}

export interface CreateFactRequest {
  kind: FactKind;
  subkind?: string | null;
  body: string;
  hasSpoilers?: boolean;
  quoteLines?: PublicQuoteLine[];
}

export interface SetSeverityRequest {
  severity: Severity;
}

export interface SubmitContributionRequest {
  targetType: ContributionTarget;
  targetId?: string | null;
  operation: "create" | "update" | "delete";
  payload?: Record<string, unknown>;
}

export interface ModerateContributionRequest {
  state: "approved" | "rejected";
  note?: string | null;
}

export interface ListAwardsResponse {
  awards: PublicAward[];
}

export interface ListFactsResponse {
  facts: PublicFact[];
}

export interface GetParentsGuideResponse {
  entries: PublicParentsGuideEntry[];
  severity: PublicSeverityTally[];
}

export interface ListFaqResponse {
  faq: PublicFaqEntry[];
}

export interface ListNewsResponse {
  news: PublicNewsArticle[];
}

export interface ListContributionsResponse {
  contributions: PublicContribution[];
}
