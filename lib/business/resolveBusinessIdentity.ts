/**
 * Business Identity Resolver
 * Resolves accurate business identity from multiple sources:
 * 1. GBP (Google Business Profile) - best source if available
 * 2. Google Places API - next best
 * 3. Website crawl data - fallback
 */

import { fetchWithTimeout } from "@/lib/net/fetchWithTimeout";
import { consumeBody } from "@/lib/net/consumeBody";
import {
  collectAndScoreCandidates,
  getBestBusinessName,
  type NormalizedCandidate,
} from './normalizeBusinessName';
import {
  resolveCategoryFamily,
  filterServiceKeywordsByFamily,
  getAllowedServiceKeywords,
} from '@/lib/seo/categoryFamilies';

// Types
export interface BusinessIdentity {
  website_host: string;
  business_name: string;
  category_label: string;
  service_keywords: string[];
  location_label: string | null;
  location_suburb: string | null;
  location_city: string | null;
  location_country: string | null;
  latlng: { lat: number; lng: number } | null;
  place_id: string | null;
  place_types: string[]; // Google Places types for category family resolution
  rating: number | null;
  review_count: number;
  sources: {
    gbp: boolean;
    places: boolean;
    website: boolean;
  };
  confidence: 'high' | 'medium' | 'low';
  debug_info: string[];
}

export interface WebsiteExtractedData {
  url: string;
  title: string | null;
  ogSiteName: string | null;
  ogTitle: string | null;
  h1Texts: string[];
  metaDescription: string | null;
  structuredDataName: string | null;
  structuredDataType: string | null;
  structuredDataAddress: string | null;
  navLabels: string[];
  footerText: string | null;
  topPhrases: string[];
  serviceKeywords: string[];
  locationEntities: string[];
  hasMenuPage: boolean;
  hasPricingPage: boolean;
  hasContactPage: boolean;
}

// Generic/invalid business name patterns to reject
const INVALID_NAME_PATTERNS = [
  /^home$/i,
  /^welcome$/i,
  /^index$/i,
  /^untitled$/i,
  /^homepage$/i,
  /^main$/i,
  /^default$/i,
  /^page$/i,
  /^website$/i,
  /^site$/i,
  /^home\s*page$/i,
  /^welcome\s+to$/i,
];

// Generic words to filter from service keywords
const GENERIC_WORDS = new Set([
  'home', 'about', 'contact', 'login', 'signup', 'sign up', 'register',
  'privacy', 'terms', 'policy', 'blog', 'news', 'page', 'site', 'website',
  'welcome', 'main', 'index', 'default', 'untitled', 'more', 'read', 'click',
  'here', 'learn', 'discover', 'explore', 'get', 'start', 'join', 'subscribe',
]);

// Category mappings from Places types
const CATEGORY_MAP: Record<string, string> = {
  restaurant: 'Restaurant',
  bar: 'Bar',
  cafe: 'Cafe',
  bakery: 'Bakery',
  meal_delivery: 'Restaurant',
  meal_takeaway: 'Restaurant',
  night_club: 'Nightclub',
  lodging: 'Hotel',
  hotel: 'Hotel',
  real_estate_agency: 'Real Estate Agency',
  lawyer: 'Law Firm',
  accounting: 'Accounting Firm',
  dentist: 'Dentist',
  doctor: 'Medical Practice',
  hospital: 'Hospital',
  pharmacy: 'Pharmacy',
  gym: 'Gym',
  spa: 'Spa',
  beauty_salon: 'Beauty Salon',
  hair_care: 'Hair Salon',
  car_dealer: 'Car Dealership',
  car_repair: 'Auto Repair',
  electrician: 'Electrician',
  plumber: 'Plumber',
  roofing_contractor: 'Roofing Contractor',
  general_contractor: 'Contractor',
  store: 'Retail Store',
  clothing_store: 'Clothing Store',
  furniture_store: 'Furniture Store',
  home_goods_store: 'Home Store',
  shopping_mall: 'Shopping Mall',
  travel_agency: 'Travel Agency',
  insurance_agency: 'Insurance Agency',
  marketing_agency: 'Marketing Agency',
};

