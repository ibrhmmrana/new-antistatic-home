import { NextRequest, NextResponse } from "next/server";
import { fetchPlaceDetailsNew } from "@/lib/places/placeDetailsNew";
import { searchNearbyNew, type NearbyPlaceLegacy } from "@/lib/places/searchNearbyNew";

export const maxDuration = 30;

const MIN_COMPETITORS = 3;
const MAX_COMPETITORS = 10;
const RADIUS_STEPS = [1500, 3000, 5000, 10000, 20000]; // 1.5km, 3km, 5km, 10km, 20km

// Only truly generic types that don't represent business categories
const GENERIC_TYPES = [
  "point_of_interest",
  "establishment",
  "premise",
  "route",
  "street_address",
  "plus_code",
  "political",
  "locality",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "country",
];

// Category families - groups of related business types
const CATEGORY_FAMILIES: Record<string, string[]> = {
  // Food & Drink
  restaurant: ["restaurant", "cafe", "bakery", "bar", "meal_takeaway", "meal_delivery", "food"],
  cafe: ["restaurant", "cafe", "bakery", "bar", "meal_takeaway", "meal_delivery", "food"],
  bakery: ["restaurant", "cafe", "bakery", "bar", "meal_takeaway", "meal_delivery", "food"],
  bar: ["restaurant", "cafe", "bakery", "bar", "meal_takeaway", "meal_delivery", "food"],
  meal_takeaway: ["restaurant", "cafe", "bakery", "bar", "meal_takeaway", "meal_delivery", "food"],
  meal_delivery: ["restaurant", "cafe", "bakery", "bar", "meal_takeaway", "meal_delivery", "food"],
  food: ["restaurant", "cafe", "bakery", "bar", "meal_takeaway", "meal_delivery", "food"],
  
  // Cinema
  movie_theater: ["movie_theater"],
  
  // Gym/Fitness
  gym: ["gym"],
  
  // Beauty
  hair_care: ["hair_care", "beauty_salon", "spa"],
  beauty_salon: ["hair_care", "beauty_salon", "spa"],
  spa: ["hair_care", "beauty_salon", "spa"],
  
  // Auto
  car_repair: ["car_repair", "car_dealer", "car_wash"],
  car_dealer: ["car_repair", "car_dealer", "car_wash"],
  car_wash: ["car_repair", "car_dealer", "car_wash"],
  
  // Medical
  dentist: ["dentist", "doctor", "hospital", "pharmacy"],
  doctor: ["dentist", "doctor", "hospital", "pharmacy"],
  hospital: ["dentist", "doctor", "hospital", "pharmacy"],
  pharmacy: ["dentist", "doctor", "hospital", "pharmacy"],
  
  // Retail (optional - only if target is retail)
  clothing_store: ["clothing_store", "electronics_store", "store"],
  electronics_store: ["clothing_store", "electronics_store", "store"],
  store: ["clothing_store", "electronics_store", "store"],
};

// Types that cannot be used in Places API (New) searchNearby includedTypes (Table B – response only).
// See https://developers.google.com/maps/documentation/places/web-service/place-types
const NEW_API_UNSUPPORTED_INCLUDED_TYPES = new Set([
  "food",
  "establishment",
  "point_of_interest",
  "premise",
  "route",
  "street_address",
  "political",
  "locality",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "country",
]);

// Broad container types to exclude (unless target is also one)
const EXCLUDED_BROAD_TYPES = [
  "shopping_mall",
  "department_store",
  "supermarket",
  "school",
  "university",
  "airport",
  "train_station",
  "bus_station",
  "city_hall",
  "tourist_attraction",
  "park",
  "amusement_park",
  "stadium",
  "zoo",
  "aquarium",
];

interface CompetitorResult {
  place_id: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  rating?: number;
  user_rating_total?: number;
  distance?: number;
  primary_type?: string;
  radius_step?: number; // For debug
}

interface PlaceDetails {
  place_id: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  types: string[];
}

interface RemovalReason {
  place_id: string;
  name: string;
  candidatePrimaryType?: string;
  reason: string;
  types?: string[];
}

function getPrimaryType(types: string[]): string | null {
  // Find first specific (non-generic) type
  for (const type of types) {
    if (!GENERIC_TYPES.includes(type)) {
      return type;
    }
  }
  // Fallback to first type if all are generic (still proceed)
  return types.length > 0 ? types[0] : null;
}

