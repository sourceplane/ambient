"use client";

import { useQuery } from "@tanstack/react-query";
import { catalogApi, communityApi, ratingsApi, reviewsApi } from "@/lib/catalog-api";

/**
 * Per-section queries for a title page.
 *
 * Each section owns its own fetch. That is what lets the overview render the
 * hero as soon as the core record arrives instead of waiting on trivia, and it
 * is what lets a sub-route (`/quotes`, `/technical`) load exactly one thing.
 * TanStack's cache means the shared queries — the title itself, its rating —
 * are fetched once across the layout and every tab under it.
 *
 * `retry: false` throughout: these are public reads behind a CDN, and a section
 * that genuinely has no data should reach its empty state promptly rather than
 * spin through three attempts first.
 */
const shared = { retry: false, staleTime: 5 * 60_000 } as const;

export function useTitle(titleId: string) {
  return useQuery({
    queryKey: ["site", "title", titleId],
    queryFn: () => catalogApi.getTitle(titleId),
    ...shared,
  });
}

export function useTitleRating(titleId: string) {
  return useQuery({
    queryKey: ["site", "rating", titleId],
    queryFn: () => ratingsApi.titleRating(titleId),
    ...shared,
  });
}

export function useTitleDemographics(titleId: string) {
  return useQuery({
    queryKey: ["site", "demographics", titleId],
    queryFn: () => ratingsApi.demographics(titleId),
    ...shared,
  });
}

export function useTitleCredits(titleId: string, params: { category?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ["site", "credits", titleId, params],
    queryFn: () => catalogApi.titleCredits(titleId, params),
    ...shared,
  });
}

export function useTitleImages(titleId: string, limit = 60) {
  return useQuery({
    queryKey: ["site", "images", titleId, limit],
    queryFn: () => catalogApi.titleImages(titleId, { limit }),
    ...shared,
  });
}

export function useTitleVideos(titleId: string) {
  return useQuery({
    queryKey: ["site", "videos", titleId],
    queryFn: () => catalogApi.titleVideos(titleId),
    ...shared,
  });
}

export function useTitleKeywords(titleId: string) {
  return useQuery({
    queryKey: ["site", "keywords", titleId],
    queryFn: () => catalogApi.titleKeywords(titleId),
    ...shared,
  });
}

export function useTitleCertificates(titleId: string) {
  return useQuery({
    queryKey: ["site", "certificates", titleId],
    queryFn: () => catalogApi.titleCertificates(titleId),
    ...shared,
  });
}

export function useTitleReleaseDates(titleId: string) {
  return useQuery({
    queryKey: ["site", "release-dates", titleId],
    queryFn: () => catalogApi.titleReleaseDates(titleId),
    ...shared,
  });
}

export function useTitleTechnical(titleId: string) {
  return useQuery({
    queryKey: ["site", "technical", titleId],
    queryFn: () => catalogApi.titleTechnical(titleId),
    ...shared,
  });
}

export function useTitleCompanies(titleId: string) {
  return useQuery({
    queryKey: ["site", "companies", titleId],
    queryFn: () => catalogApi.titleCompanies(titleId),
    ...shared,
  });
}

export function useTitleBoxOffice(titleId: string) {
  return useQuery({
    queryKey: ["site", "box-office", titleId],
    queryFn: () => catalogApi.titleBoxOffice(titleId),
    ...shared,
  });
}

export function useTitleConnections(titleId: string) {
  return useQuery({
    queryKey: ["site", "connections", titleId],
    queryFn: () => catalogApi.titleConnections(titleId),
    ...shared,
  });
}

export function useTitleSeasons(titleId: string, enabled = true) {
  return useQuery({
    queryKey: ["site", "seasons", titleId],
    queryFn: () => catalogApi.titleSeasons(titleId),
    enabled,
    ...shared,
  });
}

export function useTitleEpisodes(titleId: string, season: number | undefined, enabled = true) {
  return useQuery({
    queryKey: ["site", "episodes", titleId, season ?? "all"],
    queryFn: () => catalogApi.titleEpisodes(titleId, season),
    enabled,
    ...shared,
  });
}

export function useTitleReviews(
  titleId: string,
  params: { sort?: string; spoilers?: string; limit?: number } = {},
) {
  return useQuery({
    queryKey: ["site", "reviews", titleId, params],
    queryFn: () => reviewsApi.titleReviews(titleId, params),
    ...shared,
  });
}

export function useTitleCriticReviews(titleId: string) {
  return useQuery({
    queryKey: ["site", "critic-reviews", titleId],
    queryFn: () => reviewsApi.criticReviews(titleId),
    ...shared,
  });
}

export function useTitleMetascore(titleId: string) {
  return useQuery({
    queryKey: ["site", "metascore", titleId],
    queryFn: () => reviewsApi.metascore(titleId),
    ...shared,
  });
}

export function useTitleFacts(titleId: string, kind?: string) {
  return useQuery({
    queryKey: ["site", "facts", titleId, kind ?? "all"],
    queryFn: () => communityApi.titleFacts(titleId, kind),
    ...shared,
  });
}

export function useTitleAwards(titleId: string) {
  return useQuery({
    queryKey: ["site", "awards", titleId],
    queryFn: () => communityApi.titleAwards(titleId),
    ...shared,
  });
}

export function useParentsGuide(titleId: string) {
  return useQuery({
    queryKey: ["site", "parents-guide", titleId],
    queryFn: () => communityApi.parentsGuide(titleId),
    ...shared,
  });
}

export function useTitleFaq(titleId: string) {
  return useQuery({
    queryKey: ["site", "faq", titleId],
    queryFn: () => communityApi.faq(titleId),
    ...shared,
  });
}

// ── Names ──────────────────────────────────────────────────────────────

export function useName(nameId: string) {
  return useQuery({
    queryKey: ["site", "name", nameId],
    queryFn: () => catalogApi.getName(nameId),
    ...shared,
  });
}

export function useNameCredits(nameId: string, limit = 400) {
  return useQuery({
    queryKey: ["site", "name-credits", nameId, limit],
    queryFn: () => catalogApi.nameCredits(nameId, { limit }),
    ...shared,
  });
}

export function useKnownFor(nameId: string) {
  return useQuery({
    queryKey: ["site", "known-for", nameId],
    queryFn: () => catalogApi.nameKnownFor(nameId),
    ...shared,
  });
}

export function useNameImages(nameId: string) {
  return useQuery({
    queryKey: ["site", "name-images", nameId],
    queryFn: () => catalogApi.nameImages(nameId),
    ...shared,
  });
}

export function useNameAwards(nameId: string) {
  return useQuery({
    queryKey: ["site", "name-awards", nameId],
    queryFn: () => communityApi.nameAwards(nameId),
    ...shared,
  });
}
