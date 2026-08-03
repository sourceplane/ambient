import type { Person, Title } from "@saas/db/catalog";
import type { SearchDocumentPayload } from "@saas/contracts/search";
import { namePublicId, titlePublicId } from "./ids.js";

/**
 * Publishing to the search index is best-effort by design.
 *
 * The index is a projection: it can be rebuilt from the catalog at any time,
 * and a title that is momentarily missing from search is a much smaller
 * problem than a curation write that 500s because a sibling Worker was
 * redeploying. Failures are logged and swallowed; correctness is restored by
 * republishing, not by blocking the write.
 */
export async function publishSearchDocuments(
  searchWorker: Fetcher | undefined,
  documents: SearchDocumentPayload[],
  requestId: string,
): Promise<void> {
  if (!searchWorker || documents.length === 0) return;
  try {
    const response = await searchWorker.fetch(
      "http://search-worker/v1/internal/search/documents",
      {
        method: "PUT",
        headers: { "content-type": "application/json", "x-request-id": requestId },
        body: JSON.stringify({ documents }),
      },
    );
    if (!response.ok) {
      // eslint-disable-next-line no-console -- index drift must be visible in logs
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "search_publish_failed",
          requestId,
          status: response.status,
          count: documents.length,
        }),
      );
    }
  } catch {
    // eslint-disable-next-line no-console -- index drift must be visible in logs
    console.warn(
      JSON.stringify({ level: "warn", msg: "search_publish_unreachable", requestId }),
    );
  }
}

export async function unpublishSearchDocument(
  searchWorker: Fetcher | undefined,
  entityType: "title" | "person",
  entityId: string,
  requestId: string,
): Promise<void> {
  if (!searchWorker) return;
  try {
    await searchWorker.fetch(
      `http://search-worker/v1/internal/search/documents/${entityType}/${entityId}`,
      { method: "DELETE", headers: { "x-request-id": requestId } },
    );
  } catch {
    // eslint-disable-next-line no-console -- index drift must be visible in logs
    console.warn(
      JSON.stringify({ level: "warn", msg: "search_unpublish_unreachable", requestId }),
    );
  }
}

/** Only published rows belong in a public index. */
export function titleSearchDocument(
  title: Title,
  genreSlugs: string[],
  primaryImageUrl: string | null,
): SearchDocumentPayload | null {
  if (title.status !== "published") return null;
  const yearLabel = title.startYear ? String(title.startYear) : "";
  const kindLabel = title.kind.replace(/_/g, " ");

  return {
    type: "title",
    entityId: title.id,
    publicId: titlePublicId(title.id),
    display: title.primaryTitle,
    secondary: [yearLabel, kindLabel].filter(Boolean).join(" · "),
    imageUrl: primaryImageUrl,
    // The original title matters here: a viewer searching "Ladri di
    // biciclette" must find "Bicycle Thieves".
    body: [title.originalTitle, title.tagline, title.plotOutline].filter(Boolean).join(" "),
    popularity: 0,
    facets: {
      kind: title.kind,
      ...(title.startYear === null ? {} : { year: title.startYear }),
      genres: genreSlugs,
      ...(title.runtimeMinutes === null ? {} : { runtime: title.runtimeMinutes }),
      adult: title.isAdult,
    },
  };
}

export function personSearchDocument(
  person: Person,
  professions: string[],
  primaryImageUrl: string | null,
): SearchDocumentPayload | null {
  if (person.status !== "published") return null;
  const bornYear = person.birthDate ? Number(person.birthDate.slice(0, 4)) : null;
  const diedYear = person.deathDate ? Number(person.deathDate.slice(0, 4)) : null;

  return {
    type: "person",
    entityId: person.id,
    publicId: namePublicId(person.id),
    display: person.name,
    secondary: professions.map((p) => p.replace(/_/g, " ")).join(", "),
    imageUrl: primaryImageUrl,
    body: [person.birthPlace, person.miniBio].filter(Boolean).join(" ").slice(0, 4_000),
    popularity: 0,
    facets: {
      professions,
      ...(bornYear === null || Number.isNaN(bornYear) ? {} : { bornYear }),
      ...(diedYear === null || Number.isNaN(diedYear) ? {} : { diedYear }),
      ...(person.birthPlace ? { birthPlace: person.birthPlace } : {}),
    },
  };
}
