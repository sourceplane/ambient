"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The heading above a rail or a grid.
 *
 * The accent bar on the left is the one piece of decoration on this surface;
 * it exists because a page of eight rails needs a visual anchor that reads
 * faster than the words do.
 */
export function SectionHeader({
  title,
  href,
  seeAllLabel = "See all",
  count,
  as: Heading = "h2",
  className,
}: {
  title: string;
  href?: string;
  seeAllLabel?: string;
  count?: number;
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-baseline justify-between gap-4", className)}>
      <Heading className="site-h2 flex items-center gap-2">
        <span
          className="site-accent-bg inline-block h-5 w-1 rounded-full sm:h-6"
          aria-hidden="true"
        />
        {title}
        {count !== undefined ? (
          <span className="site-meta site-num text-sm font-normal">{count}</span>
        ) : null}
      </Heading>
      {href ? (
        <Link
          href={href}
          className="site-focus site-meta inline-flex shrink-0 items-center gap-0.5 text-sm hover:site-accent hover:underline"
        >
          {seeAllLabel}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
