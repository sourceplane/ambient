"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Bookmark,
  ChevronDown,
  LogIn,
  Menu,
  Moon,
  Search,
  Sun,
  User2,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";
import { PRODUCT_NAME } from "@/lib/app-config";
import { isActiveNav, SITE_MENUS, STUDIO_ROOT } from "@/lib/site-routes";
import { MegaSearch, useSearchOverlay } from "./mega-search";

/**
 * The site's top bar.
 *
 * Translucent and sticky, with the hairline appearing only once the page has
 * scrolled — over a poster hero, a permanent border reads as a seam. Search is
 * the widest thing in the bar because it is the most-used control on a
 * catalogue this size.
 */
export function SiteHeader({ watchlistCount }: { watchlistCount?: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const { token } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const search = useSearchOverlay();
  const [scrolled, setScrolled] = React.useState(false);
  const [drawer, setDrawer] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // A navigation should close whatever menu started it.
  React.useEffect(() => setDrawer(false), [pathname]);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 pt-safe transition-colors duration-200",
          scrolled ? "border-b site-hairline bg-[hsl(var(--site-bg)/0.85)] backdrop-blur-md" : "bg-transparent",
        )}
      >
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-3 sm:gap-4 sm:px-6">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
            className="site-focus -ml-1 rounded p-2 md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link href="/" className="site-focus flex shrink-0 items-center gap-2" aria-label={`${PRODUCT_NAME} home`}>
            <span className="site-accent-bg grid h-7 w-7 place-items-center rounded font-black">
              a
            </span>
            <span className="hidden text-lg font-extrabold tracking-tight sm:inline">
              {PRODUCT_NAME}
            </span>
          </Link>

          <nav aria-label="Categories" className="hidden items-center gap-1 md:flex">
            {SITE_MENUS.map((menu) => (
              <HeaderMenu key={menu.label} menu={menu} pathname={pathname} />
            ))}
          </nav>

          <button
            type="button"
            onClick={() => search.setOpen(true)}
            className="site-focus site-surface-2 site-hairline ml-auto flex h-9 flex-1 items-center gap-2 rounded-full border px-3 text-left md:max-w-md"
          >
            <Search className="site-meta h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="site-meta truncate text-sm">Search titles, people…</span>
            <kbd className="site-meta ml-auto hidden rounded border site-hairline px-1.5 py-0.5 font-mono text-[10px] lg:inline">
              /
            </kbd>
          </button>

          <Link
            href="/watchlist"
            className="site-focus relative hidden items-center gap-1.5 rounded px-2 py-1.5 text-sm font-medium hover:site-accent sm:flex"
          >
            <Bookmark className="h-4 w-4" aria-hidden="true" />
            <span className="hidden lg:inline">Watchlist</span>
            {watchlistCount ? (
              <span className="site-accent-bg site-num rounded-full px-1.5 text-[10px] font-bold">
                {watchlistCount}
              </span>
            ) : null}
          </Link>

          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="site-focus rounded p-2 hover:site-accent"
          >
            {resolvedTheme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>

          {token ? (
            <Link
              href="/account"
              aria-label="Your account"
              className="site-focus rounded p-2 hover:site-accent"
            >
              <User2 className="h-4 w-4" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="site-accent-bg site-focus hidden shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold sm:block"
            >
              Sign in
            </button>
          )}
          {!token ? (
            <Link href="/login" aria-label="Sign in" className="site-focus rounded p-2 sm:hidden">
              <LogIn className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </header>

      <MobileDrawer open={drawer} onClose={() => setDrawer(false)} />
      <MegaSearch open={search.open} onClose={() => search.setOpen(false)} />
    </>
  );
}

function HeaderMenu({
  menu,
  pathname,
}: {
  menu: { label: string; links: Array<{ label: string; href: string }> };
  pathname: string;
}) {
  const [open, setOpen] = React.useState(false);
  const wrap = React.useRef<HTMLDivElement>(null);
  const active = menu.links.some((l) => isActiveNav(pathname, l.href));

  React.useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="true"
        className={cn(
          "site-focus flex items-center gap-1 rounded px-2.5 py-1.5 text-sm font-medium transition-colors",
          active ? "site-accent" : "hover:site-accent",
        )}
      >
        {menu.label}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open ? (
        <div className="site-surface site-hairline absolute left-0 top-full z-50 min-w-[220px] overflow-hidden rounded-lg border shadow-xl animate-pop-in">
          {menu.links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="site-focus block px-3 py-2 text-sm hover:site-surface-2"
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-black/60 animate-fade-in"
      />
      <div className="site site-surface pt-safe pb-safe absolute inset-y-0 left-0 w-[80%] max-w-xs overflow-y-auto animate-slide-in-left">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-lg font-extrabold">{PRODUCT_NAME}</span>
          <button type="button" onClick={onClose} aria-label="Close menu" className="site-focus rounded p-1">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav aria-label="Categories" className="pb-6">
          {SITE_MENUS.map((menu) => (
            <div key={menu.label} className="border-t site-hairline py-2">
              <p className="site-meta px-4 py-1 text-xs font-semibold uppercase tracking-wide">
                {menu.label}
              </p>
              {menu.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={onClose}
                  className="site-focus block px-4 py-2 text-sm"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
          <div className="border-t site-hairline py-2">
            <Link href={STUDIO_ROOT} onClick={onClose} className="site-focus block px-4 py-2 text-sm">
              Studio
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}
