import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js middleware – runs at the Vercel edge for every matched route.
 *
 * Protects all API routes except /api/test/* with:
 *   1. Origin / Referer validation (blocks external callers)
 *   2. Per-IP rate limiting (sliding window, 30 req/min per IP; in-memory per edge instance)
 *   3. CORS headers (restricts browser cross-origin access)
 *
 * Protected paths: places, gbp, scan, ai, stripe, proxy-image, geo, health, instagram, public, app-invite.
 * Test routes (/api/test/*) are not matched here; they return 404 in production at the route level.
 */

// ─── Configuration ───────────────────────────────────────────────────────────

/** Allowed origin hostnames (without protocol). */
const ALLOWED_HOSTS = new Set([
  "antistatic.ai",
  "www.antistatic.ai",
  "app.antistatic.ai",
  "localhost",
  "127.0.0.1",
]);

/** Per-IP request limit inside the sliding window (global). */
const PER_IP_LIMIT = 30;
/** Sliding window in ms (1 minute). */
const WINDOW_MS = 60_000;

/**
 * Per-route tighter rate limits for expensive endpoints.
 * Key: path prefix. Value: { limit, windowMs }.
 * These are checked AFTER the global limit passes.
 */
const EXPENSIVE_ROUTE_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  "/api/scan/website":          { limit: 5,  windowMs: 600_000 },  // 5 per 10 min
  "/api/scan/socials/screenshot": { limit: 10, windowMs: 600_000 }, // 10 per 10 min
  "/api/scan/socials":          { limit: 5,  windowMs: 600_000 },  // 5 per 10 min
  "/api/scan/search-visibility":{ limit: 10, windowMs: 600_000 },  // 10 per 10 min
  "/api/ai/analyze":            { limit: 10, windowMs: 600_000 },  // 10 per 10 min
  "/api/places/competitors":    { limit: 10, windowMs: 600_000 },  // 10 per 10 min
  "/api/places/photos":         { limit: 20, windowMs: 600_000 },  // 20 per 10 min
  "/api/places/static-map":     { limit: 15, windowMs: 600_000 },  // 15 per 10 min
  "/api/places/autocomplete":   { limit: 60, windowMs: 600_000 },  // 60 per 10 min (typing)
  "/api/places/photo":          { limit: 30, windowMs: 600_000 },  // 30 per 10 min
  "/api/gbp/extract-socials":   { limit: 5,  windowMs: 600_000 },  // 5 per 10 min
  "/api/gbp/autocomplete":      { limit: 60, windowMs: 600_000 },  // 60 per 10 min (typing)
  "/api/gbp/place-details":     { limit: 20, windowMs: 600_000 },  // 20 per 10 min
  "/api/public/reports/share":  { limit: 10, windowMs: 600_000 },  // 10 shares per 10 min
  "/api/proxy-image":           { limit: 60, windowMs: 600_000 },  // 60 per 10 min
  "/api/instagram/session/manual":  { limit: 3, windowMs: 600_000 }, // 3 per 10 min
  "/api/instagram/session/refresh": { limit: 3, windowMs: 600_000 }, // 3 per 10 min
};

// ─── In-memory per-IP rate limiter (edge-compatible, no imports) ─────────────
// Edge middleware cannot import from lib/, so we inline a lightweight limiter.

interface RLEntry {
  timestamps: number[];
}

const rlBuckets = new Map<string, RLEntry>();
const routeRlBuckets = new Map<string, RLEntry>();
let rlLastCleanup = Date.now();

/** Check per-route rate limit (separate from global). */
function routeRlCheck(key: string, limit: number, windowMs: number): { allowed: boolean } {
  const now = Date.now();
  const cutoff = now - windowMs;
  let entry = routeRlBuckets.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    routeRlBuckets.set(key, entry);
  }
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
  if (entry.timestamps.length >= limit) {
    return { allowed: false };
  }
  entry.timestamps.push(now);
  return { allowed: true };
}

function rlCheck(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  // Periodic cleanup to prevent memory growth
  if (now - rlLastCleanup > WINDOW_MS) {
    rlLastCleanup = now;
    const cutoff = now - WINDOW_MS;
    for (const [key, entry] of rlBuckets) {
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
      if (entry.timestamps.length === 0) rlBuckets.delete(key);
    }
    // Also clean up route-level buckets (use 10 min window for expensive routes)
    const routeCutoff = now - 600_000;
    for (const [key, entry] of routeRlBuckets) {
      entry.timestamps = entry.timestamps.filter((t) => t > routeCutoff);
      if (entry.timestamps.length === 0) routeRlBuckets.delete(key);
    }
  }

  const cutoff = now - WINDOW_MS;
  let entry = rlBuckets.get(ip);
  if (!entry) {
    entry = { timestamps: [] };
    rlBuckets.set(ip, entry);
  }
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= PER_IP_LIMIT) {
    return { allowed: false, remaining: 0 };
  }
  entry.timestamps.push(now);
  return { allowed: true, remaining: PER_IP_LIMIT - entry.timestamps.length };
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

