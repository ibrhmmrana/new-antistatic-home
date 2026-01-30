/**
 * Search Visibility Module
 * Uses Google Custom Search Engine API to check SERP rankings
 * 
 * Updated with improved domain matching and competitor categorization
 */

import { fetchWithTimeout } from "@/lib/net/fetchWithTimeout";
import { consumeBody } from "@/lib/net/consumeBody";
import type { BusinessIdentity } from '@/lib/business/resolveBusinessIdentity';
import { buildOwnerStyleQueries, type OwnerStyleQuery } from './buildOwnerStyleQueries';
import { fetchMapPackForQuery, type MapPackResult, type MapPackResponse } from '@/lib/maps/fetchMapPackForQuery';
import { getFaviconUrl } from './favicon';
import { resolveCategoryFamily, filterServiceKeywordsByFamily } from './categoryFamilies';

// Types
export interface OrganicResult {
  position: number;
  title: string;
  link: string; // full URL
  displayLink?: string; // domain from CSE
  snippet?: string;
  faviconUrl?: string;
  domain: string; // normalized domain
}

export interface QueryResult {
  query: string;
  intent: 'branded' | 'non_branded';
  rationale: string;
  mapPack: {
    rank: number | null; // 1-3 if in map pack, null if unranked
    results: MapPackResult[]; // top 3
  };
  organic: {
    rank: number | null; // 1-10 if ranking, null if unranked
    results: OrganicResult[]; // top 10
  };
  notes: string;
}

export interface CompetitorDomain {
  domain: string;
  frequency: number;
  type: 'directory' | 'business';
  positions: number[];
}

export interface SearchVisibilityResult {
  queries: QueryResult[];
  visibility_score: number;
  share_of_voice: number;
  branded_visibility: number;
  non_branded_visibility: number;
  top_competitor_domains: CompetitorDomain[];
  directory_domains: CompetitorDomain[];
  business_domains: CompetitorDomain[];
  identity_used: {
    business_name: string;
    location_label: string | null;
    service_keywords: string[];
  };
  query_generation_debug?: {
    category_family: string;
    allowed_services_used: string[];
    rejected_keywords: string[];
  };
  error?: string;
}

// Directory/platform domains that should be categorized separately
const DIRECTORY_DOMAINS = new Set([
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com',
  'youtube.com', 'tiktok.com', 'pinterest.com',
  'tripadvisor.com', 'tripadvisor.co.za', 'yelp.com', 'zomato.com',
  'booking.com', 'airbnb.com', 'expedia.com', 'hotels.com',
  'google.com', 'maps.google.com',
  'reddit.com', 'quora.com', 'medium.com',
  'wikipedia.org', 'wikimedia.org',
  'amazon.com', 'ebay.com', 'alibaba.com',
  'yellowpages.com', 'yelp.com', 'foursquare.com',
  'trustpilot.com', 'glassdoor.com',
  'gov.za', 'gov.uk', 'gov.au', 'gov',
  'edu', 'ac.za', 'ac.uk',
  'pubmed.ncbi.nlm.nih.gov', 'nih.gov', 'ncbi.nlm.nih.gov',
  'medicaid.gov', 'medicare.gov',
  'homedepot.com', 'lowes.com', // retail chains (not competitors for local)
]);

/**
 * Normalize domain for comparison
 */
function normalizeDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname
      .replace(/^www\./, '')
      .replace(/^m\./, '') // mobile subdomain
      .replace(/^mobile\./, '')
      .toLowerCase();
  } catch {
    return url.toLowerCase().replace(/^www\./, '').replace(/^https?:\/\//, '');
  }
}

/**
 * Get registrable domain (e.g., "sub.example.co.za" -> "example.co.za")
 */
function getRegistrableDomain(host: string): string {
  const parts = host.split('.');
  
  // Handle common 2-part TLDs
  if (parts.length >= 3) {
    const last2 = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
    if (['co.za', 'co.uk', 'com.au', 'co.nz', 'org.za', 'net.za', 'org.uk'].includes(last2)) {
      return parts.slice(-3).join('.');
    }
  }
  
  // Default: last 2 parts
  return parts.slice(-2).join('.');
}

/**
 * Check if result domain matches target website
 */
