import { createCatalogRepository, CONNECTION_INVERSE } from "@saas/db/catalog";
import type { ConnectionKind } from "@saas/db/catalog";
import { asUuid } from "@saas/db";
import type { SqlExecutor, SqlExecutorResult, SqlRow } from "@saas/db/hyperdrive";

const TITLE_ID = asUuid("11111111-1111-1111-1111-111111111111");
const OTHER_TITLE_ID = asUuid("22222222-2222-2222-2222-222222222222");
const PERSON_ID = asUuid("33333333-3333-3333-3333-333333333333");
const CREDIT_ID = asUuid("44444444-4444-4444-4444-444444444444");
const IMAGE_ID = asUuid("55555555-5555-5555-5555-555555555555");
const INVERSE_ID = asUuid("66666666-6666-6666-6666-666666666666");

const NOW = new Date("2026-08-01T12:00:00Z");

type QueryRecord = { text: string; params: unknown[] };

function createFakeExecutor(handler?: (text: string, params: unknown[]) => Record<string, unknown>[]): {
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
      const rows = (handler?.(text, params ?? []) ?? []) as unknown as T[];
      return { rows, rowCount: rows.length };
    },
  };
  return { executor, queries };
}

const TITLE_ROW = {
  id: TITLE_ID,
  kind: "movie",
  primary_title: "Arrival",
  original_title: "Arrival",
  sort_title: "arrival",
  start_year: 2016,
  end_year: null,
  runtime_minutes: 116,
  is_adult: false,
  production_status: "released",
  plot_outline: "A linguist works with the military.",
  plot_summary: null,
  synopsis: null,
  tagline: "Why are they here?",
  status: "published",
  created_at: NOW.toISOString(),
  updated_at: NOW.toISOString(),
  archived_at: null,
};

const PERSON_ROW = {
  id: PERSON_ID,
  name: "Amy Adams",
  sort_name: "adams, amy",
  birth_date: "1974-08-20",
  birth_place: "Vicenza, Italy",
  death_date: null,
  death_place: null,
  death_cause: null,
  height_cm: 163,
  mini_bio: null,
  bio_author: null,
  status: "published",
  created_at: NOW.toISOString(),
  updated_at: NOW.toISOString(),
  archived_at: null,
};

