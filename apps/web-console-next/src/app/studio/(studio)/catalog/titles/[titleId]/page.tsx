"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowUpRight, Trash2 } from "lucide-react";
import type {
  CreateCreditRequest,
  CreateTitleRequest,
  CreditDepartment,
  ProductionStatus,
  TitleKind,
} from "@saas/contracts/catalog";
import { useSession } from "@/lib/session";
import { useApiQuery } from "@/lib/query";
import { wrap } from "@/lib/api";
import {
  CREDIT_DEPARTMENT_OPTIONS,
  PRODUCTION_STATUS_OPTIONS,
  TITLE_KIND_OPTIONS,
  categoryForDepartment,
  definedOnly,
  optionalNumber,
  optionalText,
  splitList,
  useEditorialOrg,
} from "@/lib/studio";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FormError,
  SelectField,
  TextAreaField,
  TextField,
  fieldErrorsFrom,
  type FieldErrors,
} from "@/components/studio/fields";

/**
 * Edit one title: its record, its credits, its images.
 *
 * Three independent forms rather than one giant save, because they are three
 * different API calls with three different permissions
 * (`catalog.title.write`, `catalog.credit.write`, `catalog.media.write`). A
 * single Save button would either lie about what it did or fail wholesale when
 * one of the three was denied.
 */
