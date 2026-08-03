import { toPrefixTsQuery } from "@saas/db/search";
import {
  MAX_LIMIT,
  MAX_OFFSET,
  MAX_QUERY_LENGTH,
  parseLimit,
  parseNameSearch,
  parseOffset,
  parseQueryText,
  parseTitleSearch,
  parseTypes,
} from "@search-worker/query";

function url(query: string): URL {
  return new URL(`https://search.internal/v1/search${query}`);
}

describe("toPrefixTsQuery", () => {
  it("builds a prefix query from each token", () => {
    expect(toPrefixTsQuery("blade run")).toBe("blade:* & run:*");
  });

  it("strips tsquery operators instead of passing them through", () => {
    // `to_tsquery` would reject these as a syntax error; a user typing them
    // must get no results, never a 500.
    expect(toPrefixTsQuery("a & b")).toBe("a:* & b:*");
    expect(toPrefixTsQuery("!foo|bar")).toBe("foo:* & bar:*");
    expect(toPrefixTsQuery("(unbalanced")).toBe("unbalanced:*");
  });

  it("returns empty for input with no word characters", () => {
    expect(toPrefixTsQuery("&&&")).toBe("");
    expect(toPrefixTsQuery("   ")).toBe("");
  });

  it("keeps non-latin tokens", () => {
    expect(toPrefixTsQuery("千と千尋")).toBe("千と千尋:*");
  });

  it("bounds the token count so a pathological query cannot blow up the plan", () => {
    const many = Array.from({ length: 50 }, (_, i) => `t${i}`).join(" ");
    expect(toPrefixTsQuery(many).split(" & ")).toHaveLength(12);
  });
});

describe("parseQueryText", () => {
  it("trims and accepts", () => {
    const result = parseQueryText(url("?q=  arrival  "), true);
    expect(result).toEqual({ ok: true, value: "arrival" });
  });

  it("rejects an empty required query", () => {
    const result = parseQueryText(url("?q="), true);
    expect(result).toMatchObject({ ok: false, field: "q" });
  });

  it("allows an empty optional query", () => {
    expect(parseQueryText(url(""), false)).toEqual({ ok: true, value: "" });
  });

  it("rejects an over-long query", () => {
    const result = parseQueryText(url(`?q=${"x".repeat(MAX_QUERY_LENGTH + 1)}`), true);
    expect(result).toMatchObject({ ok: false, field: "q" });
  });
});

describe("parseLimit / parseOffset", () => {
  it("falls back when absent", () => {
    expect(parseLimit(url(""), 8)).toEqual({ ok: true, value: 8 });
    expect(parseOffset(url(""))).toEqual({ ok: true, value: 0 });
  });

  it("accepts a value at the boundary", () => {
    expect(parseLimit(url(`?limit=${MAX_LIMIT}`), 8)).toEqual({ ok: true, value: MAX_LIMIT });
    expect(parseOffset(url(`?offset=${MAX_OFFSET}`))).toEqual({ ok: true, value: MAX_OFFSET });
  });

  it("rejects zero, negatives, non-integers and over-cap values", () => {
    for (const bad of ["0", "-1", "1.5", String(MAX_LIMIT + 1), "abc"]) {
      expect(parseLimit(url(`?limit=${bad}`), 8)).toMatchObject({ ok: false, field: "limit" });
    }
    expect(parseOffset(url(`?offset=${MAX_OFFSET + 1}`))).toMatchObject({ ok: false });
    expect(parseOffset(url("?offset=-1"))).toMatchObject({ ok: false });
  });
});

describe("parseTypes", () => {
  it("returns null when unspecified — meaning every type", () => {
    expect(parseTypes(url(""))).toEqual({ ok: true, value: null });
  });

  it("accepts a repeated param and a comma list", () => {
    expect(parseTypes(url("?type=title&type=person"))).toEqual({
      ok: true,
      value: ["title", "person"],
    });
    expect(parseTypes(url("?type=title,company"))).toEqual({
      ok: true,
      value: ["title", "company"],
    });
  });

  it("rejects an unknown type", () => {
    expect(parseTypes(url("?type=movie"))).toMatchObject({ ok: false, field: "type" });
  });
});

describe("parseTitleSearch", () => {
  it("defaults to a popularity browse with no text", () => {
    const result = parseTitleSearch(url(""));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text).toBeNull();
    expect(result.value.limit).toBe(50);
    expect(result.value.includeAdult).toBe(false);
  });

  it("collects repeated and comma-separated facets, lowercased", () => {
    const result = parseTitleSearch(url("?genre=Drama,Sci-Fi&genre=Thriller&country=US"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.genres).toEqual(["drama", "sci-fi", "thriller"]);
    expect(result.value.countries).toEqual(["us"]);
  });

  it("parses numeric ranges", () => {
    const result = parseTitleSearch(url("?year_from=1990&year_to=2000&rating_from=7.5&votes_min=1000"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.yearFrom).toBe(1990);
    expect(result.value.yearTo).toBe(2000);
    expect(result.value.ratingFrom).toBe(7.5);
    expect(result.value.votesMin).toBe(1000);
  });

  it("rejects an inverted year range", () => {
    const result = parseTitleSearch(url("?year_from=2000&year_to=1990"));
    expect(result).toMatchObject({ ok: false, field: "year_to" });
  });

  it("rejects an out-of-range rating", () => {
    expect(parseTitleSearch(url("?rating_from=11"))).toMatchObject({ ok: false, field: "rating_from" });
  });

  it("rejects an unknown sort key", () => {
    expect(parseTitleSearch(url("?sort=chaos"))).toMatchObject({ ok: false, field: "sort" });
  });

  it("accepts every documented sort key", () => {
    for (const sort of [
      "relevance",
      "popularity",
      "rating",
      "votes",
      "release_date",
      "alphabetical",
      "runtime",
    ]) {
      expect(parseTitleSearch(url(`?sort=${sort}`)).ok).toBe(true);
    }
  });

  it("rejects an unknown order", () => {
    expect(parseTitleSearch(url("?order=sideways"))).toMatchObject({ ok: false, field: "order" });
  });

  it("only includes adult titles when explicitly asked", () => {
    const off = parseTitleSearch(url("?adult=yes"));
    expect(off.ok && off.value.includeAdult).toBe(false);
    const on = parseTitleSearch(url("?adult=true"));
    expect(on.ok && on.value.includeAdult).toBe(true);
  });

  it("bounds a facet list so a crafted URL cannot explode the query", () => {
    const many = Array.from({ length: 100 }, (_, i) => `g${i}`).join(",");
    const result = parseTitleSearch(url(`?genre=${many}`));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.genres).toHaveLength(24);
  });
});

describe("parseNameSearch", () => {
  it("parses professions and life-year ranges", () => {
    const result = parseNameSearch(url("?profession=director,writer&born_from=1950&died_to=2020"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.professions).toEqual(["director", "writer"]);
    expect(result.value.bornFrom).toBe(1950);
    expect(result.value.diedTo).toBe(2020);
  });

  it("rejects an unknown sort key", () => {
    expect(parseNameSearch(url("?sort=runtime"))).toMatchObject({ ok: false, field: "sort" });
  });

  it("accepts every documented sort key", () => {
    for (const sort of ["relevance", "popularity", "alphabetical", "birth_date"]) {
      expect(parseNameSearch(url(`?sort=${sort}`)).ok).toBe(true);
    }
  });

  it("treats a blank birth place as absent", () => {
    const result = parseNameSearch(url("?birth_place=%20%20"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.birthPlace).toBeNull();
  });
});
