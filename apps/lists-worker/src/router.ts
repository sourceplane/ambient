import { createSqlExecutor } from "@saas/db/hyperdrive";
import {
  createListsRepository,
  LIST_ENTITY_TYPES,
  LIST_ITEM_SORTS,
  LIST_VISIBILITIES,
} from "@saas/db/lists";
import type {
  List,
  ListEntityType,
  ListItem,
  ListItemSort,
  ListVisibility,
  ListsRepository,
} from "@saas/db/lists";
import type { Uuid } from "@saas/db/ids";
import { uuidToHex } from "@saas/db/ids";
import { createTimings } from "@saas/contracts/timing";
import type { PublicList, PublicListItem } from "@saas/contracts/lists";
import type { Env } from "./env.js";
import {
  errorResponse,
  methodNotAllowed,
  notFound,
  successResponse,
  validationError,
  withTimings,
} from "./http.js";
import { generateRequestId, newUuid } from "./ids.js";

const REQUEST_ID_RE = /^[\w-]{1,128}$/;
const LIST_PREFIX = "ls";
const ITEM_PREFIX = "li";
const MAX_NAME = 200;
const MAX_DESCRIPTION = 4_000;
const MAX_NOTE = 2_000;
const MAX_PAGE = 250;

const ME_WATCHLIST = "/v1/me/watchlist";
const ME_WATCHLIST_TITLE_RE = /^\/v1\/me\/watchlist\/([^/]+)$/;
const ME_LISTS = "/v1/me/lists";
const LIST_RE = /^\/v1\/lists\/([^/]+)$/;
const LIST_ITEMS_RE = /^\/v1\/lists\/([^/]+)\/items$/;
const LIST_ITEM_RE = /^\/v1\/lists\/([^/]+)\/items\/([^/]+)$/;
const LIST_LIKE_RE = /^\/v1\/lists\/([^/]+)\/like$/;
const USER_LISTS_RE = /^\/v1\/users\/([^/]+)\/lists$/;

export interface ActorContext {
  subjectId: string;
}

function resolveRequestId(request: Request): string {
  const header = request.headers.get("x-request-id");
  if (header && REQUEST_ID_RE.test(header)) return header;
  return generateRequestId();
}

function hexToUuidOrNull(publicId: string): Uuid | null {
  const sep = publicId.indexOf("_");
  const hex = sep === -1 ? publicId : publicId.slice(sep + 1);
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as Uuid;
}

function actorUuid(request: Request): Uuid | null {
  const subjectId = request.headers.get("x-actor-subject-id");
  if (!subjectId || !request.headers.get("x-actor-subject-type")) return null;
  return hexToUuidOrNull(subjectId);
}

export function listPublicId(uuid: string): string {
  return `${LIST_PREFIX}_${uuidToHex(uuid)}`;
}

export function parseListPublicId(publicId: string): Uuid | null {
  if (!publicId.startsWith(`${LIST_PREFIX}_`)) return null;
  return hexToUuidOrNull(publicId);
}

function itemPublicId(uuid: string): string {
  return `${ITEM_PREFIX}_${uuidToHex(uuid)}`;
}

function parseItemPublicId(publicId: string): Uuid | null {
  if (!publicId.startsWith(`${ITEM_PREFIX}_`)) return null;
  return hexToUuidOrNull(publicId);
}

/** Entity ids arrive prefixed (`tt_`, `nm_`, `rm_`); the prefix picks the type. */
const PREFIX_TO_ENTITY: Record<string, ListEntityType> = {
  tt: "title",
  nm: "person",
  rm: "image",
};

function entityFromPublicId(
  publicId: string,
): { entityType: ListEntityType; entityId: Uuid } | null {
  const sep = publicId.indexOf("_");
  if (sep < 1) return null;
  const entityType = PREFIX_TO_ENTITY[publicId.slice(0, sep)];
  const entityId = hexToUuidOrNull(publicId);
  if (!entityType || !entityId) return null;
  return { entityType, entityId };
}

function entityPublicId(entityType: ListEntityType, uuid: string): string {
  const prefix = entityType === "title" ? "tt" : entityType === "person" ? "nm" : "rm";
  return `${prefix}_${uuidToHex(uuid)}`;
}

