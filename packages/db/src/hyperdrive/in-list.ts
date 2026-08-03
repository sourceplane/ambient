/**
 * Expand a list of values into scalar bind placeholders for an `IN (…)`.
 *
 * **Why this exists.** `createSqlExecutor` constructs postgres.js with
 * `fetch_types: false` — see the note in `executor.ts` about per-request
 * clients. Without the type catalog the driver cannot resolve an element-type
 * OID for a JavaScript array, so binding one to `= ANY($n)` throws at bind
 * time. It is not a query that returns nothing; it is a query that fails.
 *
 * This already cost the platform once: it surfaced as a hard 500 on the
 * organization members list (task 0132), fixed there by hand-rolling a scalar
 * placeholder list. This helper is that fix, named, so the next repository does
 * not have to rediscover it.
 *
 * ```ts
 * const values: unknown[] = [];
 * const clause = inList(statuses, values);        // "$1, $2"
 * `SELECT … WHERE status IN (${clause})`
 * ```
 *
 * `values` is appended in place, so the caller can interleave this with other
 * parameters and the numbering stays correct.
 *
 * Returns `null` for an empty list — an empty `IN ()` is a syntax error, and
 * the caller has to decide whether "none of these" means "match nothing" or
 * "no filter at all". Making that decision here would be guessing.
 */
export function inList(
  items: readonly unknown[],
  values: unknown[],
  cast = "",
): string | null {
  if (items.length === 0) return null;
  const suffix = cast ? `::${cast}` : "";
  return items
    .map((item) => {
      values.push(item);
      return `$${values.length}${suffix}`;
    })
    .join(", ");
}
