"use client";

import { cn } from "@/lib/cn";
import { PROFESSION_OPTIONS } from "@/lib/studio";

/**
 * Professions are a free-form string array in the API, but an operator typing
 * them by hand produces `Actor`, `actor` and `acting` in the same catalog.
 * Offering the known set as toggles keeps them consistent without preventing
 * anything — the field still accepts whatever the API accepts.
 */
export function ProfessionPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">Professions</legend>
      <div className="flex flex-wrap gap-1.5">
        {PROFESSION_OPTIONS.map((profession) => {
          const active = selected.includes(profession);
          return (
            <button
              key={profession}
              type="button"
              aria-pressed={active}
              onClick={() =>
                onChange(active ? selected.filter((p) => p !== profession) : [...selected, profession])
              }
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                active ? "border-transparent bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {profession.replace(/_/g, " ")}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
