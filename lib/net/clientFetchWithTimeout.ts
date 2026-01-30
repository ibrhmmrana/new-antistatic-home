/**
 * Client-side fetch with hard timeout so the UI doesn't spin forever.
 * Use for calls to /api/places/reviews, /api/gbp/place-details, /api/scan/socials/screenshot, etc.
 */
const DEFAULT_TIMEOUT_MS = 20000;

export async function fetchWithTimeoutClient(
  url: string,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const signal = init?.signal ?? controller.signal;
  try {
    const res = await fetch(url, { ...init, signal });
    clearTimeout(timeoutId);
    return res;
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}
