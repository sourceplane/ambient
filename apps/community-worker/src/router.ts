import { createSqlExecutor } from "@saas/db/hyperdrive";
import {
  createCommunityRepository,
  CONTRIBUTION_TARGETS,
  FACT_KINDS,
  PARENTS_GUIDE_CATEGORIES,
  SEVERITIES,
} from "@saas/db/community";
import type {
  AwardNomination,
  CommunityRepository,
  Contribution,
  FactKind,
  FaqEntry,
  NewsArticle,
  ParentsGuideCategory,
  ParentsGuideEntry,
  Severity,
  SeverityTally,
  TitleFact,
} from "@saas/db/community";
import type { Uuid } from "@saas/db/ids";
import { uuidToHex } from "@saas/db/ids";
import { createTimings } from "@saas/contracts/timing";
import type {
  PublicAward,
  PublicContribution,
  PublicFact,
  PublicFaqEntry,
  PublicNewsArticle,
  PublicParentsGuideEntry,
  PublicSeverityTally,
} from "@saas/contracts/community";
import type { Env } from "./env.js";
import {
  errorResponse,
  methodNotAllowed,
  notFound,
  successResponse,
  validationError,
  withTimings,
} from "./http.js";
import { generateRequestId, newUuid } from "./ids.js";

const REQUEST_ID_RE = /^[\w-]{1,128}$/;
const MAX_BODY = 10_000;
const MAX_PAGE = 100;

const TITLE_AWARDS_RE = /^\/v1\/titles\/([^/]+)\/awards$/;
const NAME_AWARDS_RE = /^\/v1\/names\/([^/]+)\/awards$/;
const EDITION_AWARDS_RE = /^\/v1\/awards\/([a-z0-9-]+)\/(\d{4})$/;
const TITLE_FACTS_RE = /^\/v1\/titles\/([^/]+)\/facts$/;
const FACT_VOTE_RE = /^\/v1\/facts\/([^/]+)\/vote$/;
const PARENTS_GUIDE_RE = /^\/v1\/titles\/([^/]+)\/parents-guide$/;
const SEVERITY_RE = /^\/v1\/titles\/([^/]+)\/parents-guide\/([a-z_]+)\/severity$/;
const FAQ_RE = /^\/v1\/titles\/([^/]+)\/faq$/;
const NEWS_RE = /^\/v1\/news$/;
const CONTRIBUTIONS_RE = /^\/v1\/contributions$/;
const ME_CONTRIBUTIONS_RE = /^\/v1\/me\/contributions$/;
const WITHDRAW_RE = /^\/v1\/contributions\/([^/]+)\/withdraw$/;
const MOD_QUEUE_RE = /^\/v1\/moderation\/contributions$/;
const MOD_DECISION_RE = /^\/v1\/moderation\/contributions\/([^/]+)\/decision$/;

function resolveRequestId(request: Request): string {
  const header = request.headers.get("x-request-id");
  if (header && REQUEST_ID_RE.test(header)) return header;
  return generateRequestId();
}

function decodeId(publicId: string, prefix?: string): Uuid | null {
  const sep = publicId.indexOf("_");
  if (prefix !== undefined && (sep < 1 || publicId.slice(0, sep) !== prefix)) return null;
  const hex = sep === -1 ? publicId : publicId.slice(sep + 1);
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as Uuid;
}

function actorUuid(request: Request): Uuid | null {
  const subjectId = request.headers.get("x-actor-subject-id");
  if (!subjectId || !request.headers.get("x-actor-subject-type")) return null;
  return decodeId(subjectId);
}

export function factPublicId(uuid: string): string {
  return `fa_${uuidToHex(uuid)}`;
}

export function contributionPublicId(uuid: string): string {
  return `cb_${uuidToHex(uuid)}`;
}

export function toPublicFact(fact: TitleFact): PublicFact {
  return {
    id: factPublicId(fact.id),
    kind: fact.kind,
    subkind: fact.subkind,
    body: fact.body,
    hasSpoilers: fact.hasSpoilers,
    interestingVotes: fact.interestingVotes,
    totalVotes: fact.totalVotes,
    quoteLines: fact.quoteLines.map((l) => ({ speaker: l.speaker, line: l.line })),
  };
}

