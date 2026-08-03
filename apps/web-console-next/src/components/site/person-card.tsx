"use client";

import Link from "next/link";
import type { PublicNameSummary } from "@saas/contracts/catalog";
import { cn } from "@/lib/cn";
import { nameHref } from "@/lib/site-routes";
import { initials } from "@/lib/site-format";
import { SiteImage } from "./site-image";

const PROFESSION_LABELS: Record<string, string> = {
  actor: "Actor",
  actress: "Actress",
  director: "Director",
  writer: "Writer",
  producer: "Producer",
  composer: "Composer",
  cinematographer: "Cinematographer",
  editor: "Editor",
  production_designer: "Production Designer",
  casting_director: "Casting Director",
  animation_department: "Animation",
  visual_effects: "Visual Effects",
  stunts: "Stunts",
  soundtrack: "Soundtrack",
};

export function professionLabel(profession: string): string {
  return (
    PROFESSION_LABELS[profession] ??
    profession.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/**
 * A person, circular. The headshot is round and the poster is rectangular for
 * the same reason it is everywhere else: shape alone tells you which kind of
 * thing you are looking at before you read anything.
 *
 * `knownFor` is optional — the caller supplies it where it has been fetched,
 * and the card does not go looking for it.
 */
export function PersonCard({
  person,
  knownFor,
  className,
}: {
  person: PublicNameSummary;
  knownFor?: string | null;
  className?: string;
}) {
  const subtitle = knownFor ?? person.professions.map(professionLabel).slice(0, 2).join(", ");

  return (
    <div className={cn("group flex w-full flex-col items-center text-center", className)}>
      <Link href={nameHref(person.id)} className="site-focus block w-full" aria-label={person.name}>
        <SiteImage
          src={person.primaryImage?.url}
          alt=""
          ratio="1/1"
          sizes="(max-width: 640px) 30vw, 140px"
          fallback={<span className="text-lg font-semibold">{initials(person.name)}</span>}
          className={cn(
            "mx-auto w-full rounded-full shadow-[var(--site-shadow-poster)]",
            "transition-transform duration-200 ease-out",
            "group-hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none",
          )}
        />
      </Link>
      <Link href={nameHref(person.id)} className="site-focus mt-2 block">
        <span className="line-clamp-2 text-sm font-semibold leading-snug hover:underline">
          {person.name}
        </span>
      </Link>
      {subtitle ? <p className="site-meta line-clamp-1 text-xs">{subtitle}</p> : null}
    </div>
  );
}

export function PersonCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex w-full animate-pulse flex-col items-center", className)} aria-hidden="true">
      <div className="site-surface-2 w-full rounded-full" style={{ aspectRatio: "1/1" }} />
      <div className="site-surface-2 mt-2 h-3.5 w-3/4 rounded" />
      <div className="site-surface-2 mt-1.5 h-3 w-1/2 rounded" />
    </div>
  );
}
