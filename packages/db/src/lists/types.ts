export type { SqlExecutor, SqlExecutorResult, SqlRow } from "../hyperdrive/executor.js";
import type { Uuid } from "../ids/index.js";

export type ListsRepositoryError =
  | { kind: "not_found" }
  | { kind: "conflict"; entity: string }
  | { kind: "internal"; message: string };

export type ListsResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ListsRepositoryError };

export const LIST_KINDS = ["watchlist", "custom"] as const;
export type ListKind = (typeof LIST_KINDS)[number];

export const LIST_VISIBILITIES = ["public", "private", "unlisted"] as const;
export type ListVisibility = (typeof LIST_VISIBILITIES)[number];

export const LIST_ENTITY_TYPES = ["title", "person", "image"] as const;
export type ListEntityType = (typeof LIST_ENTITY_TYPES)[number];

export const LIST_ITEM_SORTS = ["position", "added", "alphabetical"] as const;
export type ListItemSort = (typeof LIST_ITEM_SORTS)[number];

export interface List {
  id: string;
  ownerUserId: string;
  name: string;
  description: string | null;
  kind: ListKind;
  visibility: ListVisibility;
  isRanked: boolean;
  itemCount: number;
  likeCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListItem {
  id: string;
  listId: string;
  entityType: ListEntityType;
  entityId: string;
  position: number;
  note: string | null;
  addedAt: Date;
}

export interface CreateListInput {
  id: Uuid;
  ownerUserId: Uuid;
  name: string;
  description?: string | null;
  kind?: ListKind;
  visibility?: ListVisibility;
  isRanked?: boolean;
  now: Date;
}

export interface UpdateListInput {
  name?: string;
  description?: string | null;
  visibility?: ListVisibility;
  isRanked?: boolean;
}

export interface AddItemInput {
  id: Uuid;
  listId: Uuid;
  entityType: ListEntityType;
  entityId: Uuid;
  note?: string | null;
  position?: number | null;
  now: Date;
}

export interface ListsRepository {
  createList(input: CreateListInput): Promise<ListsResult<List>>;
  /** Get-or-create the caller's single watchlist. */
  ensureWatchlist(userId: Uuid, id: Uuid, now: Date): Promise<ListsResult<List>>;
  getList(listId: Uuid): Promise<ListsResult<List>>;
  listUserLists(
    userId: Uuid,
    params: { limit: number; offset: number; visibleOnly: boolean },
  ): Promise<ListsResult<List[]>>;
  updateList(
    listId: Uuid,
    ownerUserId: Uuid,
    input: UpdateListInput,
    now: Date,
  ): Promise<ListsResult<List>>;
  deleteList(listId: Uuid, ownerUserId: Uuid): Promise<ListsResult<void>>;

  addItem(input: AddItemInput): Promise<ListsResult<ListItem>>;
  removeItem(
    listId: Uuid,
    ownerUserId: Uuid,
    entityType: ListEntityType,
    entityId: Uuid,
    now: Date,
  ): Promise<ListsResult<void>>;
  /** Remove by item id — the list editor's delete, which knows the row id. */
  removeItemById(itemId: Uuid, ownerUserId: Uuid, now: Date): Promise<ListsResult<void>>;
  updateItem(
    itemId: Uuid,
    ownerUserId: Uuid,
    changes: { position?: number; note?: string | null },
    now: Date,
  ): Promise<ListsResult<ListItem>>;
  listItems(
    listId: Uuid,
    params: { limit: number; offset: number; sort: ListItemSort },
  ): Promise<ListsResult<ListItem[]>>;
  /** Membership probe for the watchlist toggle — one query, no page load. */
  containsEntity(
    listId: Uuid,
    entityType: ListEntityType,
    entityId: Uuid,
  ): Promise<ListsResult<boolean>>;

  likeList(listId: Uuid, userId: Uuid): Promise<ListsResult<List>>;
  unlikeList(listId: Uuid, userId: Uuid): Promise<ListsResult<List>>;
}
