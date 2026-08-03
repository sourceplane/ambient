// Catalog contracts — the public shape of titles, people, credits, media and
// their satellites. These are what `api-edge` returns and what the SDK and the
// web app consume; internal UUIDs never appear here, only public ids
// (`tt_…`, `nm_…`, `co_…`, `rm_…`, `vi_…`).

export type TitleKind =
  | "movie"
  | "tv_series"
  | "tv_mini_series"
  | "tv_episode"
  | "tv_special"
  | "tv_movie"
  | "short"
  | "tv_short"
  | "video"
  | "video_game"
  | "podcast_series"
  | "podcast_episode";

export type ProductionStatus =
  | "released"
  | "post_production"
  | "filming"
  | "pre_production"
  | "announced"
  | "cancelled";

export type CreditCategory = "cast" | "crew";

export type CreditDepartment =
  | "cast"
  | "directing"
  | "writing"
  | "production"
  | "camera"
  | "editing"
  | "sound"
  | "music"
  | "art"
  | "costume_makeup"
  | "visual_effects"
  | "stunts"
  | "casting"
  | "animation"
  | "additional_crew"
  | "thanks";

export type ReleaseKind =
  | "premiere"
  | "limited"
  | "wide"
  | "digital"
  | "physical"
  | "tv"
  | "festival";

export type TechnicalSpecKind =
  | "runtime"
  | "sound_mix"
  | "color"
  | "aspect_ratio"
  | "camera"
  | "negative_format"
  | "printed_format"
  | "laboratory"
  | "film_length";

export type ConnectionKind =
  | "follows"
  | "followed_by"
  | "remake_of"
  | "remade_as"
  | "spin_off_from"
  | "spin_off"
  | "references"
  | "referenced_in"
  | "features"
  | "featured_in"
  | "spoofs"
  | "spoofed_in"
  | "version_of"
  | "alternate_language_version_of"
  | "edited_from"
  | "edited_into";

export type CompanyKind =
  | "production"
  | "distributor"
  | "special_effects"
  | "miscellaneous"
  | "studio"
  | "network";

export type CompanyRole =
  | "production"
  | "distribution"
  | "special_effects"
  | "miscellaneous"
  | "network";

export type ImageKind =
  | "poster"
  | "still"
  | "backdrop"
  | "event"
  | "headshot"
  | "behind_the_scenes"
  | "production_art"
  | "logo";

export type VideoKind =
  | "trailer"
  | "teaser"
  | "clip"
  | "featurette"
  | "behind_the_scenes"
  | "interview"
  | "promo"
  | "opening_credits";

// ── Media ──────────────────────────────────────────────────────────────

export interface PublicImage {
  id: string;
  url: string;
  width: number;
  height: number;
  kind: ImageKind;
  caption: string | null;
  credit: string | null;
  language: string | null;
  blurhash: string | null;
  isPrimary: boolean;
}

export interface PublicVideo {
  id: string;
  titleId: string | null;
  nameId: string | null;
  kind: VideoKind;
  name: string;
  url: string;
  thumbnailUrl: string | null;
  runtimeSeconds: number | null;
  language: string | null;
  publishedAt: string | null;
}

// ── Titles ─────────────────────────────────────────────────────────────

export interface PublicGenre {
  slug: string;
  name: string;
}

/** The compact shape used by rails, grids, search results and lists. */
export interface PublicTitleSummary {
  id: string;
  kind: TitleKind;
  primaryTitle: string;
  originalTitle: string | null;
  startYear: number | null;
  endYear: number | null;
  runtimeMinutes: number | null;
  isAdult: boolean;
  genres: PublicGenre[];
  primaryImage: PublicImage | null;
}

