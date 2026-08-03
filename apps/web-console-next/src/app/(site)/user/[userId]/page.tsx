"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { isNotFound, listsApi, reviewsApi } from "@/lib/catalog-api";
import { useSession } from "@/lib/session";
import { formatDate, formatVotes } from "@/lib/site-format";
import { listHref } from "@/lib/site-routes";
import { SectionHeader } from "@/components/site/section-header";
import { SectionState, SurfaceMissing } from "@/components/site/surface-states";

/**
 * A public profile: the lists and reviews a user has made public.
 *
 * Ratings are deliberately absent. `/v1/me/ratings` is the only ratings-by-user
 * route, and it is scoped to the caller — there is no public "this user's
 * ratings" endpoint, and inventing one client-side is not possible. Showing an
 * empty "Ratings" heading would imply the user has none, which is a different
 * claim from "we don't publish those".
 */
export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { token } = useSession();

  const lists = useQuery({
    queryKey: ["site", "user-lists", userId, Boolean(token)],
    queryFn: () => listsApi.userLists(userId, token),
    retry: false,
  });

  const reviews = useQuery({
    queryKey: ["site", "user-reviews", userId],
    queryFn: () => reviewsApi.userReviews(userId),
    retry: false,
  });

  if (lists.isError && isNotFound(lists.error)) {
    return (
      <SurfaceMissing
        heading="We don't have that profile"
        body="The link may be wrong, or the profile may not be public."
      />
    );
  }

  const publicLists = lists.data?.lists ?? [];
  const publicReviews = reviews.data?.reviews ?? [];

  return (
    <div className="space-y-10 pt-6">
      <SectionHeader title="Profile" as="h1" />

      <section>
        <SectionHeader title="Lists" as="h2" count={publicLists.length} />
        <SectionState
          loading={lists.isLoading}
          error={lists.isError}
          empty={publicLists.length === 0}
          emptyText="This user has no public lists."
          onRetry={() => void lists.refetch()}
        >
          <ul className="divide-y site-hairline">
            {publicLists.map((list) => (
              <li key={list.id} className="py-3">
                <Link href={listHref(list.id)} className="site-focus block">
                  <span className="text-sm font-semibold hover:underline">{list.name}</span>
                </Link>
                {list.description ? (
                  <p className="site-meta line-clamp-2 text-sm">{list.description}</p>
                ) : null}
                <p className="site-meta site-num text-xs">
                  {list.itemCount} titles · {list.likeCount} likes · updated{" "}
                  {formatDate(list.updatedAt)}
                </p>
              </li>
            ))}
          </ul>
        </SectionState>
      </section>

      <section>
        <SectionHeader title="Reviews" as="h2" count={publicReviews.length} />
        <SectionState
          loading={reviews.isLoading}
          error={reviews.isError}
          empty={publicReviews.length === 0}
          emptyText="This user has no published reviews."
          onRetry={() => void reviews.refetch()}
        >
          <ul className="divide-y site-hairline">
            {publicReviews.map((review) => (
              <li key={review.id} className="py-3">
                <Link href={`/title/${review.titleId}/reviews`} className="site-focus block">
                  <span className="text-sm font-semibold hover:underline">{review.headline}</span>
                </Link>
                <p className="site-meta site-num text-xs">
                  {review.rating !== null ? `${review.rating}/10 · ` : ""}
                  {formatVotes(review.helpfulCount)} found this helpful ·{" "}
                  {formatDate(review.submittedAt)}
                </p>
              </li>
            ))}
          </ul>
        </SectionState>
      </section>
    </div>
  );
}
