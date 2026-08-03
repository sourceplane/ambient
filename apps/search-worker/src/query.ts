import type { NameSearchQuery, SearchEntityType, TitleSearchQuery } from "@saas/db/search";
import { SEARCH_ENTITY_TYPES } from "@saas/db/search";

export const MAX_QUERY_LENGTH = 200;
export const MAX_LIMIT = 100;
export const MAX_OFFSET = 10_000;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; field: string; reason: string };

export function parseQueryText(url: URL, required: boolean): ParseResult<string> {
  const raw = url.searchParams.get("q") ?? "";
  const trimmed = raw.trim();
  if (required && trimmed.length === 0) {
    return { ok: false, field: "q", reason: "Required" };
  }
  if (trimmed.length > MAX_QUERY_LENGTH) {
    return { ok: false, field: "q", reason: `Must be at most ${MAX_QUERY_LENGTH} characters` };
  }
  return { ok: true, value: trimmed };
}

export function parseLimit(url: URL, fallback: number): ParseResult<number> {
  const raw = url.searchParams.get("limit");
  if (raw === null) return { ok: true, value: fallback };
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    return { ok: false, field: "limit", reason: `Must be an integer between 1 and ${MAX_LIMIT}` };
  }
  return { ok: true, value };
}

/**
 * Offset paging (not keyset) because search results are ranked, not ordered by
 * a stable key — there is no cursor to carry. Bounded so a crawler cannot walk
 * the whole index one deep page at a time.
 */
export function parseOffset(url: URL): ParseResult<number> {
  const raw = url.searchParams.get("offset");
  if (raw === null) return { ok: true, value: 0 };
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > MAX_OFFSET) {
    return { ok: false, field: "offset", reason: `Must be an integer between 0 and ${MAX_OFFSET}` };
  }
  return { ok: true, value };
}

export function parseTypes(url: URL): ParseResult<SearchEntityType[] | null> {
  const raw = url.searchParams.getAll("type").flatMap((value) => value.split(","));
  const values = raw.map((value) => value.trim()).filter((value) => value.length > 0);
  if (values.length === 0) return { ok: true, value: null };
  for (const value of values) {
    if (!(SEARCH_ENTITY_TYPES as readonly string[]).includes(value)) {
      return { ok: false, field: "type", reason: `Must be one of: ${SEARCH_ENTITY_TYPES.join(", ")}` };
    }
  }
  return { ok: true, value: values as SearchEntityType[] };
}

function list(url: URL, key: string): string[] {
  return url.searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0)
    .slice(0, 24);
}

function numberParam(
  url: URL,
  key: string,
  min: number,
  max: number,
): ParseResult<number | null> {
  const raw = url.searchParams.get(key);
  if (raw === null) return { ok: true, value: null };
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    return { ok: false, field: key, reason: `Must be a number between ${min} and ${max}` };
  }
  return { ok: true, value };
}

const TITLE_SORTS = [
  "relevance",
  "popularity",
  "rating",
  "votes",
  "release_date",
  "alphabetical",
  "runtime",
] as const;

const NAME_SORTS = ["relevance", "popularity", "alphabetical", "birth_date"] as const;

function parseSort<T extends string>(
  url: URL,
  allowed: readonly T[],
): ParseResult<T | undefined> {
  const raw = url.searchParams.get("sort");
  if (raw === null) return { ok: true, value: undefined };
  if (!(allowed as readonly string[]).includes(raw)) {
    return { ok: false, field: "sort", reason: `Must be one of: ${allowed.join(", ")}` };
  }
  return { ok: true, value: raw as T };
}

function parseOrder(url: URL): ParseResult<"asc" | "desc" | undefined> {
  const raw = url.searchParams.get("order");
  if (raw === null) return { ok: true, value: undefined };
  if (raw !== "asc" && raw !== "desc") {
    return { ok: false, field: "order", reason: "Must be asc or desc" };
  }
  return { ok: true, value: raw };
}

