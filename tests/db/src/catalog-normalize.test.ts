import { slugify, sortNameFor, sortTitleFor } from "@saas/db/catalog";

describe("sortTitleFor", () => {
  it("drops a leading English article", () => {
    expect(sortTitleFor("The Godfather")).toBe("godfather");
    expect(sortTitleFor("A Clockwork Orange")).toBe("clockwork orange");
    expect(sortTitleFor("An American Werewolf in London")).toBe("american werewolf in london");
  });

  it("drops leading articles in other languages", () => {
    expect(sortTitleFor("Les Misérables")).toBe("miserables");
    expect(sortTitleFor("Der Untergang")).toBe("untergang");
    expect(sortTitleFor("Il Postino")).toBe("postino");
  });

  it("handles an elided article", () => {
    expect(sortTitleFor("L'Avventura")).toBe("avventura");
  });

  it("keeps an article that is the whole title", () => {
    expect(sortTitleFor("The")).toBe("the");
  });

  it("does not treat an article-shaped first word of a compound as an article", () => {
    // "Thelma" starts with "the" but is one word — the split is on whitespace,
    // so it must survive intact.
    expect(sortTitleFor("Thelma & Louise")).toBe("thelma louise");
  });

  it("folds diacritics so accented and unaccented titles sort together", () => {
    expect(sortTitleFor("Amélie")).toBe("amelie");
  });

  it("collapses punctuation to spaces", () => {
    expect(sortTitleFor("Dr. Strangelove: How I Learned…")).toBe("dr strangelove how i learned");
  });
});

describe("sortNameFor", () => {
  it("keys on the surname", () => {
    expect(sortNameFor("Christopher Nolan")).toBe("nolan, christopher");
  });

  it("keeps particles attached to the surname", () => {
    expect(sortNameFor("Robert De Niro")).toBe("de niro, robert");
    expect(sortNameFor("Vincent van Gogh")).toBe("van gogh, vincent");
  });

  it("looks past a generational suffix", () => {
    expect(sortNameFor("Robert Downey Jr.")).toBe("downey, robert jr.");
  });

  it("leaves a mononym alone", () => {
    expect(sortNameFor("Cher")).toBe("cher");
  });

  it("folds diacritics", () => {
    expect(sortNameFor("Penélope Cruz")).toBe("cruz, penelope");
  });

  it("handles three-part names by taking the last as the surname", () => {
    expect(sortNameFor("Mary Elizabeth Winstead")).toBe("winstead, mary elizabeth");
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Science Fiction")).toBe("science-fiction");
  });

  it("folds diacritics and strips punctuation", () => {
    expect(slugify("Film-Noir!")).toBe("film-noir");
    expect(slugify("Épée")).toBe("epee");
  });

  it("trims leading and trailing separators", () => {
    expect(slugify("  -- hello -- ")).toBe("hello");
  });

  it("bounds the length", () => {
    expect(slugify("a".repeat(200)).length).toBe(120);
  });
});
