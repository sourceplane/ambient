"use client";

import Link from "next/link";
import type { PublicCertificate, PublicTitle } from "@saas/contracts/catalog";
import type { PublicTitleRating } from "@saas/contracts/ratings";
import { cn } from "@/lib/cn";
import { genreHref, titleHref } from "@/lib/site-routes";
import {
  formatRuntime,
  formatYearRange,
  metaLine,
  shouldShowKindBadge,
  titleKindLabel,
} from "@/lib/site-format";
import { preferredCertificate } from "@/lib/site-title";
import { SiteImage } from "./site-image";
import { RatingPill } from "./rating-pill";
import { ChipGroup } from "./chip-group";
import { WatchlistButton, YourRating } from "./title-actions";

/**
 * The top of a title page.
 *
 * A backdrop under a scrim, the poster beside the facts, and the three things
 * people came for — what it is, how it's rated, and whether they want to watch
 * it. Everything else on the page is detail.
 */
export function TitleHero({
  title,
  rating,
  certificates,
  backdropUrl,
  className,
}: {
  title: PublicTitle;
  rating: PublicTitleRating | null;
  certificates: PublicCertificate[];
  backdropUrl?: string | null;
  className?: string;
}) {
  const years = formatYearRange(title.kind, title.startYear, title.endYear);
  const certificate = preferredCertificate(certificates);
  const meta = metaLine([
    shouldShowKindBadge(title.kind) ? titleKindLabel(title.kind) : null,
    years,
    certificate?.rating,
    formatRuntime(title.runtimeMinutes),
  ]);

  return (
    <header className={cn("relative -mx-3 sm:-mx-6", className)}>
      {backdropUrl ? (
        <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
          <img src={backdropUrl} alt="" className="h-full w-full object-cover object-top" />
          <div className="site-scrim absolute inset-0" />
        </div>
      ) : null}

      <div className="relative px-3 pb-6 pt-6 sm:px-6 sm:pt-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
          <SiteImage
            src={title.primaryImage?.url}
            alt=""
            ratio="2/3"
            priority
            sizes="(max-width: 640px) 40vw, 220px"
            className="w-32 shrink-0 rounded-[var(--site-radius-poster)] shadow-[var(--site-shadow-poster)] sm:w-48 lg:w-56"
          />

          <div className="min-w-0 flex-1">
            <h1 className="site-display">{title.primaryTitle}</h1>
            {title.originalTitle && title.originalTitle !== title.primaryTitle ? (
              <p className="site-meta mt-1 text-sm">Original title: {title.originalTitle}</p>
            ) : null}
            <p className="site-meta site-num mt-1 text-sm">{meta}</p>

            {title.genres.length > 0 ? (
              <ChipGroup
                className="mt-3"
                size="sm"
                chips={title.genres.map((g) => ({ label: g.name, href: genreHref(g.slug) }))}
              />
            ) : null}

            {title.tagline ? (
              <p className="site-accent mt-3 text-sm font-medium italic">{title.tagline}</p>
            ) : null}

            {title.plotOutline ? (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed sm:text-base">
                {title.plotOutline}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap items-end gap-6">
              <div>
                <p className="site-meta text-xs font-semibold uppercase tracking-wide">
                  {title.productionStatus === "released" ? "Rating" : titleKindLabel(title.kind)}
                </p>
                <Link href={`${titleHref(title.id)}/ratings`} className="site-focus mt-1 block">
                  <RatingPill
                    average={rating?.average ?? null}
                    voteCount={rating?.voteCount ?? 0}
                    size="lg"
                  />
                </Link>
              </div>
              <YourRating titleId={title.id} />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <WatchlistButton titleId={title.id} />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
