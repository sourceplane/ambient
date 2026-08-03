"use client";

import { useParams } from "next/navigation";
import { parentsGuideLabel, severityFraction, SEVERITY_LABELS } from "@/lib/site-title";
import { SectionHeader } from "@/components/site/section-header";
import { SpoilerToggle, SpoilerVeil, useSpoilerPolicy } from "@/components/site/spoiler-veil";
import { SectionState } from "@/components/site/surface-states";
import { useParentsGuide } from "@/components/site/use-title-data";

/**
 * The parents guide.
 *
 * Severity is a community vote, and the page says so: the bar shows the modal
 * severity, the caption shows how many people voted. A single unlabelled bar
 * would read as an official rating, which it is not.
 */
export default function ParentalGuidePage() {
  const { titleId } = useParams<{ titleId: string }>();
  const guide = useParentsGuide(titleId);
  const spoilers = useSpoilerPolicy();

  const entries = guide.data?.entries ?? [];
  const tallies = guide.data?.severity ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <SectionHeader title="Parents guide" as="h1" className="mb-0" />
        {entries.some((e) => e.hasSpoilers) ? (
          <SpoilerToggle revealAll={spoilers.revealAll} onToggle={spoilers.toggle} />
        ) : null}
      </div>

      <SectionState
        loading={guide.isLoading}
        error={guide.isError}
        empty={entries.length === 0 && tallies.length === 0}
        emptyText="No parents guide has been contributed for this title yet."
        onRetry={() => void guide.refetch()}
      >
        {tallies.map((tally) => {
          const fill = severityFraction(tally.severity);
          const items = entries.filter((entry) => entry.category === tally.category);
          return (
            <section key={tally.category} className="site-hairline border-b pb-6 last:border-0">
              <h2 className="site-h2 mb-2">{parentsGuideLabel(tally.category)}</h2>
              <div className="flex items-center gap-3">
                <span className="site-surface-2 h-2 max-w-xs flex-1 overflow-hidden rounded-full">
                  {fill !== null ? (
                    <span
                      className="site-accent-bg block h-full rounded-full"
                      style={{ width: `${fill * 100}%` }}
                    />
                  ) : null}
                </span>
                <span className="text-sm font-semibold">
                  {tally.severity ? SEVERITY_LABELS[tally.severity] : "No consensus"}
                </span>
                <span className="site-meta site-num text-xs">
                  {tally.totalVotes} {tally.totalVotes === 1 ? "vote" : "votes"}
                </span>
              </div>
              {items.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {items.map((entry) => (
                    <li key={entry.id}>
                      <SpoilerVeil revealed={spoilers.revealAll || !entry.hasSpoilers}>
                        <p className="text-sm leading-relaxed">{entry.body}</p>
                      </SpoilerVeil>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
      </SectionState>
    </div>
  );
}
