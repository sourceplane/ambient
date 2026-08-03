import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { manifest, BOUNDED_CONTEXTS } from "@saas/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_ROOT = resolve(__dirname, "../../..", "packages/db/src/migrations");

const CATALOG_MIGRATION_IDS = [
  "200_catalog_core",
  "210_catalog_people",
  "220_catalog_companies",
  "230_catalog_media",
];

function readMigration(id: string): string {
  const entry = manifest.migrations.find((m) => m.id === id)!;
  return readFileSync(resolve(MIGRATIONS_ROOT, entry.path), "utf-8");
}

describe("Catalog migration verification", () => {
  it("registers 'catalog' as a bounded context", () => {
    expect(BOUNDED_CONTEXTS).toContain("catalog");
  });

  it("registers every catalog migration in the manifest", () => {
    const ids = manifest.migrations.filter((m) => m.context === "catalog").map((m) => m.id);
    expect(ids).toEqual(CATALOG_MIGRATION_IDS);
  });

  it("orders the catalog migrations after the platform migrations", () => {
    const ids = manifest.migrations.map((m) => m.id);
    expect(ids.indexOf("200_catalog_core")).toBeGreaterThan(
      ids.indexOf("190_integrations_delivery_attribution"),
    );
  });

  it("manifest checksums match the on-disk up.sql files", () => {
    for (const id of CATALOG_MIGRATION_IDS) {
      const entry = manifest.migrations.find((m) => m.id === id)!;
      const content = readFileSync(resolve(MIGRATIONS_ROOT, entry.path));
      expect(entry.checksum).toBe(createHash("sha256").update(content).digest("hex"));
    }
  });

  it("creates every table inside the catalog schema only", () => {
    for (const id of CATALOG_MIGRATION_IDS) {
      const sql = readMigration(id);
      const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_]+)\./g)].map((m) => m[1]);
      expect(tables.length).toBeGreaterThan(0);
      for (const schema of tables) expect(schema).toBe("catalog");
    }
  });

  it("never references another bounded context's schema", () => {
    const forbidden = [
      "identity.",
      "membership.",
      "projects.",
      "billing.",
      "events.",
      "config.",
      "webhooks.",
      "metering.",
      "notifications.",
      "support.",
      "integrations.",
    ];
    for (const id of CATALOG_MIGRATION_IDS) {
      const sql = readMigration(id);
      for (const ref of forbidden) expect(sql).not.toContain(ref);
    }
  });

  it("is idempotent — every DDL statement guards with IF NOT EXISTS", () => {
    for (const id of CATALOG_MIGRATION_IDS) {
      const sql = readMigration(id);
      const creates = [...sql.matchAll(/^CREATE (?:UNIQUE )?(TABLE|INDEX|SCHEMA)([^;]*)/gm)];
      expect(creates.length).toBeGreaterThan(0);
      for (const match of creates) {
        expect(match[0]).toContain("IF NOT EXISTS");
      }
    }
  });

  it("declares titles as the parent of every title satellite", () => {
    const sql = readMigration("200_catalog_core");
    const satellites = [
      "title_akas",
      "title_genres",
      "title_release_dates",
      "title_certificates",
      "title_countries",
      "title_languages",
      "title_locations",
      "title_box_office",
      "title_technical_specs",
      "title_external_ids",
      "title_connections",
    ];
    for (const table of satellites) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS catalog.${table}`);
    }
    // Deleting a title must not orphan its facts.
    const cascades = sql.match(/REFERENCES catalog\.titles \(id\) ON DELETE CASCADE/g) ?? [];
    expect(cascades.length).toBeGreaterThanOrEqual(satellites.length);
  });

  it("keeps cast and crew credits in one table with a category invariant", () => {
    const sql = readMigration("210_catalog_people");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS catalog.credits");
    expect(sql).toContain("CHECK ((category = 'cast') = (department = 'cast'))");
  });

  it("makes an episode a title rather than a separate entity", () => {
    const sql = readMigration("210_catalog_people");
    expect(sql).toContain(
      "episode_title_id UUID PRIMARY KEY REFERENCES catalog.titles (id) ON DELETE CASCADE",
    );
    expect(sql).toContain("episodes_series_season_episode_idx");
  });

  it("allows at most one primary image per title and per person", () => {
    const sql = readMigration("230_catalog_media");
    expect(sql).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS title_images_primary_idx\n  ON catalog.title_images (title_id) WHERE is_primary",
    );
    expect(sql).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS person_images_primary_idx\n  ON catalog.person_images (person_id) WHERE is_primary",
    );
  });

  it("requires image dimensions so the web layer can reserve space", () => {
    const sql = readMigration("230_catalog_media");
    expect(sql).toContain("width      INT NOT NULL CHECK (width > 0)");
    expect(sql).toContain("height     INT NOT NULL CHECK (height > 0)");
  });

  it("stores money in minor units with an explicit currency", () => {
    const sql = readMigration("200_catalog_core");
    expect(sql).toContain("budget_cents             BIGINT");
    expect(sql).toContain("currency                 TEXT NOT NULL DEFAULT 'USD'");
    expect(sql).not.toMatch(/budget\s+(REAL|DOUBLE|FLOAT|NUMERIC)/);
  });
});
