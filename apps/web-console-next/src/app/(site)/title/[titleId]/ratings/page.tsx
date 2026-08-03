"use client";

import { useParams } from "next/navigation";
import { formatRating, formatVotes } from "@/lib/site-format";
import { SectionHeader } from "@/components/site/section-header";
import { DemographicTable, RatingHistogram } from "@/components/site/rating-histogram";
import { YourRating } from "@/components/site/title-actions";
import { SectionState } from "@/components/site/surface-states";
import { useTitleDemographics, useTitleRating } from "@/components/site/use-title-data";

export default function RatingsPage() {
  const { titleId } = useParams<{ titleId: string }>();
  const rating = useTitleRating(titleId);
  const demographics = useTitleDemographics(titleId);
  const summary = rating.data?.rating;

  return (
    <div className="space-y-10">
      <SectionHeader title="Ratings" as="h1" />

      <SectionState
        loading={rating.isLoading}
        error={rating.isError}
        empty={!summary || summary.voteCount === 0}
        emptyText="Nobody has rated this title yet. Yours would be the first."
        onRetry={() => void rating.refetch()}
      >
        <div className="grid gap-8 sm:grid-cols-[220px_1fr]">
          <div>
            <p className="site-num text-5xl font-extrabold">
              {formatRating(summary?.average)}
              <span className="site-meta text-2xl font-normal">/10</span>
            </p>
            <p className="site-meta site-num text-sm">
              {formatVotes(summary?.voteCount ?? 0)} votes
            </p>
            <YourRating titleId={titleId} className="mt-6" />
          </div>
          <RatingHistogram distribution={summary?.distribution ?? []} />
        </div>
      </SectionState>

      {demographics.data && demographics.data.demographics.length > 0 ? (
        <section>
          <SectionHeader title="Ratings by demographic" as="h2" />
          <DemographicTable
            cells={demographics.data.demographics}
            privacyFloor={demographics.data.privacyFloor}
          />
        </section>
      ) : null}
    </div>
  );
}
