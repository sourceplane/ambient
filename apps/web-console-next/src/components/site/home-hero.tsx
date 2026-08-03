"use client";

import * as React from "react";
import Link from "next/link";
import { Bookmark, Info } from "lucide-react";
import type { PublicTitleSummary } from "@saas/contracts/catalog";
import { cn } from "@/lib/cn";
import { titleHref } from "@/lib/site-routes";
import { formatRuntime, formatYearRange, metaLine, truncate } from "@/lib/site-format";
import { SiteImage } from "./site-image";
import { RatingPill } from "./rating-pill";

/**
 * The featured strip at the top of the home page.
 *
 * A rail of full-bleed cards rather than an auto-advancing carousel — nothing
 * moves unless the visitor moves it. An interface that changes what it is
 * showing while someone is reading it is hostile, and it is the single most
 * common accessibility failure on sites of this kind.
 */
export function HomeHero({
  titles,
  ratings,
  className,
}: {
  titles: PublicTitleSummary[];
  ratings?: Map<string, { average: number | null; voteCount: number }>;
  className?: string;
}) {
  if (titles.length === 0) return null;

  return (
    <section aria-label="Featured" className={cn("relative", className)}>
      <div className="site-rail -mx-3 flex gap-3 overflow-x-auto px-3 pb-2 sm:-mx-6 sm:gap-4 sm:px-6">
        {titles.map((title, index) => (
          <HeroCard
            key={title.id}
            title={title}
            rating={ratings?.get(title.id) ?? null}
            priority={index === 0}
          />
        ))}
      </div>
    </section>
  );
}

function HeroCard({
  title,
  rating,
  priority,
}: {
  title: PublicTitleSummary;
  rating: { average: number | null; voteCount: number } | null;
  priority: boolean;
}) {
  const years = formatYearRange(title.kind, title.startYear, title.endYear);
  const meta = metaLine([years, formatRuntime(title.runtimeMinutes)]);
  const genres = title.genres.slice(0, 3).map((g) => g.name).join(" · ");

  return (
    <article className="relative w-[86vw] shrink-0 overflow-hidden rounded-xl sm:w-[70vw] lg:w-[62%]">
      <SiteImage
        src={title.primaryImage?.url}
        alt=""
        ratio="16/9"
        priority={priority}
        sizes="(max-width: 640px) 86vw, (max-width: 1024px) 70vw, 62vw"
        imgClassName="object-cover object-top"
      />
      {/* The scrim is what makes white text legible over an arbitrary poster —
          without it the title is unreadable on a bright frame. */}
      <div className="site-scrim pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
        <h2 className="site-display line-clamp-2">
          <Link href={titleHref(title.id)} className="site-focus hover:underline">
            {title.primaryTitle}
          </Link>
        </h2>
        <p className="site-meta site-num mt-1 text-sm">
          {metaLine([meta, genres])}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {rating ? <RatingPill average={rating.average} voteCount={rating.voteCount} size="lg" /> : null}
          <Link
            href={titleHref(title.id)}
            className="site-accent-bg site-focus inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
          >
            <Info className="h-4 w-4" aria-hidden="true" />
            Details
          </Link>
          <Link
            href={titleHref(title.id)}
            aria-label={`Open ${title.primaryTitle} to add it to your watchlist`}
            className="site-focus site-hairline inline-flex items-center gap-1.5 rounded-full border bg-black/40 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm"
          >
            <Bookmark className="h-4 w-4" aria-hidden="true" />
            Watchlist
          </Link>
        </div>
      </div>
    </article>
  );
}

export function HomeHeroSkeleton() {
  return (
    <div className="-mx-3 flex gap-4 overflow-hidden px-3 sm:-mx-6 sm:px-6" aria-hidden="true">
      <div
        className="site-surface-2 w-[86vw] shrink-0 animate-pulse rounded-xl sm:w-[70vw] lg:w-[62%]"
        style={{ aspectRatio: "16/9" }}
      />
      <div
        className="site-surface-2 hidden w-[40%] shrink-0 animate-pulse rounded-xl lg:block"
        style={{ aspectRatio: "16/9" }}
      />
    </div>
  );
}

/** Truncated synopsis helper, exported for the title page to reuse. */
export function heroBlurb(text: string | null | undefined): string {
  return text ? truncate(text, 180) : "";
}