export function toPublicList(list: List): PublicList {
  return {
    id: listPublicId(list.id),
    ownerId: `usr_${uuidToHex(list.ownerUserId)}`,
    name: list.name,
    description: list.description,
    kind: list.kind,
    visibility: list.visibility,
    isRanked: list.isRanked,
    itemCount: list.itemCount,
    likeCount: list.likeCount,
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
  };
}

export function toPublicItem(item: ListItem): PublicListItem {
  return {
    id: itemPublicId(item.id),
    entityType: item.entityType,
    entityId: entityPublicId(item.entityType, item.entityId),
    position: item.position,
    note: item.note,
    addedAt: item.addedAt.toISOString(),
  };
}

function boundedPage(url: URL): { limit: number; offset: number } | { field: string; error: string } {
  const limitRaw = url.searchParams.get("limit");
  let limit = 50;
  if (limitRaw !== null) {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PAGE) {
      return { field: "limit", error: `Must be an integer between 1 and ${MAX_PAGE}` };
    }
    limit = parsed;
  }
  const offsetRaw = url.searchParams.get("offset");
  let offset = 0;
  if (offsetRaw !== null) {
    const parsed = Number(offsetRaw);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100_000) {
      return { field: "offset", error: "Must be an integer between 0 and 100000" };
    }
    offset = parsed;
  }
  return { limit, offset };
}

export async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const requestId = resolveRequestId(request);

  try {
    if (url.pathname === "/health") {
      if (request.method !== "GET") return notFound(requestId, url.pathname);
      return successResponse(
        {
          status: "ok",
          service: "lists-worker",
          environment: env.ENVIRONMENT ?? "local",
          timestamp: new Date().toISOString(),
          checks: { database: { configured: !!env.PLATFORM_DB } },
        },
        requestId,
      );
    }

    const watchlistEntity = url.pathname.match(ME_WATCHLIST_TITLE_RE);
    if (watchlistEntity) {
      const entity = entityFromPublicId(watchlistEntity[1]!);
      if (!entity) return notFound(requestId, url.pathname);
      if (request.method === "GET") return watchlistContains(request, env, requestId, entity);
      if (request.method === "PUT") return watchlistAdd(request, env, requestId, entity);
      if (request.method === "DELETE") return watchlistRemove(request, env, requestId, entity);
      return methodNotAllowed(requestId);
    }

    if (url.pathname === ME_WATCHLIST) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      return getWatchlist(url, request, env, requestId);
    }

    if (url.pathname === ME_LISTS) {
      if (request.method === "GET") return listMyLists(url, request, env, requestId);
      if (request.method === "POST") return createList(request, env, requestId);
      return methodNotAllowed(requestId);
    }

    const like = url.pathname.match(LIST_LIKE_RE);
    if (like) {
      const listId = parseListPublicId(like[1]!);
      if (!listId) return notFound(requestId, url.pathname);
      if (request.method === "POST") return setLike(request, env, requestId, listId, true);
      if (request.method === "DELETE") return setLike(request, env, requestId, listId, false);
      return methodNotAllowed(requestId);
    }

    const item = url.pathname.match(LIST_ITEM_RE);
    if (item) {
      const listId = parseListPublicId(item[1]!);
      const itemId = parseItemPublicId(item[2]!);
      if (!listId || !itemId) return notFound(requestId, url.pathname);
      if (request.method === "PATCH") return updateItem(request, env, requestId, itemId);
      if (request.method === "DELETE") return deleteItemById(request, env, requestId, listId, itemId);
      return methodNotAllowed(requestId);
    }

    const items = url.pathname.match(LIST_ITEMS_RE);
    if (items) {
      const listId = parseListPublicId(items[1]!);
      if (!listId) return notFound(requestId, url.pathname);
      if (request.method === "GET") return listItems(url, request, env, requestId, listId);
      if (request.method === "POST") return addItem(request, env, requestId, listId);
      return methodNotAllowed(requestId);
    }

    const list = url.pathname.match(LIST_RE);
    if (list) {
      const listId = parseListPublicId(list[1]!);
      if (!listId) return notFound(requestId, url.pathname);
      if (request.method === "GET") return getList(request, env, requestId, listId);
      if (request.method === "PATCH") return updateList(request, env, requestId, listId);
      if (request.method === "DELETE") return deleteList(request, env, requestId, listId);
      return methodNotAllowed(requestId);
    }

    const userLists = url.pathname.match(USER_LISTS_RE);
    if (userLists) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      const ownerId = hexToUuidOrNull(userLists[1]!);
      if (!ownerId) return notFound(requestId, url.pathname);
      return listUserLists(url, request, env, requestId, ownerId);
    }

    return notFound(requestId, url.pathname);
  } catch {
    return errorResponse("internal_error", "An unexpected error occurred", 500, requestId);
  }
}

