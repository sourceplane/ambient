export type { SqlExecutor, SqlExecutorResult, SqlRow } from "../hyperdrive/executor.js";
import type { Uuid } from "../ids/index.js";

// ── Result envelope ────────────────────────────────────────────────────

export type CatalogRepositoryError =
  | { kind: "not_found" }
  | { kind: "conflict"; entity: string }
  | { kind: "internal"; message: string };

export type CatalogResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: CatalogRepositoryError };

export interface CursorPosition {
  createdAt: string;
  id: string;
}

export interface PageQueryParams {
  limit: number;
  cursor: CursorPosition | null;
}

export interface PagedResult<T> {
  items: T[];
  nextCursor: CursorPosition | null;
}

// ── Vocabularies ───────────────────────────────────────────────────────

export const TITLE_KINDS = [
  "movie",
  "tv_series",
  "tv_mini_series",
  "tv_episode",
  "tv_special",
  "tv_movie",
  "short",
  "tv_short",
  "video",
  "video_game",
  "podcast_series",
  "podcast_episode",
] as const;
export type TitleKind = (typeof TITLE_KINDS)[number];

export const PRODUCTION_STATUSES = [
  "released",
  "post_production",
  "filming",
  "pre_production",
  "announced",
  "cancelled",
] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];

export const RECORD_STATUSES = ["published", "draft", "archived"] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export const CREDIT_DEPARTMENTS = [
  "cast",
  "directing",
  "writing",
  "production",
  "camera",
  "editing",
  "sound",
  "music",
  "art",
  "costume_makeup",
  "visual_effects",
  "stunts",
  "casting",
  "animation",
  "additional_crew",
  "thanks",
] as const;
export type CreditDepartment = (typeof CREDIT_DEPARTMENTS)[number];

export type CreditCategory = "cast" | "crew";

export const RELEASE_KINDS = [
  "premiere",
  "limited",
  "wide",
  "digital",
  "physical",
  "tv",
  "festival",
] as const;
export type ReleaseKind = (typeof RELEASE_KINDS)[number];

export const TECHNICAL_SPECS = [
  "runtime",
  "sound_mix",
  "color",
  "aspect_ratio",
  "camera",
  "negative_format",
  "printed_format",
  "laboratory",
  "film_length",
] as const;
export type TechnicalSpec = (typeof TECHNICAL_SPECS)[number];

export const CONNECTION_KINDS = [
  "follows",
  "followed_by",
  "remake_of",
  "remade_as",
  "spin_off_from",
  "spin_off",
  "references",
  "referenced_in",
  "features",
  "featured_in",
  "spoofs",
  "spoofed_in",
  "version_of",
  "alternate_language_version_of",
  "edited_from",
  "edited_into",
] as const;
export type ConnectionKind = (typeof CONNECTION_KINDS)[number];

export const COMPANY_KINDS = [
  "production",
  "distributor",
  "special_effects",
  "miscellaneous",
  "studio",
  "network",
] as const;
export type CompanyKind = (typeof COMPANY_KINDS)[number];

export const COMPANY_ROLES = [
  "production",
  "distribution",
  "special_effects",
  "miscellaneous",
  "network",
] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];

export const IMAGE_KINDS = [
  "poster",
  "still",
  "backdrop",
  "event",
  "headshot",
  "behind_the_scenes",
  "production_art",
  "logo",
] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];

export const VIDEO_KINDS = [
  "trailer",
  "teaser",
  "clip",
  "featurette",
  "behind_the_scenes",
  "interview",
  "promo",
  "opening_credits",
] as const;
export type VideoKind = (typeof VIDEO_KINDS)[number];

/**
 * Inverse of every connection kind. `title_connections` rows are directed;
 * the repository writes both edges so a "sequel of X" written on Y is
 * readable from X as "followed by Y" without a UNION at read time.
 */
