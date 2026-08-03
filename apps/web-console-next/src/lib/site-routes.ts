// Route vocabulary for the catalog surface.
//
// Every link on the site is built here rather than interpolated at the call
// site, so a URL shape lives in exactly one place and a search hit can be
// turned into a destination without the caller knowing what kinds exist.
//
// Chart URLs are deliberately *not* the wire `ChartKey`. `/chart/top` is the
// address people share; `top_movies` is what the ratings API computes. Keeping
// a table between the two means either side can be renamed without breaking
// links that are already in the world.

import type { SearchEntityType } from "@saas/contracts/search";
import type { ChartKey } from "@saas/contracts/ratings";

export function titleHref(titleId: string): string {
  return `/title/${titleId}`;
}

export function nameHref(nameId: string): string {
  return `/name/${nameId}`;
}

export function listHref(listId: string): string {
  return `/list/${listId}`;
}

export function userHref(userId: string): string {
  return `/user/${userId}`;
}

export function findHref(query: string): string {
  return query ? `/find?q=${encodeURIComponent(query)}` : "/find";
}

export function genreHref(slug: string): string {
  return `/search/title?genre=${encodeURIComponent(slug)}`;
}

export function keywordHref(slug: string): string {
  return `/search/title?keyword=${encodeURIComponent(slug)}`;
}

export function chartHref(slug: ChartSlug): string {
  return `/chart/${slug}`;
}

// ── Charts ─────────────────────────────────────────────────────────────

export const CHART_SLUGS = [
  "top",
  "toptv",
  "bottom",
  "moviemeter",
  "tvmeter",
  "boxoffice",
  "coming-soon",
  "in-theaters",
] as const;

export type ChartSlug = (typeof CHART_SLUGS)[number];

interface ChartDescriptor {
  slug: ChartSlug;
  key: ChartKey;
  title: string;
  blurb: string;
}

export const CHARTS: ChartDescriptor[] = [
  {
    slug: "top",
    key: "top_movies",
    title: "Top 250 Movies",
    blurb: "The highest-rated films, weighted so a handful of votes can't buy a place.",
  },
  {
    slug: "toptv",
    key: "top_tv",
    title: "Top 250 TV Shows",
    blurb: "The highest-rated series, ranked on the same weighted scale.",
  },
  {
    slug: "bottom",
    key: "bottom_movies",
    title: "Lowest Rated Movies",
    blurb: "The other end of the same list.",
  },
  {
    slug: "moviemeter",
    key: "most_popular_movies",
    title: "Most Popular Movies",
    blurb: "What people are looking at this week, not what they rate highest.",
  },
  {
    slug: "tvmeter",
    key: "most_popular_tv",
    title: "Most Popular TV Shows",
    blurb: "The week's most-viewed series pages.",
  },
  {
    slug: "boxoffice",
    key: "box_office",
    title: "Top Box Office",
    blurb: "This week's highest-grossing releases.",
  },
  {
    slug: "coming-soon",
    key: "coming_soon",
    title: "Coming Soon",
    blurb: "Announced and dated, not yet released.",
  },
  {
    slug: "in-theaters",
    key: "in_theaters",
    title: "In Theaters",
    blurb: "Playing now.",
  },
];

const CHART_BY_SLUG = new Map(CHARTS.map((c) => [c.slug, c]));

export function chartBySlug(slug: string): ChartDescriptor | null {
  return CHART_BY_SLUG.get(slug as ChartSlug) ?? null;
}

// ── Search hits ────────────────────────────────────────────────────────

/**
 * A search hit knows its entity type and its public id; that is enough to
 * address it. Types the site has no page for resolve to a search that does —
 * never to a dead link.
 */
export function searchHitHref(hit: { type: SearchEntityType; id: string; display: string }): string {
  switch (hit.type) {
    case "title":
      return titleHref(hit.id);
    case "person":
      return nameHref(hit.id);
    case "list":
      return listHref(hit.id);
    case "keyword":
      return keywordHref(hit.id);
    case "company":
      return findHref(hit.display);
    default:
      return findHref(hit.display);
  }
}

