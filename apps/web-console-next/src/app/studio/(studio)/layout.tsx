"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Clapperboard } from "lucide-react";
import { cn } from "@/lib/cn";
import { PRODUCT_NAME } from "@/lib/app-config";
import { useRequireAuth } from "@/lib/use-async";
import { Skeleton } from "@/components/ui/skeleton";
import { STUDIO_NAV, isStudioNavActive, useEditorialOrg } from "@/lib/studio";

/**
 * The catalog studio's shell.
 *
 * Deliberately not the platform console's shell. That one is org-slug-scoped
 * in the URL (`/studio/orgs/:slug/...`) and its sidebar is about projects,
 * environments and billing. Catalog curation is editorial — one shared
 * database, org membership used only to answer "may this person edit" — so
 * forcing it through org-scoped chrome would put a tenant boundary in front of
 * something that does not have one.
 *
 * The two surfaces link to each other; neither wraps the other.
 */
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  const ready = useRequireAuth();
  const pathname = usePathname();
  const { org } = useEditorialOrg();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md pt-safe">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-4 md:px-8">
          <Link href="/studio" className="flex shrink-0 items-center gap-2 font-semibold">
            <Clapperboard className="h-5 w-5 text-primary" aria-hidden="true" />
            <span>{PRODUCT_NAME} studio</span>
          </Link>

          <nav aria-label="Studio" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {STUDIO_NAV.map((item) => {
              const active = isStudioNavActive(pathname, item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-3">
            {/* Say which organization a curation write is attributed to. The
                studio picks one rather than asking, so it owes the operator a
                visible answer. */}
            {org ? (
              <span className="hidden text-xs text-muted-foreground lg:inline">
                editing as <span className="font-medium text-foreground">{org.name}</span>
              </span>
            ) : null}
            <Link
              href="/"
              className="hidden items-center gap-1 text-sm text-muted-foreground hover:text-foreground sm:flex"
            >
              View site
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <Link
              href="/studio/orgs"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              Platform
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-6 md:px-8">
        {ready ? children : <StudioSkeleton />}
      </main>
    </div>
  );
}

function StudioSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    </div>
  );
}
