"use client";

import Link from "next/link";
import type { PublicNameCredit, PublicTitleCredit } from "@saas/contracts/catalog";
import { cn } from "@/lib/cn";
import { nameHref, titleHref } from "@/lib/site-routes";
import { characterLine, episodeLine } from "@/lib/site-credits";
import { formatYearRange, initials, metaLine } from "@/lib/site-format";
import { SiteImage } from "./site-image";

/** A person on a title's credits — headshot, name, what they did. */
export function TitleCreditRow({
  credit,
  className,
}: {
  credit: PublicTitleCredit;
  className?: string;
}) {
  const role = characterLine(credit);
  const episodes = episodeLine(credit.episodeCount);

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Link href={nameHref(credit.name.id)} className="site-focus shrink-0" tabIndex={-1} aria-hidden="true">
        <SiteImage
          src={credit.name.primaryImage?.url}
          alt=""
          ratio="1/1"
          className="w-12 rounded-full"
          fallback={<span className="text-xs font-semibold">{initials(credit.name.name)}</span>}
        />
      </Link>
      <div className="min-w-0">
        <Link href={nameHref(credit.name.id)} className="site-focus block">
          <span className="text-sm font-semibold hover:underline">{credit.name.name}</span>
        </Link>
        {role ? <p className="site-meta line-clamp-2 text-sm">{role}</p> : null}
        {episodes ? <p className="site-meta site-num text-xs">{episodes}</p> : null}
      </div>
    </div>
  );
}

/** A title on a person's filmography — year, poster, title, what they did. */
export function NameCreditRow({
  credit,
  className,
}: {
  credit: PublicNameCredit;
  className?: string;
}) {
  const years = formatYearRange(credit.title.kind, credit.title.startYear, credit.title.endYear);
  const role = characterLine(credit);

  return (
    <div className={cn("flex gap-3", className)}>
      <Link href={titleHref(credit.title.id)} className="site-focus shrink-0" tabIndex={-1} aria-hidden="true">
        <SiteImage
          src={credit.title.primaryImage?.url}
          alt=""
          ratio="2/3"
          className="w-12 rounded"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="site-meta site-num text-xs">{years || "—"}</p>
        <Link href={titleHref(credit.title.id)} className="site-focus block">
          <span className="text-sm font-semibold hover:underline">{credit.title.primaryTitle}</span>
        </Link>
        <p className="site-meta line-clamp-2 text-sm">
          {metaLine([role, episodeLine(credit.episodeCount)])}
        </p>
      </div>
    </div>
  );
}