function isDomainMatch(resultUrl: string, targetHost: string): boolean {
  const resultHost = normalizeDomain(resultUrl);
  const targetNormalized = normalizeDomain(targetHost);
  
  // Exact match
  if (resultHost === targetNormalized) return true;
  
  // Subdomain match (result is subdomain of target)
  if (resultHost.endsWith(`.${targetNormalized}`)) return true;
  
  // Target is subdomain of result (less common but possible)
  if (targetNormalized.endsWith(`.${resultHost}`)) return true;
  
  // Registrable domain match
  const resultRegistrable = getRegistrableDomain(resultHost);
  const targetRegistrable = getRegistrableDomain(targetNormalized);
  if (resultRegistrable === targetRegistrable) return true;
  
  return false;
}

/**
 * Check if domain is a directory/platform
 */
function isDirectoryDomain(domain: string): boolean {
  const normalized = normalizeDomain(domain);
  
  // Check exact match
  if (DIRECTORY_DOMAINS.has(normalized)) return true;
  
  // Check if it's a subdomain of a directory
  for (const dir of Array.from(DIRECTORY_DOMAINS)) {
    if (normalized.endsWith(`.${dir}`)) return true;
  }
  
  // Check for government/edu domains
  if (normalized.endsWith('.gov') || normalized.endsWith('.edu') || 
      normalized.includes('.gov.') || normalized.includes('.edu.')) {
    return true;
  }
  
  return false;
}

/**
 * Fetch results from Google Custom Search Engine API
 * Returns full organic results with favicons
 */
async function fetchCseResults(query: string): Promise<OrganicResult[]> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  
  if (!apiKey || !cx) {
    console.log('[SEARCH-VIS] CSE API key or CX not configured');
    return [];
  }
  
  try {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('cx', cx);
    url.searchParams.set('q', query);
    url.searchParams.set('num', '10');
    
    const response = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json" },
      timeoutMs: 10000,
      retries: 2,
    });

    if (!response.ok) {
      await consumeBody(response);
      console.log(`[SEARCH-VIS] CSE API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    
    if (!data.items || !Array.isArray(data.items)) {
      return [];
    }
    
    return data.items.map((item: any, index: number) => {
      const displayLink = item.displayLink || '';
      const link = item.link || '';
      const domain = normalizeDomain(link || displayLink || '');
      
      return {
        position: index + 1,
        title: item.title || '',
        link,
        displayLink,
        snippet: item.snippet || '',
        domain,
        faviconUrl: getFaviconUrl(link, displayLink),
      };
    });
  } catch (error) {
    console.error(`[SEARCH-VIS] Error fetching CSE results for "${query}":`, error);
    return [];
  }
}

/**
 * Analyze a single query result (Owner-style: Map Pack + Organic)
 */
function analyzeQueryResult(
  ownerQuery: OwnerStyleQuery,
  mapPack: MapPackResponse,
  organicResults: OrganicResult[],
  targetHost: string
): QueryResult {
  // Find organic rank
  let organicRank: number | null = null;
  for (const result of organicResults) {
    if (isDomainMatch(result.link, targetHost)) {
      organicRank = result.position;
      break;
    }
  }
  
  // Generate notes
  const notesParts: string[] = [];
  
  if (mapPack.rank !== null) {
    notesParts.push(`Map Pack #${mapPack.rank}`);
  } else {
    notesParts.push('Unranked map pack');
  }
  
  if (organicRank !== null) {
    if (organicRank === 1) {
      notesParts.push('🏆 Organic #1');
    } else if (organicRank <= 3) {
      notesParts.push(`Organic #${organicRank}`);
    } else {
      notesParts.push(`Organic #${organicRank}`);
    }
  } else {
    notesParts.push('Unranked organic');
  }
  
  return {
    query: ownerQuery.query,
    intent: ownerQuery.intent,
    rationale: ownerQuery.rationale,
    mapPack: {
      rank: mapPack.rank,
      results: mapPack.results,
    },
    organic: {
      rank: organicRank,
      results: organicResults,
    },
    notes: notesParts.join(' • '),
  };
}

/**
 * Calculate visibility scores
 */