export function toPublicAward(award: AwardNomination): PublicAward {
  return {
    id: `aw_${uuidToHex(award.id)}`,
    body: award.bodyName,
    bodySlug: award.bodySlug,
    year: award.year,
    category: award.categoryName,
    isWinner: award.isWinner,
    note: award.note,
    titleId: award.titleId ? `tt_${uuidToHex(award.titleId)}` : null,
    nameId: award.personId ? `nm_${uuidToHex(award.personId)}` : null,
  };
}

function toPublicEntry(entry: ParentsGuideEntry): PublicParentsGuideEntry {
  return {
    id: `pg_${uuidToHex(entry.id)}`,
    category: entry.category,
    body: entry.body,
    hasSpoilers: entry.hasSpoilers,
  };
}

function toPublicTally(tally: SeverityTally): PublicSeverityTally {
  return {
    category: tally.category,
    severity: tally.severity,
    votes: tally.votes,
    totalVotes: tally.totalVotes,
  };
}

function toPublicFaq(entry: FaqEntry): PublicFaqEntry {
  return {
    id: `fq_${uuidToHex(entry.id)}`,
    question: entry.question,
    answer: entry.answer,
    hasSpoilers: entry.hasSpoilers,
  };
}

function toPublicNews(article: NewsArticle): PublicNewsArticle {
  return {
    id: `ni_${uuidToHex(article.id)}`,
    headline: article.headline,
    body: article.body,
    source: article.source,
    author: article.author,
    url: article.url,
    imageUrl: article.imageUrl,
    publishedAt: article.publishedAt.toISOString(),
  };
}

/**
 * A contribution is the contributor's own record. The payload is deliberately
 * not echoed: it is the proposed change, and returning it invites clients to
 * render unmoderated content as if it were live.
 */
export function toPublicContribution(contribution: Contribution): PublicContribution {
  return {
    id: contributionPublicId(contribution.id),
    targetType: contribution.targetType,
    targetId: contribution.targetId,
    operation: contribution.operation,
    state: contribution.state,
    submittedAt: contribution.submittedAt.toISOString(),
    decidedAt: contribution.decidedAt ? contribution.decidedAt.toISOString() : null,
    decisionNote: contribution.decisionNote,
  };
}

