/**
 * Competitor Snapshot Module
 * Uses Google Places API to find and analyze local competitors
 * 
 * Updated to use Nearby Search with lat/lng for accurate results
 */

import { fetchWithTimeout } from "@/lib/net/fetchWithTimeout";
import { consumeBody } from "@/lib/net/consumeBody";
import { apiBudget } from "@/lib/net/apiBudget";
import type { BusinessIdentity } from '@/lib/business/resolveBusinessIdentity';

/** Hard cap: max total Google Places API calls per single competitor search invocation. */
const MAX_PLACES_CALLS_PER_INVOCATION = 60;

// Types
export interface CompetitorPlace {
  place_id: string;
  name: string;
  rating: number | null;
  user_ratings_total: number;
  website: string | null;
  phone: string | null;
  address: string | null;
  opening_hours?: {
    open_now?: boolean;
    weekday_text?: string[];
  };
  types: string[];
  distance_meters?: number;
  comparison_notes: string[];
}

export interface ReputationGap {
  your_rating: number | null;
  your_reviews: number;
  competitor_median_rating: number | null;
  competitor_median_reviews: number;
  competitor_top_rating: number | null;
  competitor_top_reviews: number;
  rating_gap: number | null;
  reviews_gap: number;
  status: 'ahead' | 'behind' | 'competitive' | 'unknown';
}

export interface CompetitorsSnapshot {
  competitors_places: CompetitorPlace[];
  reputation_gap: ReputationGap | null;
  competitors_with_website: number;
  competitors_without_website: number;
  search_method: 'nearby' | 'text' | 'none' | 'stage1_enriched' | 'stage1_discovery';
  search_radius_meters: number | null;
  search_queries_used: string[];
  location_used: string | null;
  your_place_id: string | null;
  competitor_source?: 'stage1_competitor_discovery';
  error?: string;
  debug_info: string[];
}

// Stage 1 competitor input (from /api/places/competitors)
export interface Stage1Competitor {
  place_id: string;
  name: string;
  address?: string;
  location?: { lat: number; lng: number };
  rating?: number;
  user_rating_total?: number;
}

// Category to Places type mapping
const CATEGORY_TO_TYPE: Record<string, string> = {
  'Restaurant': 'restaurant',
  'Bar': 'bar',
  'Cafe': 'cafe',
  'Bakery': 'bakery',
  'Hotel': 'lodging',
  'Nightclub': 'night_club',
  'Dentist': 'dentist',
  'Law Firm': 'lawyer',
  'Gym': 'gym',
  'Spa': 'spa',
  'Beauty Salon': 'beauty_salon',
  'Hair Salon': 'hair_care',
};

// Stage 1 competitor discovery constants (matching /api/places/competitors)
const STAGE1_RADIUS_STEPS = [1500, 3000, 5000, 10000, 20000]; // 1.5km, 3km, 5km, 10km, 20km
const STAGE1_MAX_PAGES = 3; // Google usually allows 3 pages max
const STAGE1_MAX_COMPETITORS = 10;

// Generic types that don't represent business categories
const GENERIC_TYPES = [
  'point_of_interest',
  'establishment',
  'premise',
  'route',
  'street_address',
  'plus_code',
  'political',
  'locality',
  'administrative_area_level_1',
  'administrative_area_level_2',
  'country',
];

// Broad container types to exclude (unless target is also one)
const EXCLUDED_BROAD_TYPES = [
  'shopping_mall',
  'department_store',
  'supermarket',
  'school',
  'university',
  'airport',
  'train_station',
  'bus_station',
  'city_hall',
  'tourist_attraction',
  'park',
  'amusement_park',
  'stadium',
  'zoo',
  'aquarium',
];

