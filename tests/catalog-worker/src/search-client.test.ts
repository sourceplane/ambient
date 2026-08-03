import type { Person, Title } from "@saas/db/catalog";
import {
  personSearchDocument,
  publishSearchDocuments,
  titleSearchDocument,
  unpublishSearchDocument,
} from "@catalog-worker/search-client";

const TITLE_UUID = "11111111-1111-1111-1111-111111111111";
const NAME_UUID = "22222222-2222-2222-2222-222222222222";
const NOW = new Date("2026-08-01T12:00:00.000Z");

const title: Title = {
  id: TITLE_UUID,
  kind: "movie",
  primaryTitle: "Bicycle Thieves",
  originalTitle: "Ladri di biciclette",
  sortTitle: "bicycle thieves",
  startYear: 1948,
  endYear: null,
  runtimeMinutes: 89,
  isAdult: false,
  productionStatus: "released",
  plotOutline: "A man searches Rome for his stolen bicycle.",
  plotSummary: null,
  synopsis: null,
  tagline: null,
  status: "published",
  createdAt: NOW,
  updatedAt: NOW,
  archivedAt: null,
};

const person: Person = {
  id: NAME_UUID,
  name: "Vittorio De Sica",
  sortName: "de sica, vittorio",
  birthDate: "1901-07-07",
  birthPlace: "Sora, Italy",
  deathDate: "1974-11-13",
  deathPlace: "Neuilly-sur-Seine, France",
  deathCause: null,
  heightCm: null,
  miniBio: null,
  bioAuthor: null,
  status: "published",
  createdAt: NOW,
  updatedAt: NOW,
  archivedAt: null,
};

function createFetcher(status = 200): { fetcher: Fetcher; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = {
    fetch(input: string | Request | URL, init?: RequestInit): Promise<Response> {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push({ url, init: init ?? {} });
      return Promise.resolve(new Response(null, { status }));
    },
    connect() {
      throw new Error("not implemented");
    },
  } as unknown as Fetcher;
  return { fetcher, calls };
}

describe("titleSearchDocument", () => {
  it("carries the original title into the searchable body", () => {
    // Searching "Ladri di biciclette" must find "Bicycle Thieves".
    const doc = titleSearchDocument(title, ["drama"], null)!;
    expect(doc.body).toContain("Ladri di biciclette");
    expect(doc.display).toBe("Bicycle Thieves");
  });

  it("builds a human-readable secondary line", () => {
    expect(titleSearchDocument(title, [], null)!.secondary).toBe("1948 · movie");
  });

  it("renders the public id, not the uuid", () => {
    const doc = titleSearchDocument(title, [], null)!;
    expect(doc.publicId).toBe(`tt_${TITLE_UUID.replace(/-/g, "")}`);
    expect(doc.entityId).toBe(TITLE_UUID);
  });

  it("carries the facets advanced search filters on", () => {
    const doc = titleSearchDocument(title, ["drama", "neorealism"], null)!;
    expect(doc.facets).toEqual({
      kind: "movie",
      year: 1948,
      genres: ["drama", "neorealism"],
      runtime: 89,
      adult: false,
    });
  });

  it("omits an absent year rather than emitting null", () => {
    const doc = titleSearchDocument({ ...title, startYear: null }, [], null)!;
    expect(doc.facets).not.toHaveProperty("year");
  });

  it("refuses to index a draft or archived title", () => {
    expect(titleSearchDocument({ ...title, status: "draft" }, [], null)).toBeNull();
    expect(titleSearchDocument({ ...title, status: "archived" }, [], null)).toBeNull();
  });
});

describe("personSearchDocument", () => {
  it("derives life years from the dates", () => {
    const doc = personSearchDocument(person, ["director"], null)!;
    expect(doc.facets).toMatchObject({ bornYear: 1901, diedYear: 1974 });
  });

  it("humanizes professions in the secondary line", () => {
    const doc = personSearchDocument(person, ["director", "production_designer"], null)!;
    expect(doc.secondary).toBe("director, production designer");
  });

  it("refuses to index an unpublished person", () => {
    expect(personSearchDocument({ ...person, status: "archived" }, [], null)).toBeNull();
  });
});

describe("publishing is best-effort", () => {
  it("publishes a batch to the internal seam", async () => {
    const { fetcher, calls } = createFetcher();
    await publishSearchDocuments(fetcher, [titleSearchDocument(title, [], null)!], "req_1");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/v1/internal/search/documents");
    expect(calls[0]!.init.method).toBe("PUT");
  });

  it("does nothing when the binding is absent", async () => {
    await expect(
      publishSearchDocuments(undefined, [titleSearchDocument(title, [], null)!], "req_1"),
    ).resolves.toBeUndefined();
  });

  it("does nothing for an empty batch", async () => {
    const { fetcher, calls } = createFetcher();
    await publishSearchDocuments(fetcher, [], "req_1");
    expect(calls).toHaveLength(0);
  });

  it("does not throw when the index rejects the write", async () => {
    // A curation write must not fail because a projection could not be
    // updated — the index is rebuildable, the write is not.
    const { fetcher } = createFetcher(503);
    await expect(
      publishSearchDocuments(fetcher, [titleSearchDocument(title, [], null)!], "req_1"),
    ).resolves.toBeUndefined();
  });

  it("does not throw when the index is unreachable", async () => {
    const fetcher = {
      fetch: () => Promise.reject(new Error("no route to host")),
      connect() {
        throw new Error("not implemented");
      },
    } as unknown as Fetcher;
    await expect(
      publishSearchDocuments(fetcher, [titleSearchDocument(title, [], null)!], "req_1"),
    ).resolves.toBeUndefined();
  });

  it("unpublishes by entity type and uuid", async () => {
    const { fetcher, calls } = createFetcher();
    await unpublishSearchDocument(fetcher, "title", TITLE_UUID, "req_1");
    expect(calls[0]!.url).toContain(`/v1/internal/search/documents/title/${TITLE_UUID}`);
    expect(calls[0]!.init.method).toBe("DELETE");
  });

  it("does not throw when unpublishing fails", async () => {
    const fetcher = {
      fetch: () => Promise.reject(new Error("no route to host")),
      connect() {
        throw new Error("not implemented");
      },
    } as unknown as Fetcher;
    await expect(
      unpublishSearchDocument(fetcher, "title", TITLE_UUID, "req_1"),
    ).resolves.toBeUndefined();
  });
});
