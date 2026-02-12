/**
 * Owner-style Query Builder
 * Generates non-branded, high-intent queries (category/service + neighborhood)
 * Similar to Owner.com's approach
 * 
 * Uses category families and strict service keyword validation to prevent generic queries
 */

import type { BusinessIdentity } from '@/lib/business/resolveBusinessIdentity';
import {
  resolveCategoryFamily,
  getAllowedServiceKeywords,
  isBlockedKeyword,
  filterServiceKeywordsByFamily,
  type CategoryFamily,
} from './categoryFamilies';

export interface OwnerStyleQuery {
  query: string;
  intent: 'non_branded' | 'branded';
  rationale: string;
}

export interface QueryGenerationDebug {
  category_family: CategoryFamily;
  allowed_services_used: string[];
  rejected_keywords: string[];
  final_queries: string[];
}

// Category to search phrase mapping (fallback if family doesn't provide)
const CATEGORY_PHRASES: Record<string, string> = {
  'Restaurant': 'restaurant',
  'Bar': 'bar',
  'Cafe': 'cafe',
  'Bakery': 'bakery',
  'Dentist': 'dentist',
  'Orthodontist': 'orthodontist',
  'Law Firm': 'lawyer',
  'Plumber': 'plumber',
  'Gym': 'gym',
  'Beauty Salon': 'beauty salon',
  'Hair Salon': 'hair salon',
  'Real Estate Agency': 'real estate',
};

/**
 * Check if a query contains blocked terms
 * Returns array of blocked terms found
 */
function findBlockedTermsInQuery(query: string): string[] {
  const lower = query.toLowerCase();
  const words = lower.split(/\s+/);
  const found: string[] = [];
  
  for (const word of words) {
    if (isBlockedKeyword(word)) {
      found.push(word);
    }
  }
  
  return found;
}

/**
 * Check if a query contains any allowed service keywords
 */
function queryContainsAllowedService(query: string, allowedServices: string[]): boolean {
  const lower = query.toLowerCase();
  return allowedServices.some(service => {
    const serviceLower = service.toLowerCase();
    return lower === serviceLower || 
           lower.includes(serviceLower) || 
           serviceLower.includes(lower);
  });
}

/**
 * Validate a query - reject if it contains blocked terms without allowed services
 */
function isValidQuery(query: string, allowedServices: string[]): boolean {
  const lower = query.toLowerCase().trim();
  
  // Must have at least 3 meaningful tokens
  const tokens = lower.split(/\s+/).filter(t => t.length >= 2);
  if (tokens.length < 3) return false;
  
  // Check if it contains blocked terms
  const blockedTerms = findBlockedTermsInQuery(lower);
  if (blockedTerms.length > 0) {
    // Only allow if it also contains an allowed service keyword
    // e.g., "orthodontic consultation" is OK, but "best consultation" is not
    return queryContainsAllowedService(lower, allowedServices);
  }
  
  return true;
}

/**
 * Build Owner-style queries with strict family-based validation
 */
