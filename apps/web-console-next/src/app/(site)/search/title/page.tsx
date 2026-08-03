"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { catalogApi, searchApi } from "@/lib/catalog-api";
import {
  EMPTY_TITLE_SEARCH,
  TITLE_KIND_OPTIONS,
  TITLE_SORTS,
  activeFilterCount,
  isViewMode,
  parseTitleSearch,
  serializeTitleSearch,
  titleSearchRequest,
  type TitleSearchState,
  type ViewMode,
} from "@/lib/site-search";
import { SectionHeader } from "@/components/site/section-header";
import { ResultList, ViewModeSwitch } from "@/components/site/result-views";
import { SectionState } from "@/components/site/surface-states";

const LIMIT = 60;

/**
 * Advanced title search.
 *
 * The URL is the state. Every control writes back to the query string, so a
 * result set is a link — which is the entire point of an advanced search that
 * someone spent thirty seconds configuring.
 */
export default function TitleSearchPage() {
  const router = useRouter();
  const params = useSearchParams();

  const state = React.useMemo(() => parseTitleSearch(params), [params]);
  const viewParam = params.get("view");
  const mode: ViewMode = isViewMode(viewParam) ? viewParam : "detailed";
  const [panelOpen, setPanelOpen] = React.useState(false);

  const genres = useQuery({
    queryKey: ["site", "genres"],
    queryFn: () => catalogApi.genres(),
    retry: false,
    staleTime: 30 * 60_000,
  });

  const results = useQuery({
    queryKey: ["site", "search-titles", state],
    queryFn: () => searchApi.titles(titleSearchRequest(state, LIMIT)),
    retry: false,
    staleTime: 60_000,
  });

  function apply(next: TitleSearchState, nextMode: ViewMode = mode) {
    const query = serializeTitleSearch(next);
    const separator = query ? "&" : "?";
    // The view mode is presentation, not a filter, so it rides along outside
    // the search serialiser rather than polluting it.
    const suffix = nextMode === "detailed" ? "" : `${separator}view=${nextMode}`;
    router.push(`/search/title${query}${suffix}`);
  }

  const hits = results.data?.results ?? [];
  const filterCount = activeFilterCount(state);

  return (
    <div className="pt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionHeader title="Advanced title search" as="h1" count={hits.length} className="mb-0" />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            aria-expanded={panelOpen}
            className="site-focus site-hairline site-surface-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium lg:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Filters
            {filterCount > 0 ? (
              <span className="site-accent-bg site-num rounded-full px-1.5 text-[10px] font-bold">
                {filterCount}
              </span>
            ) : null}
          </button>
          <ViewModeSwitch mode={mode} onChange={(next) => apply(state, next)} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className={cn("lg:block", panelOpen ? "block" : "hidden")}>
          <FilterPanel
            state={state}
            genres={genres.data?.genres ?? []}
            onApply={(next) => {
              setPanelOpen(false);
              apply(next);
            }}
          />
        </aside>

        <div>
          <SectionState
            loading={results.isLoading}
            error={results.isError}
            empty={hits.length === 0}
            emptyText={
              filterCount > 0 || state.q
                ? "No titles matched those filters. Try widening one of them."
                : "The catalog has no published titles yet."
            }
            onRetry={() => void results.refetch()}
          >
            <ResultList hits={hits} mode={mode} />
          </SectionState>
        </div>
      </div>
    </div>
  );
}

