// Credit organisation.
//
// A title's credit list arrives flat and in billing order. Both the title page
// ("Director, Writers, Stars" above the fold) and the name page ("credits
// grouped by department, newest first") need it reshaped, and the reshaping is
// the part with rules in it — so it lives here rather than inside a component.

import type {
  CreditDepartment,
  PublicNameCredit,
  PublicTitleCredit,
} from "@saas/contracts/catalog";

const DEPARTMENT_LABELS: Record<CreditDepartment, string> = {
  cast: "Cast",
  directing: "Directing",
  writing: "Writing",
  production: "Production",
  camera: "Camera",
  editing: "Editing",
  sound: "Sound",
  music: "Music",
  art: "Art",
  costume_makeup: "Costume & Make-Up",
  visual_effects: "Visual Effects",
  stunts: "Stunts",
  casting: "Casting",
  animation: "Animation",
  additional_crew: "Additional Crew",
  thanks: "Thanks",
};

export function departmentLabel(department: CreditDepartment): string {
  return DEPARTMENT_LABELS[department] ?? "Crew";
}

/**
 * The order a full-credits page reads in. Cast first, then the departments in
 * roughly the order a production is assembled — this is a convention people
 * already know, and inventing a different one would only cost them time.
 */
export const DEPARTMENT_ORDER: CreditDepartment[] = [
  "cast",
  "directing",
  "writing",
  "production",
  "casting",
  "camera",
  "editing",
  "art",
  "costume_makeup",
  "sound",
  "music",
  "visual_effects",
  "stunts",
  "animation",
  "additional_crew",
  "thanks",
];

export interface CreditGroup<T> {
  department: CreditDepartment;
  label: string;
  credits: T[];
}

/**
 * Group flat credits by department in the canonical order, preserving the
 * order within each group (the API already sorted it by billing).
 */
export function groupByDepartment<T extends { department: CreditDepartment }>(
  credits: T[],
): Array<CreditGroup<T>> {
  const buckets = new Map<CreditDepartment, T[]>();
  for (const credit of credits) {
    const bucket = buckets.get(credit.department);
    if (bucket) bucket.push(credit);
    else buckets.set(credit.department, [credit]);
  }

  const ordered = DEPARTMENT_ORDER.filter((d) => buckets.has(d)).map((department) => ({
    department,
    label: departmentLabel(department),
    credits: buckets.get(department)!,
  }));

  // A department the ordering doesn't know about still has to appear —
  // dropping credits because a vocabulary grew is the worse failure.
  const known = new Set(DEPARTMENT_ORDER);
  for (const [department, credits] of buckets) {
    if (!known.has(department)) {
      ordered.push({ department, label: departmentLabel(department), credits });
    }
  }
  return ordered;
}

/**
 * The three lines above the fold on a title page: director, writers, top-billed
 * cast. Every film site opens with these because they are what people use to
 * decide whether they have the right title.
 */
export function headlineCredits(credits: PublicTitleCredit[], starCount = 3) {
  const directors = credits.filter((c) => c.department === "directing");
  const writers = credits.filter((c) => c.department === "writing");
  const stars = credits
    .filter((c) => c.category === "cast")
    .slice()
    // Billing order is the intended reading order; a null billing sorts last
    // rather than to the front.
    .sort((a, b) => (a.billingOrder ?? Number.MAX_SAFE_INTEGER) - (b.billingOrder ?? Number.MAX_SAFE_INTEGER))
    .slice(0, starCount);

  return { directors, writers, stars };
}

/**
 * How a cast credit reads: `Louise Banks`, or `Louise Banks (voice)`, or
 * `Self`. Built here so the same string appears on the title page, the full
 * credits page and the name page.
 */
export function characterLine(credit: {
  characters: string[];
  isVoice: boolean;
  isSelf: boolean;
  isArchiveFootage: boolean;
  isUncredited: boolean;
  job: string;
}): string {
  const base = credit.isSelf
    ? credit.characters.length > 0
      ? `Self — ${credit.characters.join(", ")}`
      : "Self"
    : credit.characters.length > 0
      ? credit.characters.join(" / ")
      : credit.job;

  const notes: string[] = [];
  if (credit.isVoice) notes.push("voice");
  if (credit.isArchiveFootage) notes.push("archive footage");
  if (credit.isUncredited) notes.push("uncredited");
  return notes.length > 0 ? `${base} (${notes.join(", ")})` : base;
}

/** `12 episodes` — only where the number is meaningful. */
export function episodeLine(episodeCount: number | null): string {
  if (!episodeCount || episodeCount <= 0) return "";
  return episodeCount === 1 ? "1 episode" : `${episodeCount} episodes`;
}

/**
 * A person's filmography, newest first, with undated work at the top — an
 * announced project belongs above a finished one, which is how every
 * filmography people already read is ordered.
 */
export function sortCreditsByYear(credits: PublicNameCredit[]): PublicNameCredit[] {
  return credits.slice().sort((a, b) => {
    const ay = a.title.startYear;
    const by = b.title.startYear;
    if (ay === null && by === null) return 0;
    if (ay === null) return -1;
    if (by === null) return 1;
    return by - ay;
  });
}
