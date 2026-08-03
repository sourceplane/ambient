import { HERO_CHART, HERO_SIZE, HOME_RAILS, RAIL_SIZE, resolveRailItems, visibleRails } from "@/lib/site-home";
import { chartBySlug } from "@/lib/site-routes";

describe("home rails", () => {
  it("gives every rail a unique key", () => {
    const keys = HOME_RAILS.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("points every rail's see-all at a chart page that exists", () => {
    for (const rail of HOME_RAILS) {
      expect(rail.href.startsWith("/chart/")).toBe(true);
      expect(chartBySlug(rail.href.replace("/chart/", ""))).not.toBeNull();
    }
  });

  it("matches each rail's see-all chart to the chart it reads", () => {
    for (const rail of HOME_RAILS) {
      expect(chartBySlug(rail.href.replace("/chart/", ""))!.key).toBe(rail.chart);
    }
  });

  it("leads with the broadest rail", () => {
    expect(HOME_RAILS[0]!.key).toBe("trending");
  });

  it("only falls back where the fallback would actually be the same thing", () => {
    // "In theaters" and "Coming soon" are defined by release timing, which a
    // plain browse cannot reproduce — padding them with arbitrary movies would
    // be a lie, so they hide instead.
    const byKey = Object.fromEntries(HOME_RAILS.map((r) => [r.key, r]));
    expect(byKey["in-theaters"]!.fallback).toBeNull();
    expect(byKey["coming-soon"]!.fallback).toBeNull();
    expect(byKey["top-rated"]!.fallback).toEqual({ kind: "movie" });
    expect(byKey["top-tv"]!.fallback).toEqual({ kind: "tv_series" });
  });

  it("sizes the hero smaller than a rail", () => {
    expect(HERO_SIZE).toBeLessThan(RAIL_SIZE);
    expect(HERO_CHART).toBe("most_popular_movies");
  });
});

describe("resolveRailItems", () => {
  it("prefers the chart when it has anything at all", () => {
    expect(resolveRailItems(["a"], ["b", "c"])).toEqual(["a"]);
  });

  it("uses the browse only when the chart is empty", () => {
    expect(resolveRailItems([], ["b", "c"])).toEqual(["b", "c"]);
  });

  it("resolves to nothing when neither has anything", () => {
    expect(resolveRailItems([], [])).toEqual([]);
  });
});

describe("visibleRails", () => {
  it("drops rails that resolved to nothing", () => {
    const rails = [
      { rail: HOME_RAILS[0]!, items: ["a"] },
      { rail: HOME_RAILS[1]!, items: [] },
    ];
    expect(visibleRails(rails).map((r) => r.rail.key)).toEqual([HOME_RAILS[0]!.key]);
  });
});
