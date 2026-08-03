import type { PublicCertificate } from "@saas/contracts/catalog";
import {
  FACT_ORDER,
  TITLE_TABS,
  activeTitleTab,
  factLabel,
  interestingShare,
  isSeries,
  metascoreClass,
  parentsGuideLabel,
  preferredCertificate,
  severityFraction,
  titleTabHref,
  titleTabs,
} from "@/lib/site-title";

const TITLE_ID = "tt_11111111111111111111111111111111";

function certificate(country: string, rating = "PG-13"): PublicCertificate {
  return { country, rating, attributes: [] };
}

describe("preferredCertificate", () => {
  it("prefers a widely-recognised system when one is present", () => {
    expect(preferredCertificate([certificate("BR"), certificate("US")])?.country).toBe("US");
  });

  it("follows the preference order rather than input order", () => {
    expect(preferredCertificate([certificate("GB"), certificate("US")])?.country).toBe("US");
    expect(preferredCertificate([certificate("AU"), certificate("GB")])?.country).toBe("GB");
  });

  it("falls back to the first entry rather than showing nothing", () => {
    expect(preferredCertificate([certificate("BR"), certificate("JP")])?.country).toBe("BR");
  });

  it("returns null when there are no certificates", () => {
    expect(preferredCertificate([])).toBeNull();
  });
});

describe("isSeries", () => {
  it("recognises the serial kinds", () => {
    expect(isSeries("tv_series")).toBe(true);
    expect(isSeries("tv_mini_series")).toBe(true);
    expect(isSeries("podcast_series")).toBe(true);
  });

  it("does not treat a one-off as a series", () => {
    expect(isSeries("movie")).toBe(false);
    expect(isSeries("tv_movie")).toBe(false);
    expect(isSeries("tv_episode")).toBe(false);
  });
});

describe("title tabs", () => {
  it("hides the episodes tab on a film", () => {
    expect(titleTabs("movie").some((t) => t.slug === "episodes")).toBe(false);
    expect(titleTabs("tv_series").some((t) => t.slug === "episodes")).toBe(true);
  });

  it("keeps overview first and at the bare title URL", () => {
    expect(titleTabs("movie")[0]!.slug).toBe("");
    expect(titleTabHref(TITLE_ID, "")).toBe(`/title/${TITLE_ID}`);
    expect(titleTabHref(TITLE_ID, "reviews")).toBe(`/title/${TITLE_ID}/reviews`);
  });

  it("gives every tab a label and a unique slug", () => {
    const slugs = TITLE_TABS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const tab of TITLE_TABS) expect(tab.label.length).toBeGreaterThan(0);
  });
});

describe("activeTitleTab", () => {
  it("selects overview at the bare title URL", () => {
    expect(activeTitleTab(`/title/${TITLE_ID}`, TITLE_ID)).toBe("");
  });

  it("selects the sub-route it is on", () => {
    expect(activeTitleTab(`/title/${TITLE_ID}/reviews`, TITLE_ID)).toBe("reviews");
    expect(activeTitleTab(`/title/${TITLE_ID}/parentalguide`, TITLE_ID)).toBe("parentalguide");
  });

  it("never mistakes the id for a slug", () => {
    expect(activeTitleTab(`/title/${TITLE_ID}`, TITLE_ID)).not.toBe(TITLE_ID);
  });

  it("falls back to overview for a sub-route it does not know", () => {
    expect(activeTitleTab(`/title/${TITLE_ID}/nonsense`, TITLE_ID)).toBe("");
  });

  it("selects nothing for an unrelated path", () => {
    expect(activeTitleTab("/find", TITLE_ID)).toBe("");
  });
});

describe("interestingShare", () => {
  it("is a rounded percentage", () => {
    expect(interestingShare(12, 20)).toBe(60);
    expect(interestingShare(1, 3)).toBe(33);
  });

  it("distinguishes 'nobody voted' from 'nobody found it interesting'", () => {
    expect(interestingShare(0, 0)).toBeNull();
    expect(interestingShare(0, 5)).toBe(0);
  });
});

describe("severityFraction", () => {
  it("maps the scale to a fill", () => {
    expect(severityFraction("none")).toBe(0);
    expect(severityFraction("severe")).toBe(1);
    expect(severityFraction("mild")).toBeCloseTo(1 / 3);
    expect(severityFraction("moderate")).toBeCloseTo(2 / 3);
  });

  it("distinguishes 'no consensus' from 'none'", () => {
    // Both would draw an empty bar, but only one of them is a verdict.
    expect(severityFraction(null)).toBeNull();
    expect(severityFraction("none")).toBe(0);
  });
});

describe("labels", () => {
  it("labels every fact kind", () => {
    for (const kind of FACT_ORDER) expect(factLabel(kind).length).toBeGreaterThan(0);
  });

  it("labels every parents-guide category, including one it has not seen", () => {
    expect(parentsGuideLabel("violence_gore")).toBe("Violence & Gore");
    expect(parentsGuideLabel("something_new")).toBe("Something New");
  });

  it("gives each metascore band its own appearance and none to an absent score", () => {
    const bands = ["positive", "mixed", "negative"] as const;
    const classes = bands.map(metascoreClass);
    expect(new Set(classes).size).toBe(3);
    expect(classes).not.toContain(metascoreClass(null));
  });
});
