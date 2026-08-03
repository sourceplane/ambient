"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";
import { listsApi, ratingsApi } from "@/lib/catalog-api";
import { RatingStars } from "./rating-pill";

/**
 * Watchlist toggle.
 *
 * Signed out, this is a link to sign in rather than a disabled control — the
 * action is available to anyone, it just needs an account, and saying so is
 * more useful than greying the button out.
 *
 * The optimistic update is deliberate: the answer is a boolean the user just
 * chose, so showing it immediately and reconciling afterwards is honest. On
 * failure it rolls back rather than leaving the UI asserting something the
 * server rejected.
 */
export function WatchlistButton({
  titleId,
  className,
}: {
  titleId: string;
  className?: string;
}) {
  const { token } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const key = ["site", "watchlist", titleId];

  const membership = useQuery({
    queryKey: key,
    queryFn: () => listsApi.onWatchlist(titleId, token!),
    enabled: Boolean(token),
    retry: false,
  });

  const toggle = useMutation({
    mutationFn: (next: boolean) =>
      next ? listsApi.addToWatchlist(titleId, token!) : listsApi.removeFromWatchlist(titleId, token!),
    onMutate: async (next: boolean) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, { onWatchlist: next });
      return { previous };
    },
    onError: (_error, _next, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ["site", "watchlist", "list"] });
    },
  });

  const on = membership.data?.onWatchlist ?? false;

  if (!token) {
    return (
      <button
        type="button"
        onClick={() => router.push("/login")}
        className={cn(
          "site-focus site-hairline site-surface-2 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold",
          className,
        )}
      >
        <Bookmark className="h-4 w-4" aria-hidden="true" />
        Sign in to add to watchlist
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => toggle.mutate(!on)}
      aria-pressed={on}
      disabled={membership.isLoading}
      className={cn(
        "site-focus inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
        on ? "site-accent-bg" : "site-hairline site-surface-2 border",
        className,
      )}
    >
      {on ? (
        <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Bookmark className="h-4 w-4" aria-hidden="true" />
      )}
      {on ? "On your watchlist" : "Add to watchlist"}
    </button>
  );
}

/**
 * The viewer's own rating.
 *
 * A rating is identity-bearing, so this never guesses: signed out it prompts to
 * sign in, and it does not pretend a rating exists until the server confirms
 * one. Re-clicking the current value clears it — the way out of a rating you
 * regret has to be as easy as the way in.
 */
export function YourRating({ titleId, className }: { titleId: string; className?: string }) {
  const { token } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const key = ["site", "my-rating", titleId];

  const mine = useQuery({
    queryKey: key,
    queryFn: () => ratingsApi.myRating(titleId, token!),
    enabled: Boolean(token),
    retry: false,
  });

  const rate = useMutation({
    mutationFn: (value: number | null) =>
      value === null
        ? ratingsApi.unrate(titleId, token!).then(() => undefined)
        : ratingsApi.rate(titleId, value, token!).then(() => undefined),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ["site", "rating", titleId] });
    },
  });

  const current = mine.data?.rating?.value ?? null;

  if (!token) {
    return (
      <div className={className}>
        <p className="site-meta text-xs font-semibold uppercase tracking-wide">Your rating</p>
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="site-focus mt-1 text-sm font-semibold site-accent hover:underline"
        >
          Sign in to rate
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="site-meta text-xs font-semibold uppercase tracking-wide">Your rating</p>
      <RatingStars
        value={current}
        disabled={rate.isPending || mine.isLoading}
        onRate={(value) => rate.mutate(value === current ? null : value)}
        className="mt-1"
      />
      {current !== null ? (
        <button
          type="button"
          onClick={() => rate.mutate(null)}
          className="site-focus site-meta mt-1 text-xs hover:underline"
        >
          Remove your rating
        </button>
      ) : null}
    </div>
  );
}
