import { NextRequest, NextResponse } from "next/server";
import { getCountryFromRequest } from "@/lib/geo";

/**
 * GET /api/geo/country
 * Returns the user's country code from request headers (Cloudflare/Vercel).
 * Used for country-specific pricing on landing and report paywall.
 */
export async function GET(request: NextRequest) {
  const { country } = getCountryFromRequest(request);
  return NextResponse.json({ country });
}
