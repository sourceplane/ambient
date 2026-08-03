// Lists contracts — the watchlist and user-curated lists.
//
// A watchlist is a list with `kind: "watchlist"`. Callers get one shape, one
// set of operations, and the toggle and the list editor share a code path.

export type ListKind = "watchlist" | "custom";
export type ListVisibility = "public" | "private" | "unlisted";
export type ListEntityType = "title" | "person" | "image";
export type ListItemSort = "position" | "added" | "alphabetical";

export interface PublicList {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  kind: ListKind;
  visibility: ListVisibility;
  isRanked: boolean;
  itemCount: number;
  likeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicListItem {
  id: string;
  entityType: ListEntityType;
  entityId: string;
  position: number;
  note: string | null;
  addedAt: string;
}

export interface CreateListRequest {
  name: string;
  description?: string | null;
  visibility?: ListVisibility;
  isRanked?: boolean;
}

export type UpdateListRequest = Partial<CreateListRequest>;

export interface AddListItemRequest {
  entityType?: ListEntityType;
  entityId: string;
  note?: string | null;
  position?: number;
}

export interface UpdateListItemRequest {
  position?: number;
  note?: string | null;
}

export interface GetListResponse {
  list: PublicList;
}

export interface ListListsResponse {
  lists: PublicList[];
}

export interface ListItemsResponse {
  items: PublicListItem[];
}

export interface WatchlistMembershipResponse {
  onWatchlist: boolean;
}
