"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Plus, X } from "lucide-react";
import type { CreateTitleRequest, TitleKind, ProductionStatus } from "@saas/contracts/catalog";
import { useSession } from "@/lib/session";
import { useApiQuery } from "@/lib/query";
import { wrap } from "@/lib/api";
import {
  PRODUCTION_STATUS_OPTIONS,
  TITLE_KIND_OPTIONS,
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
 * Titles list, plus the create form.
 *
 * The form is on the same route behind `?new=1` rather than at
 * `/titles/new`, so cancelling returns to the list without a history entry
 * that dead-ends, and so a link from the overview can open it directly.
 */
export default function StudioTitlesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const creating = params.get("new") === "1";
  const { client } = useSession();

  const titles = useApiQuery(["studio", "titles"], () =>
    wrap(async () => (await client.catalog.listTitles({ limit: 100 })).titles),
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Titles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything published in the catalog. Drafts are visible here and nowhere else.
          </p>
        </div>
        {creating ? null : (
          <Link
            href="/studio/catalog/titles?new=1"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New title
          </Link>
        )}
      </header>

      {creating ? (
        <CreateTitleForm
          onDone={(titleId) => router.push(`/studio/catalog/titles/${titleId}`)}
          onCancel={() => router.push("/studio/catalog/titles")}
          onCreated={titles.reload}
        />
      ) : null}

      {titles.loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : titles.error ? (
        <FormError error={titles.error} />
      ) : (titles.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">
          No titles yet. Create one, or seed a starter set with{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">node tooling/seed/catalog.mjs</code>.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {(titles.data ?? []).map((title) => (
            <li key={title.id}>
              <Link
                href={`/studio/catalog/titles/${title.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{title.primaryTitle}</span>
                  <span className="block truncate text-xs capitalize text-muted-foreground">
                    {[
                      title.kind.replace(/_/g, " "),
                      title.startYear ? String(title.startYear) : null,
                      title.genres.map((g) => g.name).join(", ") || null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <code className="hidden shrink-0 text-xs text-muted-foreground lg:inline">
                  {title.id}
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

const EMPTY = {
  kind: "movie" as TitleKind,
  primaryTitle: "",
  originalTitle: "",
  startYear: "",
  endYear: "",
  runtimeMinutes: "",
  productionStatus: "released" as ProductionStatus,
  genres: "",
  tagline: "",
  plotOutline: "",
};

function CreateTitleForm({
  onDone,
  onCancel,
  onCreated,
}: {
  onDone: (titleId: string) => void;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const { client } = useSession();
  const { org, loading: orgLoading } = useEditorialOrg();
  const [form, setForm] = React.useState(EMPTY);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [failure, setFailure] = React.useState<{ code: string; message: string } | null>(null);
  const [saving, setSaving] = React.useState(false);

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!org) return;
    setSaving(true);
    setErrors({});
    setFailure(null);

    const body = definedOnly({
      kind: form.kind,
      primaryTitle: form.primaryTitle.trim(),
      originalTitle: optionalText(form.originalTitle),
      startYear: optionalNumber(form.startYear),
      endYear: optionalNumber(form.endYear),
      runtimeMinutes: optionalNumber(form.runtimeMinutes),
      productionStatus: form.productionStatus,
      genres: splitList(form.genres),
      tagline: optionalText(form.tagline),
      plotOutline: optionalText(form.plotOutline),
    }) as CreateTitleRequest;

    const result = await wrap(() => client.catalog.createTitle(org.id, body));
    setSaving(false);
    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.error));
      setFailure({ code: result.error.code, message: result.error.message });
      return;
    }
    onCreated();
    onDone(result.data.title.id);
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">New title</h2>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <FormError error={failure} />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="primaryTitle"
          label="Primary title"
          required
          value={form.primaryTitle}
          onChange={(v) => set("primaryTitle", v)}
          errors={errors}
        />
        <SelectField
          name="kind"
          label="Kind"
          value={form.kind}
          onChange={(v) => set("kind", v)}
          options={TITLE_KIND_OPTIONS}
          errors={errors}
        />
        <TextField
          name="originalTitle"
          label="Original title"
          hint="Only when it differs from the primary title."
          value={form.originalTitle}
          onChange={(v) => set("originalTitle", v)}
          errors={errors}
        />
        <SelectField
          name="productionStatus"
          label="Production status"
          value={form.productionStatus}
          onChange={(v) => set("productionStatus", v)}
          options={PRODUCTION_STATUS_OPTIONS}
          errors={errors}
        />
        <TextField
          name="startYear"
          label="Start year"
          type="number"
          value={form.startYear}
          onChange={(v) => set("startYear", v)}
          errors={errors}
        />
        <TextField
          name="endYear"
          label="End year"
          hint="Series only. Leave blank while it is still running."
          type="number"
          value={form.endYear}
          onChange={(v) => set("endYear", v)}
          errors={errors}
        />
        <TextField
          name="runtimeMinutes"
          label="Runtime (minutes)"
          type="number"
          value={form.runtimeMinutes}
          onChange={(v) => set("runtimeMinutes", v)}
          errors={errors}
        />
        <TextField
          name="genres"
          label="Genres"
          hint="Comma-separated. Slugified on save."
          placeholder="drama, science fiction"
          value={form.genres}
          onChange={(v) => set("genres", v)}
          errors={errors}
        />
      </div>

      <TextField
        name="tagline"
        label="Tagline"
        value={form.tagline}
        onChange={(v) => set("tagline", v)}
        errors={errors}
      />
      <TextAreaField
        name="plotOutline"
        label="Plot outline"
        hint="One or two sentences. The synopsis — the whole plot — is edited after creation."
        value={form.plotOutline}
        onChange={(v) => set("plotOutline", v)}
        errors={errors}
      />

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || orgLoading || !org || form.primaryTitle.trim() === ""}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create title"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border px-4 py-2 text-sm font-medium">
          Cancel
        </button>
      </div>
    </form>
  );
}