async function withRepo(
  env: Env,
  requestId: string,
  routeName: string,
  fn: (repo: ListsRepository, timings: ReturnType<typeof createTimings>) => Promise<Response>,
): Promise<Response> {
  if (!env.PLATFORM_DB) {
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  const timings = createTimings();
  const endTotal = timings.start("total");
  const executor = createSqlExecutor(env.PLATFORM_DB);
  try {
    const response = await fn(createListsRepository(executor), timings);
    endTotal();
    return withTimings(response, requestId, routeName, timings);
  } catch {
    endTotal();
    return withTimings(
      errorResponse("internal_error", "Service unavailable", 503, requestId),
      requestId,
      routeName,
      timings,
    );
  } finally {
    await executor.dispose();
  }
}

function unauthenticated(requestId: string): Response {
  return errorResponse("unauthenticated", "Authentication required", 401, requestId);
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ── Watchlist ──────────────────────────────────────────────────────────

function getWatchlist(url: URL, request: Request, env: Env, requestId: string): Promise<Response> {
  const userId = actorUuid(request);
  if (!userId) return Promise.resolve(unauthenticated(requestId));
  const page = boundedPage(url);
  if ("error" in page) {
    return Promise.resolve(validationError(requestId, { [page.field]: [page.error] }));
  }
  const sortRaw = url.searchParams.get("sort") ?? "added";
  if (!(LIST_ITEM_SORTS as readonly string[]).includes(sortRaw)) {
    return Promise.resolve(
      validationError(requestId, { sort: [`Must be one of: ${LIST_ITEM_SORTS.join(", ")}`] }),
    );
  }

  return withRepo(env, requestId, "lists.watchlist.get", async (repo, timings) => {
    const watchlist = await timings.measure("db", () =>
      repo.ensureWatchlist(userId, newUuid(), new Date()),
    );
    if (!watchlist.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    const items = await repo.listItems(watchlist.value.id as Uuid, {
      limit: page.limit,
      offset: page.offset,
      sort: sortRaw as ListItemSort,
    });
    return successResponse(
      {
        list: toPublicList(watchlist.value),
        items: items.ok ? items.value.map(toPublicItem) : [],
      },
      requestId,
    );
  });
}

function watchlistContains(
  request: Request,
  env: Env,
  requestId: string,
  entity: { entityType: ListEntityType; entityId: Uuid },
): Promise<Response> {
  const userId = actorUuid(request);
  if (!userId) return Promise.resolve(unauthenticated(requestId));
  return withRepo(env, requestId, "lists.watchlist.contains", async (repo, timings) => {
    const watchlist = await timings.measure("db", () =>
      repo.ensureWatchlist(userId, newUuid(), new Date()),
    );
    if (!watchlist.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    const result = await repo.containsEntity(
      watchlist.value.id as Uuid,
      entity.entityType,
      entity.entityId,
    );
    return successResponse({ onWatchlist: result.ok ? result.value : false }, requestId);
  });
}

function watchlistAdd(
  request: Request,
  env: Env,
  requestId: string,
  entity: { entityType: ListEntityType; entityId: Uuid },
): Promise<Response> {
  const userId = actorUuid(request);
  if (!userId) return Promise.resolve(unauthenticated(requestId));
  return withRepo(env, requestId, "lists.watchlist.add", async (repo, timings) => {
    const now = new Date();
    const watchlist = await timings.measure("db", () =>
      repo.ensureWatchlist(userId, newUuid(), now),
    );
    if (!watchlist.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    // PUT is idempotent: adding a title already on the watchlist succeeds.
    const added = await repo.addItem({
      id: newUuid(),
      listId: watchlist.value.id as Uuid,
      entityType: entity.entityType,
      entityId: entity.entityId,
      now,
    });
    if (!added.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ onWatchlist: true, item: toPublicItem(added.value) }, requestId);
  });
}

function watchlistRemove(
  request: Request,
  env: Env,
  requestId: string,
  entity: { entityType: ListEntityType; entityId: Uuid },
): Promise<Response> {
  const userId = actorUuid(request);
  if (!userId) return Promise.resolve(unauthenticated(requestId));
  return withRepo(env, requestId, "lists.watchlist.remove", async (repo, timings) => {
    const now = new Date();
    const watchlist = await timings.measure("db", () =>
      repo.ensureWatchlist(userId, newUuid(), now),
    );
    if (!watchlist.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    await repo.removeItem(
      watchlist.value.id as Uuid,
      userId,
      entity.entityType,
      entity.entityId,
      now,
    );
    // Removing something that was never there still leaves the caller in the
    // state they asked for.
    return successResponse({ onWatchlist: false }, requestId);
  });
}

// ── Lists ──────────────────────────────────────────────────────────────

function listMyLists(url: URL, request: Request, env: Env, requestId: string): Promise<Response> {
  const userId = actorUuid(request);
  if (!userId) return Promise.resolve(unauthenticated(requestId));
  const page = boundedPage(url);
  if ("error" in page) {
    return Promise.resolve(validationError(requestId, { [page.field]: [page.error] }));
  }
  return withRepo(env, requestId, "lists.me.list", async (repo, timings) => {
    const result = await timings.measure("db", () =>
      repo.listUserLists(userId, { ...page, visibleOnly: false }),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ lists: result.value.map(toPublicList) }, requestId);
  });
}

function listUserLists(
  url: URL,
  request: Request,
  env: Env,
  requestId: string,
  ownerId: Uuid,
): Promise<Response> {
  const page = boundedPage(url);
  if ("error" in page) {
    return Promise.resolve(validationError(requestId, { [page.field]: [page.error] }));
  }
  const viewer = actorUuid(request);
  // Only the owner sees private lists; everyone else sees public + unlisted.
  const visibleOnly = viewer !== ownerId;
  return withRepo(env, requestId, "lists.user.list", async (repo, timings) => {
    const result = await timings.measure("db", () =>
      repo.listUserLists(ownerId, { ...page, visibleOnly }),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ lists: result.value.map(toPublicList) }, requestId);
  });
}

async function createList(request: Request, env: Env, requestId: string): Promise<Response> {
  const userId = actorUuid(request);
  if (!userId) return unauthenticated(requestId);
  const body = await readJson(request);
  if (!body) return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);

  const errors: Record<string, string[]> = {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length === 0) errors.name = ["Required"];
  else if (name.length > MAX_NAME) errors.name = [`Must be at most ${MAX_NAME} characters`];

  let description: string | null = null;
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== "string" || body.description.length > MAX_DESCRIPTION) {
      errors.description = ["Invalid description"];
    } else description = body.description.trim() || null;
  }
  let visibility: ListVisibility = "private";
  if (body.visibility !== undefined) {
    if (
      typeof body.visibility !== "string" ||
      !(LIST_VISIBILITIES as readonly string[]).includes(body.visibility)
    ) {
      errors.visibility = [`Must be one of: ${LIST_VISIBILITIES.join(", ")}`];
    } else visibility = body.visibility as ListVisibility;
  }
  const isRanked = body.isRanked === true;
  if (body.isRanked !== undefined && typeof body.isRanked !== "boolean") {
    errors.isRanked = ["Must be a boolean"];
  }
  if (Object.keys(errors).length > 0) return validationError(requestId, errors);

  return withRepo(env, requestId, "lists.create", async (repo, timings) => {
    const result = await timings.measure("db", () =>
      repo.createList({
        id: newUuid(),
        ownerUserId: userId,
        name,
        description,
        visibility,
        isRanked,
        now: new Date(),
      }),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ list: toPublicList(result.value) }, requestId, 201);
  });
}

