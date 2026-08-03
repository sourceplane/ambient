"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { PublicTitleConnection } from "@saas/contracts/catalog";
import { formatDate, formatMoney, formatRating, formatVotes, truncate } from "@/lib/site-format";
import { headlineCredits } from "@/lib/site-credits";
import {
  factLabel,
  interestingShare,
  isSeries,
  metascoreClass,
  parentsGuideLabel,
  severityFraction,
} from "@/lib/site-title";
import { keywordHref, nameHref, titleHref } from "@/lib/site-routes";
import { SectionHeader } from "@/components/site/section-header";
import { PosterRail, RailItem } from "@/components/site/poster-rail";
import { PosterCard } from "@/components/site/poster-card";
import { TitleCreditRow } from "@/components/site/credit-row";
import { ChipGroup } from "@/components/site/chip-group";
import { MediaGrid, VideoCard } from "@/components/site/media-grid";
import { RatingHistogram } from "@/components/site/rating-histogram";
import { DetailList, detailRow } from "@/components/site/detail-list";
import { SpoilerVeil } from "@/components/site/spoiler-veil";
import {
  useParentsGuide,
  useTitle,
  useTitleAwards,
  useTitleBoxOffice,
  useTitleCompanies,
  useTitleConnections,
  useTitleCredits,
  useTitleFacts,
  useTitleImages,
  useTitleKeywords,
  useTitleMetascore,
  useTitleRating,
  useTitleReleaseDates,
  useTitleReviews,
  useTitleTechnical,
  useTitleVideos,
} from "@/components/site/use-title-data";

/**
 * The title overview.
 *
 * Ordered the way someone reads a film page: who made it, what it is about,
 * what it looks like, how it is rated, what people said, what else to watch,
 * and only then the reference material. Every section renders only if it has
 * something — a page for a sparse record is short, not full of empty headings.
 */
export default function TitleOverviewPage() {
  const { titleId } = useParams<{ titleId: string }>();

  const title = useTitle(titleId);
  const credits = useTitleCredits(titleId, { limit: 40 });
  const record = title.data?.title;

  if (!record) return null;

  const { directors, writers, stars } = headlineCredits(credits.data?.credits ?? []);

  return (
    <div className="space-y-10">
      {directors.length > 0 || writers.length > 0 || stars.length > 0 ? (
        <section aria-label="Key credits" className="site-hairline divide-y border-y">
          <CreditLine label={directors.length === 1 ? "Director" : "Directors"} people={directors} />
          <CreditLine label={writers.length === 1 ? "Writer" : "Writers"} people={writers} />
          <CreditLine label="Stars" people={stars} />
        </section>
      ) : null}

      <TopCast titleId={titleId} />
      <Storyline titleId={titleId} />
      <Media titleId={titleId} />
      <RatingsPanel titleId={titleId} />
      <Reviews titleId={titleId} />
      <MoreLikeThis titleId={titleId} />
      {isSeries(record.kind) ? <EpisodesTeaser titleId={titleId} /> : null}
      <DidYouKnow titleId={titleId} />
      <ParentsGuideSummary titleId={titleId} />
      <AwardsSummary titleId={titleId} />
      <Details titleId={titleId} />
      <BoxOffice titleId={titleId} />
      <TechnicalSpecs titleId={titleId} />
    </div>
  );
}

function CreditLine({
  label,
  people,
}: {
  label: string;
  people: Array<{ id: string; name: { id: string; name: string } }>;
}) {
  if (people.length === 0) return null;
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[120px_1fr] sm:gap-4">
      <span className="site-meta text-sm font-medium">{label}</span>
      <span className="text-sm">
        {people.map((person, index) => (
          <React.Fragment key={person.id}>
            {index > 0 ? <span className="site-meta"> · </span> : null}
            <Link href={nameHref(person.name.id)} className="site-focus font-medium hover:underline">
              {person.name.name}
            </Link>
          </React.Fragment>
        ))}
      </span>
    </div>
  );
}

