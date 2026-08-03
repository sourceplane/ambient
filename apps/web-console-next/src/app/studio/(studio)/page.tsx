"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FilmIcon, Plus, ShieldQuestion, Users } from "lucide-react";
import { useSession } from "@/lib/session";
import { useApiQuery } from "@/lib/query";
import { wrap } from "@/lib/api";
import { useEditorialOrg } from "@/lib/studio";
import { Skeleton } from "@/components/ui/skeleton";

const QUEUE_PAGE = 50;

/**
 * Studio overview.
 *
 * Shows what an operator can act on right now — pending moderation, what has
 * been curated recently — and nothing it would have to invent. There is no
 * "12,481 titles" tile because no endpoint returns a catalog total; a number
 * on a dashboard that nobody computed is worse than no number.
 */
export default function StudioHomePage() {
  const router = useRouter();
  const { client } = useSession();
  const { org, loading: orgLoading, needsOnboarding } = useEditorialOrg();

  React.useEffect(() => {
    // No organization means no permission to curate anything, and the platform
    // already owns that flow.
    if (needsOnboarding) router.replace("/studio/onboarding");
  }, [needsOnboarding, router]);

  const titles = useApiQuery(["studio", "recent-titles"], () =>
    wrap(async () => (await client.catalog.listTitles({ limit: 8 })).titles),
  );
  const people = useApiQuery(["studio", "recent-people"], () =>
    wrap(async () => (await client.catalog.listNames({ limit: 8 })).names),
  );
  const contributions = useApiQuery(["studio", "queue", "contributions"], () =>
    wrap(async () =>
      (await client.community.listModerationQueue({ limit: QUEUE_PAGE })).contributions,
    ),
  );
  const reviews = useApiQuery(["studio", "queue", "reviews"], () =>
    wrap(async () => (await client.reviews.listModerationQueue({ limit: QUEUE_PAGE })).reviews),
  );

  const emptyCatalog =
    !titles.loading && !people.loading && (titles.data?.length ?? 0) === 0 && (people.data?.length ?? 0) === 0;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Studio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Curate the catalog and work the moderation queues.
          {org ? (
            <>
              {" "}
              Edits are attributed to <span className="font-medium text-foreground">{org.name}</span>.
            </>
          ) : null}
        </p>
      </header>

      {emptyCatalog ? <EmptyCatalog /> : null}

      <section className="grid gap-4 sm:grid-cols-2">
        <QueueCard
          href="/studio/moderation"
          icon={<ShieldQuestion className="h-4 w-4" aria-hidden="true" />}
          label="Contributions awaiting review"
          count={contributions.data?.length ?? null}
          loading={contributions.loading}
          error={contributions.error}
        />
        <QueueCard
          href="/studio/moderation"
          icon={<ShieldQuestion className="h-4 w-4" aria-hidden="true" />}
          label="Reviews awaiting moderation"
          count={reviews.data?.length ?? null}
          loading={reviews.loading}
          error={reviews.error}
        />
      </section>

      <RecentSection
        title="Recent titles"
        href="/studio/catalog/titles"
        newHref="/studio/catalog/titles?new=1"
        newLabel="New title"
        icon={<FilmIcon className="h-4 w-4" aria-hidden="true" />}
        loading={titles.loading || orgLoading}
        items={(titles.data ?? []).map((t) => ({
          id: t.id,
          href: `/studio/catalog/titles/${t.id}`,
          primary: t.primaryTitle,
          secondary: [t.kind.replace(/_/g, " "), t.startYear ? String(t.startYear) : null]
            .filter(Boolean)
            .join(" · "),
        }))}
        emptyText="No titles yet."
      />

      <RecentSection
        title="Recent people"
        href="/studio/catalog/people"
        newHref="/studio/catalog/people?new=1"
        newLabel="New person"
        icon={<Users className="h-4 w-4" aria-hidden="true" />}
        loading={people.loading || orgLoading}
        items={(people.data ?? []).map((p) => ({
          id: p.id,
          href: `/studio/catalog/people/${p.id}`,
          primary: p.name,
          secondary: p.professions.map((x) => x.replace(/_/g, " ")).join(", "),
        }))}
        emptyText="No people yet."
      />
    </div>
  );
}

function EmptyCatalog() {
  return (
    <section className="rounded-lg border border-dashed p-6">
      <h2 className="text-base font-semibold">The catalog is empty</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Nothing has been published yet, so the public site shows its empty state. Create a
        title here, or seed a starter set from the repo with{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          node tooling/seed/catalog.mjs
        </code>
        .
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/studio/catalog/titles?new=1"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create the first title
        </Link>
        <Link
          href="/studio/catalog/people?new=1"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create a person
        </Link>
      </div>
    </section>
  );
}

function QueueCard({
  href,
  icon,
  label,
  count,
  loading,
  error,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  count: number | null;
  loading: boolean;
  error: { code: string; message: string } | null;
}) {
  return (
    <Link href={href} className="rounded-lg border p-4 transition-colors hover:bg-muted/50">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </span>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-16" />
      ) : error ? (
        // A moderator-only queue 404s for a non-moderator. That is not an
        // error worth shouting about on an overview — it means "not yours".
        <p className="mt-2 text-sm text-muted-foreground">
          {error.code === "not_found" ? "Not available to your role" : error.message}
        </p>
      ) : (
        <p className="mt-1 text-3xl font-semibold tabular-nums">
          {count === QUEUE_PAGE ? `${QUEUE_PAGE}+` : (count ?? 0)}
        </p>
      )}
    </Link>
  );
}

function RecentSection({
  title,
  href,
  newHref,
  newLabel,
  icon,
  loading,
  items,
  emptyText,
}: {
  title: string;
  href: string;
  newHref: string;
  newLabel: string;
  icon: React.ReactNode;
  loading: boolean;
  items: Array<{ id: string; href: string; primary: string; secondary: string }>;
  emptyText: string;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          {icon}
          {title}
        </h2>
        <div className="flex items-center gap-3">
          <Link
            href={newHref}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {newLabel}
          </Link>
          <Link
            href={href}
            className="inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground"
          >
            See all
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={item.href} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.primary}</span>
                  {item.secondary ? (
                    <span className="block truncate text-xs capitalize text-muted-foreground">
                      {item.secondary}
                    </span>
                  ) : null}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
