import { NextRequest, NextResponse } from "next/server";
import { getCountryFromRequest } from "@/lib/geo";
import { apiBudget } from "@/lib/net/apiBudget";

/**
 * Places Autocomplete API Route
 * 
 * Implements country-preferred autocomplete:
 * - Detects user's country from request headers (Vercel/Cloudflare)
 * - If country detected: fetches local results first, then global, merges and dedupes
 * - If no country: fetches global results only
 * - Returns predictions with scope: "local" | "global"
 * 
 * Testing:
 * - Local: curl -H "x-vercel-ip-country: ZA" "http://localhost:3000/api/places/autocomplete?input=coffee"
 * - Vercel: Call /api/places/autocomplete?input=coffee (will use actual headers)
 */

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

interface GooglePrediction {
  place_id: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface GoogleResponse {
  predictions: GooglePrediction[];
  status: string;
  error_message?: string;
}

interface NormalizedPrediction {
  place_id: string;
  primary_text: string;
  secondary_text: string;
  scope: "local" | "global";
}

/**
 * Calls Google Places Autocomplete API
 */
async function fetchPlacesAutocomplete(
  input: string,
  country?: string
): Promise<GooglePrediction[]> {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error("GOOGLE_PLACES_API_KEY is not set");
  }

  // Budget guard: prevent runaway Google Places API costs
  apiBudget.spend("google-places");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", input);
  url.searchParams.set("key", GOOGLE_PLACES_API_KEY);
  
  if (country) {
    url.searchParams.set("components", `country:${country}`);
  }

  const response = await fetch(url.toString(), {
    signal: controller.signal,
    headers: {
      "Accept": "application/json",
    },
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`Google Places API error: ${response.status}`);
  }

  const data: GoogleResponse = await response.json();

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.error("Google Places API error:", data.status, data.error_message);
    return [];
  }

  return data.predictions || [];
}

/**
 * Normalizes Google predictions to our format
 */
function normalizePredictions(
  predictions: GooglePrediction[],
  scope: "local" | "global"
): NormalizedPrediction[] {
  return predictions.map((pred) => ({
    place_id: pred.place_id,
    primary_text: pred.structured_formatting.main_text,
    secondary_text: pred.structured_formatting.secondary_text,
    scope,
  }));
}

/**
 * Merges local and global results, deduping by place_id
 * Local results come first, then remaining global results
 */
function mergeResults(
  localResults: NormalizedPrediction[],
  globalResults: NormalizedPrediction[]
): NormalizedPrediction[] {
  const seenPlaceIds = new Set<string>();
  const merged: NormalizedPrediction[] = [];

  // Add local results first
  for (const result of localResults) {
    if (!seenPlaceIds.has(result.place_id)) {
      seenPlaceIds.add(result.place_id);
      merged.push(result);
    }
  }

  // Add global results that weren't already included
  for (const result of globalResults) {
    if (!seenPlaceIds.has(result.place_id)) {
      seenPlaceIds.add(result.place_id);
      merged.push(result);
    }
  }

  return merged;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const input = searchParams.get("input");

  // Validate input
  if (!input || input.length < 2) {
    return NextResponse.json({ predictions: [] });
  }

  if (input.length > 120) {
    return NextResponse.json({ predictions: [] });
  }

  if (!GOOGLE_PLACES_API_KEY) {
    console.error("GOOGLE_PLACES_API_KEY is not set");
    return NextResponse.json({ predictions: [] });
  }

  // Detect country from request headers
  const { country } = getCountryFromRequest(request);

  try {
    let predictions: NormalizedPrediction[] = [];

    if (country !== "XX") {
      // Country detected: fetch local first, then global
      const [localRaw, globalRaw] = await Promise.all([
        fetchPlacesAutocomplete(input, country).catch((err) => {
          console.error("Error fetching local results:", err);
          return [];
        }),
        fetchPlacesAutocomplete(input).catch((err) => {
          console.error("Error fetching global results:", err);
          return [];
        }),
      ]);

      const localResults = normalizePredictions(localRaw, "local");
      const globalResults = normalizePredictions(globalRaw, "global");
      predictions = mergeResults(localResults, globalResults);
    } else {
      // No country detected: fetch global only
      const globalRaw = await fetchPlacesAutocomplete(input);
      predictions = normalizePredictions(globalRaw, "global");
    }

    // Build response with Vary headers to prevent caching mixups
    const response = NextResponse.json({ predictions });
    response.headers.set("Vary", "CF-IPCountry, x-vercel-ip-country");
    
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("Google Places API request timeout");
    } else {
      console.error("Error calling Google Places API:", error);
    }
    return NextResponse.json({ predictions: [] });
  }
}