export default function StudioTitleEditPage() {
  const { titleId } = useParams<{ titleId: string }>();
  const { client } = useSession();

  const title = useApiQuery(["studio", "title", titleId], () =>
    wrap(async () => (await client.catalog.getTitle(titleId)).title),
  );

  if (title.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (title.error || !title.data) {
    return <FormError error={title.error ?? { code: "not_found", message: "Not found" }} />;
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {title.data.primaryTitle}
          </h1>
          <code className="text-xs text-muted-foreground">{title.data.id}</code>
        </div>
        <Link
          href={`/title/${title.data.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          View on site
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </header>

      <TitleRecordForm titleId={titleId} initial={title.data} onSaved={title.reload} />
      <CreditsSection titleId={titleId} />
      <ImagesSection titleId={titleId} />
      <ArchiveSection titleId={titleId} name={title.data.primaryTitle} />
    </div>
  );
}

function TitleRecordForm({
  titleId,
  initial,
  onSaved,
}: {
  titleId: string;
  initial: {
    kind: TitleKind;
    primaryTitle: string;
    originalTitle: string | null;
    startYear: number | null;
    endYear: number | null;
    runtimeMinutes: number | null;
    productionStatus: ProductionStatus;
    tagline: string | null;
    plotOutline: string | null;
    plotSummary: string | null;
    synopsis: string | null;
    genres: Array<{ slug: string; name: string }>;
  };
  onSaved: () => void;
}) {
  const { client } = useSession();
  const { org } = useEditorialOrg();
  const [form, setForm] = React.useState({
    kind: initial.kind,
    primaryTitle: initial.primaryTitle,
    originalTitle: initial.originalTitle ?? "",
    startYear: initial.startYear === null ? "" : String(initial.startYear),
    endYear: initial.endYear === null ? "" : String(initial.endYear),
    runtimeMinutes: initial.runtimeMinutes === null ? "" : String(initial.runtimeMinutes),
    productionStatus: initial.productionStatus,
    genres: initial.genres.map((g) => g.name).join(", "),
    tagline: initial.tagline ?? "",
    plotOutline: initial.plotOutline ?? "",
    plotSummary: initial.plotSummary ?? "",
    synopsis: initial.synopsis ?? "",
  });
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [failure, setFailure] = React.useState<{ code: string; message: string } | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!org) return;
    setSaving(true);
    setErrors({});
    setFailure(null);

    // PATCH treats key presence as intent, so a field the operator cleared has
    // to be sent as `null`, not omitted — omitting it would silently keep the
    // old value and make "clear this tagline" impossible.
    const body: Partial<CreateTitleRequest> = {
      kind: form.kind,
      primaryTitle: form.primaryTitle.trim(),
      originalTitle: optionalText(form.originalTitle) ?? null,
      startYear: optionalNumber(form.startYear) ?? null,
      endYear: optionalNumber(form.endYear) ?? null,
      runtimeMinutes: optionalNumber(form.runtimeMinutes) ?? null,
      productionStatus: form.productionStatus,
      genres: splitList(form.genres),
      tagline: optionalText(form.tagline) ?? null,
      plotOutline: optionalText(form.plotOutline) ?? null,
      plotSummary: optionalText(form.plotSummary) ?? null,
      synopsis: optionalText(form.synopsis) ?? null,
    };

    const result = await wrap(() => client.catalog.updateTitle(org.id, titleId, body));
    setSaving(false);
    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.error));
      setFailure({ code: result.error.code, message: result.error.message });
      return;
    }
    setSaved(true);
    onSaved();
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border p-4">
      <h2 className="text-base font-semibold">Record</h2>
      <FormError error={failure} />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="primaryTitle" label="Primary title" required value={form.primaryTitle} onChange={(v) => set("primaryTitle", v)} errors={errors} />
        <SelectField name="kind" label="Kind" value={form.kind} onChange={(v) => set("kind", v)} options={TITLE_KIND_OPTIONS} errors={errors} />
        <TextField name="originalTitle" label="Original title" value={form.originalTitle} onChange={(v) => set("originalTitle", v)} errors={errors} />
        <SelectField name="productionStatus" label="Production status" value={form.productionStatus} onChange={(v) => set("productionStatus", v)} options={PRODUCTION_STATUS_OPTIONS} errors={errors} />
        <TextField name="startYear" label="Start year" type="number" value={form.startYear} onChange={(v) => set("startYear", v)} errors={errors} />
        <TextField name="endYear" label="End year" type="number" value={form.endYear} onChange={(v) => set("endYear", v)} errors={errors} />
        <TextField name="runtimeMinutes" label="Runtime (minutes)" type="number" value={form.runtimeMinutes} onChange={(v) => set("runtimeMinutes", v)} errors={errors} />
        <TextField name="genres" label="Genres" hint="Comma-separated." value={form.genres} onChange={(v) => set("genres", v)} errors={errors} />
      </div>

      <TextField name="tagline" label="Tagline" value={form.tagline} onChange={(v) => set("tagline", v)} errors={errors} />
      <TextAreaField name="plotOutline" label="Plot outline" hint="Shown in the hero and on every poster card." value={form.plotOutline} onChange={(v) => set("plotOutline", v)} errors={errors} />
      <TextAreaField name="plotSummary" label="Plot summary" value={form.plotSummary} onChange={(v) => set("plotSummary", v)} errors={errors} />
      <TextAreaField name="synopsis" label="Synopsis" hint="The whole plot. The site veils this behind a spoiler reveal." value={form.synopsis} onChange={(v) => set("synopsis", v)} errors={errors} rows={6} />

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving || !org} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {saving ? "Saving…" : "Save record"}
        </button>
        {saved ? <span className="text-sm text-muted-foreground">Saved.</span> : null}
      </div>
    </form>
  );
}

function CreditsSection({ titleId }: { titleId: string }) {
  const { client } = useSession();
  const { org } = useEditorialOrg();
  const credits = useApiQuery(["studio", "credits", titleId], () =>
    wrap(async () => (await client.catalog.listTitleCredits(titleId, { limit: 200 })).credits),
  );
  const people = useApiQuery(["studio", "people-picker"], () =>
    wrap(async () => (await client.catalog.listNames({ limit: 200 })).names),
  );

  const [nameId, setNameId] = React.useState("");
  const [department, setDepartment] = React.useState<CreditDepartment>("cast");
  const [job, setJob] = React.useState("");
  const [characters, setCharacters] = React.useState("");
  const [billingOrder, setBillingOrder] = React.useState("");
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [failure, setFailure] = React.useState<{ code: string; message: string } | null>(null);
  const [saving, setSaving] = React.useState(false);

  const peopleOptions = React.useMemo(
    () => [
      { value: "", label: "Select a person…" },
      ...(people.data ?? []).map((p) => ({ value: p.id, label: p.name })),
    ],
    [people.data],
  );

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!org || !nameId) return;
    setSaving(true);
    setErrors({});
    setFailure(null);

    const body = definedOnly({
      nameId,
      category: categoryForDepartment(department),
      department,
      job: job.trim() || (department === "cast" ? "Actor" : "Crew"),
      characters: department === "cast" ? splitList(characters) : [],
      billingOrder: optionalNumber(billingOrder),
    }) as CreateCreditRequest;

    const result = await wrap(() => client.catalog.createCredit(org.id, titleId, body));
    setSaving(false);
    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.error));
      setFailure({ code: result.error.code, message: result.error.message });
      return;
    }
    setNameId("");
    setJob("");
    setCharacters("");
    setBillingOrder("");
    credits.reload();
  }

  async function remove(creditId: string) {
    if (!org) return;
    const result = await wrap(() => client.catalog.deleteCredit(org.id, creditId));
    if (!result.ok) setFailure({ code: result.error.code, message: result.error.message });
    credits.reload();
  }

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <h2 className="text-base font-semibold">
        Credits
        {credits.data ? (
          <span className="ml-2 text-sm font-normal text-muted-foreground">{credits.data.length}</span>
        ) : null}
      </h2>

      <FormError error={failure} />

      {people.data && people.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No people in the catalog yet —{" "}
          <Link href="/studio/catalog/people?new=1" className="text-primary hover:underline">
            create one
          </Link>{" "}
          before adding credits.
        </p>
      ) : (
        <form onSubmit={add} className="space-y-3">
          {/* Labels stay on one line because no field in the row carries a hint
              below it — a hint on one column makes that column taller and drags
              its neighbours out of alignment. Hints live in placeholders here. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SelectField name="nameId" label="Person" value={nameId} onChange={setNameId} options={peopleOptions} errors={errors} />
            <SelectField name="department" label="Department" value={department} onChange={setDepartment} options={CREDIT_DEPARTMENT_OPTIONS} errors={errors} />
            <TextField name="job" label="Job" placeholder={department === "cast" ? "Actor" : "Director"} value={job} onChange={setJob} errors={errors} />
            {department === "cast" ? (
              <TextField name="characters" label="Characters" placeholder="Louise Banks, Ian Donnelly" value={characters} onChange={setCharacters} errors={errors} />
            ) : (
              <div className="hidden lg:block" />
            )}
            <TextField name="billingOrder" label="Billing order" type="number" placeholder="1" value={billingOrder} onChange={setBillingOrder} errors={errors} />
          </div>
          <button type="submit" disabled={saving || !nameId || !org} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {saving ? "Adding…" : "Add credit"}
          </button>
        </form>
      )}

      {credits.loading ? (
        <Skeleton className="h-24" />
      ) : (credits.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">No credits yet.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {(credits.data ?? []).map((credit) => (
            <li key={credit.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{credit.name.name}</span>
                <span className="block truncate text-xs capitalize text-muted-foreground">
                  {[
                    credit.department.replace(/_/g, " "),
                    credit.characters.length > 0 ? credit.characters.join(" / ") : credit.job,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void remove(credit.id)}
                aria-label={`Remove ${credit.name.name}`}
                className="rounded p-1.5 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ImagesSection({ titleId }: { titleId: string }) {
  const { client } = useSession();
  const { org } = useEditorialOrg();
  const images = useApiQuery(["studio", "images", titleId], () =>
    wrap(async () => (await client.catalog.listTitleImages(titleId, { limit: 50 })).images),
  );

  const [url, setUrl] = React.useState("");
  const [kind, setKind] = React.useState<"poster" | "backdrop" | "still">("poster");
  const [width, setWidth] = React.useState("");
  const [height, setHeight] = React.useState("");
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [failure, setFailure] = React.useState<{ code: string; message: string } | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!org) return;
    setSaving(true);
    setErrors({});
    setFailure(null);

    const result = await wrap(() =>
      client.catalog.createTitleImage(org.id, titleId, {
        url: url.trim(),
        kind,
        width: optionalNumber(width) ?? 0,
        height: optionalNumber(height) ?? 0,
        isPrimary: kind === "poster",
      }),
    );
    setSaving(false);
    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.error));
      setFailure({ code: result.error.code, message: result.error.message });
      return;
    }
    setUrl("");
    setWidth("");
    setHeight("");
    images.reload();
  }

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <h2 className="text-base font-semibold">Images</h2>
      <p className="text-sm text-muted-foreground">
        The API requires a real <code className="rounded bg-muted px-1 text-xs">http(s)</code> URL —
        it will not accept a data URI. Point at a host you control.
      </p>

      <FormError error={failure} />

      <form onSubmit={add} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <TextField name="url" label="Image URL" type="url" placeholder="https://…" value={url} onChange={setUrl} errors={errors} className="lg:col-span-2" />
          <SelectField
            name="kind"
            label="Kind"
            value={kind}
            onChange={setKind}
            options={[
              { value: "poster", label: "Poster (2:3)" },
              { value: "backdrop", label: "Backdrop (16:9)" },
              { value: "still", label: "Still" },
            ]}
            errors={errors}
          />
          <TextField name="width" label="Width" type="number" value={width} onChange={setWidth} errors={errors} />
          <TextField name="height" label="Height" type="number" value={height} onChange={setHeight} errors={errors} />
        </div>
        <button type="submit" disabled={saving || !url.trim() || !org} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {saving ? "Adding…" : "Add image"}
        </button>
      </form>

      {images.loading ? (
        <Skeleton className="h-24" />
      ) : (images.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">No images yet — the site renders its poster fallback.</p>
      ) : (
        <ul className="flex flex-wrap gap-3">
          {(images.data ?? []).map((image) => (
            <li key={image.id} className="w-24">
              {/* Plain <img>: this app has no image optimizer behind it (see
                  components/site/site-image.tsx) and these are operator
                  thumbnails, not page content. */}
              <img src={image.url} alt={image.caption ?? ""} className="w-full rounded border object-cover" />
              <p className="mt-1 truncate text-xs capitalize text-muted-foreground">{image.kind}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ArchiveSection({ titleId, name }: { titleId: string; name: string }) {
  const router = useRouter();
  const { client } = useSession();
  const { org } = useEditorialOrg();
  const [confirming, setConfirming] = React.useState(false);
  const [failure, setFailure] = React.useState<{ code: string; message: string } | null>(null);

  async function archive() {
    if (!org) return;
    const result = await wrap(() => client.catalog.archiveTitle(org.id, titleId));
    if (!result.ok) {
      setFailure({ code: result.error.code, message: result.error.message });
      return;
    }
    router.push("/studio/catalog/titles");
  }

  return (
    <section className="space-y-3 rounded-lg border border-destructive/30 p-4">
      <h2 className="text-base font-semibold">Archive</h2>
      <p className="text-sm text-muted-foreground">
        Archiving removes {name} from the public site and from search. Credits and ratings that
        reference it are kept — this is not a delete.
      </p>
      <FormError error={failure} />
      {confirming ? (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void archive()} className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground">
            Yes, archive it
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="rounded-md border px-4 py-2 text-sm font-medium">
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="rounded-md border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive">
          Archive title
        </button>
      )}
    </section>
  );
}
