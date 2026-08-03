import type { CatalogRepository, Image, Title } from "@saas/db/catalog";
import type { PublicTitleSummary } from "@saas/contracts/catalog";
import { toPublicGenre, toPublicTitleSummary } from "../public.js";

/**
 * Turn a page of titles into the summaries a rail or grid renders.
 *
 * The naive version is two queries per title (genres, poster); a 50-title
 * chart page would be 100 round trips over Hyperdrive. Both lookups are
 * batched by id instead, so a page costs three queries total regardless of
 * its size.
 */
export async function hydrateTitleSummaries(
  repo: CatalogRepository,
  titles: Title[],
): Promise<PublicTitleSummary[]> {
  if (titles.length === 0) return [];
  const ids = titles.map((t) => t.id);

  const [genresResult, imagesResult] = await Promise.all([
    repo.getGenresByTitleIds(ids),
    repo.getPrimaryImages(ids),
  ]);

  const genresByTitle = genresResult.ok ? genresResult.value : new Map();
  const imagesByTitle: Map<string, Image> = imagesResult.ok ? imagesResult.value : new Map();

  return titles.map((title) =>
    toPublicTitleSummary(
      title,
      (genresByTitle.get(title.id) ?? []).map(toPublicGenre),
      imagesByTitle.get(title.id) ?? null,
    ),
  );
}