/** Normalize place id for comparison (request may be "ChIJ..." or "places/ChIJ..."). */
function normalizePlaceId(id: string): string {
  return (id || "").replace(/^places\//, "").trim();
}

function getCategoryFamily(primaryType: string | null): string[] {
  if (!primaryType) return [];
  
  // Check if primary type has a family
  if (CATEGORY_FAMILIES[primaryType]) {
    return CATEGORY_FAMILIES[primaryType];
  }
  
  // If no family found, return just the primary type itself
  return [primaryType];
}

function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/** Fetch target place using Places API (New) v1 and return PlaceDetails. */
async function fetchTargetPlaceDetails(
  placeId: string,
  apiKey: string
): Promise<PlaceDetails> {
  const result = await fetchPlaceDetailsNew(
    placeId,
    ["id", "name", "displayName", "location", "types", "formattedAddress"],
    apiKey
  );
  if (!result) {
    throw new Error("Could not fetch place details for placeId");
  }
  const location = result.geometry?.location;
  if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
    throw new Error("Could not resolve target coordinates for placeId");
  }
  return {
    place_id: result.place_id ?? placeId,
    name: result.name ?? "",
    address: result.formatted_address ?? "",
    location: { lat: location.lat, lng: location.lng },
    types: result.types ?? [],
  };
}

