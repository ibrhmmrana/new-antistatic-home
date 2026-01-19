import { NextRequest, NextResponse } from 'next/server';
import { chromium as pwChromium } from 'playwright-core';
import type { Browser, Page, BrowserContext } from 'playwright-core';
import chromium from '@sparticuz/chromium';

// Import the new SEO modules
import { resolveBusinessIdentity, BusinessIdentity, WebsiteExtractedData } from '@/lib/business/resolveBusinessIdentity';
import { getSearchVisibility, SearchVisibilityResult } from '@/lib/seo/searchVisibility';
import { getCompetitorSnapshot, CompetitorsSnapshot } from '@/lib/seo/competitors';

export const runtime = 'nodejs';

const TIMEOUT_MS = 60000; // 60 seconds

// Simple mutex to prevent concurrent browser launches
let browserLaunchLock = false;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // Start with 1 second

/**
 * Launch browser with retry logic for ETXTBSY errors
 */
async function launchBrowserWithRetry(
  executablePath: string | undefined,
  isServerless: boolean,
  retries = MAX_RETRIES
): Promise<Browser> {
  // Wait for lock to be released
  while (browserLaunchLock) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      browserLaunchLock = true;
      
      // Add small delay between attempts to avoid race conditions
      if (attempt > 0) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`[WEBSITE-SCRAPE] Retry attempt ${attempt + 1}/${retries} after ${delay}ms delay...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const browser = await pwChromium.launch({
        headless: true,
        args: [
          ...(isServerless ? chromium.args : []),
          '--disable-blink-features=AutomationControlled',
          '--window-size=1920,1080',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ],
        executablePath,
        timeout: TIMEOUT_MS,
      });

      browserLaunchLock = false;
      console.log(`[WEBSITE-SCRAPE] Browser launched successfully (attempt ${attempt + 1})`);
      return browser;
    } catch (error: any) {
      browserLaunchLock = false;
      
      // Check if it's an ETXTBSY error or related spawn error
      const isETXTBSY = error?.message?.includes('ETXTBSY') || 
                       error?.message?.includes('spawn') ||
                       error?.code === 'ETXTBSY' ||
                       error?.message?.includes('Text file busy');
      
      if (isETXTBSY && attempt < retries - 1) {
        console.warn(`[WEBSITE-SCRAPE] Browser launch failed (ETXTBSY/spawn error), retrying... (attempt ${attempt + 1}/${retries})`);
        continue;
      }
      
      // If it's the last attempt or not an ETXTBSY error, throw
      if (attempt === retries - 1) {
        console.error(`[WEBSITE-SCRAPE] Browser launch failed after ${retries} attempts:`, error?.message || error);
      }
      throw error;
    } finally {
      // Ensure lock is always released
      browserLaunchLock = false;
    }
  }
  
  throw new Error('Failed to launch browser after all retries');
}

/**
 * Sets up stealth properties to avoid bot detection
 */
async function setupStealth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: PermissionDescriptor) => (
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : originalQuery(parameters)
    );

    // Hide automation indicators
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  });
}

// Types for the scraper output
interface ContactMethods {
  phone: string[];
  email: string[];
  whatsapp: string[];
  forms: number;
  locations: string[];
}

interface ClickableActions {
  tel_links: string[];
  mailto_links: string[];
  whatsapp_links: string[];
}

interface PrimaryCTA {
  button_text: string | null;
  destination: string | null;
  above_fold: boolean;
}

interface FormInfo {
  type: string;
  fields: string[];
  required_fields: string[];
  submit_endpoint: string | null;
}

interface TrustSignals {
  testimonials: string[];
  review_widgets: string[];
  awards: string[];
  case_studies: number;
  team_members: number;
}

interface PricingSignals {
  has_pricing: boolean;
  price_ranges: string[];
  hidden_pricing: boolean;
}

interface LocalSEO {
  location_pages: string[];
  has_embedded_map: boolean;
  opening_hours: string | null;
}

interface StructuredDataItem {
  type: string;
  format: string;
  data: Record<string, unknown>;
}

interface SocialMeta {
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  twitter_card: string | null;
}

interface ImageAnalysis {
  hero_image: string | null;
  logo_url: string | null;
  total_images: number;
  images_with_alt: number;
  alt_text_coverage: string;
  largest_images: { url: string; estimated_size: string }[];
}

interface PerformanceMetrics {
  html_size_kb: number;
  asset_count: { js: number; css: number; images: number };
  third_party_scripts: string[];
}

interface AnalyticsTrackers {
  google_analytics: boolean;
  ga4: boolean;
  gtm: string | null;
  meta_pixel: boolean;
  tiktok_pixel: boolean;
  hotjar: boolean;
  other: string[];
}

interface SecurityInfo {
  is_https: boolean;
  mixed_content: boolean;
  security_headers: string[];
}

interface BrandConsistency {
  business_name_variants: string[];
  logo_count: number;
  copyright_text: string | null;
}

interface FreshnessSignals {
  last_blog_post: string | null;
  copyright_year: string | null;
  recent_dates: string[];
}

// ============================================================================
// OWNER-LEVEL ENHANCED TYPES
// ============================================================================

interface ViewportChecks {
  primary_cta_visible: boolean;
  primary_cta_text: string | null;
  primary_cta_href: string | null;
  cta_position: 'header' | 'hero' | 'body' | 'unknown';
  tel_visible: boolean;
  whatsapp_visible: boolean;
  email_visible: boolean;
}

interface ContentDigest {
  render_mode: 'playwright';
  main_text: string;
  above_fold_text: string;
  content_snippet: string;
  word_count_visible: number;
  content_hash: string;
  top_phrases: string[];
  entities: {
    locations: string[];
    brand_variants: string[];
    service_keywords: string[];
  };
}

interface EnhancedTrustSignals {
  has_testimonials: boolean;
  testimonial_samples: string[];
  has_reviews_widget: boolean;
  review_widget_types: string[];
  has_awards_badges: boolean;
  award_mentions: string[];
  has_social_proof_numbers: boolean;
  social_proof_samples: string[];
  has_team_section: boolean;
  trust_blocks_found: string[];
}

interface UXChecks {
  has_h1: boolean;
  meta_description_missing: boolean;
  multiple_h1: boolean;
  thin_content: boolean;
  has_clear_contact_path: boolean;
  has_local_intent_terms: boolean;
  has_service_terms: boolean;
  has_pricing_signals: boolean;
  has_faq: boolean;
  blocked_by_captcha: boolean;
}

interface OwnerFinding {
  severity: 'high' | 'medium' | 'low';
  category: string;
  issue: string;
  evidence: string;
  page_url: string;
  fix: string;
}

interface KeyPages {
  homepage: string | null;
  contact_page: string | null;
  booking_or_lead_page: string | null;
  pricing_page: string | null;
  about_page: string | null;
  services_page: string | null;
}

interface IntentCoverage {
  has_services: boolean;
  has_pricing: boolean;
  has_contact: boolean;
  has_about: boolean;
  has_faq: boolean;
  has_locations: boolean;
  has_blog: boolean;
  has_booking: boolean;
}

interface SiteReportSummary {
  key_pages: KeyPages;
  intent_coverage: IntentCoverage;
  conversion_path_score: number;
  content_quality_score: number;
  trust_score: number;
  owner_style_findings: OwnerFinding[];
  thin_pages_count: number;
  near_duplicate_groups: string[][];
}

interface PageData {
  url: string;
  depth: number;
  http_status: number;
  redirect_chain: string[];
  page_type: string;
  title: string | null;
  title_length: number;
  meta_description: string | null;
  meta_desc_length: number;
  h1_text: string[];
  h1_count: number;
  headings: {
    h2: string[];
    h3: string[];
    h4: string[];
  };
  canonical_url: string | null;
  canonical_consistent: boolean;
  indexability: {
    meta_robots: string | null;
    x_robots_tag: string | null;
    is_indexable: boolean;
  };
  primary_intent: string;
  word_count: number;
  internal_links: string[];
  internal_link_count: number;
  external_links: {
    social: string[];
    booking: string[];
    reviews: string[];
    other: string[];
  };
  money_page_links: string[];
  contact_methods: ContactMethods;
  clickable_actions: ClickableActions;
  primary_cta: PrimaryCTA;
  forms: FormInfo[];
  trust_signals: TrustSignals;
  pricing_signals: PricingSignals;
  local_seo: LocalSEO;
  structured_data: StructuredDataItem[];
  social_meta: SocialMeta;
  images: ImageAnalysis;
  performance: PerformanceMetrics;
  analytics: AnalyticsTrackers;
  brand_consistency: BrandConsistency;
  security: SecurityInfo;
  freshness: FreshnessSignals;
  // Owner-level enhanced fields
  content_digest: ContentDigest;
  viewport_checks: ViewportChecks;
  enhanced_trust_signals: EnhancedTrustSignals;
  ux_checks: UXChecks;
}

interface SiteOverview {
  homepage_url: string;
  robots_txt: string | null;
  sitemap_urls: string[];
  primary_domain: string;
  cms_detected: string | null;
  https_enforced: boolean;
  favicon_url: string | null;
}

interface ScrapeResult {
  scrape_metadata: {
    domain: string;
    timestamp: string;
    crawl_duration_seconds: number;
    pages_crawled: number;
    crawl_depth: number;
  };
  site_overview: SiteOverview;
  crawl_map: PageData[];
  site_graph: {
    internal_link_matrix: Record<string, string[]>;
    orphan_pages: string[];
  };
  summary_metrics: {
    total_pages: number;
    indexable_pages: number;
    pages_with_issues: number;
    seo_score: number;
    technical_score: number;
  };
  // Owner-level site summary
  site_report_summary: SiteReportSummary;
  // NEW: Business identity, Search visibility, and competitors
  business_identity?: BusinessIdentity;
  search_visibility?: SearchVisibilityResult;
  competitors_snapshot?: CompetitorsSnapshot;
}

// Helper functions
function normalizeUrl(url: string, baseUrl: string): string | null {
  try {
    if (url.startsWith('javascript:') || url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('#')) {
      return null;
    }
    const normalized = new URL(url, baseUrl);
    // Remove hash and normalize
    normalized.hash = '';
    // Remove trailing slash for consistency
    let href = normalized.href;
    if (href.endsWith('/') && normalized.pathname !== '/') {
      href = href.slice(0, -1);
    }
    return href;
  } catch {
    return null;
  }
}

function isSameDomain(url: string, baseDomain: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname === baseDomain || urlObj.hostname.endsWith('.' + baseDomain);
  } catch {
    return false;
  }
}

function classifyExternalLink(url: string): { category: string; url: string } {
  const lowerUrl = url.toLowerCase();
  
  // Social media
  if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.com')) {
    return { category: 'social', url };
  }
  if (lowerUrl.includes('instagram.com')) {
    return { category: 'social', url };
  }
  if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) {
    return { category: 'social', url };
  }
  if (lowerUrl.includes('linkedin.com')) {
    return { category: 'social', url };
  }
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
    return { category: 'social', url };
  }
  if (lowerUrl.includes('tiktok.com')) {
    return { category: 'social', url };
  }
  if (lowerUrl.includes('pinterest.com')) {
    return { category: 'social', url };
  }
  
  // Booking platforms
  if (lowerUrl.includes('calendly.com')) {
    return { category: 'booking', url };
  }
  if (lowerUrl.includes('booking.com')) {
    return { category: 'booking', url };
  }
  if (lowerUrl.includes('opentable.com')) {
    return { category: 'booking', url };
  }
  if (lowerUrl.includes('resurva.com')) {
    return { category: 'booking', url };
  }
  if (lowerUrl.includes('acuityscheduling.com')) {
    return { category: 'booking', url };
  }
  
  // Reviews
  if (lowerUrl.includes('google.com/maps') || lowerUrl.includes('goo.gl/maps')) {
    return { category: 'reviews', url };
  }
  if (lowerUrl.includes('yelp.com')) {
    return { category: 'reviews', url };
  }
  if (lowerUrl.includes('trustpilot.com')) {
    return { category: 'reviews', url };
  }
  if (lowerUrl.includes('tripadvisor.com')) {
    return { category: 'reviews', url };
  }
  
  // WhatsApp
  if (lowerUrl.includes('wa.me') || lowerUrl.includes('whatsapp.com')) {
    return { category: 'social', url };
  }
  
  return { category: 'other', url };
}

function classifyPageType(url: string, title: string | null, h1: string[], content: string): string {
  const lowerUrl = url.toLowerCase();
  const lowerTitle = (title || '').toLowerCase();
  const lowerH1 = h1.map(h => h.toLowerCase()).join(' ');
  const lowerContent = content.toLowerCase().slice(0, 5000); // First 5000 chars
  
  // URL pattern matching
  if (lowerUrl.includes('/contact') || lowerUrl.includes('/get-in-touch')) return 'contact';
  if (lowerUrl.includes('/about') || lowerUrl.includes('/who-we-are')) return 'about';
  if (lowerUrl.includes('/blog') || lowerUrl.includes('/news') || lowerUrl.includes('/article')) return 'blog';
  if (lowerUrl.includes('/service') || lowerUrl.includes('/what-we-do')) return 'service';
  if (lowerUrl.includes('/product')) return 'product';
  if (lowerUrl.includes('/pricing') || lowerUrl.includes('/prices') || lowerUrl.includes('/cost')) return 'pricing';
  if (lowerUrl.includes('/book') || lowerUrl.includes('/appointment') || lowerUrl.includes('/schedule')) return 'booking';
  if (lowerUrl.includes('/faq') || lowerUrl.includes('/frequently-asked')) return 'faq';
  if (lowerUrl.includes('/location') || lowerUrl.includes('/find-us') || lowerUrl.includes('/store')) return 'location';
  if (lowerUrl.includes('/team') || lowerUrl.includes('/staff') || lowerUrl.includes('/people')) return 'team';
  if (lowerUrl.includes('/portfolio') || lowerUrl.includes('/work') || lowerUrl.includes('/projects')) return 'portfolio';
  if (lowerUrl.includes('/testimonial') || lowerUrl.includes('/review')) return 'testimonials';
  if (lowerUrl.includes('/privacy')) return 'legal';
  if (lowerUrl.includes('/terms')) return 'legal';
  
  // Homepage detection
  const urlObj = new URL(url);
  if (urlObj.pathname === '/' || urlObj.pathname === '') return 'home';
  
  // Content-based classification
  if (lowerTitle.includes('contact') || lowerH1.includes('contact')) return 'contact';
  if (lowerTitle.includes('about') || lowerH1.includes('about us')) return 'about';
  if (lowerContent.includes('frequently asked questions') || lowerH1.includes('faq')) return 'faq';
  if (lowerContent.includes('our services') || lowerH1.includes('services')) return 'service';
  
  return 'general';
}

function detectCMS(html: string, scripts: string[]): string | null {
  const lowerHtml = html.toLowerCase();
  
  // WordPress
  if (lowerHtml.includes('wp-content') || lowerHtml.includes('wp-includes') || lowerHtml.includes('wp-json')) {
    return 'WordPress';
  }
  
  // Shopify
  if (lowerHtml.includes('shopify') || lowerHtml.includes('.myshopify.com') || lowerHtml.includes('cdn.shopify.com')) {
    return 'Shopify';
  }
  
  // Webflow
  if (lowerHtml.includes('webflow') || scripts.some(s => s.includes('webflow.com'))) {
    return 'Webflow';
  }
  
  // Wix
  if (lowerHtml.includes('wix.com') || lowerHtml.includes('wixsite.com') || lowerHtml.includes('_wix')) {
    return 'Wix';
  }
  
  // Squarespace
  if (lowerHtml.includes('squarespace') || lowerHtml.includes('sqsp')) {
    return 'Squarespace';
  }
  
  // Drupal
  if (lowerHtml.includes('drupal') || lowerHtml.includes('/sites/default/files')) {
    return 'Drupal';
  }
  
  // Joomla
  if (lowerHtml.includes('joomla') || lowerHtml.includes('/media/jui')) {
    return 'Joomla';
  }
  
  // Next.js
  if (lowerHtml.includes('_next/static') || lowerHtml.includes('__next')) {
    return 'Next.js';
  }
  
  // Ghost
  if (lowerHtml.includes('ghost.io') || lowerHtml.includes('ghost-')) {
    return 'Ghost';
  }
  
  // HubSpot
  if (lowerHtml.includes('hubspot') || lowerHtml.includes('hs-scripts')) {
    return 'HubSpot';
  }
  
  return null;
}

function extractPhoneNumbers(text: string): string[] {
  const phonePatterns = [
    /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
    /(?:\+?27[-.\s]?)?(?:\(?\d{2}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g, // South Africa
    /(?:\+?44[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g, // UK
    /\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, // International
  ];
  
  const phones: Set<string> = new Set();
  for (const pattern of phonePatterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        const cleaned = match.replace(/[^\d+]/g, '');
        if (cleaned.length >= 10 && cleaned.length <= 15) {
          phones.add(match.trim());
        }
      }
    }
  }
  return Array.from(phones);
}

function extractEmails(text: string): string[] {
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailPattern);
  if (matches) {
    return Array.from(new Set(matches)).filter(email => 
      !email.includes('example.com') && 
      !email.includes('@2x') &&
      !email.includes('.png') &&
      !email.includes('.jpg')
    );
  }
  return [];
}

// ============================================================================
// OWNER-LEVEL HELPER FUNCTIONS
// ============================================================================

/**
 * Simple hash function for content deduplication
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Extract top phrases using simple frequency analysis
 */
function extractTopPhrases(text: string, count: number = 10): string[] {
  // Clean and tokenize
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);
  
  // Stop words to exclude
  const stopWords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her',
    'was', 'one', 'our', 'out', 'has', 'have', 'been', 'will', 'more', 'when',
    'with', 'they', 'from', 'this', 'that', 'what', 'were', 'said', 'each',
    'which', 'their', 'there', 'about', 'would', 'these', 'other', 'into',
    'than', 'then', 'some', 'could', 'them', 'very', 'your', 'just', 'also'
  ]);
  
  // Count word frequencies
  const freq: Record<string, number> = {};
  for (const word of words) {
    if (!stopWords.has(word)) {
      freq[word] = (freq[word] || 0) + 1;
    }
  }
  
  // Extract 2-grams
  const bigrams: Record<string, number> = {};
  for (let i = 0; i < words.length - 1; i++) {
    if (!stopWords.has(words[i]) && !stopWords.has(words[i + 1])) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      bigrams[bigram] = (bigrams[bigram] || 0) + 1;
    }
  }
  
  // Combine and sort
  const combined = [
    ...Object.entries(freq).filter(([, v]) => v > 1).map(([k, v]) => ({ phrase: k, score: v })),
    ...Object.entries(bigrams).filter(([, v]) => v > 1).map(([k, v]) => ({ phrase: k, score: v * 2 })) // Weight bigrams
  ];
  
  combined.sort((a, b) => b.score - a.score);
  return combined.slice(0, count).map(p => p.phrase);
}

/**
 * Extract basic entities from text
 */
function extractEntities(text: string, businessName: string | null): {
  locations: string[];
  brand_variants: string[];
  service_keywords: string[];
} {
  const locations: string[] = [];
  const brandVariants: string[] = [];
  const serviceKeywords: string[] = [];
  
  // Common location patterns
  const locationPatterns = [
    /\b(Cape Town|Johannesburg|Durban|Pretoria|Port Elizabeth|Bloemfontein)\b/gi,
    /\b(London|New York|Los Angeles|Sydney|Melbourne|Toronto)\b/gi,
    /\b(Street|Road|Avenue|Drive|Boulevard|Lane|Place)\b/gi,
    /\b\d{4,5}\b/g, // Postal codes
  ];
  
  for (const pattern of locationPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        if (!locations.includes(match) && locations.length < 10) {
          locations.push(match);
        }
      }
    }
  }
  
  // Brand name variants
  if (businessName) {
    const nameWords = businessName.toLowerCase().split(/\s+/);
    const textLower = text.toLowerCase();
    for (const word of nameWords) {
      if (word.length > 2 && textLower.includes(word) && !brandVariants.includes(word)) {
        brandVariants.push(word);
      }
    }
  }
  
  // Service keywords
  const servicePatterns = [
    /\b(service|services|offering|offerings|solution|solutions)\b/gi,
    /\b(consultation|consulting|support|maintenance|repair|installation)\b/gi,
    /\b(delivery|shipping|booking|reservation|appointment)\b/gi,
    /\b(menu|food|cuisine|restaurant|cafe|dining)\b/gi,
    /\b(product|products|shop|store|buy|purchase)\b/gi,
  ];
  
  for (const pattern of servicePatterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        const lower = match.toLowerCase();
        if (!serviceKeywords.includes(lower) && serviceKeywords.length < 15) {
          serviceKeywords.push(lower);
        }
      }
    }
  }
  
  return { locations, brand_variants: brandVariants, service_keywords: serviceKeywords };
}

/**
 * Detect trust signals in text
 */
function detectTrustSignals(text: string, html: string): EnhancedTrustSignals {
  const lowerText = text.toLowerCase();
  const lowerHtml = html.toLowerCase();
  
  // Testimonials
  const testimonialPatterns = [
    /testimonial/gi,
    /what\s+(our|clients?|customers?)\s+say/gi,
    /reviews?\s+from/gi,
    /"[^"]{20,200}"\s*[-–—]\s*[A-Z]/g, // Quote with attribution
  ];
  const testimonialSamples: string[] = [];
  let hasTestimonials = false;
  
  for (const pattern of testimonialPatterns) {
    if (pattern.test(lowerText) || pattern.test(lowerHtml)) {
      hasTestimonials = true;
    }
  }
  
  // Extract testimonial samples (quoted text)
  const quoteMatches = text.match(/"[^"]{30,200}"/g);
  if (quoteMatches) {
    testimonialSamples.push(...quoteMatches.slice(0, 2).map(q => q.slice(0, 150)));
    hasTestimonials = true;
  }
  
  // Reviews widgets
  const reviewWidgetTypes: string[] = [];
  if (lowerHtml.includes('google.com/maps') || lowerHtml.includes('maps.googleapis')) {
    reviewWidgetTypes.push('Google Maps');
  }
  if (lowerHtml.includes('tripadvisor')) {
    reviewWidgetTypes.push('TripAdvisor');
  }
  if (lowerHtml.includes('yelp.com')) {
    reviewWidgetTypes.push('Yelp');
  }
  if (lowerHtml.includes('trustpilot')) {
    reviewWidgetTypes.push('Trustpilot');
  }
  if (/\d(\.\d)?\s*(out of\s*5|\/\s*5|\s*stars?)/i.test(text)) {
    reviewWidgetTypes.push('Star Rating');
  }
  
  // Awards/badges
  const awardMentions: string[] = [];
  const awardPatterns = [
    /award[- ]?winner/gi,
    /winner\s+of/gi,
    /best\s+(of|in)\s+\d{4}/gi,
    /certified\s+by/gi,
    /accredited/gi,
    /as\s+seen\s+(in|on)/gi,
    /featured\s+(in|on)/gi,
  ];
  
  for (const pattern of awardPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      awardMentions.push(...matches.slice(0, 3));
    }
  }
  
  // Social proof numbers
  const socialProofSamples: string[] = [];
  const proofPatterns = [
    /\d{1,3}(,\d{3})*\+?\s*(customers?|clients?|users?|orders?|served|happy|satisfied)/gi,
    /over\s+\d{1,3}(,\d{3})*\s*(customers?|clients?|years?)/gi,
    /rated\s+\d(\.\d)?\s*(out of\s*5|\/5|\s*stars?)/gi,
    /\d+%\s+(satisfaction|recommend)/gi,
  ];
  
  for (const pattern of proofPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      socialProofSamples.push(...matches.slice(0, 3));
    }
  }
  
  // Team section
  const hasTeamSection = /\b(our\s+team|meet\s+the\s+team|about\s+us|our\s+staff)\b/i.test(lowerText);
  
  // Compile trust blocks
  const trustBlocksFound: string[] = [];
  if (hasTestimonials) trustBlocksFound.push('testimonials');
  if (reviewWidgetTypes.length > 0) trustBlocksFound.push('review_widgets');
  if (awardMentions.length > 0) trustBlocksFound.push('awards');
  if (socialProofSamples.length > 0) trustBlocksFound.push('social_proof');
  if (hasTeamSection) trustBlocksFound.push('team_section');
  
  return {
    has_testimonials: hasTestimonials,
    testimonial_samples: testimonialSamples,
    has_reviews_widget: reviewWidgetTypes.length > 0,
    review_widget_types: reviewWidgetTypes,
    has_awards_badges: awardMentions.length > 0,
    award_mentions: awardMentions,
    has_social_proof_numbers: socialProofSamples.length > 0,
    social_proof_samples: socialProofSamples,
    has_team_section: hasTeamSection,
    trust_blocks_found: trustBlocksFound,
  };
}

/**
 * Generate Owner-style findings from page data
 */
function generateOwnerFindings(pages: PageData[], keyPages: KeyPages): OwnerFinding[] {
  const findings: OwnerFinding[] = [];
  
  // Check homepage
  const homepage = pages.find(p => {
    try {
      return new URL(p.url).pathname === '/' || new URL(p.url).pathname === '';
    } catch { return false; }
  });
  
  if (homepage) {
    // Missing H1
    if (!homepage.ux_checks.has_h1) {
      findings.push({
        severity: 'high',
        category: 'SEO',
        issue: 'Homepage missing H1 heading',
        evidence: `URL: ${homepage.url}`,
        page_url: homepage.url,
        fix: 'Add a clear H1 heading that includes your main keyword and business name'
      });
    }
    
    // Missing meta description
    if (homepage.ux_checks.meta_description_missing) {
      findings.push({
        severity: 'high',
        category: 'SEO',
        issue: 'Homepage missing meta description',
        evidence: `URL: ${homepage.url}`,
        page_url: homepage.url,
        fix: 'Add a compelling meta description (150-160 chars) with key services and location'
      });
    }
    
    // No CTA visible above fold
    if (!homepage.viewport_checks.primary_cta_visible) {
      findings.push({
        severity: 'high',
        category: 'Conversion',
        issue: 'No clear call-to-action visible above the fold on homepage',
        evidence: `URL: ${homepage.url}`,
        page_url: homepage.url,
        fix: 'Add a prominent CTA button (Book Now, Contact Us, Get Quote) in the hero section'
      });
    }
    
    // No phone visible
    if (!homepage.viewport_checks.tel_visible && homepage.contact_methods.phone.length > 0) {
      findings.push({
        severity: 'medium',
        category: 'Conversion',
        issue: 'Phone number not visible above the fold',
        evidence: `Phone found: ${homepage.contact_methods.phone[0]}`,
        page_url: homepage.url,
        fix: 'Display your phone number prominently in the header or hero section'
      });
    }
    
    // No trust signals
    if (homepage.enhanced_trust_signals.trust_blocks_found.length === 0) {
      findings.push({
        severity: 'medium',
        category: 'Trust',
        issue: 'No trust signals (reviews, testimonials) found on homepage',
        evidence: `URL: ${homepage.url}`,
        page_url: homepage.url,
        fix: 'Add customer testimonials, Google reviews widget, or trust badges'
      });
    }
  }
  
  // Check for contact page issues
  if (keyPages.contact_page) {
    const contactPage = pages.find(p => p.url === keyPages.contact_page);
    if (contactPage) {
      if (contactPage.contact_methods.forms === 0) {
        findings.push({
          severity: 'high',
          category: 'Conversion',
          issue: 'Contact page has no contact form',
          evidence: `URL: ${contactPage.url}`,
          page_url: contactPage.url,
          fix: 'Add a simple contact form with name, email, phone, and message fields'
        });
      }
    }
  } else {
    findings.push({
      severity: 'high',
      category: 'UX',
      issue: 'No dedicated contact page found',
      evidence: 'Site structure analysis',
      page_url: homepage?.url || '',
      fix: 'Create a clear /contact page with all contact methods and a form'
    });
  }
  
  // Check for thin content
  const thinPages = pages.filter(p => p.ux_checks.thin_content && p.page_type !== 'contact');
  if (thinPages.length > 0) {
    findings.push({
      severity: 'medium',
      category: 'Content',
      issue: `${thinPages.length} page(s) have thin content (under 150 words)`,
      evidence: thinPages.slice(0, 3).map(p => new URL(p.url).pathname).join(', '),
      page_url: thinPages[0].url,
      fix: 'Add more detailed, valuable content to these pages (aim for 300+ words)'
    });
  }
  
  // Check for duplicate titles
  const titleCounts: Record<string, string[]> = {};
  for (const page of pages) {
    if (page.title) {
      if (!titleCounts[page.title]) titleCounts[page.title] = [];
      titleCounts[page.title].push(page.url);
    }
  }
  const duplicateTitles = Object.entries(titleCounts).filter(([, urls]) => urls.length > 1);
  if (duplicateTitles.length > 0) {
    findings.push({
      severity: 'medium',
      category: 'SEO',
      issue: 'Duplicate page titles found',
      evidence: `"${duplicateTitles[0][0]}" used on ${duplicateTitles[0][1].length} pages`,
      page_url: duplicateTitles[0][1][0],
      fix: 'Create unique, descriptive titles for each page'
    });
  }
  
  // Check for missing analytics
  const pagesWithoutAnalytics = pages.filter(p => !p.analytics.google_analytics && !p.analytics.gtm);
  if (pagesWithoutAnalytics.length === pages.length) {
    findings.push({
      severity: 'medium',
      category: 'Technical',
      issue: 'No Google Analytics or GTM tracking detected',
      evidence: 'Checked all crawled pages',
      page_url: homepage?.url || '',
      fix: 'Install Google Analytics or Google Tag Manager to track visitor behavior'
    });
  }
  
  // Check for missing structured data
  const pagesWithSchema = pages.filter(p => p.structured_data.length > 0);
  if (pagesWithSchema.length === 0) {
    findings.push({
      severity: 'medium',
      category: 'SEO',
      issue: 'No structured data (Schema.org) found on any page',
      evidence: 'Checked all crawled pages',
      page_url: homepage?.url || '',
      fix: 'Add LocalBusiness, Organization, or relevant Schema markup'
    });
  }
  
  // Check for services/pricing
  if (!keyPages.services_page && !keyPages.pricing_page) {
    findings.push({
      severity: 'low',
      category: 'Content',
      issue: 'No dedicated services or pricing page found',
      evidence: 'Site structure analysis',
      page_url: homepage?.url || '',
      fix: 'Create a services page listing what you offer with clear descriptions'
    });
  }
  
  // Check for local SEO
  const pagesWithLocalTerms = pages.filter(p => p.ux_checks.has_local_intent_terms);
  if (pagesWithLocalTerms.length === 0) {
    findings.push({
      severity: 'low',
      category: 'Local SEO',
      issue: 'No local intent terms (city, area names) found',
      evidence: 'Content analysis of all pages',
      page_url: homepage?.url || '',
      fix: 'Include your city/area name in titles, headings, and content'
    });
  }
  
  // Sort by severity
  const severityOrder = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  
  return findings.slice(0, 12); // Max 12 findings
}

function extractPrices(text: string): string[] {
  const pricePatterns = [
    /\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g,
    /£\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g,
    /€\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g,
    /R\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g, // South African Rand
    /(?:from|starting at|only)\s*\$\d+/gi,
  ];
  
  const prices: Set<string> = new Set();
  for (const pattern of pricePatterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        prices.add(match.trim());
      }
    }
  }
  return Array.from(prices);
}

async function scrapePage(
  context: BrowserContext,
  url: string,
  depth: number,
  baseUrl: string,
  baseDomain: string
): Promise<{ pageData: PageData; discoveredUrls: string[] }> {
  const page = await context.newPage();
  
  // Apply stealth techniques
  await setupStealth(page);
  
  const redirectChain: string[] = [];
  let finalUrl = url;
  let httpStatus = 200;
  
  // Track redirects
  page.on('response', (response) => {
    const status = response.status();
    if (response.url() === url || redirectChain.includes(response.url())) {
      if (status >= 300 && status < 400) {
        redirectChain.push(response.url());
      }
      httpStatus = status;
      finalUrl = response.url();
    }
  });
  
  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT_MS,
    });
    
    if (response) {
      httpStatus = response.status();
    }
    
    // Try to wait for network to settle (reduced timeout)
    try {
      await page.waitForLoadState('networkidle', { timeout: 8000 });
    } catch {
      console.log(`[WEBSITE-SCRAPE] Network idle timeout for ${url}, proceeding...`);
    }
    
    // Brief wait for dynamic content
    await page.waitForTimeout(1000);
    
    // Extract all data from the page including Owner-level content
    const pageData = await page.evaluate(({ baseUrlParam, depthParam, urlParam }: { baseUrlParam: string; depthParam: number; urlParam: string }) => {
      const getText = (el: Element | null): string | null => {
        return el?.textContent?.trim() || null;
      };
      
      // Get HTML
      const html = document.documentElement.outerHTML;
      const bodyText = document.body?.innerText || '';
      
      // =====================================================
      // OWNER-LEVEL: Extract main content (excluding nav/footer)
      // =====================================================
      let mainText = '';
      const mainSelectors = ['main', 'article', '[role="main"]', '.main-content', '#main-content', '.content'];
      for (const selector of mainSelectors) {
        const mainEl = document.querySelector(selector);
        if (mainEl) {
          // Clone and remove nav/footer/header from clone
          const clone = mainEl.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('nav, footer, header, script, style, noscript').forEach(el => el.remove());
          mainText = clone.innerText?.trim() || '';
          if (mainText.length > 100) break;
        }
      }
      
      // Fallback: use body without nav/footer/header
      if (mainText.length < 100) {
        const bodyClone = document.body.cloneNode(true) as HTMLElement;
        bodyClone.querySelectorAll('nav, footer, header, script, style, noscript, aside, .sidebar, .menu').forEach(el => el.remove());
        mainText = bodyClone.innerText?.trim() || '';
      }
      
      // Limit to ~5000 chars
      mainText = mainText.substring(0, 5000);
      
      // Above-fold text (first ~600 chars of body)
      const aboveFoldText = bodyText.substring(0, 600).replace(/\s+/g, ' ').trim();
      
      // Content snippet for UI preview
      const contentSnippet = mainText.substring(0, 250).replace(/\s+/g, ' ').trim() + (mainText.length > 250 ? '...' : '');
      
      // Visible word count
      const wordCountVisible = mainText.split(/\s+/).filter(Boolean).length;
      
      // Title
      const title = document.title || null;
      
      // Meta description
      const metaDesc = document.querySelector('meta[name="description"]');
      const metaDescription = metaDesc?.getAttribute('content') || null;
      
      // Canonical
      const canonicalEl = document.querySelector('link[rel="canonical"]');
      const canonical = canonicalEl?.getAttribute('href') || null;
      
      // Meta robots
      const metaRobotsEl = document.querySelector('meta[name="robots"]');
      const metaRobots = metaRobotsEl?.getAttribute('content') || null;
      
      // Headings
      const h1Elements = Array.from(document.querySelectorAll('h1'));
      const h1Texts = h1Elements.map(el => getText(el)).filter((t): t is string => !!t);
      const h2Elements = Array.from(document.querySelectorAll('h2'));
      const h2Texts = h2Elements.map(el => getText(el)).filter((t): t is string => !!t);
      const h3Elements = Array.from(document.querySelectorAll('h3'));
      const h3Texts = h3Elements.map(el => getText(el)).filter((t): t is string => !!t);
      const h4Elements = Array.from(document.querySelectorAll('h4'));
      const h4Texts = h4Elements.map(el => getText(el)).filter((t): t is string => !!t);
      
      // Links
      const allLinks = Array.from(document.querySelectorAll('a[href]'));
      const linkData = allLinks.map(a => ({
        href: a.getAttribute('href') || '',
        text: getText(a) || '',
        isInHeader: !!a.closest('header'),
        isInFooter: !!a.closest('footer'),
        isInNav: !!a.closest('nav'),
      }));
      
      // Images
      const allImages = Array.from(document.querySelectorAll('img'));
      const imageData = allImages.map(img => ({
        src: img.src || img.getAttribute('data-src') || '',
        alt: img.alt || '',
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0,
      }));
      
      // Logo detection
      let logoUrl: string | null = null;
      const logoSelectors = [
        'img[class*="logo"]',
        'img[id*="logo"]',
        'img[alt*="logo"]',
        '.logo img',
        '#logo img',
        'header img:first-of-type',
      ];
      for (const selector of logoSelectors) {
        const logoImg = document.querySelector(selector);
        if (logoImg && logoImg instanceof HTMLImageElement) {
          logoUrl = logoImg.src;
          break;
        }
      }
      
      // Hero image (largest image in viewport)
      let heroImage: string | null = null;
      let maxSize = 0;
      for (const img of imageData) {
        const size = img.width * img.height;
        if (size > maxSize && size > 50000) { // Minimum 50k pixels
          maxSize = size;
          heroImage = img.src;
        }
      }
      
      // Forms
      const formElements = Array.from(document.querySelectorAll('form'));
      const forms = formElements.map(form => {
        const inputs = Array.from(form.querySelectorAll('input, textarea, select'));
        const fields = inputs.map(input => {
          const name = input.getAttribute('name') || input.getAttribute('id') || '';
          return name;
        }).filter(Boolean);
        const requiredFields = inputs.filter(input => 
          input.hasAttribute('required') || input.getAttribute('aria-required') === 'true'
        ).map(input => input.getAttribute('name') || input.getAttribute('id') || '').filter(Boolean);
        
        return {
          action: form.action || null,
          method: form.method || 'GET',
          fields,
          requiredFields,
        };
      });
      
      // Scripts
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      const scriptSrcs = scripts.map(s => s.getAttribute('src') || '').filter(Boolean);
      
      // Stylesheets
      const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
      const cssCount = stylesheets.length;
      
      // Structured data
      const jsonLdScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      const structuredData = jsonLdScripts.map(script => {
        try {
          const data = JSON.parse(script.textContent || '{}');
          return {
            type: data['@type'] || 'Unknown',
            format: 'JSON-LD',
            data,
          };
        } catch {
          return null;
        }
      }).filter(Boolean);
      
      // Open Graph
      const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || null;
      const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || null;
      const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || null;
      const twitterCard = document.querySelector('meta[name="twitter:card"]')?.getAttribute('content') || null;
      
      // Analytics detection
      const hasGA = scriptSrcs.some(s => s.includes('google-analytics.com') || s.includes('googletagmanager.com'));
      const hasGA4 = scriptSrcs.some(s => s.includes('gtag/js'));
      const gtmMatch = html.match(/GTM-[A-Z0-9]+/);
      const hasMetaPixel = scriptSrcs.some(s => s.includes('connect.facebook.net')) || html.includes('fbq(');
      const hasTikTokPixel = html.includes('analytics.tiktok.com');
      const hasHotjar = html.includes('hotjar.com');
      
      // Embedded maps
      const hasGoogleMap = html.includes('maps.google.com') || html.includes('google.com/maps') || html.includes('maps.googleapis.com');
      
      // Copyright
      const footerText = document.querySelector('footer')?.textContent || '';
      const copyrightMatch = footerText.match(/(?:©|copyright)\s*(\d{4})?[^.]*?([A-Za-z\s&]+(?:Inc|LLC|Ltd|Co)?\.?)/i);
      const copyrightText = copyrightMatch ? copyrightMatch[0].trim() : null;
      const copyrightYear = footerText.match(/(?:©|copyright)\s*(\d{4})/i)?.[1] || null;
      
      // Trust signals - testimonials
      const testimonialSelectors = [
        '[class*="testimonial"]',
        '[class*="review"]',
        '[class*="quote"]',
        'blockquote',
      ];
      let testimonialCount = 0;
      for (const selector of testimonialSelectors) {
        testimonialCount += document.querySelectorAll(selector).length;
      }
      
      // Team members
      const teamSelectors = [
        '[class*="team-member"]',
        '[class*="staff"]',
        '[class*="employee"]',
      ];
      let teamCount = 0;
      for (const selector of teamSelectors) {
        teamCount += document.querySelectorAll(selector).length;
      }
      
      // Word count
      const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
      
      // Favicon
      const faviconEl = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
      const favicon = faviconEl?.getAttribute('href') || null;
      
      // Security - check for mixed content warning is not possible client-side, but we can check HTTPS
      const isHttps = window.location.protocol === 'https:';
      
      // Blog dates
      const datePatterns = Array.from(document.querySelectorAll('time, [class*="date"], [class*="published"]'));
      const dates = datePatterns.map(el => {
        const datetime = el.getAttribute('datetime');
        if (datetime) return datetime;
        const text = getText(el);
        if (text && /\d{4}[-/]\d{2}[-/]\d{2}/.test(text)) return text;
        return null;
      }).filter(Boolean) as string[];
      
      // =====================================================
      // OWNER-LEVEL: Detect FAQ section
      // =====================================================
      const hasFAQ = /\b(faq|frequently\s+asked|questions?\s+and\s+answers?)\b/i.test(html) ||
                     document.querySelector('[itemtype*="FAQPage"]') !== null;
      
      // =====================================================
      // OWNER-LEVEL: Detect local intent terms
      // =====================================================
      const localTermPatterns = [
        /\b(near\s+me|local|nearby|in\s+\w+\s+(city|town|area))\b/i,
        /\b(Cape Town|Johannesburg|Durban|Pretoria|London|New York|Sydney|Melbourne)\b/i,
        /\b(serving|based\s+in|located\s+in)\b/i,
      ];
      const hasLocalTerms = localTermPatterns.some(p => p.test(bodyText));
      
      // =====================================================
      // OWNER-LEVEL: Detect service terms
      // =====================================================
      const serviceTermPatterns = [
        /\b(service|services|solution|offering|product|products)\b/i,
        /\b(we\s+(offer|provide|specialize|deliver))\b/i,
      ];
      const hasServiceTerms = serviceTermPatterns.some(p => p.test(bodyText));
      
      // =====================================================
      // OWNER-LEVEL: Detect CAPTCHA/blocking
      // =====================================================
      const hasCaptcha = /\b(captcha|robot|verify\s+you|human\s+verification)\b/i.test(html) ||
                         document.querySelector('[class*="captcha"], [id*="captcha"], .g-recaptcha') !== null;
      
      return {
        html,
        bodyText,
        title,
        metaDescription,
        canonical,
        metaRobots,
        h1Texts,
        h2Texts,
        h3Texts,
        h4Texts,
        linkData,
        imageData,
        logoUrl,
        heroImage,
        forms,
        scriptSrcs,
        cssCount,
        structuredData,
        ogTitle,
        ogDesc,
        ogImage,
        twitterCard,
        hasGA,
        hasGA4,
        gtmId: gtmMatch ? gtmMatch[0] : null,
        hasMetaPixel,
        hasTikTokPixel,
        hasHotjar,
        hasGoogleMap,
        copyrightText,
        copyrightYear,
        testimonialCount,
        teamCount,
        wordCount,
        favicon,
        isHttps,
        dates,
        // Owner-level fields
        mainText,
        aboveFoldText,
        contentSnippet,
        wordCountVisible,
        hasFAQ,
        hasLocalTerms,
        hasServiceTerms,
        hasCaptcha,
      };
    }, { baseUrlParam: baseUrl, depthParam: depth, urlParam: url });
    
    // =====================================================
    // OWNER-LEVEL: Viewport visibility checks (fast, in-page evaluation)
    // =====================================================
    const viewportChecks = await page.evaluate(() => {
      const result = {
        primary_cta_visible: false,
        primary_cta_text: null as string | null,
        primary_cta_href: null as string | null,
        cta_position: 'unknown' as 'header' | 'hero' | 'body' | 'unknown',
        tel_visible: false,
        whatsapp_visible: false,
        email_visible: false,
      };
      
      const viewportHeight = window.innerHeight || 800;
      
      // Helper to check if element is in viewport
      const isInViewport = (el: Element): { visible: boolean; y: number } => {
        const rect = el.getBoundingClientRect();
        const visible = rect.top < viewportHeight && rect.bottom > 0 && rect.width > 0 && rect.height > 0;
        return { visible, y: rect.top };
      };
      
      // Check for CTA buttons/links
      const ctaPatterns = /book|call|contact|quote|order|buy|schedule|enquire|whatsapp|get\s*started|sign\s*up|reserve/i;
      const clickables = Array.from(document.querySelectorAll('a, button'));
      
      for (const el of clickables) {
        const text = el.textContent?.trim() || '';
        if (ctaPatterns.test(text) && text.length < 50) {
          const { visible, y } = isInViewport(el);
          if (visible && y < viewportHeight) {
            result.primary_cta_visible = true;
            result.primary_cta_text = text.slice(0, 50);
            result.primary_cta_href = el.getAttribute('href');
            
            if (y < 100) {
              result.cta_position = 'header';
            } else if (y < 500) {
              result.cta_position = 'hero';
            } else {
              result.cta_position = 'body';
            }
            break;
          }
        }
      }
      
      // Check for visible tel: link
      const telLinks = document.querySelectorAll('a[href^="tel:"]');
      for (const el of Array.from(telLinks)) {
        const { visible, y } = isInViewport(el);
        if (visible && y < viewportHeight) {
          result.tel_visible = true;
          break;
        }
      }
      
      // Check for visible WhatsApp link
      const waLinks = document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp"]');
      for (const el of Array.from(waLinks)) {
        const { visible, y } = isInViewport(el);
        if (visible && y < viewportHeight) {
          result.whatsapp_visible = true;
          break;
        }
      }
      
      // Check for visible email link
      const emailLinks = document.querySelectorAll('a[href^="mailto:"]');
      for (const el of Array.from(emailLinks)) {
        const { visible, y } = isInViewport(el);
        if (visible && y < viewportHeight) {
          result.email_visible = true;
          break;
        }
      }
      
      return result;
    }).catch(() => ({
      primary_cta_visible: false,
      primary_cta_text: null,
      primary_cta_href: null,
      cta_position: 'unknown' as const,
      tel_visible: false,
      whatsapp_visible: false,
      email_visible: false,
    }));
    
    await page.close();
    
    // Process extracted data
    const discoveredUrls: string[] = [];
    const internalLinks: string[] = [];
    const externalLinks: { social: string[]; booking: string[]; reviews: string[]; other: string[] } = {
      social: [],
      booking: [],
      reviews: [],
      other: [],
    };
    const moneyPageLinks: string[] = [];
    const telLinks: string[] = [];
    const mailtoLinks: string[] = [];
    const whatsappLinks: string[] = [];
    
    // Process links
    for (const link of pageData.linkData) {
      const href = link.href;
      
      // Tel links
      if (href.startsWith('tel:')) {
        telLinks.push(href);
        continue;
      }
      
      // Mailto links
      if (href.startsWith('mailto:')) {
        mailtoLinks.push(href);
        continue;
      }
      
      // WhatsApp
      if (href.includes('wa.me') || href.includes('whatsapp')) {
        whatsappLinks.push(href);
        continue;
      }
      
      const normalized = normalizeUrl(href, baseUrl);
      if (!normalized) continue;
      
      if (isSameDomain(normalized, baseDomain)) {
        if (!internalLinks.includes(normalized)) {
          internalLinks.push(normalized);
          discoveredUrls.push(normalized);
        }
        
        // Detect money pages
        const lowerHref = normalized.toLowerCase();
        if (lowerHref.includes('book') || lowerHref.includes('contact') || 
            lowerHref.includes('quote') || lowerHref.includes('schedule') ||
            lowerHref.includes('appointment')) {
          if (!moneyPageLinks.includes(normalized)) {
            moneyPageLinks.push(normalized);
          }
        }
      } else {
        const classified = classifyExternalLink(normalized);
        if (!externalLinks[classified.category as keyof typeof externalLinks].includes(normalized)) {
          externalLinks[classified.category as keyof typeof externalLinks].push(normalized);
        }
      }
    }
    
    // Extract contact info from body text
    const phones = extractPhoneNumbers(pageData.bodyText);
    const emails = extractEmails(pageData.bodyText);
    const prices = extractPrices(pageData.bodyText);
    
    // Determine contact locations
    const contactLocations: string[] = [];
    if (pageData.linkData.some(l => l.isInHeader && (l.href.startsWith('tel:') || l.href.startsWith('mailto:')))) {
      contactLocations.push('header');
    }
    if (pageData.linkData.some(l => l.isInFooter && (l.href.startsWith('tel:') || l.href.startsWith('mailto:')))) {
      contactLocations.push('footer');
    }
    if (pageData.linkData.some(l => !l.isInHeader && !l.isInFooter && (l.href.startsWith('tel:') || l.href.startsWith('mailto:')))) {
      contactLocations.push('body');
    }
    
    // Detect primary CTA
    let primaryCTA: PrimaryCTA = { button_text: null, destination: null, above_fold: false };
    const ctaKeywords = ['book', 'schedule', 'contact', 'get started', 'free', 'buy', 'order', 'sign up', 'register'];
    for (const link of pageData.linkData) {
      const text = link.text.toLowerCase();
      if (ctaKeywords.some(kw => text.includes(kw))) {
        const normalized = normalizeUrl(link.href, baseUrl);
        primaryCTA = {
          button_text: link.text,
          destination: normalized,
          above_fold: link.isInHeader || link.isInNav,
        };
        break;
      }
    }
    
    // Detect CMS
    const cms = detectCMS(pageData.html, pageData.scriptSrcs);
    
    // Page type classification
    const pageType = classifyPageType(url, pageData.title, pageData.h1Texts, pageData.bodyText);
    
    // Calculate intent
    let primaryIntent = 'informational';
    if (pageType === 'service' || pageType === 'product') primaryIntent = 'commercial';
    if (pageType === 'booking' || pageType === 'contact' || pageType === 'pricing') primaryIntent = 'transactional';
    if (pageType === 'blog' || pageType === 'faq') primaryIntent = 'informational';
    if (pageType === 'location') primaryIntent = 'local';
    
    // Calculate alt text coverage
    const imagesWithAlt = pageData.imageData.filter(img => img.alt && img.alt.length > 0).length;
    const altCoverage = pageData.imageData.length > 0 
      ? Math.round((imagesWithAlt / pageData.imageData.length) * 100) 
      : 100;
    
    // Third party scripts
    const thirdPartyScripts: string[] = [];
    for (const src of pageData.scriptSrcs) {
      try {
        const scriptUrl = new URL(src, baseUrl);
        if (!isSameDomain(scriptUrl.href, baseDomain)) {
          const domain = scriptUrl.hostname;
          if (!thirdPartyScripts.includes(domain)) {
            thirdPartyScripts.push(domain);
          }
        }
      } catch {
        // Ignore invalid URLs
      }
    }
    
    // Indexability
    const isIndexable = !pageData.metaRobots?.toLowerCase().includes('noindex');
    
    // Forms info
    const formsInfo: FormInfo[] = pageData.forms.map(form => {
      // Detect form type
      let formType = 'general';
      const fieldNames = form.fields.join(' ').toLowerCase();
      if (fieldNames.includes('email') && (fieldNames.includes('message') || fieldNames.includes('comment'))) {
        formType = 'contact';
      } else if (fieldNames.includes('subscribe') || fieldNames.includes('newsletter')) {
        formType = 'newsletter';
      } else if (fieldNames.includes('search') || fieldNames.includes('query')) {
        formType = 'search';
      } else if (fieldNames.includes('login') || fieldNames.includes('password')) {
        formType = 'login';
      }
      
      return {
        type: formType,
        fields: form.fields,
        required_fields: form.requiredFields,
        submit_endpoint: form.action,
      };
    });
    
    // Build page data object
    const result: PageData = {
      url: finalUrl,
      depth,
      http_status: httpStatus,
      redirect_chain: redirectChain,
      page_type: pageType,
      title: pageData.title,
      title_length: pageData.title?.length || 0,
      meta_description: pageData.metaDescription,
      meta_desc_length: pageData.metaDescription?.length || 0,
      h1_text: pageData.h1Texts,
      h1_count: pageData.h1Texts.length,
      headings: {
        h2: pageData.h2Texts,
        h3: pageData.h3Texts,
        h4: pageData.h4Texts,
      },
      canonical_url: pageData.canonical,
      canonical_consistent: pageData.canonical === finalUrl || pageData.canonical === null,
      indexability: {
        meta_robots: pageData.metaRobots,
        x_robots_tag: null, // Would need response headers
        is_indexable: isIndexable,
      },
      primary_intent: primaryIntent,
      word_count: pageData.wordCount,
      internal_links: internalLinks,
      internal_link_count: internalLinks.length,
      external_links: externalLinks,
      money_page_links: moneyPageLinks,
      contact_methods: {
        phone: phones,
        email: emails,
        whatsapp: whatsappLinks.map(w => w.replace('https://wa.me/', '').replace('tel:', '')),
        forms: formsInfo.filter(f => f.type === 'contact').length,
        locations: contactLocations,
      },
      clickable_actions: {
        tel_links: telLinks,
        mailto_links: mailtoLinks,
        whatsapp_links: whatsappLinks,
      },
      primary_cta: primaryCTA,
      forms: formsInfo,
      trust_signals: {
        testimonials: [], // Would need more sophisticated extraction
        review_widgets: pageData.hasGoogleMap ? ['Google Maps'] : [],
        awards: [],
        case_studies: 0,
        team_members: pageData.teamCount,
      },
      pricing_signals: {
        has_pricing: prices.length > 0 || pageType === 'pricing',
        price_ranges: prices.slice(0, 10),
        hidden_pricing: pageData.bodyText.toLowerCase().includes('contact for') || 
                       pageData.bodyText.toLowerCase().includes('request a quote'),
      },
      local_seo: {
        location_pages: internalLinks.filter(l => l.toLowerCase().includes('location')),
        has_embedded_map: pageData.hasGoogleMap,
        opening_hours: null, // Would need more sophisticated extraction
      },
      structured_data: pageData.structuredData as StructuredDataItem[],
      social_meta: {
        og_title: pageData.ogTitle,
        og_description: pageData.ogDesc,
        og_image: pageData.ogImage,
        twitter_card: pageData.twitterCard,
      },
      images: {
        hero_image: pageData.heroImage,
        logo_url: pageData.logoUrl,
        total_images: pageData.imageData.length,
        images_with_alt: imagesWithAlt,
        alt_text_coverage: `${altCoverage}%`,
        largest_images: pageData.imageData
          .filter(img => img.width * img.height > 10000)
          .sort((a, b) => (b.width * b.height) - (a.width * a.height))
          .slice(0, 5)
          .map(img => ({ url: img.src, estimated_size: `${Math.round(img.width * img.height / 1000)}kb` })),
      },
      performance: {
        html_size_kb: Math.round(pageData.html.length / 1024),
        asset_count: {
          js: pageData.scriptSrcs.length,
          css: pageData.cssCount,
          images: pageData.imageData.length,
        },
        third_party_scripts: thirdPartyScripts,
      },
      analytics: {
        google_analytics: pageData.hasGA,
        ga4: pageData.hasGA4,
        gtm: pageData.gtmId,
        meta_pixel: pageData.hasMetaPixel,
        tiktok_pixel: pageData.hasTikTokPixel,
        hotjar: pageData.hasHotjar,
        other: [],
      },
      brand_consistency: {
        business_name_variants: [],
        logo_count: pageData.logoUrl ? 1 : 0,
        copyright_text: pageData.copyrightText,
      },
      security: {
        is_https: pageData.isHttps,
        mixed_content: false,
        security_headers: [],
      },
      freshness: {
        last_blog_post: pageData.dates[0] || null,
        copyright_year: pageData.copyrightYear,
        recent_dates: pageData.dates.slice(0, 5),
      },
      // Owner-level enhanced fields
      content_digest: {
        render_mode: 'playwright' as const,
        main_text: pageData.mainText,
        above_fold_text: pageData.aboveFoldText,
        content_snippet: pageData.contentSnippet,
        word_count_visible: pageData.wordCountVisible,
        content_hash: simpleHash(pageData.mainText),
        top_phrases: extractTopPhrases(pageData.mainText, 10),
        entities: extractEntities(pageData.mainText, pageData.title),
      },
      viewport_checks: viewportChecks,
      enhanced_trust_signals: detectTrustSignals(pageData.mainText, pageData.html),
      ux_checks: {
        has_h1: pageData.h1Texts.length > 0,
        meta_description_missing: !pageData.metaDescription,
        multiple_h1: pageData.h1Texts.length > 1,
        thin_content: pageData.wordCountVisible < 150 && pageType !== 'contact' && pageType !== 'booking',
        has_clear_contact_path: (phones.length > 0 || emails.length > 0 || formsInfo.some(f => f.type === 'contact')),
        has_local_intent_terms: pageData.hasLocalTerms,
        has_service_terms: pageData.hasServiceTerms,
        has_pricing_signals: prices.length > 0,
        has_faq: pageData.hasFAQ,
        blocked_by_captcha: pageData.hasCaptcha,
      },
    };
    
    return { pageData: result, discoveredUrls };
    
  } catch (error) {
    console.error(`[WEBSITE-SCRAPE] Error scraping ${url}:`, error);
    await page.close();
    
    // Return minimal data for failed page
    return {
      pageData: {
        url,
        depth,
        http_status: 0,
        redirect_chain: [],
        page_type: 'error',
        title: null,
        title_length: 0,
        meta_description: null,
        meta_desc_length: 0,
        h1_text: [],
        h1_count: 0,
        headings: { h2: [], h3: [], h4: [] },
        canonical_url: null,
        canonical_consistent: false,
        indexability: { meta_robots: null, x_robots_tag: null, is_indexable: false },
        primary_intent: 'unknown',
        word_count: 0,
        internal_links: [],
        internal_link_count: 0,
        external_links: { social: [], booking: [], reviews: [], other: [] },
        money_page_links: [],
        contact_methods: { phone: [], email: [], whatsapp: [], forms: 0, locations: [] },
        clickable_actions: { tel_links: [], mailto_links: [], whatsapp_links: [] },
        primary_cta: { button_text: null, destination: null, above_fold: false },
        forms: [],
        trust_signals: { testimonials: [], review_widgets: [], awards: [], case_studies: 0, team_members: 0 },
        pricing_signals: { has_pricing: false, price_ranges: [], hidden_pricing: false },
        local_seo: { location_pages: [], has_embedded_map: false, opening_hours: null },
        structured_data: [],
        social_meta: { og_title: null, og_description: null, og_image: null, twitter_card: null },
        images: { hero_image: null, logo_url: null, total_images: 0, images_with_alt: 0, alt_text_coverage: '0%', largest_images: [] },
        performance: { html_size_kb: 0, asset_count: { js: 0, css: 0, images: 0 }, third_party_scripts: [] },
        analytics: { google_analytics: false, ga4: false, gtm: null, meta_pixel: false, tiktok_pixel: false, hotjar: false, other: [] },
        brand_consistency: { business_name_variants: [], logo_count: 0, copyright_text: null },
        security: { is_https: url.startsWith('https'), mixed_content: false, security_headers: [] },
        freshness: { last_blog_post: null, copyright_year: null, recent_dates: [] },
        // Owner-level fields (defaults for error state)
        content_digest: {
          render_mode: 'playwright' as const,
          main_text: '',
          above_fold_text: '',
          content_snippet: '',
          word_count_visible: 0,
          content_hash: '',
          top_phrases: [],
          entities: { locations: [], brand_variants: [], service_keywords: [] },
        },
        viewport_checks: {
          primary_cta_visible: false,
          primary_cta_text: null,
          primary_cta_href: null,
          cta_position: 'unknown' as const,
          tel_visible: false,
          whatsapp_visible: false,
          email_visible: false,
        },
        enhanced_trust_signals: {
          has_testimonials: false,
          testimonial_samples: [],
          has_reviews_widget: false,
          review_widget_types: [],
          has_awards_badges: false,
          award_mentions: [],
          has_social_proof_numbers: false,
          social_proof_samples: [],
          has_team_section: false,
          trust_blocks_found: [],
        },
        ux_checks: {
          has_h1: false,
          meta_description_missing: true,
          multiple_h1: false,
          thin_content: true,
          has_clear_contact_path: false,
          has_local_intent_terms: false,
          has_service_terms: false,
          has_pricing_signals: false,
          has_faq: false,
          blocked_by_captcha: false,
        },
      },
      discoveredUrls: [],
    };
  }
}

async function fetchRobotsTxt(domain: string): Promise<string | null> {
  try {
    const response = await fetch(`https://${domain}/robots.txt`);
    if (response.ok) {
      return await response.text();
    }
  } catch {
    // Ignore errors
  }
  return null;
}