function boundedPage(url: URL): { limit: number; offset: number } | { field: string; error: string } {
  const limitRaw = url.searchParams.get("limit");
  let limit = 25;
  if (limitRaw !== null) {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PAGE) {
      return { field: "limit", error: `Must be an integer between 1 and ${MAX_PAGE}` };
    }
    limit = parsed;
  }
  const offsetRaw = url.searchParams.get("offset");
  let offset = 0;
  if (offsetRaw !== null) {
    const parsed = Number(offsetRaw);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_000) {
      return { field: "offset", error: "Must be an integer between 0 and 10000" };
    }
    offset = parsed;
  }
  return { limit, offset };
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const requestId = resolveRequestId(request);

  try {
    if (url.pathname === "/health") {
      if (request.method !== "GET") return notFound(requestId, url.pathname);
      return successResponse(
        {
          status: "ok",
          service: "community-worker",
          environment: env.ENVIRONMENT ?? "local",
          timestamp: new Date().toISOString(),
          checks: { database: { configured: !!env.PLATFORM_DB } },
        },
        requestId,
      );
    }

    const severity = url.pathname.match(SEVERITY_RE);
    if (severity) {
      if (request.method !== "PUT") return methodNotAllowed(requestId);
      const titleId = decodeId(severity[1]!, "tt");
      if (!titleId) return notFound(requestId, url.pathname);
      const category = severity[2]!;
      if (!(PARENTS_GUIDE_CATEGORIES as readonly string[]).includes(category)) {
        return notFound(requestId, url.pathname);
      }
      return setSeverity(request, env, requestId, titleId, category as ParentsGuideCategory);
    }

    const parentsGuide = url.pathname.match(PARENTS_GUIDE_RE);
    if (parentsGuide) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      const titleId = decodeId(parentsGuide[1]!, "tt");
      if (!titleId) return notFound(requestId, url.pathname);
      return getParentsGuide(env, requestId, titleId);
    }

    const titleAwards = url.pathname.match(TITLE_AWARDS_RE);
    if (titleAwards) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      const titleId = decodeId(titleAwards[1]!, "tt");
      if (!titleId) return notFound(requestId, url.pathname);
      return withRepo(env, requestId, "community.title.awards", async (repo, timings) => {
        const result = await timings.measure("db", () => repo.listTitleAwards(titleId));
        if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
        return successResponse({ awards: result.value.map(toPublicAward) }, requestId);
      });
    }

    const nameAwards = url.pathname.match(NAME_AWARDS_RE);
    if (nameAwards) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      const personId = decodeId(nameAwards[1]!, "nm");
      if (!personId) return notFound(requestId, url.pathname);
      return withRepo(env, requestId, "community.name.awards", async (repo, timings) => {
        const result = await timings.measure("db", () => repo.listPersonAwards(personId));
        if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
        return successResponse({ awards: result.value.map(toPublicAward) }, requestId);
      });
    }

    const edition = url.pathname.match(EDITION_AWARDS_RE);
    if (edition) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      const year = Number(edition[2]!);
      return withRepo(env, requestId, "community.awards.edition", async (repo, timings) => {
        const result = await timings.measure("db", () =>
          repo.listEditionAwards(edition[1]!, year),
        );
        if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
        return successResponse({ awards: result.value.map(toPublicAward) }, requestId);
      });
    }

    const facts = url.pathname.match(TITLE_FACTS_RE);
    if (facts) {
      const titleId = decodeId(facts[1]!, "tt");
      if (!titleId) return notFound(requestId, url.pathname);
      if (request.method === "GET") return listFacts(url, env, requestId, titleId);
      if (request.method === "POST") return createFact(request, env, requestId, titleId);
      return methodNotAllowed(requestId);
    }

    const factVote = url.pathname.match(FACT_VOTE_RE);
    if (factVote) {
      if (request.method !== "POST") return methodNotAllowed(requestId);
      const factId = decodeId(factVote[1]!, "fa");
      if (!factId) return notFound(requestId, url.pathname);
      return voteFact(request, env, requestId, factId);
    }

    const faq = url.pathname.match(FAQ_RE);
    if (faq) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      const titleId = decodeId(faq[1]!, "tt");
      if (!titleId) return notFound(requestId, url.pathname);
      return withRepo(env, requestId, "community.title.faq", async (repo, timings) => {
        const result = await timings.measure("db", () => repo.listFaq(titleId));
        if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
        return successResponse({ faq: result.value.map(toPublicFaq) }, requestId);
      });
    }

    if (NEWS_RE.test(url.pathname)) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      return listNews(url, env, requestId);
    }

    const withdraw = url.pathname.match(WITHDRAW_RE);
    if (withdraw) {
      if (request.method !== "POST") return methodNotAllowed(requestId);
      const contributionId = decodeId(withdraw[1]!, "cb");
      if (!contributionId) return notFound(requestId, url.pathname);
      return withdrawContribution(request, env, requestId, contributionId);
    }

    const decision = url.pathname.match(MOD_DECISION_RE);
    if (decision) {
      if (request.method !== "POST") return methodNotAllowed(requestId);
      const contributionId = decodeId(decision[1]!, "cb");
      if (!contributionId) return notFound(requestId, url.pathname);
      return decideContribution(request, env, requestId, contributionId);
    }

    if (MOD_QUEUE_RE.test(url.pathname)) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      return listQueue(url, request, env, requestId);
    }

    if (ME_CONTRIBUTIONS_RE.test(url.pathname)) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      return listMyContributions(url, request, env, requestId);
    }

    if (CONTRIBUTIONS_RE.test(url.pathname)) {
      if (request.method !== "POST") return methodNotAllowed(requestId);
      return submitContribution(request, env, requestId);
    }

    return notFound(requestId, url.pathname);
  } catch {
    return errorResponse("internal_error", "An unexpected error occurred", 500, requestId);
  }
}

