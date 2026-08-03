"use client";

import * as React from "react";
import { EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { STORAGE_PREFIX } from "@/lib/app-config";

const REVEAL_KEY = `${STORAGE_PREFIX}.site.spoilers-revealed`;

/**
 * "Show spoilers" is remembered for the session, not forever.
 *
 * sessionStorage is the right store: someone who opens spoilers for one film
 * has decided about *this* visit. Persisting it to localStorage would silently
 * spoil the next title they open next week.
 */
function readRevealAll(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(REVEAL_KEY) === "true";
  } catch {
    return false;
  }
}

export function useSpoilerPolicy() {
  const [revealAll, setRevealAll] = React.useState(false);

  React.useEffect(() => setRevealAll(readRevealAll()), []);

  const toggle = React.useCallback(() => {
    setRevealAll((current) => {
      const next = !current;
      try {
        window.sessionStorage.setItem(REVEAL_KEY, String(next));
      } catch {
        // A browser refusing storage still gets a working toggle, just not a
        // remembered one.
      }
      return next;
    });
  }, []);

  return { revealAll, toggle };
}

/**
 * Content hidden behind a deliberate action.
 *
 * The veil is a `<button>` wrapping blurred content rather than a swap between
 * placeholder and text: the block keeps its real height, so revealing a spoiler
 * never shifts the rest of the page. The text is `aria-hidden` while veiled so
 * a screen reader doesn't read out the very thing the veil exists to hide.
 */
export function SpoilerVeil({
  children,
  revealed: forced,
  className,
}: {
  children: React.ReactNode;
  /** Force-revealed by the page-level "show spoilers" toggle. */
  revealed?: boolean;
  className?: string;
}) {
  const [revealed, setRevealed] = React.useState(false);
  const shown = revealed || Boolean(forced);

  if (shown) return <div className={className}>{children}</div>;

  return (
    <button
      type="button"
      onClick={() => setRevealed(true)}
      aria-label="Reveal spoiler"
      className={cn("site-focus relative block w-full text-left", className)}
    >
      <div className="select-none blur-sm" aria-hidden="true">
        {children}
      </div>
      <span className="absolute inset-0 grid place-items-center">
        <span className="site-surface-2 site-hairline inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold">
          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
          Spoiler — click to reveal
        </span>
      </span>
    </button>
  );
}

/** The page-level control that reveals every veil at once. */
export function SpoilerToggle({
  revealAll,
  onToggle,
  className,
}: {
  revealAll: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={revealAll}
      className={cn(
        "site-focus site-hairline site-surface-2 rounded-full border px-3 py-1 text-xs font-medium",
        className,
      )}
    >
      {revealAll ? "Hide spoilers" : "Show spoilers"}
    </button>
  );
}
