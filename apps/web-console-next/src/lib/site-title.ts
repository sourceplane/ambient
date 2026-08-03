// Facts a title page derives rather than fetches.
//
// Certificate selection, tab construction, spoiler policy and the metascore
// band all have a rule behind them. Each rule is one small function here, so
// the page components stay declarative and the rules stay assertable.

import type { PublicCertificate, TitleKind } from "@saas/contracts/catalog";
import type { FactKind } from "@saas/contracts/community";
import type { PublicMetascore } from "@saas/contracts/reviews";

/**
 * Which certificate to show next to the runtime.
 *
 * A title carries a rating per country. Showing all of them is noise and
 * showing an arbitrary one is worse, so this prefers a small ordered list of
 * widely-recognised systems and falls back to the first entry — the point is
 * determinism, not a claim about whose rating matters.
 */
const CERTIFICATE_PREFERENCE = ["US", "GB", "CA", "AU", "IN", "DE", "FR"];

export function preferredCertificate(
  certificates: PublicCertificate[],
): PublicCertificate | null {
  if (certificates.length === 0) return null;
  for (const country of CERTIFICATE_PREFERENCE) {
    const match = certificates.find((c) => c.country === country);
    if (match) return match;
  }
  return certificates[0]!;
}

/** Series-shaped titles get an episodes section and a season switcher. */
export function isSeries(kind: TitleKind): boolean {
  return kind === "tv_series" || kind === "tv_mini_series" || kind === "podcast_series";
}

// ── Metascore ──────────────────────────────────────────────────────────

/**
 * The band comes from the API, not from a threshold re-derived here — two
 * places deciding what counts as "positive" is two places to disagree. This
 * only maps a band to how it looks.
 */
export function metascoreClass(band: PublicMetascore["band"]): string {
  switch (band) {
    case "positive":
      return "bg-emerald-600 text-white";
    case "mixed":
      return "bg-amber-500 text-black";
    case "negative":
      return "bg-red-600 text-white";
    default:
      return "site-surface-2 site-meta";
  }
}

// ── Facts ──────────────────────────────────────────────────────────────

const FACT_LABELS: Record<FactKind, string> = {
  trivia: "Trivia",
  goof: "Goofs",
  quote: "Quotes",
  crazy_credit: "Crazy credits",
  alternate_version: "Alternate versions",
  soundtrack: "Soundtracks",
};

export function factLabel(kind: FactKind): string {
  return FACT_LABELS[kind] ?? "Facts";
}

/** The order the "Did you know" section reads in. */
export const FACT_ORDER: FactKind[] = [
  "trivia",
  "goof",
  "quote",
  "crazy_credit",
  "alternate_version",
  "soundtrack",
];

/**
 * `interesting / total` as a percentage, or null when nobody has voted.
 * Rendering `0%` for an unvoted fact would read as "nobody found this
 * interesting", which is a different claim from "nobody has said".
 */
export function interestingShare(interestingVotes: number, totalVotes: number): number | null {
  if (totalVotes <= 0) return null;
  return Math.round((interestingVotes / totalVotes) * 100);
}

// ── Parents guide ──────────────────────────────────────────────────────

export const SEVERITY_LABELS = {
  none: "None",
  mild: "Mild",
  moderate: "Moderate",
  severe: "Severe",
} as const;

/** Severity as a 0–1 fill for the meter. `null` is "no consensus", not zero. */
export function severityFraction(severity: string | null): number | null {
  switch (severity) {
    case "none":
      return 0;
    case "mild":
      return 1 / 3;
    case "moderate":
      return 2 / 3;
    case "severe":
      return 1;
    default:
      return null;
  }
}

export const PARENTS_GUIDE_LABELS: Record<string, string> = {
  sex_nudity: "Sex & Nudity",
  violence_gore: "Violence & Gore",
  profanity: "Profanity",
  alcohol_drugs_smoking: "Alcohol, Drugs & Smoking",
  frightening_intense: "Frightening & Intense Scenes",
};

export function parentsGuideLabel(category: string): string {
  return (
    PARENTS_GUIDE_LABELS[category] ??
    category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

// ── Title sub-navigation ───────────────────────────────────────────────

export interface TitleTab {
  slug: string;
  label: string;
  /** Series-only tabs are hidden on a film. */
  seriesOnly?: boolean;
}

export const TITLE_TABS: TitleTab[] = [
  { slug: "", label: "Overview" },
  { slug: "fullcredits", label: "Full cast & crew" },
  { slug: "episodes", label: "Episodes", seriesOnly: true },
  { slug: "reviews", label: "User reviews" },
  { slug: "ratings", label: "Ratings" },
  { slug: "mediaindex", label: "Photos" },
  { slug: "videogallery", label: "Videos" },
  { slug: "trivia", label: "Trivia" },
  { slug: "goofs", label: "Goofs" },
  { slug: "quotes", label: "Quotes" },
  { slug: "awards", label: "Awards" },
  { slug: "parentalguide", label: "Parents guide" },
  { slug: "faq", label: "FAQ" },
  { slug: "keywords", label: "Keywords" },
  { slug: "releaseinfo", label: "Release info" },
  { slug: "technical", label: "Technical specs" },
];

export function titleTabs(kind: TitleKind): TitleTab[] {
  return TITLE_TABS.filter((tab) => !tab.seriesOnly || isSeries(kind));
}

export function titleTabHref(titleId: string, slug: string): string {
  return slug ? `/title/${titleId}/${slug}` : `/title/${titleId}`;
}

/**
 * Which tab a pathname is on. Compared against the *last* segment so
 * `/title/tt_…/reviews` selects `reviews` and `/title/tt_…` selects Overview,
 * without the id ever being mistaken for a slug.
 */
export function activeTitleTab(pathname: string, titleId: string): string {
  const base = `/title/${titleId}`;
  if (!pathname.startsWith(base)) return "";
  const rest = pathname.slice(base.length).replace(/^\//, "");
  return TITLE_TABS.some((t) => t.slug === rest && t.slug !== "") ? rest : "";
}
