"use client";

import * as React from "react";
import Link from "next/link";
import { Bookmark, BookmarkCheck } from "lucide-react";
import type { PublicTitleSummary } from "@saas/contracts/catalog";
import { cn } from "@/lib/cn";
import { titleHref } from "@/lib/site-routes";
import {
  formatRuntime,
  formatYearRange,
  metaLine,
  shouldShowKindBadge,
  titleKindLabel,
} from "@/lib/site-format";
import { SiteImage } from "./site-image";
import { RatingPill } from "./rating-pill";

/**
 * The atom the whole site is built from: a 2:3 poster, the title, and just
 * enough metadata to tell two similarly-named films apart.
 *
 * The rating is passed in rather than fetched. Ratings live in a different
 * bounded context; a card that fetched its own would turn a 20-poster rail
 * into 20 requests. The rail hydrates once and hands each card its number.
 */
export function PosterCard({
  title,
  rating,
  rank,
  onWatchlist,
  onToggleWatchlist,
  priority = false,
  className,
}: {
  title: PublicTitleSummary;
  rating?: { average: number | null; voteCount: number } | null;
  /** Chart position, shown only where rank is the point. */
  rank?: number;
  onWatchlist?: boolean;
  onToggleWatchlist?: (titleId: string) => void;
  priority?: boolean;
  className?: string;
}) {
  const years = formatYearRange(title.kind, title.startYear, title.endYear);
  const meta = metaLine([
    years,
    shouldShowKindBadge(title.kind) ? titleKindLabel(title.kind) : null,
    formatRuntime(title.runtimeMinutes),
  ]);

  return (
    <div className={cn("group relative flex w-full flex-col", className)}>
      <div className="relative">
        <Link
          href={titleHref(title.id)}
          className="site-focus block"
          aria-label={years ? `${title.primaryTitle} (${years})` : title.primaryTitle}
        >
          <SiteImage
            src={title.primaryImage?.url}
            alt=""
            ratio="2/3"
            priority={priority}
            sizes="(max-width: 640px) 40vw, (max-width: 1024px) 22vw, 180px"
            className={cn(
              "rounded-[var(--site-radius-poster)] shadow-[var(--site-shadow-poster)]",
              "transition-transform duration-200 ease-out",
              "group-hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none",
            )}
          />
        </Link>

        {rank !== undefined ? (
          <span className="site-num absolute left-0 top-0 rounded-br-md rounded-tl-[var(--site-radius-poster)] site-accent-bg px-2 py-0.5 text-xs font-bold">
            {rank}
          </span>
        ) : null}

        {onToggleWatchlist ? (
          <button
            type="button"
            onClick={() => onToggleWatchlist(title.id)}
            aria-pressed={Boolean(onWatchlist)}
            aria-label={
              onWatchlist
                ? `Remove ${title.primaryTitle} from your watchlist`
                : `Add ${title.primaryTitle} to your watchlist`
            }
            className={cn(
              "site-focus absolute right-1 top-1 rounded-md p-1.5 backdrop-blur-sm transition-colors",
              "bg-black/50 text-white hover:bg-black/70",
            )}
          >
            {onWatchlist ? (
              <BookmarkCheck className="h-4 w-4 site-accent" aria-hidden="true" />
            ) : (
              <Bookmark className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>

      <div className="mt-2 space-y-0.5">
        {rating ? <RatingPill average={rating.average} voteCount={rating.voteCount} size="sm" /> : null}
        <Link href={titleHref(title.id)} className="site-focus block">
          <span className="line-clamp-2 text-sm font-semibold leading-snug hover:underline">
            {title.primaryTitle}
          </span>
        </Link>
        {meta ? <p className="site-meta site-num text-xs">{meta}</p> : null}
      </div>
    </div>
  );
}

/** Same footprint as the real card, so a loading rail doesn't reflow into place. */
export function PosterCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex w-full animate-pulse flex-col", className)} aria-hidden="true">
      <div
        className="site-surface-2 rounded-[var(--site-radius-poster)]"
        style={{ aspectRatio: "2/3" }}
      />
      <div className="mt-2 space-y-1.5">
        <div className="site-surface-2 h-3 w-10 rounded" />
        <div className="site-surface-2 h-3.5 w-4/5 rounded" />
        <div className="site-surface-2 h-3 w-1/2 rounded" />
      </div>
    </div>
  );
}
