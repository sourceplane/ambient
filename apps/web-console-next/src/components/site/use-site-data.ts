"use client";

import { useQuery } from "@tanstack/react-query";
import type { PublicTitleSummary } from "@saas/contracts/catalog";
import { catalogApi, communityApi, ratingsApi } from "@/lib/catalog-api";
import { RAIL_SIZE, resolveRailItems, type HomeRail } from "@/lib/site-home";

/**
 * The shape every rail on the site renders from: titles in the order the
 * source produced them, plus whatever rating each one arrived with.
 */
export interface RailData {
  titles: PublicTitleSummary[];
  ratings: Map<string, { average: number | null; voteCount: number }>;
  loading: boolean;
}

const EMPTY_RATINGS = new Map<string, { average: number | null; voteCount: number }>();

/**
 * Read one chart and hydrate it into posters.
 *
 * Three facts drive the shape of this hook:
 *
 * 1. A chart entry is `{rank, titleId, score}` — the ratings context cannot
 *    read the catalog's schema, so the client is where the two meet.
 * 2. Hydration is one batched request, not one per poster.
 * 3. `score` is the chart's weighted rating, so the rail gets its numbers for
 *    free and never fans out to `/rating` per title.
 *
 * When the chart is empty or unavailable the rail falls back to a catalog
 * browse. That is not defensive padding: a catalog whose ratings pipeline has
 * not run yet still has titles, and showing them is more truthful than showing
 * an empty shelf under a heading that promises content.
 */
export function useRail(rail: HomeRail, size = RAIL_SIZE): RailData {
  const chart = useQuery({
    queryKey: ["site", "chart", rail.chart, size],
    queryFn: () => ratingsApi.chart(rail.chart, size),
    // Charts are recomputed daily; a failure here is a fallback, not a retry.
    retry: false,
    staleTime: 5 * 60_000,
  });

  const entries = chart.data?.entries ?? [];
  const ids = entries.map((e) => e.titleId);

  const hydrated = useQuery({
    queryKey: ["site", "titles", ids],
    queryFn: () => catalogApi.batchTitles(ids),
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
  });

  // Only reach for the fallback once the chart has actually answered — firing
  // both at once would double every rail's cost on a healthy deployment.
  const chartEmpty = (chart.isError || chart.isSuccess) && entries.length === 0;

  const fallback = useQuery({
    queryKey: ["site", "browse", rail.fallback?.kind ?? "none", size],
    queryFn: () => catalogApi.listTitles({ kind: rail.fallback!.kind, limit: size }),
    enabled: chartEmpty && rail.fallback !== null,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const chartTitles = hydrated.data?.titles ?? [];
  const titles = resolveRailItems(chartTitles, fallback.data?.titles ?? []);

  const ratings = new Map<string, { average: number | null; voteCount: number }>();
  if (chartTitles.length > 0) {
    for (const entry of entries) {
      ratings.set(entry.titleId, { average: entry.score, voteCount: 0 });
    }
  }

  const loading =
    chart.isLoading ||
    (ids.length > 0 && hydrated.isLoading) ||
    (chartEmpty && rail.fallback !== null && fallback.isLoading);

  return { titles, ratings: ratings.size > 0 ? ratings : EMPTY_RATINGS, loading };
}

/** Popular people. No chart behind this yet, so it reads the catalog directly. */
export function usePopularNames(limit = 20) {
  return useQuery({
    queryKey: ["site", "names", limit],
    queryFn: () => catalogApi.listNames({ limit }),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useNews(limit = 8) {
  return useQuery({
    queryKey: ["site", "news", limit],
    queryFn: () => communityApi.news({ limit }),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useGenres() {
  return useQuery({
    queryKey: ["site", "genres"],
    queryFn: () => catalogApi.genres(),
    retry: false,
    staleTime: 30 * 60_000,
  });
}
