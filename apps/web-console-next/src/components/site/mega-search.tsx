"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, X, Clock, CornerDownLeft } from "lucide-react";
import type { PublicSearchHit } from "@saas/contracts/search";
import { cn } from "@/lib/cn";
import { searchApi } from "@/lib/catalog-api";
import { findHref, groupSearchHits, searchHitHref } from "@/lib/site-routes";
import { STORAGE_PREFIX } from "@/lib/app-config";
import { initials } from "@/lib/site-format";
import { SiteImage } from "./site-image";

const RECENTS_KEY = `${STORAGE_PREFIX}.site.recent-searches`;
const MAX_RECENTS = 6;
const DEBOUNCE_MS = 160;

function readRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return readRecents();
  const next = [trimmed, ...readRecents().filter((r) => r !== trimmed)].slice(0, MAX_RECENTS);
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // A private-mode browser that refuses storage still gets a working search.
  }
  return next;
}

/**
 * The search overlay.
 *
 * Keyboard-first, because search is the one control on a film site people use
 * without looking: `/` opens it from anywhere, arrows move through results,
 * Enter opens the highlighted one, Enter with nothing highlighted runs the full
 * search, Escape closes.
 *
 * Results are flat in the DOM (a single `listbox`) but grouped visually — a
 * screen reader reads "3 of 12", not "3 of 5" in a group it can't see.
 */
export function MegaSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<PublicSearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [recents, setRecents] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setRecents(readRecents());
    // Focus after the overlay has actually mounted, or the focus lands on a
    // node that is about to be replaced.
    const id = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(id);
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      setActive(-1);
    }
  }, [open]);

  // Debounced suggest. The abort flag stops a slow early response from
  // overwriting a fast later one — typing "dune" must not end up showing
  // results for "du".
  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchApi
        .suggest(trimmed, 10)
        .then((data) => {
          if (cancelled) return;
          setHits(data.suggestions);
          setActive(data.suggestions.length > 0 ? 0 : -1);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const groups = React.useMemo(() => groupSearchHits(hits), [hits]);
  // Flatten in the same order the groups render, so arrow-key position and
  // visual position can never disagree.
  const ordered = React.useMemo(() => groups.flatMap((g) => g.hits), [groups]);

  function go(href: string) {
    setRecents(pushRecent(query));
    onClose();
    router.push(href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (ordered.length === 0 ? -1 : (i + 1) % ordered.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (ordered.length === 0 ? -1 : (i - 1 + ordered.length) % ordered.length));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const hit = active >= 0 ? ordered[active] : undefined;
      if (hit) go(searchHitHref(hit));
      else if (query.trim()) go(findHref(query.trim()));
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Search titles and people"
    >
      {/* Clicking the backdrop closes; the panel stops the click from reaching it. */}
      <button
        type="button"
        aria-label="Close search"
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={onClose}
        tabIndex={-1}
      />

      <div className="site relative mx-auto mt-0 w-full max-w-2xl sm:mt-[10vh]">
        <div className="site-surface site-hairline overflow-hidden border shadow-2xl sm:rounded-xl">
          <div className="flex items-center gap-2 border-b site-hairline px-3">
            <Search className="site-meta h-4 w-4 shrink-0" aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search titles, people, keywords…"
              aria-label="Search"
              aria-autocomplete="list"
              aria-controls="site-search-results"
              aria-activedescendant={active >= 0 ? `site-search-hit-${active}` : undefined}
              className="h-14 w-full bg-transparent text-base outline-none placeholder:site-meta"
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close search"
              className="site-focus site-meta rounded p-1 hover:site-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div
            id="site-search-results"
            role="listbox"
            aria-label="Search results"
            className="max-h-[65vh] overflow-y-auto overscroll-contain"
          >
            {query.trim().length < 2 ? (
              <RecentSearches
                recents={recents}
                onPick={(value) => {
                  setQuery(value);
                  inputRef.current?.focus();
                }}
              />
            ) : loading && ordered.length === 0 ? (
              <p className="site-meta px-4 py-6 text-sm">Searching…</p>
            ) : ordered.length === 0 ? (
              <p className="site-meta px-4 py-6 text-sm">
                Nothing matched “{query.trim()}”.
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.type}>
                  <p className="site-meta px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide">
                    {group.label}
                  </p>
                  {group.hits.map((hit) => {
                    const index = ordered.indexOf(hit);
                    return (
                      <SearchRow
                        key={`${hit.type}:${hit.id}`}
                        id={`site-search-hit-${index}`}
                        hit={hit}
                        active={index === active}
                        onHover={() => setActive(index)}
                        onSelect={() => go(searchHitHref(hit))}
                      />
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {query.trim() ? (
            <button
              type="button"
              onClick={() => go(findHref(query.trim()))}
              className="site-focus flex w-full items-center gap-2 border-t site-hairline px-4 py-3 text-left text-sm hover:site-surface-2"
            >
              <CornerDownLeft className="site-meta h-4 w-4" aria-hidden="true" />
              See all results for <span className="font-semibold">{query.trim()}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RecentSearches({
  recents,
  onPick,
}: {
  recents: string[];
  onPick: (value: string) => void;
}) {
  if (recents.length === 0) {
    return (
      <p className="site-meta px-4 py-6 text-sm">
        Type at least two characters to search titles, people and keywords.
      </p>
    );
  }
  return (
    <div className="py-2">
      <p className="site-meta px-4 pb-1 text-xs font-semibold uppercase tracking-wide">Recent</p>
      {recents.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onPick(value)}
          className="site-focus flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:site-surface-2"
        >
          <Clock className="site-meta h-4 w-4 shrink-0" aria-hidden="true" />
          {value}
        </button>
      ))}
    </div>
  );
}

function SearchRow({
  id,
  hit,
  active,
  onHover,
  onSelect,
}: {
  id: string;
  hit: PublicSearchHit;
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const circular = hit.type === "person";
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={-1}
      className={cn(
        "flex cursor-pointer items-center gap-3 px-4 py-2",
        active ? "site-surface-2" : "",
      )}
    >
      <SiteImage
        src={hit.imageUrl}
        alt=""
        ratio="1/1"
        fallback={<span className="text-xs font-semibold">{initials(hit.display)}</span>}
        className={cn("w-10 shrink-0", circular ? "rounded-full" : "rounded")}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{hit.display}</span>
        {hit.secondary ? (
          <span className="site-meta block truncate text-xs">{hit.secondary}</span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * Wires `/` and `⌘K` to a search overlay. Ignores the shortcut while the caret
 * is in a field, so typing a slash into the search box doesn't reopen it.
 */
export function useSearchOverlay() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;

      if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { open, setOpen };
}