export const CONNECTION_INVERSE: Record<ConnectionKind, ConnectionKind> = {
  follows: "followed_by",
  followed_by: "follows",
  remake_of: "remade_as",
  remade_as: "remake_of",
  spin_off_from: "spin_off",
  spin_off: "spin_off_from",
  references: "referenced_in",
  referenced_in: "references",
  features: "featured_in",
  featured_in: "features",
  spoofs: "spoofed_in",
  spoofed_in: "spoofs",
  version_of: "version_of",
  alternate_language_version_of: "alternate_language_version_of",
  edited_from: "edited_into",
  edited_into: "edited_from",
};

// ── Domain records ─────────────────────────────────────────────────────

export interface Title {
  id: string;
  kind: TitleKind;
  primaryTitle: string;
  originalTitle: string | null;
  sortTitle: string;
  startYear: number | null;
  endYear: number | null;
  runtimeMinutes: number | null;
  isAdult: boolean;
  productionStatus: ProductionStatus;
  plotOutline: string | null;
  plotSummary: string | null;
  synopsis: string | null;
  tagline: string | null;
  status: RecordStatus;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export interface TitleAka {
  id: string;
  titleId: string;
  ordering: number;
  title: string;
  region: string | null;
  language: string | null;
  types: string[];
  attributes: string[];
  isOriginalTitle: boolean;
}

export interface Genre {
  id: string;
  slug: string;
  name: string;
}

export interface TitleGenre extends Genre {
  ordering: number;
}

export interface TitleReleaseDate {
  id: string;
  titleId: string;
  country: string;
  releasedOn: string;
  kind: ReleaseKind;
  note: string | null;
}

export interface TitleCertificate {
  id: string;
  titleId: string;
  country: string;
  rating: string;
  attributes: string[];
}

export interface TitleLocation {
  id: string;
  titleId: string;
  location: string;
  note: string | null;
  ordering: number;
}

export interface TitleBoxOffice {
  titleId: string;
  budgetCents: number | null;
  openingWeekendCents: number | null;
  openingWeekendCountry: string | null;
  openingWeekendOn: string | null;
  grossDomesticCents: number | null;
  grossWorldwideCents: number | null;
  currency: string;
}

export interface TitleTechnicalSpec {
  id: string;
  titleId: string;
  spec: TechnicalSpec;
  value: string;
  note: string | null;
  ordering: number;
}

export interface TitleExternalId {
  id: string;
  titleId: string;
  provider: string;
  value: string;
  label: string | null;
}

export interface TitleConnection {
  id: string;
  fromTitleId: string;
  toTitleId: string;
  kind: ConnectionKind;
  note: string | null;
  /** The connected title, joined for display. */
  title: Title | null;
}

export interface Person {
  id: string;
  name: string;
  sortName: string;
  birthDate: string | null;
  birthPlace: string | null;
  deathDate: string | null;
  deathPlace: string | null;
  deathCause: string | null;
  heightCm: number | null;
  miniBio: string | null;
  bioAuthor: string | null;
  status: RecordStatus;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export interface Credit {
  id: string;
  titleId: string;
  personId: string;
  category: CreditCategory;
  department: CreditDepartment;
  job: string;
  billingOrder: number | null;
  episodeCount: number | null;
  isUncredited: boolean;
  isVoice: boolean;
  isArchiveFootage: boolean;
  isSelf: boolean;
  note: string | null;
  characters: string[];
}

/** A credit joined with the person — what a title's cast list renders. */
export interface TitleCredit extends Credit {
  person: Person;
}

/** A credit joined with the title — what a filmography renders. */
export interface PersonCredit extends Credit {
  title: Title;
}

export interface KnownForEntry {
  personId: string;
  titleId: string;
  ordering: number;
  score: number;
  title: Title | null;
}

export interface Season {
  id: string;
  seriesTitleId: string;
  seasonNumber: number;
  name: string | null;
  overview: string | null;
  airDate: string | null;
  episodeCount: number;
}

export interface Episode {
  episodeTitleId: string;
  seriesTitleId: string;
  seasonNumber: number;
  episodeNumber: number;
  airedOn: string | null;
  title: Title | null;
}

export interface Company {
  id: string;
  name: string;
  sortName: string;
  country: string | null;
  foundedYear: number | null;
  kind: CompanyKind;
  status: RecordStatus;
}

export interface TitleCompany {
  id: string;
  titleId: string;
  companyId: string;
  role: CompanyRole;
  note: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  ordering: number;
  company: Company | null;
}

export interface Keyword {
  id: string;
  slug: string;
  name: string;
  titleCount: number;
}

export interface TitleKeyword extends Keyword {
  relevantVotes: number;
  totalVotes: number;
  ordering: number;
}

export interface Image {
  id: string;
  url: string;
  width: number;
  height: number;
  kind: ImageKind;
  caption: string | null;
  credit: string | null;
  language: string | null;
  blurhash: string | null;
  ordering: number;
  isPrimary: boolean;
}

export interface Video {
  id: string;
  titleId: string | null;
  personId: string | null;
  kind: VideoKind;
  name: string;
  url: string;
  thumbnailUrl: string | null;
  runtimeSeconds: number | null;
  language: string | null;
  publishedAt: Date | null;
  ordering: number;
}

// ── Write inputs ───────────────────────────────────────────────────────

export interface CreateTitleInput {
  id: Uuid;
  kind: TitleKind;
  primaryTitle: string;
  originalTitle?: string | null;
  sortTitle: string;
  startYear?: number | null;
  endYear?: number | null;
  runtimeMinutes?: number | null;
  isAdult?: boolean;
  productionStatus?: ProductionStatus;
  plotOutline?: string | null;
  plotSummary?: string | null;
  synopsis?: string | null;
  tagline?: string | null;
  status?: RecordStatus;
  createdAt: Date;
}

export interface UpdateTitleInput {
  primaryTitle?: string;
  originalTitle?: string | null;
  sortTitle?: string;
  startYear?: number | null;
  endYear?: number | null;
  runtimeMinutes?: number | null;
  isAdult?: boolean;
  productionStatus?: ProductionStatus;
  plotOutline?: string | null;
  plotSummary?: string | null;
  synopsis?: string | null;
  tagline?: string | null;
  status?: RecordStatus;
}

export interface CreatePersonInput {
  id: Uuid;
  name: string;
  sortName: string;
  birthDate?: string | null;
  birthPlace?: string | null;
  deathDate?: string | null;
  deathPlace?: string | null;
  deathCause?: string | null;
  heightCm?: number | null;
  miniBio?: string | null;
  bioAuthor?: string | null;
  status?: RecordStatus;
  professions?: string[];
  createdAt: Date;
}

export interface UpdatePersonInput {
  name?: string;
  sortName?: string;
  birthDate?: string | null;
  birthPlace?: string | null;
  deathDate?: string | null;
  deathPlace?: string | null;
  deathCause?: string | null;
  heightCm?: number | null;
  miniBio?: string | null;
  bioAuthor?: string | null;
  status?: RecordStatus;
}

export interface CreateCreditInput {
  id: Uuid;
  titleId: Uuid;
  personId: Uuid;
  category: CreditCategory;
  department: CreditDepartment;
  job: string;
  billingOrder?: number | null;
  episodeCount?: number | null;
  isUncredited?: boolean;
  isVoice?: boolean;
  isArchiveFootage?: boolean;
  isSelf?: boolean;
  note?: string | null;
  characters?: string[];
  createdAt: Date;
}

export interface UpsertEpisodeInput {
  episodeTitleId: Uuid;
  seriesTitleId: Uuid;
  seasonNumber: number;
  episodeNumber: number;
  airedOn?: string | null;
}

export interface CreateImageInput {
  id: Uuid;
  url: string;
  width: number;
  height: number;
  kind: ImageKind;
  caption?: string | null;
  credit?: string | null;
  language?: string | null;
  blurhash?: string | null;
  createdAt: Date;
}

export interface AttachImageInput {
  imageId: Uuid;
  ordering?: number;
  isPrimary?: boolean;
}

export interface CreateVideoInput {
  id: Uuid;
  titleId?: Uuid | null;
  personId?: Uuid | null;
  kind: VideoKind;
  name: string;
  url: string;
  thumbnailUrl?: string | null;
  runtimeSeconds?: number | null;
  language?: string | null;
  publishedAt?: Date | null;
  ordering?: number;
  createdAt: Date;
}

export interface CreateCompanyInput {
  id: Uuid;
  name: string;
  sortName: string;
  country?: string | null;
  foundedYear?: number | null;
  kind?: CompanyKind;
  createdAt: Date;
}

// ── Query shapes ───────────────────────────────────────────────────────

export interface TitleListFilters {
  kinds?: TitleKind[];
  genreSlugs?: string[];
  yearFrom?: number | null;
  yearTo?: number | null;
  includeAdult?: boolean;
  /** Defaults to `["published"]` — public reads never see drafts. */
  statuses?: RecordStatus[];
}

export interface CreditListFilters {
  category?: CreditCategory;
  department?: CreditDepartment;
  limit: number;
  offset?: number;
}

// ── Repository ─────────────────────────────────────────────────────────

export interface CatalogRepository {
  // Titles
  createTitle(input: CreateTitleInput): Promise<CatalogResult<Title>>;
  getTitleById(titleId: Uuid): Promise<CatalogResult<Title>>;
  updateTitle(titleId: Uuid, input: UpdateTitleInput, updatedAt: Date): Promise<CatalogResult<Title>>;
  archiveTitle(titleId: Uuid, archivedAt: Date): Promise<CatalogResult<Title>>;
  listTitlesPaged(
    filters: TitleListFilters,
    params: PageQueryParams,
  ): Promise<CatalogResult<PagedResult<Title>>>;
  getTitlesByIds(titleIds: string[]): Promise<CatalogResult<Title[]>>;