describe("CatalogRepository — titles", () => {
  it("parameterizes every value on create", async () => {
    const { executor, queries } = createFakeExecutor(() => [TITLE_ROW]);
    const repo = createCatalogRepository(executor);

    await repo.createTitle({
      id: TITLE_ID,
      kind: "movie",
      primaryTitle: "Arrival",
      sortTitle: "arrival",
      startYear: 2016,
      runtimeMinutes: 116,
      createdAt: NOW,
    });

    const insert = queries[0]!;
    expect(insert.text).toContain("INSERT INTO catalog.titles");
    expect(insert.text).not.toContain("Arrival");
    expect(insert.params).toContain("Arrival");
  });

  it("maps a row into the domain shape", async () => {
    const { executor } = createFakeExecutor(() => [TITLE_ROW]);
    const repo = createCatalogRepository(executor);

    const result = await repo.getTitleById(TITLE_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      id: TITLE_ID,
      kind: "movie",
      primaryTitle: "Arrival",
      startYear: 2016,
      runtimeMinutes: 116,
      isAdult: false,
      tagline: "Why are they here?",
    });
    expect(result.value.createdAt).toBeInstanceOf(Date);
  });

  it("coerces numeric columns that arrive as strings", async () => {
    // Hyperdrive/postgres.js hands back INT columns as strings when type
    // fetching is off; the mapper must not leak that into the domain.
    const { executor } = createFakeExecutor(() => [
      { ...TITLE_ROW, start_year: "2016", runtime_minutes: "116", is_adult: "f" },
    ]);
    const repo = createCatalogRepository(executor);

    const result = await repo.getTitleById(TITLE_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.startYear).toBe(2016);
    expect(result.value.runtimeMinutes).toBe(116);
    expect(result.value.isAdult).toBe(false);
  });

  it("reports not_found rather than throwing on a missing title", async () => {
    const { executor } = createFakeExecutor(() => []);
    const repo = createCatalogRepository(executor);

    const result = await repo.getTitleById(TITLE_ID);
    expect(result).toEqual({ ok: false, error: { kind: "not_found" } });
  });

  it("reports a conflict when the insert hits an existing id", async () => {
    const { executor } = createFakeExecutor(() => []);
    const repo = createCatalogRepository(executor);

    const result = await repo.createTitle({
      id: TITLE_ID,
      kind: "movie",
      primaryTitle: "Arrival",
      sortTitle: "arrival",
      createdAt: NOW,
    });
    expect(result).toEqual({ ok: false, error: { kind: "conflict", entity: "title" } });
  });

  it("only updates the fields that were supplied", async () => {
    const { executor, queries } = createFakeExecutor(() => [TITLE_ROW]);
    const repo = createCatalogRepository(executor);

    await repo.updateTitle(TITLE_ID, { tagline: "New tagline" }, NOW);

    const update = queries[0]!;
    expect(update.text).toContain("SET tagline = $2, updated_at = $3");
    expect(update.text).not.toContain("primary_title =");
  });

  it("skips the UPDATE entirely when no field changed", async () => {
    const { executor, queries } = createFakeExecutor(() => [TITLE_ROW]);
    const repo = createCatalogRepository(executor);

    await repo.updateTitle(TITLE_ID, {}, NOW);

    expect(queries).toHaveLength(1);
    expect(queries[0]!.text).toContain("SELECT");
  });

  it("filters drafts out of the default listing", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    const repo = createCatalogRepository(executor);

    await repo.listTitlesPaged({}, { limit: 20, cursor: null });

    // Bound as a scalar, not as a one-element array: an array parameter
    // throws at bind time under `fetch_types: false`.
    expect(queries[0]!.params[0]).toBe("published");
    expect(queries[0]!.text).toContain("t.status IN ($1)");
    expect(queries[0]!.text).toContain("t.is_adult = FALSE");
  });

  it("builds a keyset predicate from the cursor", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    const repo = createCatalogRepository(executor);

    await repo.listTitlesPaged(
      { kinds: ["movie"] },
      { limit: 20, cursor: { createdAt: NOW.toISOString(), id: TITLE_ID } },
    );

    expect(queries[0]!.text).toContain("(t.created_at, t.id) <");
    expect(queries[0]!.params).toContain(NOW.toISOString());
  });

  it("asks for one row more than the page so it can emit a next cursor", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ ...TITLE_ROW, id: `id-${i}` }));
    const { executor, queries } = createFakeExecutor(() => rows);
    const repo = createCatalogRepository(executor);

    const result = await repo.listTitlesPaged({}, { limit: 2, cursor: null });

    expect(queries[0]!.params.at(-1)).toBe(3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toHaveLength(2);
    expect(result.value.nextCursor).toEqual({ createdAt: NOW.toISOString(), id: "id-1" });
  });

  it("returns no cursor on the last page", async () => {
    const { executor } = createFakeExecutor(() => [TITLE_ROW]);
    const repo = createCatalogRepository(executor);

    const result = await repo.listTitlesPaged({}, { limit: 20, cursor: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nextCursor).toBeNull();
  });

  it("short-circuits a batch load of no ids", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    const repo = createCatalogRepository(executor);

    const result = await repo.getTitlesByIds([]);
    expect(result).toEqual({ ok: true, value: [] });
    expect(queries).toHaveLength(0);
  });
});

describe("CatalogRepository — connections", () => {
  it("writes both directions so either title reads the relationship", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    const repo = createCatalogRepository(executor);

    await repo.linkConnection(CREDIT_ID, INVERSE_ID, TITLE_ID, OTHER_TITLE_ID, "follows", null);

    expect(queries).toHaveLength(2);
    expect(queries[0]!.params.slice(1, 5)).toEqual([TITLE_ID, OTHER_TITLE_ID, "follows", null]);
    expect(queries[1]!.params.slice(1, 5)).toEqual([
      OTHER_TITLE_ID,
      TITLE_ID,
      "followed_by",
      null,
    ]);
  });

  it("pairs every connection kind with an inverse that maps back", () => {
    for (const [kind, inverse] of Object.entries(CONNECTION_INVERSE)) {
      expect(CONNECTION_INVERSE[inverse]).toBe(kind as ConnectionKind);
    }
  });
});

