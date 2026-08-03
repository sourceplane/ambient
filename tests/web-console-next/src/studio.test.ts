import {
  CREDIT_DEPARTMENT_OPTIONS,
  PRODUCTION_STATUS_OPTIONS,
  STUDIO_NAV,
  TITLE_KIND_OPTIONS,
  categoryForDepartment,
  definedOnly,
  isStudioNavActive,
  optionalNumber,
  optionalText,
  splitList,
} from "@/lib/studio";
import { fieldErrorsFrom } from "@/components/studio/fields";

describe("optionalText", () => {
  it("trims", () => {
    expect(optionalText("  Arrival  ")).toBe("Arrival");
  });

  it("treats blank as absent, not as an empty string", () => {
    // Sending `tagline: ""` on a PATCH would overwrite a real tagline with a
    // blank; sending nothing leaves it alone.
    expect(optionalText("")).toBeUndefined();
    expect(optionalText("   ")).toBeUndefined();
  });
});

describe("optionalNumber", () => {
  it("parses a number", () => {
    expect(optionalNumber("2016")).toBe(2016);
    expect(optionalNumber(" 116 ")).toBe(116);
  });

  it("treats blank as absent, not as zero", () => {
    // `Number("")` is 0 — an empty runtime box must not become "0 minutes".
    expect(optionalNumber("")).toBeUndefined();
    expect(optionalNumber("  ")).toBeUndefined();
  });

  it("passes a real zero through", () => {
    expect(optionalNumber("0")).toBe(0);
  });

  it("drops a non-numeric value rather than sending NaN", () => {
    expect(optionalNumber("abc")).toBeUndefined();
    expect(optionalNumber("12abc")).toBeUndefined();
  });
});

describe("splitList", () => {
  it("splits and trims", () => {
    expect(splitList("drama, science fiction ,mystery")).toEqual([
      "drama",
      "science fiction",
      "mystery",
    ]);
  });

  it("drops empties rather than emitting blank entries", () => {
    expect(splitList("drama,,  ,horror")).toEqual(["drama", "horror"]);
    expect(splitList("")).toEqual([]);
    expect(splitList("  ,  ")).toEqual([]);
  });
});

describe("definedOnly", () => {
  it("drops undefined keys", () => {
    expect(definedOnly({ a: 1, b: undefined, c: "x" })).toEqual({ a: 1, c: "x" });
  });

  it("keeps null, which is a value the API acts on", () => {
    // `null` means "clear this field"; dropping it would make clearing
    // impossible, since the API reads key presence as intent.
    expect(definedOnly({ tagline: null })).toEqual({ tagline: null });
  });

  it("keeps zero, false and empty arrays", () => {
    expect(definedOnly({ n: 0, b: false, list: [] })).toEqual({ n: 0, b: false, list: [] });
  });
});

describe("categoryForDepartment", () => {
  it("files cast as cast and everything else as crew", () => {
    expect(categoryForDepartment("cast")).toBe("cast");
    expect(categoryForDepartment("directing")).toBe("crew");
    expect(categoryForDepartment("visual_effects")).toBe("crew");
  });

  it("covers every department the picker offers", () => {
    for (const option of CREDIT_DEPARTMENT_OPTIONS) {
      expect(["cast", "crew"]).toContain(categoryForDepartment(option.value));
    }
  });
});

describe("vocabularies", () => {
  it("offers a unique, labelled option per value", () => {
    for (const options of [TITLE_KIND_OPTIONS, PRODUCTION_STATUS_OPTIONS, CREDIT_DEPARTMENT_OPTIONS]) {
      const values = options.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
      for (const option of options) expect(option.label.length).toBeGreaterThan(0);
    }
  });

  it("only offers cast once, so a credit cannot be filed twice", () => {
    expect(CREDIT_DEPARTMENT_OPTIONS.filter((o) => o.value === "cast")).toHaveLength(1);
  });
});

describe("fieldErrorsFrom", () => {
  it("reads the workers' 422 shape", () => {
    expect(
      fieldErrorsFrom({ details: { fields: { primaryTitle: ["Required"] } } }),
    ).toEqual({ primaryTitle: ["Required"] });
  });

  it("returns nothing for a non-validation failure", () => {
    // A 404 or 503 must fall through to the form-level error rather than
    // silently marking an arbitrary field.
    expect(fieldErrorsFrom({ code: "not_found", message: "Not found" })).toEqual({});
    expect(fieldErrorsFrom(null)).toEqual({});
    expect(fieldErrorsFrom(undefined)).toEqual({});
    expect(fieldErrorsFrom({ details: {} })).toEqual({});
  });

  it("ignores a field whose reasons are not strings", () => {
    expect(fieldErrorsFrom({ details: { fields: { a: "nope", b: [1, "ok"] } } })).toEqual({
      b: ["ok"],
    });
  });
});

describe("studio navigation", () => {
  it("gives every entry a studio-scoped href", () => {
    for (const item of STUDIO_NAV) {
      expect(item.href.startsWith("/studio")).toBe(true);
      expect(item.label.length).toBeGreaterThan(0);
    }
  });

  it("matches Overview only exactly", () => {
    // Without the exact flag, every studio route would light up Overview.
    expect(isStudioNavActive("/studio", "/studio", true)).toBe(true);
    expect(isStudioNavActive("/studio/catalog/titles", "/studio", true)).toBe(false);
  });

  it("keeps a section active on its children", () => {
    expect(isStudioNavActive("/studio/catalog/titles/tt_1", "/studio/catalog/titles")).toBe(true);
    expect(isStudioNavActive("/studio/catalog/titles", "/studio/catalog/titles")).toBe(true);
  });

  it("does not match a sibling with a shared prefix", () => {
    expect(isStudioNavActive("/studio/catalog/titles-archive", "/studio/catalog/titles")).toBe(false);
  });

  it("does not confuse people with titles", () => {
    expect(isStudioNavActive("/studio/catalog/people", "/studio/catalog/titles")).toBe(false);
  });
});
