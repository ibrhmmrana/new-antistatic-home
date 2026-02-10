import { NextRequest, NextResponse } from "next/server";
import { apiBudget } from "@/lib/net/apiBudget";

export const maxDuration = 60;

const REDIRECT_STATUSES = [301, 302, 303, 307, 308] as const;
const FETCH_TIMEOUT_MS = 8000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const BODY_PREVIEW_MAX = 500;

function safeMaxw(raw: string | null): string {
  if (raw == null || raw === "") return "1400";
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return "1400";
  if (n > 1600) return "1600";
  return String(n);
}

export async function GET(request: NextRequest) {
  const t0 = Date.now();
  const requestId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `req-${t0}-${Math.random().toString(36).slice(2, 9)}`;

  const searchParams = request.nextUrl.searchParams;
  const ref = searchParams.get("ref") ?? searchParams.get("photo_reference") ?? "";
  const maxw = safeMaxw(searchParams.get("maxw") ?? searchParams.get("maxwidth"));
  const debug = searchParams.get("debug") === "1";

  console.log(`[places/photo] start timestamp=${t0} refLen=${ref.length} maxw=${maxw} requestId=${requestId} debug=${debug}`);

  if (!ref.trim()) {
    return NextResponse.json(
      { error: "ref (photo_reference) is required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("[places/photo] GOOGLE_PLACES_API_KEY is not set");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  // Budget guard: prevent runaway Google Places API costs
  apiBudget.spend("google-places");

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxw}&photo_reference=${encodeURIComponent(ref.trim())}&key=${apiKey}`;
      const urlSafe = url.replace(apiKey, "[REDACTED]");

      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }

      console.log(`[places/photo] before fetch redirect=manual signalTimeoutMs=${FETCH_TIMEOUT_MS} attempt=${attempt + 1} requestId=${requestId}`);

      const response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        next: { revalidate: 3600 * 24 * 7 },
      });

      const timingMs = Date.now() - t0;
      const status = response.status;
      const locationHeader = response.headers.get("location");
      const locationPresent = !!locationHeader;

      console.log(`[places/photo] after fetch status=${status} locationPresent=${locationPresent} requestId=${requestId} ms=${timingMs}`);

      if (REDIRECT_STATUSES.includes(status as (typeof REDIRECT_STATUSES)[number]) && locationHeader) {
        if (debug) {
          return NextResponse.json({
            ok: true,
            upstreamStatus: status,
            locationPresent: true,
            location: locationHeader,
            timingMs,
          });
        }
        const res = NextResponse.redirect(locationHeader, 302);
        res.headers.set(
          "Cache-Control",
          "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800"
        );
        console.log(`[places/photo] redirect 302 requestId=${requestId} ms=${timingMs}`);
        return res;
      }

      const bodyPreview = await response
        .text()
        .then((t) => (t.length > BODY_PREVIEW_MAX ? t.slice(0, BODY_PREVIEW_MAX) + "…" : t))
        .catch(() => "");

      console.log(`[places/photo] upstream no redirect status=${status} locationPresent=${locationPresent} bodyPreviewLen=${bodyPreview.length} requestId=${requestId}`);

      return NextResponse.json(
        {
          ok: false,
          upstreamStatus: status,
          locationPresent: false,
          bodyPreview,
          timingMs: Date.now() - t0,
        },
        { status: 502 }
      );
    } catch (error: unknown) {
      const err = error as { name?: string; message?: string };
      const isAbortError = err?.name === "AbortError";
      const isLastAttempt = attempt === MAX_RETRIES - 1;

      console.log(
        `[places/photo] catch error=${err?.message ?? String(error)} name=${err?.name ?? "unknown"} isAbortError=${isAbortError} attempt=${attempt + 1} requestId=${requestId} ms=${Date.now() - t0}`
      );

      if (debug) {
        return NextResponse.json({
          ok: false,
          error: err?.message ?? String(error),
          errorName: err?.name,
          isAbortError,
          stage: "fetch",
          attempt: attempt + 1,
          timingMs: Date.now() - t0,
        });
      }

      const isNetworkError =
        (err?.message && (String(err.message).includes("fetch failed") || String(err.message).includes("timeout"))) ||
        (err as { code?: string })?.code === "ETIMEDOUT" ||
        isAbortError;

      if (isLastAttempt) {
        console.error(`[places/photo] Failed after ${MAX_RETRIES} attempts:`, err?.message ?? error);
        return NextResponse.json(
          { error: "Failed to fetch place photo after retries" },
          { status: 500 }
        );
      }

      if (isNetworkError) {
        console.warn(`[places/photo] Attempt ${attempt + 1}/${MAX_RETRIES} failed (network/abort), retrying...`);
        continue;
      }

      console.error("[places/photo] Non-retryable error:", error);
      return NextResponse.json(
        { error: "Failed to fetch place photo" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    { error: "Failed to fetch place photo" },
    { status: 500 }
  );
}
