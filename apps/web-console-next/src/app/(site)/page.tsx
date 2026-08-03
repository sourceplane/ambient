"use client";

import * as React from "react";
import Link from "next/link";
import type { PublicTitleSummary } from "@saas/contracts/catalog";
import { HOME_RAILS, HERO_CHART, HERO_SIZE, RAIL_SIZE, type HomeRail } from "@/lib/site-home";
import { genreHref } from "@/lib/site-routes";
import { formatDate } from "@/lib/site-format";
import { HomeHero, HomeHeroSkeleton } from "@/components/site/home-hero";
import { PosterCard, PosterCardSkeleton } from "@/components/site/poster-card";
import { PersonCard, PersonCardSkeleton } from "@/components/site/person-card";
import { PosterRail, RailItem } from "@/components/site/poster-rail";
import { SectionHeader } from "@/components/site/section-header";
import { ChipGroup } from "@/components/site/chip-group";
import { SiteImage } from "@/components/site/site-image";
import { useGenres, useNews, usePopularNames, useRail } from "@/components/site/use-site-data";

const HERO_RAIL: HomeRail = {
  key: "hero",
  title: "Featured",
  chart: HERO_CHART,
  href: "/chart/moviemeter",
  fallback: { kind: "movie" },
};

/**
 * The catalog home.
 *
 * Rails are declared in `site-home.ts` and rendered from that list, so adding
 * one is a data change. Each rail owns its own fetch and its own loading state:
 * a slow chart delays its own shelf, never the page.
 */
export default function HomePage() {
  const hero = useRail(HERO_RAIL, HERO_SIZE);
  const genres = useGenres();

  const heroTitles = hero.titles.slice(0, HERO_SIZE);
  const nothingYet = !hero.loading && heroTitles.length === 0;

  return (
    <div className="space-y-10 pt-4 sm:space-y-14 sm:pt-6">
      {hero.loading ? (
        <HomeHeroSkeleton />
      ) : (
        <HomeHero titles={heroTitles} ratings={hero.ratings} />
      )}

      {nothingYet ? <EmptyCatalog /> : null}

      {HOME_RAILS.map((rail) => (
        <TitleRail key={rail.key} rail={rail} />
      ))}

      <PopularPeople />
      <LatestNews />

      {genres.data && genres.data.genres.length > 0 ? (
        <section>
          <SectionHeader title="Explore by genre" />
          <ChipGroup
            chips={genres.data.genres.map((g) => ({ label: g.name, href: genreHref(g.slug) }))}
          />
        </section>
      ) : null}
    </div>
  );
}

function TitleRail({ rail }: { rail: HomeRail }) {
  const { titles, ratings, loading } = useRail(rail);

  // A rail that resolved to nothing is removed rather than rendered empty —
  // a heading with no content below it reads as a broken page.
  if (!loading && titles.length === 0) return null;

  return (
    <PosterRail title={rail.title} href={rail.href}>
      {loading
        ? Array.from({ length: 8 }, (_, i) => (
            <RailItem key={i}>
              <PosterCardSkeleton />
            </RailItem>
          ))
        : titles.map((title: PublicTitleSummary) => (
            <RailItem key={title.id}>
              <PosterCard title={title} rating={ratings.get(title.id) ?? null} />
            </RailItem>
          ))}
    </PosterRail>
  );
}

function PopularPeople() {
  const { data, isLoading } = usePopularNames(RAIL_SIZE);
  const people = data?.names ?? [];
  if (!isLoading && people.length === 0) return null;

  return (
    <PosterRail title="Popular celebrities" href="/search/name">
      {isLoading
        ? Array.from({ length: 8 }, (_, i) => (
            <RailItem key={i} width="person">
              <PersonCardSkeleton />
            </RailItem>
          ))
        : people.map((person) => (
            <RailItem key={person.id} width="person">
              <PersonCard person={person} />
            </RailItem>
          ))}
    </PosterRail>
  );
}

function LatestNews() {
  const { data, isLoading } = useNews(8);
  const news = data?.news ?? [];
  if (isLoading || news.length === 0) return null;

  return (
    <PosterRail title="Latest news" href="/news">
      {news.map((article) => (
        <RailItem key={article.id} width="wide">
          <article className="flex h-full flex-col">
            <SiteImage
              src={article.imageUrl}
              alt=""
              ratio="16/9"
              className="rounded-lg"
              sizes="320px"
            />
            <p className="site-meta mt-2 text-xs">
              {article.source} · {formatDate(article.publishedAt)}
            </p>
            {article.url ? (
              <a
                href={article.url}
                target="_blank"
                rel="noreferrer noopener"
                className="site-focus mt-0.5 line-clamp-3 text-sm font-semibold leading-snug hover:underline"
              >
                {article.headline}
              </a>
            ) : (
              <span className="mt-0.5 line-clamp-3 text-sm font-semibold leading-snug">
                {article.headline}
              </span>
            )}
          </article>
        </RailItem>
      ))}
    </PosterRail>
  );
}

/**
 * The state a brand-new deployment is actually in: the site works, the catalog
 * is empty. Saying so — and pointing at the tool that fills it — beats an
 * indefinite bank of skeletons.
 */
function EmptyCatalog() {
  return (
    <section className="site-surface site-hairline rounded-xl border px-6 py-12 text-center">
      <h1 className="site-h2">The catalog is empty</h1>
      <p className="site-meta mx-auto mt-2 max-w-md text-sm">
        No titles have been published yet. Add them through the curation API, or
        seed the catalog from the studio.
      </p>
      <Link
        href="/studio"
        className="site-accent-bg site-focus mt-5 inline-block rounded-full px-4 py-2 text-sm font-semibold"
      >
        Open studio
      </Link>
    </section>
  );
}
