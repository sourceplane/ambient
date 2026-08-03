"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/site-format";
import { titleHref } from "@/lib/site-routes";
import { SectionHeader } from "@/components/site/section-header";
import { SiteImage } from "@/components/site/site-image";
import { SectionState } from "@/components/site/surface-states";
import { useTitleEpisodes, useTitleSeasons } from "@/components/site/use-title-data";

/**
 * Seasons and episodes.
 *
 * The season switcher drives a fetch rather than filtering a preloaded list: a
 * long-running series is thousands of episodes, and loading all of them to show
 * one season would be the single most expensive request on the site.
 */
export default function EpisodesPage() {
  const { titleId } = useParams<{ titleId: string }>();
  const seasons = useTitleSeasons(titleId);
  const [season, setSeason] = React.useState<number | undefined>(undefined);

  const list = seasons.data?.seasons ?? [];
  const selected = season ?? list[0]?.seasonNumber;
  const episodes = useTitleEpisodes(titleId, selected, selected !== undefined);
  const rows = episodes.data?.episodes ?? [];

  return (
    <div className="space-y-6">
      <SectionHeader title="Episodes" as="h1" />

      {list.length > 0 ? (
        <div className="site-rail -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Seasons">
          {list.map((entry) => {
            const active = entry.seasonNumber === selected;
            return (
              <button
                key={entry.seasonNumber}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSeason(entry.seasonNumber)}
                className={cn(
                  "site-focus shrink-0 rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                  active ? "site-accent-bg border-transparent" : "site-hairline site-surface-2",
                )}
              >
                {entry.name ?? `Season ${entry.seasonNumber}`}
                <span className="site-num ml-1.5 text-xs opacity-70">{entry.episodeCount}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <SectionState
        loading={seasons.isLoading || episodes.isLoading}
        error={seasons.isError}
        empty={rows.length === 0}
        emptyText="No episodes have been added for this title yet."
        onRetry={() => void seasons.refetch()}
      >
        <ul className="divide-y site-hairline">
          {rows.map((episode) => (
            <li
              key={`${episode.seasonNumber}-${episode.episodeNumber}-${episode.title.id}`}
              className="flex gap-4 py-4"
            >
              <Link href={titleHref(episode.title.id)} className="site-focus shrink-0" tabIndex={-1} aria-hidden="true">
                <SiteImage
                  src={episode.title.primaryImage?.url}
                  alt=""
                  ratio="16/9"
                  className="w-32 rounded sm:w-44"
                  sizes="180px"
                />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="site-meta site-num text-xs">
                  S{episode.seasonNumber} · E{episode.episodeNumber}
                  {episode.airedOn ? ` · ${formatDate(episode.airedOn)}` : ""}
                </p>
                <Link href={titleHref(episode.title.id)} className="site-focus block">
                  <span className="text-sm font-semibold hover:underline">
                    {episode.title.primaryTitle}
                  </span>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </SectionState>
    </div>
  );
}