  // Title satellites
  listAkas(titleId: Uuid): Promise<CatalogResult<TitleAka[]>>;
  replaceAkas(titleId: Uuid, akas: Omit<TitleAka, "id" | "titleId">[]): Promise<CatalogResult<TitleAka[]>>;
  listGenres(titleId: Uuid): Promise<CatalogResult<TitleGenre[]>>;
  /** Genres for many titles at once — one query per rail, not per poster. */
  getGenresByTitleIds(titleIds: string[]): Promise<CatalogResult<Map<string, TitleGenre[]>>>;
  setGenres(titleId: Uuid, genreSlugs: string[]): Promise<CatalogResult<TitleGenre[]>>;
  listAllGenres(): Promise<CatalogResult<Genre[]>>;
  listReleaseDates(titleId: Uuid): Promise<CatalogResult<TitleReleaseDate[]>>;
  listCertificates(titleId: Uuid): Promise<CatalogResult<TitleCertificate[]>>;
  listCountries(titleId: Uuid): Promise<CatalogResult<string[]>>;
  listLanguages(titleId: Uuid): Promise<CatalogResult<string[]>>;
  listLocations(titleId: Uuid): Promise<CatalogResult<TitleLocation[]>>;
  getBoxOffice(titleId: Uuid): Promise<CatalogResult<TitleBoxOffice | null>>;
  listTechnicalSpecs(titleId: Uuid): Promise<CatalogResult<TitleTechnicalSpec[]>>;
  listExternalIds(titleId: Uuid): Promise<CatalogResult<TitleExternalId[]>>;
  listConnections(titleId: Uuid): Promise<CatalogResult<TitleConnection[]>>;
  linkConnection(
    id: Uuid,
    inverseId: Uuid,
    fromTitleId: Uuid,
    toTitleId: Uuid,
    kind: ConnectionKind,
    note: string | null,
  ): Promise<CatalogResult<void>>;

