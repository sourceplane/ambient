"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Home, Search, User2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { PRODUCT_NAME } from "@/lib/app-config";
import { FOOTER_COLUMNS, isActiveNav, SITE_TABS } from "@/lib/site-routes";
import { SiteHeader } from "./site-header";

/**
 * The public site's frame.
 *
 * `.site` is applied here and nowhere else: everything inside it picks up the
 * cinematic palette, and the operator console — which lives at its own routes
 * outside this layout — is untouched by it.
 */
export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="site min-h-screen">
      <a
        href="#main"
        className="site-accent-bg sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:rounded focus:px-3 focus:py-2 focus:text-sm focus:font-semibold"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[1400px] px-3 pb-24 sm:px-6 md:pb-12">
        {children}
      </main>
      <SiteFooter />
      <SiteTabBar />
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-16 border-t site-hairline pb-24 pt-10 md:pb-10">
      <div className="mx-auto grid max-w-[1400px] gap-8 px-3 sm:px-6 md:grid-cols-4">
        {FOOTER_COLUMNS.map((column) => (
          <div key={column.label}>
            <p className="mb-2 text-sm font-semibold">{column.label}</p>
            <ul className="space-y-1.5">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="site-focus site-meta text-sm hover:site-accent hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-8 max-w-[1400px] border-t site-hairline px-3 pt-6 sm:px-6">
        <p className="site-meta text-xs">
          {PRODUCT_NAME} — a catalog of titles, people and the things people say about them.
          Operated on the {PRODUCT_NAME} platform.
        </p>
      </div>
    </footer>
  );
}

const TAB_ICONS = [Home, Search, Bookmark, User2];

/**
 * Mobile tab bar. Four destinations, no menus — the drawer covers breadth, this
 * covers the things people return to.
 */
function SiteTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="site-surface pb-safe fixed inset-x-0 bottom-0 z-40 border-t site-hairline md:hidden"
    >
      <ul className="flex">
        {SITE_TABS.map((tab, index) => {
          const Icon = TAB_ICONS[index] ?? Home;
          const active = isActiveNav(pathname, tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "site-focus flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium",
                  active ? "site-accent" : "site-meta",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