function getList(request: Request, env: Env, requestId: string, listId: Uuid): Promise<Response> {
  const viewer = actorUuid(request);
  return withRepo(env, requestId, "lists.get", async (repo, timings) => {
    const result = await timings.measure("db", () => repo.getList(listId));
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    // A private list is invisible to everyone but its owner — 404, not 403.
    if (result.value.visibility === "private" && viewer !== result.value.ownerUserId) {
      return errorResponse("not_found", "Not found", 404, requestId);
    }
    return successResponse({ list: toPublicList(result.value) }, requestId);
  });
}

async function updateList(
  request: Request,
  env: Env,
  requestId: string,
  listId: Uuid,
): Promise<Response> {
  const userId = actorUuid(request);
  if (!userId) return unauthenticated(requestId);
  const body = await readJson(request);
  if (!body) return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);

  const errors: Record<string, string[]> = {};
  const patch: Record<string, unknown> = {};
  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length === 0 || name.length > MAX_NAME) errors.name = ["Invalid name"];
    else patch.name = name;
  }
  if ("description" in body) {
    if (body.description === null) patch.description = null;
    else if (typeof body.description !== "string" || body.description.length > MAX_DESCRIPTION) {
      errors.description = ["Invalid description"];
    } else patch.description = body.description.trim() || null;
  }
  if ("visibility" in body) {
    if (
      typeof body.visibility !== "string" ||
      !(LIST_VISIBILITIES as readonly string[]).includes(body.visibility)
    ) {
      errors.visibility = [`Must be one of: ${LIST_VISIBILITIES.join(", ")}`];
    } else patch.visibility = body.visibility;
  }
  if ("isRanked" in body) {
    if (typeof body.isRanked !== "boolean") errors.isRanked = ["Must be a boolean"];
    else patch.isRanked = body.isRanked;
  }
  if (Object.keys(errors).length > 0) return validationError(requestId, errors);

  return withRepo(env, requestId, "lists.update", async (repo, timings) => {
    const result = await timings.measure("db", () =>
      repo.updateList(listId, userId, patch, new Date()),
    );
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    return successResponse({ list: toPublicList(result.value) }, requestId);
  });
}

