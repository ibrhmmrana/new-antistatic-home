/**
 * Single abstraction for all Instagram API HTTP calls.
 * Routes through Decodo proxy when enabled; supports rotation and sticky sessions.
 * Retries on 429/5xx with backoff; never logs credentials.
 */

import { ProxyAgent, fetch as undiciFetch } from "undici";
import { consumeBody } from "./consumeBody";
import { DecodoProxyManager, type RotationMode } from "@/lib/services/decodo-proxy-manager";

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function isRetryable(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffWithJitter(attempt: number): number {
  const base = 500 * Math.pow(2, attempt);
  const jitter = Math.random() * 500;
  return base + jitter;
}

export interface FetchInstagramOptions {
  /** For sticky sessions (e.g. username or scanId). Same key reuses same proxy in profile mode. */
  stickyKey?: string;
  /** 'request' = new IP per request; 'profile' = same IP for stickyKey until TTL. */
  rotationMode?: RotationMode;
  /** Timeout in ms. Default 30000. */
  timeoutMs?: number;
  /** Safe label for logs (no secrets). */
  logContext?: string;
  /** Max retries (excluding first attempt). Default 3. */
  maxRetries?: number;
}

function isProxyEnabled(): boolean {
  const v = process.env.DECODO_ENABLED ?? process.env.USE_DECODO_PROXY ?? "";
  return v === "true" || v === "1";
}

/**
 * Fetches a URL for Instagram scraping, optionally via Decodo proxy.
 * Use for all instagram.com API calls so rotation and sticky sessions apply.
 * On 429, marks proxy failed and retries with backoff.
 */
export async function fetchInstagram(
  url: string | URL,
  init?: RequestInit,
  options?: FetchInstagramOptions
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? 30000;
  const maxRetries = Math.max(0, options?.maxRetries ?? 3);
  const logContext = options?.logContext ?? "instagram";
  const rotationMode = (options?.rotationMode ?? (process.env.DECODO_ROTATION_MODE as RotationMode) ?? "request") as RotationMode;
  const stickyKey = options?.stickyKey;

  const proxyManager = DecodoProxyManager.getInstance();
  const useProxy = isProxyEnabled() && proxyManager.isConfigured();

  let lastResponse: Awaited<ReturnType<typeof undiciFetch>> | null = null;
  let lastError: unknown = null;
  let proxyUrlUsed: string | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const combinedSignal = controller.signal;
    if (init?.signal) {
      init.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    try {
      let dispatcher: ProxyAgent | undefined;
      if (useProxy) {
        proxyUrlUsed = proxyManager.getProxyForRequest(stickyKey, rotationMode);
        if (proxyUrlUsed) {
          dispatcher = new ProxyAgent(proxyUrlUsed);
        }
      }

      const redacted = proxyUrlUsed ? DecodoProxyManager.redactProxyUrl(proxyUrlUsed) : "direct";
      if (attempt === 0) {
        console.log(
          `[PROXY] ${logContext} → ${rotationMode} mode${stickyKey ? ` (sticky: ${stickyKey})` : ""} endpoint: ${redacted}`
        );
      }

      // Pass only method/headers/redirect/signal to avoid DOM vs undici RequestInit type conflict (e.g. BodyInit)
      const { method, headers, redirect, cache } = init ?? {};
      const res = await undiciFetch(String(url), {
        method: method ?? "GET",
        headers,
        redirect,
        cache,
        signal: combinedSignal,
        dispatcher,
      } as Parameters<typeof undiciFetch>[1]);

      clearTimeout(timeoutId);

      if (res.ok) {
        return res as unknown as Response;
      }

      lastResponse = res;

      if (attempt < maxRetries && isRetryable(res.status)) {
        if (res.status === 429 && proxyUrlUsed) {
          proxyManager.markProxyFailed(proxyUrlUsed);
        }
        await consumeBody(res);
        const backoff = backoffWithJitter(attempt);
        console.log(
          `[PROXY] ${logContext} ${res.status} retry ${attempt + 1}/${maxRetries} in ${Math.round(backoff)}ms`
        );
        await delay(backoff);
        continue;
      }

      return res as unknown as Response;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
      if (proxyUrlUsed) {
        proxyManager.markProxyFailed(proxyUrlUsed);
      }
      const isAbort = err instanceof Error && (err.name === "AbortError" || err.message?.includes("aborted"));
      const isNetwork =
        err instanceof TypeError && (err.message === "Failed to fetch" || err.message === "Load failed");
      if (attempt < maxRetries && (isAbort || isNetwork)) {
        const backoff = backoffWithJitter(attempt);
        console.log(
          `[PROXY] ${logContext} error ${err instanceof Error ? err.message : String(err)} retry ${attempt + 1}/${maxRetries} in ${Math.round(backoff)}ms`
        );
        await delay(backoff);
        continue;
      }
      throw err;
    }
  }

  if (lastResponse) return lastResponse as unknown as Response;
  throw lastError;
}
