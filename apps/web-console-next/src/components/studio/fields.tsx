"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Form primitives for the studio.
 *
 * Curation forms are long and mostly optional, so the useful thing a field can
 * do is stay out of the way and surface the API's own validation. Every field
 * renders its server-side error inline and wires `aria-invalid` +
 * `aria-describedby`, because a 422 that only appears in a toast leaves the
 * operator hunting for which of twenty inputs it meant.
 */
export interface FieldErrors {
  [field: string]: string[] | undefined;
}

function useFieldIds(name: string) {
  const id = React.useId();
  return { inputId: `${id}-${name}`, errorId: `${id}-${name}-error` };
}

function ErrorText({ id, errors }: { id: string; errors: string[] | undefined }) {
  if (!errors || errors.length === 0) return null;
  return (
    <p id={id} className="mt-1 text-xs text-destructive">
      {errors.join(". ")}
    </p>
  );
}

export function TextField({
  name,
  label,
  value,
  onChange,
  errors,
  hint,
  placeholder,
  required,
  type = "text",
  className,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  errors?: FieldErrors;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "date" | "url" | "number";
  className?: string;
}) {
  const { inputId, errorId } = useFieldIds(name);
  const fieldErrors = errors?.[name];
  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </label>
      <input
        id={inputId}
        name={name}
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={fieldErrors ? true : undefined}
        aria-describedby={fieldErrors ? errorId : undefined}
        className={cn(
          "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring",
          fieldErrors && "border-destructive",
        )}
      />
      {hint && !fieldErrors ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      <ErrorText id={errorId} errors={fieldErrors} />
    </div>
  );
}

export function TextAreaField({
  name,
  label,
  value,
  onChange,
  errors,
  hint,
  rows = 4,
  className,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  errors?: FieldErrors;
  hint?: string;
  rows?: number;
  className?: string;
}) {
  const { inputId, errorId } = useFieldIds(name);
  const fieldErrors = errors?.[name];
  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <textarea
        id={inputId}
        name={name}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={fieldErrors ? true : undefined}
        aria-describedby={fieldErrors ? errorId : undefined}
        className={cn(
          "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring",
          fieldErrors && "border-destructive",
        )}
      />
      {hint && !fieldErrors ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      <ErrorText id={errorId} errors={fieldErrors} />
    </div>
  );
}

export function SelectField<T extends string>({
  name,
  label,
  value,
  onChange,
  options,
  errors,
  className,
}: {
  name: string;
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  errors?: FieldErrors;
  className?: string;
}) {
  const { inputId, errorId } = useFieldIds(name);
  const fieldErrors = errors?.[name];
  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <select
        id={inputId}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-invalid={fieldErrors ? true : undefined}
        aria-describedby={fieldErrors ? errorId : undefined}
        className={cn(
          "h-9 w-full rounded-md border bg-background px-2 text-sm outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring",
          fieldErrors && "border-destructive",
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ErrorText id={errorId} errors={fieldErrors} />
    </div>
  );
}

/**
 * The non-field error: a 422 whose details name no field, a 404 that means
 * "you may not do this", a 503. Rendered as an alert so it is announced.
 */
export function FormError({ error }: { error: { code: string; message: string } | null }) {
  if (!error) return null;
  const message =
    error.code === "not_found"
      ? "Not found — or your role doesn't allow this edit."
      : error.message;
  return (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
      {message}
    </div>
  );
}

/**
 * Pull `{ field: [reason] }` out of a validation error.
 *
 * The workers answer 422 with `error.details.fields`, which is exactly the
 * shape the fields want. Anything else returns empty, so a non-validation
 * failure falls through to `FormError` instead of silently marking a field.
 */
export function fieldErrorsFrom(error: unknown): FieldErrors {
  const details = (error as { details?: { fields?: unknown } } | null)?.details;
  const fields = details?.fields;
  if (!fields || typeof fields !== "object") return {};
  const out: FieldErrors = {};
  for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
    if (Array.isArray(value)) out[key] = value.filter((v): v is string => typeof v === "string");
  }
  return out;
}
