"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export interface DetailRow {
  label: string;
  value: React.ReactNode;
}

/**
 * The label/value blocks that make up "Details", "Box office" and "Technical
 * specs".
 *
 * A real `<dl>`, so the association between a label and its value survives into
 * the accessibility tree instead of being a visual coincidence. Rows with
 * nothing in them are dropped by the caller via `detailRow`, so an absent fact
 * leaves no empty line.
 */
export function DetailList({ rows, className }: { rows: DetailRow[]; className?: string }) {
  if (rows.length === 0) return null;
  return (
    <dl className={cn("divide-y site-hairline", className)}>
      {rows.map((row, index) => (
        <div key={`${row.label}-${index}`} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
          <dt className="site-meta text-sm font-medium">{row.label}</dt>
          <dd className="text-sm">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Build a row only when there is something to say. Returns an array so callers
 * can spread it — `...detailRow("Budget", budget)` reads better than a filter
 * over a list of possibly-null rows.
 */
export function detailRow(label: string, value: React.ReactNode): DetailRow[] {
  if (value === null || value === undefined || value === "" || value === false) return [];
  if (Array.isArray(value) && value.length === 0) return [];
  return [{ label, value }];
}
