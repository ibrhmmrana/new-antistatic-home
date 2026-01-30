/**
 * Fetch Map Pack results for a specific query
 * Uses Places Text Search to get query-specific results (like Owner.com)
 */

import { fetchWithTimeout } from "@/lib/net/fetchWithTimeout";
import { consumeBody } from "@/lib/net/consumeBody";

export interface MapPackResult {
  place_id: string;
  name: string;
  rating?: number;
  user_ratings_total?: number;
  address?: string;
  website?: string | null;
}

export interface MapPackResponse {
  rank: number | null; // 1-3 if user's business is in top 3, else null
  results: MapPackResult[]; // top 3 results
}

// Simple in-memory cache (24h TTL)
const cache = new Map<string, { data: MapPackResponse; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get cache key for a query
 */
function getCacheKey(query: string, lat: number, lng: number): string {
  return `${query.toLowerCase()}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
}

/**
 * Fetch place details for enrichment
 */
async function enrichPlaceDetails(placeId: string): Promise<Partial<MapPackResult>> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return {};
  
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields', 'name,rating,user_ratings_total,formatted_address,website');
    url.searchParams.set('key', apiKey);

    const response = await fetchWithTimeout(url.toString(), {
      timeoutMs: 10000,
      retries: 2,
    });
    if (!response.ok) {
      await consumeBody(response);
      return {};
    }
    const data = await response.json();

    if (data.status === 'OK' && data.result) {
      return {
        website: data.result.website || null,
        rating: data.result.rating || undefined,
        user_ratings_total: data.result.user_ratings_total || undefined,
        address: data.result.formatted_address || undefined,
      };
    }

    return {};
  } catch (error) {
    console.error(`[MAP-PACK] Error enriching place ${placeId}:`, error);
    return {};
  }
}

/**
 * Fetch map pack results for a specific query
 */
export async function fetchMapPackForQuery(params: {
  query: string;
  userPlaceId: string | null;
  userLatLng: { lat: number; lng: number } | null;
  radiusMeters?: number;
}): Promise<MapPackResponse> {
  const { query, userPlaceId, userLatLng, radiusMeters = 4000 } = params;
  
  // Guardrails: require lat/lng
  if (!userLatLng) {
    return { rank: null, results: [] };
  }
  
  // Check cache
  const cacheKey = getCacheKey(query, userLatLng.lat, userLatLng.lng);
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[MAP-PACK] Cache hit for: "${query}"`);
    return cached.data;
  }
  
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return { rank: null, results: [] };
  }
  
  try {
    // Use Text Search with location bias (matches user's typed query)
    const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    url.searchParams.set('query', query);
    url.searchParams.set('location', `${userLatLng.lat},${userLatLng.lng}`);
    url.searchParams.set('radius', radiusMeters.toString());
    url.searchParams.set('key', apiKey);
    
    console.log(`[MAP-PACK] Text search for: "${query}" near ${userLatLng.lat}, ${userLatLng.lng}`);

    const response = await fetchWithTimeout(url.toString(), {
      timeoutMs: 10000,
      retries: 2,
    });
    if (!response.ok) {
      await consumeBody(response);
      return { rank: null, results: [] };
    }
    const data = await response.json();

    if (data.status !== 'OK' || !Array.isArray(data.results)) {
      console.log(`[MAP-PACK] Text search status: ${data.status}`);
      return { rank: null, results: [] };
    }
    
    // Take top 3 as map pack
    const top3 = data.results.slice(0, 3);
    
    // Find user's rank
    let userRank: number | null = null;
    if (userPlaceId) {
      for (let i = 0; i < top3.length; i++) {
        if (top3[i].place_id === userPlaceId) {
          userRank = i + 1;
          break;
        }
      }
    }
    
    // Enrich top 3 with Place Details (website, rating, etc.)
    const enrichedResults: MapPackResult[] = [];
    
    for (const place of top3) {
      const base: MapPackResult = {
        place_id: place.place_id,
        name: place.name || '',
        rating: place.rating || undefined,
        user_ratings_total: place.user_ratings_total || undefined,
        address: place.formatted_address || place.vicinity || undefined,
      };
      
      // Enrich with Place Details (website)
      const details = await enrichPlaceDetails(place.place_id);
      enrichedResults.push({
        ...base,
        ...details,
      });
      
      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 100));
    }
    
    const result: MapPackResponse = {
      rank: userRank,
      results: enrichedResults,
    };
    
    // Cache the result
    cache.set(cacheKey, { data: result, timestamp: Date.now() });
    
    console.log(`[MAP-PACK] Found ${enrichedResults.length} results, user rank: ${userRank || 'unranked'}`);
    
    return result;
  } catch (error) {
    console.error(`[MAP-PACK] Error fetching map pack for "${query}":`, error);
    return { rank: null, results: [] };
  }
}
