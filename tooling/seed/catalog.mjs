#!/usr/bin/env node
// Seed the catalog through the public curation API.
//
//   AMBIENT_TOKEN=<bearer> node tooling/seed/catalog.mjs \
//     --api-url https://ambient-api-edge-stage.<subdomain>.workers.dev \
//     --org org_<32hex> \
//     [--dataset tooling/seed/dataset.json] [--dry-run]
//
// Why an API client and not SQL: curation is the only supported way to write
// the catalog. It enforces the same validation, derives sort titles and slugs,
// publishes search documents, and writes audit entries. A direct INSERT would
// skip all four and leave the search index silently stale.
//
// The token needs `catalog.title.write`, `catalog.person.write`,
// `catalog.credit.write` and `catalog.media.write` in the target org — the
// owner role has all of them.
//
// Idempotency: the script searches for each title before creating it and skips
// anything already present. Re-running is safe and cheap; it is the intended
// way to top up a catalog rather than a special repair mode.

import { readFile } from "node:fs/promises";
import { argv, env, exit } from "node:process";

const DEFAULT_DATASET = new URL("./dataset.json", import.meta.url);

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith("--")) continue;
    const [key, inline] = token.slice(2).split("=");
    if (inline !== undefined) {
      flags[key] = inline;
      continue;
    }
    const next = args[i + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

class SeedError extends Error {}

function required(flags, key, hint) {
  const value = flags[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new SeedError(`Missing --${key} (${hint})`);
  }
  return value;
}

/**
 * One request shape for the whole script. Curation answers 422 with a field
 * map, which is the most useful thing to print when a dataset is wrong — so it
 * is surfaced verbatim rather than flattened into "request failed".
 */
async function api(baseUrl, token, method, path, body) {
  const headers = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new SeedError(`${method} ${path} → ${response.status} (non-JSON body)`);
  }

  if (!response.ok) {
    const details = parsed?.error?.details?.fields
      ? ` ${JSON.stringify(parsed.error.details.fields)}`
      : "";
    throw new SeedError(
      `${method} ${path} → ${response.status} ${parsed?.error?.code ?? ""}${details}`,
    );
  }
  return parsed.data;
}

/**
 * Has this title already been seeded?
 *
 * Matched on primary title + start year rather than on a stored seed marker:
 * the catalog has no "seeded by" field, and inventing one would put a
 * tool's bookkeeping into the product's schema.
 */
async function findExistingTitle(baseUrl, token, primaryTitle, startYear) {
  const query = new URLSearchParams({ q: primaryTitle, type: "title", limit: "20" });
  let data;
  try {
    data = await api(baseUrl, token, "GET", `/v1/search?${query}`);
  } catch {
    // A search index that isn't answering must not stop a seed — worst case
    // the run creates a duplicate, which is recoverable; a failed seed is not.
    return null;
  }
  const hit = (data?.results ?? []).find(
    (result) =>
      result.display?.toLowerCase() === primaryTitle.toLowerCase() &&
      (startYear === undefined || result.facets?.year === startYear),
  );
  return hit?.id ?? null;
}

async function main() {
  const flags = parseFlags(argv.slice(2));
  const baseUrl = required(flags, "api-url", "e.g. https://…-api-edge-stage.…workers.dev").replace(/\/+$/, "");
  const orgId = required(flags, "org", "e.g. org_0123…");
  const token = env.AMBIENT_TOKEN;
  const dryRun = flags["dry-run"] === true;

  if (!token && !dryRun) {
    throw new SeedError("AMBIENT_TOKEN is not set (a bearer token for a catalog curator)");
  }

  const datasetPath = typeof flags.dataset === "string" ? flags.dataset : DEFAULT_DATASET;
  const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
  const curation = `/v1/organizations/${orgId}/catalog`;

  console.log(`Seeding ${dataset.titles.length} titles and ${dataset.people.length} people`);
  console.log(`  target: ${baseUrl}`);
  console.log(`  org:    ${orgId}`);
  if (dryRun) console.log("  DRY RUN — no writes will be made");

  // People first: a credit needs a person id, so the order is not optional.
  const peopleByKey = new Map();
  for (const person of dataset.people) {
    if (dryRun) {
      console.log(`  would create person: ${person.name}`);
      peopleByKey.set(person.key, `nm_dryrun_${person.key}`);
      continue;
    }
    const created = await api(baseUrl, token, "POST", `${curation}/names`, {
      name: person.name,
      professions: person.professions ?? [],
      ...(person.birthDate ? { birthDate: person.birthDate } : {}),
      ...(person.birthPlace ? { birthPlace: person.birthPlace } : {}),
      ...(person.miniBio ? { miniBio: person.miniBio } : {}),
    });
    peopleByKey.set(person.key, created.name.id);
    console.log(`  person ${created.name.id}  ${person.name}`);
  }

  let created = 0;
  let skipped = 0;

  for (const title of dataset.titles) {
    const existing = dryRun
      ? null
      : await findExistingTitle(baseUrl, token, title.primaryTitle, title.startYear);
    if (existing) {
      console.log(`  skip   ${existing}  ${title.primaryTitle} (already present)`);
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(`  would create title: ${title.primaryTitle} (${title.startYear ?? "—"})`);
      created += 1;
      continue;
    }

    const record = await api(baseUrl, token, "POST", `${curation}/titles`, {
      kind: title.kind,
      primaryTitle: title.primaryTitle,
      ...(title.startYear ? { startYear: title.startYear } : {}),
      ...(title.endYear ? { endYear: title.endYear } : {}),
      ...(title.runtimeMinutes ? { runtimeMinutes: title.runtimeMinutes } : {}),
      ...(title.plotOutline ? { plotOutline: title.plotOutline } : {}),
      ...(title.plotSummary ? { plotSummary: title.plotSummary } : {}),
      ...(title.tagline ? { tagline: title.tagline } : {}),
      productionStatus: title.productionStatus ?? "released",
      genres: title.genres ?? [],
    });
    const titleId = record.title.id;
    console.log(`  title  ${titleId}  ${title.primaryTitle}`);
    created += 1;

    for (const credit of title.credits ?? []) {
      const nameId = peopleByKey.get(credit.person);
      if (!nameId) {
        console.warn(`    ! unknown person key "${credit.person}" — skipping credit`);
        continue;
      }
      await api(baseUrl, token, "POST", `${curation}/titles/${titleId}/credits`, {
        nameId,
        category: credit.category,
        department: credit.department,
        job: credit.job,
        ...(credit.characters ? { characters: credit.characters } : {}),
        ...(credit.billingOrder !== undefined ? { billingOrder: credit.billingOrder } : {}),
      });
    }

    // Images are optional and carry no defaults: the API requires a real
    // http(s) URL, and this tool will not invent one. A title without a poster
    // renders the site's fallback rather than a broken image.
    for (const image of title.images ?? []) {
      await api(baseUrl, token, "POST", `${curation}/titles/${titleId}/images`, image);
    }
  }

  console.log(`\nDone. ${created} created, ${skipped} skipped.`);
}

main().catch((error) => {
  if (error instanceof SeedError) {
    console.error(`seed: ${error.message}`);
    exit(1);
  }
  console.error(error);
  exit(1);
});
