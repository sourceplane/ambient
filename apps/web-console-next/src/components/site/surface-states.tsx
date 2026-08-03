"use client";

import { AlertTriangle, SearchX } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The three things a section can be other than "here is the content".
 *
 * They are separate components because they mean different things and deserve
 * different words. A 404 is "this does not exist"; a 5xx is "we could not
 * reach it, try again"; an empty list is "nothing here yet". Collapsing them
 * into one grey box tells the reader nothing about which it is.
 */
export function SurfaceMissing({
  heading,
  body,
  className,
}: {
  heading: string;
  body?: string;
  className?: string;
}) {
  return (
    <div className={cn("site-surface site-hairline rounded-xl border px-6 py-16 text-center", className)}>
      <SearchX className="site-meta mx-auto h-8 w-8" aria-hidden="true" />
      <h1 className="site-h2 mt-3">{heading}</h1>
      {body ? <p className="site-meta mx-auto mt-2 max-w-md text-sm">{body}</p> : null}
    </div>
  );
}

export function SurfaceError({
  onRetry,
  className,
}: {
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("site-surface site-hairline rounded-xl border px-6 py-12 text-center", className)}>
      <AlertTriangle className="site-meta mx-auto h-8 w-8" aria-hidden="true" />
      <h2 className="site-h2 mt-3">We couldn&apos;t load this</h2>
      <p className="site-meta mx-auto mt-2 max-w-md text-sm">
        The catalog service didn&apos;t answer. This is usually temporary.
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="site-accent-bg site-focus mt-4 rounded-full px-4 py-2 text-sm font-semibold"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function SurfaceEmpty({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("site-meta py-8 text-sm", className)}>{children}</p>;
}

/** Matches the shape of a loaded section, so nothing jumps when data lands. */
export function SectionSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("animate-pulse space-y-3 py-8", className)} aria-hidden="true">
      <div className="site-surface-2 h-6 w-48 rounded" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="site-surface-2 h-4 w-full max-w-2xl rounded" />
      ))}
    </div>
  );
}

/**
 * A section wrapper that resolves loading / error / empty in one place, so no
 * page has to spell the same three branches out again.
 */
export function SectionState({
  loading,
  error,
  empty,
  emptyText,
  children,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
  onRetry?: () => void;
}) {
  if (loading) return <SectionSkeleton />;
  if (error) return <SurfaceError {...(onRetry ? { onRetry } : {})} />;
  if (empty) return <SurfaceEmpty>{emptyText}</SurfaceEmpty>;
  return <>{children}</>;
}
