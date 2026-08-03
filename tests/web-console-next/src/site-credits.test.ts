import type { PublicNameCredit, PublicTitleCredit } from "@saas/contracts/catalog";
import {
  DEPARTMENT_ORDER,
  characterLine,
  departmentLabel,
  episodeLine,
  groupByDepartment,
  headlineCredits,
  sortCreditsByYear,
} from "@/lib/site-credits";

function titleCredit(overrides: Partial<PublicTitleCredit> = {}): PublicTitleCredit {
  return {
    id: "cr_1",
    category: "cast",
    department: "cast",
    job: "Actor",
    characters: [],
    billingOrder: null,
    episodeCount: null,
    isUncredited: false,
    isVoice: false,
    isArchiveFootage: false,
    isSelf: false,
    note: null,
    name: { id: "nm_1", name: "Amy Adams", primaryImage: null, professions: [] },
    ...overrides,
  };
}

function nameCredit(startYear: number | null, id = "cr_1"): PublicNameCredit {
  return {
    id,
    category: "cast",
    department: "cast",
    job: "Actor",
    characters: [],
    billingOrder: null,
    episodeCount: null,
    isUncredited: false,
    isVoice: false,
    isArchiveFootage: false,
    isSelf: false,
    note: null,
    title: {
      id: `tt_${id}`,
      kind: "movie",
      primaryTitle: "A film",
      originalTitle: null,
      startYear,
      endYear: null,
      runtimeMinutes: null,
      isAdult: false,
      genres: [],
      primaryImage: null,
    },
  };
}

describe("groupByDepartment", () => {
  it("orders departments the way a credits page reads", () => {
    const groups = groupByDepartment([
      titleCredit({ department: "sound" }),
      titleCredit({ department: "cast" }),
      titleCredit({ department: "directing" }),
    ]);
    expect(groups.map((g) => g.department)).toEqual(["cast", "directing", "sound"]);
  });

  it("keeps the API's order inside a group", () => {
    const groups = groupByDepartment([
      titleCredit({ id: "cr_1", department: "cast" }),
      titleCredit({ id: "cr_2", department: "cast" }),
    ]);
    expect(groups[0]!.credits.map((c) => c.id)).toEqual(["cr_1", "cr_2"]);
  });

  it("still shows a department the ordering does not know about", () => {
    // Dropping credits because the vocabulary grew is the worse failure.
    const groups = groupByDepartment([
      titleCredit({ department: "underwater_unit" as PublicTitleCredit["department"] }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.credits).toHaveLength(1);
  });

  it("labels every department in the canonical order", () => {
    for (const department of DEPARTMENT_ORDER) {
      expect(departmentLabel(department).length).toBeGreaterThan(0);
    }
  });

  it("returns nothing for no credits", () => {
    expect(groupByDepartment([])).toEqual([]);
  });
});

describe("headlineCredits", () => {
  it("picks directors, writers and top-billed cast", () => {
    const { directors, writers, stars } = headlineCredits([
      titleCredit({ id: "d", department: "directing", category: "crew" }),
      titleCredit({ id: "w", department: "writing", category: "crew" }),
      titleCredit({ id: "a", billingOrder: 1 }),
      titleCredit({ id: "b", billingOrder: 2 }),
    ]);
    expect(directors.map((c) => c.id)).toEqual(["d"]);
    expect(writers.map((c) => c.id)).toEqual(["w"]);
    expect(stars.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("sorts stars by billing order", () => {
    const { stars } = headlineCredits([
      titleCredit({ id: "third", billingOrder: 3 }),
      titleCredit({ id: "first", billingOrder: 1 }),
      titleCredit({ id: "second", billingOrder: 2 }),
    ]);
    expect(stars.map((c) => c.id)).toEqual(["first", "second", "third"]);
  });

  it("sorts an unbilled cast member last rather than first", () => {
    const { stars } = headlineCredits([
      titleCredit({ id: "unbilled", billingOrder: null }),
      titleCredit({ id: "billed", billingOrder: 5 }),
    ]);
    expect(stars.map((c) => c.id)).toEqual(["billed", "unbilled"]);
  });

  it("caps the star list", () => {
    const credits = Array.from({ length: 10 }, (_, i) =>
      titleCredit({ id: `c${i}`, billingOrder: i }),
    );
    expect(headlineCredits(credits).stars).toHaveLength(3);
    expect(headlineCredits(credits, 5).stars).toHaveLength(5);
  });
});

describe("characterLine", () => {
  it("uses the character name", () => {
    expect(characterLine(titleCredit({ characters: ["Louise Banks"] }))).toBe("Louise Banks");
  });

  it("joins multiple characters", () => {
    expect(characterLine(titleCredit({ characters: ["Bruce Wayne", "Batman"] }))).toBe(
      "Bruce Wayne / Batman",
    );
  });

  it("falls back to the job when there is no character", () => {
    expect(characterLine(titleCredit({ job: "Director" }))).toBe("Director");
  });

  it("renders a self-appearance as Self", () => {
    expect(characterLine(titleCredit({ isSelf: true }))).toBe("Self");
    expect(characterLine(titleCredit({ isSelf: true, characters: ["Host"] }))).toBe("Self — Host");
  });

  it("appends the qualifiers that change what the credit means", () => {
    expect(characterLine(titleCredit({ characters: ["Woody"], isVoice: true }))).toBe(
      "Woody (voice)",
    );
    expect(
      characterLine(titleCredit({ characters: ["Extra"], isUncredited: true, isArchiveFootage: true })),
    ).toBe("Extra (archive footage, uncredited)");
  });
});

describe("episodeLine", () => {
  it("agrees with itself on singular and plural", () => {
    expect(episodeLine(1)).toBe("1 episode");
    expect(episodeLine(12)).toBe("12 episodes");
  });

  it("says nothing when there is no count", () => {
    expect(episodeLine(null)).toBe("");
    expect(episodeLine(0)).toBe("");
  });
});

describe("sortCreditsByYear", () => {
  it("orders newest first", () => {
    const sorted = sortCreditsByYear([nameCredit(2016, "a"), nameCredit(2021, "b"), nameCredit(1998, "c")]);
    expect(sorted.map((c) => c.id)).toEqual(["b", "a", "c"]);
  });

  it("puts undated work at the top", () => {
    // An announced project belongs above a finished one.
    const sorted = sortCreditsByYear([nameCredit(2021, "released"), nameCredit(null, "announced")]);
    expect(sorted.map((c) => c.id)).toEqual(["announced", "released"]);
  });

  it("does not mutate the input", () => {
    const input = [nameCredit(1998, "a"), nameCredit(2021, "b")];
    sortCreditsByYear(input);
    expect(input.map((c) => c.id)).toEqual(["a", "b"]);
  });
});
