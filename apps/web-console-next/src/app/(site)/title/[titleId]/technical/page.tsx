"use client";

import { useParams } from "next/navigation";
import { SectionHeader } from "@/components/site/section-header";
import { DetailList, detailRow } from "@/components/site/detail-list";
import { SectionState } from "@/components/site/surface-states";
import { useTitleTechnical } from "@/components/site/use-title-data";

export default function TechnicalPage() {
  const { titleId } = useParams<{ titleId: string }>();
  const technical = useTitleTechnical(titleId);
  const data = technical.data;

  const specs = data?.technicalSpecs ?? [];
  const rows = [
    ...specs.map((spec) => ({
      label: spec.spec.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      value: spec.note ? `${spec.value} (${spec.note})` : spec.value,
    })),
    ...detailRow("Countries of origin", data?.countries.join(", ")),
    ...detailRow("Languages", data?.languages.join(", ")),
    ...detailRow(
      "Filming locations",
      data?.filmingLocations
        .map((l) => (l.note ? `${l.location} (${l.note})` : l.location))
        .join(" · "),
    ),
  ];

  return (
    <div>
      <SectionHeader title="Technical specs" as="h1" />
      <SectionState
        loading={technical.isLoading}
        error={technical.isError}
        empty={rows.length === 0}
        emptyText="No technical specifications have been recorded for this title yet."
        onRetry={() => void technical.refetch()}
      >
        <DetailList rows={rows} />
      </SectionState>
    </div>
  );
}
