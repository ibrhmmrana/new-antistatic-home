import { NextRequest, NextResponse } from "next/server";

const MIN_COMPETITORS = 3;
const MAX_COMPETITORS = 8;
const RADIUS_STEPS = [1500, 3000, 5000, 10000, 20000]; // 1.5km, 3km, 5km, 10km, 20km
const MAX_PAGES = 3; // Google usually allows 3 pages max

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

function getCategoryFamily(primaryType: string | null): string[] {
  if (!primaryType) return [];
  
  // Check if primary type has a family
  if (CATEGORY_FAMILIES[primaryType]) {
    return CATEGORY_FAMILIES[primaryType];
  }
  
  // If no family found, return just the primary type itself
  return [primaryType];
}

function humanizeType(type: string): string {
  // Convert "computer_repair" -> "computer repair"
  return type.replace(/_/g, " ");
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

async function fetchPlaceDetails(
  placeId: string,
  apiKey: string
): Promise<PlaceDetails> {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
    placeId
  )}&fields=place_id,name,types,geometry,vicinity,formatted_address,rating,user_ratings_total&key=${apiKey}`;

  const response = await fetch(url, {
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(`Google Places API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.status !== "OK" || !data.result) {
    throw new Error(`Failed to fetch place details: ${data.status}`);
  }

  const result = data.result;
  const location = result.geometry?.location;

  if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
    throw new Error("Could not resolve target coordinates for placeId");
  }

  return {
    place_id: result.place_id,
    name: result.name || "",
    address: result.formatted_address || result.vicinity || "",
    location: {
      lat: location.lat,
      lng: location.lng,
    },
    types: result.types || [],
  };
}