describe("CatalogRepository — credits", () => {
  it("writes character rows alongside the credit", async () => {
    const { executor, queries } = createFakeExecutor((text) =>
      text.includes("INSERT INTO catalog.credits")
        ? [
            {
              id: CREDIT_ID,
              title_id: TITLE_ID,
              person_id: PERSON_ID,
              category: "cast",
              department: "cast",
              job: "Actor",
              billing_order: 0,
              episode_count: null,
              is_uncredited: false,
              is_voice: false,
              is_archive_footage: false,
              is_self: false,
              note: null,
            },
          ]
        : [],
    );
    const repo = createCatalogRepository(executor);

    const result = await repo.createCredit({
      id: CREDIT_ID,
      titleId: TITLE_ID,
      personId: PERSON_ID,
      category: "cast",
      department: "cast",
      job: "Actor",
      billingOrder: 0,
      characters: ["Louise Banks"],
      createdAt: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.characters).toEqual(["Louise Banks"]);
    expect(queries[1]!.text).toContain("INSERT INTO catalog.credit_characters");
    expect(queries[1]!.params).toContain("Louise Banks");
  });

  it("aggregates characters in the credit query instead of one query per credit", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    const repo = createCatalogRepository(executor);

    await repo.listTitleCredits(TITLE_ID, { limit: 50, category: "cast" });

    expect(queries).toHaveLength(1);
    expect(queries[0]!.text).toContain("array_agg(cc.character_name ORDER BY cc.ordering)");
  });

  it("orders a filmography newest-first", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    const repo = createCatalogRepository(executor);

    await repo.listPersonCredits(PERSON_ID, { limit: 50 });

    expect(queries[0]!.text).toContain("ORDER BY t.start_year DESC NULLS FIRST");
    expect(queries[0]!.text).toContain("t.status = 'published'");
  });

  it("maps a joined credit row into credit + person", async () => {
    const { executor } = createFakeExecutor(() => [
      {
        id: CREDIT_ID,
        title_id: TITLE_ID,
        person_id: PERSON_ID,
        category: "cast",
        department: "cast",
        job: "Actor",
        billing_order: 0,
        episode_count: null,
        is_uncredited: false,
        is_voice: false,
        is_archive_footage: false,
        is_self: false,
        note: null,
        characters: ["Louise Banks"],
        ...Object.fromEntries(Object.entries(PERSON_ROW).map(([k, v]) => [`p_${k}`, v])),
      },
    ]);
    const repo = createCatalogRepository(executor);

    const result = await repo.listTitleCredits(TITLE_ID, { limit: 50 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.person.name).toBe("Amy Adams");
    expect(result.value[0]!.characters).toEqual(["Louise Banks"]);
  });
});

describe("CatalogRepository — people", () => {
  it("keeps DATE columns as ISO date strings", async () => {
    const { executor } = createFakeExecutor(() => [PERSON_ROW]);
    const repo = createCatalogRepository(executor);

    const result = await repo.getPersonById(PERSON_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.birthDate).toBe("1974-08-20");
    expect(result.value.deathDate).toBeNull();
  });

  it("writes professions in the order given", async () => {
    const { executor, queries } = createFakeExecutor((text) =>
      text.includes("INSERT INTO catalog.people") ? [PERSON_ROW] : [],
    );
    const repo = createCatalogRepository(executor);

    await repo.createPerson({
      id: PERSON_ID,
      name: "Amy Adams",
      sortName: "adams, amy",
      professions: ["actress", "producer"],
      createdAt: NOW,
    });

    expect(queries[1]!.params).toEqual([PERSON_ID, "actress", 0]);
    expect(queries[2]!.params).toEqual([PERSON_ID, "producer", 1]);
  });
});

