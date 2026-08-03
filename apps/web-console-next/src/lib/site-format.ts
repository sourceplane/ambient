// Display formatting for the catalog surface.
//
// Everything here is a pure function of its arguments — no locale sniffing, no
// `Date.now()`, no `Intl` with a floating locale. A film site renders the same
// runtime, the same vote count and the same year range for every visitor, and a
// formatter that quietly depends on the environment is a formatter that can't
// be tested or server-rendered consistently.

import type { TitleKind } from "@saas/contracts/catalog";

/** `166` → `"2h 46m"`. Sub-hour runtimes keep just the minutes. */
export function formatRuntime(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/**
 * A movie shows one year. A series shows a span, and an open-ended run shows
 * `2019–` rather than inventing an end — "still running" is information.
 */
export function formatYearRange(
  kind: TitleKind,
  startYear: number | null | undefined,
  endYear: number | null | undefined,
): string {
  if (!startYear) return "";
  if (!isSerial(kind)) return String(startYear);
  if (endYear && endYear !== startYear) return `${startYear}–${endYear}`;
  if (endYear === startYear) return String(startYear);
  return `${startYear}–`;
}

function isSerial(kind: TitleKind): boolean {
  return kind === "tv_series" || kind === "tv_mini_series" || kind === "podcast_series";
}

/**
 * Vote counts sit next to a rating, where the exact number is noise and the
 * order of magnitude is the point. Rounds down so a count never reads higher
 * than it is.
 */
export function formatVotes(count: number | null | undefined): string {
  if (!count || count <= 0) return "0";
  if (count < 1_000) return String(count);
  if (count < 1_000_000) return `${trimZero(Math.floor(count / 100) / 10)}K`;
  if (count < 1_000_000_000) return `${trimZero(Math.floor(count / 100_000) / 10)}M`;
  return `${trimZero(Math.floor(count / 100_000_000) / 10)}B`;
}

function trimZero(value: number): string {
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

/** One decimal place, always — `8` reads as an integer score, `8.0` as a rating. */
export function formatRating(average: number | null | undefined): string {
  if (average === null || average === undefined) return "—";
  return average.toFixed(1);
}

/** Cents to a compact currency string: `16500000000` → `"$165M"`. */
export function formatMoney(cents: number | null | undefined, currency = "USD"): string {
  if (cents === null || cents === undefined) return "";
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const units = Math.round(cents / 100);
  const sign = units < 0 ? "-" : "";
  const abs = Math.abs(units);
  if (abs >= 1_000_000_000) return `${sign}${symbol}${trimZero(Math.round(abs / 100_000_000) / 10)}B`;
  if (abs >= 1_000_000) return `${sign}${symbol}${trimZero(Math.round(abs / 100_000) / 10)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${trimZero(Math.round(abs / 100) / 10)}K`;
  return `${sign}${symbol}${abs}`;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  INR: "₹",
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * `"2016-11-11"` → `"11 Nov 2016"`. Parsed by string rather than by `Date`,
 * because `new Date("2016-11-11")` is UTC midnight and renders as the 10th for
 * anyone west of Greenwich — a release date that moves with the reader is a bug.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return "";
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return "";
  return `${Number(day)} ${monthName} ${year}`;
}

const KIND_LABELS: Record<TitleKind, string> = {
  movie: "Movie",
  tv_series: "TV Series",
  tv_mini_series: "TV Mini Series",
  tv_episode: "Episode",
  tv_special: "TV Special",
  tv_movie: "TV Movie",
  short: "Short",
  tv_short: "TV Short",
  video: "Video",
  video_game: "Video Game",
  podcast_series: "Podcast",
  podcast_episode: "Podcast Episode",
};

export function titleKindLabel(kind: TitleKind): string {
  return KIND_LABELS[kind] ?? "Title";
}

/** Movies carry no kind badge — the absence of one is what says "film". */
export function shouldShowKindBadge(kind: TitleKind): boolean {
  return kind !== "movie";
}

/** `"Denis Villeneuve"` → `"DV"`. The fallback when there is no headshot. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Truncate on a word boundary so a synopsis never breaks mid-word. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** `195` → `"3:15"` — video durations, where hours are rare and mm:ss is the idiom. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

/**
 * The meta line under a poster: kind, years and runtime, joined only where a
 * value exists so a sparse record doesn't render `· ·`.
 */
export function metaLine(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p && p.length > 0)).join(" · ");
}
