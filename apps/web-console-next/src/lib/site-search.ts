// Advanced-search state, expressed as URL parameters.
//
// The URL is the source of truth for a search, not React state. That is what
// makes a result set shareable, bookmarkable and survivable across a reload —
// and it is why the parsing and serialising live here as pure functions rather
// than inside a form component.

import type { NameSearchSort, TitleSearchSort } from "@saas/contracts/search";

export const TITLE_SORTS: Array<{ key: TitleSearchSort; label: string }> = [
  { key: "relevance", label: "Relevance" },
  { key: "popularity", label: "Popularity" },
  { key: "rating", label: "Rating" },
  { key: "votes", label: "Number of votes" },
  { key: "release_date", label: "Release date" },
  { key: "alphabetical", label: "Alphabetical" },
  { key: "runtime", label: "Runtime" },
];

export const NAME_SORTS: Array<{ key: NameSearchSort; label: string }> = [
  { key: "relevance", label: "Relevance" },
  { key: "popularity", label: "Popularity" },
  { key: "alphabetical", label: "Alphabetical" },
  { key: "birth_date", label: "Birth date" },
];

export const TITLE_KIND_OPTIONS = [
  { value: "movie", label: "Movie" },
  { value: "tv_series", label: "TV Series" },
  { value: "tv_mini_series", label: "TV Mini Series" },
  { value: "tv_movie", label: "TV Movie" },
  { value: "tv_episode", label: "Episode" },
  { value: "short", label: "Short" },
  { value: "video_game", label: "Video Game" },
  { value: "podcast_series", label: "Podcast" },
];