function TopCast({ titleId }: { titleId: string }) {
  const credits = useTitleCredits(titleId, { category: "cast", limit: 18 });
  const cast = credits.data?.credits ?? [];
  if (cast.length === 0) return null;

  return (
    <section>
      <SectionHeader title="Top cast" href={`${titleHref(titleId)}/fullcredits`} count={cast.length} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cast.map((credit) => (
          <TitleCreditRow key={credit.id} credit={credit} />
        ))}
      </div>
    </section>
  );
}

function Storyline({ titleId }: { titleId: string }) {
  const title = useTitle(titleId);
  const keywords = useTitleKeywords(titleId);
  const record = title.data?.title;
  const summary = record?.plotSummary ?? record?.plotOutline;
  const words = keywords.data?.keywords ?? [];
  if (!summary && words.length === 0 && !record?.synopsis) return null;

  return (
    <section>
      <SectionHeader title="Storyline" />
      {summary ? <p className="max-w-3xl text-sm leading-relaxed">{summary}</p> : null}
      {record?.synopsis ? (
        <div className="mt-4">
          <p className="site-meta mb-1 text-xs font-semibold uppercase tracking-wide">Synopsis</p>
          {/* A synopsis is the whole plot by definition — it is veiled by
              default, unlike the outline above it. */}
          <SpoilerVeil>
            <p className="max-w-3xl whitespace-pre-line text-sm leading-relaxed">{record.synopsis}</p>
          </SpoilerVeil>
        </div>
      ) : null}
      {words.length > 0 ? (
        <div className="mt-4">
          <p className="site-meta mb-2 text-xs font-semibold uppercase tracking-wide">Keywords</p>
          <ChipGroup
            size="sm"
            chips={words.slice(0, 12).map((k) => ({ label: k.name, href: keywordHref(k.slug) }))}
          />
        </div>
      ) : null}
    </section>
  );
}

function Media({ titleId }: { titleId: string }) {
  const videos = useTitleVideos(titleId);
  const images = useTitleImages(titleId, 12);
  const clips = videos.data?.videos ?? [];
  const stills = (images.data?.images ?? []).filter((i) => i.kind !== "poster");
  if (clips.length === 0 && stills.length === 0) return null;

  return (
    <section className="space-y-8">
      {clips.length > 0 ? (
        <PosterRail title="Videos" href={`${titleHref(titleId)}/videogallery`}>
          {clips.slice(0, 12).map((video) => (
            <RailItem key={video.id} width="wide">
              <VideoCard video={video} />
            </RailItem>
          ))}
        </PosterRail>
      ) : null}
      {stills.length > 0 ? (
        <div>
          <SectionHeader title="Photos" href={`${titleHref(titleId)}/mediaindex`} count={stills.length} />
          <MediaGrid images={stills.slice(0, 8)} />
        </div>
      ) : null}
    </section>
  );
}

function RatingsPanel({ titleId }: { titleId: string }) {
  const rating = useTitleRating(titleId);
  const metascore = useTitleMetascore(titleId);
  const summary = rating.data?.rating;
  const meta = metascore.data?.metascore;
  if (!summary || summary.voteCount === 0) return null;

  return (
    <section>
      <SectionHeader title="Ratings" href={`${titleHref(titleId)}/ratings`} />
      <div className="grid gap-6 sm:grid-cols-[240px_1fr]">
        <div>
          <p className="site-num text-4xl font-extrabold">
            {formatRating(summary.average)}
            <span className="site-meta text-xl font-normal">/10</span>
          </p>
          <p className="site-meta site-num text-sm">{formatVotes(summary.voteCount)} votes</p>
          {meta && meta.metascore !== null ? (
            <p className="mt-4">
              <span className="site-meta mr-2 text-xs font-semibold uppercase tracking-wide">
                Metascore
              </span>
              <span
                className={`site-num inline-block rounded px-2 py-0.5 text-sm font-bold ${metascoreClass(meta.band)}`}
              >
                {meta.metascore}
              </span>
              <span className="site-meta site-num ml-2 text-xs">
                {meta.criticCount} critics
              </span>
            </p>
          ) : null}
        </div>
        <RatingHistogram distribution={summary.distribution} />
      </div>
    </section>
  );
}