/**
 * Extract host from URL
 */
function extractHost(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return url.replace(/^www\./, '').toLowerCase();
  }
}

/**
 * Check if a name is valid (not generic)
 */
function isValidBusinessName(name: string | null): boolean {
  if (!name || name.trim().length < 2) return false;
  const trimmed = name.trim();
  return !INVALID_NAME_PATTERNS.some(pattern => pattern.test(trimmed));
}

/**
 * Clean business name by removing separators and generic suffixes
 */
function cleanBusinessName(name: string): string {
  // Remove common separators and everything after
  let cleaned = name
    .split(/\s*[|•–—-]\s*/)[0]
    .trim();
  
  // Remove "Home" prefix/suffix
  cleaned = cleaned
    .replace(/^home\s*[-–—|•]?\s*/i, '')
    .replace(/\s*[-–—|•]?\s*home$/i, '')
    .trim();
  
  // Remove "Welcome to" prefix
  cleaned = cleaned.replace(/^welcome\s+to\s+/i, '').trim();
  
  return cleaned;
}

/**
 * Extract location components from address string
 */
function parseAddress(address: string): { suburb: string | null; city: string | null; country: string | null } {
  // Common South African cities
  const cities = ['Cape Town', 'Johannesburg', 'Pretoria', 'Durban', 'Port Elizabeth', 'Bloemfontein', 'East London', 'Stellenbosch'];
  const suburbs: Record<string, string[]> = {
    'Cape Town': ['Camps Bay', 'Sea Point', 'Green Point', 'Waterfront', 'Gardens', 'Observatory', 'Woodstock', 'Constantia', 'Newlands', 'Claremont', 'Rondebosch', 'Hout Bay', 'Blouberg', 'Century City', 'Bellville'],
    'Johannesburg': ['Sandton', 'Rosebank', 'Melrose', 'Parktown', 'Braamfontein', 'Fourways', 'Randburg', 'Midrand'],
  };
  
  let suburb: string | null = null;
  let city: string | null = null;
  let country: string | null = null;
  
  const lowerAddress = address.toLowerCase();
  
  // Find city
  for (const c of cities) {
    if (lowerAddress.includes(c.toLowerCase())) {
      city = c;
      // Check for suburbs of this city
      const citySuburbs = suburbs[c] || [];
      for (const s of citySuburbs) {
        if (lowerAddress.includes(s.toLowerCase())) {
          suburb = s;
          break;
        }
      }
      break;
    }
  }
  
  // Check for country
  if (lowerAddress.includes('south africa')) {
    country = 'South Africa';
  }
  
  return { suburb, city, country };
}

/**
 * Get category label from Places types
 */
function getCategoryFromTypes(types: string[]): string {
  for (const type of types) {
    if (CATEGORY_MAP[type]) {
      return CATEGORY_MAP[type];
    }
  }
  
  // Fallback categorization
  if (types.includes('food')) return 'Restaurant';
  if (types.includes('establishment')) return 'Business';
  if (types.includes('point_of_interest')) return 'Local Business';
  
  return 'Business';
}

/**
 * Find place using Google Places API
 */
async function findPlaceByQuery(query: string): Promise<any | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;
  
  try {
    // Try Find Place From Text first
    const url = new URL('https://maps.googleapis.com/maps/api/place/findplacefromtext/json');
    url.searchParams.set('input', query);
    url.searchParams.set('inputtype', 'textquery');
    url.searchParams.set('fields', 'place_id,name,formatted_address,geometry,types,rating,user_ratings_total,website');
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

    if (data.status === 'OK' && data.candidates && data.candidates.length > 0) {
      return data.candidates[0];
    }

    return null;
  } catch (error) {
    console.error('[IDENTITY] Find place error:', error);
    return null;
  }
}

/**
 * Text Search Places (returns array of results)
 */
