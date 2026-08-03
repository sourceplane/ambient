import { Validator } from "@catalog-worker/validate";
import { TITLE_KINDS } from "@saas/db/catalog";

describe("Validator — strings", () => {
  it("trims and accepts a required string", () => {
    const v = new Validator();
    expect(v.requiredString("name", "  Arrival  ", 100)).toBe("Arrival");
    expect(v.ok).toBe(true);
  });

  it("rejects a missing or whitespace-only required string", () => {
    const v = new Validator();
    v.requiredString("a", undefined, 100);
    v.requiredString("b", "   ", 100);
    expect(v.ok).toBe(false);
    expect(v.errors.a).toEqual(["Required"]);
    expect(v.errors.b).toEqual(["Required"]);
  });

  it("rejects an over-long string and names the limit", () => {
    const v = new Validator();
    v.requiredString("name", "x".repeat(11), 10);
    expect(v.errors.name).toEqual(["Must be at most 10 characters"]);
  });

  it("treats an empty optional string as absent, not invalid", () => {
    const v = new Validator();
    expect(v.optionalString("tagline", "", 100)).toBeNull();
    expect(v.ok).toBe(true);
  });
});

describe("Validator — numbers and booleans", () => {
  it("accepts an integer in range", () => {
    const v = new Validator();
    expect(v.optionalInt("year", 2016, 1800, 2200)).toBe(2016);
    expect(v.ok).toBe(true);
  });

  it("rejects a non-integer, an out-of-range value, and a numeric string", () => {
    const v = new Validator();
    v.optionalInt("a", 1.5, 0, 10);
    v.optionalInt("b", 99, 0, 10);
    v.optionalInt("c", "5", 0, 10);
    expect(Object.keys(v.errors)).toEqual(["a", "b", "c"]);
  });

  it("distinguishes an absent boolean from false", () => {
    const v = new Validator();
    expect(v.optionalBool("isAdult", undefined)).toBeUndefined();
    expect(v.optionalBool("isAdult", false)).toBe(false);
    expect(v.ok).toBe(true);
  });

  it("rejects a truthy non-boolean", () => {
    const v = new Validator();
    v.optionalBool("isAdult", "true");
    expect(v.ok).toBe(false);
  });
});

describe("Validator — dates", () => {
  it("accepts a real ISO date", () => {
    const v = new Validator();
    expect(v.optionalDate("birthDate", "1974-08-20")).toBe("1974-08-20");
    expect(v.ok).toBe(true);
  });

  it("rejects a wrong shape", () => {
    const v = new Validator();
    v.optionalDate("d", "20/08/1974");
    expect(v.errors.d).toEqual(["Must be an ISO date (YYYY-MM-DD)"]);
  });

  it("rejects a well-shaped date that does not exist", () => {
    // 2025-02-30 parses in JS by rolling over into March; the round-trip check
    // is what catches it.
    const v = new Validator();
    v.optionalDate("d", "2025-02-30");
    expect(v.errors.d).toEqual(["Must be a real calendar date"]);
  });

  it("accepts a leap day in a leap year and rejects it otherwise", () => {
    const leap = new Validator();
    expect(leap.optionalDate("d", "2024-02-29")).toBe("2024-02-29");
    expect(leap.ok).toBe(true);

    const notLeap = new Validator();
    notLeap.optionalDate("d", "2025-02-29");
    expect(notLeap.ok).toBe(false);
  });
});

describe("Validator — URLs", () => {
  it("accepts http and https", () => {
    const v = new Validator();
    expect(v.requiredUrl("url", "https://cdn.example/poster.jpg")).toBe(
      "https://cdn.example/poster.jpg",
    );
    expect(v.optionalUrl("thumb", "http://cdn.example/t.jpg")).toBe("http://cdn.example/t.jpg");
    expect(v.ok).toBe(true);
  });

  it("rejects a javascript: URL", () => {
    // This value is echoed into an <img src> / <a href>; anything but http(s)
    // is a script-injection vector, not a media reference.
    const v = new Validator();
    v.requiredUrl("url", "javascript:alert(1)");
    expect(v.errors.url).toEqual(["Must be an http(s) URL"]);
  });

  it("rejects a data: URL", () => {
    const v = new Validator();
    v.requiredUrl("url", "data:text/html;base64,PHNjcmlwdD4=");
    expect(v.errors.url).toEqual(["Must be an http(s) URL"]);
  });

  it("rejects a string that is not a URL at all", () => {
    const v = new Validator();
    v.requiredUrl("url", "not a url");
    expect(v.errors.url).toEqual(["Must be a valid URL"]);
  });

  it("reports a missing required URL as required", () => {
    const v = new Validator();
    v.requiredUrl("url", undefined);
    expect(v.errors.url).toEqual(["Required"]);
  });
});

describe("Validator — enums and arrays", () => {
  it("accepts a member of the vocabulary", () => {
    const v = new Validator();
    expect(v.oneOf("kind", "movie", TITLE_KINDS)).toBe("movie");
    expect(v.ok).toBe(true);
  });

  it("rejects a value outside the vocabulary and lists the options", () => {
    const v = new Validator();
    v.oneOf("kind", "feature_film", TITLE_KINDS);
    expect(v.ok).toBe(false);
    expect(v.errors.kind![0]).toContain("movie");
  });

  it("accepts an absent optional enum", () => {
    const v = new Validator();
    expect(v.optionalOneOf("kind", undefined, TITLE_KINDS)).toBeUndefined();
    expect(v.ok).toBe(true);
  });

  it("accepts and trims a string array", () => {
    const v = new Validator();
    expect(v.stringArray("genres", [" drama ", "sci-fi"], 10, 50)).toEqual(["drama", "sci-fi"]);
    expect(v.ok).toBe(true);
  });

  it("rejects a non-array, an over-long array, and non-string entries", () => {
    const v = new Validator();
    v.stringArray("a", "drama", 10, 50);
    v.stringArray("b", ["x", "y", "z"], 2, 50);
    v.stringArray("c", [1, 2], 10, 50);
    v.stringArray("d", ["", "ok"], 10, 50);
    expect(Object.keys(v.errors).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("accumulates errors across fields rather than stopping at the first", () => {
    const v = new Validator();
    v.requiredString("title", "", 10);
    v.optionalInt("year", 9999, 1800, 2200);
    v.requiredUrl("url", "ftp://example.com");
    expect(Object.keys(v.errors)).toHaveLength(3);
  });
});
