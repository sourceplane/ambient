export type { SqlExecutor, SqlExecutorResult, SqlRow } from "../hyperdrive/executor.js";

export type SearchRepositoryError =
  | { kind: "not_found" }
  | { kind: "internal"; message: string };

export type SearchResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SearchRepositoryError };

export const SEARCH_ENTITY_TYPES = ["title", "person", "company", "keyword", "list"] as const;
export type SearchEntityType = (typeof SEARCH_ENTITY_TYPES)[number];

/** Facets carried on the document so advanced search needs no joins. */
export interface DocumentFilters {
  kind?: string;
  year?: number;
  genres?: string[];
  rating?: number;
  votes?: number;
  runtime?: number;
  certificates?: string[];
  countries?: string[];
  languages?: string[];
  keywords?: string[];
  companies?: string[];
  professions?: string[];
  bornYear?: number;
  diedYear?: number;
  birthPlace?: string;
  adult?: boolean;
}

export interface SearchDocument {
  entityType: SearchEntityType;
  entityId: string;
  publicId: string;
  display: string;
  secondary: string;
  imageUrl: string | null;
  body: string;
  popularity: number;
  filters: DocumentFilters;
}

export interface SearchHit extends SearchDocument {
  /** Combined lexical + trigram + popularity score. Higher is better. */
  score: number;
}

export type TitleSortKey =
  | "relevance"
  | "popularity"
  | "rating"
  | "votes"
  | "release_date"
  | "alphabetical"
  | "runtime";

export interface TitleSearchQuery {
  text?: string | null;
  kinds?: string[];
  genres?: string[];
  yearFrom?: number | null;
  yearTo?: number | null;
  ratingFrom?: number | null;
  ratingTo?: number | null;
  votesMin?: number | null;
  runtimeMin?: number | null;
  runtimeMax?: number | null;
  certificates?: string[];
  countries?: string[];
  languages?: string[];
  keywords?: string[];
  companies?: string[];
  includeAdult?: boolean;
  sort?: TitleSortKey;
  order?: "asc" | "desc";
  limit: number;
  offset: number;
}

export type NameSortKey = "relevance" | "popularity" | "alphabetical" | "birth_date";

export interface NameSearchQuery {
  text?: string | null;
  professions?: string[];
  bornFrom?: number | null;
  bornTo?: number | null;
  diedFrom?: number | null;
  diedTo?: number | null;
  birthPlace?: string | null;
  sort?: NameSortKey;
  order?: "asc" | "desc";
  limit: number;
  offset: number;
}

export interface SearchRepository {
  /** Idempotent upsert — republishing an unchanged document is a no-op write. */
  upsertDocuments(documents: SearchDocument[]): Promise<SearchResult<number>>;
  deleteDocument(entityType: SearchEntityType, entityId: string): Promise<SearchResult<void>>;
  /** Typeahead: trigram-led, so a prefix matches before a word is complete. */
  suggest(query: string, limit: number, types?: SearchEntityType[]): Promise<SearchResult<SearchHit[]>>;
  /** Full-text search across one or all entity types. */
  search(
    query: string,
    types: SearchEntityType[] | null,
    limit: number,
    offset: number,
  ): Promise<SearchResult<SearchHit[]>>;
  searchTitles(query: TitleSearchQuery): Promise<SearchResult<SearchHit[]>>;
  searchNames(query: NameSearchQuery): Promise<SearchResult<SearchHit[]>>;
  countDocuments(entityType?: SearchEntityType): Promise<SearchResult<number>>;
}