export const VIEW_MODES = ["detailed", "grid", "compact"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export function isViewMode(value: string | null): value is ViewMode {
  return value !== null && (VIEW_MODES as readonly string[]).includes(value);
}

export interface TitleSearchState {
  q: string;
  kind: string[];
  genre: string[];
  keyword: string[];
  yearFrom: string;
  yearTo: string;
  ratingFrom: string;
  ratingTo: string;
  votesMin: string;
  runtimeMin: string;
  runtimeMax: string;
  sort: string;
  order: string;
}

export const EMPTY_TITLE_SEARCH: TitleSearchState = {
  q: "",
  kind: [],
  genre: [],
  keyword: [],
  yearFrom: "",
  yearTo: "",
  ratingFrom: "",
  ratingTo: "",
  votesMin: "",
  runtimeMin: "",
  runtimeMax: "",
  sort: "popularity",
  order: "desc",
};

/** Read search state out of a query string. Unknown parameters are ignored. */
export function parseTitleSearch(params: URLSearchParams): TitleSearchState {
  return {
    q: params.get("q") ?? "",
    kind: multi(params, "kind"),
    genre: multi(params, "genre"),
    keyword: multi(params, "keyword"),
    yearFrom: params.get("yearFrom") ?? "",
    yearTo: params.get("yearTo") ?? "",
    ratingFrom: params.get("ratingFrom") ?? "",
    ratingTo: params.get("ratingTo") ?? "",
    votesMin: params.get("votesMin") ?? "",
    runtimeMin: params.get("runtimeMin") ?? "",
    runtimeMax: params.get("runtimeMax") ?? "",
    sort: params.get("sort") ?? EMPTY_TITLE_SEARCH.sort,
    order: params.get("order") ?? EMPTY_TITLE_SEARCH.order,
  };
}

function multi(params: URLSearchParams, key: string): string[] {
  return params
    .getAll(key)
    .flatMap((value) => value.split(","))
    .filter(Boolean);
}

/**
 * Serialise back to a query string, omitting anything left at its default.
 *
 * The omission is deliberate: a URL that carries every field at its default
 * value is unreadable and un-diffable, and it makes "did the user change
 * anything?" impossible to answer by looking.
 */
export function serializeTitleSearch(state: TitleSearchState): string {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.kind.length > 0) params.set("kind", state.kind.join(","));
  if (state.genre.length > 0) params.set("genre", state.genre.join(","));
  if (state.keyword.length > 0) params.set("keyword", state.keyword.join(","));
  for (const key of ["yearFrom", "yearTo", "ratingFrom", "ratingTo", "votesMin", "runtimeMin", "runtimeMax"] as const) {
    if (state[key]) params.set(key, state[key]);
  }
  if (state.sort !== EMPTY_TITLE_SEARCH.sort) params.set("sort", state.sort);
  if (state.order !== EMPTY_TITLE_SEARCH.order) params.set("order", state.order);
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

/** The request the search API takes, built from state that is all strings. */
export function titleSearchRequest(
  state: TitleSearchState,
  limit: number,
): Record<string, string | number | string[] | undefined> {
  return {
    q: state.q || undefined,
    kind: state.kind.length > 0 ? state.kind : undefined,
    genre: state.genre.length > 0 ? state.genre : undefined,
    keyword: state.keyword.length > 0 ? state.keyword : undefined,
    yearFrom: numeric(state.yearFrom),
    yearTo: numeric(state.yearTo),
    ratingFrom: numeric(state.ratingFrom),
    ratingTo: numeric(state.ratingTo),
    votesMin: numeric(state.votesMin),
    runtimeMin: numeric(state.runtimeMin),
    runtimeMax: numeric(state.runtimeMax),
    sort: state.sort,
    order: state.order,
    limit,
  };
}

/**
 * A field left blank is absent, not zero. `Number("")` is `0`, which would
 * silently turn an empty "minimum votes" box into a real filter.
 */
function numeric(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** How many filters are active — the badge on a collapsed filter panel. */
export function activeFilterCount(state: TitleSearchState): number {
  let count = 0;
  count += state.kind.length > 0 ? 1 : 0;
  count += state.genre.length > 0 ? 1 : 0;
  count += state.keyword.length > 0 ? 1 : 0;
  for (const key of ["yearFrom", "yearTo", "ratingFrom", "ratingTo", "votesMin", "runtimeMin", "runtimeMax"] as const) {
    if (state[key]) count += 1;
  }
  return count;
}

// ── Names ──────────────────────────────────────────────────────────────

export interface NameSearchState {
  q: string;
  profession: string[];
  bornFrom: string;
  bornTo: string;
  birthPlace: string;
  sort: string;
  order: string;
}

export const EMPTY_NAME_SEARCH: NameSearchState = {
  q: "",
  profession: [],
  bornFrom: "",
  bornTo: "",
  birthPlace: "",
  sort: "popularity",
  order: "desc",
};

export function parseNameSearch(params: URLSearchParams): NameSearchState {
  return {
    q: params.get("q") ?? "",
    profession: multi(params, "profession"),
    bornFrom: params.get("bornFrom") ?? "",
    bornTo: params.get("bornTo") ?? "",
    birthPlace: params.get("birthPlace") ?? "",
    sort: params.get("sort") ?? EMPTY_NAME_SEARCH.sort,
    order: params.get("order") ?? EMPTY_NAME_SEARCH.order,
  };
}

export function serializeNameSearch(state: NameSearchState): string {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.profession.length > 0) params.set("profession", state.profession.join(","));
  if (state.bornFrom) params.set("bornFrom", state.bornFrom);
  if (state.bornTo) params.set("bornTo", state.bornTo);
  if (state.birthPlace) params.set("birthPlace", state.birthPlace);
  if (state.sort !== EMPTY_NAME_SEARCH.sort) params.set("sort", state.sort);
  if (state.order !== EMPTY_NAME_SEARCH.order) params.set("order", state.order);
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function nameSearchRequest(
  state: NameSearchState,
  limit: number,
): Record<string, string | number | string[] | undefined> {
  return {
    q: state.q || undefined,
    profession: state.profession.length > 0 ? state.profession : undefined,
    bornFrom: numeric(state.bornFrom),
    bornTo: numeric(state.bornTo),
    birthPlace: state.birthPlace || undefined,
    sort: state.sort,
    order: state.order,
    limit,
  };
}

// ── Search hit facets ──────────────────────────────────────────────────

/**
 * A search hit carries loose facets. These readers keep the `unknown`-handling
 * in one place so no result row has to cast.
 */
export function facetNumber(facets: Record<string, unknown>, key: string): number | null {
  const value = facets[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function facetString(facets: Record<string, unknown>, key: string): string | null {
  const value = facets[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function facetStrings(facets: Record<string, unknown>, key: string): string[] {
  const value = facets[key];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}