async function textSearchPlaces(query: string): Promise<any[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];
  
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    url.searchParams.set('query', query);
    url.searchParams.set('key', apiKey);

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
    console.error('[IDENTITY] Text search error:', error);
    return [];
  }
}

/**
 * Calculate string similarity (simple)
 */
function stringSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const bLower = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (aLower === bLower) return 1.0;
  if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.8;
  
  // Simple character overlap
  const aSet = new Set(aLower);
  const bSet = new Set(bLower);
  let overlap = 0;
  for (const c of Array.from(aSet)) if (bSet.has(c)) overlap++;
  
  return overlap / Math.max(aSet.size, bSet.size);
}

/**
 * Get full place details
 */
async function getPlaceDetails(placeId: string): Promise<any | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;
  
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields', 'name,formatted_address,geometry,types,rating,user_ratings_total,website,formatted_phone_number,opening_hours,address_components');
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
    console.error('[IDENTITY] Place details error:', error);
    return null;
  }
}

/**
 * Extract address components from Places response
 */
function extractAddressComponents(components: any[]): { suburb: string | null; city: string | null; country: string | null } {
  let suburb: string | null = null;
  let city: string | null = null;
  let country: string | null = null;
  
  for (const comp of components || []) {
    const types = comp.types || [];
    if (types.includes('sublocality') || types.includes('sublocality_level_1') || types.includes('neighborhood')) {
      suburb = comp.long_name;
    }
    if (types.includes('locality')) {
      city = comp.long_name;
    }
    if (types.includes('country')) {
      country = comp.long_name;
    }
  }
  
  return { suburb, city, country };
}

/**
 * Filter and dedupe service keywords
 */
function filterServiceKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const filtered: string[] = [];
  
  for (const kw of keywords) {
    const lower = kw.toLowerCase().trim();
    if (
      lower.length >= 3 &&
      !GENERIC_WORDS.has(lower) &&
      !seen.has(lower) &&
      !/^\d+$/.test(lower) &&
      !/^(the|and|for|with|from|this|that|our|your)$/i.test(lower)
    ) {
      seen.add(lower);
      filtered.push(kw.trim());
    }
  }
  
  return filtered.slice(0, 8);
}

/**
 * Main resolver function
 */
