// Search contracts — the typeahead, full-text and advanced-search surfaces.
//
// A search hit is deliberately thin: enough to render a result row and link to
// the real record, and nothing more. Callers that need the full title or name
// fetch it from the catalog by public id.

export type SearchEntityType = "title" | "person" | "company" | "keyword" | "list";

export interface PublicSearchHit {
  type: SearchEntityType;
  id: string;
  display: string;
  secondary: string;
  imageUrl: string | null;
  /** Facets carried through for result-row chrome (year, genres, rating…). */
  facets: Record<string, unknown>;
}

export interface SuggestResponse {
  suggestions: PublicSearchHit[];
}

export interface SearchResponse {
  results: PublicSearchHit[];
}

export type TitleSearchSort =
  | "relevance"
  | "popularity"
  | "rating"
  | "votes"
  | "release_date"
  | "alphabetical"
  | "runtime";

export type NameSearchSort = "relevance" | "popularity" | "alphabetical" | "birth_date";

/**
 * Advanced title search. Every field is optional; an empty query is a browse
 * of the whole catalog ordered by popularity.
 */
export interface TitleSearchRequest {
  q?: string;
  kind?: string[];
  genre?: string[];
  yearFrom?: number;
  yearTo?: number;
  ratingFrom?: number;
  ratingTo?: number;
  votesMin?: number;
  runtimeMin?: number;
  runtimeMax?: number;
  certificate?: string[];
  country?: string[];
  language?: string[];
  keyword?: string[];
  company?: string[];
  adult?: boolean;
  sort?: TitleSearchSort;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface NameSearchRequest {
  q?: string;
  profession?: string[];
  bornFrom?: number;
  bornTo?: number;
  diedFrom?: number;
  diedTo?: number;
  birthPlace?: string;
  sort?: NameSearchSort;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/** Internal publish payload — service-binding only, never edge-routed. */
export interface SearchDocumentPayload {
  type: SearchEntityType;
  entityId: string;
  publicId: string;
  display: string;
  secondary?: string;
  imageUrl?: string | null;
  body?: string;
  popularity?: number;
  facets?: Record<string, unknown>;
}

export interface PublishDocumentsRequest {
  documents: SearchDocumentPayload[];
}

export interface PublishDocumentsResponse {
  published: number;
}