// ─── Origin helpers ──────────────────────────────────────────────────────────

function isAllowedOrigin(req: NextRequest): boolean {
  // Check Origin header first, then Referer
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  // Server-side fetches (e.g. from Vercel functions) may not set Origin/Referer
  if (!origin && !referer) {
    // Allow same-origin SSR / server-side calls (no Origin header)
    // but block if there IS an origin and it's wrong
    return true;
  }

  try {
    const host = origin
      ? new URL(origin).hostname
      : referer
        ? new URL(referer).hostname
        : null;

    if (!host) return true; // no parseable origin

    // Allow exact matches
    if (ALLOWED_HOSTS.has(host)) return true;

    // Allow Vercel preview deployments (*.vercel.app)
    if (host.endsWith(".vercel.app")) return true;

    return false;
  } catch {
    return false;
  }
}

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  let allowOrigin = "";

  try {
    const host = new URL(origin).hostname;
    if (ALLOWED_HOSTS.has(host) || host.endsWith(".vercel.app")) {
      allowOrigin = origin;
    }
  } catch {
    // no valid origin
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin || "https://www.antistatic.ai",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

// ─── Middleware handler ──────────────────────────────────────────────────────

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protect all cost-sensitive and sensitive API routes (test routes are not in matcher)
  const isProtected =
    pathname.startsWith("/api/places/") ||
    pathname.startsWith("/api/gbp/") ||
    pathname.startsWith("/api/scan/") ||
    pathname.startsWith("/api/ai/") ||
    pathname.startsWith("/api/stripe/") ||
    pathname === "/api/proxy-image" ||
    pathname === "/api/geo" ||
    pathname.startsWith("/api/geo/") ||
    pathname.startsWith("/api/health/") ||
    pathname.startsWith("/api/instagram/") ||
    pathname.startsWith("/api/public/") ||
    pathname === "/api/app-invite";

  if (!isProtected) return NextResponse.next();

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
  }

  // Layer 1: Origin validation
  if (!isAllowedOrigin(req)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: corsHeaders(req) }
    );
  }

  // Layer 2: Per-IP rate limiting
  const ip = getIp(req);
  const rl = rlCheck(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          ...corsHeaders(req),
          "Retry-After": "60",
          "X-RateLimit-Limit": String(PER_IP_LIMIT),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  // Layer 3: Per-route rate limiting for expensive endpoints
  for (const [routePrefix, routeConfig] of Object.entries(EXPENSIVE_ROUTE_LIMITS)) {
    if (pathname.startsWith(routePrefix)) {
      const routeKey = `${ip}:${routePrefix}`;
      const routeRl = routeRlCheck(routeKey, routeConfig.limit, routeConfig.windowMs);
      if (!routeRl.allowed) {
        return NextResponse.json(
          { error: `Rate limit exceeded for this endpoint. Max ${routeConfig.limit} requests per ${routeConfig.windowMs / 60_000} min.` },
          {
            status: 429,
            headers: {
              ...corsHeaders(req),
              "Retry-After": String(Math.ceil(routeConfig.windowMs / 1000)),
            },
          }
        );
      }
      break; // Only match the first (most specific) route prefix
    }
  }

  // Attach CORS + rate-limit info to the response
  const response = NextResponse.next();
  const cors = corsHeaders(req);
  for (const [k, v] of Object.entries(cors)) {
    response.headers.set(k, v);
  }
  response.headers.set("X-RateLimit-Limit", String(PER_IP_LIMIT));
  response.headers.set("X-RateLimit-Remaining", String(rl.remaining));

  return response;
}

// ─── Matcher: only run middleware on protected routes ─────────────────────────
// /api/test/* is intentionally excluded; those routes return 404 in production.

export const config = {
  matcher: [
    "/api/places/:path*",
    "/api/gbp/:path*",
    "/api/scan/:path*",
    "/api/ai/:path*",
    "/api/stripe/:path*",
    "/api/proxy-image",
    "/api/geo",
    "/api/geo/:path*",
    "/api/health/:path*",
    "/api/instagram/:path*",
    "/api/public/:path*",
    "/api/app-invite",
  ],
};
