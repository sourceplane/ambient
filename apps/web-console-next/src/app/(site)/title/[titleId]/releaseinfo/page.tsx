"use client";

import { useParams } from "next/navigation";
import { formatDate } from "@/lib/site-format";
import { SectionHeader } from "@/components/site/section-header";
import { SectionState } from "@/components/site/surface-states";
import { useTitleCertificates, useTitleReleaseDates } from "@/components/site/use-title-data";

export default function ReleaseInfoPage() {
  const { titleId } = useParams<{ titleId: string }>();
  const releases = useTitleReleaseDates(titleId);
  const certificates = useTitleCertificates(titleId);

  const dates = releases.data?.releaseDates ?? [];
  const certs = certificates.data?.certificates ?? [];

  return (
    <div className="space-y-10">
      <section>
        <SectionHeader title="Release dates" as="h1" count={dates.length} />
        <SectionState
          loading={releases.isLoading}
          error={releases.isError}
          empty={dates.length === 0}
          emptyText="No release dates have been recorded for this title yet."
          onRetry={() => void releases.refetch()}
        >
          <ul className="divide-y site-hairline">
            {dates.map((date, index) => (
              <li key={`${date.country}-${date.releasedOn}-${index}`} className="flex justify-between gap-4 py-2.5 text-sm">
                <span className="font-medium">{date.country}</span>
                <span className="site-num site-meta text-right">
                  {formatDate(date.releasedOn)}
                  <span className="ml-2 capitalize">{date.kind.replace(/_/g, " ")}</span>
                </span>
              </li>
            ))}
          </ul>
        </SectionState>
      </section>

      {certs.length > 0 ? (
        <section>
          <SectionHeader title="Certificates" as="h2" count={certs.length} />
          <ul className="divide-y site-hairline">
            {certs.map((certificate, index) => (
              <li key={`${certificate.country}-${index}`} className="flex justify-between gap-4 py-2.5 text-sm">
                <span className="font-medium">{certificate.country}</span>
                <span className="site-meta">
                  {certificate.rating}
                  {certificate.attributes.length > 0
                    ? ` (${certificate.attributes.join(", ")})`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
