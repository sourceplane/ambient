"use client";

import * as React from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import type { ModeratedReview } from "@saas/contracts/reviews";
import type { PublicContribution } from "@saas/contracts/community";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";
import { useApiQuery } from "@/lib/query";
import { wrap } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { FormError } from "@/components/studio/fields";

const PAGE = 50;

/**
 * The moderation queues.
 *
 * Two queues, one page, because a moderator's question is "is there anything
 * to do" and splitting that across two routes makes them check twice. Both are
 * oldest-first from the API — a newest-first queue starves its own tail.
 */
export default function StudioModerationPage() {
  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Moderation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Oldest first. A decision is what publishes something — submitting never does.
        </p>
      </header>

      <ContributionQueue />
      <ReviewQueue />
    </div>
  );
}

function ContributionQueue() {
  const { client } = useSession();
  const queue = useApiQuery(["studio", "queue", "contributions"], () =>
    wrap(async () => (await client.community.listModerationQueue({ limit: PAGE })).contributions),
  );

  async function decide(id: string, state: "approved" | "rejected") {
    await wrap(() => client.community.moderate(id, { state }));
    queue.reload();
  }

  return (
    <Queue
      title="Contributions"
      count={queue.data?.length ?? null}
      loading={queue.loading}
      error={queue.error}
      emptyText="Nothing waiting."
    >
      <ul className="divide-y rounded-lg border">
        {(queue.data ?? []).map((item: PublicContribution) => (
          <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium capitalize">
                {item.operation} {item.targetType.replace(/_/g, " ")}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {/* The proposed payload is deliberately never echoed by the API —
                    unmoderated content must not render anywhere. The decision is
                    made on the operation and its target. */}
                {item.targetId ? `target ${item.targetId}` : "new record"} · submitted{" "}
                {item.submittedAt.slice(0, 10)}
              </span>
            </span>
            <DecisionButtons
              onApprove={() => void decide(item.id, "approved")}
              onReject={() => void decide(item.id, "rejected")}
            />
          </li>
        ))}
      </ul>
    </Queue>
  );
}

function ReviewQueue() {
  const { client } = useSession();
  const queue = useApiQuery(["studio", "queue", "reviews"], () =>
    wrap(async () => (await client.reviews.listModerationQueue({ limit: PAGE })).reviews),
  );

  async function decide(id: string, state: "published" | "rejected") {
    await wrap(() => client.reviews.moderate(id, { state }));
    queue.reload();
  }

  return (
    <Queue
      title="Reviews"
      count={queue.data?.length ?? null}
      loading={queue.loading}
      error={queue.error}
      emptyText="Nothing waiting."
    >
      <ul className="divide-y rounded-lg border">
        {(queue.data ?? []).map((review: ModeratedReview) => (
          <li key={review.id} className="space-y-2 px-4 py-3">
            <div className="flex flex-wrap items-start gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{review.headline}</span>
                <span className="block text-xs text-muted-foreground">
                  <Link href={`/title/${review.titleId}`} className="hover:underline">
                    {review.titleId}
                  </Link>
                  {review.rating !== null ? ` · rated ${review.rating}/10` : ""}
                  {review.hasSpoilers ? " · marked as containing spoilers" : ""}
                  {` · submitted ${review.submittedAt.slice(0, 10)}`}
                </span>
              </span>
              <DecisionButtons
                approveLabel="Publish"
                onApprove={() => void decide(review.id, "published")}
                onReject={() => void decide(review.id, "rejected")}
              />
            </div>
            <p className="whitespace-pre-line text-sm text-muted-foreground">{review.body}</p>
          </li>
        ))}
      </ul>
    </Queue>
  );
}

function Queue({
  title,
  count,
  loading,
  error,
  emptyText,
  children,
}: {
  title: string;
  count: number | null;
  loading: boolean;
  error: { code: string; message: string } | null;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">
        {title}
        {count !== null ? (
          <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
            {count === PAGE ? `${PAGE}+` : count}
          </span>
        ) : null}
      </h2>

      {loading ? (
        <Skeleton className="h-24" />
      ) : error ? (
        error.code === "not_found" ? (
          // A moderator-only route 404s for everyone else. Saying "not found"
          // here would be confusing; saying "not your role" is the truth.
          <p className="text-sm text-muted-foreground">
            This queue is only available to moderators.
          </p>
        ) : (
          <FormError error={error} />
        )
      ) : count === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        children
      )}
    </section>
  );
}

function DecisionButtons({
  onApprove,
  onReject,
  approveLabel = "Approve",
}: {
  onApprove: () => void;
  onReject: () => void;
  approveLabel?: string;
}) {
  const [busy, setBusy] = React.useState(false);
  function run(fn: () => void) {
    setBusy(true);
    fn();
  }
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => run(onApprove)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium",
          "text-primary-foreground disabled:opacity-50",
        )}
      >
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        {approveLabel}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => run(onReject)}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
        Reject
      </button>
    </div>
  );
}
