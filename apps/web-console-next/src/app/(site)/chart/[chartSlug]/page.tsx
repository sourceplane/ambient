"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { PublicTitleSummary } from "@saas/contracts/catalog";
import { cn } from "@/lib/cn";
import { catalogApi, ratingsApi } from "@/lib/catalog-api";
import { chartBySlug, titleHref } from "@/lib/site-routes";
import { isViewMode, type ViewMode } from "@/lib/site-search";
import { formatDate, formatRuntime, formatYearRange, metaLine } from "@/lib/site-format";
import { SectionHeader } from "@/components/site/section-header";
import { RankBadge } from "@/components/site/result-row";
import { PosterCard } from "@/components/site/poster-card";
import { RatingPill } from "@/components/site/rating-pill";
import { SiteImage } from "@/components/site/site-image";
import { ViewModeSwitch } from "@/components/site/result-views";
import { SectionState, SurfaceMissing } from "@/components/site/surface-states";
import { WatchlistButton } from "@/components/site/title-actions";

const LIMIT = 250;

/**
 * A chart page.
 *
 * Two requests, not 250: the ratings service returns ranked ids and scores, and
 * one batch hydrate turns them into posters. The score *is* the weighted
 * rating, so no per-title rating fetch is needed either.
 */
export default function ChartPage() {
  const { chartSlug } = useParams<{ chartSlug: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const descriptor = chartBySlug(chartSlug);

  const viewParam = params.get("view");
  const mode: ViewMode = isViewMode(viewParam) ? viewParam : "detailed";

  const chart = useQuery({
    queryKey: ["site", "chart-page", descriptor?.key, LIMIT],
    queryFn: () => ratingsApi.chart(descriptor!.key, LIMIT),
    enabled: Boolean(descriptor),
    retry: false,
    staleTime: 5 * 60_000,
  });

  const entries = chart.data?.entries ?? [];
  const ids = entries.map((entry) => entry.titleId);

  const titles = useQuery({
    queryKey: ["site", "titles", ids],
    queryFn: () => catalogApi.batchTitles(ids),
    enabled: ids.length > 0,
    retry: false,
    staleTime: 5 * 60_000,
  });

  if (!descriptor) {
    return (
      <SurfaceMissing
        heading="No such chart"
        body="That chart doesn't exist. Try Top 250 Movies or Most Popular."
      />
    );
  }

  const byId = new Map((titles.data?.titles ?? []).map((title) => [title.id, title]));
  const rows = entries
    .map((entry) => ({ entry, title: byId.get(entry.titleId) }))
    .filter((row): row is { entry: (typeof entries)[number]; title: PublicTitleSummary } =>
      row.title !== undefined,
    );

  return (
    <div className="pt-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <SectionHeader title={descriptor.title} as="h1" count={rows.length} className="mb-0" />
        <ViewModeSwitch
          mode={mode}
          onChange={(next) =>
            router.push(`/chart/${chartSlug}${next === "detailed" ? "" : `?view=${next}`}`)
          }
        />
      </div>
      <p className="site-meta mb-1 text-sm">{descriptor.blurb}</p>
      {chart.data?.computedFor ? (
        <p className="site-meta site-num mb-6 text-xs">
          Computed {formatDate(chart.data.computedFor)}
        </p>
      ) : (
        <div className="mb-6" />
      )}

      <SectionState
        loading={chart.isLoading || (ids.length > 0 && titles.isLoading)}
        error={chart.isError}
        empty={rows.length === 0}
        emptyText="This chart hasn't been computed yet. It needs rated titles to rank."
        onRetry={() => void chart.refetch()}
      >
        {mode === "grid" ? (
          <ul className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
            {rows.map(({ entry, title }) => (
              <li key={entry.titleId}>
                <PosterCard
                  title={title}
                  rank={entry.rank}
                  rating={{ average: entry.score, voteCount: 0 }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <ol className="divide-y site-hairline">
            {rows.map(({ entry, title }) => (
              <li key={entry.titleId} className="flex items-center gap-3 py-3">
                <RankBadge rank={entry.rank} delta={entry.delta} />
                {mode === "detailed" ? (
                  <Link href={titleHref(title.id)} className="site-focus shrink-0" tabIndex={-1} aria-hidden="true">
                    <SiteImage src={title.primaryImage?.url} alt="" ratio="2/3" className="w-12 rounded" sizes="60px" />
                  </Link>
                ) : null}
                <div className="min-w-0 flex-1">
                  <Link href={titleHref(title.id)} className="site-focus block">
                    <span className="text-sm font-semibold hover:underline">{title.primaryTitle}</span>
                  </Link>
                  {mode === "detailed" ? (
                    <p className="site-meta site-num text-xs">
                      {metaLine([
                        formatYearRange(title.kind, title.startYear, title.endYear),
                        formatRuntime(title.runtimeMinutes),
                        title.genres.slice(0, 2).map((g) => g.name).join(", "),
                      ])}
                    </p>
                  ) : null}
                </div>
                <RatingPill average={entry.score} showVotes={false} size="sm" className="shrink-0" />
                {mode === "detailed" ? (
                  <WatchlistButton titleId={title.id} className={cn("hidden shrink-0 sm:inline-flex")} />
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </SectionState>
    </div>
  );
}