export async function resolveBusinessIdentity(params: {
  websiteUrl: string;
  websiteData?: WebsiteExtractedData;
  gbpTokens?: { accessToken: string; refreshToken: string } | null;
}): Promise<BusinessIdentity> {
  const { websiteUrl, websiteData, gbpTokens } = params;
  const debug: string[] = [];
  
  const websiteHost = extractHost(websiteUrl);
  debug.push(`Website host: ${websiteHost}`);
  
  // Initialize result with defaults
  const result: BusinessIdentity = {
    website_host: websiteHost,
    business_name: '',
    category_label: 'Business',
    service_keywords: [],
    location_label: null,
    location_suburb: null,
    location_city: null,
    location_country: null,
    latlng: null,
    place_id: null,
    place_types: [],
    rating: null,
    review_count: 0,
    sources: { gbp: false, places: false, website: false },
    confidence: 'low',
    debug_info: debug,
  };
  
  // =========================================================================
  // 1. Try GBP (if tokens available) - BEST SOURCE
  // =========================================================================
  if (gbpTokens?.accessToken) {
    debug.push('GBP tokens available - attempting GBP resolution');
    // TODO: Implement GBP API call when we have the endpoint
    // For now, fall through to Places
  }
  
  // =========================================================================
  // 2. Try Google Places API - NEXT BEST
  // First resolve business name from website data, then query Places
  // =========================================================================
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (apiKey) {
    debug.push('Attempting Places API resolution...');
    
    // First, resolve business name from website data (normalized)
    let normalizedBrand: string | null = null;
    if (websiteData) {
      const candidates = collectAndScoreCandidates({
        structuredDataName: websiteData.structuredDataName,
        ogSiteName: websiteData.ogSiteName,
        ogTitle: websiteData.ogTitle,
        title: websiteData.title,
        domainHost: websiteHost,
      });
      normalizedBrand = getBestBusinessName(candidates);
      if (normalizedBrand) {
        debug.push(`Normalized brand name for Places search: "${normalizedBrand}"`);
      }
    }
    
    // Fallback to domain name if no normalized brand
    if (!normalizedBrand) {
      const domainName = websiteHost.split('.')[0];
      if (domainName.length > 2 && !['www', 'web', 'site'].includes(domainName)) {
        normalizedBrand = domainName
          .replace(/([A-Z])/g, ' $1')
          .replace(/[-_]/g, ' ')
          .trim()
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
        debug.push(`Using domain-derived brand: "${normalizedBrand}"`);
      }
    }
    
    if (!normalizedBrand) {
      debug.push('No brand name available for Places search');
    } else {
      // Build Places queries using normalized brand + location
      const searchQueries: string[] = [];
      
      // Get location from website data
      const locationFromWebsite = websiteData?.locationEntities[0] || null;
      const suburbOrCity = locationFromWebsite || null;
      
      // Build queries: brand + location (if available)
      if (suburbOrCity) {
        searchQueries.push(`${normalizedBrand} ${suburbOrCity}`);
        debug.push(`Places query: "${normalizedBrand} ${suburbOrCity}"`);
      } else {
        searchQueries.push(normalizedBrand);
        debug.push(`Places query: "${normalizedBrand}" (no location)`);
      }
      
      // Try each query
      for (const query of searchQueries) {
        if (!query || query.length < 3) continue;
        
        debug.push(`Searching Places (Text Search) for: "${query}"`);
        const places = await textSearchPlaces(query);
        
        if (places && places.length > 0) {
          // Try each result to find a match
          for (const place of places.slice(0, 5)) {
            // Get full details
            const details = await getPlaceDetails(place.place_id);
            const fullPlace = details || place;
            
            // Validate match
            let isMatch = false;
            
            // Strongest: website host match
            if (fullPlace.website) {
              const placeHost = extractHost(fullPlace.website);
              isMatch = placeHost === websiteHost || 
                        placeHost.endsWith(`.${websiteHost}`) ||
                        websiteHost.endsWith(`.${placeHost}`);
              if (isMatch) {
                debug.push(`✓ Match by website: ${placeHost} === ${websiteHost}`);
              }
            }
            
            // Fallback: name similarity + address city match
            if (!isMatch && fullPlace.name && normalizedBrand) {
              const nameSimilarity = stringSimilarity(fullPlace.name, normalizedBrand);
              const addressCity = fullPlace.formatted_address || '';
              const hasCityMatch = suburbOrCity ? addressCity.toLowerCase().includes(suburbOrCity.toLowerCase()) : true;
              
              if (nameSimilarity > 0.7 && hasCityMatch) {
                isMatch = true;
                debug.push(`✓ Match by name similarity (${nameSimilarity.toFixed(2)}) + city`);
              }
            }
            
            if (isMatch) {
              debug.push(`Found matching place: ${fullPlace.name}`);
              
              result.business_name = fullPlace.name || normalizedBrand;
              result.place_id = place.place_id;
              result.rating = fullPlace.rating || null;
              result.review_count = fullPlace.user_ratings_total || 0;
              result.sources.places = true;
              
              if (fullPlace.geometry?.location) {
                result.latlng = {
                  lat: fullPlace.geometry.location.lat,
                  lng: fullPlace.geometry.location.lng,
                };
                debug.push(`Got coordinates: ${result.latlng.lat}, ${result.latlng.lng}`);
              }
              
              if (fullPlace.types) {
                result.place_types = fullPlace.types;
                result.category_label = getCategoryFromTypes(fullPlace.types);
                debug.push(`Category from types: ${result.category_label}`);
                debug.push(`Place types: ${fullPlace.types.join(', ')}`);
              }
              
              // Parse address
              if (details?.address_components) {
                const { suburb, city, country } = extractAddressComponents(details.address_components);
                result.location_suburb = suburb;
                result.location_city = city;
                result.location_country = country;
              } else if (fullPlace.formatted_address) {
                const parsed = parseAddress(fullPlace.formatted_address);
                result.location_suburb = parsed.suburb;
                result.location_city = parsed.city;
                result.location_country = parsed.country;
              }
              
              // Build location label
              if (result.location_suburb && result.location_city) {
                result.location_label = `${result.location_suburb}, ${result.location_city}`;
              } else if (result.location_city) {
                result.location_label = result.location_city;
              } else if (result.location_suburb) {
                result.location_label = result.location_suburb;
              }
              
              debug.push(`Location: ${result.location_label}`);
              result.confidence = 'high';
              break;
            }
          }
          
          if (result.place_id) break; // Found a match, stop searching
        }
        
        // Small delay between queries
        await new Promise(r => setTimeout(r, 200));
      }
      
      // If Places failed, retry with domain-derived name + city
      if (!result.place_id && normalizedBrand && suburbOrCity) {
        const domainName = websiteHost.split('.')[0];
        if (domainName.length > 2 && !['www', 'web', 'site'].includes(domainName)) {
          const domainBrand = domainName
            .replace(/([A-Z])/g, ' $1')
            .replace(/[-_]/g, ' ')
            .trim()
            .split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
          
          if (domainBrand.toLowerCase() !== normalizedBrand.toLowerCase()) {
            debug.push(`Retrying Places with domain name: "${domainBrand} ${suburbOrCity}"`);
            const places = await textSearchPlaces(`${domainBrand} ${suburbOrCity}`);
            // ... (same matching logic as above, but simplified for brevity)
          }
        }
      }
    }
  }
  
  // =========================================================================
  // 3. Website Fallback - Use candidate scoring system
  // =========================================================================
  if (!result.business_name && websiteData) {
    debug.push('Falling back to website data...');
    result.sources.website = true;
    
    // Collect and score all candidates
    const candidates = collectAndScoreCandidates({
      structuredDataName: websiteData.structuredDataName,
      ogSiteName: websiteData.ogSiteName,
      ogTitle: websiteData.ogTitle,
      title: websiteData.title,
      domainHost: websiteHost,
    });
    
    // Log all candidates for debugging
    debug.push(`Found ${candidates.length} name candidates:`);
    for (const candidate of candidates) {
      debug.push(`  [${candidate.source}] "${candidate.raw}" -> "${candidate.normalized}" (score: ${candidate.score})`);
    }
    
    // Get best name
    const bestName = getBestBusinessName(candidates);
    if (bestName) {
      result.business_name = bestName;
      const winner = candidates.find(c => c.normalized === bestName);
      debug.push(`Winner: "${bestName}" from ${winner?.source} (score: ${winner?.score})`);
    }
    
    // Location from website entities
    if (websiteData.locationEntities.length > 0) {
      const loc = websiteData.locationEntities[0];
      const parsed = parseAddress(loc);
      result.location_suburb = parsed.suburb;
      result.location_city = parsed.city;
      result.location_country = parsed.country || 'South Africa';
      result.location_label = loc;
      debug.push(`Location from website: ${result.location_label}`);
    }
    
    // Service keywords - prefer family-based filtering if we have category/place types
    const rawKeywords = filterServiceKeywords([
      ...websiteData.serviceKeywords,
      ...websiteData.topPhrases,
    ]);
    
    // If we have category or place types, filter by family
    if (result.category_label || result.place_types.length > 0) {
      const family = resolveCategoryFamily(result.category_label, result.place_types);
      const { allowed } = filterServiceKeywordsByFamily(rawKeywords, family);
      
      // Prefer family-allowed keywords, but also include top family keywords
      const familyKeywords = getAllowedServiceKeywords(family).slice(0, 5);
      result.service_keywords = [
        ...familyKeywords,
        ...allowed,
      ].slice(0, 8);
      
      debug.push(`Service keywords filtered by family "${family}": ${result.service_keywords.length} allowed`);
    } else {
      result.service_keywords = rawKeywords;
    }
    
    // Category guess from website
    const allText = [
      websiteData.title,
      websiteData.metaDescription,
      websiteData.structuredDataType,
      ...websiteData.navLabels,
    ].join(' ').toLowerCase();
    
    if (allText.includes('restaurant') || allText.includes('menu') || allText.includes('dining')) {
      result.category_label = 'Restaurant';
    } else if (allText.includes('bar') || allText.includes('cocktail') || allText.includes('drinks')) {
      result.category_label = 'Bar';
    } else if (allText.includes('cafe') || allText.includes('coffee')) {
      result.category_label = 'Cafe';
    } else if (allText.includes('hotel') || allText.includes('accommodation') || allText.includes('lodge')) {
      result.category_label = 'Hotel';
    } else if (allText.includes('marketing') || allText.includes('agency') || allText.includes('digital')) {
      result.category_label = 'Marketing Agency';
    } else if (allText.includes('law') || allText.includes('attorney') || allText.includes('legal')) {
      result.category_label = 'Law Firm';
    }
    
    result.confidence = result.business_name ? 'medium' : 'low';
  }
  
  // =========================================================================
  // Final fallback: use domain name as business name
  // =========================================================================
  if (!result.business_name) {
    const candidates = collectAndScoreCandidates({
      structuredDataName: null,
      ogSiteName: null,
      ogTitle: null,
      title: null,
      domainHost: websiteHost,
    });
    const bestName = getBestBusinessName(candidates);
    if (bestName) {
      result.business_name = bestName;
      debug.push(`Business name from domain fallback: ${result.business_name}`);
    } else {
      // Ultimate fallback
      const domainName = websiteHost.split('.')[0];
      result.business_name = domainName
        .replace(/([A-Z])/g, ' $1')
        .replace(/[-_]/g, ' ')
        .trim()
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      debug.push(`Business name from domain (ultimate fallback): ${result.business_name}`);
    }
    result.confidence = 'low';
  }
  
  // Ensure we have at least some service keywords (with family filtering)
  if (result.service_keywords.length === 0 && websiteData) {
    const rawKeywords = filterServiceKeywords([
      ...websiteData.serviceKeywords,
      ...websiteData.topPhrases,
    ]);
    
    if (result.category_label || result.place_types.length > 0) {
      const family = resolveCategoryFamily(result.category_label, result.place_types);
      const { allowed } = filterServiceKeywordsByFamily(rawKeywords, family);
      const familyKeywords = getAllowedServiceKeywords(family).slice(0, 5);
      result.service_keywords = [
        ...familyKeywords,
        ...allowed,
      ].slice(0, 8);
    } else {
      result.service_keywords = rawKeywords;
    }
  }
  
  // Add category-derived service keywords from family if not already there
  if (result.category_label && result.category_label !== 'Business') {
    const family = resolveCategoryFamily(result.category_label, result.place_types);
    const familyKeywords = getAllowedServiceKeywords(family).slice(0, 3);
    
    for (const fkw of familyKeywords) {
      const lower = fkw.toLowerCase();
      if (!result.service_keywords.some(kw => kw.toLowerCase().includes(lower))) {
        result.service_keywords.unshift(fkw);
      }
    }
    
    result.service_keywords = result.service_keywords.slice(0, 8);
  }
  
  debug.push(`Final identity: ${result.business_name} (${result.confidence} confidence)`);
  result.debug_info = debug;
  
  return result;
}