async function withRepo(
  env: Env,
  requestId: string,
  routeName: string,
  fn: (repo: CommunityRepository, timings: ReturnType<typeof createTimings>) => Promise<Response>,
): Promise<Response> {
  if (!env.PLATFORM_DB) {
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  const timings = createTimings();
  const endTotal = timings.start("total");
  const executor = createSqlExecutor(env.PLATFORM_DB);
  try {
    const response = await fn(createCommunityRepository(executor), timings);
    endTotal();
    return withTimings(response, requestId, routeName, timings);
  } catch {
    endTotal();
    return withTimings(
      errorResponse("internal_error", "Service unavailable", 503, requestId),
      requestId,
      routeName,
      timings,
    );
  } finally {
    await executor.dispose();
  }
}

function unauthenticated(requestId: string): Response {
  return errorResponse("unauthenticated", "Authentication required", 401, requestId);
}

function listFacts(url: URL, env: Env, requestId: string, titleId: Uuid): Promise<Response> {
  const kindRaw = url.searchParams.get("kind");
  if (kindRaw !== null && !(FACT_KINDS as readonly string[]).includes(kindRaw)) {
    return Promise.resolve(
      validationError(requestId, { kind: [`Must be one of: ${FACT_KINDS.join(", ")}`] }),
    );
  }
  const page = boundedPage(url);
  if ("error" in page) {
    return Promise.resolve(validationError(requestId, { [page.field]: [page.error] }));
  }

  return withRepo(env, requestId, "community.title.facts", async (repo, timings) => {
    const result = await timings.measure("db", () =>
      repo.listFacts(titleId, (kindRaw as FactKind | null) ?? null, page.limit),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ facts: result.value.map(toPublicFact) }, requestId);
  });
}

async function createFact(
  request: Request,
  env: Env,
  requestId: string,
  titleId: Uuid,
): Promise<Response> {
  const userId = actorUuid(request);
  if (!userId) return unauthenticated(requestId);
  const body = await readJson(request);
  if (!body) return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);

  const errors: Record<string, string[]> = {};
  const kind = body.kind;
  if (typeof kind !== "string" || !(FACT_KINDS as readonly string[]).includes(kind)) {
    errors.kind = [`Must be one of: ${FACT_KINDS.join(", ")}`];
  }
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text.length === 0) errors.body = ["Required"];
  else if (text.length > MAX_BODY) errors.body = [`Must be at most ${MAX_BODY} characters`];

  const quoteLines: Array<{ speaker: string | null; line: string }> = [];
  if (body.quoteLines !== undefined) {
    if (!Array.isArray(body.quoteLines) || body.quoteLines.length > 50) {
      errors.quoteLines = ["Must be an array of at most 50 lines"];
    } else {
      for (const entry of body.quoteLines) {
        const record = entry as Record<string, unknown>;
        const line = typeof record?.line === "string" ? record.line.trim() : "";
        if (line.length === 0 || line.length > 2_000) {
          errors.quoteLines = ["Each line must be a non-empty string"];
          break;
        }
        quoteLines.push({
          speaker: typeof record.speaker === "string" ? record.speaker.trim() || null : null,
          line,
        });
      }
    }
  }
  if (Object.keys(errors).length > 0) return validationError(requestId, errors);

  return withRepo(env, requestId, "community.fact.create", async (repo, timings) => {
    const result = await timings.measure("db", () =>
      repo.createFact({
        id: newUuid(),
        titleId,
        kind: kind as FactKind,
        subkind: typeof body.subkind === "string" ? body.subkind : null,
        body: text,
        hasSpoilers: body.hasSpoilers === true,
        // Contributed facts land in the queue, not on the page. Publishing is
        // a moderator decision, never a side effect of submitting.
        state: "pending",
        contributorUserId: userId,
        quoteLines,
      }),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ fact: toPublicFact(result.value) }, requestId, 201);
  });
}

