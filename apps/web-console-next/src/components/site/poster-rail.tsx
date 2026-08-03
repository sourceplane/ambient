"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { SectionHeader } from "./section-header";

/**
 * A horizontally scrolling shelf.
 *
 * Built on native overflow scrolling with CSS snap points rather than a
 * carousel library: it keeps momentum scrolling on touch, keeps the content in
 * the accessibility tree and in find-in-page, and degrades to a plain scroller
 * with no JavaScript. The arrows are an addition for pointer users, not the
 * mechanism.
 *
 * The arrows hide when there is nothing to scroll to — a control that does
 * nothing is worse than no control.
 */
export function PosterRail({
  title,
  href,
  children,
  className,
}: {
  title?: string;
  href?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ start: false, end: false });

  const measure = React.useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ start: el.scrollLeft > 8, end: el.scrollLeft < max - 8 });
  }, []);

  React.useEffect(() => {
    measure();
    const el = scroller.current;
    if (!el) return;
    // Content arrives after the first paint (data fetch, images), so re-measure
    // on resize rather than trusting the initial width.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, children]);

  function nudge(direction: -1 | 1) {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.round(el.clientWidth * 0.8), behavior: "smooth" });
  }

  return (
    <section className={cn("relative", className)}>
      {title ? <SectionHeader title={title} {...(href ? { href } : {})} /> : null}

      <div className="relative">
        <div
          ref={scroller}
          onScroll={measure}
          className="site-rail -mx-1 flex gap-3 overflow-x-auto px-1 pb-2 sm:gap-4"
        >
          {children}
        </div>

        <RailArrow side="start" visible={edges.start} onClick={() => nudge(-1)} />
        <RailArrow side="end" visible={edges.end} onClick={() => nudge(1)} />
      </div>
    </section>
  );
}

function RailArrow({
  side,
  visible,
  onClick,
}: {
  side: "start" | "end";
  visible: boolean;
  onClick: () => void;
}) {
  if (!visible) return null;
  const Icon = side === "start" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      // The rail is reachable by keyboard through its own scrolling; these are
      // a pointer affordance, so they stay out of the tab order.
      tabIndex={-1}
      aria-hidden="true"
      className={cn(
        "absolute top-1/2 hidden -translate-y-1/2 rounded-full p-2 shadow-lg backdrop-blur-sm md:block",
        "bg-black/60 text-white transition-colors hover:bg-black/80",
        side === "start" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2",
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

/** A rail item at the standard poster width. */
export function RailItem({
  children,
  width = "poster",
}: {
  children: React.ReactNode;
  width?: "poster" | "person" | "wide";
}) {
  return <div className={cn("shrink-0", WIDTHS[width])}>{children}</div>;
}

const WIDTHS = {
  poster: "w-[128px] sm:w-[150px] lg:w-[170px]",
  person: "w-[104px] sm:w-[120px] lg:w-[132px]",
  wide: "w-[240px] sm:w-[280px] lg:w-[320px]",
} as const;
