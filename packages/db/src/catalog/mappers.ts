import type {
  CatalogResult,
  Company,
  Credit,
  CursorPosition,
  Episode,
  Genre,
  Image,
  Keyword,
  KnownForEntry,
  PagedResult,
  Person,
  Season,
  Title,
  TitleAka,
  TitleBoxOffice,
  TitleCertificate,
  TitleCompany,
  TitleConnection,
  TitleExternalId,
  TitleGenre,
  TitleKeyword,
  TitleLocation,
  TitleReleaseDate,
  TitleTechnicalSpec,
  Video,
} from "./types.js";

type Row = Record<string, unknown>;

// ── Column coercion ────────────────────────────────────────────────────
// Hyperdrive/postgres.js returns numerics as strings when `fetch_types` is
// off, and BIGINT always as a string. Coerce at the boundary so no domain
// consumer ever sees `"7"` where it expects `7`.

function str(value: unknown): string {
  return value as string;
}

function nstr(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function nnum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function bool(value: unknown): boolean {
  return value === true || value === "t" || value === "true";
}

function date(value: unknown): Date {
  return new Date(value as string);
}

function ndate(value: unknown): Date | null {
  return value ? new Date(value as string) : null;
}

/** DATE columns stay ISO strings (`2001-12-19`) — no timezone to lose. */
function dateOnly(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function textArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  return [];
}

export { num, nnum, bool, dateOnly, textArray };

// ── Row mappers ────────────────────────────────────────────────────────

export function mapTitle(row: Row): Title {
  return {
    id: str(row.id),
    kind: row.kind as Title["kind"],
    primaryTitle: str(row.primary_title),
    originalTitle: nstr(row.original_title),
    sortTitle: str(row.sort_title),
    startYear: nnum(row.start_year),
    endYear: nnum(row.end_year),
    runtimeMinutes: nnum(row.runtime_minutes),
    isAdult: bool(row.is_adult),
    productionStatus: row.production_status as Title["productionStatus"],
    plotOutline: nstr(row.plot_outline),
    plotSummary: nstr(row.plot_summary),
    synopsis: nstr(row.synopsis),
    tagline: nstr(row.tagline),
    status: row.status as Title["status"],
    createdAt: date(row.created_at),
    updatedAt: date(row.updated_at),
    archivedAt: ndate(row.archived_at),
  };
}

export function mapAka(row: Row): TitleAka {
  return {
    id: str(row.id),
    titleId: str(row.title_id),
    ordering: num(row.ordering),
    title: str(row.title),
    region: nstr(row.region),
    language: nstr(row.language),
    types: textArray(row.types),
    attributes: textArray(row.attributes),
    isOriginalTitle: bool(row.is_original_title),
  };
}

export function mapGenre(row: Row): Genre {
  return { id: str(row.id), slug: str(row.slug), name: str(row.name) };
}

export function mapTitleGenre(row: Row): TitleGenre {
  return { ...mapGenre(row), ordering: num(row.ordering) };
}

export function mapReleaseDate(row: Row): TitleReleaseDate {
  return {
    id: str(row.id),
    titleId: str(row.title_id),
    country: str(row.country),
    releasedOn: dateOnly(row.released_on) ?? "",
    kind: row.kind as TitleReleaseDate["kind"],
    note: nstr(row.note),
  };
}

export function mapCertificate(row: Row): TitleCertificate {
  return {
    id: str(row.id),
    titleId: str(row.title_id),
    country: str(row.country),
    rating: str(row.rating),
    attributes: textArray(row.attributes),
  };
}

export function mapLocation(row: Row): TitleLocation {
  return {
    id: str(row.id),
    titleId: str(row.title_id),
    location: str(row.location),
    note: nstr(row.note),
    ordering: num(row.ordering),
  };
}

export function mapBoxOffice(row: Row): TitleBoxOffice {
  return {
    titleId: str(row.title_id),
    budgetCents: nnum(row.budget_cents),
    openingWeekendCents: nnum(row.opening_weekend_cents),
    openingWeekendCountry: nstr(row.opening_weekend_country),
    openingWeekendOn: dateOnly(row.opening_weekend_on),
    grossDomesticCents: nnum(row.gross_domestic_cents),
    grossWorldwideCents: nnum(row.gross_worldwide_cents),
    currency: str(row.currency),
  };
}

export function mapTechnicalSpec(row: Row): TitleTechnicalSpec {
  return {
    id: str(row.id),
    titleId: str(row.title_id),
    spec: row.spec as TitleTechnicalSpec["spec"],
    value: str(row.value),
    note: nstr(row.note),
    ordering: num(row.ordering),
  };
}

export function mapExternalId(row: Row): TitleExternalId {
  return {
    id: str(row.id),
    titleId: str(row.title_id),
    provider: str(row.provider),
    value: str(row.value),
    label: nstr(row.label),
  };
}

export function mapConnection(row: Row): TitleConnection {
  return {
    id: str(row.id),
    fromTitleId: str(row.from_title_id),
    toTitleId: str(row.to_title_id),
    kind: row.kind as TitleConnection["kind"],
    note: nstr(row.note),
    title: row.c_id ? mapTitle(prefixed(row, "c_")) : null,
  };
}

export function mapPerson(row: Row): Person {
  return {
    id: str(row.id),
    name: str(row.name),
    sortName: str(row.sort_name),
    birthDate: dateOnly(row.birth_date),
    birthPlace: nstr(row.birth_place),
    deathDate: dateOnly(row.death_date),
    deathPlace: nstr(row.death_place),
    deathCause: nstr(row.death_cause),
    heightCm: nnum(row.height_cm),
    miniBio: nstr(row.mini_bio),
    bioAuthor: nstr(row.bio_author),
    status: row.status as Person["status"],
    createdAt: date(row.created_at),
    updatedAt: date(row.updated_at),
    archivedAt: ndate(row.archived_at),
  };
}

export function mapCredit(row: Row): Credit {
  return {
    id: str(row.id),
    titleId: str(row.title_id),
    personId: str(row.person_id),
    category: row.category as Credit["category"],
    department: row.department as Credit["department"],
    job: str(row.job),
    billingOrder: nnum(row.billing_order),
    episodeCount: nnum(row.episode_count),
    isUncredited: bool(row.is_uncredited),
    isVoice: bool(row.is_voice),
    isArchiveFootage: bool(row.is_archive_footage),
    isSelf: bool(row.is_self),
    note: nstr(row.note),
    characters: textArray(row.characters),
  };
}

export function mapSeason(row: Row): Season {
  return {
    id: str(row.id),
    seriesTitleId: str(row.series_title_id),
    seasonNumber: num(row.season_number),
    name: nstr(row.name),
    overview: nstr(row.overview),
    airDate: dateOnly(row.air_date),
    episodeCount: nnum(row.episode_count) ?? 0,
  };
}

export function mapEpisode(row: Row): Episode {
  return {
    episodeTitleId: str(row.episode_title_id),
    seriesTitleId: str(row.series_title_id),
    seasonNumber: num(row.season_number),
    episodeNumber: num(row.episode_number),
    airedOn: dateOnly(row.aired_on),
    title: row.t_id ? mapTitle(prefixed(row, "t_")) : null,
  };
}

export function mapCompany(row: Row): Company {
  return {
    id: str(row.id),
    name: str(row.name),
    sortName: str(row.sort_name),
    country: nstr(row.country),
    foundedYear: nnum(row.founded_year),
    kind: row.kind as Company["kind"],
    status: row.status as Company["status"],
  };
}

export function mapTitleCompany(row: Row): TitleCompany {
  return {
    id: str(row.id),
    titleId: str(row.title_id),
    companyId: str(row.company_id),
    role: row.role as TitleCompany["role"],
    note: nstr(row.note),
    yearFrom: nnum(row.year_from),
    yearTo: nnum(row.year_to),
    ordering: num(row.ordering),
    company: row.co_id ? mapCompany(prefixed(row, "co_")) : null,
  };
}

export function mapKeyword(row: Row): Keyword {
  return {
    id: str(row.id),
    slug: str(row.slug),
    name: str(row.name),
    titleCount: nnum(row.title_count) ?? 0,
  };
}

export function mapTitleKeyword(row: Row): TitleKeyword {
  return {
    ...mapKeyword(row),
    relevantVotes: nnum(row.relevant_votes) ?? 0,
    totalVotes: nnum(row.total_votes) ?? 0,
    ordering: num(row.ordering),
  };
}

export function mapImage(row: Row): Image {
  return {
    id: str(row.id),
    url: str(row.url),
    width: num(row.width),
    height: num(row.height),
    kind: row.kind as Image["kind"],
    caption: nstr(row.caption),
    credit: nstr(row.credit),
    language: nstr(row.language),
    blurhash: nstr(row.blurhash),
    ordering: nnum(row.ordering) ?? 0,
    isPrimary: bool(row.is_primary),
  };
}

export function mapVideo(row: Row): Video {
  return {
    id: str(row.id),
    titleId: nstr(row.title_id),
    personId: nstr(row.person_id),
    kind: row.kind as Video["kind"],
    name: str(row.name),
    url: str(row.url),
    thumbnailUrl: nstr(row.thumbnail_url),
    runtimeSeconds: nnum(row.runtime_seconds),
    language: nstr(row.language),
    publishedAt: ndate(row.published_at),
    ordering: nnum(row.ordering) ?? 0,
  };
}

export function mapKnownFor(row: Row): KnownForEntry {
  return {
    personId: str(row.person_id),
    titleId: str(row.title_id),
    ordering: num(row.ordering),
    score: num(row.score),
    title: row.t_id ? mapTitle(prefixed(row, "t_")) : null,
  };
}

/**
 * Lift an aliased join (`SELECT t.id AS t_id, …`) back into a bare row so the
 * plain mapper can consume it. Avoids a second mapper per join shape.
 */
export function prefixed(row: Row, prefix: string): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith(prefix)) out[key.slice(prefix.length)] = value;
  }
  return out;
}

// ── Shared helpers ─────────────────────────────────────────────────────

export function internalError(message: string): CatalogResult<never> {
  return { ok: false, error: { kind: "internal", message } };
}

export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

export function isForeignKeyViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23503"
  );
}

/**
 * Slice one extra row off a keyset page to decide whether a next cursor
 * exists, without a second COUNT query.
 */
export function toPage<T extends { createdAt: Date; id: string }>(
  rows: T[],
  limit: number,
): PagedResult<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor: CursorPosition | null =
    hasMore && last ? { createdAt: last.createdAt.toISOString(), id: last.id } : null;
  return { items, nextCursor };
}
