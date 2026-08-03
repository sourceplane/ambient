import {
  formatDate,
  formatDuration,
  formatMoney,
  formatRating,
  formatRuntime,
  formatVotes,
  formatYearRange,
  initials,
  metaLine,
  shouldShowKindBadge,
  titleKindLabel,
  truncate,
} from "@/lib/site-format";

describe("formatRuntime", () => {
  it.each([
    [166, "2h 46m"],
    [120, "2h"],
    [45, "45m"],
    [60, "1h"],
  ])("renders %s minutes as %s", (input, expected) => {
    expect(formatRuntime(input)).toBe(expected);
  });

  it("renders nothing for an unknown or nonsensical runtime", () => {
    expect(formatRuntime(null)).toBe("");
    expect(formatRuntime(undefined)).toBe("");
    expect(formatRuntime(0)).toBe("");
    expect(formatRuntime(-5)).toBe("");
  });
});

describe("formatYearRange", () => {
  it("shows a single year for a film", () => {
    expect(formatYearRange("movie", 2016, null)).toBe("2016");
  });

  it("ignores an end year on a film", () => {
    expect(formatYearRange("movie", 2016, 2018)).toBe("2016");
  });

  it("shows a span for a finished series", () => {
    expect(formatYearRange("tv_series", 2019, 2023)).toBe("2019–2023");
  });

  it("shows an open span for a running series", () => {
    expect(formatYearRange("tv_series", 2019, null)).toBe("2019–");
  });

  it("collapses a single-year series to one year", () => {
    expect(formatYearRange("tv_mini_series", 2019, 2019)).toBe("2019");
  });

  it("renders nothing without a start year", () => {
    expect(formatYearRange("movie", null, 2020)).toBe("");
  });
});

describe("formatVotes", () => {
  it.each([
    [0, "0"],
    [986, "986"],
    [1_000, "1K"],
    [12_400, "12.4K"],
    [845_900, "845.9K"],
    [1_200_000, "1.2M"],
    [2_000_000, "2M"],
    [3_400_000_000, "3.4B"],
  ])("renders %s as %s", (input, expected) => {
    expect(formatVotes(input)).toBe(expected);
  });

  it("rounds down so a count never reads higher than it is", () => {
    expect(formatVotes(1_999)).toBe("1.9K");
  });
});

describe("formatRating", () => {
  it("always shows one decimal place", () => {
    expect(formatRating(8)).toBe("8.0");
    expect(formatRating(7.44)).toBe("7.4");
  });

  it("distinguishes unrated from zero", () => {
    expect(formatRating(null)).toBe("—");
    expect(formatRating(undefined)).toBe("—");
    expect(formatRating(0)).toBe("0.0");
  });
});

describe("formatMoney", () => {
  it.each([
    [16_500_000_000, "$165M"],
    [250_000_000_000, "$2.5B"],
    [500_000, "$5K"],
    [12_300, "$123"],
  ])("renders %s cents as %s", (input, expected) => {
    expect(formatMoney(input)).toBe(expected);
  });

  it("uses the currency symbol when it knows one", () => {
    expect(formatMoney(16_500_000_000, "EUR")).toBe("€165M");
  });

  it("falls back to the currency code when it does not", () => {
    expect(formatMoney(16_500_000_000, "AUD")).toBe("AUD 165M");
  });

  it("keeps the sign in front of the symbol", () => {
    expect(formatMoney(-500_000)).toBe("-$5K");
  });

  it("renders nothing for an unknown amount", () => {
    expect(formatMoney(null)).toBe("");
  });
});

describe("formatDate", () => {
  it("renders a plain date", () => {
    expect(formatDate("2016-11-11")).toBe("11 Nov 2016");
  });

  it("does not shift the day for readers west of Greenwich", () => {
    // `new Date("2016-01-01")` is UTC midnight and renders as 31 Dec in the
    // Americas. Parsing the string directly is what keeps this stable.
    expect(formatDate("2016-01-01")).toBe("1 Jan 2016");
  });

  it("accepts a full timestamp", () => {
    expect(formatDate("2016-11-11T00:00:00.000Z")).toBe("11 Nov 2016");
  });

  it("renders nothing for junk", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate("not a date")).toBe("");
    expect(formatDate("2016-13-11")).toBe("");
  });
});

describe("titleKindLabel", () => {
  it("labels every kind it is given", () => {
    expect(titleKindLabel("tv_mini_series")).toBe("TV Mini Series");
    expect(titleKindLabel("video_game")).toBe("Video Game");
  });

  it("badges everything except a film", () => {
    expect(shouldShowKindBadge("movie")).toBe(false);
    expect(shouldShowKindBadge("tv_series")).toBe(true);
    expect(shouldShowKindBadge("short")).toBe(true);
  });
});

describe("initials", () => {
  it("takes the first and last initial", () => {
    expect(initials("Denis Villeneuve")).toBe("DV");
    expect(initials("Robert De Niro")).toBe("RN");
  });

  it("handles a single name", () => {
    expect(initials("Cher")).toBe("C");
  });

  it("never returns an empty string", () => {
    expect(initials("   ")).toBe("?");
  });
});

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("short", 20)).toBe("short");
  });

  it("cuts on a word boundary", () => {
    expect(truncate("the quick brown fox jumps", 15)).toBe("the quick brown…");
  });

  it("cuts mid-word rather than losing most of the text", () => {
    expect(truncate("supercalifragilistic", 10)).toBe("supercalif…");
  });
});

describe("formatDuration", () => {
  it("renders mm:ss", () => {
    expect(formatDuration(195)).toBe("3:15");
    expect(formatDuration(59)).toBe("0:59");
  });

  it("renders h:mm:ss past an hour", () => {
    expect(formatDuration(3_725)).toBe("1:02:05");
  });

  it("renders nothing for an unknown duration", () => {
    expect(formatDuration(null)).toBe("");
  });
});

describe("metaLine", () => {
  it("joins only the parts that exist", () => {
    expect(metaLine(["2016", null, "2h 46m"])).toBe("2016 · 2h 46m");
  });

  it("never leaves a dangling separator", () => {
    expect(metaLine([null, undefined, ""])).toBe("");
    expect(metaLine(["2016"])).toBe("2016");
  });
});
