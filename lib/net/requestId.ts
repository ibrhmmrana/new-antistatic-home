/**
 * Get or generate a request ID for logging and error responses.
 */
export function getRequestId(req: Request): string {
  const id = req.headers.get("x-request-id");
  if (id && id.trim()) return id.trim();
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