function calculateScores(queryResults: QueryResult[]): {
  visibility_score: number;
  share_of_voice: number;
  branded_visibility: number;
  non_branded_visibility: number;
} {
  if (queryResults.length === 0) {
    return { visibility_score: 0, share_of_voice: 0, branded_visibility: 0, non_branded_visibility: 0 };
  }
  
  const maxPointsPerQuery = 10;
  
  // Calculate overall (consider both map pack and organic)
  let totalPoints = 0;
  for (const qr of queryResults) {
    let points = 0;
    
    // Map pack points (higher weight)
    if (qr.mapPack.rank !== null) {
      if (qr.mapPack.rank === 1) points += 6;
      else if (qr.mapPack.rank === 2) points += 4;
      else if (qr.mapPack.rank === 3) points += 2;
    }
    
    // Organic points
    if (qr.organic.rank !== null) {
      if (qr.organic.rank === 1) points += 4;
      else if (qr.organic.rank <= 3) points += 3;
      else if (qr.organic.rank <= 5) points += 2;
      else if (qr.organic.rank <= 10) points += 1;
    }
    
    totalPoints += points;
  }
  
  const visibility_score = Math.round((totalPoints / (queryResults.length * maxPointsPerQuery)) * 100);
  
  // Share of voice (ranking in either map pack or organic)
  const rankingQueries = queryResults.filter(qr => 
    qr.mapPack.rank !== null || qr.organic.rank !== null
  ).length;
  const share_of_voice = Math.round((rankingQueries / queryResults.length) * 100);
  
  // Branded vs non-branded
  const brandedQueries = queryResults.filter(qr => qr.intent === 'branded');
  const nonBrandedQueries = queryResults.filter(qr => qr.intent === 'non_branded');
  
  const brandedRanking = brandedQueries.filter(qr => 
    qr.mapPack.rank !== null || qr.organic.rank !== null
  ).length;
  const nonBrandedRanking = nonBrandedQueries.filter(qr => 
    qr.mapPack.rank !== null || qr.organic.rank !== null
  ).length;
  
  const branded_visibility = brandedQueries.length > 0 
    ? Math.round((brandedRanking / brandedQueries.length) * 100) 
    : 0;
  const non_branded_visibility = nonBrandedQueries.length > 0 
    ? Math.round((nonBrandedRanking / nonBrandedQueries.length) * 100) 
    : 0;
  
  return { visibility_score, share_of_voice, branded_visibility, non_branded_visibility };
}

/**
 * Get top competitor domains across all queries
 */
function aggregateCompetitorDomains(queryResults: QueryResult[], targetHost: string, targetPlaceId: string | null): {
  all: CompetitorDomain[];
  directories: CompetitorDomain[];
  businesses: CompetitorDomain[];
} {
  const domainData: Map<string, { frequency: number; type: 'directory' | 'business'; positions: number[] }> = new Map();
  
  for (const qr of queryResults) {
    // Extract competitors from map pack (other businesses in top 3)
    for (const mapResult of qr.mapPack.results) {
      if (mapResult.place_id === targetPlaceId) continue; // Skip user's business
      
      // Use website domain if available, otherwise use name as identifier
      if (mapResult.website) {
        const domain = normalizeDomain(mapResult.website);
        if (!isDomainMatch(mapResult.website, targetHost)) {
          const existing = domainData.get(domain);
          if (existing) {
            existing.frequency++;
          } else {
            domainData.set(domain, {
              frequency: 1,
              type: 'business',
              positions: [],
            });
          }
        }
      }
    }
    
    // Extract competitors from organic results (exclude target domain)
    for (const result of qr.organic.results) {
      if (isDomainMatch(result.link, targetHost)) continue;
      
      const type = isDirectoryDomain(result.domain) ? 'directory' : 'business';
      const existing = domainData.get(result.domain);
      
      if (existing) {
        existing.frequency++;
        existing.positions.push(result.position);
      } else {
        domainData.set(result.domain, {
          frequency: 1,
          type,
          positions: [result.position],
        });
      }
    }
  }
  
  // Convert to sorted arrays
  const all: CompetitorDomain[] = [];
  const directories: CompetitorDomain[] = [];
  const businesses: CompetitorDomain[] = [];
  
  for (const [domain, data] of Array.from(domainData)) {
    const item: CompetitorDomain = {
      domain,
      frequency: data.frequency,
      type: data.type,
      positions: data.positions,
    };
    
    all.push(item);
    if (data.type === 'directory') {
      directories.push(item);
    } else {
      businesses.push(item);
    }
  }
  
  // Sort by frequency descending
  const sortFn = (a: CompetitorDomain, b: CompetitorDomain) => b.frequency - a.frequency;
  all.sort(sortFn);
  directories.sort(sortFn);
  businesses.sort(sortFn);
  
  return {
    all: all.slice(0, 15),
    directories: directories.slice(0, 10),
    businesses: businesses.slice(0, 10),
  };
}

/**
 * Main function to get search visibility
 * Now uses BusinessIdentity for accurate query generation
 */