export interface PublicTitle extends PublicTitleSummary {
  sortTitle: string;
  productionStatus: ProductionStatus;
  plotOutline: string | null;
  plotSummary: string | null;
  synopsis: string | null;
  tagline: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicTitleAka {
  ordering: number;
  title: string;
  region: string | null;
  language: string | null;
  types: string[];
  attributes: string[];
  isOriginalTitle: boolean;
}

export interface PublicReleaseDate {
  country: string;
  releasedOn: string;
  kind: ReleaseKind;
  note: string | null;
}

export interface PublicCertificate {
  country: string;
  rating: string;
  attributes: string[];
}

export interface PublicFilmingLocation {
  location: string;
  note: string | null;
}

export interface PublicBoxOffice {
  budgetCents: number | null;
  openingWeekendCents: number | null;
  openingWeekendCountry: string | null;
  openingWeekendOn: string | null;
  grossDomesticCents: number | null;
  grossWorldwideCents: number | null;
  currency: string;
}

export interface PublicTechnicalSpec {
  spec: TechnicalSpecKind;
  value: string;
  note: string | null;
}

export interface PublicExternalId {
  provider: string;
  value: string;
  label: string | null;
}

export interface PublicTitleConnection {
  kind: ConnectionKind;
  note: string | null;
  title: PublicTitleSummary;
}

export interface PublicKeyword {
  slug: string;
  name: string;
  relevantVotes: number;
  totalVotes: number;
}

export interface PublicCompany {
  id: string;
  name: string;
  country: string | null;
  foundedYear: number | null;
  kind: CompanyKind;
}

export interface PublicTitleCompany {
  role: CompanyRole;
  note: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  company: PublicCompany;
}

// ── People and credits ─────────────────────────────────────────────────

export interface PublicNameSummary {
  id: string;
  name: string;
  primaryImage: PublicImage | null;
  professions: string[];
}

export interface PublicName extends PublicNameSummary {
  birthDate: string | null;
  birthPlace: string | null;
  deathDate: string | null;
  deathPlace: string | null;
  deathCause: string | null;
  heightCm: number | null;
  miniBio: string | null;
  bioAuthor: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicCreditBase {
  id: string;
  category: CreditCategory;
  department: CreditDepartment;
  job: string;
  characters: string[];
  billingOrder: number | null;
  episodeCount: number | null;
  isUncredited: boolean;
  isVoice: boolean;
  isArchiveFootage: boolean;
  isSelf: boolean;
  note: string | null;
}

/** A credit as rendered on a title page — the person is the payload. */
export interface PublicTitleCredit extends PublicCreditBase {
  name: PublicNameSummary;
}

/** A credit as rendered on a name page — the title is the payload. */
export interface PublicNameCredit extends PublicCreditBase {
  title: PublicTitleSummary;
}

export interface PublicKnownFor {
  title: PublicTitleSummary;
  score: number;
}

// ── Series structure ───────────────────────────────────────────────────

export interface PublicSeason {
  seasonNumber: number;
  name: string | null;
  overview: string | null;
  airDate: string | null;
  episodeCount: number;
}

export interface PublicEpisode {
  seriesId: string;
  seasonNumber: number;
  episodeNumber: number;
  airedOn: string | null;
  title: PublicTitleSummary;
}

// ── Requests ───────────────────────────────────────────────────────────

export interface CreateTitleRequest {
  kind: TitleKind;
  primaryTitle: string;
  originalTitle?: string | null;
  startYear?: number | null;
  endYear?: number | null;
  runtimeMinutes?: number | null;
  isAdult?: boolean;
  productionStatus?: ProductionStatus;
  plotOutline?: string | null;
  plotSummary?: string | null;
  synopsis?: string | null;
  tagline?: string | null;
  genres?: string[];
}

export type UpdateTitleRequest = Partial<Omit<CreateTitleRequest, "kind">>;

export interface CreateNameRequest {
  name: string;
  birthDate?: string | null;
  birthPlace?: string | null;
  deathDate?: string | null;
  deathPlace?: string | null;
  deathCause?: string | null;
  heightCm?: number | null;
  miniBio?: string | null;
  bioAuthor?: string | null;
  professions?: string[];
}

export type UpdateNameRequest = Partial<CreateNameRequest>;

export interface CreateCreditRequest {
  nameId: string;
  category: CreditCategory;
  department: CreditDepartment;
  job: string;
  characters?: string[];
  billingOrder?: number | null;
  episodeCount?: number | null;
  isUncredited?: boolean;
  isVoice?: boolean;
  isArchiveFootage?: boolean;
  isSelf?: boolean;
  note?: string | null;
}

export interface CreateImageRequest {
  url: string;
  width: number;
  height: number;
  kind: ImageKind;
  caption?: string | null;
  credit?: string | null;
  language?: string | null;
  blurhash?: string | null;
  isPrimary?: boolean;
}

export interface CreateVideoRequest {
  kind: VideoKind;
  name: string;
  url: string;
  thumbnailUrl?: string | null;
  runtimeSeconds?: number | null;
  language?: string | null;
  publishedAt?: string | null;
}

export interface UpsertEpisodeRequest {
  episodeId: string;
  seasonNumber: number;
  episodeNumber: number;
  airedOn?: string | null;
}

// ── Responses ──────────────────────────────────────────────────────────

export interface GetTitleResponse {
  title: PublicTitle;
}

export interface ListTitlesResponse {
  titles: PublicTitleSummary[];
}

export interface ListTitleCreditsResponse {
  credits: PublicTitleCredit[];
}

export interface ListAkasResponse {
  akas: PublicTitleAka[];
}

export interface ListReleaseDatesResponse {
  releaseDates: PublicReleaseDate[];
}

export interface ListCertificatesResponse {
  certificates: PublicCertificate[];
}

export interface ListKeywordsResponse {
  keywords: PublicKeyword[];
}

export interface ListTitleCompaniesResponse {
  companies: PublicTitleCompany[];
}

export interface ListTechnicalSpecsResponse {
  technicalSpecs: PublicTechnicalSpec[];
  countries: string[];
  languages: string[];
  filmingLocations: PublicFilmingLocation[];
}

export interface GetBoxOfficeResponse {
  boxOffice: PublicBoxOffice | null;
}

export interface ListConnectionsResponse {
  connections: PublicTitleConnection[];
}

export interface ListExternalIdsResponse {
  externalIds: PublicExternalId[];
}

export interface ListImagesResponse {
  images: PublicImage[];
}

export interface ListVideosResponse {
  videos: PublicVideo[];
}

export interface ListSeasonsResponse {
  seasons: PublicSeason[];
}

export interface ListEpisodesResponse {
  episodes: PublicEpisode[];
}

export interface GetNameResponse {
  name: PublicName;
}

export interface ListNamesResponse {
  names: PublicNameSummary[];
}

export interface ListNameCreditsResponse {
  credits: PublicNameCredit[];
}

export interface ListKnownForResponse {
  knownFor: PublicKnownFor[];
}

export interface GetCompanyResponse {
  company: PublicCompany;
}

export interface GetKeywordResponse {
  keyword: { slug: string; name: string; titleCount: number };
}

export interface ListGenresResponse {
  genres: PublicGenre[];
}
