"use client";

import { LayoutGrid, List, Rows3 } from "lucide-react";
import type { PublicSearchHit } from "@saas/contracts/search";
import { cn } from "@/lib/cn";
import { VIEW_MODES, type ViewMode } from "@/lib/site-search";
import { ResultLine, ResultRow, ResultTile } from "./result-row";

const ICONS = { detailed: Rows3, grid: LayoutGrid, compact: List } as const;
const LABELS = { detailed: "Detailed view", grid: "Grid view", compact: "Compact view" } as const;

/** Three ways to read the same result set: read it, browse it, or scan it. */
export function ViewModeSwitch({
  mode,
  onChange,
  className,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}) {
  return (
    <div
      className={cn("site-hairline site-surface-2 inline-flex rounded-full border p-0.5", className)}
      role="group"
      aria-label="View mode"
    >
      {VIEW_MODES.map((value) => {
        const Icon = ICONS[value];
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            aria-pressed={mode === value}
            aria-label={LABELS[value]}
            title={LABELS[value]}
            className={cn(
              "site-focus rounded-full p-1.5 transition-colors",
              mode === value ? "site-accent-bg" : "site-meta",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

export function ResultList({ hits, mode }: { hits: PublicSearchHit[]; mode: ViewMode }) {
  if (mode === "grid") {
    return (
      <ul
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
      >
        {hits.map((hit) => (
          <li key={`${hit.type}:${hit.id}`}>
            <ResultTile hit={hit} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="divide-y site-hairline">
      {hits.map((hit) => (
        <li key={`${hit.type}:${hit.id}`}>
          {mode === "compact" ? <ResultLine hit={hit} /> : <ResultRow hit={hit} />}
        </li>
      ))}
    </ul>
  );
}
