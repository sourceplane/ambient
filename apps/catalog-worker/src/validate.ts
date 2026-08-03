import {
  CREDIT_DEPARTMENTS,
  IMAGE_KINDS,
  PRODUCTION_STATUSES,
  TITLE_KINDS,
  VIDEO_KINDS,
} from "@saas/db/catalog";

export type FieldErrors = Record<string, string[]>;

export class Validator {
  readonly errors: FieldErrors = {};

  private fail(field: string, reason: string): void {
    (this.errors[field] ??= []).push(reason);
  }

  get ok(): boolean {
    return Object.keys(this.errors).length === 0;
  }

  requiredString(field: string, value: unknown, max: number): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      this.fail(field, "Required");
      return "";
    }
    const trimmed = value.trim();
    if (trimmed.length > max) {
      this.fail(field, `Must be at most ${max} characters`);
      return trimmed.slice(0, max);
    }
    return trimmed;
  }

  optionalString(field: string, value: unknown, max: number): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") {
      this.fail(field, "Must be a string");
      return null;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > max) {
      this.fail(field, `Must be at most ${max} characters`);
      return trimmed.slice(0, max);
    }
    return trimmed;
  }

  optionalInt(field: string, value: unknown, min: number, max: number): number | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
      this.fail(field, `Must be an integer between ${min} and ${max}`);
      return null;
    }
    return value;
  }

  optionalBool(field: string, value: unknown): boolean | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "boolean") {
      this.fail(field, "Must be a boolean");
      return undefined;
    }
    return value;
  }

  /** ISO calendar date (`YYYY-MM-DD`), validated for real-calendar existence. */
  optionalDate(field: string, value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      this.fail(field, "Must be an ISO date (YYYY-MM-DD)");
      return null;
    }
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      this.fail(field, "Must be a real calendar date");
      return null;
    }
    return value;
  }

  optionalUrl(field: string, value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") {
      this.fail(field, "Must be a string");
      return null;
    }
    try {
      const url = new URL(value);
      // Only http(s): a `javascript:` or `data:` URL rendered as an image or a
      // link target is an XSS vector, and this value is echoed to browsers.
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        this.fail(field, "Must be an http(s) URL");
        return null;
      }
      return url.toString();
    } catch {
      this.fail(field, "Must be a valid URL");
      return null;
    }
  }

  requiredUrl(field: string, value: unknown): string {
    if (value === undefined || value === null) {
      this.fail(field, "Required");
      return "";
    }
    return this.optionalUrl(field, value) ?? "";
  }

  oneOf<T extends string>(field: string, value: unknown, allowed: readonly T[]): T {
    if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
      this.fail(field, `Must be one of: ${allowed.join(", ")}`);
      return allowed[0]!;
    }
    return value as T;
  }

  optionalOneOf<T extends string>(
    field: string,
    value: unknown,
    allowed: readonly T[],
  ): T | undefined {
    if (value === undefined || value === null) return undefined;
    return this.oneOf(field, value, allowed);
  }

  stringArray(field: string, value: unknown, maxItems: number, maxLength: number): string[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      this.fail(field, "Must be an array of strings");
      return [];
    }
    if (value.length > maxItems) {
      this.fail(field, `Must have at most ${maxItems} entries`);
      return [];
    }
    const out: string[] = [];
    for (const entry of value) {
      if (typeof entry !== "string" || entry.trim().length === 0) {
        this.fail(field, "Entries must be non-empty strings");
        return [];
      }
      if (entry.length > maxLength) {
        this.fail(field, `Entries must be at most ${maxLength} characters`);
        return [];
      }
      out.push(entry.trim());
    }
    return out;
  }
}

export { TITLE_KINDS, PRODUCTION_STATUSES, CREDIT_DEPARTMENTS, IMAGE_KINDS, VIDEO_KINDS };

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}