function Reviews({ titleId }: { titleId: string }) {
  const reviews = useTitleReviews(titleId, { sort: "helpfulness", limit: 3 });
  const list = reviews.data?.reviews ?? [];
  if (list.length === 0) return null;

  return (
    <section>
      <SectionHeader title="User reviews" href={`${titleHref(titleId)}/reviews`} />
      <div className="grid gap-4 md:grid-cols-3">
        {list.map((review) => (
          <article key={review.id} className="site-surface site-hairline rounded-lg border p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="line-clamp-2 text-sm font-semibold">{review.headline}</h3>
              {review.rating !== null ? (
                <span className="site-rating site-num shrink-0 text-sm font-bold">
                  {review.rating}/10
                </span>
              ) : null}
            </div>
            <SpoilerVeil revealed={!review.hasSpoilers} className="mt-2">
              <p className="site-meta line-clamp-4 text-sm leading-relaxed">
                {truncate(review.body, 220)}
              </p>
            </SpoilerVeil>
            <p className="site-meta site-num mt-3 text-xs">
              {formatVotes(review.helpfulCount)} found this helpful ·{" "}
              {formatDate(review.submittedAt)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function MoreLikeThis({ titleId }: { titleId: string }) {
  const connections = useTitleConnections(titleId);
  const list: PublicTitleConnection[] = connections.data?.connections ?? [];
  if (list.length === 0) return null;

  return (
    <PosterRail title="More like this">
      {list.slice(0, 20).map((connection, index) => (
        <RailItem key={`${connection.title.id}-${index}`}>
          <PosterCard title={connection.title} />
        </RailItem>
      ))}
    </PosterRail>
  );
}

function EpisodesTeaser({ titleId }: { titleId: string }) {
  return (
    <section>
      <SectionHeader title="Episodes" href={`${titleHref(titleId)}/episodes`} />
      <p className="site-meta text-sm">
        Browse every season and episode, with air dates and ratings.
      </p>
    </section>
  );
}

function DidYouKnow({ titleId }: { titleId: string }) {
  const facts = useTitleFacts(titleId);
  const list = facts.data?.facts ?? [];
  if (list.length === 0) return null;

  // One teaser per kind, so the section shows the *range* of what is there
  // rather than five pieces of trivia and nothing else.
  const seen = new Set<string>();
  const teasers = list.filter((fact) => {
    if (seen.has(fact.kind)) return false;
    seen.add(fact.kind);
    return true;
  });

  return (
    <section>
      <SectionHeader title="Did you know" href={`${titleHref(titleId)}/trivia`} />
      <div className="grid gap-4 sm:grid-cols-2">
        {teasers.map((fact) => (
          <div key={fact.id}>
            <p className="site-meta mb-1 text-xs font-semibold uppercase tracking-wide">
              {factLabel(fact.kind)}
            </p>
            <SpoilerVeil revealed={!fact.hasSpoilers}>
              <p className="line-clamp-4 text-sm leading-relaxed">{fact.body}</p>
            </SpoilerVeil>
            {interestingShare(fact.interestingVotes, fact.totalVotes) !== null ? (
              <p className="site-meta site-num mt-1 text-xs">
                {interestingShare(fact.interestingVotes, fact.totalVotes)}% found this interesting
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function ParentsGuideSummary({ titleId }: { titleId: string }) {
  const guide = useParentsGuide(titleId);
  const tallies = guide.data?.severity ?? [];
  if (tallies.length === 0) return null;

  return (
    <section>
      <SectionHeader title="Parents guide" href={`${titleHref(titleId)}/parentalguide`} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {tallies.map((tally) => {
          const fill = severityFraction(tally.severity);
          return (
            <li key={tally.category} className="flex items-center gap-3">
              <span className="w-48 shrink-0 text-sm">{parentsGuideLabel(tally.category)}</span>
              <span className="site-surface-2 h-2 flex-1 overflow-hidden rounded-full">
                {fill !== null ? (
                  <span
                    className="site-accent-bg block h-full rounded-full"
                    style={{ width: `${fill * 100}%` }}
                  />
                ) : null}
              </span>
              <span className="site-meta site-num w-20 shrink-0 text-right text-xs capitalize">
                {tally.severity ?? "no votes"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AwardsSummary({ titleId }: { titleId: string }) {
  const awards = useTitleAwards(titleId);
  const list = awards.data?.awards ?? [];
  if (list.length === 0) return null;

  const wins = list.filter((a) => a.isWinner).length;

  return (
    <section>
      <SectionHeader title="Awards" href={`${titleHref(titleId)}/awards`} />
      <p className="site-num text-sm">
        <span className="font-semibold">{wins}</span> wins ·{" "}
        <span className="font-semibold">{list.length - wins}</span> nominations
      </p>
    </section>
  );
}

function Details({ titleId }: { titleId: string }) {
  const title = useTitle(titleId);
  const releases = useTitleReleaseDates(titleId);
  const technical = useTitleTechnical(titleId);
  const companies = useTitleCompanies(titleId);
  const record = title.data?.title;
  if (!record) return null;

  const firstRelease = releases.data?.releaseDates[0];
  const production = (companies.data?.companies ?? []).filter((c) => c.role === "production");

  const rows = [
    ...detailRow("Release date", firstRelease ? `${formatDate(firstRelease.releasedOn)} (${firstRelease.country})` : null),
    ...detailRow("Countries of origin", technical.data?.countries.join(", ")),
    ...detailRow("Languages", technical.data?.languages.join(", ")),
    ...detailRow(
      "Production companies",
      production.length > 0 ? production.map((c) => c.company.name).join(", ") : null,
    ),
    ...detailRow(
      "Filming locations",
      technical.data?.filmingLocations.map((l) => l.location).join(", "),
    ),
  ];
  if (rows.length === 0) return null;

  return (
    <section>
      <SectionHeader title="Details" href={`${titleHref(titleId)}/releaseinfo`} />
      <DetailList rows={rows} />
    </section>
  );
}

function BoxOffice({ titleId }: { titleId: string }) {
  const boxOffice = useTitleBoxOffice(titleId);
  const data = boxOffice.data?.boxOffice;
  if (!data) return null;

  const rows = [
    ...detailRow("Budget", formatMoney(data.budgetCents, data.currency) || null),
    ...detailRow(
      "Opening weekend",
      formatMoney(data.openingWeekendCents, data.currency)
        ? `${formatMoney(data.openingWeekendCents, data.currency)}${data.openingWeekendCountry ? ` (${data.openingWeekendCountry})` : ""}`
        : null,
    ),
    ...detailRow("Gross US & Canada", formatMoney(data.grossDomesticCents, data.currency) || null),
    ...detailRow("Gross worldwide", formatMoney(data.grossWorldwideCents, data.currency) || null),
  ];
  if (rows.length === 0) return null;

  return (
    <section>
      <SectionHeader title="Box office" />
      <DetailList rows={rows} />
    </section>
  );
}

function TechnicalSpecs({ titleId }: { titleId: string }) {
  const technical = useTitleTechnical(titleId);
  const specs = technical.data?.technicalSpecs ?? [];
  if (specs.length === 0) return null;

  return (
    <section>
      <SectionHeader title="Technical specs" href={`${titleHref(titleId)}/technical`} />
      <DetailList
        rows={specs.slice(0, 6).map((spec) => ({
          label: spec.spec.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          value: spec.note ? `${spec.value} (${spec.note})` : spec.value,
        }))}
      />
    </section>
  );
}
