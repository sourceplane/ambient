"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import type { CreateNameRequest } from "@saas/contracts/catalog";
import { useSession } from "@/lib/session";
import { useApiQuery } from "@/lib/query";
import { wrap } from "@/lib/api";
import { optionalNumber, optionalText, useEditorialOrg } from "@/lib/studio";
import { Skeleton } from "@/components/ui/skeleton";
import { FormError, TextAreaField, TextField, fieldErrorsFrom, type FieldErrors } from "@/components/studio/fields";
import { ProfessionPicker } from "@/components/studio/profession-picker";

export default function StudioPersonEditPage() {
  const { nameId } = useParams<{ nameId: string }>();
  const { client } = useSession();

  const person = useApiQuery(["studio", "person", nameId], () =>
    wrap(async () => (await client.catalog.getName(nameId)).name),
  );

  if (person.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (person.error || !person.data) {
    return <FormError error={person.error ?? { code: "not_found", message: "Not found" }} />;
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{person.data.name}</h1>
          <code className="text-xs text-muted-foreground">{person.data.id}</code>
        </div>
        <Link
          href={`/name/${person.data.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          View on site
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </header>

      <PersonRecordForm nameId={nameId} initial={person.data} onSaved={person.reload} />
      <ArchiveSection nameId={nameId} name={person.data.name} />
    </div>
  );
}

function PersonRecordForm({
  nameId,
  initial,
  onSaved,
}: {
  nameId: string;
  initial: {
    name: string;
    professions: string[];
    birthDate: string | null;
    birthPlace: string | null;
    deathDate: string | null;
    deathPlace: string | null;
    deathCause: string | null;
    heightCm: number | null;
    miniBio: string | null;
    bioAuthor: string | null;
  };
  onSaved: () => void;
}) {
  const { client } = useSession();
  const { org } = useEditorialOrg();
  const [form, setForm] = React.useState({
    name: initial.name,
    birthDate: initial.birthDate ?? "",
    birthPlace: initial.birthPlace ?? "",
    deathDate: initial.deathDate ?? "",
    deathPlace: initial.deathPlace ?? "",
    deathCause: initial.deathCause ?? "",
    heightCm: initial.heightCm === null ? "" : String(initial.heightCm),
    miniBio: initial.miniBio ?? "",
    bioAuthor: initial.bioAuthor ?? "",
  });
  const [professions, setProfessions] = React.useState<string[]>(initial.professions);
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

    // Cleared fields go as `null` — PATCH reads key presence as intent, so
    // omitting them would make "remove this date of death" impossible.
    const body: Partial<CreateNameRequest> = {
      name: form.name.trim(),
      professions,
      birthDate: optionalText(form.birthDate) ?? null,
      birthPlace: optionalText(form.birthPlace) ?? null,
      deathDate: optionalText(form.deathDate) ?? null,
      deathPlace: optionalText(form.deathPlace) ?? null,
      deathCause: optionalText(form.deathCause) ?? null,
      heightCm: optionalNumber(form.heightCm) ?? null,
      miniBio: optionalText(form.miniBio) ?? null,
      bioAuthor: optionalText(form.bioAuthor) ?? null,
    };

    const result = await wrap(() => client.catalog.updateName(org.id, nameId, body));
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
        <TextField name="name" label="Name" required value={form.name} onChange={(v) => set("name", v)} errors={errors} />
        <TextField name="heightCm" label="Height (cm)" type="number" value={form.heightCm} onChange={(v) => set("heightCm", v)} errors={errors} />
        <TextField name="birthDate" label="Born" type="date" value={form.birthDate} onChange={(v) => set("birthDate", v)} errors={errors} />
        <TextField name="birthPlace" label="Birthplace" value={form.birthPlace} onChange={(v) => set("birthPlace", v)} errors={errors} />
        <TextField name="deathDate" label="Died" type="date" value={form.deathDate} onChange={(v) => set("deathDate", v)} errors={errors} />
        <TextField name="deathPlace" label="Place of death" value={form.deathPlace} onChange={(v) => set("deathPlace", v)} errors={errors} />
        <TextField name="deathCause" label="Cause of death" value={form.deathCause} onChange={(v) => set("deathCause", v)} errors={errors} />
        <TextField name="bioAuthor" label="Biography author" value={form.bioAuthor} onChange={(v) => set("bioAuthor", v)} errors={errors} />
      </div>

      <ProfessionPicker
        selected={professions}
        onChange={(next) => {
          setProfessions(next);
          setSaved(false);
        }}
      />

      <TextAreaField name="miniBio" label="Mini biography" rows={6} value={form.miniBio} onChange={(v) => set("miniBio", v)} errors={errors} />

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving || !org} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {saving ? "Saving…" : "Save record"}
        </button>
        {saved ? <span className="text-sm text-muted-foreground">Saved.</span> : null}
      </div>
    </form>
  );
}

function ArchiveSection({ nameId, name }: { nameId: string; name: string }) {
  const router = useRouter();
  const { client } = useSession();
  const { org } = useEditorialOrg();
  const [confirming, setConfirming] = React.useState(false);
  const [failure, setFailure] = React.useState<{ code: string; message: string } | null>(null);

  async function archive() {
    if (!org) return;
    const result = await wrap(() => client.catalog.archiveName(org.id, nameId));
    if (!result.ok) {
      setFailure({ code: result.error.code, message: result.error.message });
      return;
    }
    router.push("/studio/catalog/people");
  }

  return (
    <section className="space-y-3 rounded-lg border border-destructive/30 p-4">
      <h2 className="text-base font-semibold">Archive</h2>
      <p className="text-sm text-muted-foreground">
        Archiving removes {name} from the public site and from search. Existing credits are kept.
      </p>
      <FormError error={failure} />
      {confirming ? (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void archive()} className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground">
            Yes, archive them
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="rounded-md border px-4 py-2 text-sm font-medium">
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="rounded-md border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive">
          Archive person
        </button>
      )}
    </section>
  );
}
