import { NextRequest } from "next/server";

/** Headers-like object (NextRequest.headers or ReadonlyHeaders from next/headers) */
type HeadersLike = { get(name: string): string | null };

/**
 * Detects the user's country code from headers.
 * Priority: cf-ipcountry (Cloudflare) → x-vercel-ip-country (Vercel) → "XX".
 */
export function getCountryFromHeaders(headers: HeadersLike): {
  country: string;
  sourceHeader: string | null;
} {
  const cfCountry = headers.get("cf-ipcountry");
  if (cfCountry && cfCountry !== "XX" && cfCountry.length === 2) {
    return { country: cfCountry.toUpperCase(), sourceHeader: "cf-ipcountry" };
  }
  const vercelCountry = headers.get("x-vercel-ip-country");
  if (vercelCountry && vercelCountry !== "XX" && vercelCountry.length === 2) {
    return { country: vercelCountry.toUpperCase(), sourceHeader: "x-vercel-ip-country" };
  }
  return { country: "XX", sourceHeader: null };
}

/**
 * Detects the user's country code from request headers (for route handlers).
 */
export function getCountryFromRequest(request: NextRequest): {
  country: string;
  sourceHeader: string | null;
} {
  return getCountryFromHeaders(request.headers);
}