  // People
  createPerson(input: CreatePersonInput): Promise<CatalogResult<Person>>;
  getPersonById(personId: Uuid): Promise<CatalogResult<Person>>;
  updatePerson(personId: Uuid, input: UpdatePersonInput, updatedAt: Date): Promise<CatalogResult<Person>>;
  archivePerson(personId: Uuid, archivedAt: Date): Promise<CatalogResult<Person>>;
  listPeoplePaged(params: PageQueryParams): Promise<CatalogResult<PagedResult<Person>>>;
  listProfessions(personId: Uuid): Promise<CatalogResult<string[]>>;
  listKnownFor(personId: Uuid, limit: number): Promise<CatalogResult<KnownForEntry[]>>;

  // Credits
  createCredit(input: CreateCreditInput): Promise<CatalogResult<Credit>>;
  deleteCredit(creditId: Uuid): Promise<CatalogResult<void>>;
  listTitleCredits(titleId: Uuid, filters: CreditListFilters): Promise<CatalogResult<TitleCredit[]>>;
  listPersonCredits(personId: Uuid, filters: CreditListFilters): Promise<CatalogResult<PersonCredit[]>>;

  // Series structure
  listSeasons(seriesTitleId: Uuid): Promise<CatalogResult<Season[]>>;
  listEpisodes(
    seriesTitleId: Uuid,
    seasonNumber: number | null,
    params: { limit: number; offset?: number },
  ): Promise<CatalogResult<Episode[]>>;
  getEpisode(episodeTitleId: Uuid): Promise<CatalogResult<Episode>>;
  upsertEpisode(input: UpsertEpisodeInput): Promise<CatalogResult<Episode>>;

