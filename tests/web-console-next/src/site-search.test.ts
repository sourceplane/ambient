import {
  EMPTY_NAME_SEARCH,
  EMPTY_TITLE_SEARCH,
  VIEW_MODES,
  activeFilterCount,
  facetNumber,
  facetString,
  facetStrings,
  isViewMode,
  nameSearchRequest,
  parseNameSearch,
  parseTitleSearch,
  serializeNameSearch,
  serializeTitleSearch,
  titleSearchRequest,
} from "@/lib/site-search";

describe("parseTitleSearch", () => {
  it("defaults everything that is absent", () => {
    expect(parseTitleSearch(new URLSearchParams())).toEqual(EMPTY_TITLE_SEARCH);
  });

  it("reads a comma list into an array", () => {
    expect(parseTitleSearch(new URLSearchParams("genre=drama,horror")).genre).toEqual([
      "drama",
      "horror",
    ]);
  });

  it("reads repeated parameters into the same array", () => {
    expect(parseTitleSearch(new URLSearchParams("kind=movie&kind=short")).kind).toEqual([
      "movie",
      "short",
    ]);
  });

  it("ignores parameters it does not know", () => {
    const state = parseTitleSearch(new URLSearchParams("q=dune&nonsense=1"));
    expect(state.q).toBe("dune");
    expect(state).not.toHaveProperty("nonsense");
  });
});

describe("serializeTitleSearch", () => {
  it("omits everything left at its default", () => {
    expect(serializeTitleSearch(EMPTY_TITLE_SEARCH)).toBe("");
  });

  it("round-trips through parse", () => {
    const state = {
      ...EMPTY_TITLE_SEARCH,
      q: "dune",
      genre: ["science-fiction"],
      yearFrom: "2000",
      sort: "rating",
    };
    expect(parseTitleSearch(new URLSearchParams(serializeTitleSearch(state).slice(1)))).toEqual(
      state,
    );
  });

  it("encodes a value that would otherwise break the URL", () => {
    expect(serializeTitleSearch({ ...EMPTY_TITLE_SEARCH, q: "a&b" })).toBe("?q=a%26b");
  });

  it("keeps a non-default sort but drops the default one", () => {
    expect(serializeTitleSearch({ ...EMPTY_TITLE_SEARCH, sort: "rating" })).toContain("sort=rating");
    expect(serializeTitleSearch({ ...EMPTY_TITLE_SEARCH, sort: "popularity" })).toBe("");
  });
});

describe("titleSearchRequest", () => {
  it("treats a blank numeric field as absent, not as zero", () => {
    // `Number("")` is 0, which would silently become a real "minimum votes"
    // filter and quietly drop every unrated title.
    const request = titleSearchRequest(EMPTY_TITLE_SEARCH, 20);
    expect(request.votesMin).toBeUndefined();
    expect(request.yearFrom).toBeUndefined();
    expect(request.ratingFrom).toBeUndefined();
  });

  it("passes a real zero through", () => {
    expect(titleSearchRequest({ ...EMPTY_TITLE_SEARCH, votesMin: "0" }, 20).votesMin).toBe(0);
  });

  it("drops a non-numeric value rather than sending NaN", () => {
    expect(titleSearchRequest({ ...EMPTY_TITLE_SEARCH, yearFrom: "abc" }, 20).yearFrom).toBeUndefined();
  });

  it("omits empty arrays", () => {
    const request = titleSearchRequest(EMPTY_TITLE_SEARCH, 20);
    expect(request.kind).toBeUndefined();
    expect(request.genre).toBeUndefined();
  });

  it("carries the limit through", () => {
    expect(titleSearchRequest(EMPTY_TITLE_SEARCH, 60).limit).toBe(60);
  });
});

describe("activeFilterCount", () => {
  it("is zero for a default state", () => {
    expect(activeFilterCount(EMPTY_TITLE_SEARCH)).toBe(0);
  });

  it("does not count the free-text query as a filter", () => {
    // The query has its own box; the badge counts what is hidden in the panel.
    expect(activeFilterCount({ ...EMPTY_TITLE_SEARCH, q: "dune" })).toBe(0);
  });

  it("counts each populated group once", () => {
    expect(
      activeFilterCount({
        ...EMPTY_TITLE_SEARCH,
        genre: ["drama", "horror"],
        yearFrom: "2000",
        yearTo: "2010",
      }),
    ).toBe(3);
  });
});

describe("name search", () => {
  it("round-trips through parse and serialize", () => {
    const state = { ...EMPTY_NAME_SEARCH, q: "adams", profession: ["actress"], bornFrom: "1970" };
    expect(parseNameSearch(new URLSearchParams(serializeNameSearch(state).slice(1)))).toEqual(state);
  });

  it("omits defaults", () => {
    expect(serializeNameSearch(EMPTY_NAME_SEARCH)).toBe("");
  });

  it("treats a blank year as absent", () => {
    expect(nameSearchRequest(EMPTY_NAME_SEARCH, 20).bornFrom).toBeUndefined();
  });
});

describe("view modes", () => {
  it("accepts only the modes it knows", () => {
    for (const mode of VIEW_MODES) expect(isViewMode(mode)).toBe(true);
    expect(isViewMode("nonsense")).toBe(false);
    expect(isViewMode(null)).toBe(false);
  });
});

describe("facet readers", () => {
  const facets: Record<string, unknown> = {
    year: 2016,
    rating: 7.9,
    kind: "movie",
    genres: ["drama", "science-fiction"],
    broken: { nested: true },
    blank: "",
    notFinite: Number.NaN,
  };

  it("reads the types it expects", () => {
    expect(facetNumber(facets, "year")).toBe(2016);
    expect(facetString(facets, "kind")).toBe("movie");
    expect(facetStrings(facets, "genres")).toEqual(["drama", "science-fiction"]);
  });

  it("returns null rather than coercing the wrong type", () => {
    expect(facetNumber(facets, "kind")).toBeNull();
    expect(facetString(facets, "year")).toBeNull();
    expect(facetStrings(facets, "kind")).toEqual([]);
  });

  it("treats an empty string and a NaN as absent", () => {
    expect(facetString(facets, "blank")).toBeNull();
    expect(facetNumber(facets, "notFinite")).toBeNull();
  });

  it("returns null for a key that is not there at all", () => {
    expect(facetNumber(facets, "missing")).toBeNull();
    expect(facetString(facets, "missing")).toBeNull();
    expect(facetStrings(facets, "missing")).toEqual([]);
  });
});
