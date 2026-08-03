import { authorize } from "@saas/policy-engine";
import { ORGANIZATION_ACTIONS } from "@saas/contracts/policy";
import type {
  AuthorizationRequest,
  MembershipFact,
  PolicySubject,
} from "@saas/contracts/policy";
import type { TenancyRole } from "@saas/contracts/tenancy";

const ORG = "org_editorial";
const subject: PolicySubject = { type: "user", id: "usr_editor" };

const WRITE_ACTIONS = [
  "catalog.title.write",
  "catalog.person.write",
  "catalog.credit.write",
  "catalog.media.write",
  "catalog.episode.write",
];

const ARCHIVE_ACTIONS = ["catalog.title.archive", "catalog.person.archive"];

const ALL_CATALOG_ACTIONS = [...WRITE_ACTIONS, ...ARCHIVE_ACTIONS];

function fact(role: string): MembershipFact {
  return {
    kind: "role_assignment",
    role: role as TenancyRole,
    scope: { kind: "organization", orgId: ORG },
  };
}

function req(action: string, roles: string[]): AuthorizationRequest {
  return {
    subject,
    action,
    resource: { kind: "organization", orgId: ORG },
    context: { memberships: roles.map(fact) },
  };
}

describe("catalog curation policy", () => {
  it("publishes every catalog action in the contract vocabulary", () => {
    for (const action of ALL_CATALOG_ACTIONS) {
      expect(ORGANIZATION_ACTIONS).toContain(action);
    }
  });

  it.each(ALL_CATALOG_ACTIONS)("allows an owner to %s", (action) => {
    expect(authorize(req(action, ["owner"])).allow).toBe(true);
  });

  it.each(ALL_CATALOG_ACTIONS)("allows an admin to %s", (action) => {
    expect(authorize(req(action, ["admin"])).allow).toBe(true);
  });

  it.each(WRITE_ACTIONS)("allows a builder to %s", (action) => {
    expect(authorize(req(action, ["builder"])).allow).toBe(true);
  });

  it.each(ARCHIVE_ACTIONS)("denies a builder %s — archiving is not editing", (action) => {
    expect(authorize(req(action, ["builder"])).allow).toBe(false);
  });

  it.each(ALL_CATALOG_ACTIONS)("denies a viewer %s", (action) => {
    expect(authorize(req(action, ["viewer"])).allow).toBe(false);
  });

  it.each(ALL_CATALOG_ACTIONS)("denies a billing_admin %s", (action) => {
    expect(authorize(req(action, ["billing_admin"])).allow).toBe(false);
  });

  it.each(ALL_CATALOG_ACTIONS)("denies %s with no membership at all", (action) => {
    expect(authorize(req(action, [])).allow).toBe(false);
  });

  it("denies a membership in a different organization", () => {
    const request: AuthorizationRequest = {
      subject,
      action: "catalog.title.write",
      resource: { kind: "organization", orgId: ORG },
      context: {
        memberships: [
          {
            kind: "role_assignment",
            role: "owner" as TenancyRole,
            scope: { kind: "organization", orgId: "org_somewhere_else" },
          },
        ],
      },
    };
    expect(authorize(request).allow).toBe(false);
  });

  it("rejects a catalog action that is not in the vocabulary", () => {
    const decision = authorize(req("catalog.title.destroy", ["owner"]));
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe("unknown_action");
  });

  it("does not require a project scope for catalog actions", () => {
    // Catalog curation is org-level: adding a projectId must not change the
    // answer, and omitting one must not trip the project-scope guard.
    const withProject: AuthorizationRequest = {
      ...req("catalog.title.write", ["owner"]),
      resource: { kind: "organization", orgId: ORG, projectId: "prj_1" },
    };
    expect(authorize(req("catalog.title.write", ["owner"])).allow).toBe(true);
    expect(authorize(withProject).allow).toBe(true);
  });
});