  // Companies and keywords
  createCompany(input: CreateCompanyInput): Promise<CatalogResult<Company>>;
  getCompanyById(companyId: Uuid): Promise<CatalogResult<Company>>;
  listTitleCompanies(titleId: Uuid): Promise<CatalogResult<TitleCompany[]>>;
  listCompanyTitlesPaged(companyId: Uuid, params: PageQueryParams): Promise<CatalogResult<PagedResult<Title>>>;
  listTitleKeywords(titleId: Uuid): Promise<CatalogResult<TitleKeyword[]>>;
  getKeywordBySlug(slug: string): Promise<CatalogResult<Keyword>>;
  listKeywordTitlesPaged(keywordId: string, params: PageQueryParams): Promise<CatalogResult<PagedResult<Title>>>;
  addTitleKeyword(titleId: Uuid, slug: string, name: string, keywordId: Uuid): Promise<CatalogResult<TitleKeyword>>;

  // Media
  createImage(input: CreateImageInput): Promise<CatalogResult<Image>>;
  attachTitleImage(titleId: Uuid, input: AttachImageInput): Promise<CatalogResult<void>>;
  attachPersonImage(personId: Uuid, input: AttachImageInput): Promise<CatalogResult<void>>;
  listTitleImages(titleId: Uuid, kind: ImageKind | null, limit: number): Promise<CatalogResult<Image[]>>;
  listPersonImages(personId: Uuid, limit: number): Promise<CatalogResult<Image[]>>;
  getPrimaryImages(titleIds: string[]): Promise<CatalogResult<Map<string, Image>>>;
  getPrimaryPersonImages(personIds: string[]): Promise<CatalogResult<Map<string, Image>>>;
  createVideo(input: CreateVideoInput): Promise<CatalogResult<Video>>;
  listTitleVideos(titleId: Uuid, limit: number): Promise<CatalogResult<Video[]>>;
  listPersonVideos(personId: Uuid, limit: number): Promise<CatalogResult<Video[]>>;
  deleteImage(imageId: Uuid): Promise<CatalogResult<void>>;
  deleteVideo(videoId: Uuid): Promise<CatalogResult<void>>;
}