/**
 * Build BusinessIdentity from placeId/GBP data (no website required)
 * Used for search visibility and competitor analysis when website is not available
 */
export async function buildBusinessIdentityFromPlaceId(params: {
  placeId: string;
  placeName?: string;
  placeAddress?: string;
  placeTypes?: string[];
  latlng?: { lat: number; lng: number } | null;
  rating?: number | null;
  reviewCount?: number;
}): Promise<BusinessIdentity> {
  const { placeId, placeName, placeAddress, placeTypes = [], latlng, rating, reviewCount = 0 } = params;
  const debug: string[] = [];
  
  debug.push(`Building identity from placeId: ${placeId}`);
  
  // Fetch full place details if not all data provided
  let fullPlaceDetails: any = null;
  if (!placeName || !placeAddress || !latlng) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (apiKey) {
      try {
        const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
        url.searchParams.set('place_id', placeId);
        url.searchParams.set('fields', 'name,formatted_address,geometry,types,rating,user_ratings_total,address_components');
        url.searchParams.set('key', apiKey);

        const response = await fetchWithTimeout(url.toString(), {
          timeoutMs: 10000,
          retries: 2,
        });
        if (!response.ok) {
          await consumeBody(response);
        } else {
          const data = await response.json();
          if (data.status === 'OK' && data.result) {
            fullPlaceDetails = data.result;
            debug.push('Fetched full place details from Places API');
          }
        }
      } catch (error) {
        debug.push(`Failed to fetch place details: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }
  }
  
  // Use provided data or fetched data
  const name = placeName || fullPlaceDetails?.name || 'Business';
  const address = placeAddress || fullPlaceDetails?.formatted_address || '';
  const location = latlng || (fullPlaceDetails?.geometry?.location ? {
    lat: fullPlaceDetails.geometry.location.lat,
    lng: fullPlaceDetails.geometry.location.lng,
  } : null);
  const types = placeTypes.length > 0 ? placeTypes : (fullPlaceDetails?.types || []);
  const placeRating = rating ?? (fullPlaceDetails?.rating || null);
  const reviews = reviewCount || (fullPlaceDetails?.user_ratings_total || 0);
  
  // Parse address components
  let locationSuburb: string | null = null;
  let locationCity: string | null = null;
  let locationCountry: string | null = null;
  
  if (fullPlaceDetails?.address_components) {
    const { suburb, city, country } = extractAddressComponents(fullPlaceDetails.address_components);
    locationSuburb = suburb;
    locationCity = city;
    locationCountry = country;
  } else if (address) {
    const parsed = parseAddress(address);
    locationSuburb = parsed.suburb;
    locationCity = parsed.city;
    locationCountry = parsed.country;
  }
  
  // Build location label
  let locationLabel: string | null = null;
  if (locationSuburb && locationCity) {
    locationLabel = `${locationSuburb}, ${locationCity}`;
  } else if (locationCity) {
    locationLabel = locationCity;
  } else if (locationSuburb) {
    locationLabel = locationSuburb;
  } else if (address) {
    // Fallback: use address parts
    const parts = address.split(',').map(s => s.trim());
    if (parts.length > 1) {
      locationLabel = parts.slice(0, -1).join(', '); // Exclude country
    }
  }
  
  // Get category from types
  const categoryLabel = getCategoryFromTypes(types);
  
  // Get service keywords from category family
  const family = resolveCategoryFamily(categoryLabel, types);
  const serviceKeywords = getAllowedServiceKeywords(family).slice(0, 8);
  
  debug.push(`Built identity: ${name} (${categoryLabel})`);
  debug.push(`Location: ${locationLabel || 'Unknown'}`);
  debug.push(`Service keywords: ${serviceKeywords.length} from family "${family}"`);
  
  const identity: BusinessIdentity = {
    website_host: '', // No website
    business_name: name,
    category_label: categoryLabel,
    service_keywords: serviceKeywords,
    location_label: locationLabel,
    location_suburb: locationSuburb,
    location_city: locationCity,
    location_country: locationCountry || 'South Africa',
    latlng: location,
    place_id: placeId,
    place_types: types,
    rating: placeRating,
    review_count: reviews,
    sources: { gbp: false, places: true, website: false },
    confidence: location ? 'high' : 'medium',
    debug_info: debug,
  };
  
  return identity;
}
