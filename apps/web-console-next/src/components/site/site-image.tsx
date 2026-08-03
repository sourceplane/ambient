"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * An image inside a fixed aspect box.
 *
 * `next/image` is not used anywhere in this app — the Cloudflare Workers
 * adapter has no image optimizer behind it, so it would only add a loader that
 * proxies to the same URL. What actually matters for layout stability is that
 * the box reserves its space before the bytes arrive, which an
 * `aspect-ratio` wrapper does directly.
 *
 * Every image on this surface is remote and may be missing; `onError` swaps to
 * the fallback rather than leaving a broken-image glyph in a poster grid.
 */
export function SiteImage({
  src,
  alt,
  ratio,
  className,
  imgClassName,
  fallback,
  priority = false,
  sizes,
}: {
  src: string | null | undefined;
  alt: string;
  /** Width / height, e.g. `2/3` for a poster. */
  ratio: string;
  className?: string;
  imgClassName?: string;
  fallback?: React.ReactNode;
  priority?: boolean;
  sizes?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  const showImage = Boolean(src) && !failed;

  // A new src is a new image: clear the previous failure or the component
  // would stay stuck on the fallback after a rail re-renders with new data.
  React.useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <div
      className={cn("relative overflow-hidden site-surface-2", className)}
      style={{ aspectRatio: ratio }}
    >
      {showImage ? (
        <img
          src={src!}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          fetchPriority={priority ? "high" : "auto"}
          sizes={sizes}
          onError={() => setFailed(true)}
          className={cn("h-full w-full object-cover", imgClassName)}
        />
      ) : (
        <div
          className="grid h-full w-full place-items-center site-meta"
          aria-hidden="true"
        >
          {fallback ?? <PosterGlyph />}
        </div>
      )}
    </div>
  );
}

function PosterGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 opacity-40" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="m5 16 4-5 3 3.5L15 11l4 5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="9" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
