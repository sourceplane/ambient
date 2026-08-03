"use client";

import { useMemo } from "react";
import type { TitleKind, ProductionStatus, CreditDepartment, CreditCategory } from "@saas/contracts/catalog";
import { useSession } from "./session";
import { useApiQuery } from "./query";
import { wrap } from "./api";
import { readLastOrgSlug } from "./last-org";
import { pickAccountBillingOrg } from "@/components/billing/account-org";

/**
 * Which organization curation writes are made on behalf of.
 *
 * Curation is editorial, not per-tenant — the catalog is one shared public
 * database. But *who may edit it* has to come from somewhere, and the platform
 * has exactly one answer: org membership evaluated by the policy worker. So
 * the studio never asks the operator to pick an org for a catalog edit; it
 * resolves one and says which, the same way the console's org scope does.
 *
 * Preference order is the same as the console's landing logic — the org you
 * were last working in, else the account's billing parent — so the studio and
 * the console never disagree about "your" organization.
 */
export interface EditorialOrg {
  id: string;
  slug: string;
  name: string;
}

export function useEditorialOrg(): {
  org: EditorialOrg | null;
  loading: boolean;
  error: { code: string; message: string } | null;
  /** True when the operator has no organization at all — onboarding, not an error. */
  needsOnboarding: boolean;
} {
  const { client } = useSession();
  const orgs = useApiQuery(["studio", "orgs"], () =>
    wrap(async () => (await client.organizations.list()).organizations),
  );

  const org = useMemo<EditorialOrg | null>(() => {
    const list = orgs.data;
    if (!list || list.length === 0) return null;
    const lastSlug = readLastOrgSlug();
    const remembered = lastSlug ? list.find((o) => o.slug === lastSlug) : undefined;
    const chosen = remembered ?? pickAccountBillingOrg(list) ?? list[0];
    if (!chosen) return null;
    return {
      id: chosen.id,
      slug: chosen.slug,
      name: (chosen as { name?: string }).name ?? chosen.slug,
    };
  }, [orgs.data]);

  return {
    org,
    loading: orgs.loading,
    error: orgs.error,
    needsOnboarding: !orgs.loading && !orgs.error && (orgs.data?.length ?? 0) === 0,
  };
}

// ── Vocabularies ───────────────────────────────────────────────────────
//
// The API validates against these; the forms offer them. Kept here rather than
// re-typed per form so a new kind is one edit, and so the select options can
// never drift from what the worker will accept.

export const TITLE_KIND_OPTIONS: Array<{ value: TitleKind; label: string }> = [
  { value: "movie", label: "Movie" },
  { value: "tv_series", label: "TV Series" },
  { value: "tv_mini_series", label: "TV Mini Series" },
  { value: "tv_episode", label: "TV Episode" },
  { value: "tv_special", label: "TV Special" },
  { value: "tv_movie", label: "TV Movie" },
  { value: "short", label: "Short" },
  { value: "tv_short", label: "TV Short" },
  { value: "video", label: "Video" },
  { value: "video_game", label: "Video Game" },
  { value: "podcast_series", label: "Podcast Series" },
  { value: "podcast_episode", label: "Podcast Episode" },
];

export const PRODUCTION_STATUS_OPTIONS: Array<{ value: ProductionStatus; label: string }> = [
  { value: "released", label: "Released" },
  { value: "post_production", label: "Post-production" },
  { value: "filming", label: "Filming" },
  { value: "pre_production", label: "Pre-production" },
  { value: "announced", label: "Announced" },
  { value: "cancelled", label: "Cancelled" },
];

export const CREDIT_DEPARTMENT_OPTIONS: Array<{ value: CreditDepartment; label: string }> = [
  { value: "cast", label: "Cast" },
  { value: "directing", label: "Directing" },
  { value: "writing", label: "Writing" },
  { value: "production", label: "Production" },
  { value: "camera", label: "Camera" },
  { value: "editing", label: "Editing" },
  { value: "sound", label: "Sound" },
  { value: "music", label: "Music" },
  { value: "art", label: "Art" },
  { value: "costume_makeup", label: "Costume & Make-Up" },
  { value: "visual_effects", label: "Visual Effects" },
  { value: "stunts", label: "Stunts" },
  { value: "casting", label: "Casting" },
  { value: "animation", label: "Animation" },
  { value: "additional_crew", label: "Additional Crew" },
  { value: "thanks", label: "Thanks" },
];

/**
 * Cast is the only category that carries characters; everything else is crew.
 * Derived rather than asked, because a form that lets you file a director as
 * "cast" produces data no page knows how to render.
 */
export function categoryForDepartment(department: CreditDepartment): CreditCategory {
  return department === "cast" ? "cast" : "crew";
}

export const PROFESSION_OPTIONS = [
  "actor",
  "actress",
  "director",
  "writer",
  "producer",
  "composer",
  "cinematographer",
  "editor",
  "production_designer",
  "casting_director",
  "animation_department",
  "visual_effects",
  "stunts",
  "soundtrack",
];

// ── Form helpers ───────────────────────────────────────────────────────

/**
 * Turn a form's strings into the request body.
 *
 * A blank field means "not set", never zero and never an empty string. That
 * distinction is the whole reason this exists: `Number("")` is `0`, and an
 * empty `tagline: ""` would overwrite a real tagline with a blank on PATCH.
 */
export function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function optionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** `"drama, sci-fi , mystery"` → `["drama", "sci-fi", "mystery"]`. */
export function splitList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Drop keys whose value is `undefined` so a PATCH sends only what changed.
 *
 * The API treats key *presence* as intent (`if ("tagline" in body)`), so
 * sending `{tagline: undefined}` after `JSON.stringify` would drop the key
 * anyway — but building the object cleanly means the request logged in a
 * network tab is the request that was meant.
 */
export function definedOnly<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<T>;
}

// ── Navigation ─────────────────────────────────────────────────────────

export const STUDIO_NAV = [
  { href: "/studio", label: "Overview", exact: true },
  { href: "/studio/catalog/titles", label: "Titles" },
  { href: "/studio/catalog/people", label: "People" },
  { href: "/studio/moderation", label: "Moderation" },
];

export function isStudioNavActive(pathname: string, href: string, exact = false): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
