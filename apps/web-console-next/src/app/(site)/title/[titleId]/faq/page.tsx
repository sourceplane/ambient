"use client";

import { useParams } from "next/navigation";
import { SectionHeader } from "@/components/site/section-header";
import { SpoilerToggle, SpoilerVeil, useSpoilerPolicy } from "@/components/site/spoiler-veil";
import { SectionState } from "@/components/site/surface-states";
import { useTitleFaq } from "@/components/site/use-title-data";

export default function FaqPage() {
  const { titleId } = useParams<{ titleId: string }>();
  const faq = useTitleFaq(titleId);
  const spoilers = useSpoilerPolicy();
  const entries = faq.data?.faq ?? [];

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <SectionHeader title="Frequently asked questions" as="h1" count={entries.length} className="mb-0" />
        {entries.some((e) => e.hasSpoilers) ? (
          <SpoilerToggle revealAll={spoilers.revealAll} onToggle={spoilers.toggle} />
        ) : null}
      </div>

      <div className="mt-4">
        <SectionState
          loading={faq.isLoading}
          error={faq.isError}
          empty={entries.length === 0}
          emptyText="No questions have been answered for this title yet."
          onRetry={() => void faq.refetch()}
        >
          <dl className="divide-y site-hairline">
            {entries.map((entry) => (
              <div key={entry.id} className="py-4">
                <dt className="text-sm font-semibold">{entry.question}</dt>
                <dd className="mt-1.5">
                  {/* The answer is what spoils, not the question — veiling the
                      question too would hide what the reader is choosing. */}
                  <SpoilerVeil revealed={spoilers.revealAll || !entry.hasSpoilers}>
                    <p className="text-sm leading-relaxed">{entry.answer}</p>
                  </SpoilerVeil>
                </dd>
              </div>
            ))}
          </dl>
        </SectionState>
      </div>
    </div>
  );
}