export async function getSearchVisibility(params: {
  identity: BusinessIdentity;
  maxQueries?: number;
  hasMenuPage?: boolean;
  hasPricingPage?: boolean;
}): Promise<SearchVisibilityResult> {
  const { identity, maxQueries = 10, hasMenuPage = false, hasPricingPage = false } = params;
  
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  
  if (!apiKey || !cx) {
    return {
      queries: [],
      visibility_score: 0,
      share_of_voice: 0,
      branded_visibility: 0,
      non_branded_visibility: 0,
      top_competitor_domains: [],
      directory_domains: [],
      business_domains: [],
      identity_used: {
        business_name: identity.business_name,
        location_label: identity.location_label,
        service_keywords: identity.service_keywords,
      },
      error: 'Google CSE API not configured (missing GOOGLE_CSE_API_KEY or GOOGLE_CSE_CX)',
    };
  }
  
  try {
    // Generate Owner-style queries (non-branded, category + neighborhood)
    const ownerQueries = buildOwnerStyleQueries({
      identity,
      maxQueries,
      detectedServiceIntents: [], // TODO: Extract from site content if available
      placeTypes: identity.place_types || [],
    });
    
    // Get query generation debug info
    const family = resolveCategoryFamily(identity.category_label, identity.place_types || []);
    const { allowed, rejected } = filterServiceKeywordsByFamily(identity.service_keywords, family);
    const queryGenDebug = {
      category_family: family,
      allowed_services_used: allowed,
      rejected_keywords: rejected,
    };
    
    console.log(`[SEARCH-VIS] Generated ${ownerQueries.length} Owner-style queries for "${identity.business_name}"`);
    console.log(`[SEARCH-VIS] Category family: ${family}, Allowed services: ${allowed.length}, Rejected: ${rejected.length}`);
    ownerQueries.forEach(q => console.log(`  - [${q.intent}] "${q.query}" (${q.rationale})`));
    
    // Fetch results for each query (Map Pack + Organic)
    const queryResults: QueryResult[] = [];
    
    for (const ownerQuery of ownerQueries) {
      console.log(`[SEARCH-VIS] Analyzing: "${ownerQuery.query}"`);
      
      // Get Map Pack results (query-specific, if we have place_id and lat/lng)
      let mapPack: MapPackResponse = { rank: null, results: [] };
      if (identity.place_id && identity.latlng) {
        mapPack = await fetchMapPackForQuery({
          query: ownerQuery.query,
          userPlaceId: identity.place_id,
          userLatLng: identity.latlng,
          radiusMeters: 4000,
        });
      } else {
        console.log(`[SEARCH-VIS] Skipping map pack for "${ownerQuery.query}" (no place_id or lat/lng)`);
      }
      
      // Get Organic ranking via CSE
      const organicResults = await fetchCseResults(ownerQuery.query);
      
      // Analyze combined result
      const analysis = analyzeQueryResult(
        ownerQuery,
        mapPack,
        organicResults,
        identity.website_host
      );
      queryResults.push(analysis);
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Calculate scores
    const scores = calculateScores(queryResults);
    
    // Aggregate competitors from map pack + organic results
    const competitors = aggregateCompetitorDomains(queryResults, identity.website_host, identity.place_id);
    
    console.log(`[SEARCH-VIS] Visibility: ${scores.visibility_score}%, SOV: ${scores.share_of_voice}%`);
    console.log(`[SEARCH-VIS] Branded: ${scores.branded_visibility}%, Non-branded: ${scores.non_branded_visibility}%`);
    
    return {
      queries: queryResults,
      ...scores,
      top_competitor_domains: competitors.all,
      directory_domains: competitors.directories,
      business_domains: competitors.businesses,
      identity_used: {
        business_name: identity.business_name,
        location_label: identity.location_label,
        service_keywords: identity.service_keywords,
      },
      query_generation_debug: queryGenDebug,
    };
  } catch (error) {
    console.error('[SEARCH-VIS] Error:', error);
    return {
      queries: [],
      visibility_score: 0,
      share_of_voice: 0,
      branded_visibility: 0,
      non_branded_visibility: 0,
      top_competitor_domains: [],
      directory_domains: [],
      business_domains: [],
      identity_used: {
        business_name: identity.business_name,
        location_label: identity.location_label,
        service_keywords: identity.service_keywords,
      },
      query_generation_debug: {
        category_family: 'generic_local_business',
        allowed_services_used: [],
        rejected_keywords: [],
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
