"use client";

import { useParams } from "next/navigation";
import type { FactKind } from "@saas/contracts/community";
import { factLabel } from "@/lib/site-title";
import { FactList } from "./fact-list";
import { SpoilerToggle, useSpoilerPolicy } from "./spoiler-veil";
import { SectionHeader } from "./section-header";
import { SectionState } from "./surface-states";
import { useTitleFacts } from "./use-title-data";

/**
 * `/trivia`, `/goofs` and `/quotes` are the same page with a different filter.
 * One component, three thin routes — the alternative is three files that drift.
 */
export function FactsPage({ kind }: { kind: FactKind }) {
  const { titleId } = useParams<{ titleId: string }>();
  const facts = useTitleFacts(titleId, kind);
  const spoilers = useSpoilerPolicy();
  const list = facts.data?.facts ?? [];

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <SectionHeader title={factLabel(kind)} as="h1" count={list.length} className="mb-0" />
        {list.some((f) => f.hasSpoilers) ? (
          <SpoilerToggle revealAll={spoilers.revealAll} onToggle={spoilers.toggle} />
        ) : null}
      </div>
      <div className="mt-4">
        <SectionState
          loading={facts.isLoading}
          error={facts.isError}
          empty={list.length === 0}
          emptyText={`No ${factLabel(kind).toLowerCase()} have been added for this title yet.`}
          onRetry={() => void facts.refetch()}
        >
          <FactList facts={list} revealAll={spoilers.revealAll} />
        </SectionState>
      </div>
    </section>
  );
}
