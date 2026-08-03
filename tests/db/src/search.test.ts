import { createSearchRepository, toPrefixTsQuery } from "@saas/db/search";
import type { SqlExecutor, SqlExecutorResult, SqlRow } from "@saas/db/hyperdrive";

type QueryRecord = { text: string; params: unknown[] };

function createFakeExecutor(rows: Record<string, unknown>[] = []): {
  executor: SqlExecutor;
  queries: QueryRecord[];
} {
  const queries: QueryRecord[] = [];
  const executor: SqlExecutor = {
    async execute<T extends SqlRow = SqlRow>(
      text: string,
      params?: unknown[],
    ): Promise<SqlExecutorResult<T>> {
      queries.push({ text, params: params ?? [] });
      return { rows: rows as unknown as T[], rowCount: rows.length };
    },
  };
  return { executor, queries };
}

const DOC_ROW = {
  entity_type: "title",
  entity_id: "11111111-1111-1111-1111-111111111111",
  public_id: "tt_11111111111111111111111111111111",
  display: "Arrival",
  secondary: "2016 · movie",
  image_url: "https://cdn.example/poster.jpg",
  body: "",
  popularity: "0.5",
  filters: { kind: "movie", year: 2016 },
  score: "7.25",
};

describe("toPrefixTsQuery", () => {
  it("never emits a tsquery operator taken from user input", () => {
    for (const input of ["a & b", "a | b", "!a", "a <-> b", "((("]) {
      const output = toPrefixTsQuery(input);
      expect(output).not.toMatch(/[|!<>()]/);
    }
  });
});

describe("SearchRepository — publishing", () => {
  it("upserts rather than inserting, so republishing is idempotent", async () => {
    const { executor, queries } = createFakeExecutor();
    const repo = createSearchRepository(executor);

    await repo.upsertDocuments([
      {
        entityType: "title",
        entityId: "11111111-1111-1111-1111-111111111111",
        publicId: "tt_1",
        display: "Arrival",
        secondary: "2016",
        imageUrl: null,
        body: "",
        popularity: 0,
        filters: { kind: "movie" },
      },
    ]);

    expect(queries[0]!.text).toContain("ON CONFLICT (entity_type, entity_id) DO UPDATE");
    expect(queries[0]!.params).toContain("Arrival");
  });

  it("serializes facets as JSON rather than interpolating them", async () => {
    const { executor, queries } = createFakeExecutor();
    const repo = createSearchRepository(executor);

    await repo.upsertDocuments([
      {
        entityType: "title",
        entityId: "11111111-1111-1111-1111-111111111111",
        publicId: "tt_1",
        display: "X",
        secondary: "",
        imageUrl: null,
        body: "",
        popularity: 0,
        filters: { genres: ["drama"] },
      },
    ]);

    expect(queries[0]!.text).toContain("$9::jsonb");
    expect(queries[0]!.params[8]).toBe('{"genres":["drama"]}');
  });

  it("does no work for an empty batch", async () => {
    const { executor, queries } = createFakeExecutor();
    const repo = createSearchRepository(executor);
    const result = await repo.upsertDocuments([]);
    expect(result).toEqual({ ok: true, value: 0 });
    expect(queries).toHaveLength(0);
  });

  it("treats deleting an absent document as success", async () => {
    const { executor } = createFakeExecutor();
    const repo = createSearchRepository(executor);
    // Unpublishing twice must not be an error — the caller's intent is met.
    const result = await repo.deleteDocument("title", "11111111-1111-1111-1111-111111111111");
    expect(result).toEqual({ ok: true, value: undefined });
  });
});

describe("SearchRepository — suggest", () => {
  it("returns nothing for a blank query without touching the database", async () => {
    const { executor, queries } = createFakeExecutor();
    const repo = createSearchRepository(executor);
    const result = await repo.suggest("   ", 8);
    expect(result).toEqual({ ok: true, value: [] });
    expect(queries).toHaveLength(0);
  });

  it("falls back to trigram matching when the text yields no tsquery", async () => {
    const { executor, queries } = createFakeExecutor();
    const repo = createSearchRepository(executor);
    await repo.suggest("&&&", 8);
    // The tsquery is empty, so only the ILIKE branch may appear — passing an
    // empty tsquery to to_tsquery would be a syntax error.
    expect(queries[0]!.text).toContain("display ILIKE");
    expect(queries[0]!.text).not.toContain("to_tsquery");
  });

  it("ranks an exact prefix above raw popularity", async () => {
    const { executor, queries } = createFakeExecutor();
    const repo = createSearchRepository(executor);
    await repo.suggest("arr", 8);
    expect(queries[0]!.text).toContain("similarity(display, $1) * 10");
    expect(queries[0]!.text).toContain("LEAST(popularity, 1)");
  });

  it("scopes to the requested entity types", async () => {
    const { executor, queries } = createFakeExecutor();
    const repo = createSearchRepository(executor);
    await repo.suggest("arr", 8, ["title", "person"]);
    expect(queries[0]!.text).toContain("entity_type = ANY(");
    expect(queries[0]!.params).toContainEqual(["title", "person"]);
  });

  it("maps a row into a hit, coercing numeric strings", async () => {
    const { executor } = createFakeExecutor([DOC_ROW]);
    const repo = createSearchRepository(executor);
    const result = await repo.suggest("arr", 8);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toMatchObject({
      entityType: "title",
      publicId: "tt_11111111111111111111111111111111",
      display: "Arrival",
      popularity: 0.5,
      score: 7.25,
    });
    expect(result.value[0]!.filters).toEqual({ kind: "movie", year: 2016 });
  });

  it("parses a filters column that arrives as a JSON string", async () => {
    const { executor } = createFakeExecutor([{ ...DOC_ROW, filters: '{"kind":"movie"}' }]);
    const repo = createSearchRepository(executor);
    const result = await repo.suggest("arr", 8);
    expect(result.ok && result.value[0]!.filters).toEqual({ kind: "movie" });
  });
});