describe("CatalogRepository — media", () => {
  it("demotes the incumbent primary before attaching a new one", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    const repo = createCatalogRepository(executor);

    await repo.attachTitleImage(TITLE_ID, { imageId: IMAGE_ID, isPrimary: true });

    expect(queries).toHaveLength(2);
    expect(queries[0]!.text).toContain("SET is_primary = FALSE");
    expect(queries[1]!.text).toContain("INSERT INTO catalog.title_images");
  });

  it("does not touch the incumbent when the image is not primary", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    const repo = createCatalogRepository(executor);

    await repo.attachTitleImage(TITLE_ID, { imageId: IMAGE_ID });

    expect(queries).toHaveLength(1);
    expect(queries[0]!.text).toContain("INSERT INTO catalog.title_images");
  });

  it("loads a whole rail of posters in one query", async () => {
    const { executor, queries } = createFakeExecutor(() => [
      {
        title_id: TITLE_ID,
        id: IMAGE_ID,
        url: "https://cdn.example/poster.jpg",
        width: 600,
        height: 900,
        kind: "poster",
        caption: null,
        credit: null,
        language: null,
        blurhash: null,
        ordering: 0,
        is_primary: true,
      },
    ]);
    const repo = createCatalogRepository(executor);

    const result = await repo.getPrimaryImages([TITLE_ID, OTHER_TITLE_ID]);
    expect(queries).toHaveLength(1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.get(TITLE_ID)?.url).toBe("https://cdn.example/poster.jpg");
    expect(result.value.get(TITLE_ID)?.width).toBe(600);
  });

  it("skips the query when there are no ids to look up", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    const repo = createCatalogRepository(executor);

    const result = await repo.getPrimaryImages([]);
    expect(queries).toHaveLength(0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.size).toBe(0);
  });

  it("bumps the denormalized keyword count only when the link is new", async () => {
    const { executor, queries } = createFakeExecutor((text) =>
      text.includes("INSERT INTO catalog.title_keywords") ? [{ keyword_id: "kw" }] : [],
    );
    const repo = createCatalogRepository(executor);

    await repo.addTitleKeyword(TITLE_ID, "time-travel", "Time Travel", IMAGE_ID);

    expect(queries.some((q) => q.text.includes("title_count = title_count + 1"))).toBe(true);
  });

  it("leaves the keyword count alone when the link already existed", async () => {
    const { executor, queries } = createFakeExecutor(() => []);
    const repo = createCatalogRepository(executor);

    await repo.addTitleKeyword(TITLE_ID, "time-travel", "Time Travel", IMAGE_ID);

    expect(queries.some((q) => q.text.includes("title_count = title_count + 1"))).toBe(false);
  });
});

describe("CatalogRepository — failure handling", () => {
  it("never leaks a driver error to the caller", async () => {
    const executor: SqlExecutor = {
      async execute() {
        throw new Error("connection reset by peer");
      },
    };
    const repo = createCatalogRepository(executor);

    const result = await repo.getTitleById(TITLE_ID);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("internal");
    if (result.error.kind !== "internal") return;
    expect(result.error.message).not.toContain("connection reset");
  });

  it("translates a unique violation into a conflict", async () => {
    const executor: SqlExecutor = {
      async execute() {
        throw Object.assign(new Error("duplicate key"), { code: "23505" });
      },
    };
    const repo = createCatalogRepository(executor);

    const result = await repo.createPerson({
      id: PERSON_ID,
      name: "Amy Adams",
      sortName: "adams, amy",
      createdAt: NOW,
    });
    expect(result).toEqual({ ok: false, error: { kind: "conflict", entity: "person" } });
  });

  it("translates a foreign-key violation into not_found", async () => {
    const executor: SqlExecutor = {
      async execute() {
        throw Object.assign(new Error("violates foreign key"), { code: "23503" });
      },
    };
    const repo = createCatalogRepository(executor);

    const result = await repo.createCredit({
      id: CREDIT_ID,
      titleId: TITLE_ID,
      personId: PERSON_ID,
      category: "crew",
      department: "directing",
      job: "Director",
      createdAt: NOW,
    });
    expect(result).toEqual({ ok: false, error: { kind: "not_found" } });
  });
});