// Fetch all pages of nearby search results
async function fetchAllNearbyPages(
  baseUrl: string,
  apiKey: string,
  maxPages: number = MAX_PAGES
): Promise<any[]> {
  const allResults: any[] = [];
  let currentUrl = baseUrl;
  let pageCount = 0;

  while (pageCount < maxPages) {
    const response = await fetch(currentUrl, {
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      break;
    }

    const data = await response.json();

    if (data.status === "OK" && data.results) {
      allResults.push(...data.results);
    } else {
      break;
    }

    // Check for next page token
    if (data.next_page_token) {
      // Wait 2 seconds as required by Google
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      currentUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${data.next_page_token}&key=${apiKey}`;
      pageCount++;
    } else {
      break;
    }
  }

  return allResults;
}

// Fill competitors from a specific radius
async function fillFromRadius(
  lat: number,
  lng: number,
  radius: number,
  apiKey: string,
  placeId: string,
  targetPrimaryType: string | null,
  targetFamily: string[],
  humanizedType: string | null,
  removals: RemovalReason[]
): Promise<CompetitorResult[]> {
  const allResults: any[] = [];
  const searchPromises: Promise<any[]>[] = [];

  // Strategy 1: Type-based search (if we have a type)
  if (targetPrimaryType) {
    const params = new URLSearchParams({
      location: `${lat},${lng}`,
      radius: radius.toString(),
      type: targetPrimaryType,
      key: apiKey,
    });
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`;
    searchPromises.push(fetchAllNearbyPages(url, apiKey));
  }

  // Strategy 2: Keyword-based search (always try this if we have keyword)
  if (humanizedType) {
    const params = new URLSearchParams({
      location: `${lat},${lng}`,
      radius: radius.toString(),
      keyword: humanizedType,
      key: apiKey,
    });
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`;
    searchPromises.push(fetchAllNearbyPages(url, apiKey));
  }

  // If no type available, do a general nearby search
  if (!targetPrimaryType && !humanizedType) {
    const params = new URLSearchParams({
      location: `${lat},${lng}`,
      radius: radius.toString(),
      key: apiKey,
    });
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`;
    searchPromises.push(fetchAllNearbyPages(url, apiKey));
  }

  const searchResults = await Promise.all(searchPromises);
  const mergedResults = searchResults.flat();

  // Deduplicate by place_id
  const seenIds = new Set<string>();
  const uniqueResults = mergedResults.filter((r: any) => {
    if (seenIds.has(r.place_id)) return false;
    seenIds.add(r.place_id);
    return true;
  });

  // Apply strict filtering and compute distance
  const candidates = uniqueResults
    .filter((r: any) => {
      // Must not be the target
      if (r.place_id === placeId) {
        removals.push({
          place_id: r.place_id,
          name: r.name || "Unknown",
          reason: "isTarget",
          types: r.types,
        });
        return false;
      }

      // Must have name
      if (!r.name) {
        removals.push({
          place_id: r.place_id || "unknown",
          name: "Unknown",
          reason: "missingName",
        });
        return false;
      }

      // Must have address/vicinity
      if (!r.vicinity && !r.formatted_address) {
        removals.push({
          place_id: r.place_id,
          name: r.name,
          reason: "missingAddress",
          types: r.types,
        });
        return false;
      }

      // Must have location
      if (!r.geometry?.location) {
        removals.push({
          place_id: r.place_id,
          name: r.name,
          reason: "missingLocation",
          types: r.types,
        });
        return false;
      }

      // Determine candidate's primary type
      const candidateTypes = r.types || [];
      const candidatePrimaryType = getPrimaryType(candidateTypes);

      // Strict type matching: candidate must be in target's family
      if (targetPrimaryType && candidatePrimaryType) {
        if (!targetFamily.includes(candidatePrimaryType)) {
          removals.push({
            place_id: r.place_id,
            name: r.name,
            candidatePrimaryType,
            reason: "primaryTypeNotInFamily",
            types: candidateTypes,
          });
          return false;
        }
      }

      // Exclude broad container types (unless target is also one)
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
            types: candidateTypes,
          });
          return false;
        }
      }

      return true;
    })
    .map((r: any) => {
      const distance = calculateDistance(
        lat,
        lng,
        r.geometry.location.lat,
        r.geometry.location.lng
      );

      const candidatePrimaryType = getPrimaryType(r.types || []);

      return {
        place_id: r.place_id,
        name: r.name,
        address: r.vicinity || r.formatted_address || "",
        location: {
          lat: r.geometry.location.lat,
          lng: r.geometry.location.lng,
        },
        rating: r.rating,
        user_rating_total: r.user_ratings_total || 0,
        distance,
        primary_type: candidatePrimaryType || undefined,
        radius_step: radius, // Track which radius this came from
      };
    });

  // Sort by distance ASC (closest first)
  candidates.sort((a, b) => {
    return (a.distance || Infinity) - (b.distance || Infinity);
  });

  return candidates;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const placeId = searchParams.get("placeId");

  if (!placeId) {
    return NextResponse.json({ error: "placeId is required" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing GOOGLE_PLACES_API_KEY" },
      { status: 500 }
    );
  }

  const removals: RemovalReason[] = [];

  try {
    // Step 1: Fetch target place details
    const targetPlace = await fetchPlaceDetails(placeId, apiKey);
    const { lat, lng } = targetPlace.location;
    
    // Determine target's primary type and family
    const targetPrimaryType = getPrimaryType(targetPlace.types);
    const targetFamily = getCategoryFamily(targetPrimaryType);
    const humanizedType = targetPrimaryType ? humanizeType(targetPrimaryType) : null;

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

    // Step 2: Radius-fill algorithm - fill from closest first
    const finalList: CompetitorResult[] = [];
    const seenPlaceIds = new Set<string>();
    let radiusUsed = 0;
    let rawResultsCount = 0;

    for (const radius of RADIUS_STEPS) {
      // Stop if we already have enough
      if (finalList.length >= MAX_COMPETITORS) {
        break;
      }

      // Fetch all candidates from this radius
      const candidates = await fillFromRadius(
        lat,
        lng,
        radius,
        apiKey,
        placeId,
        targetPrimaryType,
        targetFamily,
        humanizedType,
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