// Category families - groups of related business types
const CATEGORY_FAMILIES: Record<string, string[]> = {
  // Food & Drink
  restaurant: ['restaurant', 'cafe', 'bakery', 'bar', 'meal_takeaway', 'meal_delivery', 'food'],
  cafe: ['restaurant', 'cafe', 'bakery', 'bar', 'meal_takeaway', 'meal_delivery', 'food'],
  bakery: ['restaurant', 'cafe', 'bakery', 'bar', 'meal_takeaway', 'meal_delivery', 'food'],
  bar: ['restaurant', 'cafe', 'bakery', 'bar', 'meal_takeaway', 'meal_delivery', 'food'],
  meal_takeaway: ['restaurant', 'cafe', 'bakery', 'bar', 'meal_takeaway', 'meal_delivery', 'food'],
  meal_delivery: ['restaurant', 'cafe', 'bakery', 'bar', 'meal_takeaway', 'meal_delivery', 'food'],
  food: ['restaurant', 'cafe', 'bakery', 'bar', 'meal_takeaway', 'meal_delivery', 'food'],
  
  // Cinema
  movie_theater: ['movie_theater'],
  
  // Gym/Fitness
  gym: ['gym'],
  
  // Beauty
  hair_care: ['hair_care', 'beauty_salon', 'spa'],
  beauty_salon: ['hair_care', 'beauty_salon', 'spa'],
  spa: ['hair_care', 'beauty_salon', 'spa'],
  
  // Auto
  car_repair: ['car_repair', 'car_dealer', 'car_wash'],
  car_dealer: ['car_repair', 'car_dealer', 'car_wash'],
  car_wash: ['car_repair', 'car_dealer', 'car_wash'],
  
  // Medical
  dentist: ['dentist', 'doctor', 'hospital', 'pharmacy'],
  doctor: ['dentist', 'doctor', 'hospital', 'pharmacy'],
  hospital: ['dentist', 'doctor', 'hospital', 'pharmacy'],
  pharmacy: ['dentist', 'doctor', 'hospital', 'pharmacy'],
  
  // Retail (optional - only if target is retail)
  clothing_store: ['clothing_store', 'electronics_store', 'store'],
  electronics_store: ['clothing_store', 'electronics_store', 'store'],
  store: ['clothing_store', 'electronics_store', 'store'],
};

/**
 * Get primary type from types array (exclude generic types)
 */
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

/**
 * Get category family for a given type
 */
function getCategoryFamily(primaryType: string | null): string[] {
  if (!primaryType) return [];
  return CATEGORY_FAMILIES[primaryType] || [primaryType];
}

/**
 * Humanize type (convert "computer_repair" -> "computer repair")
 */
function humanizeType(type: string): string {
  return type.replace(/_/g, ' ');
}

/**
 * Check if competitor types match target's category family
 */
function matchesCategoryFamily(competitorTypes: string[], targetPrimaryType: string | null): boolean {
  if (!targetPrimaryType) return true; // No filter if no target type
  
  const targetFamily = getCategoryFamily(targetPrimaryType);
  if (targetFamily.length === 0) return true;
  
  // Check if any competitor type is in the target family
  return competitorTypes.some(type => targetFamily.includes(type));
}

/**
 * Fetch all pages of nearby search results (Stage 1 style)
 */
