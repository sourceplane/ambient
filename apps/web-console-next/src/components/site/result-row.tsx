"use client";

import Link from "next/link";
import type { PublicSearchHit } from "@saas/contracts/search";
import { cn } from "@/lib/cn";
import { searchHitHref } from "@/lib/site-routes";
import { facetNumber, facetString, facetStrings } from "@/lib/site-search";
import { formatRuntime, initials, metaLine } from "@/lib/site-format";
import { SiteImage } from "./site-image";
import { RatingPill } from "./rating-pill";

/**
 * A search result.
 *
 * A hit is deliberately thin — display, secondary, image, facets — because the
 * search index must not become a second copy of the catalog. The facets carry
 * exactly what a result row needs, and this component is where that loose bag
 * of values becomes typed text, once, instead of at every call site.
 */
export function ResultRow({ hit, className }: { hit: PublicSearchHit; className?: string }) {
  const circular = hit.type === "person";
  const year = facetNumber(hit.facets, "year");
  const rating = facetNumber(hit.facets, "rating");
  const votes = facetNumber(hit.facets, "votes");
  const runtime = facetNumber(hit.facets, "runtime");
  const kind = facetString(hit.facets, "kind");
  const genres = facetStrings(hit.facets, "genres");

  // The index writes `secondary` as "2016 · Movie" for a title — which is what
  // the facet line already says — and as the profession list for a person,
  // which nothing else says. So prefer the richer facet line and fall back to
  // `secondary`, rather than rendering both and repeating the year.
  const meta =
    metaLine([
      year ? String(year) : null,
      kind && kind !== "movie" ? kind.replace(/_/g, " ") : null,
      formatRuntime(runtime),
      genres.slice(0, 3).join(", "),
    ]) || hit.secondary;

  return (
    <div className={cn("flex gap-4 py-4", className)}>
      <Link href={searchHitHref(hit)} className="site-focus shrink-0" tabIndex={-1} aria-hidden="true">
        <SiteImage
          src={hit.imageUrl}
          alt=""
          ratio={circular ? "1/1" : "2/3"}
          className={cn("w-16 sm:w-20", circular ? "rounded-full" : "rounded")}
          sizes="80px"
          fallback={<span className="text-sm font-semibold">{initials(hit.display)}</span>}
        />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={searchHitHref(hit)} className="site-focus block">
          <span className="text-base font-semibold hover:underline">{hit.display}</span>
        </Link>
        {meta ? <p className="site-meta site-num line-clamp-2 text-sm capitalize">{meta}</p> : null}
        {rating !== null ? (
          <RatingPill average={rating} voteCount={votes ?? 0} size="sm" className="mt-1.5" />
        ) : null}
      </div>
    </div>
  );
}

/** The compact variant: one line per result, for scanning long lists. */
export function ResultLine({ hit }: { hit: PublicSearchHit }) {
  const year = facetNumber(hit.facets, "year");
  const rating = facetNumber(hit.facets, "rating");
  return (
    <div className="flex items-baseline gap-3 py-2">
      <Link href={searchHitHref(hit)} className="site-focus min-w-0 flex-1">
        <span className="text-sm font-medium hover:underline">{hit.display}</span>
        {year ? <span className="site-meta site-num ml-2 text-xs">{year}</span> : null}
      </Link>
      {rating !== null ? (
        <RatingPill average={rating} showVotes={false} size="sm" />
      ) : null}
    </div>
  );
}

/** The grid variant: poster only, for browsing by artwork. */
export function ResultTile({ hit }: { hit: PublicSearchHit }) {
  const circular = hit.type === "person";
  const year = facetNumber(hit.facets, "year");
  const rating = facetNumber(hit.facets, "rating");

  return (
    <div className="group flex flex-col">
      <Link href={searchHitHref(hit)} className="site-focus block" aria-label={hit.display}>
        <SiteImage
          src={hit.imageUrl}
          alt=""
          ratio={circular ? "1/1" : "2/3"}
          sizes="(max-width: 640px) 40vw, 180px"
          fallback={<span className="text-lg font-semibold">{initials(hit.display)}</span>}
          className={cn(
            "shadow-[var(--site-shadow-poster)] transition-transform duration-200 ease-out",
            "group-hover:-translate-y-0.5 motion-reduce:transform-none",
            circular ? "rounded-full" : "rounded-[var(--site-radius-poster)]",
          )}
        />
      </Link>
      {rating !== null ? (
        <RatingPill average={rating} showVotes={false} size="sm" className="mt-2" />
      ) : null}
      <Link href={searchHitHref(hit)} className="site-focus mt-1 block">
        <span className="line-clamp-2 text-sm font-semibold leading-snug hover:underline">
          {hit.display}
        </span>
      </Link>
      {year ? <p className="site-meta site-num text-xs">{year}</p> : null}
    </div>
  );
}

/** Ranked chart rows share the result-row body but lead with rank and delta. */
export function RankBadge({ rank, delta }: { rank: number; delta: number | null }) {
  return (
    <div className="w-10 shrink-0 text-center">
      <p className="site-num text-lg font-bold">{rank}</p>
      {delta === null ? (
        <p className="site-accent text-[10px] font-bold uppercase">new</p>
      ) : delta === 0 ? (
        <p className="site-meta text-xs" aria-label="No change">
          —
        </p>
      ) : (
        // `delta` is rank − previousRank, so a negative delta means the title
        // climbed. Rendering the sign raw would show "↑ -3", which reads as a
        // fall.
        <p
          className={cn("site-num text-xs font-semibold", delta < 0 ? "text-emerald-500" : "text-red-500")}
          aria-label={delta < 0 ? `Up ${-delta} places` : `Down ${delta} places`}
        >
          {delta < 0 ? "▲" : "▼"} {Math.abs(delta)}
        </p>
      )}
    </div>
  );
}
