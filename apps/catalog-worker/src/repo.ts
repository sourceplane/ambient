import { createSqlExecutor } from "@saas/db/hyperdrive";
import { createCatalogRepository, type CatalogRepository } from "@saas/db/catalog";
import { createTimings, type Timings } from "@saas/contracts/timing";
import type { Env } from "./env.js";
import { errorResponse, withTimings } from "./http.js";

export interface RepoContext {
  repo: CatalogRepository;
  timings: Timings;
}

/**
 * Every read handler needs the same four things: a bound database, a
 * per-request SQL executor, a timings envelope, and a guaranteed dispose.
 * Doing it once here keeps 30 handlers from each re-deriving the ceremony —
 * and keeps the dispose from being the thing someone forgets.
 */
export async function withRepo(
  env: Env,
  requestId: string,
  route: string,
  fn: (ctx: RepoContext) => Promise<Response>,
): Promise<Response> {
  if (!env.PLATFORM_DB) {
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }

  const timings = createTimings();
  const endTotal = timings.start("total");
  const executor = createSqlExecutor(env.PLATFORM_DB);
  try {
    const response = await fn({ repo: createCatalogRepository(executor), timings });
    endTotal();
    return withTimings(response, requestId, route, timings);
  } catch {
    endTotal();
    return withTimings(
      errorResponse("internal_error", "Service unavailable", 503, requestId),
      requestId,
      route,
      timings,
    );
  } finally {
    await executor.dispose();
  }
}