async function voteFact(
  request: Request,
  env: Env,
  requestId: string,
  factId: Uuid,
): Promise<Response> {
  if (!actorUuid(request)) return unauthenticated(requestId);
  const body = await readJson(request);
  if (!body) return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);
  if (typeof body.interesting !== "boolean") {
    return validationError(requestId, { interesting: ["Must be a boolean"] });
  }

  return withRepo(env, requestId, "community.fact.vote", async (repo, timings) => {
    const result = await timings.measure("db", () =>
      repo.voteFact(factId, body.interesting as boolean),
    );
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    return successResponse({ fact: toPublicFact(result.value) }, requestId);
  });
}

function getParentsGuide(env: Env, requestId: string, titleId: Uuid): Promise<Response> {
  return withRepo(env, requestId, "community.title.parents_guide", async (repo, timings) => {
    // Entries and severity tallies always render together — one response.
    const [entries, tallies] = await timings.measure("db", () =>
      Promise.all([repo.listParentsGuide(titleId), repo.getSeverityTallies(titleId)]),
    );
    return successResponse(
      {
        entries: entries.ok ? entries.value.map(toPublicEntry) : [],
        severity: tallies.ok ? tallies.value.map(toPublicTally) : [],
      },
      requestId,
    );
  });
}

async function setSeverity(
  request: Request,
  env: Env,
  requestId: string,
  titleId: Uuid,
  category: ParentsGuideCategory,
): Promise<Response> {
  const userId = actorUuid(request);
  if (!userId) return unauthenticated(requestId);
  const body = await readJson(request);
  if (!body) return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);
  const severity = body.severity;
  if (typeof severity !== "string" || !(SEVERITIES as readonly string[]).includes(severity)) {
    return validationError(requestId, { severity: [`Must be one of: ${SEVERITIES.join(", ")}`] });
  }

  return withRepo(env, requestId, "community.parents_guide.vote", async (repo, timings) => {
    const result = await timings.measure("db", () =>
      repo.setSeverityVote(titleId, category, userId, severity as Severity),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ severity: toPublicTally(result.value) }, requestId);
  });
}

function listNews(url: URL, env: Env, requestId: string): Promise<Response> {
  const page = boundedPage(url);
  if ("error" in page) {
    return Promise.resolve(validationError(requestId, { [page.field]: [page.error] }));
  }
  const entityRaw = url.searchParams.get("entity");
  let entity: { entityType: "title" | "person"; entityId: Uuid } | null = null;
  if (entityRaw) {
    const titleId = decodeId(entityRaw, "tt");
    const personId = decodeId(entityRaw, "nm");
    if (titleId) entity = { entityType: "title", entityId: titleId };
    else if (personId) entity = { entityType: "person", entityId: personId };
    else return Promise.resolve(validationError(requestId, { entity: ["Must be a title or name id"] }));
  }

  return withRepo(env, requestId, "community.news.list", async (repo, timings) => {
    const result = await timings.measure("db", () => repo.listNews(entity, page));
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ news: result.value.map(toPublicNews) }, requestId);
  });
}

