/**
 * Places API (New) v1 – Nearby Search (searchNearby) helper.
 * POST places:searchNearby with locationRestriction (circle) and optional includedTypes.
 * Returns legacy-shaped places for drop-in use in routes.
 */

import { ApiCache } from "@/lib/net/apiCache";
import { apiBudget } from "@/lib/net/apiBudget";

const SEARCH_NEARBY_TIMEOUT_MS = 15000;

/** Cache nearby search results for 5 min / max 200 entries. */
const nearbyCache = new ApiCache<NearbyPlaceLegacy[]>(200, 5 * 60 * 1000);

/** New API Place (partial – only fields we request via FieldMask) */
interface PlaceNew {
  name?: string; // resource name "places/ChIJ..."
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  rating?: number;
  userRatingCount?: number;
}

/** Legacy-shaped place for competitors and similar consumers */
export interface NearbyPlaceLegacy {
  place_id: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  types: string[];
  rating?: number;
  user_rating_total?: number;
}

const FIELD_MASK =
  "places.id,places.name,places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.userRatingCount";

function placeIdFromName(name: string | undefined): string {
  if (!name) return "";
  return name.replace(/^places\//, "").trim();
}

function mapPlaceToLegacy(p: PlaceNew): NearbyPlaceLegacy | null {
  const id = p.id ?? placeIdFromName(p.name);
  const lat = p.location?.latitude;
  const lng = p.location?.longitude;
  if (lat == null || lng == null) return null;
  return {
    place_id: id,
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? "",
    location: { lat, lng },
    types: p.types ?? [],
    rating: p.rating,
    user_rating_total: p.userRatingCount ?? 0,
  };
}

export interface SearchNearbyOptions {
  /** Place types to include (Table A). Omit for all types. */
  includedTypes?: string[];
  /** Max 1–20. Default 20. */
  maxResultCount?: number;
  /** DISTANCE or POPULARITY. Default DISTANCE for competitors. */
  rankPreference?: "DISTANCE" | "POPULARITY";
}

/**
 * Call Places API (New) v1 places:searchNearby and return legacy-shaped places.
 */
export async function searchNearbyNew(
  lat: number,
  lng: number,
  radiusMeters: number,
  apiKey: string,
  options: SearchNearbyOptions = {}
): Promise<NearbyPlaceLegacy[]> {
  const {
    includedTypes,
    maxResultCount = 20,
    rankPreference = "DISTANCE",
  } = options;

  // Check cache (key = rounded coords + radius + types + rank)
  const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}:${radiusMeters}:${(includedTypes ?? []).sort().join(",")}:${rankPreference}:${maxResultCount}`;
  const cached = nearbyCache.get(cacheKey);
  if (cached) return cached;

  // Budget guard: prevent runaway Places API costs
  if (!apiBudget.canCall("google-places")) {
    console.error("[places/searchNearbyNew] Budget exceeded, returning empty");
    return [];
  }
  apiBudget.record("google-places");

  const body: Record<string, unknown> = {
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: radiusMeters,
      },
    },
    maxResultCount: Math.min(20, Math.max(1, maxResultCount)),
    rankPreference,
  };
  if (includedTypes && includedTypes.length > 0) {
    body.includedTypes = includedTypes;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_NEARBY_TIMEOUT_MS);

  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      next: { revalidate: 300 },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      console.error("[places/searchNearbyNew] API error:", response.status, errText.slice(0, 300));
      return [];
    }

    const data = (await response.json()) as { places?: PlaceNew[] };
    const places = data.places ?? [];
    const result: NearbyPlaceLegacy[] = [];
    for (const p of places) {
      const mapped = mapPlaceToLegacy(p);
      if (mapped) result.push(mapped);
    }
    if (result.length > 0) nearbyCache.set(cacheKey, result);
    return result;
  } catch (e) {
    clearTimeout(timeoutId);
    console.error("[places/searchNearbyNew] fetch error:", e);
    return [];
  }
}