export function searchHitGroupLabel(type: SearchEntityType): string {
  switch (type) {
    case "title":
      return "Titles";
    case "person":
      return "People";
    case "company":
      return "Companies";
    case "keyword":
      return "Keywords";
    case "list":
      return "Lists";
    default:
      return "Results";
  }
}

/** Stable group order for the typeahead — titles first, always. */
export const SEARCH_GROUP_ORDER: SearchEntityType[] = [
  "title",
  "person",
  "company",
  "keyword",
  "list",
];

export function groupSearchHits<T extends { type: SearchEntityType }>(
  hits: T[],
): Array<{ type: SearchEntityType; label: string; hits: T[] }> {
  const groups = new Map<SearchEntityType, T[]>();
  for (const hit of hits) {
    const bucket = groups.get(hit.type);
    if (bucket) bucket.push(hit);
    else groups.set(hit.type, [hit]);
  }
  return SEARCH_GROUP_ORDER.filter((type) => groups.has(type)).map((type) => ({
    type,
    label: searchHitGroupLabel(type),
    hits: groups.get(type)!,
  }));
}

// ── Navigation ─────────────────────────────────────────────────────────

export interface NavLink {
  label: string;
  href: string;
}

export interface NavMenu {
  label: string;
  links: NavLink[];
}

/**
 * The category menu. Grouped the way people ask for things — "what's good",
 * "what's on", "who's in it" — rather than the way the API is partitioned.
 */
export const SITE_MENUS: NavMenu[] = [
  {
    label: "Movies",
    links: [
      { label: "Top 250 Movies", href: chartHref("top") },
      { label: "Most Popular Movies", href: chartHref("moviemeter") },
      { label: "In Theaters", href: chartHref("in-theaters") },
      { label: "Coming Soon", href: chartHref("coming-soon") },
      { label: "Top Box Office", href: chartHref("boxoffice") },
      { label: "Browse by genre", href: "/search/title" },
    ],
  },
  {
    label: "TV",
    links: [
      { label: "Top 250 TV Shows", href: chartHref("toptv") },
      { label: "Most Popular TV Shows", href: chartHref("tvmeter") },
      { label: "Browse TV", href: "/search/title?kind=tv_series" },
    ],
  },
  {
    label: "People",
    links: [
      { label: "Most Popular Celebrities", href: "/search/name" },
      { label: "Browse people", href: "/search/name" },
    ],
  },
  {
    label: "Awards",
    links: [
      { label: "Awards Central", href: "/awards" },
      { label: "Latest News", href: "/news" },
    ],
  },
];

/** The mobile tab bar — four destinations, no menus. */
export const SITE_TABS: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "Search", href: "/find" },
  { label: "Watchlist", href: "/watchlist" },
  { label: "Account", href: "/account" },
];

export const FOOTER_COLUMNS: NavMenu[] = [
  {
    label: "Discover",
    links: [
      { label: "Top 250 Movies", href: chartHref("top") },
      { label: "Top 250 TV", href: chartHref("toptv") },
      { label: "Most Popular", href: chartHref("moviemeter") },
      { label: "Box Office", href: chartHref("boxoffice") },
    ],
  },
  {
    label: "Browse",
    links: [
      { label: "Advanced title search", href: "/search/title" },
      { label: "Advanced name search", href: "/search/name" },
      { label: "News", href: "/news" },
      { label: "Awards", href: "/awards" },
    ],
  },
  {
    label: "You",
    links: [
      { label: "Watchlist", href: "/watchlist" },
      { label: "Your ratings", href: "/account/ratings" },
      { label: "Your lists", href: "/account/lists" },
      { label: "Contribute", href: "/contribute" },
    ],
  },
  {
    label: "Platform",
    links: [
      { label: "Studio", href: "/studio" },
      { label: "Sign in", href: "/login" },
    ],
  },
];

/**
 * Routes that belong to the operator console rather than the public site.
 * The site shell links out to these; it never wraps them.
 */
export const STUDIO_ROOT = "/studio";

/**
 * `true` when a pathname is one of the site's own routes. Used by the header to
 * decide whether a nav link is the current page, including the `/title/…`
 * sub-routes that should keep `/title/…` highlighted.
 */
export function isActiveNav(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  const base = href.split("?")[0]!;
  return pathname === base || pathname.startsWith(`${base}/`);
}
