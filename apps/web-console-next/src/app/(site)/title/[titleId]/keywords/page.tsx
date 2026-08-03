"use client";

import { useParams } from "next/navigation";
import { keywordHref } from "@/lib/site-routes";
import { SectionHeader } from "@/components/site/section-header";
import { ChipGroup } from "@/components/site/chip-group";
import { SectionState } from "@/components/site/surface-states";
import { useTitleKeywords } from "@/components/site/use-title-data";

export default function KeywordsPage() {
  const { titleId } = useParams<{ titleId: string }>();
  const keywords = useTitleKeywords(titleId);
  const list = keywords.data?.keywords ?? [];

  return (
    <div>
      <SectionHeader title="Keywords" as="h1" count={list.length} />
      <SectionState
        loading={keywords.isLoading}
        error={keywords.isError}
        empty={list.length === 0}
        emptyText="No keywords have been added for this title yet."
        onRetry={() => void keywords.refetch()}
      >
        <ChipGroup chips={list.map((k) => ({ label: k.name, href: keywordHref(k.slug) }))} />
      </SectionState>
    </div>
  );
}
