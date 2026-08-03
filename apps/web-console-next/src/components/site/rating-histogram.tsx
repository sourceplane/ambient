"use client";

import type { PublicDemographicCell, RatingBucket } from "@saas/contracts/ratings";
import { cn } from "@/lib/cn";
import { formatRating, formatVotes } from "@/lib/site-format";

/**
 * The 1–10 distribution.
 *
 * Drawn as a list of proportional bars rather than a chart library: it is ten
 * numbers, it must be readable by a screen reader, and it must not cost a
 * charting dependency on a page that already fetches from six services.
 *
 * `share` is precomputed by the API, so this does no division — the bar length
 * and the percentage always agree because they come from the same number.
 */
export function RatingHistogram({
  distribution,
  className,
}: {
  distribution: RatingBucket[];
  className?: string;
}) {
  const buckets = fillBuckets(distribution);
  const peak = Math.max(...buckets.map((b) => b.share), 0);
  if (peak <= 0) return null;

  return (
    <table className={cn("w-full", className)}>
      <caption className="sr-only">Rating distribution, 1 to 10</caption>
      <tbody>
        {buckets
          .slice()
          .reverse()
          .map((bucket) => (
            <tr key={bucket.value}>
              <th scope="row" className="site-num w-6 py-0.5 text-right text-xs font-normal site-meta">
                {bucket.value}
              </th>
              <td className="px-2 py-0.5">
                <div className="site-surface-2 h-3 w-full overflow-hidden rounded-sm">
                  <div
                    className="site-accent-bg h-full rounded-sm"
                    // Scaled against the tallest bucket, not against 100% — a
                    // distribution where every bar is a sliver tells you nothing.
                    style={{ width: `${peak > 0 ? (bucket.share / peak) * 100 : 0}%` }}
                  />
                </div>
              </td>
              <td className="site-num w-16 py-0.5 text-right text-xs site-meta">
                {formatVotes(bucket.count)}
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

/** The API omits buckets nobody voted for; the chart still needs all ten rows. */
function fillBuckets(distribution: RatingBucket[]): RatingBucket[] {
  const byValue = new Map(distribution.map((b) => [b.value, b]));
  return Array.from({ length: 10 }, (_, i) => i + 1).map(
    (value) => byValue.get(value) ?? { value, count: 0, share: 0 },
  );
}

const AGE_LABELS: Record<string, string> = {
  under_18: "Under 18",
  "18_29": "18–29",
  "30_44": "30–44",
  "45_plus": "45+",
  undisclosed: "Not disclosed",
};

const GENDER_LABELS: Record<string, string> = {
  male: "Men",
  female: "Women",
  other: "Other",
  undisclosed: "Not disclosed",
};

/**
 * Ratings by age and gender.
 *
 * Cells below the API's privacy floor are *absent*, not zero — so this renders
 * only what arrived and says how small a group had to be to be withheld. Filling
 * the gaps with zeros would invent data and quietly defeat the floor.
 */
export function DemographicTable({
  cells,
  privacyFloor,
  className,
}: {
  cells: PublicDemographicCell[];
  privacyFloor: number;
  className?: string;
}) {
  if (cells.length === 0) return null;

  const ages = [...new Set(cells.map((c) => c.ageBand))];
  const genders = [...new Set(cells.map((c) => c.genderBand))];
  const byKey = new Map(cells.map((c) => [`${c.ageBand}:${c.genderBand}`, c]));

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[420px] text-sm">
        <caption className="site-meta mb-2 text-left text-xs">
          Groups with fewer than {privacyFloor} votes are not shown.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="site-meta py-1 text-left text-xs font-normal">
              Age
            </th>
            {genders.map((gender) => (
              <th key={gender} scope="col" className="site-meta py-1 text-right text-xs font-normal">
                {GENDER_LABELS[gender] ?? gender}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ages.map((age) => (
            <tr key={age} className="site-hairline border-t">
              <th scope="row" className="py-1.5 text-left font-normal">
                {AGE_LABELS[age] ?? age}
              </th>
              {genders.map((gender) => {
                const cell = byKey.get(`${age}:${gender}`);
                return (
                  <td key={gender} className="site-num py-1.5 text-right">
                    {cell ? (
                      <>
                        <span className="font-semibold">{formatRating(cell.average)}</span>
                        <span className="site-meta ml-1 text-xs">{formatVotes(cell.voteCount)}</span>
                      </>
                    ) : (
                      <span className="site-meta">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