function FilterPanel({
  state,
  genres,
  onApply,
}: {
  state: TitleSearchState;
  genres: Array<{ slug: string; name: string }>;
  onApply: (next: TitleSearchState) => void;
}) {
  // A local draft, applied on submit. Pushing a URL on every keystroke would
  // fill the back stack with half-typed years.
  const [draft, setDraft] = React.useState(state);
  React.useEffect(() => setDraft(state), [state]);

  function set<K extends keyof TitleSearchState>(key: K, value: TitleSearchState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggle(key: "kind" | "genre", value: string) {
    setDraft((current) => {
      const list = current[key];
      return {
        ...current,
        [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
      };
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onApply(draft);
      }}
      className="site-surface site-hairline space-y-5 rounded-xl border p-4"
    >
      <Field label="Keywords">
        <input
          value={draft.q}
          onChange={(event) => set("q", event.target.value)}
          placeholder="Title contains…"
          className="site-surface-2 site-hairline h-9 w-full rounded-md border px-2.5 text-sm outline-none focus-visible:ring-2"
        />
      </Field>

      <fieldset>
        <legend className="site-meta mb-2 text-xs font-semibold uppercase tracking-wide">Type</legend>
        <div className="flex flex-wrap gap-1.5">
          {TITLE_KIND_OPTIONS.map((option) => (
            <Toggle
              key={option.value}
              label={option.label}
              active={draft.kind.includes(option.value)}
              onClick={() => toggle("kind", option.value)}
            />
          ))}
        </div>
      </fieldset>

      {genres.length > 0 ? (
        <fieldset>
          <legend className="site-meta mb-2 text-xs font-semibold uppercase tracking-wide">
            Genre
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {genres.map((genre) => (
              <Toggle
                key={genre.slug}
                label={genre.name}
                active={draft.genre.includes(genre.slug)}
                onClick={() => toggle("genre", genre.slug)}
              />
            ))}
          </div>
        </fieldset>
      ) : null}

      <Range
        label="Release year"
        from={draft.yearFrom}
        to={draft.yearTo}
        onFrom={(v) => set("yearFrom", v)}
        onTo={(v) => set("yearTo", v)}
        placeholderFrom="1900"
        placeholderTo="2030"
      />
      <Range
        label="Rating"
        from={draft.ratingFrom}
        to={draft.ratingTo}
        onFrom={(v) => set("ratingFrom", v)}
        onTo={(v) => set("ratingTo", v)}
        placeholderFrom="1"
        placeholderTo="10"
      />
      <Range
        label="Runtime (minutes)"
        from={draft.runtimeMin}
        to={draft.runtimeMax}
        onFrom={(v) => set("runtimeMin", v)}
        onTo={(v) => set("runtimeMax", v)}
        placeholderFrom="0"
        placeholderTo="400"
      />

      <Field label="Minimum votes">
        <input
          value={draft.votesMin}
          onChange={(event) => set("votesMin", event.target.value)}
          inputMode="numeric"
          placeholder="0"
          className="site-surface-2 site-hairline site-num h-9 w-full rounded-md border px-2.5 text-sm outline-none focus-visible:ring-2"
        />
      </Field>

      <Field label="Sort by">
        <select
          value={draft.sort}
          onChange={(event) => set("sort", event.target.value)}
          className="site-surface-2 site-hairline h-9 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-2"
        >
          {TITLE_SORTS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex gap-2">
        <button
          type="submit"
          className="site-accent-bg site-focus flex-1 rounded-full px-4 py-2 text-sm font-semibold"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={() => onApply(EMPTY_TITLE_SEARCH)}
          className="site-focus site-hairline site-surface-2 rounded-full border px-4 py-2 text-sm font-medium"
        >
          Reset
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="site-meta mb-1.5 block text-xs font-semibold uppercase tracking-wide">
        {label}
      </span>
      {children}
    </label>
  );
}

function Range({
  label,
  from,
  to,
  onFrom,
  onTo,
  placeholderFrom,
  placeholderTo,
}: {
  label: string;
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  placeholderFrom: string;
  placeholderTo: string;
}) {
  return (
    <fieldset>
      <legend className="site-meta mb-1.5 text-xs font-semibold uppercase tracking-wide">
        {label}
      </legend>
      <div className="flex items-center gap-2">
        <input
          value={from}
          onChange={(event) => onFrom(event.target.value)}
          inputMode="numeric"
          aria-label={`${label} from`}
          placeholder={placeholderFrom}
          className="site-surface-2 site-hairline site-num h-9 w-full rounded-md border px-2.5 text-sm outline-none focus-visible:ring-2"
        />
        <span className="site-meta text-sm">to</span>
        <input
          value={to}
          onChange={(event) => onTo(event.target.value)}
          inputMode="numeric"
          aria-label={`${label} to`}
          placeholder={placeholderTo}
          className="site-surface-2 site-hairline site-num h-9 w-full rounded-md border px-2.5 text-sm outline-none focus-visible:ring-2"
        />
      </div>
    </fieldset>
  );
}

function Toggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "site-focus rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "site-accent-bg border-transparent" : "site-hairline site-surface-2",
      )}
    >
      {label}
    </button>
  );
}
