import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { FOOTER_COLUMNS, SITE_MENUS, SITE_TABS, STUDIO_ROOT } from "@/lib/site-routes";

/**
 * The catalog owns the root namespace; the console lives under `/studio`.
 *
 * Before this split the console held `/orgs`, `/account`, `/onboarding` and
 * `/demo` at the top level — and `/account` in particular *collided*: the
 * site's own Account tab pointed at it and landed the visitor in the operator
 * console. Anything the console adds at the top level is a future collision
 * with a film route, so the boundary is asserted rather than remembered.
 */
const APP = join(process.cwd(), "../../apps/web-console-next/src/app");

/** Route segments a directory contributes: `(group)` adds none. */
function routeSegments(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (!statSync(join(dir, entry)).isDirectory()) continue;
    if (entry.startsWith("_")) continue;
    if (entry.startsWith("(") && entry.endsWith(")")) {
      out.push(...routeSegments(join(dir, entry)));
      continue;
    }
    out.push(entry);
  }
  return out;
}

/**
 * Top-level paths that are neither the site nor the console: the auth entry
 * point, shared by both. A signed-out visitor arriving at a film page should
 * not be sent through a URL that says "studio".
 */
const SHARED = new Set(["login", "auth"]);

/** The site's own top-level routes. */
const SITE = new Set([
  "title",
  "name",
  "find",
  "search",
  "chart",
  "watchlist",
  "list",
  "user",
  "news",
  "awards",
]);

describe("route namespace", () => {
  const top = routeSegments(APP);

  it("found the app router tree", () => {
    expect(top.length).toBeGreaterThan(5);
  });

  it("puts every non-site, non-auth route under /studio", () => {
    const strays = top.filter((s) => !SITE.has(s) && !SHARED.has(s) && s !== "studio");
    expect(strays).toEqual([]);
  });

  it("still has a studio", () => {
    expect(top).toContain("studio");
  });

  it("keeps the auth entry point at the top level", () => {
    // Moving `/login` under `/studio` would brand the site's own sign-in as an
    // operator surface.
    expect(top).toContain("login");
    expect(top).toContain("auth");
  });

  it("no longer serves the console at the old top-level paths", () => {
    for (const gone of ["orgs", "account", "onboarding", "demo"]) {
      expect(top).not.toContain(gone);
    }
  });
});

describe("site navigation", () => {
  const links = [
    ...SITE_TABS,
    ...SITE_MENUS.flatMap((m) => m.links),
    ...FOOTER_COLUMNS.flatMap((c) => c.links),
  ];

  it("never links at a retired top-level console path", () => {
    const stale = links.filter((l) =>
      /^\/(orgs|account|onboarding|demo)(\/|$|\?)/.test(l.href),
    );
    expect(stale.map((l) => `${l.label} → ${l.href}`)).toEqual([]);
  });

  it("routes anything console-shaped through /studio", () => {
    const consoleLinks = links.filter((l) => /account|studio/i.test(l.label));
    expect(consoleLinks.length).toBeGreaterThan(0);
    for (const link of consoleLinks) {
      expect(link.href.startsWith(STUDIO_ROOT)).toBe(true);
    }
  });

  it("points every site link at a route that exists", () => {
    // Dead footer links ("Your ratings", "Contribute") shipped once already.
    const known = new Set([...SITE, "studio", "login"]);
    for (const link of links) {
      const first = link.href.split("?")[0]!.split("/").filter(Boolean)[0];
      if (first === undefined) continue; // "/" — the home page
      expect({ label: link.label, segment: first, known: known.has(first) }).toEqual({
        label: link.label,
        segment: first,
        known: true,
      });
    }
  });
});
