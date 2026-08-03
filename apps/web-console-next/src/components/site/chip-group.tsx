"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

export interface Chip {
  label: string;
  href: string;
}

/**
 * Genres, keywords, professions — anything that is a link to "more like this".
 *
 * Chips are links, not buttons: they navigate, so they should be openable in a
 * new tab and visible to a crawler.
 */
export function ChipGroup({
  chips,
  size = "md",
  className,
}: {
  chips: Chip[];
  size?: "sm" | "md";
  className?: string;
}) {
  if (chips.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      {chips.map((chip) => (
        <li key={chip.href + chip.label}>
          <Link
            href={chip.href}
            className={cn(
              "site-focus site-surface-2 site-hairline inline-block rounded-full border font-medium transition-colors",
              "hover:site-accent",
              size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm",
            )}
          >
            {chip.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
