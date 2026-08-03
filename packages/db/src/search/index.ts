export type {
  SearchRepository,
  SearchRepositoryError,
  SearchResult,
  SearchEntityType,
  SearchDocument,
  SearchHit,
  DocumentFilters,
  TitleSearchQuery,
  NameSearchQuery,
  TitleSortKey,
  NameSortKey,
} from "./types.js";

export { SEARCH_ENTITY_TYPES } from "./types.js";
export { createSearchRepository, toPrefixTsQuery } from "./repository.js";