function deleteList(
  request: Request,
  env: Env,
  requestId: string,
  listId: Uuid,
): Promise<Response> {
  const userId = actorUuid(request);
  if (!userId) return Promise.resolve(unauthenticated(requestId));
  return withRepo(env, requestId, "lists.delete", async (repo, timings) => {
    const result = await timings.measure("db", () => repo.deleteList(listId, userId));
    // The watchlist is structural and cannot be deleted; the repository
    // refuses it, and that surfaces here as not-found.
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    return new Response(null, { status: 204 });
  });
}

function listItems(
  url: URL,
  request: Request,
  env: Env,
  requestId: string,
  listId: Uuid,
): Promise<Response> {
  const page = boundedPage(url);
  if ("error" in page) {
    return Promise.resolve(validationError(requestId, { [page.field]: [page.error] }));
  }
  const sortRaw = url.searchParams.get("sort") ?? "position";
  if (!(LIST_ITEM_SORTS as readonly string[]).includes(sortRaw)) {
    return Promise.resolve(
      validationError(requestId, { sort: [`Must be one of: ${LIST_ITEM_SORTS.join(", ")}`] }),
    );
  }
  const viewer = actorUuid(request);

  return withRepo(env, requestId, "lists.items.list", async (repo, timings) => {
    const list = await timings.measure("db", () => repo.getList(listId));
    if (!list.ok) return errorResponse("not_found", "Not found", 404, requestId);
    if (list.value.visibility === "private" && viewer !== list.value.ownerUserId) {
      return errorResponse("not_found", "Not found", 404, requestId);
    }
    const result = await repo.listItems(listId, { ...page, sort: sortRaw as ListItemSort });
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ items: result.value.map(toPublicItem) }, requestId);
  });
}

