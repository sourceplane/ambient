"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { SearchEntityType } from "@saas/contracts/search";
import { cn } from "@/lib/cn";
import { searchApi } from "@/lib/catalog-api";
import { findHref, groupSearchHits, SEARCH_GROUP_ORDER, searchHitGroupLabel } from "@/lib/site-routes";
import { SectionHeader } from "@/components/site/section-header";
import { ResultRow } from "@/components/site/result-row";
import { SectionState } from "@/components/site/surface-states";

/**
 * Full-text search results, tabbed by entity type.
 *
 * The tabs are derived from what actually came back, not from the fixed list of
 * types the index supports — a tab that always says "0 companies" is a tab that
 * wastes a click.
 */
export default function FindPage() {
  const router = useRouter();
  const params = useSearchParams();
  const query = params.get("q") ?? "";
  const [draft, setDraft] = React.useState(query);
  const [tab, setTab] = React.useState<SearchEntityType | "all">("all");

  React.useEffect(() => setDraft(query), [query]);

  const results = useQuery({
    queryKey: ["site", "find", query],
    queryFn: () => searchApi.search(query, undefined, 60),
    enabled: query.trim().length > 0,
    retry: false,
    staleTime: 60_000,
  });

  const hits = results.data?.results ?? [];
  const groups = groupSearchHits(hits);
  const shown = tab === "all" ? hits : hits.filter((hit) => hit.type === tab);

  return (
    <div className="space-y-6 pt-6">
      <SectionHeader title={query ? `Results for “${query}”` : "Search"} as="h1" />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          router.push(findHref(draft.trim()));
        }}
        className="site-surface-2 site-hairline flex max-w-2xl items-center gap-2 rounded-full border px-4"
      >
        <Search className="site-meta h-4 w-4 shrink-0" aria-hidden="true" />
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Search titles, people and keywords"
          placeholder="Search titles, people, keywords…"
          className="h-11 w-full bg-transparent text-sm outline-none placeholder:site-meta"
        />
        <button type="submit" className="site-focus site-accent shrink-0 text-sm font-semibold">
          Search
        </button>
      </form>

      {query.trim().length === 0 ? (
        <p className="site-meta text-sm">Type something to search the catalog.</p>
      ) : (
        <>
          {groups.length > 1 ? (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Result types">
              <Tab active={tab === "all"} onClick={() => setTab("all")} label="All" count={hits.length} />
              {SEARCH_GROUP_ORDER.filter((type) => groups.some((g) => g.type === type)).map((type) => (
                <Tab
                  key={type}
                  active={tab === type}
                  onClick={() => setTab(type)}
                  label={searchHitGroupLabel(type)}
                  count={hits.filter((h) => h.type === type).length}
                />
              ))}
            </div>
          ) : null}

          <SectionState
            loading={results.isLoading}
            error={results.isError}
            empty={shown.length === 0}
            emptyText={`Nothing matched “${query}”. Try fewer words, or a different spelling.`}
            onRetry={() => void results.refetch()}
          >
            <ul className="divide-y site-hairline">
              {shown.map((hit) => (
                <li key={`${hit.type}:${hit.id}`}>
                  <ResultRow hit={hit} />
                </li>
              ))}
            </ul>
          </SectionState>
        </>
      )}
    </div>
  );
}

function Tab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "site-focus rounded-full border px-3 py-1 text-sm font-medium transition-colors",
        active ? "site-accent-bg border-transparent" : "site-hairline site-surface-2",
      )}
    >
      {label}
      <span className="site-num ml-1.5 text-xs opacity-70">{count}</span>
    </button>
  );
}
