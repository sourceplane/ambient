"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import type { PublicImage, PublicVideo } from "@saas/contracts/catalog";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/site-format";
import { SiteImage } from "./site-image";

/**
 * A grid of stills that opens into a lightbox.
 *
 * The grid is `auto-fill` so it reflows rather than snapping between
 * breakpoints, and every tile is a real button — the lightbox is reachable by
 * keyboard, and arrow keys move through it once open.
 */
export function MediaGrid({ images, className }: { images: PublicImage[]; className?: string }) {
  const [open, setOpen] = React.useState<number | null>(null);
  if (images.length === 0) return null;

  return (
    <>
      <ul
        className={cn("grid gap-2", className)}
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
      >
        {images.map((image, index) => (
          <li key={image.id}>
            <button
              type="button"
              onClick={() => setOpen(index)}
              className="site-focus block w-full"
              aria-label={image.caption ?? `Open image ${index + 1} of ${images.length}`}
            >
              <SiteImage
                src={image.url}
                alt={image.caption ?? ""}
                ratio="3/2"
                className="rounded transition-transform duration-200 ease-out hover:-translate-y-0.5 motion-reduce:transform-none"
                sizes="200px"
              />
            </button>
          </li>
        ))}
      </ul>

      {open !== null ? (
        <Lightbox images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}

function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: PublicImage[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const image = images[index];

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onIndex((index + 1) % images.length);
      if (event.key === "ArrowLeft") onIndex((index - 1 + images.length) % images.length);
    }
    document.addEventListener("keydown", onKey);
    // A lightbox that lets the page scroll behind it loses the reader's place.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [index, images.length, onIndex, onClose]);

  if (!image) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={image.caption ?? "Image viewer"}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="site-focus absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white"
      >
        <X className="h-5 w-5" />
      </button>

      {images.length > 1 ? (
        <>
          <LightboxArrow
            side="left"
            label="Previous image"
            onClick={() => onIndex((index - 1 + images.length) % images.length)}
          />
          <LightboxArrow
            side="right"
            label="Next image"
            onClick={() => onIndex((index + 1) % images.length)}
          />
        </>
      ) : null}

      <figure className="max-h-full max-w-5xl">
        <img
          src={image.url}
          alt={image.caption ?? ""}
          className="mx-auto max-h-[80vh] w-auto object-contain"
        />
        <figcaption className="mt-3 text-center text-sm text-white/80">
          {image.caption}
          {image.credit ? <span className="ml-2 text-white/50">© {image.credit}</span> : null}
          <span className="site-num ml-3 text-white/50">
            {index + 1} / {images.length}
          </span>
        </figcaption>
      </figure>
    </div>
  );
}

function LightboxArrow({
  side,
  label,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "site-focus absolute top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white",
        side === "left" ? "left-2 sm:left-6" : "right-2 sm:right-6",
      )}
    >
      <Icon className="h-6 w-6" />
    </button>
  );
}

/**
 * A video thumbnail. Links out rather than embedding a player: the video URL is
 * a third-party host, and an iframe would put that host's scripts on every
 * title page.
 */
export function VideoCard({ video, className }: { video: PublicVideo; className?: string }) {
  const duration = formatDuration(video.runtimeSeconds);
  return (
    <a
      href={video.url}
      target="_blank"
      rel="noreferrer noopener"
      className={cn("site-focus group block", className)}
    >
      <div className="relative">
        <SiteImage
          src={video.thumbnailUrl}
          alt=""
          ratio="16/9"
          className="rounded"
          sizes="320px"
          fallback={<Play className="h-8 w-8 opacity-40" aria-hidden="true" />}
        />
        <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
          <span className="rounded-full bg-black/60 p-3 backdrop-blur-sm transition-transform group-hover:scale-110 motion-reduce:transform-none">
            <Play className="h-5 w-5 fill-white text-white" />
          </span>
        </span>
        {duration ? (
          <span className="site-num absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {duration}
          </span>
        ) : null}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium group-hover:underline">{video.name}</p>
      <p className="site-meta text-xs capitalize">{video.kind.replace(/_/g, " ")}</p>
    </a>
  );
}