async function fetchAllNearbyPages(
  baseUrl: string,
  apiKey: string,
  maxPages: number = STAGE1_MAX_PAGES,
  callCounter?: { count: number }
): Promise<any[]> {
  const allResults: any[] = [];
  let currentUrl = baseUrl;
  let pageCount = 0;

  while (pageCount < maxPages) {
    // Budget guard
    if (!apiBudget.canCall("google-places")) {
      console.error("[COMPETITORS] Budget exceeded in fetchAllNearbyPages, stopping");
      break;
    }
    if (callCounter && callCounter.count >= MAX_PLACES_CALLS_PER_INVOCATION) {
      console.warn("[COMPETITORS] Per-invocation call cap reached in fetchAllNearbyPages");
      break;
    }
    apiBudget.record("google-places");
    if (callCounter) callCounter.count++;

    const response = await fetchWithTimeout(currentUrl, {
      timeoutMs: 10000,
      retries: 2,
    });

    if (!response.ok) {
      await consumeBody(response);
      break;
    }

    const data = await response.json();

    if (data.status === 'OK' && data.results) {
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

/**
 * Fill competitors from a specific radius (Stage 1 style)
 */
async function fillFromRadiusStage1(
  lat: number,
  lng: number,
  radius: number,
  apiKey: string,
  targetPlaceId: string,
  targetPrimaryType: string | null,
  targetFamily: string[],
  callCounter?: { count: number }
): Promise<CompetitorPlace[]> {
  const allResults: any[] = [];
  const searchPromises: Promise<any[]>[] = [];
  const humanizedType = targetPrimaryType ? humanizeType(targetPrimaryType) : null;

  // Strategy 1: Type-based search (if we have a type)
  if (targetPrimaryType) {
    const params = new URLSearchParams({
      location: `${lat},${lng}`,
      radius: radius.toString(),
      type: targetPrimaryType,
      key: apiKey,
    });
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`;
    searchPromises.push(fetchAllNearbyPages(url, apiKey, STAGE1_MAX_PAGES, callCounter));
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
    searchPromises.push(fetchAllNearbyPages(url, apiKey, STAGE1_MAX_PAGES, callCounter));
  }

  // If no type available, do a general nearby search
  if (!targetPrimaryType && !humanizedType) {
    const params = new URLSearchParams({
      location: `${lat},${lng}`,
      radius: radius.toString(),
      key: apiKey,
    });
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`;
    searchPromises.push(fetchAllNearbyPages(url, apiKey, STAGE1_MAX_PAGES, callCounter));
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

  // Apply strict filtering and compute distance (exact Stage 1 logic)
  const candidates = uniqueResults
    .filter((r: any) => {
      // Must not be the target
      if (r.place_id === targetPlaceId) {
        return false;
      }

      // Must have name
      if (!r.name) {
        return false;
      }

      // Must have address/vicinity
      if (!r.vicinity && !r.formatted_address) {
        return false;
      }

      // Must have location
      if (!r.geometry?.location) {
        return false;
      }

      // Determine candidate's primary type
      const candidateTypes = r.types || [];
      const candidatePrimaryType = getPrimaryType(candidateTypes);

      // Strict type matching: candidate must be in target's family
      if (targetPrimaryType && candidatePrimaryType) {
        if (!targetFamily.includes(candidatePrimaryType)) {
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

      // Fetch full details for each candidate (we'll do this in batches later)
      return {
        place_id: r.place_id,
        name: r.name,
        rating: r.rating || null,
        user_ratings_total: r.user_ratings_total || 0,
        website: null, // Will be enriched later
        phone: null,
        address: r.vicinity || r.formatted_address || null,
        types: r.types || [],
        distance_meters: Math.round(distance),
        comparison_notes: [],
      };
    });

  // Sort by distance ASC (closest first)
  candidates.sort((a, b) => {
    return (a.distance_meters || Infinity) - (b.distance_meters || Infinity);
  });

  return candidates;
}

/**
 * Stage 1 competitor discovery (exact same logic as /api/places/competitors)
 */
async function discoverCompetitorsStage1(
  identity: BusinessIdentity,
  apiKey: string
): Promise<CompetitorPlace[]> {
  if (!identity.place_id || !identity.latlng) {
    throw new Error('Missing place_id or lat/lng for Stage 1 competitor discovery');
  }

  // Step 1: Fetch target place details to get types
  const targetDetails = await getPlaceDetails(identity.place_id);
  if (!targetDetails || !targetDetails.types) {
    throw new Error('Could not fetch target place details');
  }

  const { lat, lng } = identity.latlng;
  
  // Determine target's primary type and family
  const targetPrimaryType = getPrimaryType(targetDetails.types);
  const targetFamily = getCategoryFamily(targetPrimaryType);

  console.log(
    '[COMPETITORS] Stage 1 discovery:',
    'placeId:', identity.place_id,
    'latlng:', lat, lng,
    'types:', targetDetails.types,
    'primaryType:', targetPrimaryType,
    'family:', targetFamily
  );

  // Step 2: Radius-fill algorithm - fill from closest first
  const finalList: CompetitorPlace[] = [];
  const seenPlaceIds = new Set<string>();
  const callCounter = { count: 1 }; // 1 for the getPlaceDetails above

  for (const radius of STAGE1_RADIUS_STEPS) {
    // Stop if we already have enough
    if (finalList.length >= STAGE1_MAX_COMPETITORS) {
      break;
    }

    // Stop if we hit the per-invocation call cap
    if (callCounter.count >= MAX_PLACES_CALLS_PER_INVOCATION) {
      console.warn(`[COMPETITORS] Per-invocation call cap reached (${callCounter.count}/${MAX_PLACES_CALLS_PER_INVOCATION}), stopping radius expansion`);
      break;
    }

    // Fetch all candidates from this radius
    const candidates = await fillFromRadiusStage1(
      lat,
      lng,
      radius,
      apiKey,
      identity.place_id,
      targetPrimaryType,
      targetFamily,
      callCounter
    );

    // Add candidates in distance order (they're already sorted by distance ASC)
    for (const candidate of candidates) {
      // Skip if already in final list
      if (seenPlaceIds.has(candidate.place_id)) {
        continue;
      }

      // Enrich with full place details
      try {
        const details = await getPlaceDetails(candidate.place_id);
        if (details) {
          candidate.website = details.website || null;
          candidate.phone = details.formatted_phone_number || null;
          candidate.rating = details.rating || candidate.rating;
          candidate.user_ratings_total = details.user_ratings_total || candidate.user_ratings_total;
          candidate.types = details.types || candidate.types;
          
          // Build comparison notes
          const notes: string[] = [];
          if (details.rating && identity.rating) {
            const diff = details.rating - identity.rating;
            if (diff > 0.3) notes.push(`Higher rating (+${diff.toFixed(1)})`);
            else if (diff < -0.3) notes.push(`Lower rating (${diff.toFixed(1)})`);
          }
          if (details.user_ratings_total && identity.review_count) {
            const diff = details.user_ratings_total - identity.review_count;
            if (diff > identity.review_count * 0.5) notes.push(`More reviews (+${diff})`);
            else if (diff < -identity.review_count * 0.5) notes.push(`Fewer reviews (${diff})`);
          }
          candidate.comparison_notes = notes;
        }
      } catch (error) {
        console.warn(`[COMPETITORS] Failed to enrich ${candidate.name}:`, error);
      }

      // Add to final list
      finalList.push(candidate);
      seenPlaceIds.add(candidate.place_id);

      // Stop if we have enough
      if (finalList.length >= STAGE1_MAX_COMPETITORS) {
        break;
      }
    }

    // Stop if we have enough
    if (finalList.length >= STAGE1_MAX_COMPETITORS) {
      break;
    }
  }

  // Step 3: Final ranking (distance is already primary, but apply tie-breakers)
  finalList.sort((a, b) => {
    // Primary: distance ASC (closest first)
    if (a.distance_meters !== b.distance_meters) {
      return (a.distance_meters || Infinity) - (b.distance_meters || Infinity);
    }
    // Secondary: user_rating_total DESC
    if (a.user_ratings_total !== b.user_ratings_total) {
      return (b.user_ratings_total || 0) - (a.user_ratings_total || 0);
    }
    // Tertiary: rating DESC
    return (b.rating || 0) - (a.rating || 0);
  });

  // Step 4: Apply max limit
  return finalList.slice(0, STAGE1_MAX_COMPETITORS);
}

/**
 * Normalize domain for comparison
 */
function normalizeDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Calculate string similarity (simple)
 */
function stringSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const bLower = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (aLower === bLower) return 1;
  if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.8;
  
  // Simple character overlap
  const aSet = new Set(aLower);
  const bSet = new Set(bLower);
  let overlap = 0;
  for (const c of Array.from(aSet)) if (bSet.has(c)) overlap++;
  return overlap / Math.max(aSet.size, bSet.size);
}

/**
 * Use Nearby Search API with lat/lng
 */
async function nearbySearch(params: {
  lat: number;
  lng: number;
  radius: number;
  type?: string;
  keyword?: string;
}): Promise<any[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];
  
  const { lat, lng, radius, type, keyword } = params;
  
  try {
    // Budget guard
    if (!apiBudget.canCall("google-places")) {
      console.error("[COMPETITORS] Budget exceeded in nearbySearch");
      return [];
    }
    apiBudget.record("google-places");

    const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    url.searchParams.set('location', `${lat},${lng}`);
    url.searchParams.set('radius', radius.toString());
    if (type) url.searchParams.set('type', type);
    if (keyword) url.searchParams.set('keyword', keyword);
    url.searchParams.set('key', apiKey);
    
    console.log(`[COMPETITORS] Nearby search: type=${type}, keyword=${keyword}, radius=${radius}m`);

    const response = await fetchWithTimeout(url.toString(), {
      timeoutMs: 10000,
      retries: 2,
    });
    if (!response.ok) {
      await consumeBody(response);
      return [];
    }
    const data = await response.json();

    if (data.status === 'OK' && Array.isArray(data.results)) {
      console.log(`[COMPETITORS] Nearby found ${data.results.length} results`);
      return data.results;
    }
    
    console.log(`[COMPETITORS] Nearby search status: ${data.status}`);
    return [];
  } catch (error) {
    console.error('[COMPETITORS] Nearby search error:', error);
    return [];
  }
}

/**
 * Text Search fallback when no lat/lng
 */
async function textSearch(query: string, locationBias?: string): Promise<any[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];
  
  try {
    // Budget guard
    if (!apiBudget.canCall("google-places")) {
      console.error("[COMPETITORS] Budget exceeded in textSearch");
      return [];
    }
    apiBudget.record("google-places");

    const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    url.searchParams.set('query', query);
    if (locationBias) {
      url.searchParams.set('location', locationBias);
      url.searchParams.set('radius', '5000');
    }
    url.searchParams.set('key', apiKey);
    
    console.log(`[COMPETITORS] Text search: "${query}"`);

    const response = await fetchWithTimeout(url.toString(), {
      timeoutMs: 10000,
      retries: 2,
    });
    if (!response.ok) {
      await consumeBody(response);
      return [];
    }
    const data = await response.json();

    if (data.status === 'OK' && Array.isArray(data.results)) {
      return data.results;
    }
    return [];
  } catch (error) {
    console.error('[COMPETITORS] Text search error:', error);
    return [];
  }
}

/**
 * Get place details
 */
/**
 * Fetch place details with minimal field mask.
 * Removed: formatted_phone_number, formatted_address, opening_hours
 * (never displayed in competitor cards — saves Contact Data billing)
 */
async function getPlaceDetails(placeId: string): Promise<any | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;
  
  try {
    // Budget guard
    if (!apiBudget.canCall("google-places")) {
      console.error("[COMPETITORS] Budget exceeded in getPlaceDetails");
      return null;
    }
    apiBudget.record("google-places");

    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    // Minimal mask: only fields needed for competitor ranking + category filtering
    url.searchParams.set('fields', 'name,rating,user_ratings_total,website,types,geometry');
    url.searchParams.set('key', apiKey);

    const response = await fetchWithTimeout(url.toString(), {
      timeoutMs: 10000,
      retries: 2,
    });
    if (!response.ok) {
      await consumeBody(response);
      return null;
    }
    const data = await response.json();

    if (data.status === 'OK' && data.result) {
      return data.result;
    }
    return null;
  } catch (error) {
    console.error('[COMPETITORS] Place details error:', error);
    return null;
  }
}

/**
 * Calculate distance between two points (Haversine)
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Check if a place matches the target business
 */
function isTargetBusiness(
  place: any,
  identity: BusinessIdentity
): boolean {
  // Match by place_id
  if (identity.place_id && place.place_id === identity.place_id) {
    return true;
  }
  
  // Match by website domain
  if (place.website && identity.website_host) {
    const placeHost = normalizeDomain(place.website);
    if (placeHost === identity.website_host) {
      return true;
    }
  }
  
  // Match by name similarity
  if (place.name && identity.business_name) {
    const similarity = stringSimilarity(place.name, identity.business_name);
    if (similarity > 0.7) {
      return true;
    }
  }
  
  return false;
}

/**
 * Calculate reputation gap
 */
function calculateReputationGap(
  yourRating: number | null,
  yourReviews: number,
  competitors: CompetitorPlace[]
): ReputationGap {
  const competitorRatings = competitors
    .filter(c => c.rating !== null)
    .map(c => c.rating as number)
    .sort((a, b) => a - b);
  
  const competitorReviews = competitors
    .map(c => c.user_ratings_total)
    .sort((a, b) => a - b);
  
  const medianRating = competitorRatings.length > 0
    ? competitorRatings[Math.floor(competitorRatings.length / 2)]
    : null;
  
  const medianReviews = competitorReviews.length > 0
    ? competitorReviews[Math.floor(competitorReviews.length / 2)]
    : 0;
  
  const topRating = competitorRatings.length > 0
    ? Math.max(...competitorRatings)
    : null;
  
  const topReviews = competitorReviews.length > 0
    ? Math.max(...competitorReviews)
    : 0;
  
  const ratingGap = yourRating !== null && medianRating !== null
    ? yourRating - medianRating
    : null;
  
  const reviewsGap = yourReviews - medianReviews;
  
  let status: ReputationGap['status'] = 'unknown';
  
  if (ratingGap !== null && medianReviews > 0) {
    if (ratingGap > 0.2 && reviewsGap >= 0) {
      status = 'ahead';
    } else if (ratingGap < -0.2 || reviewsGap < -medianReviews * 0.3) {
      status = 'behind';
    } else {
      status = 'competitive';
    }
  } else if (yourReviews > 0) {
    status = 'competitive';
  }
  
  return {
    your_rating: yourRating,
    your_reviews: yourReviews,
    competitor_median_rating: medianRating,
    competitor_median_reviews: medianReviews,
    competitor_top_rating: topRating,
    competitor_top_reviews: topReviews,
    rating_gap: ratingGap !== null ? Math.round(ratingGap * 10) / 10 : null,
    reviews_gap: reviewsGap,
    status,
  };
}

/**
 * Enrich Stage 1 competitors with Places Details
 */
async function enrichCompetitorsWithPlacesDetails(
  stage1Competitors: Stage1Competitor[],
  identity: BusinessIdentity
): Promise<CompetitorPlace[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn('[COMPETITORS] No API key for enrichment');
    return [];
  }
  
  const enriched: CompetitorPlace[] = [];
  
  // Get target's primary type from category_label or Places Details
  let targetPrimaryType: string | null = null;
  if (identity.category_label) {
    targetPrimaryType = CATEGORY_TO_TYPE[identity.category_label] || null;
  }
  
  // If no type from category_label, try to get from Places Details
  if (!targetPrimaryType && identity.place_id) {
    const targetDetails = await getPlaceDetails(identity.place_id);
    if (targetDetails?.types) {
      // Extract primary type (first non-generic type)
      const genericTypes = ['point_of_interest', 'establishment', 'premise', 'route', 'street_address'];
      targetPrimaryType = targetDetails.types.find(t => !genericTypes.includes(t)) || targetDetails.types[0] || null;
    }
  }
  
  for (const comp of stage1Competitors) {
    // Skip if this is the target business
    if (comp.place_id === identity.place_id) {
      continue;
    }
    
    try {
      // Fetch full place details
      const details = await getPlaceDetails(comp.place_id);
      
      if (!details) {
        // Fallback: use Stage 1 data if details fetch fails
        enriched.push({
          place_id: comp.place_id,
          name: comp.name,
          rating: comp.rating || null,
          user_ratings_total: comp.user_rating_total || 0,
          website: null,
          phone: null,
          address: comp.address || null,
          types: [],
          comparison_notes: [],
        });
        continue;
      }
      
      // Extract types
      const competitorTypes = details.types || [];
      
      // Category filter: skip if types don't match target's family
      if (targetPrimaryType && !matchesCategoryFamily(competitorTypes, targetPrimaryType)) {
        console.log(`[COMPETITORS] Filtered out ${comp.name}: types ${competitorTypes.join(', ')} don't match target family`);
        continue;
      }
      
      // Calculate distance if we have both locations
      let distanceMeters: number | undefined;
      if (identity.latlng && details.geometry?.location) {
        distanceMeters = Math.round(calculateDistance(
          identity.latlng.lat,
          identity.latlng.lng,
          details.geometry.location.lat,
          details.geometry.location.lng
        ));
      }
      
      // Build comparison notes
      const notes: string[] = [];
      if (details.rating && identity.rating) {
        const diff = details.rating - identity.rating;
        if (diff > 0.3) notes.push(`Higher rating (+${diff.toFixed(1)})`);
        else if (diff < -0.3) notes.push(`Lower rating (${diff.toFixed(1)})`);
      }
      if (details.user_ratings_total && identity.review_count) {
        const diff = details.user_ratings_total - identity.review_count;
        if (diff > identity.review_count * 0.5) notes.push(`More reviews (+${diff})`);
        else if (diff < -identity.review_count * 0.5) notes.push(`Fewer reviews (${diff})`);
      }
      
      enriched.push({
        place_id: comp.place_id,
        name: details.name || comp.name,
        rating: details.rating || comp.rating || null,
        user_ratings_total: details.user_ratings_total || comp.user_rating_total || 0,
        website: details.website || null,
        phone: details.formatted_phone_number || null,
        address: details.formatted_address || comp.address || null,
        types: competitorTypes,
        distance_meters: distanceMeters,
        comparison_notes: notes,
      });
      
      // Rate limit: small delay between API calls
      await new Promise(r => setTimeout(r, 100));
    } catch (error) {
      console.error(`[COMPETITORS] Error enriching ${comp.name}:`, error);
      // Still add with basic data
      enriched.push({
        place_id: comp.place_id,
        name: comp.name,
        rating: comp.rating || null,
        user_ratings_total: comp.user_rating_total || 0,
        website: null,
        phone: null,
        address: comp.address || null,
        types: [],
        comparison_notes: [],
      });
    }
  }
  
  return enriched;
}

/**
 * Main function to get competitor snapshot
 * Now supports Stage 1 competitors (preferred) or Nearby search (fallback)
 */
export async function getCompetitorSnapshot(params: {
  identity: BusinessIdentity;
  radiusMeters?: number;
  maxCompetitors?: number;
  stage1Competitors?: Stage1Competitor[]; // NEW: Stage 1 competitors from "[business] & competitors" stage
}): Promise<CompetitorsSnapshot> {
  const {
    identity,
    radiusMeters = 3000, // 3km default
    maxCompetitors = 10,
    stage1Competitors = [], // Stage 1 competitors from "[business] & competitors" stage
  } = params;
  
  const debug: string[] = [];
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  
  if (!apiKey) {
    return {
      competitors_places: [],
      reputation_gap: null,
      competitors_with_website: 0,
      competitors_without_website: 0,
      search_method: 'none',
      search_radius_meters: null,
      search_queries_used: [],
      location_used: null,
      your_place_id: identity.place_id,
      error: 'Google Places API not configured (missing GOOGLE_PLACES_API_KEY)',
      debug_info: debug,
    };
  }
  
  debug.push(`Starting competitor search for: ${identity.business_name}`);
  debug.push(`Category: ${identity.category_label}`);
  debug.push(`Location: ${identity.location_label || 'Unknown'}`);
  debug.push(`Coordinates: ${identity.latlng ? `${identity.latlng.lat}, ${identity.latlng.lng}` : 'None'}`);
  debug.push(`Place ID: ${identity.place_id || 'None'}`);
  debug.push(`Stage 1 competitors provided: ${stage1Competitors.length}`);
  
  // =========================================================================
  // PREFERRED: Use Stage 1 competitors (from "[business] & competitors" stage)
  // =========================================================================
  if (stage1Competitors.length > 0) {
    debug.push(`Using Stage 1 competitors (${stage1Competitors.length} provided)`);
    
    try {
      const enriched = await enrichCompetitorsWithPlacesDetails(stage1Competitors, identity);
      
      // Filter out target business
      const filtered = enriched.filter(c => c.place_id !== identity.place_id);
      
      debug.push(`After enrichment and filtering: ${filtered.length} competitors`);
      
      // Calculate reputation gap
      const yourRating = identity.rating || null;
      const yourReviews = identity.review_count || 0;
      const reputationGap = filtered.length > 0
        ? calculateReputationGap(yourRating, yourReviews, filtered)
        : null;
      
      const withWebsite = filtered.filter(c => c.website).length;
      const withoutWebsite = filtered.length - withWebsite;
      
      return {
        competitors_places: filtered,
        reputation_gap: reputationGap,
        competitors_with_website: withWebsite,
        competitors_without_website: withoutWebsite,
        search_method: 'stage1_enriched',
        search_radius_meters: null,
        search_queries_used: [],
        location_used: identity.location_label,
        your_place_id: identity.place_id,
        competitor_source: 'stage1_competitor_discovery',
        debug_info: debug,
      };
    } catch (error) {
      debug.push(`Enrichment error: ${error instanceof Error ? error.message : 'Unknown'}`);
      // Fall through to Nearby search if enrichment fails
    }
  }
  
  // =========================================================================
  // FALLBACK: Use Nearby Search (only if Stage 1 competitors not provided)
  // =========================================================================
  debug.push('Falling back to Stage 1 competitor discovery (no Stage 1 competitors provided)');
  
  if (!identity.place_id || !identity.latlng) {
    debug.push('Missing place_id or lat/lng - competitor list requires accurate location');
    return {
      competitors_places: [],
      reputation_gap: null,
      competitors_with_website: 0,
      competitors_without_website: 0,
      search_method: 'none',
      search_radius_meters: null,
      search_queries_used: [],
      location_used: identity.location_label,
      your_place_id: identity.place_id,
      error: 'Could not resolve Place ID; competitor results may be broad. Connect Google Business Profile or ensure address is in structured data.',
      debug_info: debug,
    };
  }
  
  try {
    // Use exact Stage 1 discovery algorithm
    const competitors = await discoverCompetitorsStage1(identity, apiKey);
    
    debug.push(`Stage 1 discovery found ${competitors.length} competitors`);
    
    // Calculate reputation gap
    const yourRating = identity.rating || null;
    const yourReviews = identity.review_count || 0;
    const reputationGap = competitors.length > 0
      ? calculateReputationGap(yourRating, yourReviews, competitors)
      : null;
    
    const withWebsite = competitors.filter(c => c.website).length;
    const withoutWebsite = competitors.length - withWebsite;
    
    return {
      competitors_places: competitors,
      reputation_gap: reputationGap,
      competitors_with_website: withWebsite,
      competitors_without_website: withoutWebsite,
      search_method: 'stage1_discovery', // Indicates we used Stage 1 algorithm
      search_radius_meters: null, // Stage 1 uses multiple radius steps
      search_queries_used: [],
      location_used: identity.location_label,
      your_place_id: identity.place_id,
      debug_info: debug,
    };
  } catch (error) {
    debug.push(`Stage 1 discovery error: ${error instanceof Error ? error.message : 'Unknown'}`);
    return {
      competitors_places: [],
      reputation_gap: null,
      competitors_with_website: 0,
      competitors_without_website: 0,
      search_method: 'none',
      search_radius_meters: null,
      search_queries_used: [],
      location_used: identity.location_label,
      your_place_id: identity.place_id,
      error: error instanceof Error ? error.message : 'Unknown error',
      debug_info: debug,
    };
  }
}
