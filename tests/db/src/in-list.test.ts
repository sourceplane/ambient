import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { inList } from "@saas/db/hyperdrive";

describe("inList", () => {
  it("expands to scalar placeholders and appends the values", () => {
    const values: unknown[] = [];
    expect(inList(["a", "b", "c"], values)).toBe("$1, $2, $3");
    expect(values).toEqual(["a", "b", "c"]);
  });

  it("continues the numbering from parameters already bound", () => {
    const values: unknown[] = ["user"];
    expect(inList(["x", "y"], values)).toBe("$2, $3");
    expect(values).toEqual(["user", "x", "y"]);
  });

  it("applies a per-placeholder cast", () => {
    const values: unknown[] = [];
    expect(inList(["11111111-1111-1111-1111-111111111111"], values, "uuid")).toBe("$1::uuid");
  });

  it("returns null for an empty list rather than an invalid `IN ()`", () => {
    const values: unknown[] = [];
    expect(inList([], values)).toBeNull();
    expect(values).toEqual([]);
  });
});

/**
 * The repository layer must never bind a JavaScript array as a query parameter.
 *
 * `createSqlExecutor` builds postgres.js with `fetch_types: false`, so the
 * driver cannot resolve an element-type OID for an array and throws at bind
 * time. It is not a query that returns nothing — it is a request that 500s.
 *
 * This has now bitten twice: once on the organization members list (task 0132)
 * and once across the whole catalog, where `GET /v1/titles` returned 503 on
 * stage while `GET /v1/names` — whose query has no array parameter — was fine.
 * A guard is cheaper than a third time.
 */
describe("no repository binds an array parameter", () => {
  // ESM under ts-jest has no `__dirname`; jest runs with cwd at the package
  // root (`tests/db`), so resolve from there — and assert the path exists, or a
  // wrong cwd would silently scan nothing and pass.
  const SRC = join(process.cwd(), "../../packages/db/src");

  function sqlFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        // `hyperdrive` documents the constraint; `migrations` is SQL, not TS.
        if (entry === "hyperdrive" || entry === "migrations") continue;
        out.push(...sqlFiles(path));
      } else if (entry.endsWith(".ts")) {
        out.push(path);
      }
    }
    return out;
  }

  const files = sqlFiles(SRC);

  it("found the repository sources to scan", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.map((f) => [f.slice(SRC.length + 1), f]))(
    "%s uses IN (…) rather than = ANY($n)",
    (_label, path) => {
      const source = readFileSync(path, "utf8");
      // Strip comments so the ones explaining this very rule don't trip it.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
        .join("\n");

      // `ANY(SELECT …)` is a subquery, not an array parameter — that form is
      // safe and is used deliberately for the jsonb facet filters.
      const offenders = [...code.matchAll(/=\s*ANY\(\s*\$\d+/g)];
      expect(offenders.map((m) => m[0])).toEqual([]);
    },
  );
});
