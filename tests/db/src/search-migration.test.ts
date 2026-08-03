import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { manifest, BOUNDED_CONTEXTS } from "@saas/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_ROOT = resolve(__dirname, "../../..", "packages/db/src/migrations");

const ENTRY = manifest.migrations.find((m) => m.id === "240_search_index")!;
const SQL = readFileSync(resolve(MIGRATIONS_ROOT, "240_search_index/up.sql"), "utf-8");

describe("Search migration verification", () => {
  it("registers 'search' as a bounded context", () => {
    expect(BOUNDED_CONTEXTS).toContain("search");
  });

  it("is registered with a matching checksum", () => {
    expect(ENTRY).toBeDefined();
    const content = readFileSync(resolve(MIGRATIONS_ROOT, ENTRY.path));
    expect(ENTRY.checksum).toBe(createHash("sha256").update(content).digest("hex"));
  });

  it("owns only the search schema", () => {
    const schemas = [...SQL.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_]+)\./g)].map((m) => m[1]);
    expect(schemas).toEqual(["search"]);
  });

  it("never reads another bounded context's tables", () => {
    // The whole point of publishing documents rather than querying the catalog:
    // this file must contain no reference to another context's schema.
    for (const ref of ["catalog.", "identity.", "membership.", "projects.", "billing."]) {
      expect(SQL).not.toContain(ref);
    }
  });

  it("is idempotent", () => {
    for (const match of SQL.matchAll(/^CREATE (?:UNIQUE )?(TABLE|INDEX|SCHEMA|EXTENSION)([^;]*)/gm)) {
      expect(match[0]).toContain("IF NOT EXISTS");
    }
  });

  it("generates the tsvector from the columns rather than storing it separately", () => {
    // A generated column cannot drift from the text it summarizes; a
    // trigger-maintained one can.
    expect(SQL).toContain("TSVECTOR GENERATED ALWAYS AS");
    expect(SQL).toContain("STORED");
  });

  it("weights display above secondary above body", () => {
    const a = SQL.indexOf("setweight(to_tsvector('simple', coalesce(display, '')), 'A')");
    const b = SQL.indexOf("setweight(to_tsvector('simple', coalesce(secondary, '')), 'B')");
    const c = SQL.indexOf("setweight(to_tsvector('simple', coalesce(body, '')), 'C')");
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it("creates the trigram extension the typeahead depends on", () => {
    expect(SQL).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    expect(SQL).toContain("USING GIN (display gin_trgm_ops)");
  });

  it("indexes the full-text vector, the facets, and the popularity browse", () => {
    expect(SQL).toContain("USING GIN (document)");
    expect(SQL).toContain("USING GIN (filters jsonb_path_ops)");
    expect(SQL).toContain("(entity_type, popularity DESC, entity_id)");
  });

  it("constrains entity_type to the published vocabulary", () => {
    expect(SQL).toContain("CHECK (entity_type IN ('title', 'person', 'company', 'keyword', 'list'))");
  });

  it("keys documents by (entity_type, entity_id) so a republish overwrites", () => {
    expect(SQL).toContain("PRIMARY KEY (entity_type, entity_id)");
  });
});
