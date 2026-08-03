"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { TitleKind } from "@saas/contracts/catalog";
import { cn } from "@/lib/cn";
import { activeTitleTab, titleTabHref, titleTabs } from "@/lib/site-title";

/**
 * The title page's sub-navigation.
 *
 * A scrolling row rather than an overflow menu: every destination stays visible
 * and linkable, which matters because these are the URLs people share
 * ("/quotes", "/parentalguide"). Series-only tabs are absent on a film rather
 * than present and empty.
 */
export function TitleTabs({
  titleId,
  kind,
  className,
}: {
  titleId: string;
  kind: TitleKind;
  className?: string;
}) {
  const pathname = usePathname();
  const active = activeTitleTab(pathname, titleId);

  return (
    <nav
      aria-label="Title sections"
      className={cn("site-rail site-hairline -mx-3 overflow-x-auto border-b px-3 sm:-mx-6 sm:px-6", className)}
    >
      <ul className="flex gap-1">
        {titleTabs(kind).map((tab) => {
          const current = tab.slug === active;
          return (
            <li key={tab.slug || "overview"}>
              <Link
                href={titleTabHref(titleId, tab.slug)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "site-focus block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  current
                    ? "site-accent border-[hsl(var(--site-accent))]"
                    : "site-meta border-transparent hover:site-accent",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
