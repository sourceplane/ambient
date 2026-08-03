// What the home page is made of.
//
// The rails are data, not JSX. Declaring them here means the page renders a
// list rather than a hand-written sequence of near-identical blocks, and the
// composition can be asserted in a test without mounting React.
//
// The important decision encoded here is the **fallback**. A chart is computed
// from ratings; on a catalog that has titles but not yet enough votes, every
// chart is empty and a home page built only from charts is a wall of blank
// rails. Each chart rail therefore names a catalog browse it degrades to, so
// the page shows what the catalog actually has instead of what the ratings
// pipeline hasn't produced yet.

import type { ChartKey } from "@saas/contracts/ratings";
import type { TitleKind } from "@saas/contracts/catalog";
import { chartHref, type ChartSlug } from "./site-routes";

export interface HomeRail {
  /** Stable key — query cache key and React key. */
  key: string;
  title: string;
  /** The chart this rail prefers. */
  chart: ChartKey;
  /** Where "see all" goes. */
  href: string;
  /**
   * The browse this rail falls back to when the chart is empty. `null` means
   * the rail simply hides — better an absent rail than an honest-looking one
   * filled with unrelated titles.
   */
  fallback: { kind: TitleKind } | null;
}

function rail(
  key: string,
  title: string,
  chart: ChartKey,
  slug: ChartSlug,
  fallback: TitleKind | null,
): HomeRail {
  return {
    key,
    title,
    chart,
    href: chartHref(slug),
    fallback: fallback ? { kind: fallback } : null,
  };
}

/**
 * Order matters: the first rail sits directly under the hero and is the one
 * most visitors see, so it is the broadest ("what is everyone watching"),
 * not the most opinionated.
 */
export const HOME_RAILS: HomeRail[] = [
  rail("trending", "Trending now", "most_popular_movies", "moviemeter", "movie"),
  rail("in-theaters", "In theaters", "in_theaters", "in-theaters", null),
  rail("top-rated", "Top rated movies", "top_movies", "top", "movie"),
  rail("popular-tv", "Popular TV shows", "most_popular_tv", "tvmeter", "tv_series"),
  rail("top-tv", "Top rated TV", "top_tv", "toptv", "tv_series"),
  rail("coming-soon", "Coming soon", "coming_soon", "coming-soon", null),
];

/** The hero draws from the same source as the first rail, taking the top few. */
export const HERO_CHART: ChartKey = "most_popular_movies";
export const HERO_SIZE = 5;

/** How many posters a rail requests. Wide enough to scroll, small enough to fetch. */
export const RAIL_SIZE = 20;

/**
 * Given what a chart returned and what the fallback browse returned, decide
 * what the rail shows. Kept separate from the fetching so the rule — "prefer
 * the chart, use the browse only when the chart is empty" — is testable and
 * stated once.
 */
export function resolveRailItems<T>(chartItems: T[], fallbackItems: T[]): T[] {
  return chartItems.length > 0 ? chartItems : fallbackItems;
}

/** A rail with nothing to show is removed, not rendered as an empty shelf. */
export function visibleRails<T>(rails: Array<{ rail: HomeRail; items: T[] }>) {
  return rails.filter((entry) => entry.items.length > 0);
}
