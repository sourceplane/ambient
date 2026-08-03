"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { catalogApi, listsApi } from "@/lib/catalog-api";
import { useSession } from "@/lib/session";
import type { ViewMode } from "@/lib/site-search";
import { SectionHeader } from "@/components/site/section-header";
import { PosterCard } from "@/components/site/poster-card";
import { ViewModeSwitch } from "@/components/site/result-views";
import { SectionState, SurfaceMissing } from "@/components/site/surface-states";

/**
 * The watchlist.
 *
 * A list holds `entityId`s — it does not know what a title is, because lists
 * and the catalog are different bounded contexts. The batch hydrate is what
 * joins them, here, in the client, in one request.
 */
export default function WatchlistPage() {
  const { token } = useSession();
  const [mode, setMode] = React.useState<ViewMode>("grid");

  const watchlist = useQuery({
    queryKey: ["site", "watchlist", "list"],
    queryFn: () => listsApi.watchlist(token!, { limit: 200 }),
    enabled: Boolean(token),
    retry: false,
  });

  const ids = (watchlist.data?.items ?? [])
    .filter((item) => item.entityType === "title")
    .map((item) => item.entityId);

  const titles = useQuery({
    queryKey: ["site", "titles", ids],
    queryFn: () => catalogApi.batchTitles(ids),
    enabled: ids.length > 0,
    retry: false,
  });

  if (!token) {
    return (
      <div className="pt-6">
        <SurfaceMissing
          heading="Your watchlist lives with your account"
          body="Sign in to keep track of what you want to watch."
        />
        <p className="mt-4 text-center">
          <Link
            href="/login"
            className="site-accent-bg site-focus inline-block rounded-full px-4 py-2 text-sm font-semibold"
          >
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  const list = titles.data?.titles ?? [];

  return (
    <div className="pt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionHeader title="Your watchlist" as="h1" count={list.length} className="mb-0" />
        <ViewModeSwitch mode={mode} onChange={setMode} />
      </div>

      <SectionState
        loading={watchlist.isLoading || (ids.length > 0 && titles.isLoading)}
        error={watchlist.isError}
        empty={list.length === 0}
        emptyText="Nothing on your watchlist yet. The bookmark button on any title adds it."
        onRetry={() => void watchlist.refetch()}
      >
        <ul
          className="grid gap-4"
          style={{
            gridTemplateColumns:
              mode === "compact" ? "repeat(auto-fill, minmax(110px, 1fr))" : "repeat(auto-fill, minmax(150px, 1fr))",
          }}
        >
          {list.map((title) => (
            <li key={title.id}>
              {/* The toggle is the point of this page — every card carries it,
                  so removing something never means opening it first. */}
              <PosterCard title={title} onWatchlist onToggleWatchlist={() => void removeAndRefresh(title.id, token, watchlist.refetch)} />
            </li>
          ))}
        </ul>
      </SectionState>
    </div>
  );
}

async function removeAndRefresh(
  titleId: string,
  token: string,
  refetch: () => Promise<unknown>,
): Promise<void> {
  try {
    await listsApi.removeFromWatchlist(titleId, token);
  } finally {
    // Refetch either way: on failure the list still reflects the server, which
    // is the honest state to show.
    await refetch();
  }
}
