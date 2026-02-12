import { NextRequest, NextResponse } from "next/server";
import { getCountryFromRequest } from "@/lib/geo";
import { apiBudget } from "@/lib/net/apiBudget";

/**
 * Places Autocomplete API Route
 *
 * Uses Places API (New) v1 places:autocomplete.
 * For now we do not include service-area businesses (includePureServiceAreaBusinesses).
 *
 * Country-preferred: if country detected, fetches local then global and merges.
 */

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

interface PlacePrediction {
  placeId?: string;
  place?: string;
  text?: { text?: string };
  structuredFormat?: {
    mainText?: { text?: string };
    secondaryText?: { text?: string };
  };
}

interface Suggestion {
  placePrediction?: PlacePrediction;
  queryPrediction?: unknown;
}

interface NewAutocompleteResponse {
  suggestions?: Suggestion[];
}

interface NormalizedPrediction {
  place_id: string;
  primary_text: string;
  secondary_text: string;
  scope: "local" | "global";
}

/**
 * Calls Places API (New) v1 places:autocomplete.
 * Service-area-only businesses are not included for now.
 */
async function fetchPlacesAutocompleteNew(
  input: string,
  apiKey: string,
  country?: string
): Promise<NormalizedPrediction[]> {
  apiBudget.spend("google-places");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const body: {
    input: string;
    includedRegionCodes?: string[];
  } = {
    input: input.trim(),
  };
  if (country && country !== "XX") {
    body.includedRegionCodes = [country];
  }

  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    const errText = await response.text();
    console.error("Places API (New) autocomplete error:", response.status, errText.slice(0, 300));
    return [];
  }

  const data: NewAutocompleteResponse = await response.json();
  const suggestions = data.suggestions ?? [];

  const out: NormalizedPrediction[] = [];
  const scope = country && country !== "XX" ? "local" : "global";
  for (const s of suggestions) {
    const pred = s.placePrediction;
    if (!pred?.placeId) continue;
    const main = pred.structuredFormat?.mainText?.text ?? pred.text?.text ?? "";
    const secondary = pred.structuredFormat?.secondaryText?.text ?? "";
    out.push({
      place_id: pred.placeId,
      primary_text: main,
      secondary_text: secondary,
      scope,
    });
  }
  return out;
}

/**
 * Merges local and global results, deduping by place_id. Local first.
 */
function mergeResults(
  localResults: NormalizedPrediction[],
  globalResults: NormalizedPrediction[]
): NormalizedPrediction[] {
  const seen = new Set<string>();
  const merged: NormalizedPrediction[] = [];
  for (const r of localResults) {
    if (!seen.has(r.place_id)) {
      seen.add(r.place_id);
      merged.push(r);
    }
  }
  for (const r of globalResults) {
    if (!seen.has(r.place_id)) {
      seen.add(r.place_id);
      merged.push({ ...r, scope: "global" });
    }
  }
  return merged;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const input = searchParams.get("input");

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

  const { country } = getCountryFromRequest(request);

  try {
    let predictions: NormalizedPrediction[] = [];

    if (country !== "XX") {
      const [localResults, globalResults] = await Promise.all([
        fetchPlacesAutocompleteNew(input, GOOGLE_PLACES_API_KEY, country).catch((err) => {
          console.error("Error fetching local autocomplete:", err);
          return [];
        }),
        fetchPlacesAutocompleteNew(input, GOOGLE_PLACES_API_KEY).catch((err) => {
          console.error("Error fetching global autocomplete:", err);
          return [];
        }),
      ]);
      predictions = mergeResults(localResults, globalResults);
    } else {
      predictions = await fetchPlacesAutocompleteNew(input, GOOGLE_PLACES_API_KEY);
    }

    const response = NextResponse.json({ predictions });
    response.headers.set("Vary", "CF-IPCountry, x-vercel-ip-country");
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("Places autocomplete request timeout");
    } else {
      console.error("Error calling Places autocomplete:", error);
    }
    return NextResponse.json({ predictions: [] });
  }
}