export function parseTitleSearch(url: URL): ParseResult<TitleSearchQuery> {
  const text = parseQueryText(url, false);
  if (!text.ok) return text;
  const limit = parseLimit(url, 50);
  if (!limit.ok) return limit;
  const offset = parseOffset(url);
  if (!offset.ok) return offset;
  const sort = parseSort(url, TITLE_SORTS);
  if (!sort.ok) return sort;
  const order = parseOrder(url);
  if (!order.ok) return order;

  const ranges: Array<[string, ParseResult<number | null>]> = [
    ["year_from", numberParam(url, "year_from", 1800, 2200)],
    ["year_to", numberParam(url, "year_to", 1800, 2200)],
    ["rating_from", numberParam(url, "rating_from", 0, 10)],
    ["rating_to", numberParam(url, "rating_to", 0, 10)],
    ["votes_min", numberParam(url, "votes_min", 0, 100_000_000)],
    ["runtime_min", numberParam(url, "runtime_min", 0, 100_000)],
    ["runtime_max", numberParam(url, "runtime_max", 0, 100_000)],
  ];
  for (const [, result] of ranges) {
    if (!result.ok) return result;
  }
  const value = (key: string): number | null => {
    const found = ranges.find(([name]) => name === key);
    return found && found[1].ok ? found[1].value : null;
  };

  const yearFrom = value("year_from");
  const yearTo = value("year_to");
  if (yearFrom !== null && yearTo !== null && yearTo < yearFrom) {
    return { ok: false, field: "year_to", reason: "Must not be before year_from" };
  }

  return {
    ok: true,
    value: {
      text: text.value.length > 0 ? text.value : null,
      kinds: list(url, "kind"),
      genres: list(url, "genre"),
      yearFrom,
      yearTo,
      ratingFrom: value("rating_from"),
      ratingTo: value("rating_to"),
      votesMin: value("votes_min"),
      runtimeMin: value("runtime_min"),
      runtimeMax: value("runtime_max"),
      certificates: list(url, "certificate"),
      countries: list(url, "country"),
      languages: list(url, "language"),
      keywords: list(url, "keyword"),
      companies: list(url, "company"),
      includeAdult: url.searchParams.get("adult") === "true",
      ...(sort.value ? { sort: sort.value } : {}),
      ...(order.value ? { order: order.value } : {}),
      limit: limit.value,
      offset: offset.value,
    },
  };
}

export function parseNameSearch(url: URL): ParseResult<NameSearchQuery> {
  const text = parseQueryText(url, false);
  if (!text.ok) return text;
  const limit = parseLimit(url, 50);
  if (!limit.ok) return limit;
  const offset = parseOffset(url);
  if (!offset.ok) return offset;
  const sort = parseSort(url, NAME_SORTS);
  if (!sort.ok) return sort;
  const order = parseOrder(url);
  if (!order.ok) return order;

  const bornFrom = numberParam(url, "born_from", 1800, 2200);
  if (!bornFrom.ok) return bornFrom;
  const bornTo = numberParam(url, "born_to", 1800, 2200);
  if (!bornTo.ok) return bornTo;
  const diedFrom = numberParam(url, "died_from", 1800, 2200);
  if (!diedFrom.ok) return diedFrom;
  const diedTo = numberParam(url, "died_to", 1800, 2200);
  if (!diedTo.ok) return diedTo;

  const birthPlace = url.searchParams.get("birth_place");
  if (birthPlace !== null && birthPlace.length > MAX_QUERY_LENGTH) {
    return { ok: false, field: "birth_place", reason: "Too long" };
  }

  return {
    ok: true,
    value: {
      text: text.value.length > 0 ? text.value : null,
      professions: list(url, "profession"),
      bornFrom: bornFrom.value,
      bornTo: bornTo.value,
      diedFrom: diedFrom.value,
      diedTo: diedTo.value,
      birthPlace: birthPlace && birthPlace.trim().length > 0 ? birthPlace.trim() : null,
      ...(sort.value ? { sort: sort.value } : {}),
      ...(order.value ? { order: order.value } : {}),
      limit: limit.value,
      offset: offset.value,
    },
  };
}
