import type { SqlExecutor } from "../hyperdrive/executor.js";
import { createMediaRepository } from "./media-repository.js";
import { createPeopleRepository } from "./people-repository.js";
import { createTitlesRepository } from "./titles-repository.js";
import type { CatalogRepository } from "./types.js";

/**
 * The catalog context is wide enough that one file would be unreadable, so the
 * implementation is split by concern (titles + satellites, people + credits +
 * series, companies + keywords + media). This composes the three into the one
 * `CatalogRepository` every caller sees — callers never know about the split.
 */
export function createCatalogRepository(executor: SqlExecutor): CatalogRepository {
  return {
    ...createTitlesRepository(executor),
    ...createPeopleRepository(executor),
    ...createMediaRepository(executor),
  };
}
