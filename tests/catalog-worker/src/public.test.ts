import type { Credit, Image, Person, Title, TitleConnection, Video } from "@saas/db/catalog";
import {
  toPublicConnection,
  toPublicCreditBase,
  toPublicEpisode,
  toPublicImage,
  toPublicName,
  toPublicTitle,
  toPublicTitleSummary,
  toPublicVideo,
} from "@catalog-worker/public";

const TITLE_UUID = "11111111-1111-1111-1111-111111111111";
const NAME_UUID = "22222222-2222-2222-2222-222222222222";
const IMAGE_UUID = "33333333-3333-3333-3333-333333333333";
const VIDEO_UUID = "44444444-4444-4444-4444-444444444444";
const CREDIT_UUID = "55555555-5555-5555-5555-555555555555";

const NOW = new Date("2026-08-01T12:00:00.000Z");

const title: Title = {
  id: TITLE_UUID,
  kind: "movie",
  primaryTitle: "Arrival",
  originalTitle: "Arrival",
  sortTitle: "arrival",
  startYear: 2016,
  endYear: null,
  runtimeMinutes: 116,
  isAdult: false,
  productionStatus: "released",
  plotOutline: "A linguist works with the military.",
  plotSummary: null,
  synopsis: null,
  tagline: "Why are they here?",
  status: "published",
  createdAt: NOW,
  updatedAt: NOW,
  archivedAt: null,
};

const person: Person = {
  id: NAME_UUID,
  name: "Amy Adams",
  sortName: "adams, amy",
  birthDate: "1974-08-20",
  birthPlace: "Vicenza, Italy",
  deathDate: null,
  deathPlace: null,
  deathCause: null,
  heightCm: 163,
  miniBio: null,
  bioAuthor: null,
  status: "published",
  createdAt: NOW,
  updatedAt: NOW,
  archivedAt: null,
};

const image: Image = {
  id: IMAGE_UUID,
  url: "https://cdn.example/poster.jpg",
  width: 600,
  height: 900,
  kind: "poster",
  caption: null,
  credit: null,
  language: null,
  blurhash: "LKO2",
  ordering: 0,
  isPrimary: true,
};

describe("public id rendering", () => {
  it("renders a title id, never the raw uuid", () => {
    const out = toPublicTitleSummary(title);
    expect(out.id).toBe(`tt_${TITLE_UUID.replace(/-/g, "")}`);
    expect(JSON.stringify(out)).not.toContain(TITLE_UUID);
  });

  it("renders a name id", () => {
    expect(toPublicName(person).id).toBe(`nm_${NAME_UUID.replace(/-/g, "")}`);
  });

  it("renders an image id", () => {
    expect(toPublicImage(image).id).toBe(`rm_${IMAGE_UUID.replace(/-/g, "")}`);
  });
});

describe("title serialization", () => {
  it("does not leak the record status onto the public shape", () => {
    // `status` is an editorial concept. A published record is the only thing
    // the public surface ever returns, so exposing the column invites callers
    // to branch on a value that is always the same.
    const out = toPublicTitle(title);
    expect(out).not.toHaveProperty("status");
    expect(out).not.toHaveProperty("archivedAt");
  });

  it("emits timestamps as ISO strings", () => {
    const out = toPublicTitle(title);
    expect(out.createdAt).toBe("2026-08-01T12:00:00.000Z");
    expect(out.updatedAt).toBe("2026-08-01T12:00:00.000Z");
  });

  it("carries genres and the primary image through", () => {
    const out = toPublicTitleSummary(title, [{ slug: "sci-fi", name: "Sci-Fi" }], image);
    expect(out.genres).toEqual([{ slug: "sci-fi", name: "Sci-Fi" }]);
    expect(out.primaryImage?.width).toBe(600);
    expect(out.primaryImage?.height).toBe(900);
  });

  it("defaults to no genres and no image", () => {
    const out = toPublicTitleSummary(title);
    expect(out.genres).toEqual([]);
    expect(out.primaryImage).toBeNull();
  });
});

describe("person serialization", () => {
  it("keeps dates as calendar strings", () => {
    const out = toPublicName(person, ["actress"]);
    expect(out.birthDate).toBe("1974-08-20");
    expect(out.deathDate).toBeNull();
    expect(out.professions).toEqual(["actress"]);
  });
});

describe("credit serialization", () => {
  const credit: Credit = {
    id: CREDIT_UUID,
    titleId: TITLE_UUID,
    personId: NAME_UUID,
    category: "cast",
    department: "cast",
    job: "Actor",
    billingOrder: 0,
    episodeCount: null,
    isUncredited: false,
    isVoice: false,
    isArchiveFootage: false,
    isSelf: false,
    note: null,
    characters: ["Louise Banks"],
  };

  it("keeps the credit attributes that change how a row reads", () => {
    const out = toPublicCreditBase(credit);
    expect(out.characters).toEqual(["Louise Banks"]);
    expect(out.billingOrder).toBe(0);
    expect(out.isUncredited).toBe(false);
    expect(out.id).toBe(`cr_${CREDIT_UUID.replace(/-/g, "")}`);
  });

  it("does not leak the internal title or person uuid", () => {
    expect(JSON.stringify(toPublicCreditBase(credit))).not.toContain(TITLE_UUID);
  });
});

describe("dangling references", () => {
  it("drops a connection whose far side is unpublished", () => {
    const connection: TitleConnection = {
      id: "c1",
      fromTitleId: TITLE_UUID,
      toTitleId: "99999999-9999-9999-9999-999999999999",
      kind: "follows",
      note: null,
      title: null,
    };
    expect(toPublicConnection(connection)).toBeNull();
  });

  it("keeps a connection whose far side resolved", () => {
    const connection: TitleConnection = {
      id: "c1",
      fromTitleId: TITLE_UUID,
      toTitleId: TITLE_UUID,
      kind: "followed_by",
      note: "sequel",
      title,
    };
    const out = toPublicConnection(connection);
    expect(out?.kind).toBe("followed_by");
    expect(out?.title.primaryTitle).toBe("Arrival");
  });

  it("drops an episode row with no resolved title", () => {
    expect(
      toPublicEpisode({
        episodeTitleId: TITLE_UUID,
        seriesTitleId: TITLE_UUID,
        seasonNumber: 1,
        episodeNumber: 1,
        airedOn: null,
        title: null,
      }),
    ).toBeNull();
  });
});

describe("video serialization", () => {
  it("renders owner ids and a null timestamp when absent", () => {
    const video: Video = {
      id: VIDEO_UUID,
      titleId: TITLE_UUID,
      personId: null,
      kind: "trailer",
      name: "Official Trailer",
      url: "https://cdn.example/trailer.mp4",
      thumbnailUrl: null,
      runtimeSeconds: 143,
      language: "en",
      publishedAt: null,
      ordering: 0,
    };
    const out = toPublicVideo(video);
    expect(out.titleId).toBe(`tt_${TITLE_UUID.replace(/-/g, "")}`);
    expect(out.nameId).toBeNull();
    expect(out.publishedAt).toBeNull();
  });
});
