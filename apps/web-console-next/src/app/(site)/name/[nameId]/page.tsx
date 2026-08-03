"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Trophy } from "lucide-react";
import { isNotFound } from "@/lib/catalog-api";
import { formatDate, initials } from "@/lib/site-format";
import { groupByDepartment, sortCreditsByYear } from "@/lib/site-credits";
import { professionLabel } from "@/components/site/person-card";
import { SectionHeader } from "@/components/site/section-header";
import { PosterRail, RailItem } from "@/components/site/poster-rail";
import { PosterCard } from "@/components/site/poster-card";
import { NameCreditRow } from "@/components/site/credit-row";
import { MediaGrid } from "@/components/site/media-grid";
import { DetailList, detailRow } from "@/components/site/detail-list";
import { SiteImage } from "@/components/site/site-image";
import { SectionSkeleton, SurfaceError, SurfaceMissing } from "@/components/site/surface-states";
import {
  useKnownFor,
  useName,
  useNameAwards,
  useNameCredits,
  useNameImages,
} from "@/components/site/use-title-data";

/**
 * A person's page.
 *
 * Bio and known-for above the fold, then the filmography grouped by department
 * — because "what has this director directed" and "what has this director
 * produced" are different questions, and a single merged list answers neither.
 */
export default function NamePage() {
  const { nameId } = useParams<{ nameId: string }>();
  const name = useName(nameId);

  if (name.isLoading) return <SectionSkeleton />;
  if (name.isError) {
    return isNotFound(name.error) ? (
      <SurfaceMissing
        heading="We don't have that person"
        body="The link may be wrong, or the record may not be published."
      />
    ) : (
      <SurfaceError onRetry={() => void name.refetch()} />
    );
  }

  const person = name.data!.name;

  return (
    <div className="space-y-10 pt-6">
      <header className="flex flex-col gap-5 sm:flex-row sm:gap-6">
        <SiteImage
          src={person.primaryImage?.url}
          alt=""
          ratio="1/1"
          priority
          sizes="(max-width: 640px) 40vw, 200px"
          className="w-32 shrink-0 rounded-full shadow-[var(--site-shadow-poster)] sm:w-48"
          fallback={<span className="text-2xl font-semibold">{initials(person.name)}</span>}
        />
        <div className="min-w-0 flex-1">
          <h1 className="site-display">{person.name}</h1>
          {person.professions.length > 0 ? (
            <p className="site-meta mt-1 text-sm">
              {person.professions.map(professionLabel).join(" · ")}
            </p>
          ) : null}
          {person.miniBio ? (
            <Biography text={person.miniBio} author={person.bioAuthor} />
          ) : null}
        </div>
      </header>

      <KnownFor nameId={nameId} />
      <Filmography nameId={nameId} />
      <Photos nameId={nameId} />
      <Awards nameId={nameId} />

      <section>
        <SectionHeader title="Personal details" />
        <DetailList
          rows={[
            ...detailRow(
              "Born",
              person.birthDate
                ? `${formatDate(person.birthDate)}${person.birthPlace ? ` · ${person.birthPlace}` : ""}`
                : person.birthPlace,
            ),
            ...detailRow(
              "Died",
              person.deathDate
                ? `${formatDate(person.deathDate)}${person.deathPlace ? ` · ${person.deathPlace}` : ""}`
                : null,
            ),
            ...detailRow("Cause of death", person.deathCause),
            ...detailRow("Height", person.heightCm ? `${person.heightCm} cm` : null),
          ]}
        />
      </section>
    </div>
  );
}

/**
 * A mini-bio is often several paragraphs. It collapses to four lines with a
 * real expand control rather than being truncated with no way back — a
 * biography the reader cannot finish is worse than no biography.
 */
function Biography({ text, author }: { text: string; author: string | null }) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div className="mt-3 max-w-3xl">
      <p className={expanded ? "whitespace-pre-line text-sm leading-relaxed" : "line-clamp-4 whitespace-pre-line text-sm leading-relaxed"}>
        {text}
      </p>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="site-focus site-accent mt-1 text-sm font-medium hover:underline"
      >
        {expanded ? "Show less" : "Read more"}
      </button>
      {author ? <p className="site-meta mt-1 text-xs">— {author}</p> : null}
    </div>
  );
}

function KnownFor({ nameId }: { nameId: string }) {
  const knownFor = useKnownFor(nameId);
  const list = knownFor.data?.knownFor ?? [];
  if (list.length === 0) return null;

  return (
    <PosterRail title="Known for">
      {list.map((entry) => (
        <RailItem key={entry.title.id}>
          <PosterCard title={entry.title} />
        </RailItem>
      ))}
    </PosterRail>
  );
}

function Filmography({ nameId }: { nameId: string }) {
  const credits = useNameCredits(nameId);
  const groups = groupByDepartment(credits.data?.credits ?? []);
  if (groups.length === 0) return null;

  return (
    <section className="space-y-8">
      <SectionHeader title="Credits" count={credits.data?.credits.length} />
      {groups.map((group) => (
        <DepartmentCredits
          key={group.department}
          label={group.label}
          credits={sortCreditsByYear(group.credits)}
        />
      ))}
    </section>
  );
}

const COLLAPSED = 8;

function DepartmentCredits({
  label,
  credits,
}: {
  label: string;
  credits: ReturnType<typeof sortCreditsByYear>;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const shown = expanded ? credits : credits.slice(0, COLLAPSED);

  return (
    <div>
      <h3 className="site-h2 mb-3">
        {label}
        <span className="site-meta site-num ml-2 text-sm font-normal">{credits.length}</span>
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {shown.map((credit) => (
          <NameCreditRow key={credit.id} credit={credit} />
        ))}
      </div>
      {credits.length > COLLAPSED ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="site-focus site-accent mt-3 text-sm font-medium hover:underline"
        >
          {expanded ? "Show fewer" : `Show all ${credits.length}`}
        </button>
      ) : null}
    </div>
  );
}

function Photos({ nameId }: { nameId: string }) {
  const images = useNameImages(nameId);
  const list = images.data?.images ?? [];
  if (list.length === 0) return null;

  return (
    <section>
      <SectionHeader title="Photos" count={list.length} />
      <MediaGrid images={list.slice(0, 12)} />
    </section>
  );
}

function Awards({ nameId }: { nameId: string }) {
  const awards = useNameAwards(nameId);
  const list = awards.data?.awards ?? [];
  if (list.length === 0) return null;

  const wins = list.filter((a) => a.isWinner).length;

  return (
    <section>
      <SectionHeader title="Awards" count={list.length} />
      <p className="site-num mb-3 text-sm">
        <span className="font-semibold">{wins}</span> wins ·{" "}
        <span className="font-semibold">{list.length - wins}</span> nominations
      </p>
      <ul className="divide-y site-hairline">
        {list.slice(0, 20).map((award) => (
          <li key={award.id} className="flex items-start gap-3 py-2.5 text-sm">
            <Trophy
              className={award.isWinner ? "site-accent h-4 w-4 shrink-0" : "site-meta h-4 w-4 shrink-0"}
              aria-hidden="true"
            />
            <span>
              <span className="site-num site-meta mr-2">{award.year}</span>
              <span className="font-medium">{award.body}</span>
              <span className="site-meta"> — {award.category}</span>
              {award.isWinner ? (
                <span className="site-accent ml-2 text-xs font-bold uppercase">Winner</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
