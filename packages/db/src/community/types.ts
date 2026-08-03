export type { SqlExecutor, SqlExecutorResult, SqlRow } from "../hyperdrive/executor.js";
import type { Uuid } from "../ids/index.js";

export type CommunityRepositoryError =
  | { kind: "not_found" }
  | { kind: "conflict"; entity: string }
  | { kind: "internal"; message: string };

export type CommunityResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: CommunityRepositoryError };

export const FACT_KINDS = [
  "trivia",
  "goof",
  "quote",
  "crazy_credit",
  "alternate_version",
  "soundtrack",
] as const;
export type FactKind = (typeof FACT_KINDS)[number];

export const GOOF_SUBKINDS = [
  "continuity",
  "factual_error",
  "anachronism",
  "revealing_mistake",
  "plot_hole",
  "audio_visual",
] as const;
export type GoofSubkind = (typeof GOOF_SUBKINDS)[number];

export const PARENTS_GUIDE_CATEGORIES = [
  "sex_nudity",
  "violence_gore",
  "profanity",
  "alcohol_drugs_smoking",
  "frightening_intense",
] as const;
export type ParentsGuideCategory = (typeof PARENTS_GUIDE_CATEGORIES)[number];

export const SEVERITIES = ["none", "mild", "moderate", "severe"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CONTRIBUTION_TARGETS = [
  "title",
  "person",
  "credit",
  "fact",
  "image",
  "parents_guide",
  "faq",
] as const;
export type ContributionTarget = (typeof CONTRIBUTION_TARGETS)[number];

export const CONTRIBUTION_STATES = ["pending", "approved", "rejected", "withdrawn"] as const;
export type ContributionState = (typeof CONTRIBUTION_STATES)[number];

export type ModerationState = "published" | "pending" | "rejected";

export interface QuoteLine {
  ordering: number;
  speaker: string | null;
  line: string;
}

export interface TitleFact {
  id: string;
  titleId: string;
  kind: FactKind;
  subkind: string | null;
  body: string;
  hasSpoilers: boolean;
  interestingVotes: number;
  totalVotes: number;
  state: ModerationState;
  contributorUserId: string | null;
  ordering: number;
  quoteLines: QuoteLine[];
}

export interface AwardNomination {
  id: string;
  bodySlug: string;
  bodyName: string;
  year: number;
  categoryName: string;
  titleId: string | null;
  personId: string | null;
  isWinner: boolean;
  note: string | null;
}

export interface ParentsGuideEntry {
  id: string;
  titleId: string;
  category: ParentsGuideCategory;
  body: string;
  hasSpoilers: boolean;
  state: ModerationState;
}

export interface SeverityTally {
  category: ParentsGuideCategory;
  /** The modal vote — what the summary row shows. Null with no votes. */
  severity: Severity | null;
  votes: Record<Severity, number>;
  totalVotes: number;
}

export interface FaqEntry {
  id: string;
  titleId: string;
  question: string;
  answer: string;
  hasSpoilers: boolean;
  state: ModerationState;
}

export interface NewsArticle {
  id: string;
  headline: string;
  body: string | null;
  source: string;
  author: string | null;
  url: string | null;
  imageUrl: string | null;
  publishedAt: Date;
}

export interface Contribution {
  id: string;
  contributorUserId: string;
  targetType: ContributionTarget;
  targetId: string | null;
  operation: "create" | "update" | "delete";
  payload: Record<string, unknown>;
  state: ContributionState;
  submittedAt: Date;
  decidedAt: Date | null;
  decisionNote: string | null;
}

export interface ContributorStats {
  userId: string;
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
  reputation: number;
}

export interface CreateFactInput {
  id: Uuid;
  titleId: Uuid;
  kind: FactKind;
  subkind?: string | null;
  body: string;
  hasSpoilers?: boolean;
  state?: ModerationState;
  contributorUserId?: Uuid | null;
  quoteLines?: Array<{ speaker: string | null; line: string }>;
}

export interface SubmitContributionInput {
  id: Uuid;
  contributorUserId: Uuid;
  targetType: ContributionTarget;
  targetId?: Uuid | null;
  operation: "create" | "update" | "delete";
  payload: Record<string, unknown>;
}

export interface CommunityRepository {
  // Awards
  listTitleAwards(titleId: Uuid): Promise<CommunityResult<AwardNomination[]>>;
  listPersonAwards(personId: Uuid): Promise<CommunityResult<AwardNomination[]>>;
  listEditionAwards(bodySlug: string, year: number): Promise<CommunityResult<AwardNomination[]>>;

  // Facts
  listFacts(titleId: Uuid, kind: FactKind | null, limit: number): Promise<CommunityResult<TitleFact[]>>;
  createFact(input: CreateFactInput): Promise<CommunityResult<TitleFact>>;
  voteFact(factId: Uuid, interesting: boolean): Promise<CommunityResult<TitleFact>>;

  // Parents guide
  listParentsGuide(titleId: Uuid): Promise<CommunityResult<ParentsGuideEntry[]>>;
  getSeverityTallies(titleId: Uuid): Promise<CommunityResult<SeverityTally[]>>;
  setSeverityVote(
    titleId: Uuid,
    category: ParentsGuideCategory,
    userId: Uuid,
    severity: Severity,
  ): Promise<CommunityResult<SeverityTally>>;

  // FAQ
  listFaq(titleId: Uuid): Promise<CommunityResult<FaqEntry[]>>;

  // News
  listNews(
    entity: { entityType: "title" | "person"; entityId: Uuid } | null,
    params: { limit: number; offset: number },
  ): Promise<CommunityResult<NewsArticle[]>>;

  // Contributions
  submitContribution(input: SubmitContributionInput): Promise<CommunityResult<Contribution>>;
  listMyContributions(
    userId: Uuid,
    params: { limit: number; offset: number },
  ): Promise<CommunityResult<Contribution[]>>;
  withdrawContribution(contributionId: Uuid, userId: Uuid): Promise<CommunityResult<Contribution>>;
  listModerationQueue(params: { limit: number; offset: number }): Promise<CommunityResult<Contribution[]>>;
  decideContribution(
    contributionId: Uuid,
    moderatorUserId: Uuid,
    state: "approved" | "rejected",
    note: string | null,
  ): Promise<CommunityResult<Contribution>>;
  getContributorStats(userId: Uuid): Promise<CommunityResult<ContributorStats>>;
}