async function fetchSitemap(domain: string): Promise<string[]> {
  const sitemapUrls: string[] = [];
  const potentialSitemaps = [
    `https://${domain}/sitemap.xml`,
    `https://${domain}/sitemap_index.xml`,
    `https://${domain}/sitemap-index.xml`,
  ];
  
  for (const sitemapUrl of potentialSitemaps) {
    try {
      const response = await fetch(sitemapUrl);
      if (response.ok) {
        const text = await response.text();
        // Extract URLs from sitemap
        const urlMatches = text.match(/<loc>([^<]+)<\/loc>/g);
        if (urlMatches) {
          for (const match of urlMatches) {
            const url = match.replace('<loc>', '').replace('</loc>', '');
            if (!sitemapUrls.includes(url)) {
              sitemapUrls.push(url);
            }
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }
  
  return sitemapUrls;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { url, maxDepth = 2, maxPages = 20, stage1Competitors } = body;
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }
    
    console.log(`[WEBSITE-SCRAPE] Starting scrape for: ${url}`);
    
    // Parse the URL
    let targetUrl: URL;
    try {
      targetUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }
    
    const baseDomain = targetUrl.hostname;
    const baseUrl = targetUrl.origin;
    
    // Launch browser
    const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
    const localExecutablePath = process.env.CHROME_PATH || process.env.CHROME_EXECUTABLE_PATH;
    
    const executablePath = isServerless
      ? await chromium.executablePath()
      : (localExecutablePath || undefined);
    
    console.log(`[WEBSITE-SCRAPE] Launching browser (headless: true)...`);
    
    const browser = await launchBrowserWithRetry(executablePath, !!isServerless);
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      locale: 'en-US',
    });
    
    context.setDefaultNavigationTimeout(TIMEOUT_MS);
    context.setDefaultTimeout(TIMEOUT_MS);
    
    console.log(`[WEBSITE-SCRAPE] Browser launched`);
    
    try {
      // Fetch robots.txt and sitemap
      const [robotsTxt, sitemapUrls] = await Promise.all([
        fetchRobotsTxt(baseDomain),
        fetchSitemap(baseDomain),
      ]);
      
      console.log(`[WEBSITE-SCRAPE] Found ${sitemapUrls.length} URLs in sitemap`);
      
      // Initialize crawl queue
      const crawlQueue: { url: string; depth: number }[] = [{ url: baseUrl, depth: 0 }];
      const crawledUrls: Set<string> = new Set();
      const pageResults: PageData[] = [];
      const internalLinkMatrix: Record<string, string[]> = {};
      
      // Add sitemap URLs to queue (limited)
      for (const sitemapUrl of sitemapUrls.slice(0, 10)) {
        if (isSameDomain(sitemapUrl, baseDomain) && !crawledUrls.has(sitemapUrl)) {
          crawlQueue.push({ url: sitemapUrl, depth: 1 });
        }
      }
      
      // Crawl pages
      while (crawlQueue.length > 0 && pageResults.length < maxPages) {
        const { url: currentUrl, depth } = crawlQueue.shift()!;
        
        if (crawledUrls.has(currentUrl)) continue;
        if (depth > maxDepth) continue;
        
        crawledUrls.add(currentUrl);
        console.log(`[WEBSITE-SCRAPE] Crawling (${pageResults.length + 1}/${maxPages}): ${currentUrl}`);
        
        // Add timeout wrapper to prevent single page from blocking the whole crawl
        const scrapeWithTimeout = async () => {
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Page scrape timeout')), 30000);
          });
          return Promise.race([
            scrapePage(context, currentUrl, depth, baseUrl, baseDomain),
            timeoutPromise
          ]);
        };
        
        let pageData: PageData;
        let discoveredUrls: string[] = [];
        
        try {
          const result = await scrapeWithTimeout();
          pageData = result.pageData;
          discoveredUrls = result.discoveredUrls;
        } catch (timeoutError) {
          console.log(`[WEBSITE-SCRAPE] Timeout scraping ${currentUrl}, skipping...`);
          continue;
        }
        
        pageResults.push(pageData);
        
        // Store internal link matrix
        internalLinkMatrix[currentUrl] = pageData.internal_links;
        
        // Add discovered URLs to queue
        if (depth < maxDepth) {
          for (const discovered of discoveredUrls) {
            if (!crawledUrls.has(discovered) && !crawlQueue.some(q => q.url === discovered)) {
              crawlQueue.push({ url: discovered, depth: depth + 1 });
            }
          }
        }
        
        // Small delay to be polite
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      await browser.close();
      
      // Detect CMS from homepage
      const homepage = pageResults.find(p => new URL(p.url).pathname === '/' || new URL(p.url).pathname === '');
      const detectedCMS = homepage ? detectCMS('', homepage.performance.third_party_scripts) : null;
      
      // Find orphan pages
      const linkedPages = new Set<string>();
      for (const links of Object.values(internalLinkMatrix)) {
        for (const link of links) {
          linkedPages.add(link);
        }
      }
      const orphanPages = pageResults
        .filter(p => !linkedPages.has(p.url) && new URL(p.url).pathname !== '/')
        .map(p => p.url);
      
      // Calculate summary metrics
      const indexablePages = pageResults.filter(p => p.indexability.is_indexable).length;
      const pagesWithIssues = pageResults.filter(p => 
        p.h1_count !== 1 || 
        !p.meta_description || 
        p.title_length > 60 ||
        p.meta_desc_length > 160
      ).length;
      
      // Calculate scores
      const seoScore = Math.round(
        ((indexablePages / pageResults.length) * 30) +
        ((pageResults.filter(p => p.h1_count === 1).length / pageResults.length) * 20) +
        ((pageResults.filter(p => p.meta_description).length / pageResults.length) * 20) +
        ((pageResults.filter(p => p.structured_data.length > 0).length / pageResults.length) * 15) +
        ((pageResults.filter(p => p.canonical_consistent).length / pageResults.length) * 15)
      );
      
      const technicalScore = Math.round(
        ((pageResults.filter(p => p.security.is_https).length / pageResults.length) * 25) +
        ((pageResults.filter(p => p.analytics.google_analytics || p.analytics.gtm).length / pageResults.length) * 25) +
        ((pageResults.filter(p => parseInt(p.images.alt_text_coverage) > 80).length / pageResults.length) * 25) +
        ((pageResults.filter(p => p.http_status === 200).length / pageResults.length) * 25)
      );
      
      const crawlDuration = (Date.now() - startTime) / 1000;
      
      // =====================================================
      // OWNER-LEVEL: Generate site report summary
      // =====================================================
      
      // Identify key pages
      const keyPages: KeyPages = {
        homepage: homepage?.url || null,
        contact_page: pageResults.find(p => p.page_type === 'contact')?.url || null,
        booking_or_lead_page: pageResults.find(p => p.page_type === 'booking' || p.money_page_links.length > 0)?.url || null,
        pricing_page: pageResults.find(p => p.page_type === 'pricing')?.url || null,
        about_page: pageResults.find(p => p.page_type === 'about')?.url || null,
        services_page: pageResults.find(p => p.page_type === 'service')?.url || null,
      };
      
      // Intent coverage
      const intentCoverage: IntentCoverage = {
        has_services: pageResults.some(p => p.page_type === 'service'),
        has_pricing: pageResults.some(p => p.page_type === 'pricing' || p.pricing_signals.has_pricing),
        has_contact: pageResults.some(p => p.page_type === 'contact'),
        has_about: pageResults.some(p => p.page_type === 'about'),
        has_faq: pageResults.some(p => p.ux_checks.has_faq),
        has_locations: pageResults.some(p => p.page_type === 'location'),
        has_blog: pageResults.some(p => p.page_type === 'blog'),
        has_booking: pageResults.some(p => p.page_type === 'booking'),
      };
      
      // Calculate conversion path score (0-100)
      let conversionScore = 0;
      if (homepage?.viewport_checks.primary_cta_visible) conversionScore += 25;
      if (homepage?.viewport_checks.tel_visible || homepage?.viewport_checks.whatsapp_visible) conversionScore += 20;
      if (keyPages.contact_page) conversionScore += 15;
      if (pageResults.some(p => p.forms.length > 0)) conversionScore += 15;
      if (intentCoverage.has_booking || keyPages.booking_or_lead_page) conversionScore += 15;
      if (pageResults.some(p => p.contact_methods.phone.length > 0)) conversionScore += 10;
      
      // Calculate content quality score (0-100)
      let contentScore = 0;
      const thinPagesCount = pageResults.filter(p => p.ux_checks.thin_content).length;
      const thinRatio = thinPagesCount / pageResults.length;
      contentScore += Math.round((1 - thinRatio) * 30); // Less thin = better
      contentScore += Math.round((pageResults.filter(p => p.ux_checks.has_h1).length / pageResults.length) * 20);
      contentScore += Math.round((pageResults.filter(p => !p.ux_checks.meta_description_missing).length / pageResults.length) * 20);
      contentScore += Math.round((pageResults.filter(p => p.ux_checks.has_service_terms).length / pageResults.length) * 15);
      contentScore += Math.round((pageResults.filter(p => p.ux_checks.has_local_intent_terms).length / pageResults.length) * 15);
      
      // Calculate trust score (0-100)
      let trustScore = 0;
      if (pageResults.some(p => p.enhanced_trust_signals.has_testimonials)) trustScore += 25;
      if (pageResults.some(p => p.enhanced_trust_signals.has_reviews_widget)) trustScore += 25;
      if (pageResults.some(p => p.enhanced_trust_signals.has_awards_badges)) trustScore += 15;
      if (pageResults.some(p => p.enhanced_trust_signals.has_social_proof_numbers)) trustScore += 15;
      if (pageResults.some(p => p.enhanced_trust_signals.has_team_section)) trustScore += 10;
      if (pageResults.some(p => p.structured_data.length > 0)) trustScore += 10;
      
      // Detect near-duplicate content
      const contentHashes: Record<string, string[]> = {};
      for (const page of pageResults) {
        const hash = page.content_digest.content_hash;
        if (hash && hash.length > 0) {
          if (!contentHashes[hash]) contentHashes[hash] = [];
          contentHashes[hash].push(page.url);
        }
      }
      const nearDuplicateGroups = Object.values(contentHashes).filter(urls => urls.length > 1);
      
      // Generate Owner-style findings
      const ownerFindings = generateOwnerFindings(pageResults, keyPages);
      
      const siteReportSummary: SiteReportSummary = {
        key_pages: keyPages,
        intent_coverage: intentCoverage,
        conversion_path_score: Math.min(100, conversionScore),
        content_quality_score: Math.min(100, contentScore),
        trust_score: Math.min(100, trustScore),
        owner_style_findings: ownerFindings,
        thin_pages_count: thinPagesCount,
        near_duplicate_groups: nearDuplicateGroups,
      };
      
      // =====================================================
      // BUSINESS IDENTITY RESOLUTION
      // =====================================================
      
      // Collect all service keywords and top phrases from crawl
      const allServiceKeywords: string[] = [];
      const allTopPhrases: string[] = [];
      const allLocationEntities: string[] = [];
      
      for (const page of pageResults) {
        page.content_digest.entities.service_keywords.forEach(kw => {
          if (!allServiceKeywords.includes(kw)) allServiceKeywords.push(kw);
        });
        page.content_digest.entities.locations.forEach(loc => {
          if (!allLocationEntities.includes(loc)) allLocationEntities.push(loc);
        });
        if (page.page_type === 'home' || page.page_type === 'service') {
          allTopPhrases.push(...page.content_digest.top_phrases.slice(0, 3));
        }
      }
      
      // Build website data for identity resolver
      let structuredDataName: string | null = null;
      let structuredDataType: string | null = null;
      let structuredDataAddress: string | null = null;
      
      if (homepage) {
        for (const sd of homepage.structured_data) {
          if (sd.data && typeof sd.data === 'object') {
            const data = sd.data as Record<string, unknown>;
            if (data.name && typeof data.name === 'string') {
              structuredDataName = data.name;
            }
            if (data['@type'] && typeof data['@type'] === 'string') {
              structuredDataType = data['@type'];
            }
            if (data.address) {
              if (typeof data.address === 'string') {
                structuredDataAddress = data.address;
              } else if (typeof data.address === 'object') {
                const addr = data.address as Record<string, string>;
                structuredDataAddress = [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode]
                  .filter(Boolean).join(', ');
              }
            }
          }
        }
      }
      
      const websiteExtractedData: WebsiteExtractedData = {
        url: baseUrl,
        title: homepage?.title || null,
        ogSiteName: homepage?.social_meta?.og_title?.split('|')[0]?.trim() || null,
        ogTitle: homepage?.social_meta?.og_title || null,
        h1Texts: homepage?.h1_text || [],
        metaDescription: homepage?.meta_description || null,
        structuredDataName,
        structuredDataType,
        structuredDataAddress,
        navLabels: [], // Would need to extract from navigation
        footerText: null,
        topPhrases: Array.from(new Set(allTopPhrases)).slice(0, 10),
        serviceKeywords: allServiceKeywords.slice(0, 10),
        locationEntities: allLocationEntities.slice(0, 5),
        hasMenuPage: pageResults.some(p => p.url.toLowerCase().includes('menu')),
        hasPricingPage: pageResults.some(p => p.page_type === 'pricing' || p.url.toLowerCase().includes('pricing') || p.url.toLowerCase().includes('price')),
        hasContactPage: keyPages.contact_page !== null,
      };
      
      console.log(`[WEBSITE-SCRAPE] Resolving business identity for ${baseDomain}...`);
      
      // Resolve business identity using the new resolver
      let businessIdentity: BusinessIdentity;
      try {
        businessIdentity = await resolveBusinessIdentity({
          websiteUrl: baseUrl,
          websiteData: websiteExtractedData,
          gbpTokens: null, // TODO: Pass GBP tokens if user is connected
        });
        console.log(`[WEBSITE-SCRAPE] Identity resolved: "${businessIdentity.business_name}" (${businessIdentity.confidence} confidence)`);
        console.log(`[WEBSITE-SCRAPE] Location: ${businessIdentity.location_label || 'Unknown'}`);
        console.log(`[WEBSITE-SCRAPE] Category: ${businessIdentity.category_label}`);
        if (businessIdentity.latlng) {
          console.log(`[WEBSITE-SCRAPE] Coordinates: ${businessIdentity.latlng.lat}, ${businessIdentity.latlng.lng}`);
        }
      } catch (identityError) {
        console.error('[WEBSITE-SCRAPE] Identity resolution error:', identityError);
        // Create a minimal fallback identity
        businessIdentity = {
          website_host: baseDomain,
          business_name: baseDomain.split('.')[0],
          category_label: 'Business',
          service_keywords: allServiceKeywords.slice(0, 5),
          location_label: allLocationEntities[0] || null,
          location_suburb: null,
          location_city: null,
          location_country: 'South Africa',
          latlng: null,
          place_id: null,
          place_types: [], // Empty array as fallback
          rating: null,
          review_count: 0,
          sources: { gbp: false, places: false, website: true },
          confidence: 'low',
          debug_info: ['Fallback identity due to error'],
        };
      }
      
      // =====================================================
      // SEARCH VISIBILITY MODULE (using resolved identity)
      // =====================================================
      
      console.log(`[WEBSITE-SCRAPE] Running search visibility analysis...`);
      
      let searchVisibility: SearchVisibilityResult | undefined;
      try {
        searchVisibility = await getSearchVisibility({
          identity: businessIdentity,
          maxQueries: 10,
          hasMenuPage: websiteExtractedData.hasMenuPage,
          hasPricingPage: websiteExtractedData.hasPricingPage,
        });
        console.log(`[WEBSITE-SCRAPE] Search visibility complete: score ${searchVisibility.visibility_score}%`);
      } catch (svError) {
        console.error('[WEBSITE-SCRAPE] Search visibility error:', svError);
        searchVisibility = {
          queries: [],
          visibility_score: 0,
          share_of_voice: 0,
          branded_visibility: 0,
          non_branded_visibility: 0,
          top_competitor_domains: [],
          directory_domains: [],
          business_domains: [],
          identity_used: {
            business_name: businessIdentity.business_name,
            location_label: businessIdentity.location_label,
            service_keywords: businessIdentity.service_keywords,
          },
          error: svError instanceof Error ? svError.message : 'Unknown error',
        };
      }
      
      // =====================================================
      // COMPETITORS MODULE (using resolved identity)
      // =====================================================
      
      console.log(`[WEBSITE-SCRAPE] Running competitor analysis...`);
      console.log(`[WEBSITE-SCRAPE] Stage 1 competitors provided: ${stage1Competitors?.length || 0}`);
      
      let competitorsSnapshot: CompetitorsSnapshot | undefined;
      try {
        competitorsSnapshot = await getCompetitorSnapshot({
          identity: businessIdentity,
          radiusMeters: 3000, // 3km radius for local competitors (fallback only)
          maxCompetitors: 8,
          stage1Competitors: stage1Competitors || [], // Use Stage 1 competitors if provided
        });
        console.log(`[WEBSITE-SCRAPE] Competitors complete: found ${competitorsSnapshot.competitors_places.length} competitors (${competitorsSnapshot.search_method})`);
        if (competitorsSnapshot.competitor_source) {
          console.log(`[WEBSITE-SCRAPE] Competitor source: ${competitorsSnapshot.competitor_source}`);
        }
      } catch (compError) {
        console.error('[WEBSITE-SCRAPE] Competitor snapshot error:', compError);
        competitorsSnapshot = {
          competitors_places: [],
          reputation_gap: null,
          competitors_with_website: 0,
          competitors_without_website: 0,
          search_method: 'none',
          search_radius_meters: null,
          search_queries_used: [],
          location_used: null,
          your_place_id: businessIdentity.place_id,
          error: compError instanceof Error ? compError.message : 'Unknown error',
          debug_info: [],
        };
      }
      
      const result: ScrapeResult = {
        scrape_metadata: {
          domain: baseDomain,
          timestamp: new Date().toISOString(),
          crawl_duration_seconds: crawlDuration,
          pages_crawled: pageResults.length,
          crawl_depth: maxDepth,
        },
        site_overview: {
          homepage_url: baseUrl,
          robots_txt: robotsTxt,
          sitemap_urls: sitemapUrls.slice(0, 50),
          primary_domain: baseDomain,
          cms_detected: detectedCMS,
          https_enforced: targetUrl.protocol === 'https:',
          favicon_url: homepage?.images.logo_url || null,
        },
        crawl_map: pageResults,
        site_graph: {
          internal_link_matrix: internalLinkMatrix,
          orphan_pages: orphanPages,
        },
        summary_metrics: {
          total_pages: pageResults.length,
          indexable_pages: indexablePages,
          pages_with_issues: pagesWithIssues,
          seo_score: seoScore,
          technical_score: technicalScore,
        },
        site_report_summary: siteReportSummary,
        business_identity: businessIdentity,
        search_visibility: searchVisibility,
        competitors_snapshot: competitorsSnapshot,
      };
      
      console.log(`[WEBSITE-SCRAPE] Completed in ${crawlDuration}s, scraped ${pageResults.length} pages`);
      
      return NextResponse.json(result);
      
    } catch (error) {
      await browser.close();
      throw error;
    }
    
  } catch (error) {
    console.error('[WEBSITE-SCRAPE] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
