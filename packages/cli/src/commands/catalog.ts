// Catalog read commands.
//
// These differ from every other command in the CLI in one respect: the routes
// are public. `ctx.sdk()` still supplies the client — a stored token is sent
// when there is one and costs nothing — but a signed-out user gets the same
// answers, so these commands do not fail on `MissingAuthError` the way
// `org list` does.

import type { CommandContext, CommandResult } from "../router.js";
import { formatOutput } from "../output/index.js";
import { UsageError } from "../errors.js";

/** Read a string flag, treating empty / boolean / missing as absent. */
function strFlag(flag: string | boolean | undefined): string | undefined {
  return typeof flag === "string" && flag.length > 0 ? flag : undefined;
}

function parseLimit(flag: string | boolean | undefined, fallback: number): number {
  if (typeof flag !== "string" || flag.length === 0) return fallback;
  const parsed = Number.parseInt(flag, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new UsageError(`--limit must be a positive integer (got ${flag})`);
  }
  return parsed;
}

function requirePositional(args: ReadonlyArray<string>, what: string): string {
  const value = args[0];
  if (!value) throw new UsageError(`Missing ${what}`);
  return value;
}

/** `ambient catalog search <query> [--type] [--limit]` */
export async function catalogSearchCommand(ctx: CommandContext): Promise<CommandResult> {
  const query = ctx.args.join(" ").trim();
  if (!query) throw new UsageError("Missing search query");

  const sdk = await ctx.sdk();
  const type = strFlag(ctx.flags["type"]);
  const result = await sdk.search.search({
    q: query,
    ...(type !== undefined ? { type } : {}),
    limit: parseLimit(ctx.flags["limit"], 20),
  });

  ctx.stdout(
    formatOutput({
      mode: ctx.outputMode,
      title: `Results for "${query}"`,
      columns: ["id", "type", "display", "secondary"],
      rows: result.results.map((hit) => ({
        id: hit.id,
        type: hit.type,
        display: hit.display,
        secondary: hit.secondary,
      })),
    }),
  );
  return { exitCode: 0 };
}

/** `ambient catalog title <titleId>` */
export async function catalogTitleCommand(ctx: CommandContext): Promise<CommandResult> {
  const titleId = requirePositional(ctx.args, "title id (tt_…)");
  const sdk = await ctx.sdk();
  const { title } = await sdk.catalog.getTitle(titleId);

  ctx.stdout(
    formatOutput({
      mode: ctx.outputMode,
      title: title.primaryTitle,
      record: {
        id: title.id,
        kind: title.kind,
        startYear: title.startYear === null ? "" : String(title.startYear),
        endYear: title.endYear === null ? "" : String(title.endYear),
        runtimeMinutes: title.runtimeMinutes === null ? "" : String(title.runtimeMinutes),
        status: title.productionStatus,
        genres: title.genres.map((genre) => genre.name).join(", "),
        tagline: title.tagline ?? "",
      },
    }),
  );
  return { exitCode: 0 };
}

/** `ambient catalog credits <titleId> [--category] [--limit]` */
export async function catalogCreditsCommand(ctx: CommandContext): Promise<CommandResult> {
  const titleId = requirePositional(ctx.args, "title id (tt_…)");
  const sdk = await ctx.sdk();
  const category = strFlag(ctx.flags["category"]);
  const { credits } = await sdk.catalog.listTitleCredits(titleId, {
    ...(category !== undefined ? { category } : {}),
    limit: parseLimit(ctx.flags["limit"], 50),
  });

  ctx.stdout(
    formatOutput({
      mode: ctx.outputMode,
      title: `Credits for ${titleId}`,
      columns: ["nameId", "name", "department", "role"],
      rows: credits.map((credit) => ({
        nameId: credit.name.id,
        name: credit.name.name,
        department: credit.department,
        role: credit.characters.length > 0 ? credit.characters.join(" / ") : credit.job,
      })),
    }),
  );
  return { exitCode: 0 };
}

/**
 * `ambient catalog chart <chart> [--limit]`
 *
 * Two requests, not N: the chart returns ranked ids, and one batch hydrate
 * turns them into titles. This is the same seam the web app uses, and the
 * reason `catalog.batchTitles` exists.
 */
export async function catalogChartCommand(ctx: CommandContext): Promise<CommandResult> {
  const chart = requirePositional(ctx.args, "chart key (e.g. top_movies)");
  const sdk = await ctx.sdk();
  const limit = parseLimit(ctx.flags["limit"], 25);
  const { entries, computedFor } = await sdk.ratings.getChart(chart, { limit });
  const { titles } = await sdk.catalog.batchTitles(entries.map((entry) => entry.titleId));
  const byId = new Map(titles.map((title) => [title.id, title]));

  ctx.stdout(
    formatOutput({
      mode: ctx.outputMode,
      title: computedFor ? `${chart} (computed ${computedFor})` : chart,
      columns: ["rank", "titleId", "title", "year", "score"],
      rows: entries.map((entry) => {
        const title = byId.get(entry.titleId);
        return {
          rank: String(entry.rank),
          titleId: entry.titleId,
          title: title?.primaryTitle ?? "—",
          year: title?.startYear ? String(title.startYear) : "",
          score: entry.score.toFixed(1),
        };
      }),
    }),
  );
  return { exitCode: 0 };
}

/** `ambient catalog name <nameId>` */
export async function catalogNameCommand(ctx: CommandContext): Promise<CommandResult> {
  const nameId = requirePositional(ctx.args, "name id (nm_…)");
  const sdk = await ctx.sdk();
  const { name } = await sdk.catalog.getName(nameId);

  ctx.stdout(
    formatOutput({
      mode: ctx.outputMode,
      title: name.name,
      record: {
        id: name.id,
        professions: name.professions.join(", "),
        birthDate: name.birthDate ?? "",
        birthPlace: name.birthPlace ?? "",
        deathDate: name.deathDate ?? "",
        heightCm: name.heightCm === null ? "" : String(name.heightCm),
      },
    }),
  );
  return { exitCode: 0 };
}
