import {
  CHARTS,
  CHART_SLUGS,
  FOOTER_COLUMNS,
  SEARCH_GROUP_ORDER,
  SITE_MENUS,
  SITE_TABS,
  chartBySlug,
  chartHref,
  findHref,
  genreHref,
  groupSearchHits,
  isActiveNav,
  nameHref,
  searchHitHref,
  titleHref,
} from "@/lib/site-routes";
import type { SearchEntityType } from "@saas/contracts/search";

const TITLE_ID = "tt_11111111111111111111111111111111";
const NAME_ID = "nm_22222222222222222222222222222222";

describe("entity routes", () => {
  it("addresses a title and a name by public id", () => {
    expect(titleHref(TITLE_ID)).toBe(`/title/${TITLE_ID}`);
    expect(nameHref(NAME_ID)).toBe(`/name/${NAME_ID}`);
  });

  it("encodes a search query rather than splicing it in raw", () => {
    expect(findHref("dune part two")).toBe("/find?q=dune%20part%20two");
    expect(findHref("a&b=c")).toBe("/find?q=a%26b%3Dc");
  });

  it("drops the query string when there is no query", () => {
    expect(findHref("")).toBe("/find");
  });

  it("encodes a genre slug", () => {
    expect(genreHref("science-fiction")).toBe("/search/title?genre=science-fiction");
  });
});

describe("charts", () => {
  it("exposes a descriptor for every slug", () => {
    for (const slug of CHART_SLUGS) {
      expect(chartBySlug(slug)).not.toBeNull();
    }
    expect(CHARTS).toHaveLength(CHART_SLUGS.length);
  });

  it("maps each shareable slug to exactly one wire chart key", () => {
    const keys = CHARTS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps the URL slug independent of the wire key", () => {
    // `/chart/top` is the address people share; `top_movies` is what the
    // ratings API computes. Renaming either must not break the other.
    expect(chartBySlug("top")!.key).toBe("top_movies");
    expect(chartHref("top")).toBe("/chart/top");
  });

  it("returns null for a slug it does not know", () => {
    expect(chartBySlug("nonsense")).toBeNull();
  });
});

describe("searchHitHref", () => {
  it.each([
    ["title" as SearchEntityType, `/title/${TITLE_ID}`],
    ["person" as SearchEntityType, `/name/${TITLE_ID}`],
    ["list" as SearchEntityType, `/list/${TITLE_ID}`],
  ])("routes a %s hit to its own page", (type, expected) => {
    expect(searchHitHref({ type, id: TITLE_ID, display: "x" })).toBe(expected);
  });

  it("routes a hit with no page of its own to a search that has results", () => {
    expect(searchHitHref({ type: "company", id: "co_1", display: "Legendary" })).toBe(
      "/find?q=Legendary",
    );
  });

  it("never produces a dead link for an unknown type", () => {
    const href = searchHitHref({
      type: "unheard-of" as SearchEntityType,
      id: "x_1",
      display: "thing",
    });
    expect(href.startsWith("/find")).toBe(true);
  });
});

describe("groupSearchHits", () => {
  const hits = [
    { type: "person" as SearchEntityType, id: "nm_1" },
    { type: "title" as SearchEntityType, id: "tt_1" },
    { type: "keyword" as SearchEntityType, id: "kw_1" },
    { type: "title" as SearchEntityType, id: "tt_2" },
  ];

  it("puts titles first regardless of the order they arrived in", () => {
    expect(groupSearchHits(hits).map((g) => g.type)).toEqual(["title", "person", "keyword"]);
  });

  it("keeps each group's hits in their original order", () => {
    expect(groupSearchHits(hits)[0]!.hits.map((h) => h.id)).toEqual(["tt_1", "tt_2"]);
  });

  it("omits groups with no hits rather than rendering empty headings", () => {
    expect(groupSearchHits([{ type: "title" as SearchEntityType, id: "tt_1" }])).toHaveLength(1);
  });

  it("labels every group it can produce", () => {
    for (const type of SEARCH_GROUP_ORDER) {
      const [group] = groupSearchHits([{ type, id: "x" }]);
      expect(group!.label.length).toBeGreaterThan(0);
    }
  });

  it("returns nothing for no hits", () => {
    expect(groupSearchHits([])).toEqual([]);
  });
});

describe("isActiveNav", () => {
  it("matches home only exactly", () => {
    expect(isActiveNav("/", "/")).toBe(true);
    expect(isActiveNav("/find", "/")).toBe(false);
  });

  it("keeps a section highlighted on its sub-routes", () => {
    expect(isActiveNav("/chart/top", "/chart/top")).toBe(true);
    expect(isActiveNav("/watchlist/edit", "/watchlist")).toBe(true);
  });

  it("ignores the query string when comparing", () => {
    expect(isActiveNav("/search/title", "/search/title?kind=tv_series")).toBe(true);
  });

  it("does not match a different section with a shared prefix", () => {
    expect(isActiveNav("/watchlists", "/watchlist")).toBe(false);
  });
});

describe("navigation model", () => {
  it("gives every menu link a destination", () => {
    for (const menu of [...SITE_MENUS, ...FOOTER_COLUMNS]) {
      expect(menu.links.length).toBeGreaterThan(0);
      for (const link of menu.links) {
        expect(link.href.startsWith("/")).toBe(true);
        expect(link.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("points every chart link in the menus at a chart that exists", () => {
    const chartLinks = SITE_MENUS.flatMap((m) => m.links)
      .map((l) => l.href)
      .filter((href) => href.startsWith("/chart/"));
    expect(chartLinks.length).toBeGreaterThan(0);
    for (const href of chartLinks) {
      expect(chartBySlug(href.replace("/chart/", ""))).not.toBeNull();
    }
  });

  it("keeps the mobile tab bar to four destinations", () => {
    expect(SITE_TABS).toHaveLength(4);
    expect(SITE_TABS[0]!.href).toBe("/");
  });

  it("links out to the console rather than swallowing it", () => {
    const studio = FOOTER_COLUMNS.flatMap((c) => c.links).find((l) => l.href === "/studio");
    expect(studio).toBeDefined();
  });
});
