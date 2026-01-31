/**
 * Strip base64 / data URLs from payloads before persisting to DB.
 * Replaces with null so structure is preserved; avoids storing binary in DB.
 */

const DATA_IMAGE_PREFIX = "data:image/";

function isDataImageUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(DATA_IMAGE_PREFIX);
}

export function sanitizeForDb(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (isDataImageUrl(obj)) {
    return null;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForDb);
  }
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = sanitizeForDb(v);
    }
    return out;
  }
  return obj;
}
