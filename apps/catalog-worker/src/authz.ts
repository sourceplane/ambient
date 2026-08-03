import type { Env } from "./env.js";
import type { ActorContext } from "./router.js";
import { fetchAuthorizationContext } from "./membership-client.js";
import { authorizeViaPolicy } from "./policy-client.js";
import { errorResponse } from "./http.js";

/**
 * Catalog curation is editorial, not per-tenant: the data is one shared public
 * catalog. But "who may edit it" still has to come from somewhere, and the
 * platform already has exactly one answer — org membership evaluated by the
 * policy worker. So curation routes are scoped to the *editorial* organization
 * the actor is acting on behalf of, and the catalog actions are granted to the
 * roles that org hands out. Reads bypass all of this; they are public.
 *
 * Returns null when allowed, or the response to send when not. Denials are
 * 404, matching the rest of the fleet: an unauthorized caller learns nothing
 * about what exists.
 */
export async function requireCatalogPermission(
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: string,
  action: string,
): Promise<Response | null> {
  if (!env.MEMBERSHIP_WORKER || !env.POLICY_WORKER) {
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }

  const context = await fetchAuthorizationContext(
    env.MEMBERSHIP_WORKER,
    actor.subjectId,
    actor.subjectType,
    orgId,
    requestId,
  );
  if (!context.ok) {
    return errorResponse("not_found", "Not found", 404, requestId);
  }

  const decision = await authorizeViaPolicy(
    env.POLICY_WORKER,
    actor.subjectId,
    actor.subjectType,
    action,
    { kind: "organization", orgId },
    context.memberships,
    requestId,
  );
  if (!decision.allow) {
    return errorResponse("not_found", "Not found", 404, requestId);
  }

  return null;
}