describe("SearchRepository — full-text search", () => {
  it("returns nothing when the query has no searchable tokens", async () => {
    const { executor, queries } = createFakeExecutor();
    const repo = createSearchRepository(executor);
    const result = await repo.search("!!!", null, 20, 0);
    expect(result).toEqual({ ok: true, value: [] });
    expect(queries).toHaveLength(0);
  });

  it("passes the built tsquery as a parameter, never inline", async () => {
    const { executor, queries } = createFakeExecutor();
    const repo = createSearchRepository(executor);
    await repo.search("blade runner", null, 20, 0);
    expect(queries[0]!.params[0]).toBe("blade:* & runner:*");
    expect(queries[0]!.text).toContain("to_tsquery('simple', $1)");
  });
});

describe("SearchRepository — advanced title search", () => {
  it("browses by popularity when no text is given", async () => {
    const { executor, queries } = createFakeExecutor();
    const repo = createSearchRepository(executor);
    await repo.searchTitles({ limit: 50, offset: 0 });
    expect(queries[0]!.text).toContain("entity_type = 'title'");
    expect(queries[0]!.text).toContain("ORDER BY popularity DESC");
    expect(queries[0]!.text).not.toContain("to_tsquery");
  });

  it("excludes adult titles unless asked", async () => {
    const { executor, queries } = createFakeExecutor();
    const repo = createSearchRepository(executor);
    await repo.searchTitles({ limit: 50, offset: 0 });
    expect(queries[0]!.text).toContain("'adult')::boolean, FALSE) = FALSE");

    const included = createFakeExecutor();
    await createSearchRepository(included.executor).searchTitles({
      limit: 50,
      offset: 0,
      includeAdult: true,
    });
    expect(included.queries[0]!.text).not.toContain("= FALSE");
  });

  it("parameterizes facet lists", async () => {
    const { executor, queries } = createFakeExecutor();
    const repo = createSearchRepository(executor);
    await repo.searchTitles({ limit: 50, offset: 0, genres: ["drama", "sci-fi"] });
    expect(queries[0]!.params).toContain('["drama","sci-fi"]');
    expect(queries[0]!.text).not.toContain("drama");
  });

  it("parameterizes numeric ranges", async () => {
    const { executor, queries } = createFakeExecutor();
    const repo = createSearchRepository(executor);
    await repo.searchTitles({ limit: 50, offset: 0, yearFrom: 1990, ratingFrom: 7 });
    expect(queries[0]!.params).toContain(1990);
    expect(queries[0]!.params).toContain(7);
  });

  it("maps each sort key to a fixed fragment, never to caller text", async () => {
    for (const [sort, fragment] of [
      ["rating", "'rating')::numeric"],
      ["votes", "'votes')::numeric"],
      ["release_date", "'year')::numeric"],
      ["alphabetical", "display"],
      ["runtime", "'runtime')::numeric"],
    ] as const) {
      const { executor, queries } = createFakeExecutor();
      await createSearchRepository(executor).searchTitles({ limit: 10, offset: 0, sort });
      expect(queries[0]!.text).toContain(fragment);
    }
  });

  it("degrades an unknown sort key to popularity instead of erroring", async () => {
    const { executor, queries } = createFakeExecutor();
    await createSearchRepository(executor).searchTitles({
      limit: 10,
      offset: 0,
      sort: "chaos" as never,
    });
    expect(queries[0]!.text).toContain("ORDER BY popularity DESC");
  });

  it("switches to relevance ordering when text is present", async () => {
    const { executor, queries } = createFakeExecutor();
    await createSearchRepository(executor).searchTitles({ limit: 10, offset: 0, text: "arrival" });
    expect(queries[0]!.text).toContain("ORDER BY score DESC");
  });
});

describe("SearchRepository — advanced name search", () => {
  it("scopes to people", async () => {
    const { executor, queries } = createFakeExecutor();
    await createSearchRepository(executor).searchNames({ limit: 50, offset: 0 });
    expect(queries[0]!.text).toContain("entity_type = 'person'");
  });

  it("matches a birth place with a parameterized wildcard", async () => {
    const { executor, queries } = createFakeExecutor();
    await createSearchRepository(executor).searchNames({
      limit: 50,
      offset: 0,
      birthPlace: "Vicenza",
    });
    expect(queries[0]!.params).toContain("%Vicenza%");
    expect(queries[0]!.text).not.toContain("Vicenza");
  });

  it("filters by life-year range", async () => {
    const { executor, queries } = createFakeExecutor();
    await createSearchRepository(executor).searchNames({
      limit: 50,
      offset: 0,
      bornFrom: 1950,
      diedTo: 2020,
    });
    expect(queries[0]!.text).toContain("'bornYear')::numeric >=");
    expect(queries[0]!.text).toContain("'diedYear')::numeric <=");
  });
});

describe("SearchRepository — failure handling", () => {
  it("never leaks a driver error", async () => {
    const executor: SqlExecutor = {
      async execute() {
        throw new Error("relation search.documents does not exist");
      },
    };
    const result = await createSearchRepository(executor).search("arrival", null, 20, 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("internal");
    if (result.error.kind !== "internal") return;
    expect(result.error.message).not.toContain("relation");
  });
});
