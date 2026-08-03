"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/cn";
import { searchApi } from "@/lib/catalog-api";
import {
  EMPTY_NAME_SEARCH,
  NAME_SORTS,
  isViewMode,
  nameSearchRequest,
  parseNameSearch,
  serializeNameSearch,
  type NameSearchState,
  type ViewMode,
} from "@/lib/site-search";
import { SectionHeader } from "@/components/site/section-header";
import { ResultList, ViewModeSwitch } from "@/components/site/result-views";
import { SectionState } from "@/components/site/surface-states";

const LIMIT = 60;

const PROFESSIONS = [
  "actor",
  "actress",
  "director",
  "writer",
  "producer",
  "composer",
  "cinematographer",
  "editor",
];

export default function NameSearchPage() {
  const router = useRouter();
  const params = useSearchParams();
  const state = React.useMemo(() => parseNameSearch(params), [params]);
  const viewParam = params.get("view");
  const mode: ViewMode = isViewMode(viewParam) ? viewParam : "grid";

  const [draft, setDraft] = React.useState(state);
  React.useEffect(() => setDraft(state), [state]);

  const results = useQuery({
    queryKey: ["site", "search-names", state],
    queryFn: () => searchApi.names(nameSearchRequest(state, LIMIT)),
    retry: false,
    staleTime: 60_000,
  });

  function apply(next: NameSearchState, nextMode: ViewMode = mode) {
    const query = serializeNameSearch(next);
    const separator = query ? "&" : "?";
    const suffix = nextMode === "grid" ? "" : `${separator}view=${nextMode}`;
    router.push(`/search/name${query}${suffix}`);
  }

  function set<K extends keyof NameSearchState>(key: K, value: NameSearchState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  const hits = results.data?.results ?? [];

  return (
    <div className="pt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionHeader title="Advanced name search" as="h1" count={hits.length} className="mb-0" />
        <ViewModeSwitch mode={mode} onChange={(next) => apply(state, next)} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply(draft);
        }}
        className="site-surface site-hairline mb-6 grid gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="block">
          <span className="site-meta mb-1.5 block text-xs font-semibold uppercase tracking-wide">
            Name
          </span>
          <input
            value={draft.q}
            onChange={(event) => set("q", event.target.value)}
            placeholder="Name contains…"
            className="site-surface-2 site-hairline h-9 w-full rounded-md border px-2.5 text-sm outline-none focus-visible:ring-2"
          />
        </label>

        <label className="block">
          <span className="site-meta mb-1.5 block text-xs font-semibold uppercase tracking-wide">
            Birthplace
          </span>
          <input
            value={draft.birthPlace}
            onChange={(event) => set("birthPlace", event.target.value)}
            placeholder="City or country"
            className="site-surface-2 site-hairline h-9 w-full rounded-md border px-2.5 text-sm outline-none focus-visible:ring-2"
          />
        </label>

        <fieldset>
          <legend className="site-meta mb-1.5 text-xs font-semibold uppercase tracking-wide">
            Born between
          </legend>
          <div className="flex items-center gap-2">
            <input
              value={draft.bornFrom}
              onChange={(event) => set("bornFrom", event.target.value)}
              inputMode="numeric"
              aria-label="Born from"
              placeholder="1900"
              className="site-surface-2 site-hairline site-num h-9 w-full rounded-md border px-2.5 text-sm outline-none focus-visible:ring-2"
            />
            <span className="site-meta text-sm">to</span>
            <input
              value={draft.bornTo}
              onChange={(event) => set("bornTo", event.target.value)}
              inputMode="numeric"
              aria-label="Born to"
              placeholder="2010"
              className="site-surface-2 site-hairline site-num h-9 w-full rounded-md border px-2.5 text-sm outline-none focus-visible:ring-2"
            />
          </div>
        </fieldset>

        <label className="block">
          <span className="site-meta mb-1.5 block text-xs font-semibold uppercase tracking-wide">
            Sort by
          </span>
          <select
            value={draft.sort}
            onChange={(event) => set("sort", event.target.value)}
            className="site-surface-2 site-hairline h-9 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-2"
          >
            {NAME_SORTS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="sm:col-span-2 lg:col-span-4">
          <legend className="site-meta mb-2 text-xs font-semibold uppercase tracking-wide">
            Profession
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {PROFESSIONS.map((profession) => {
              const active = draft.profession.includes(profession);
              return (
                <button
                  key={profession}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    set(
                      "profession",
                      active
                        ? draft.profession.filter((p) => p !== profession)
                        : [...draft.profession, profession],
                    )
                  }
                  className={cn(
                    "site-focus rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                    active ? "site-accent-bg border-transparent" : "site-hairline site-surface-2",
                  )}
                >
                  {profession}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            className="site-accent-bg site-focus rounded-full px-5 py-2 text-sm font-semibold"
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => apply(EMPTY_NAME_SEARCH)}
            className="site-focus site-hairline site-surface-2 rounded-full border px-4 py-2 text-sm font-medium"
          >
            Reset
          </button>
        </div>
      </form>

      <SectionState
        loading={results.isLoading}
        error={results.isError}
        empty={hits.length === 0}
        emptyText="No people matched those filters."
        onRetry={() => void results.refetch()}
      >
        <ResultList hits={hits} mode={mode} />
      </SectionState>
    </div>
  );
}
