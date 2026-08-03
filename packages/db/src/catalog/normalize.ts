/**
 * Normalization used when writing catalog rows. Sort keys are computed once on
 * write rather than in every ORDER BY: an index on `sort_title` is only useful
 * if the column already holds the collation-ready form.
 */

/** Leading articles stripped from a sort title, by language. */
const LEADING_ARTICLES = [
  "the",
  "a",
  "an",
  "le",
  "la",
  "les",
  "der",
  "die",
  "das",
  "ein",
  "eine",
  "el",
  "los",
  "las",
  "un",
  "una",
  "il",
  "lo",
  "gli",
  "de",
  "het",
  "een",
  "os",
  "as",
];

/** Name particles that stay attached to the surname ("van Gogh", "De Niro"). */
const SURNAME_PARTICLES = [
  "van",
  "von",
  "de",
  "del",
  "della",
  "di",
  "da",
  "dos",
  "das",
  "du",
  "la",
  "le",
  "ter",
  "ten",
  "af",
  "av",
  "bin",
  "ibn",
  "al",
  "mac",
  "mc",
  "st",
];

/** Generational suffixes that must not be mistaken for the surname. */
const NAME_SUFFIXES = ["jr", "jr.", "sr", "sr.", "i", "ii", "iii", "iv", "v"];

function fold(value: string): string {
  // Strip diacritics so "Amélie" and "Amelie" sort together, then case-fold.
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Sort key for a title: diacritics folded, leading article moved out, and
 * punctuation collapsed. `The Godfather` → `godfather`.
 */
export function sortTitleFor(primaryTitle: string): string {
  const folded = fold(primaryTitle)
    .replace(/[^\p{L}\p{N}\s'’-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const [first, ...rest] = folded.split(/\s+/);
  if (first && rest.length > 0 && LEADING_ARTICLES.includes(first)) {
    return rest.join(" ");
  }
  // Elided articles ("L'Avventura") attach to the next word without a space.
  const elided = folded.match(/^(l|d|dell|nell)['’](.+)$/u);
  if (elided) return elided[2]!.trim();
  return folded;
}

/**
 * Sort key for a person: `surname, forenames`, diacritics folded. Particles
 * stay with the surname and generational suffixes are ignored when picking it.
 * `Robert De Niro` → `de niro, robert`.
 */
export function sortNameFor(name: string): string {
  const folded = fold(name)
    .replace(/[^\p{L}\p{N}\s'’.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = folded.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return folded;

  let end = parts.length - 1;
  // Walk past trailing suffixes so "Robert Downey Jr." keys on "downey".
  while (end > 0 && NAME_SUFFIXES.includes(parts[end]!)) end -= 1;

  let start = end;
  while (start > 0 && SURNAME_PARTICLES.includes(parts[start - 1]!)) start -= 1;

  const surname = parts.slice(start, end + 1).join(" ");
  const forenames = parts.slice(0, start).join(" ");
  const suffix = parts.slice(end + 1).join(" ");
  const tail = [forenames, suffix].filter(Boolean).join(" ");
  return tail ? `${surname}, ${tail}` : surname;
}

/** URL-safe slug for genres, keywords and companies. */
export function slugify(value: string): string {
  return fold(value)
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