async function submitContribution(
  request: Request,
  env: Env,
  requestId: string,
): Promise<Response> {
  const userId = actorUuid(request);
  if (!userId) return unauthenticated(requestId);
  const body = await readJson(request);
  if (!body) return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);

  const errors: Record<string, string[]> = {};
  const targetType = body.targetType;
  if (
    typeof targetType !== "string" ||
    !(CONTRIBUTION_TARGETS as readonly string[]).includes(targetType)
  ) {
    errors.targetType = [`Must be one of: ${CONTRIBUTION_TARGETS.join(", ")}`];
  }
  const operation = body.operation;
  if (operation !== "create" && operation !== "update" && operation !== "delete") {
    errors.operation = ["Must be create, update or delete"];
  }
  let targetId: Uuid | null = null;
  if (body.targetId !== undefined && body.targetId !== null) {
    if (typeof body.targetId !== "string") errors.targetId = ["Must be a public id"];
    else {
      targetId = decodeId(body.targetId);
      if (!targetId) errors.targetId = ["Must be a public id"];
    }
  }
  // An update or delete with no target has nothing to change.
  if ((operation === "update" || operation === "delete") && !targetId) {
    errors.targetId = ["Required for update and delete"];
  }
  const payload =
    body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : {};
  if (JSON.stringify(payload).length > 100_000) {
    errors.payload = ["Too large"];
  }
  if (Object.keys(errors).length > 0) return validationError(requestId, errors);

  return withRepo(env, requestId, "community.contribution.submit", async (repo, timings) => {
    const result = await timings.measure("db", () =>
      repo.submitContribution({
        id: newUuid(),
        contributorUserId: userId,
        targetType: targetType as Contribution["targetType"],
        targetId,
        operation: operation as Contribution["operation"],
        payload,
      }),
    );
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ contribution: toPublicContribution(result.value) }, requestId, 201);
  });
}

function listMyContributions(
  url: URL,
  request: Request,
  env: Env,
  requestId: string,
): Promise<Response> {
  const userId = actorUuid(request);
  if (!userId) return Promise.resolve(unauthenticated(requestId));
  const page = boundedPage(url);
  if ("error" in page) {
    return Promise.resolve(validationError(requestId, { [page.field]: [page.error] }));
  }
  return withRepo(env, requestId, "community.contribution.mine", async (repo, timings) => {
    const [list, stats] = await timings.measure("db", () =>
      Promise.all([repo.listMyContributions(userId, page), repo.getContributorStats(userId)]),
    );
    if (!list.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse(
      {
        contributions: list.value.map(toPublicContribution),
        stats: stats.ok
          ? {
              approvedCount: stats.value.approvedCount,
              rejectedCount: stats.value.rejectedCount,
              pendingCount: stats.value.pendingCount,
              reputation: stats.value.reputation,
            }
          : null,
      },
      requestId,
    );
  });
}

function withdrawContribution(
  request: Request,
  env: Env,
  requestId: string,
  contributionId: Uuid,
): Promise<Response> {
  const userId = actorUuid(request);
  if (!userId) return Promise.resolve(unauthenticated(requestId));
  return withRepo(env, requestId, "community.contribution.withdraw", async (repo, timings) => {
    const result = await timings.measure("db", () =>
      repo.withdrawContribution(contributionId, userId),
    );
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    return successResponse({ contribution: toPublicContribution(result.value) }, requestId);
  });
}

function listQueue(url: URL, request: Request, env: Env, requestId: string): Promise<Response> {
  if (!actorUuid(request)) return Promise.resolve(unauthenticated(requestId));
  const page = boundedPage(url);
  if ("error" in page) {
    return Promise.resolve(validationError(requestId, { [page.field]: [page.error] }));
  }
  return withRepo(env, requestId, "community.moderation.list", async (repo, timings) => {
    const result = await timings.measure("db", () => repo.listModerationQueue(page));
    if (!result.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return successResponse({ contributions: result.value.map(toPublicContribution) }, requestId);
  });
}

async function decideContribution(
  request: Request,
  env: Env,
  requestId: string,
  contributionId: Uuid,
): Promise<Response> {
  const moderatorId = actorUuid(request);
  if (!moderatorId) return unauthenticated(requestId);
  const body = await readJson(request);
  if (!body) return errorResponse("validation_failed", "Invalid JSON body", 422, requestId);
  const state = body.state;
  if (state !== "approved" && state !== "rejected") {
    return validationError(requestId, { state: ["Must be approved or rejected"] });
  }
  const note = typeof body.note === "string" ? body.note.slice(0, 2_000) : null;

  return withRepo(env, requestId, "community.moderation.decide", async (repo, timings) => {
    const result = await timings.measure("db", () =>
      repo.decideContribution(contributionId, moderatorId, state, note),
    );
    if (!result.ok) return errorResponse("not_found", "Not found", 404, requestId);
    return successResponse({ contribution: toPublicContribution(result.value) }, requestId);
  });
}
