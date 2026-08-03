export interface Env {
  PLATFORM_DB?: Hyperdrive;
  /** Authorization context for curation writes. Reads never touch it. */
  MEMBERSHIP_WORKER?: Fetcher;
  POLICY_WORKER?: Fetcher;
  /** Search index publish seam. Absent is tolerated — publishing is best-effort. */
  SEARCH_WORKER?: Fetcher;
  ENVIRONMENT: string;
}
