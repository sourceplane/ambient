"use client";

import { useParams } from "next/navigation";
import { groupByDepartment } from "@/lib/site-credits";
import { SectionHeader } from "@/components/site/section-header";
import { TitleCreditRow } from "@/components/site/credit-row";
import { SectionState } from "@/components/site/surface-states";
import { useTitleCredits } from "@/components/site/use-title-data";

/**
 * Every credit, grouped by department in production order.
 *
 * No "show more" — this page exists precisely because someone wants the whole
 * list, and paginating it would defeat the reason they navigated here.
 */
export default function FullCreditsPage() {
  const { titleId } = useParams<{ titleId: string }>();
  const credits = useTitleCredits(titleId, { limit: 500 });
  const groups = groupByDepartment(credits.data?.credits ?? []);

  return (
    <div className="space-y-10">
      <SectionHeader title="Full cast & crew" as="h1" count={credits.data?.credits.length} />
      <SectionState
        loading={credits.isLoading}
        error={credits.isError}
        empty={groups.length === 0}
        emptyText="No credits have been added for this title yet."
        onRetry={() => void credits.refetch()}
      >
        {groups.map((group) => (
          <section key={group.department}>
            <h2 className="site-h2 mb-3">
              {group.label}
              <span className="site-meta site-num ml-2 text-sm font-normal">
                {group.credits.length}
              </span>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.credits.map((credit) => (
                <TitleCreditRow key={credit.id} credit={credit} />
              ))}
            </div>
          </section>
        ))}
      </SectionState>
    </div>
  );
}
