/**
 * Fetch with hard timeout, retries, and body consumption on retry to avoid socket leaks.
 * Uses cache: "no-store" and redirect: "follow".
 * Returns the final Response (does not auto-parse).
 */

import { consumeBody } from "./consumeBody";

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function isRetryable(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && (err.message === "Failed to fetch" || err.message === "Load failed")) return true;
  if (err instanceof Error && (err.name === "AbortError" || err.message?.includes("aborted"))) return true;
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffWithJitter(attempt: number): number {
  const base = 250 * Math.pow(2, attempt);
  const jitter = Math.random() * 150;
  return base + jitter;
}

export interface FetchWithTimeoutOptions extends Omit<RequestInit, "signal"> {
  /** Timeout in ms. Default 12000. */
  timeoutMs?: number;
  /** Number of retries (excluding first attempt). Default 2. */
  retries?: number;
}

export async function fetchWithTimeout(
  url: string | URL,
  init?: FetchWithTimeoutOptions
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? 12000;
  const retries = Math.max(0, init?.retries ?? 2);
  const { timeoutMs: _tm, retries: _r, ...restInit } = init ?? {};

  const baseInit: RequestInit = {
    cache: "no-store",
    redirect: "follow",
    ...restInit,
  };

  let lastError: unknown;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...baseInit,
        signal: baseInit.signal ?? controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        return res;
      }

      lastResponse = res;
      if (attempt < retries && isRetryable(res.status)) {
        await consumeBody(res);
        await delay(backoffWithJitter(attempt));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
      if (attempt < retries && isNetworkError(err)) {
        await delay(backoffWithJitter(attempt));
        continue;
      }
      throw err;
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError;
}
