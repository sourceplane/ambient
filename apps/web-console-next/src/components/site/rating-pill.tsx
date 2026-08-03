"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatRating, formatVotes } from "@/lib/site-format";

/**
 * A rating, shown the way a film site shows one: a star, the score, and the
 * vote count as the thing that says whether the score means anything.
 *
 * An unrated title renders the star hollow rather than showing `0.0` — a
 * missing rating and a rating of zero are different facts.
 */
export function RatingPill({
  average,
  voteCount,
  size = "md",
  showVotes = true,
  className,
}: {
  average: number | null | undefined;
  voteCount?: number | null;
  size?: "sm" | "md" | "lg";
  showVotes?: boolean;
  className?: string;
}) {
  const rated = average !== null && average !== undefined;
  const label = rated
    ? `Rated ${formatRating(average)} out of 10${voteCount ? ` from ${voteCount} votes` : ""}`
    : "Not yet rated";

  return (
    <span
      className={cn("inline-flex items-center gap-1 site-num", SIZES[size].wrap, className)}
      title={label}
      aria-label={label}
    >
      <Star
        className={cn(SIZES[size].icon, rated ? "site-rating fill-current" : "site-meta")}
        aria-hidden="true"
      />
      <span className={cn("font-semibold", rated ? "" : "site-meta")}>{formatRating(average)}</span>
      {showVotes && rated && voteCount ? (
        <span className="site-meta font-normal">{formatVotes(voteCount)}</span>
      ) : null}
    </span>
  );
}

const SIZES = {
  sm: { wrap: "text-xs", icon: "h-3 w-3" },
  md: { wrap: "text-sm", icon: "h-3.5 w-3.5" },
  lg: { wrap: "text-lg", icon: "h-5 w-5" },
} as const;

/**
 * The interactive 1–10 picker.
 *
 * Implemented as a radiogroup rather than ten buttons: arrow keys move through
 * the scale, which is how someone rating a film with a keyboard expects it to
 * behave, and screen readers announce "3 of 10" instead of ten unrelated
 * controls. Hover previews the value; leaving restores the committed one.
 */
export function RatingStars({
  value,
  onRate,
  disabled = false,
  className,
}: {
  value: number | null;
  onRate: (value: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [preview, setPreview] = React.useState<number | null>(null);
  const shown = preview ?? value ?? 0;

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const current = value ?? 0;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = Math.min(10, current + 1);
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = Math.max(1, current - 1);
    if (event.key === "Home") next = 1;
    if (event.key === "End") next = 10;
    if (next === null) return;
    event.preventDefault();
    onRate(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Your rating, 1 to 10"
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={disabled ? undefined : onKeyDown}
      onMouseLeave={() => setPreview(null)}
      className={cn("site-focus inline-flex items-center gap-0.5", disabled && "opacity-50", className)}
    >
      {Array.from({ length: 10 }, (_, i) => i + 1).map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} out of 10`}
          disabled={disabled}
          tabIndex={-1}
          onMouseEnter={() => setPreview(star)}
          onFocus={() => setPreview(star)}
          onClick={() => onRate(star)}
          className="rounded p-0.5 transition-transform hover:scale-110 motion-reduce:transform-none"
        >
          <Star
            className={cn("h-5 w-5", star <= shown ? "site-rating fill-current" : "site-meta")}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  );
}