async function addItem(
  request: Request,
  env: Env,
  requestId: string,
  listId: Uuid,
): Promise<Response> {
  const userId = actorUuid(request);
  if (!userId) return unauthenticated(requestId);
  const body = await readJson(request);
  if (!body) return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);

  const entityIdRaw = typeof body.entityId === "string" ? body.entityId : "";
  const entity = entityFromPublicId(entityIdRaw);
  if (!entity) {
    return validationError(requestId, {
      entityId: [`Must be a public id with one of the prefixes: ${Object.keys(PREFIX_TO_ENTITY).join(", ")}`],
    });
  }
  if (
    body.entityType !== undefined &&
    (typeof body.entityType !== "string" ||
      !(LIST_ENTITY_TYPES as readonly string[]).includes(body.entityType) ||
      body.entityType !== entity.entityType)
  ) {
    return validationError(requestId, {
      entityType: ["Does not match the prefix of entityId"],
    });
  }
  let note: string | null = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string" || body.note.length > MAX_NOTE) {
      return validationError(requestId, { note: ["Invalid note"] });
    }
    note = body.note.trim() || null;
  }

  return withRepo(env, requestId, "lists.items.add", async (repo, timings) => {
    const list = await timings.measure("db", () => repo.getList(listId));
    if (!list.ok || list.value.ownerUserId !== userId) {
      return errorResponse("not_found", "Not found", 404, requestId);
    }
    const result = await repo.addItem({
      id: newUuid(),
      listId,
      entityType: entity.entityType,
      entityId: entity.entityId,
      note,
      now: new Date(),
    });
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    return successResponse({ item: toPublicItem(result.value) }, requestId, 201);
  });
}

async function updateItem(
  request: Request,
  env: Env,
  requestId: string,
  itemId: Uuid,
): Promise<Response> {
  const userId = actorUuid(request);
  if (!userId) return unauthenticated(requestId);
  const body = await readJson(request);
  if (!body) return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);

  const changes: { position?: number; note?: string | null } = {};
  if ("position" in body) {
    if (typeof body.position !== "number" || !Number.isInteger(body.position) || body.position < 0) {
      return validationError(requestId, { position: ["Must be a non-negative integer"] });
    }
    changes.position = body.position;
  }
  if ("note" in body) {
    if (body.note === null) changes.note = null;
    else if (typeof body.note !== "string" || body.note.length > MAX_NOTE) {
      return validationError(requestId, { note: ["Invalid note"] });
    } else changes.note = body.note.trim() || null;
  }
  if (Object.keys(changes).length === 0) {
    return validationError(requestId, { body: ["Nothing to update"] });
  }

  return withRepo(env, requestId, "lists.items.update", async (repo, timings) => {
    const result = await timings.measure("db", () =>
      repo.updateItem(itemId, userId, changes, new Date()),
    );
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    return successResponse({ item: toPublicItem(result.value) }, requestId);
  });
}

function deleteItemById(
  request: Request,
  env: Env,
  requestId: string,
  listId: Uuid,
  itemId: Uuid,
): Promise<Response> {
  const userId = actorUuid(request);
  if (!userId) return Promise.resolve(unauthenticated(requestId));
  return withRepo(env, requestId, "lists.items.delete", async (repo, timings) => {
    // Deleting by row id, not by scanning the list: a page-bounded scan would
    // silently fail to find items past the first page of a long list.
    const result = await timings.measure("db", () =>
      repo.removeItemById(itemId, userId, new Date()),
    );
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    return new Response(null, { status: 204 });
  });
}

function setLike(
  request: Request,
  env: Env,
  requestId: string,
  listId: Uuid,
  liked: boolean,
): Promise<Response> {
  const userId = actorUuid(request);
  if (!userId) return Promise.resolve(unauthenticated(requestId));
  return withRepo(env, requestId, "lists.like", async (repo, timings) => {
    const list = await timings.measure("db", () => repo.getList(listId));
    if (!list.ok) return errorResponse("not_found", "Not found", 404, requestId);
    // You cannot like a list you cannot see.
    if (list.value.visibility === "private" && list.value.ownerUserId !== userId) {
      return errorResponse("not_found", "Not found", 404, requestId);
    }
    const result = liked
      ? await repo.likeList(listId, userId)
      : await repo.unlikeList(listId, userId);
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    return successResponse({ list: toPublicList(result.value) }, requestId);
  });
}