/** Fill competitors from a specific radius using Places API (New) v1 searchNearby. */
async function fillFromRadiusNew(
  lat: number,
  lng: number,
  radius: number,
  apiKey: string,
  placeId: string,
  targetPrimaryType: string | null,
  targetFamily: string[],
  removals: RemovalReason[]
): Promise<CompetitorResult[]> {
  // Use only primary type for API (wider net; API returns subtypes too). Omit if Table B.
  const includedTypes =
    targetPrimaryType && !NEW_API_UNSUPPORTED_INCLUDED_TYPES.has(targetPrimaryType)
      ? [targetPrimaryType]
      : undefined;

  let rawPlaces = await searchNearbyNew(lat, lng, radius, apiKey, {
    includedTypes,
    maxResultCount: 20,
    rankPreference: "DISTANCE",
  });

  // If we got no results with a type filter, retry without filter (all types) and filter by family ourselves.
  if (rawPlaces.length === 0 && includedTypes) {
    rawPlaces = await searchNearbyNew(lat, lng, radius, apiKey, {
      maxResultCount: 20,
      rankPreference: "DISTANCE",
    });
  }

  const targetIdNorm = normalizePlaceId(placeId);

  const candidates = rawPlaces
    .filter((r: NearbyPlaceLegacy) => {
      const candidatePrimaryType = getPrimaryType(r.types || []);
      if (normalizePlaceId(r.place_id) === targetIdNorm) {
        removals.push({
          place_id: r.place_id,
          name: r.name || "Unknown",
          reason: "isTarget",
          types: r.types,
        });
        return false;
      }
      if (!r.name) {
        removals.push({
          place_id: r.place_id || "unknown",
          name: "Unknown",
          reason: "missingName",
        });
        return false;
      }
      // Keep places with or without address; show "Address not available" when missing
      if (targetPrimaryType && candidatePrimaryType) {
        if (!targetFamily.includes(candidatePrimaryType)) {
          removals.push({
            place_id: r.place_id,
            name: r.name,
            candidatePrimaryType,
            reason: "primaryTypeNotInFamily",
            types: r.types,
          });
          return false;
        }
      }
      if (candidatePrimaryType) {
        const isExcluded = EXCLUDED_BROAD_TYPES.includes(candidatePrimaryType);
        const targetIsAlsoExcluded = targetPrimaryType
          ? EXCLUDED_BROAD_TYPES.includes(targetPrimaryType)
          : false;
        if (isExcluded && !targetIsAlsoExcluded) {
          removals.push({
            place_id: r.place_id,
            name: r.name,
            candidatePrimaryType,
            reason: "broadTypeExcluded",
            types: r.types,
          });
          return false;
        }
      }
      return true;
    })
    .map((r: NearbyPlaceLegacy) => {
      const distance = calculateDistance(
        lat,
        lng,
        r.location.lat,
        r.location.lng
      );
      const candidatePrimaryType = getPrimaryType(r.types || []);
      return {
        place_id: r.place_id,
        name: r.name,
        address: r.address || "Address not available",
        location: r.location,
        rating: r.rating,
        user_rating_total: r.user_rating_total ?? 0,
        distance,
        primary_type: candidatePrimaryType || undefined,
        radius_step: radius,
      };
    });

  candidates.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  return candidates;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const rawPlaceId = searchParams.get("placeId");
  if (!rawPlaceId) {
    return NextResponse.json({ error: "placeId is required" }, { status: 400 });
  }
  const placeId = normalizePlaceId(rawPlaceId);

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing GOOGLE_PLACES_API_KEY" },
      { status: 500 }
    );
  }

  const removals: RemovalReason[] = [];

  try {
    // Step 1: Fetch target place details (Places API New v1)
    const targetPlace = await fetchTargetPlaceDetails(placeId, apiKey);
    const { lat, lng } = targetPlace.location;

    const targetPrimaryType = getPrimaryType(targetPlace.types);
    const targetFamily = getCategoryFamily(targetPrimaryType);

    console.log(
      "[competitors] placeId:",
      placeId,
      "latlng:",
      lat,
      lng,
      "types:",
      targetPlace.types,
      "primaryType:",
      targetPrimaryType,
      "family:",
      targetFamily
    );

    // Step 2: Radius-fill using New API searchNearby
    const finalList: CompetitorResult[] = [];
    const seenPlaceIds = new Set<string>();
    let radiusUsed = 0;
    let rawResultsCount = 0;

    for (const radius of RADIUS_STEPS) {
      if (finalList.length >= MAX_COMPETITORS) break;

      const candidates = await fillFromRadiusNew(
        lat,
        lng,
        radius,
        apiKey,
        placeId,
        targetPrimaryType,
        targetFamily,
        removals
      );

      rawResultsCount += candidates.length;

      // Add candidates in distance order (they're already sorted by distance ASC)
      for (const candidate of candidates) {
        // Skip if already in final list
        if (seenPlaceIds.has(candidate.place_id)) {
          continue;
        }

        // Add to final list
        finalList.push(candidate);
        seenPlaceIds.add(candidate.place_id);

        // Stop if we have enough
        if (finalList.length >= MAX_COMPETITORS) {
          break;
        }
      }

      radiusUsed = radius;

      // Stop if we have enough
      if (finalList.length >= MAX_COMPETITORS) {
        break;
      }
    }

    // Step 3: Final ranking (distance is already primary, but apply tie-breakers)
    finalList.sort((a, b) => {
      // Primary: distance ASC (closest first)
      if (a.distance !== b.distance) {
        return (a.distance || Infinity) - (b.distance || Infinity);
      }
      // Secondary: user_rating_total DESC
      if (a.user_rating_total !== b.user_rating_total) {
        return (b.user_rating_total || 0) - (a.user_rating_total || 0);
      }
      // Tertiary: rating DESC
      return (b.rating || 0) - (a.rating || 0);
    });

    // Step 4: Apply max limit (should already be applied, but ensure)
    const competitors = finalList.slice(0, MAX_COMPETITORS);

    const response: any = {
      target: {
        place_id: targetPlace.place_id,
        name: targetPlace.name,
        address: targetPlace.address,
        location: targetPlace.location,
      },
      competitors: competitors.map((c) => ({
        place_id: c.place_id,
        name: c.name,
        address: c.address,
        location: c.location,
        rating: c.rating,
        user_rating_total: c.user_rating_total,
      })),
    };

    // Add debug info in development
    if (process.env.NODE_ENV !== "production") {
      response.debug = {
        placeId,
        resolvedLat: lat,
        resolvedLng: lng,
        types: targetPlace.types,
        targetPrimaryType,
        targetFamily,
        radiusUsed,
        rawResultsCount,
        filteredCount: competitors.length,
        removals: removals.slice(0, 50), // Limit to first 50 removals for readability
        selected: competitors.map((c) => ({
          place_id: c.place_id,
          name: c.name,
          primaryType: c.primary_type,
          distance_m: Math.round(c.distance || 0),
          radius_step_m: c.radius_step,
        })),
      };
    }

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error: any) {
    console.error("Error fetching competitors:", error);

    if (error.message?.includes("Could not resolve target coordinates")) {
      return NextResponse.json(
        { error: "Could not resolve target coordinates for placeId" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch competitors" },
      { status: 500 }
    );
  }
}
