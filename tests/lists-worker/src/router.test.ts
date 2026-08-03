import { listPublicId, parseListPublicId, route, toPublicItem, toPublicList } from "@lists-worker/router";
import type { Env } from "@lists-worker/env";
import type { List, ListItem } from "@saas/db/lists";

const LIST_UUID = "11111111-1111-1111-1111-111111111111";
const ITEM_UUID = "22222222-2222-2222-2222-222222222222";
const TITLE_UUID = "33333333-3333-3333-3333-333333333333";
const USER_UUID = "44444444-4444-4444-4444-444444444444";
const LIST_ID = `ls_${LIST_UUID.replace(/-/g, "")}`;
const ITEM_ID = `li_${ITEM_UUID.replace(/-/g, "")}`;
const TITLE_ID = `tt_${TITLE_UUID.replace(/-/g, "")}`;
const NAME_ID = `nm_${TITLE_UUID.replace(/-/g, "")}`;
const USER_ID = `usr_${USER_UUID.replace(/-/g, "")}`;
const NOW = new Date("2026-08-03T12:00:00.000Z");

function bareEnv(): Env {
  return { ENVIRONMENT: "test" };
}

function req(path: string, method = "GET", body?: unknown, actor = false): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (actor) {
    headers.set("x-actor-subject-id", USER_ID);
    headers.set("x-actor-subject-type", "user");
  }
  return new Request(`https://lists.internal${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const list: List = {
  id: LIST_UUID,
  ownerUserId: USER_UUID,
  name: "Neo-noir essentials",
  description: null,
  kind: "custom",
  visibility: "public",
  isRanked: true,
  itemCount: 12,
  likeCount: 3,
  createdAt: NOW,
  updatedAt: NOW,
};

describe("public ids", () => {
  it("round-trips a list id", () => {
    expect(listPublicId(LIST_UUID)).toBe(LIST_ID);
    expect(parseListPublicId(LIST_ID)).toBe(LIST_UUID);
  });

  it("rejects a wrong prefix", () => {
    expect(parseListPublicId(TITLE_ID)).toBeNull();
  });
});

describe("personal routes require a session", () => {
  it.each([
    ["/v1/me/watchlist", "GET"],
    [`/v1/me/watchlist/${TITLE_ID}`, "GET"],
    [`/v1/me/watchlist/${TITLE_ID}`, "PUT"],
    [`/v1/me/watchlist/${TITLE_ID}`, "DELETE"],
    ["/v1/me/lists", "GET"],
    ["/v1/me/lists", "POST"],
  ])("401s %s %s without an actor", async (path, method) => {
    const response = await route(
      req(path, method, method === "POST" || method === "PUT" ? {} : undefined),
      bareEnv(),
    );
    expect(response.status).toBe(401);
  });

  it.each([
    [`/v1/lists/${LIST_ID}`, "PATCH"],
    [`/v1/lists/${LIST_ID}`, "DELETE"],
    [`/v1/lists/${LIST_ID}/items`, "POST"],
    [`/v1/lists/${LIST_ID}/items/${ITEM_ID}`, "PATCH"],
    [`/v1/lists/${LIST_ID}/items/${ITEM_ID}`, "DELETE"],
    [`/v1/lists/${LIST_ID}/like`, "POST"],
    [`/v1/lists/${LIST_ID}/like`, "DELETE"],
  ])("401s %s %s without an actor", async (path, method) => {
    const response = await route(
      req(path, method, method === "DELETE" ? undefined : {}),
      bareEnv(),
    );
    expect(response.status).toBe(401);
  });
});

describe("public reads", () => {
  it.each([`/v1/lists/${LIST_ID}`, `/v1/lists/${LIST_ID}/items`, `/v1/users/${USER_ID}/lists`])(
    "routes %s without a session",
    async (path) => {
      const response = await route(req(path), bareEnv());
      expect(response.status).toBe(503);
    },
  );

  it("404s a malformed list id", async () => {
    expect((await route(req("/v1/lists/ls_zzz"), bareEnv())).status).toBe(404);
  });

  it("422s an unknown item sort", async () => {
    const response = await route(req(`/v1/lists/${LIST_ID}/items?sort=chaos`), bareEnv());
    expect(response.status).toBe(422);
  });

  it("422s an over-cap page size", async () => {
    const response = await route(req(`/v1/lists/${LIST_ID}/items?limit=9999`), bareEnv());
    expect(response.status).toBe(422);
  });
});

describe("watchlist entity ids", () => {
  it("accepts a title id", async () => {
    const response = await route(req(`/v1/me/watchlist/${TITLE_ID}`, "PUT", {}, true), bareEnv());
    expect(response.status).toBe(503);
  });

  it("accepts a name id", async () => {
    const response = await route(req(`/v1/me/watchlist/${NAME_ID}`, "PUT", {}, true), bareEnv());
    expect(response.status).toBe(503);
  });

  it("404s an id with an unsupported prefix", async () => {
    const response = await route(
      req(`/v1/me/watchlist/co_${TITLE_UUID.replace(/-/g, "")}`, "PUT", {}, true),
      bareEnv(),
    );
    expect(response.status).toBe(404);
  });

  it("404s a malformed id", async () => {
    const response = await route(req("/v1/me/watchlist/tt_nothex", "PUT", {}, true), bareEnv());
    expect(response.status).toBe(404);
  });
});

describe("list creation validation", () => {
  it("requires a name", async () => {
    const response = await route(req("/v1/me/lists", "POST", {}, true), bareEnv());
    expect(response.status).toBe(422);
  });

  it("rejects a whitespace-only name", async () => {
    const response = await route(req("/v1/me/lists", "POST", { name: "   " }, true), bareEnv());
    expect(response.status).toBe(422);
  });

  it("rejects an unknown visibility", async () => {
    const response = await route(
      req("/v1/me/lists", "POST", { name: "ok", visibility: "secret" }, true),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });

  it.each(["public", "private", "unlisted"])("accepts visibility %s", async (visibility) => {
    const response = await route(
      req("/v1/me/lists", "POST", { name: "ok", visibility }, true),
      bareEnv(),
    );
    expect(response.status).toBe(503);
  });

  it("rejects a non-boolean isRanked", async () => {
    const response = await route(
      req("/v1/me/lists", "POST", { name: "ok", isRanked: "yes" }, true),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });
});

describe("item validation", () => {
  const path = `/v1/lists/${LIST_ID}/items`;

  it("requires a recognizable entity id", async () => {
    const response = await route(req(path, "POST", { entityId: "nope" }, true), bareEnv());
    expect(response.status).toBe(422);
  });

  it("rejects an entityType that contradicts the id prefix", async () => {
    const response = await route(
      req(path, "POST", { entityId: TITLE_ID, entityType: "person" }, true),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });

  it("accepts a matching entityType", async () => {
    const response = await route(
      req(path, "POST", { entityId: TITLE_ID, entityType: "title" }, true),
      bareEnv(),
    );
    expect(response.status).toBe(503);
  });

  it("rejects an over-long note", async () => {
    const response = await route(
      req(path, "POST", { entityId: TITLE_ID, note: "x".repeat(2_001) }, true),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });

  it("rejects a negative position on an update", async () => {
    const response = await route(
      req(`/v1/lists/${LIST_ID}/items/${ITEM_ID}`, "PATCH", { position: -1 }, true),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });

  it("rejects an update with nothing to change", async () => {
    const response = await route(
      req(`/v1/lists/${LIST_ID}/items/${ITEM_ID}`, "PATCH", {}, true),
      bareEnv(),
    );
    expect(response.status).toBe(422);
  });
});

describe("method guards", () => {
  it("405s a POST to a single list", async () => {
    const response = await route(req(`/v1/lists/${LIST_ID}`, "POST", {}, true), bareEnv());
    expect(response.status).toBe(405);
  });

  it("405s a PUT to the lists collection", async () => {
    const response = await route(req("/v1/me/lists", "PUT", {}, true), bareEnv());
    expect(response.status).toBe(405);
  });
});

describe("serialization", () => {
  it("renders public ids and never the raw uuids", () => {
    const out = toPublicList(list);
    expect(out.id).toBe(LIST_ID);
    expect(out.ownerId).toBe(USER_ID);
    expect(JSON.stringify(out)).not.toContain(LIST_UUID);
  });

  it("renders an item's entity id with the prefix its type implies", () => {
    const item: ListItem = {
      id: ITEM_UUID,
      listId: LIST_UUID,
      entityType: "title",
      entityId: TITLE_UUID,
      position: 3,
      note: "the one that started it",
      addedAt: NOW,
    };
    const out = toPublicItem(item);
    expect(out.id).toBe(ITEM_ID);
    expect(out.entityId).toBe(TITLE_ID);

    const person = toPublicItem({ ...item, entityType: "person" });
    expect(person.entityId).toBe(NAME_ID);
  });

  it("carries the counters the list header renders", () => {
    const out = toPublicList(list);
    expect(out.itemCount).toBe(12);
    expect(out.likeCount).toBe(3);
    expect(out.isRanked).toBe(true);
  });
});
