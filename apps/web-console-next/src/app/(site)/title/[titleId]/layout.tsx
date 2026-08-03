"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { isNotFound } from "@/lib/catalog-api";
import { TitleHero } from "@/components/site/title-hero";
import { TitleTabs } from "@/components/site/title-tabs";
import { SectionSkeleton, SurfaceError, SurfaceMissing } from "@/components/site/surface-states";
import {
  useTitle,
  useTitleCertificates,
  useTitleImages,
  useTitleRating,
} from "@/components/site/use-title-data";

/**
 * Everything under `/title/:id` shares the hero and the tab bar.
 *
 * Putting them in a layout means moving between Overview, Reviews and Quotes
 * re-renders only the section below — the hero does not flash, and the title
 * and rating queries are already warm in the cache.
 */
export default function TitleLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ titleId: string }>();
  const titleId = params.titleId;

  const title = useTitle(titleId);
  const rating = useTitleRating(titleId);
  const certificates = useTitleCertificates(titleId);
  // A backdrop is a nice-to-have; the hero renders without one rather than
  // waiting for the image list to arrive.
  const images = useTitleImages(titleId, 12);

  if (title.isLoading) return <SectionSkeleton />;

  if (title.isError) {
    return isNotFound(title.error) ? (
      <SurfaceMissing
        heading="We don't have that title"
        body="The link may be wrong, or the record may not be published."
      />
    ) : (
      <SurfaceError onRetry={() => void title.refetch()} />
    );
  }

  const record = title.data!.title;
  const backdrop = images.data?.images.find((i) => i.kind === "backdrop")?.url ?? null;

  return (
    <div className="pb-8">
      <TitleHero
        title={record}
        rating={rating.data?.rating ?? null}
        certificates={certificates.data?.certificates ?? []}
        backdropUrl={backdrop}
      />
      <TitleTabs titleId={titleId} kind={record.kind} className="mb-6" />
      {children}
    </div>
  );
}
