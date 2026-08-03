"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Trophy } from "lucide-react";
import type { PublicAward } from "@saas/contracts/community";
import { nameHref } from "@/lib/site-routes";
import { SectionHeader } from "@/components/site/section-header";
import { SectionState } from "@/components/site/surface-states";
import { useTitleAwards } from "@/components/site/use-title-data";

/**
 * Awards grouped by body and year, winners first inside each edition.
 *
 * The grouping is the page: a flat list of forty nominations is unreadable,
 * while "Academy Awards 2017 — 1 win, 7 nominations" is the sentence people
 * are looking for.
 */
export default function AwardsPage() {
  const { titleId } = useParams<{ titleId: string }>();
  const awards = useTitleAwards(titleId);
  const list = awards.data?.awards ?? [];
  const editions = groupByEdition(list);

  return (
    <div className="space-y-8">
      <SectionHeader title="Awards" as="h1" count={list.length} />
      <SectionState
        loading={awards.isLoading}
        error={awards.isError}
        empty={list.length === 0}
        emptyText="No awards have been recorded for this title yet."
        onRetry={() => void awards.refetch()}
      >
        {editions.map((edition) => {
          const wins = edition.awards.filter((a) => a.isWinner).length;
          return (
            <section key={`${edition.bodySlug}-${edition.year}`}>
              <h2 className="site-h2 mb-1">
                {edition.body} {edition.year}
              </h2>
              <p className="site-meta site-num mb-3 text-xs">
                {wins} {wins === 1 ? "win" : "wins"} · {edition.awards.length - wins} nominations
              </p>
              <ul className="divide-y site-hairline">
                {edition.awards.map((award) => (
                  <li key={award.id} className="flex items-start gap-3 py-2.5">
                    <Trophy
                      className={award.isWinner ? "site-accent h-4 w-4 shrink-0" : "site-meta h-4 w-4 shrink-0"}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">{award.category}</span>
                        {award.isWinner ? (
                          <span className="site-accent ml-2 text-xs font-bold uppercase">Winner</span>
                        ) : null}
                      </p>
                      {award.nameId ? (
                        <Link href={nameHref(award.nameId)} className="site-focus site-meta text-xs hover:underline">
                          View nominee
                        </Link>
                      ) : null}
                      {award.note ? <p className="site-meta text-xs">{award.note}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </SectionState>
    </div>
  );
}

interface Edition {
  bodySlug: string;
  body: string;
  year: number;
  awards: PublicAward[];
}

function groupByEdition(awards: PublicAward[]): Edition[] {
  const editions = new Map<string, Edition>();
  for (const award of awards) {
    const key = `${award.bodySlug}:${award.year}`;
    const existing = editions.get(key);
    if (existing) existing.awards.push(award);
    else
      editions.set(key, {
        bodySlug: award.bodySlug,
        body: award.body,
        year: award.year,
        awards: [award],
      });
  }
  return [...editions.values()]
    .sort((a, b) => b.year - a.year || a.body.localeCompare(b.body))
    .map((edition) => ({
      ...edition,
      // Winners first — that is the answer to "did it win?", which is why
      // anyone opens this page.
      awards: edition.awards.slice().sort((a, b) => Number(b.isWinner) - Number(a.isWinner)),
    }));
}
