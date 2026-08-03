"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Plus, X } from "lucide-react";
import type { CreateNameRequest } from "@saas/contracts/catalog";
import { useSession } from "@/lib/session";
import { useApiQuery } from "@/lib/query";
import { wrap } from "@/lib/api";
import { definedOnly, optionalNumber, optionalText, useEditorialOrg } from "@/lib/studio";
import { Skeleton } from "@/components/ui/skeleton";
import { FormError, TextAreaField, TextField, fieldErrorsFrom, type FieldErrors } from "@/components/studio/fields";
import { ProfessionPicker } from "@/components/studio/profession-picker";

export default function StudioPeoplePage() {
  const router = useRouter();
  const params = useSearchParams();
  const creating = params.get("new") === "1";
  const { client } = useSession();

  const people = useApiQuery(["studio", "people"], () =>
    wrap(async () => (await client.catalog.listNames({ limit: 200 })).names),
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">People</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everyone who can be credited on a title.
          </p>
        </div>
        {creating ? null : (
          <Link
            href="/studio/catalog/people?new=1"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New person
          </Link>
        )}
      </header>

      {creating ? (
        <CreatePersonForm
          onDone={(nameId) => router.push(`/studio/catalog/people/${nameId}`)}
          onCancel={() => router.push("/studio/catalog/people")}
          onCreated={people.reload}
        />
      ) : null}

      {people.loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : people.error ? (
        <FormError error={people.error} />
      ) : (people.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">No people yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {(people.data ?? []).map((person) => (
            <li key={person.id}>
              <Link
                href={`/studio/catalog/people/${person.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{person.name}</span>
                  <span className="block truncate text-xs capitalize text-muted-foreground">
                    {person.professions.map((p) => p.replace(/_/g, " ")).join(", ")}
                  </span>
                </span>
                <code className="hidden shrink-0 text-xs text-muted-foreground lg:inline">
                  {person.id}
                </code>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreatePersonForm({
  onDone,
  onCancel,
  onCreated,
}: {
  onDone: (nameId: string) => void;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const { client } = useSession();
  const { org, loading: orgLoading } = useEditorialOrg();
  const [name, setName] = React.useState("");
  const [professions, setProfessions] = React.useState<string[]>([]);
  const [birthDate, setBirthDate] = React.useState("");
  const [birthPlace, setBirthPlace] = React.useState("");
  const [heightCm, setHeightCm] = React.useState("");
  const [miniBio, setMiniBio] = React.useState("");
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [failure, setFailure] = React.useState<{ code: string; message: string } | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!org) return;
    setSaving(true);
    setErrors({});
    setFailure(null);

    const body = definedOnly({
      name: name.trim(),
      professions,
      birthDate: optionalText(birthDate),
      birthPlace: optionalText(birthPlace),
      heightCm: optionalNumber(heightCm),
      miniBio: optionalText(miniBio),
    }) as CreateNameRequest;

    const result = await wrap(() => client.catalog.createName(org.id, body));
    setSaving(false);
    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.error));
      setFailure({ code: result.error.code, message: result.error.message });
      return;
    }
    onCreated();
    onDone(result.data.name.id);
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">New person</h2>
        <button type="button" onClick={onCancel} aria-label="Cancel" className="rounded p-1 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <FormError error={failure} />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="name" label="Name" required value={name} onChange={setName} errors={errors} />
        <TextField name="birthDate" label="Born" type="date" value={birthDate} onChange={setBirthDate} errors={errors} />
        <TextField name="birthPlace" label="Birthplace" value={birthPlace} onChange={setBirthPlace} errors={errors} />
        <TextField name="heightCm" label="Height (cm)" type="number" value={heightCm} onChange={setHeightCm} errors={errors} />
      </div>

      <ProfessionPicker selected={professions} onChange={setProfessions} />

      <TextAreaField name="miniBio" label="Mini biography" value={miniBio} onChange={setMiniBio} errors={errors} />

      <div className="flex items-center gap-2">
        <button type="submit" disabled={saving || orgLoading || !org || name.trim() === ""} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {saving ? "Creating…" : "Create person"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border px-4 py-2 text-sm font-medium">
          Cancel
        </button>
      </div>
    </form>
  );
}
