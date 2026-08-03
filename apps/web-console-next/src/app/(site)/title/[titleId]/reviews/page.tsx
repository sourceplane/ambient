"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate, formatVotes } from "@/lib/site-format";
import { metascoreClass } from "@/lib/site-title";
import { SectionHeader } from "@/components/site/section-header";
import { SpoilerToggle, SpoilerVeil, useSpoilerPolicy } from "@/components/site/spoiler-veil";
import { SectionState } from "@/components/site/surface-states";
import {
  useTitleCriticReviews,
  useTitleMetascore,
  useTitleReviews,
} from "@/components/site/use-title-data";

const SORTS = [
  { key: "helpfulness", label: "Most helpful" },
  { key: "date", label: "Newest" },
  { key: "rating", label: "Highest rated" },
] as const;

export default function ReviewsPage() {
  const { titleId } = useParams<{ titleId: string }>();
  const [sort, setSort] = React.useState<string>("helpfulness");
  const spoilers = useSpoilerPolicy();

  // The API's `spoilers` parameter decides what is *sent*; the veil decides
  // what is *shown*. Asking for `hide` would remove reviews entirely, which is
  // not what a reader who wants them blurred is asking for.
  const reviews = useTitleReviews(titleId, { sort, limit: 50 });
  const metascore = useTitleMetascore(titleId);
  const critics = useTitleCriticReviews(titleId);

  const list = reviews.data?.reviews ?? [];
  const meta = metascore.data?.metascore;
  const criticList = critics.data?.criticReviews ?? [];

  return (
    <div className="space-y-10">
      {meta && meta.metascore !== null ? (
        <section>
          <SectionHeader title="Metascore" as="h2" />
          <div className="flex flex-wrap items-center gap-4">
            <span
              className={`site-num rounded px-3 py-1.5 text-2xl font-bold ${metascoreClass(meta.band)}`}
            >
              {meta.metascore}
            </span>
            <p className="site-meta site-num text-sm">
              from {meta.criticCount} critics — {meta.positiveCount} positive, {meta.mixedCount}{" "}
              mixed, {meta.negativeCount} negative
            </p>
          </div>
        </section>
      ) : null}

      {criticList.length > 0 ? (
        <section>
          <SectionHeader title="Critic reviews" as="h2" count={criticList.length} />
          <ul className="space-y-4">
            {criticList.map((review) => (
              <li key={review.id} className="site-hairline border-b pb-4 last:border-0">
                <p className="text-sm leading-relaxed">“{review.quote}”</p>
                <p className="site-meta site-num mt-1.5 text-xs">
                  {review.author ? `${review.author}, ` : ""}
                  {review.url ? (
                    <a
                      href={review.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="site-focus font-medium hover:underline"
                    >
                      {review.publication}
                    </a>
                  ) : (
                    <span className="font-medium">{review.publication}</span>
                  )}
                  {review.score !== null ? ` · ${review.score}/100` : ""}
                  {review.publishedOn ? ` · ${formatDate(review.publishedOn)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionHeader title="User reviews" as="h1" count={list.length} className="mb-0" />
          <div className="flex items-center gap-2">
            {list.some((r) => r.hasSpoilers) ? (
              <SpoilerToggle revealAll={spoilers.revealAll} onToggle={spoilers.toggle} />
            ) : null}
            <div className="flex gap-1" role="group" aria-label="Sort reviews">
              {SORTS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={sort === option.key}
                  onClick={() => setSort(option.key)}
                  className={cn(
                    "site-focus rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    sort === option.key
                      ? "site-accent-bg border-transparent"
                      : "site-hairline site-surface-2",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <SectionState
          loading={reviews.isLoading}
          error={reviews.isError}
          empty={list.length === 0}
          emptyText="Nobody has reviewed this title yet."
          onRetry={() => void reviews.refetch()}
        >
          <ul className="space-y-6">
            {list.map((review) => (
              <li key={review.id} className="site-hairline border-b pb-6 last:border-0">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-base font-semibold">{review.headline}</h3>
                  {review.rating !== null ? (
                    <span className="site-rating site-num shrink-0 font-bold">
                      {review.rating}/10
                    </span>
                  ) : null}
                </div>
                <SpoilerVeil revealed={spoilers.revealAll || !review.hasSpoilers} className="mt-2">
                  <p className="whitespace-pre-line text-sm leading-relaxed">{review.body}</p>
                </SpoilerVeil>
                <p className="site-meta site-num mt-3 flex items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1">
                    <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatVotes(review.helpfulCount)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatVotes(review.unhelpfulCount)}
                  </span>
                  <span>{formatDate(review.submittedAt)}</span>
                </p>
              </li>
            ))}
          </ul>
        </SectionState>
      </section>
    </div>
  );
}