export function buildOwnerStyleQueries(params: {
  identity: BusinessIdentity;
  maxQueries?: number;
  detectedServiceIntents?: string[]; // e.g., ['brunch', 'cocktails'] from site content
  placeTypes?: string[]; // Google Places types for better family resolution
}): OwnerStyleQuery[] {
  const { identity, maxQueries = 12, detectedServiceIntents = [], placeTypes = [] } = params;
  const queries: OwnerStyleQuery[] = [];
  const seen = new Set<string>();
  const rejected: string[] = [];
  
  const { business_name, category_label, location_suburb, location_city, service_keywords } = identity;
  
  // Resolve category family
  const family = resolveCategoryFamily(category_label, placeTypes);
  const allowedServices = getAllowedServiceKeywords(family);
  
  // Filter service keywords by family
  const { allowed: allowedServiceKeywords, rejected: rejectedKeywords } = filterServiceKeywordsByFamily(
    service_keywords,
    family
  );
  rejected.push(...rejectedKeywords);
  
  // Also check detected service intents
  const { allowed: allowedDetected, rejected: rejectedDetected } = filterServiceKeywordsByFamily(
    detectedServiceIntents,
    family
  );
  rejected.push(...rejectedDetected);
  
  // Combine allowed services (prefer family keywords, then detected, then identity)
  const finalAllowedServices = [
    ...allowedServices.slice(0, 5), // Top 5 from family
    ...allowedServiceKeywords,
    ...allowedDetected,
  ];
  
  // Deduplicate
  const uniqueAllowedServices = Array.from(new Set(finalAllowedServices.map(s => s.toLowerCase())))
    .map(s => finalAllowedServices.find(orig => orig.toLowerCase() === s)!)
    .slice(0, 8); // Max 8 service keywords

  // ─── KEY FIX: inject actual category label as a keyword ──────────────
  // When the family is generic or retail (broad families), the category label
  // itself (e.g. "Shoe Store", "Gift Shop") is the most relevant search term.
  // We inject it as the first keyword so queries become
  // "shoe store in Modderfontein" instead of "business in Modderfontein".
  const GENERIC_CATEGORY_LABELS = new Set(['business', 'local business', 'store']);
  if (
    category_label &&
    !GENERIC_CATEGORY_LABELS.has(category_label.toLowerCase())
  ) {
    const catLower = category_label.toLowerCase();
    if (!uniqueAllowedServices.some(s => s.toLowerCase() === catLower)) {
      uniqueAllowedServices.unshift(catLower);
    }
  }
  
  // Determine location to use (prefer suburb, fallback to city)
  const location = location_suburb || location_city;
  
  if (!location) {
    // No location - can't build meaningful non-branded queries
    // Only return minimal branded queries
    if (business_name && business_name.length > 2) {
      queries.push({
        query: business_name,
        intent: 'branded',
        rationale: 'Brand name (no location available)',
      });
    }
    return queries.slice(0, maxQueries);
  }
  
  // =========================================================================
  // A) NON-BRANDED CORE (Primary - service + neighborhood)
  // =========================================================================
  
  // Use allowed services from family
  for (const service of uniqueAllowedServices.slice(0, 5)) {
    if (queries.length >= maxQueries - 3) break; // Reserve 3 for branded
    
    const addQuery = (q: string, rationale: string) => {
      const normalized = q.toLowerCase().trim();
      if (!seen.has(normalized) && isValidQuery(q, uniqueAllowedServices)) {
        seen.add(normalized);
        queries.push({ query: q.trim(), intent: 'non_branded', rationale });
      } else if (!seen.has(normalized)) {
        rejected.push(`Query rejected: "${q}" (contains blocked terms or invalid)`);
      }
    };
    
    // Service + suburb (most specific)
    if (location_suburb) {
      addQuery(`${service} in ${location_suburb}`, `Service "${service}" + suburb`);
      addQuery(`best ${service} in ${location_suburb}`, `Best + service "${service}" + suburb`);
    }
    
    // Service + city
    if (location_city) {
      addQuery(`${service} ${location_city}`, `Service "${service}" + city`);
      if (location_suburb && location_suburb !== location_city) {
        addQuery(`best ${service} in ${location_city}`, `Best + service "${service}" + city`);
      }
    }
  }
  
  // Fallback: if no non-branded queries were generated, use category label directly.
  // The category label was already injected into uniqueAllowedServices above, so this
  // only triggers when the main loop above produced zero queries (e.g. very short label).
  if (queries.length === 0 && category_label) {
    const categoryPhrase = CATEGORY_PHRASES[category_label] || category_label.toLowerCase();
    
    if (categoryPhrase && categoryPhrase !== 'business' && !isBlockedKeyword(categoryPhrase)) {
      const addQuery = (q: string, rationale: string) => {
        const normalized = q.toLowerCase().trim();
        if (!seen.has(normalized)) {
          seen.add(normalized);
          queries.push({ query: q.trim(), intent: 'non_branded', rationale });
        }
      };
      
      if (location_suburb) {
        addQuery(`best ${categoryPhrase} in ${location_suburb}`, `Best + category + suburb`);
        addQuery(`${categoryPhrase} in ${location_suburb}`, `Category + suburb`);
      }
      if (location_city) {
        addQuery(`${categoryPhrase} ${location_city}`, `Category + city`);
      }
    } else if (categoryPhrase && isBlockedKeyword(categoryPhrase)) {
      rejected.push(`Category phrase "${categoryPhrase}" is blocked`);
    }
  }
  
  // =========================================================================
  // B) BRANDED (Minimal - max 3)
  // =========================================================================
  
  if (business_name && business_name.length > 2) {
    const addBranded = (q: string, rationale: string) => {
      const normalized = q.toLowerCase().trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        queries.push({ query: q.trim(), intent: 'branded', rationale });
      }
    };
    
    addBranded(business_name, 'Brand name');
    if (location) {
      addBranded(`${business_name} ${location}`, 'Brand + location');
    }
    addBranded(`${business_name} reviews`, 'Brand reviews');
  }
  
  // Final validation pass - remove any queries that slipped through
  const validatedQueries = queries.filter(q => {
    if (q.intent === 'branded') return true; // Branded queries are always OK
    
    // For non-branded, must pass validation
    if (!isValidQuery(q.query, uniqueAllowedServices)) {
      rejected.push(`Final validation rejected: "${q.query}"`);
      return false;
    }
    return true;
  });
  
  return validatedQueries.slice(0, maxQueries);
}

/**
 * Get debug info for query generation
 */
export function getQueryGenerationDebug(params: {
  identity: BusinessIdentity;
  placeTypes?: string[];
}): QueryGenerationDebug {
  const { identity, placeTypes = [] } = params;
  const family = resolveCategoryFamily(identity.category_label, placeTypes);
  const { allowed, rejected } = filterServiceKeywordsByFamily(identity.service_keywords, family);
  
  const queries = buildOwnerStyleQueries({
    identity,
    placeTypes,
  });
  
  return {
    category_family: family,
    allowed_services_used: allowed,
    rejected_keywords: rejected,
    final_queries: queries.map(q => q.query),
  };
}
