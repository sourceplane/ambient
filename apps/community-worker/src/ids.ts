import { hexToUuid, uuidFromPublicId, uuidToHex, type Uuid } from "@saas/db/ids";

/**
 * Public ids follow the platform convention (`<prefix>_<32 hex>`) so the same
 * decode helpers work everywhere. The catalog's prefixes echo the shorthand the
 * domain already uses: `tt` for titles, `nm` for names.
 */
export const TITLE_PREFIX = "tt";
export const NAME_PREFIX = "nm";
export const COMPANY_PREFIX = "co";
export const IMAGE_PREFIX = "rm";
export const VIDEO_PREFIX = "vi";
export const CREDIT_PREFIX = "cr";

export function generateRequestId(): string {
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  let hex = "";
  for (let i = 0; i < buf.length; i++) {
    hex += buf[i]!.toString(16).padStart(2, "0");
  }
  return `req_${hex}`;
}

export function newUuid(): Uuid {
  return crypto.randomUUID() as Uuid;
}

export function titlePublicId(uuid: string): string {
  return `${TITLE_PREFIX}_${uuidToHex(uuid)}`;
}

export function parseTitlePublicId(publicId: string): Uuid | null {
  return uuidFromPublicId(publicId, TITLE_PREFIX);
}

export function namePublicId(uuid: string): string {
  return `${NAME_PREFIX}_${uuidToHex(uuid)}`;
}

export function parseNamePublicId(publicId: string): Uuid | null {
  return uuidFromPublicId(publicId, NAME_PREFIX);
}

export function companyPublicId(uuid: string): string {
  return `${COMPANY_PREFIX}_${uuidToHex(uuid)}`;
}

export function parseCompanyPublicId(publicId: string): Uuid | null {
  return uuidFromPublicId(publicId, COMPANY_PREFIX);
}

export function imagePublicId(uuid: string): string {
  return `${IMAGE_PREFIX}_${uuidToHex(uuid)}`;
}

export function parseImagePublicId(publicId: string): Uuid | null {
  return uuidFromPublicId(publicId, IMAGE_PREFIX);
}

export function videoPublicId(uuid: string): string {
  return `${VIDEO_PREFIX}_${uuidToHex(uuid)}`;
}

export function parseVideoPublicId(publicId: string): Uuid | null {
  return uuidFromPublicId(publicId, VIDEO_PREFIX);
}

export function creditPublicId(uuid: string): string {
  return `${CREDIT_PREFIX}_${uuidToHex(uuid)}`;
}

export function parseCreditPublicId(publicId: string): Uuid | null {
  return uuidFromPublicId(publicId, CREDIT_PREFIX);
}

/** Organizations are minted elsewhere; the catalog only ever decodes them. */
export function parseOrgPublicId(publicId: string): Uuid | null {
  return uuidFromPublicId(publicId, "org");
}

export { hexToUuid };
