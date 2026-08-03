"use client";

import { useParams } from "next/navigation";
import { SectionHeader } from "@/components/site/section-header";
import { MediaGrid } from "@/components/site/media-grid";
import { SectionState } from "@/components/site/surface-states";
import { useTitleImages } from "@/components/site/use-title-data";

export default function MediaIndexPage() {
  const { titleId } = useParams<{ titleId: string }>();
  const images = useTitleImages(titleId, 200);
  const list = images.data?.images ?? [];

  return (
    <div>
      <SectionHeader title="Photos" as="h1" count={list.length} />
      <SectionState
        loading={images.isLoading}
        error={images.isError}
        empty={list.length === 0}
        emptyText="No photos have been added for this title yet."
        onRetry={() => void images.refetch()}
      >
        <MediaGrid images={list} />
      </SectionState>
    </div>
  );
}
