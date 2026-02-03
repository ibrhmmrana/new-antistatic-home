/**
 * Safely consume a Response body to avoid socket leaks.
 * Use before retrying or when discarding a non-ok response.
 * Accepts global Response or undici Response (minimal interface to avoid type conflicts).
 */
export async function consumeBody(res: {
  arrayBuffer(): Promise<ArrayBuffer>;
  body: { cancel(): Promise<void> } | null;
}): Promise<void> {
  try {
    await res.arrayBuffer();
  } catch {
    // ignore
  }
  if (res.body) {
    try {
      await res.body.cancel();
    } catch {
      // ignore
    }
  }
}
