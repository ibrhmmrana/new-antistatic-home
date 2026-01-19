"use client";

import { useState, useEffect, useCallback } from "react";
import { debounce } from "@/lib/utils/debounce";

// =============================================================================
// WEBSITE SCRAPER TYPES
// =============================================================================

interface WebsitePageData {
  url: string;
  depth: number;
  http_status: number;
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
  contact_methods: {
    phone: string[];
    email: string[];
    whatsapp: string[];
    forms: number;
    locations: string[];
  };
  clickable_actions: {
    tel_links: string[];
    mailto_links: string[];
    whatsapp_links: string[];
  };
  primary_cta: {
    button_text: string | null;
    destination: string | null;
    above_fold: boolean;
  };
  forms: {
    type: string;
    fields: string[];
    required_fields: string[];
  }[];
  pricing_signals: {
    has_pricing: boolean;
    price_ranges: string[];
    hidden_pricing: boolean;
  };
  local_seo: {
    has_embedded_map: boolean;
    opening_hours: string | null;
  };
  structured_data: {
    type: string;
    format: string;
  }[];
  social_meta: {
    og_title: string | null;
    og_description: string | null;
    og_image: string | null;
    twitter_card: string | null;
  };
  images: {
    hero_image: string | null;
    logo_url: string | null;
    total_images: number;
    images_with_alt: number;
    alt_text_coverage: string;
  };
  performance: {
    html_size_kb: number;
    asset_count: { js: number; css: number; images: number };
    third_party_scripts: string[];
  };
  analytics: {
    google_analytics: boolean;
    ga4: boolean;
    gtm: string | null;
    meta_pixel: boolean;
    tiktok_pixel: boolean;
    hotjar: boolean;
  };
  security: {
    is_https: boolean;
  };
  freshness: {
    copyright_year: string | null;
    recent_dates: string[];
  };
  // Owner-level enhanced fields
  content_digest: {
    render_mode: string;
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
  };
  viewport_checks: {
    primary_cta_visible: boolean;
    primary_cta_text: string | null;
    primary_cta_href: string | null;
    cta_position: string;
    tel_visible: boolean;
    whatsapp_visible: boolean;
    email_visible: boolean;
  };
  enhanced_trust_signals: {
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
  };
  ux_checks: {
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
  };
}

interface OwnerFinding {
  severity: 'high' | 'medium' | 'low';
  category: string;
  issue: string;
  evidence: string;
  page_url: string;
  fix: string;
}

// Business Identity Type (NEW)
interface BusinessIdentity {
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
  place_types: string[];
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

// Search Visibility Types (UPDATED)
interface MapPackResult {
  place_id: string;
  name: string;
  rating?: number;
  user_ratings_total?: number;
  address?: string;
  website?: string | null;
}

interface OrganicResult {
  position: number;
  title: string;
  link: string;
  displayLink?: string;
  snippet?: string;
  faviconUrl?: string;
  domain: string;
}

interface QueryResult {
  query: string;
  intent: 'branded' | 'non_branded';
  rationale: string;
  mapPack: {
    rank: number | null;
    results: MapPackResult[];
  };
  organic: {
    rank: number | null;
    results: OrganicResult[];
  };
  notes: string;
}

interface CompetitorDomain {
  domain: string;
  frequency: number;
  type: 'directory' | 'business';
  positions: number[];
}

interface SearchVisibilityResult {
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

// Competitor Types (UPDATED)
interface CompetitorPlace {
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

interface ReputationGap {
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

interface CompetitorsSnapshot {
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


interface WebsiteScrapeResult {
  scrape_metadata: {
    domain: string;
    timestamp: string;
    crawl_duration_seconds: number;
    pages_crawled: number;
    crawl_depth: number;
  };
  site_overview: {
    homepage_url: string;
    robots_txt: string | null;
    sitemap_urls: string[];
    primary_domain: string;
    cms_detected: string | null;
    https_enforced: boolean;
  };
  crawl_map: WebsitePageData[];
  site_graph: {
    orphan_pages: string[];
  };
  summary_metrics: {
    total_pages: number;
    indexable_pages: number;
    pages_with_issues: number;
    seo_score: number;
    technical_score: number;
  };
  site_report_summary: {
    key_pages: {
      homepage: string | null;
      contact_page: string | null;
      booking_or_lead_page: string | null;
      pricing_page: string | null;
      about_page: string | null;
      services_page: string | null;
    };
    intent_coverage: {
      has_services: boolean;
      has_pricing: boolean;
      has_contact: boolean;
      has_about: boolean;
      has_faq: boolean;
      has_locations: boolean;
      has_blog: boolean;
      has_booking: boolean;
    };
    conversion_path_score: number;
    content_quality_score: number;
    trust_score: number;
    owner_style_findings: OwnerFinding[];
    thin_pages_count: number;
    near_duplicate_groups: string[][];
  };
  // NEW: Business Identity, Search Visibility, Competitors
  business_identity?: BusinessIdentity;
  search_visibility?: SearchVisibilityResult;
  competitors_snapshot?: CompetitorsSnapshot;
}

// =============================================================================
// INSTAGRAM TYPES
// =============================================================================

interface ProfileData {
  profilePictureUrl: string | null;
  username: string;
  fullName: string | null;
  biography: string | null;
  website: string | null;
  isVerified: boolean;
  category: string | null;
  postCount: number | null;
  followerCount: number | null;
  followingCount: number | null;
}

interface Comment {
  author: string;
  text: string;
}

interface Post {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  caption: string | null;
  date: string | null;
  likeCount: number | null;
  commentCount: number | null;
  comments: Comment[];
}

interface ScrapeResult {
  profile: ProfileData;
  posts: Post[];
}

// =============================================================================
// FACEBOOK TYPES
// =============================================================================

interface FacebookComment {
  author: string | null;
  text: string | null;
  timeAgo: string | null;
  reactionCount: number | null;
}

interface FacebookPost {
  caption: string | null;
  likeCount: number | null;
  commentCount: number | null;
  mediaType: 'image' | 'video' | 'multiple_images' | 'unknown';
  comments: FacebookComment[];
}

interface FacebookProfileData {
  name: string | null;
  description: string | null;
  category: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  hours: string | null;
  serviceOptions: string | null;
  priceRange: string | null;
  reviewsRating: string | null;
  profilePictureUrl: string | null;
  posts: FacebookPost[];
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function TestSocialScraper() {
  // Instagram state
  const [igUsername, setIgUsername] = useState("");
  const [igLoading, setIgLoading] = useState(false);
  const [igResult, setIgResult] = useState<ScrapeResult | null>(null);
  const [igError, setIgError] = useState<string | null>(null);

  // Facebook state
  const [fbUsername, setFbUsername] = useState("");
  const [fbLoading, setFbLoading] = useState(false);
  const [fbResult, setFbResult] = useState<FacebookProfileData | null>(null);
  const [fbError, setFbError] = useState<string | null>(null);

  // Website scraper state
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [websiteMaxDepth, setWebsiteMaxDepth] = useState(2);
  const [websiteMaxPages, setWebsiteMaxPages] = useState(10);
  const [websiteLoading, setWebsiteLoading] = useState(false);
  const [websiteResult, setWebsiteResult] = useState<WebsiteScrapeResult | null>(null);
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState<WebsitePageData | null>(null);
  const [showJsonOutput, setShowJsonOutput] = useState(false);
  const [showFbJsonOutput, setShowFbJsonOutput] = useState(false);
  const [showIgJsonOutput, setShowIgJsonOutput] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [selectedQueryDetail, setSelectedQueryDetail] = useState<QueryResult | null>(null);

  // GBP Analyzer state
  const [gbpSearchInput, setGbpSearchInput] = useState("");
  const [gbpAutocompleteResults, setGbpAutocompleteResults] = useState<Array<{
    place_id: string;
    description: string;
    main_text: string;
    secondary_text: string;
  }>>([]);
  const [gbpShowAutocomplete, setGbpShowAutocomplete] = useState(false);
  const [gbpLoading, setGbpLoading] = useState(false);
  const [gbpAnalysis, setGbpAnalysis] = useState<{
    placeDetails: {
      name: string;
      address: string;
      lat: number | null;
      lng: number | null;
      website: string | null;
      phone: string | null;
      rating: number | null;
      reviews: number;
      openingHours: any;
      priceLevel: number | null;
      types: string[];
      businessStatus: string | null;
    };
    analysis: {
      businessName: string;
      rating?: number;
      reviews?: number;
      checklist: Array<{
        key: string;
        label: string;
        status: 'good' | 'warn' | 'bad';
        value?: string;
        helper: string;
        extractedValue?: string;
      }>;
      keywordChecks: {
        extractedKeywords: string[];
      };
    };
  } | null>(null);
  const [gbpError, setGbpError] = useState<string | null>(null);
  const [gbpExpandedItem, setGbpExpandedItem] = useState<string | null>(null);

  // Instagram submit handler
  const handleInstagramSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIgLoading(true);
    setIgError(null);
    setIgResult(null);

    try {
      const response = await fetch("/api/test/instagram-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: igUsername }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Scraping failed");
      }

      const data = await response.json();
      setIgResult(data);
    } catch (err: any) {
      setIgError(err.message || "An error occurred");
    } finally {
      setIgLoading(false);
    }
  };

  // Facebook submit handler
  const handleFacebookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFbLoading(true);
    setFbError(null);
    setFbResult(null);

    try {
      const response = await fetch("/api/test/facebook-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: fbUsername }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Scraping failed");
      }

      const data = await response.json();
      setFbResult(data);
    } catch (err: any) {
      setFbError(err.message || "An error occurred");
    } finally {
      setFbLoading(false);
    }
  };

  // Website scraper submit handler
  const handleWebsiteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWebsiteLoading(true);
    setWebsiteError(null);
    setWebsiteResult(null);
    setSelectedPage(null);

    try {
      const response = await fetch("/api/scan/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          url: websiteUrl, 
          maxDepth: websiteMaxDepth,
          maxPages: websiteMaxPages 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Scraping failed");
      }

      const data = await response.json();
      setWebsiteResult(data);
    } catch (err: any) {
      setWebsiteError(err.message || "An error occurred");
    } finally {
      setWebsiteLoading(false);
    }
  };

  // GBP Analyzer handlers
  const handleGbpSearchChange = (value: string) => {
    setGbpSearchInput(value);
    setGbpShowAutocomplete(value.length >= 2);
    
    if (value.length < 2) {
      setGbpAutocompleteResults([]);
      return;
    }
  };

  const debouncedGbpSearch = useCallback(
    debounce(async (input: string) => {
      if (input.length < 2) return;
      
      try {
        const response = await fetch(`/api/gbp/autocomplete?input=${encodeURIComponent(input)}`);
        if (!response.ok) throw new Error('Autocomplete failed');
        const data = await response.json();
        setGbpAutocompleteResults(data.predictions || []);
      } catch (error) {
        console.error('Autocomplete error:', error);
        setGbpAutocompleteResults([]);
      }
    }, 350),
    []
  );

  useEffect(() => {
    if (gbpSearchInput.length >= 2) {
      debouncedGbpSearch(gbpSearchInput);
    } else {
      setGbpAutocompleteResults([]);
    }
  }, [gbpSearchInput, debouncedGbpSearch]);

  const handleGbpPlaceSelect = async (placeId: string, description: string) => {
    setGbpSearchInput(description);
    setGbpShowAutocomplete(false);
    setGbpAutocompleteResults([]);
    setGbpLoading(true);
    setGbpError(null);
    setGbpAnalysis(null);

    try {
      const response = await fetch(`/api/gbp/place-details?place_id=${encodeURIComponent(placeId)}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch place details');
      }
      const data = await response.json();
      setGbpAnalysis(data);
    } catch (error: any) {
      setGbpError(error.message || 'An error occurred');
    } finally {
      setGbpLoading(false);
    }
  };

  // Helper function to get detailed explanations for GBP checklist items
  const getGbpItemExplanation = (
    key: string,
    status: 'good' | 'warn' | 'bad',
    analysis: typeof gbpAnalysis
  ): string | null => {
    if (!analysis) return null;

    const explanations: Record<string, Record<string, string>> = {
      website: {
        good: `Your business has a website connected to your Google Business Profile. This is excellent for:

• Customers can learn more about your services
• Improves your local SEO ranking
• Provides a direct way for customers to contact you
• Builds trust and credibility

Make sure your website is mobile-friendly and loads quickly.`,
        bad: `Your Google Business Profile doesn't have a website connected. This is a missed opportunity:

• Customers can't easily learn more about your business
• You're missing potential leads and conversions
• Lower local SEO visibility
• Less credibility compared to competitors with websites

Action: Add your website URL in your Google Business Profile settings.`,
      },
      description: {
        good: `Your business has a description that helps customers understand what you offer. A good description:

• Uses relevant keywords naturally
• Mentions your location or service area
• Highlights unique selling points
• Is clear and concise (750 characters or less)

Keep it updated with seasonal offerings or new services.`,
        bad: `Your Google Business Profile is missing a description. This is a critical gap:

• Customers can't quickly understand what you offer
• Missed opportunity for local SEO keywords
• Less likely to appear in relevant searches
• Competitors with descriptions will rank higher

Action: Add a compelling description (up to 750 characters) that includes:
- What you do
- Where you're located
- What makes you unique
- Key services or products`,
      },
      hours: {
        good: `Your business hours are properly configured. This helps customers:

• Plan their visits
• Avoid showing up when you're closed
• Reduces phone calls asking about hours
• Improves customer satisfaction

Keep hours updated for holidays and special events.`,
        bad: `Your business hours are not set in your Google Business Profile. This causes problems:

• Customers don't know when you're open
• Increased phone calls asking about hours
• Potential customers may go elsewhere
• Lower trust and credibility

Action: Add your business hours in Google Business Profile settings.`,
      },
      phone: {
        good: `Your phone number is visible on your Google Business Profile. This enables:

• Direct customer contact
• Phone calls from Google Maps/Search
• Click-to-call on mobile devices
• Better local SEO signals

Make sure your phone number is consistent across all platforms.`,
        bad: `Your phone number is missing from your Google Business Profile. This hurts your business:

• Customers can't easily contact you
• Missed phone call leads
• Lower conversion rates
• Less trust from potential customers

Action: Add your phone number in Google Business Profile settings.`,
      },
      price: {
        good: `Your price range is set, which helps customers:

• Set clear expectations
• Filter your business in price-based searches
• Attract the right customer segment
• Reduce inquiries about pricing

Price levels: $ = Budget-friendly, $$ = Moderate, $$$ = Upscale, $$$$ = Very expensive`,
        warn: `Your price range isn't set. While not critical, it helps:

• Customers understand your price point
• Filter in price-based searches
• Set expectations before visiting

Action: Consider adding a price range if applicable to your business type.`,
      },
      social: {
        good: `Great! Your website includes links to social media profiles. This helps:

• Build a stronger online presence
• Drive traffic between platforms
• Increase engagement and followers
• Showcase customer reviews and content

Keep your social profiles active and updated.`,
        bad: `Your website doesn't appear to have social media links. This is a missed opportunity:

• Can't easily cross-promote your platforms
• Harder for customers to find you on social media
• Less engagement and brand awareness
• Competitors with active social presence have an advantage

Action: Add links to your Instagram, Facebook, LinkedIn, or other social profiles on your website.`,
        warn: `We can't check for social media links without a website URL.

If you have a website, make sure to:
• Add social media icons/links prominently
• Link to all active profiles
• Keep links updated when profiles change`,
      },
      description_keywords: {
        good: `Your description includes relevant keywords that match your business type and location. This helps:

• Rank higher in local searches
• Appear in more relevant search queries
• Attract the right customers
• Improve click-through rates

Keep keywords natural and relevant to your actual services.`,
        warn: `Your description could include more relevant keywords. Consider adding:

• Your business category (e.g., "restaurant", "dentist", "plumber")
• Location terms (neighborhood, city)
• Service-specific keywords
• What makes you unique

Example: "Family-owned Italian restaurant in downtown serving authentic pasta and pizza since 1995"`,
        bad: `Your description doesn't include relevant keywords. This hurts your visibility:

• Lower ranking in local searches
• Missed opportunities to appear in relevant queries
• Less likely customers will find you
• Competitors with keyword-rich descriptions rank higher

Action: Update your description to naturally include:
- Business type/category
- Location (neighborhood, city)
- Key services or specialties`,
      },
      category_keywords: {
        good: `Your business has proper category types set. This ensures:

• Accurate classification in Google searches
• Appears in the right category filters
• Better matching with customer intent
• Higher visibility for relevant queries

Make sure your primary category is the most specific one that describes your business.`,
        warn: `Your business categories may be too generic. Consider:

• Using more specific categories if available
• Adding secondary categories for additional services
• Ensuring categories match what customers search for

Example: Instead of just "restaurant", use "Italian restaurant" or "Seafood restaurant" if applicable.`,
      },
    };

    return explanations[key]?.[status] || null;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 text-gray-900 [color-scheme:light]">
      <div className="max-w-6xl mx-auto">
        {/* ================================================================= */}
        {/* WEBSITE SCRAPER SECTION */}
        {/* ================================================================= */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🌐 Website Scraper & SEO Analyzer
          </h1>
          <p className="text-gray-600 mb-6">
            Enter a website URL to crawl and analyze for SEO, contact info, analytics, and more
          </p>

          <form onSubmit={handleWebsiteSubmit} className="space-y-4">
            <div className="flex gap-4">
              <input
                type="text"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="Enter website URL (e.g., example.com or https://example.com)"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
              />
              <button
                type="submit"
                disabled={websiteLoading}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
              >
                {websiteLoading ? "Scanning..." : "Scan Website"}
              </button>
            </div>
            <div className="flex gap-6 text-sm">
              <label className="flex items-center gap-2">
                <span className="text-gray-600">Max Depth:</span>
                <select 
                  value={websiteMaxDepth} 
                  onChange={(e) => setWebsiteMaxDepth(Number(e.target.value))}
                  className="px-2 py-1 border border-gray-300 rounded"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span className="text-gray-600">Max Pages:</span>
                <select 
                  value={websiteMaxPages} 
                  onChange={(e) => setWebsiteMaxPages(Number(e.target.value))}
                  className="px-2 py-1 border border-gray-300 rounded"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </label>
            </div>
          </form>
        </div>

        {websiteLoading && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
            <div className="flex items-center gap-3">
              <div className="animate-spin h-5 w-5 border-2 border-green-600 border-t-transparent rounded-full"></div>
              <span className="text-green-800">Crawling website... This may take a few minutes.</span>
            </div>
          </div>
        )}

        {websiteError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-red-800 mb-2">❌ Website Scrape Error</h2>
            <p className="text-red-600">{websiteError}</p>
          </div>
        )}

        {websiteResult && (
          <div className="space-y-6 mb-8">
            {/* Summary Cards - Basic Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-white rounded-lg shadow p-4 text-center">
                <div className="text-3xl font-bold text-green-600">{websiteResult.summary_metrics.total_pages}</div>
                <div className="text-sm text-gray-600">Pages Crawled</div>
              </div>
              <div className="bg-white rounded-lg shadow p-4 text-center">
                <div className="text-3xl font-bold text-blue-600">{websiteResult.summary_metrics.indexable_pages}</div>
                <div className="text-sm text-gray-600">Indexable</div>
              </div>
              <div className="bg-white rounded-lg shadow p-4 text-center">
                <div className="text-3xl font-bold text-yellow-600">{websiteResult.summary_metrics.pages_with_issues}</div>
                <div className="text-sm text-gray-600">With Issues</div>
              </div>
              <div className="bg-white rounded-lg shadow p-4 text-center">
                <div className="text-3xl font-bold text-purple-600">{websiteResult.summary_metrics.seo_score}%</div>
                <div className="text-sm text-gray-600">SEO Score</div>
              </div>
              <div className="bg-white rounded-lg shadow p-4 text-center">
                <div className="text-3xl font-bold text-teal-600">{websiteResult.summary_metrics.technical_score}%</div>
                <div className="text-sm text-gray-600">Technical Score</div>
              </div>
            </div>

            {/* Owner-Level Score Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg shadow p-5 border border-orange-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-orange-800">Conversion Path</span>
                  <span className={`text-2xl font-bold ${websiteResult.site_report_summary.conversion_path_score >= 70 ? 'text-green-600' : websiteResult.site_report_summary.conversion_path_score >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {websiteResult.site_report_summary.conversion_path_score}%
                  </span>
                </div>
                <div className="w-full bg-orange-200 rounded-full h-2">
                  <div className="bg-orange-500 h-2 rounded-full" style={{ width: `${websiteResult.site_report_summary.conversion_path_score}%` }}></div>
                </div>
                <p className="text-xs text-orange-700 mt-2">CTA visibility, contact methods, lead capture</p>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg shadow p-5 border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-blue-800">Content Quality</span>
                  <span className={`text-2xl font-bold ${websiteResult.site_report_summary.content_quality_score >= 70 ? 'text-green-600' : websiteResult.site_report_summary.content_quality_score >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {websiteResult.site_report_summary.content_quality_score}%
                  </span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${websiteResult.site_report_summary.content_quality_score}%` }}></div>
                </div>
                <p className="text-xs text-blue-700 mt-2">H1s, meta, service terms, local keywords</p>
              </div>
              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg shadow p-5 border border-emerald-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-emerald-800">Trust Score</span>
                  <span className={`text-2xl font-bold ${websiteResult.site_report_summary.trust_score >= 70 ? 'text-green-600' : websiteResult.site_report_summary.trust_score >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {websiteResult.site_report_summary.trust_score}%
                  </span>
                </div>
                <div className="w-full bg-emerald-200 rounded-full h-2">
                  <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${websiteResult.site_report_summary.trust_score}%` }}></div>
                </div>
                <p className="text-xs text-emerald-700 mt-2">Reviews, testimonials, social proof</p>
              </div>
            </div>

            {/* ================================================================= */}
            {/* DEBUG: IDENTITY + QUERY BUILDER PANEL */}
            {/* ================================================================= */}
            {websiteResult.business_identity && (
              <div className="bg-gray-800 rounded-lg shadow-md">
                <button
                  onClick={() => setShowDebugPanel(!showDebugPanel)}
                  className="w-full px-6 py-4 flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">🔧</span>
                    <span className="font-bold text-white">Debug: Identity + Query Builder</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      websiteResult.business_identity.confidence === 'high' ? 'bg-green-600 text-white' :
                      websiteResult.business_identity.confidence === 'medium' ? 'bg-yellow-600 text-white' :
                      'bg-red-600 text-white'
                    }`}>
                      {websiteResult.business_identity.confidence} confidence
                    </span>
                  </div>
                  <span className="text-gray-400">{showDebugPanel ? '▼' : '▶'}</span>
                </button>
                
                {showDebugPanel && (
                  <div className="px-6 pb-6 space-y-4">
                    {/* Identity Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-gray-900 rounded-lg p-4">
                        <h4 className="font-semibold text-green-400 mb-3">🏢 Resolved Identity</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Business Name:</span>
                            <span className="text-white font-medium">{websiteResult.business_identity.business_name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Category:</span>
                            <span className="text-white">{websiteResult.business_identity.category_label}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Location:</span>
                            <span className="text-white">{websiteResult.business_identity.location_label || 'Unknown'}</span>
                          </div>
                          {websiteResult.business_identity.location_suburb && (
                            <div className="flex justify-between">
                              <span className="text-gray-400">Suburb:</span>
                              <span className="text-white">{websiteResult.business_identity.location_suburb}</span>
                            </div>
                          )}
                          {websiteResult.business_identity.location_city && (
                            <div className="flex justify-between">
                              <span className="text-gray-400">City:</span>
                              <span className="text-white">{websiteResult.business_identity.location_city}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-gray-400">Place ID:</span>
                            <span className="text-white font-mono text-xs">{websiteResult.business_identity.place_id || 'None'}</span>
                          </div>
                          {websiteResult.business_identity.place_types && websiteResult.business_identity.place_types.length > 0 && (
                            <div className="flex justify-between">
                              <span className="text-gray-400">Place Types:</span>
                              <span className="text-white text-xs">{websiteResult.business_identity.place_types.join(', ')}</span>
                            </div>
                          )}
                          {websiteResult.business_identity.latlng && (
                            <div className="flex justify-between">
                              <span className="text-gray-400">Coordinates:</span>
                              <span className="text-white font-mono text-xs">
                                {websiteResult.business_identity.latlng.lat.toFixed(4)}, {websiteResult.business_identity.latlng.lng.toFixed(4)}
                              </span>
                            </div>
                          )}
                          {websiteResult.business_identity.rating !== null && (
                            <div className="flex justify-between">
                              <span className="text-gray-400">Rating:</span>
                              <span className="text-yellow-400">{websiteResult.business_identity.rating}⭐ ({websiteResult.business_identity.review_count} reviews)</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-gray-400">Sources:</span>
                            <span className="text-white">
                              {[
                                websiteResult.business_identity.sources.gbp && 'GBP',
                                websiteResult.business_identity.sources.places && 'Places',
                                websiteResult.business_identity.sources.website && 'Website',
                              ].filter(Boolean).join(', ') || 'None'}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-gray-900 rounded-lg p-4">
                        <h4 className="font-semibold text-blue-400 mb-3">🏷️ Service Keywords</h4>
                        <div className="flex flex-wrap gap-2">
                          {websiteResult.business_identity.service_keywords.map((kw, i) => (
                            <span key={i} className="px-2 py-1 bg-blue-900 text-blue-200 rounded text-xs">
                              {kw}
                            </span>
                          ))}
                          {websiteResult.business_identity.service_keywords.length === 0 && (
                            <span className="text-gray-500 text-sm">No service keywords detected</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Query Generation Debug */}
                    {websiteResult.search_visibility?.query_generation_debug && (
                      <div className="bg-gray-900 rounded-lg p-4">
                        <h4 className="font-semibold text-yellow-400 mb-3">🔍 Query Generation Debug</h4>
                        <div className="space-y-3 text-sm">
                          <div>
                            <span className="text-gray-400">Category Family:</span>
                            <span className="ml-2 text-white font-medium">
                              {websiteResult.search_visibility.query_generation_debug.category_family}
                            </span>
                          </div>
                          
                          {websiteResult.search_visibility.query_generation_debug.allowed_services_used.length > 0 && (
                            <div>
                              <span className="text-gray-400">Allowed Services Used:</span>
                              <div className="flex flex-wrap gap-2 mt-1">
                                {websiteResult.search_visibility.query_generation_debug.allowed_services_used.map((kw, i) => (
                                  <span key={i} className="px-2 py-1 bg-green-900 text-green-200 rounded text-xs">
                                    {kw}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {websiteResult.search_visibility.query_generation_debug.rejected_keywords.length > 0 && (
                            <div>
                              <span className="text-gray-400">Rejected Keywords:</span>
                              <div className="flex flex-wrap gap-2 mt-1">
                                {websiteResult.search_visibility.query_generation_debug.rejected_keywords.map((kw, i) => (
                                  <span key={i} className="px-2 py-1 bg-red-900 text-red-200 rounded text-xs">
                                    {kw}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Generated Queries */}
                    {websiteResult.search_visibility && websiteResult.search_visibility.queries.length > 0 && (
                      <div className="bg-gray-900 rounded-lg p-4">
                        <h4 className="font-semibold text-purple-400 mb-3">🔍 Generated Search Queries ({websiteResult.search_visibility.queries.length})</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-gray-400 border-b border-gray-700">
                                <th className="pb-2 pr-4">#</th>
                                <th className="pb-2 pr-4">Query</th>
                                <th className="pb-2 pr-4">Intent</th>
                                <th className="pb-2 pr-4">Rationale</th>
                                <th className="pb-2">Ranking</th>
                              </tr>
                            </thead>
                            <tbody>
                              {websiteResult.search_visibility.queries.map((q, i) => (
                                <tr key={i} className="border-b border-gray-800 text-white">
                                  <td className="py-2 pr-4 text-gray-500">{i + 1}</td>
                                  <td className="py-2 pr-4 font-medium">"{q.query}"</td>
                                  <td className="py-2 pr-4">
                                    <span className={`px-2 py-0.5 rounded text-xs ${
                                      q.intent === 'branded' ? 'bg-blue-900 text-blue-200' : 'bg-green-900 text-green-200'
                                    }`}>
                                      {q.intent}
                                    </span>
                                  </td>
                                  <td className="py-2 pr-4 text-gray-400 text-xs">{q.rationale}</td>
                                  <td className="py-2">
                                    <div className="space-y-1">
                                      {q.mapPack.rank ? (
                                        <div className="text-xs">
                                          <span className="text-blue-400">Map: </span>
                                          <span className="font-bold text-blue-300">#{q.mapPack.rank}</span>
                                        </div>
                                      ) : (
                                        <div className="text-xs text-gray-500">Map: Unranked</div>
                                      )}
                                      {q.organic.rank ? (
                                        <div className="text-xs">
                                          <span className="text-green-400">Organic: </span>
                                          <span className={`font-bold ${
                                            q.organic.rank <= 3 ? 'text-green-300' : 
                                            q.organic.rank <= 5 ? 'text-yellow-300' : 'text-orange-300'
                                          }`}>
                                            #{q.organic.rank}
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="text-xs text-gray-500">Organic: Unranked</div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    
                    {/* Debug Log */}
                    {websiteResult.business_identity.debug_info && websiteResult.business_identity.debug_info.length > 0 && (
                      <div className="bg-gray-900 rounded-lg p-4">
                        <h4 className="font-semibold text-gray-400 mb-3">📋 Resolution Log</h4>
                        <div className="font-mono text-xs text-gray-400 space-y-1 max-h-40 overflow-y-auto">
                          {websiteResult.business_identity.debug_info.map((line, i) => (
                            <div key={i}>→ {line}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ================================================================= */}
            {/* SEARCH VISIBILITY SECTION */}
            {/* ================================================================= */}
            {websiteResult.search_visibility && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">🔍 Search Visibility</h2>
                
                {websiteResult.search_visibility.error ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800 text-sm">
                    ⚠️ {websiteResult.search_visibility.error}
                  </div>
                ) : (
                  <>
                    {/* Visibility Score Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4 border border-indigo-200 text-center">
                        <div className={`text-3xl font-bold ${websiteResult.search_visibility.visibility_score >= 50 ? 'text-green-600' : websiteResult.search_visibility.visibility_score >= 25 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {websiteResult.search_visibility.visibility_score}%
                        </div>
                        <div className="text-sm text-indigo-700 mt-1">Visibility Score</div>
                      </div>
                      <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200 text-center">
                        <div className={`text-3xl font-bold ${websiteResult.search_visibility.share_of_voice >= 50 ? 'text-green-600' : websiteResult.search_visibility.share_of_voice >= 25 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {websiteResult.search_visibility.share_of_voice}%
                        </div>
                        <div className="text-sm text-purple-700 mt-1">Share of Voice</div>
                      </div>
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200 text-center">
                        <div className={`text-3xl font-bold ${websiteResult.search_visibility.branded_visibility >= 50 ? 'text-green-600' : websiteResult.search_visibility.branded_visibility >= 25 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {websiteResult.search_visibility.branded_visibility || 0}%
                        </div>
                        <div className="text-sm text-blue-700 mt-1">Branded Visibility</div>
                      </div>
                      <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200 text-center">
                        <div className={`text-3xl font-bold ${websiteResult.search_visibility.non_branded_visibility >= 50 ? 'text-green-600' : websiteResult.search_visibility.non_branded_visibility >= 25 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {websiteResult.search_visibility.non_branded_visibility || 0}%
                        </div>
                        <div className="text-sm text-green-700 mt-1">Non-Branded</div>
                      </div>
                    </div>
                    
                    {/* Identity Used Summary */}
                    {websiteResult.search_visibility.identity_used && (
                      <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
                        <span className="text-gray-600">Searching as: </span>
                        <span className="font-semibold text-gray-900">{websiteResult.search_visibility.identity_used.business_name}</span>
                        {websiteResult.search_visibility.identity_used.location_label && (
                          <span className="text-gray-600"> in {websiteResult.search_visibility.identity_used.location_label}</span>
                        )}
                      </div>
                    )}

                    {/* Query Results Table (Owner-style: Map Pack + Organic) */}
                    {websiteResult.search_visibility.queries.length > 0 && (
                      <div className="overflow-x-auto mb-6">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-gray-50">
                              <th className="text-left p-2">Query</th>
                              <th className="text-left p-2">Intent</th>
                              <th className="text-left p-2">Map Pack</th>
                              <th className="text-left p-2">Organic</th>
                              <th className="text-left p-2">Competitors</th>
                              <th className="text-left p-2">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {websiteResult.search_visibility.queries.map((qr, index) => {
                              // Extract competitors from actual results
                              const mapCompetitors = qr.mapPack.results
                                .filter(mp => mp.place_id !== websiteResult.business_identity?.place_id)
                                .slice(0, 2);
                              
                              const organicCompetitors = qr.organic.results
                                .filter(r => {
                                  const domain = r.domain.toLowerCase();
                                  const target = websiteResult.scrape_metadata.domain.toLowerCase();
                                  return !domain.includes(target) && !target.includes(domain);
                                })
                                .slice(0, 3);
                              
                              return (
                                <tr key={index} className="border-b hover:bg-gray-50">
                                  <td className="p-2 font-medium">"{qr.query}"</td>
                                  <td className="p-2">
                                    <span className={`px-2 py-0.5 rounded text-xs ${
                                      qr.intent === 'branded' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                                    }`}>
                                      {qr.intent}
                                    </span>
                                  </td>
                                  <td className="p-2">
                                    {qr.mapPack.rank ? (
                                      <div>
                                        <span className={`font-bold ${
                                          qr.mapPack.rank === 1 ? 'text-green-600' : 
                                          qr.mapPack.rank === 2 ? 'text-yellow-600' : 'text-orange-600'
                                        }`}>
                                          #{qr.mapPack.rank}
                                        </span>
                                        {qr.mapPack.results.length > 0 && (
                                          <div className="text-xs text-gray-500 mt-1">
                                            {qr.mapPack.results[0].name}
                                            {qr.mapPack.results[0].rating && ` (${qr.mapPack.results[0].rating}⭐)`}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-gray-400 text-xs">Unranked map pack</span>
                                    )}
                                  </td>
                                  <td className="p-2">
                                    {qr.organic.rank ? (
                                      <div>
                                        <span className={`font-bold ${
                                          qr.organic.rank <= 3 ? 'text-green-600' : 
                                          qr.organic.rank <= 5 ? 'text-yellow-600' : 'text-orange-600'
                                        }`}>
                                          #{qr.organic.rank}
                                        </span>
                                        {qr.organic.results.length > 0 && (
                                          <div className="text-xs text-gray-500 mt-1 truncate max-w-[150px]">
                                            {qr.organic.results[0].title}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-gray-400 text-xs">Unranked organic</span>
                                    )}
                                  </td>
                                  <td className="p-2">
                                    <div className="space-y-1">
                                      {mapCompetitors.length > 0 && (
                                        <div className="text-xs">
                                          <span className="text-blue-600 font-medium">Maps:</span>
                                          {mapCompetitors.map((mp, i) => (
                                            <span key={i} className="ml-1 text-gray-600">
                                              {mp.name}{i < mapCompetitors.length - 1 ? ',' : ''}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                      {organicCompetitors.length > 0 && (
                                        <div className="text-xs">
                                          <span className="text-green-600 font-medium">Search:</span>
                                          {organicCompetitors.slice(0, 2).map((r, i) => (
                                            <span key={i} className="ml-1 text-gray-600">
                                              {r.displayLink || r.domain}{i < Math.min(organicCompetitors.length, 2) - 1 ? ',' : ''}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-2">
                                    <button
                                      onClick={() => setSelectedQueryDetail(qr)}
                                      className="text-blue-600 hover:underline text-xs font-medium"
                                    >
                                      View Details →
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Owner-style Query Detail Modal */}
                    {selectedQueryDetail && (
                      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
                          <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center z-10">
                            <div>
                              <h3 className="text-xl font-bold text-gray-900">"{selectedQueryDetail.query}"</h3>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`px-2 py-0.5 rounded text-xs ${
                                  selectedQueryDetail.intent === 'branded' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                                }`}>
                                  {selectedQueryDetail.intent}
                                </span>
                                {selectedQueryDetail.mapPack.rank && (
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
                                    Map Pack #{selectedQueryDetail.mapPack.rank}
                                  </span>
                                )}
                                {!selectedQueryDetail.mapPack.rank && (
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                                    Unranked map pack
                                  </span>
                                )}
                                {selectedQueryDetail.organic.rank && (
                                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-semibold">
                                    Organic #{selectedQueryDetail.organic.rank}
                                  </span>
                                )}
                                {!selectedQueryDetail.organic.rank && (
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                                    Unranked organic
                                  </span>
                                )}
                              </div>
                            </div>
                            <button 
                              onClick={() => setSelectedQueryDetail(null)} 
                              className="text-gray-500 hover:text-gray-700 text-2xl"
                            >
                              ✕
                            </button>
                          </div>
                          
                          <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Left: Map Pack */}
                              <div>
                                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                  <span className="text-2xl">📍</span>
                                  <span>Google Maps Pack (Top 3)</span>
                                </h4>
                                {selectedQueryDetail.mapPack.results.length > 0 ? (
                                  <div className="space-y-3">
                                    {selectedQueryDetail.mapPack.results.map((mp, i) => {
                                      const isUserBusiness = mp.place_id === websiteResult.business_identity?.place_id;
                                      return (
                                        <div 
                                          key={i} 
                                          className={`p-3 rounded-lg border-2 ${
                                            isUserBusiness 
                                              ? 'bg-green-50 border-green-300' 
                                              : 'bg-gray-50 border-gray-200'
                                          }`}
                                        >
                                          <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                              <div className="flex items-center gap-2">
                                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                                  i === 0 ? 'bg-yellow-400 text-yellow-900' :
                                                  i === 1 ? 'bg-gray-300 text-gray-700' :
                                                  'bg-orange-200 text-orange-800'
                                                }`}>
                                                  #{i + 1}
                                                </span>
                                                <span className="font-semibold text-gray-900">{mp.name}</span>
                                                {isUserBusiness && (
                                                  <span className="px-2 py-0.5 bg-green-600 text-white rounded text-xs">
                                                    You
                                                  </span>
                                                )}
                                              </div>
                                              {mp.rating && (
                                                <div className="mt-1 text-sm text-gray-600">
                                                  {mp.rating.toFixed(1)} ⭐
                                                  {mp.user_ratings_total && ` (${mp.user_ratings_total.toLocaleString()} reviews)`}
                                                </div>
                                              )}
                                              {mp.address && (
                                                <div className="text-xs text-gray-500 mt-1">{mp.address}</div>
                                              )}
                                              {mp.website && (
                                                <a 
                                                  href={mp.website} 
                                                  target="_blank" 
                                                  rel="noopener noreferrer"
                                                  className="text-xs text-blue-600 hover:underline mt-1 block"
                                                >
                                                  {new URL(mp.website).hostname.replace('www.', '')}
                                                </a>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="text-gray-500 text-sm">No map pack results available</div>
                                )}
                              </div>
                              
                              {/* Right: Organic Results */}
                              <div>
                                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                  <span className="text-2xl">🔍</span>
                                  <span>Google Organic Results (Top 10)</span>
                                </h4>
                                {selectedQueryDetail.organic.results.length > 0 ? (
                                  <div className="space-y-2">
                                    {selectedQueryDetail.organic.results.map((result) => {
                                      const isUserDomain = (() => {
                                        const domain = result.domain.toLowerCase();
                                        const target = websiteResult.scrape_metadata.domain.toLowerCase();
                                        return domain.includes(target) || target.includes(domain);
                                      })();
                                      
                                      return (
                                        <div 
                                          key={result.position}
                                          className={`p-3 rounded-lg border ${
                                            isUserDomain 
                                              ? 'bg-green-50 border-green-300' 
                                              : 'bg-white border-gray-200 hover:border-gray-300'
                                          }`}
                                        >
                                          <div className="flex items-start gap-2">
                                            {result.faviconUrl && (
                                              <img 
                                                src={result.faviconUrl} 
                                                alt="" 
                                                className="w-4 h-4 mt-0.5 flex-shrink-0"
                                                onError={(e) => {
                                                  (e.target as HTMLImageElement).style.display = 'none';
                                                }}
                                              />
                                            )}
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500">#{result.position}</span>
                                                <a 
                                                  href={result.link} 
                                                  target="_blank" 
                                                  rel="noopener noreferrer"
                                                  className={`text-sm font-medium hover:underline truncate ${
                                                    isUserDomain ? 'text-green-700' : 'text-blue-600'
                                                  }`}
                                                >
                                                  {result.title}
                                                </a>
                                                {isUserDomain && (
                                                  <span className="px-1.5 py-0.5 bg-green-600 text-white rounded text-xs flex-shrink-0">
                                                    You
                                                  </span>
                                                )}
                                              </div>
                                              <div className="text-xs text-gray-500 mt-0.5 truncate">
                                                {result.displayLink || result.domain}
                                              </div>
                                              {result.snippet && (
                                                <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                                                  {result.snippet}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="text-gray-500 text-sm">No organic results available</div>
                                )}
                              </div>
                            </div>
                            
                            {/* Summary */}
                            <div className="mt-6 pt-4 border-t">
                              <p className="text-sm text-gray-600">
                                <strong>Rationale:</strong> {selectedQueryDetail.rationale}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Top Competitor Domains - Split by type */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      {/* Business Competitors */}
                      {websiteResult.search_visibility.business_domains && websiteResult.search_visibility.business_domains.length > 0 && (
                        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                          <h4 className="font-semibold text-green-800 mb-2">🏢 Business Competitors</h4>
                          <div className="flex flex-wrap gap-2">
                            {websiteResult.search_visibility.business_domains.slice(0, 6).map((comp, i) => (
                              <span key={i} className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">
                                {comp.domain} <span className="text-green-600">({comp.frequency}x)</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Directory/Platform Listings */}
                      {websiteResult.search_visibility.directory_domains && websiteResult.search_visibility.directory_domains.length > 0 && (
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <h4 className="font-semibold text-gray-700 mb-2">📁 Directories/Platforms</h4>
                          <div className="flex flex-wrap gap-2">
                            {websiteResult.search_visibility.directory_domains.slice(0, 6).map((comp, i) => (
                              <span key={i} className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-sm">
                                {comp.domain} <span className="text-gray-500">({comp.frequency}x)</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ================================================================= */}
            {/* COMPETITORS SECTION */}
            {/* ================================================================= */}
            {websiteResult.competitors_snapshot && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">🏢 Local Competitors</h2>
                  {websiteResult.competitors_snapshot.competitor_source && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                      Source: {websiteResult.competitors_snapshot.competitor_source === 'stage1_competitor_discovery' 
                        ? 'Stage 1: "[Business] & competitors"' 
                        : websiteResult.competitors_snapshot.competitor_source}
                    </span>
                  )}
                </div>
                {websiteResult.competitors_snapshot.competitor_source === 'stage1_competitor_discovery' && (
                  <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                    ℹ️ Competitors sourced from Stage 1: "[Business Name] & competitors" discovery, enriched with Places Details.
                  </div>
                )}
                
                {websiteResult.competitors_snapshot.error ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800 text-sm">
                    ⚠️ {websiteResult.competitors_snapshot.error}
                  </div>
                ) : websiteResult.competitors_snapshot.competitors_places.length === 0 ? (
                  <div className="bg-gray-50 rounded-lg p-4 text-gray-600 text-sm">
                    No local competitors found. This might be because no location was detected in the website content.
                  </div>
                ) : (
                  <>
                    {/* Reputation Gap */}
                    {websiteResult.competitors_snapshot.reputation_gap && (
                      <div className={`mb-4 p-4 rounded-lg border ${
                        websiteResult.competitors_snapshot.reputation_gap.status === 'ahead' ? 'bg-green-50 border-green-200' :
                        websiteResult.competitors_snapshot.reputation_gap.status === 'behind' ? 'bg-red-50 border-red-200' :
                        websiteResult.competitors_snapshot.reputation_gap.status === 'competitive' ? 'bg-yellow-50 border-yellow-200' :
                        'bg-gray-50 border-gray-200'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-lg font-semibold ${
                            websiteResult.competitors_snapshot.reputation_gap.status === 'ahead' ? 'text-green-700' :
                            websiteResult.competitors_snapshot.reputation_gap.status === 'behind' ? 'text-red-700' :
                            'text-yellow-700'
                          }`}>
                            {websiteResult.competitors_snapshot.reputation_gap.status === 'ahead' ? '✅ Ahead of competitors' :
                             websiteResult.competitors_snapshot.reputation_gap.status === 'behind' ? '⚠️ Behind competitors' :
                             websiteResult.competitors_snapshot.reputation_gap.status === 'competitive' ? '⚖️ Competitive position' :
                             '❓ Status unknown'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Competitor Median Rating</span>
                            <div className="font-bold">{websiteResult.competitors_snapshot.reputation_gap.competitor_median_rating?.toFixed(1) || 'N/A'} ⭐</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Competitor Median Reviews</span>
                            <div className="font-bold">{websiteResult.competitors_snapshot.reputation_gap.competitor_median_reviews}</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Top Competitor Rating</span>
                            <div className="font-bold">{websiteResult.competitors_snapshot.reputation_gap.competitor_top_rating?.toFixed(1) || 'N/A'} ⭐</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Top Competitor Reviews</span>
                            <div className="font-bold">{websiteResult.competitors_snapshot.reputation_gap.competitor_top_reviews}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Competitors Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-gray-50">
                            <th className="text-left p-2">Name</th>
                            <th className="text-left p-2">Distance</th>
                            <th className="text-left p-2">Rating</th>
                            <th className="text-left p-2">Reviews</th>
                            <th className="text-left p-2">Website</th>
                            <th className="text-left p-2">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {websiteResult.competitors_snapshot.competitors_places.map((comp, index) => (
                            <tr key={index} className="border-b hover:bg-gray-50">
                              <td className="p-2 font-medium">{comp.name}</td>
                              <td className="p-2 text-gray-600 text-xs">
                                {comp.distance_meters ? (
                                  comp.distance_meters < 1000 
                                    ? `${comp.distance_meters}m` 
                                    : `${(comp.distance_meters / 1000).toFixed(1)}km`
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="p-2">
                                {comp.rating ? (
                                  <span className={`font-bold ${comp.rating >= 4.5 ? 'text-green-600' : comp.rating >= 4 ? 'text-yellow-600' : 'text-orange-600'}`}>
                                    {comp.rating.toFixed(1)} ⭐
                                  </span>
                                ) : (
                                  <span className="text-gray-400">N/A</span>
                                )}
                              </td>
                              <td className="p-2">{comp.user_ratings_total.toLocaleString()}</td>
                              <td className="p-2">
                                {comp.website ? (
                                  <a href={comp.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">
                                    {new URL(comp.website).hostname.replace('www.', '')}
                                  </a>
                                ) : (
                                  <span className="text-gray-400 text-xs">No website</span>
                                )}
                              </td>
                              <td className="p-2">
                                <div className="flex flex-wrap gap-1">
                                  {comp.comparison_notes && comp.comparison_notes.map((note, i) => (
                                    <span key={i} className={`text-xs px-1.5 py-0.5 rounded ${
                                      note.includes('Higher') || note.includes('more reviews') ? 'bg-red-100 text-red-700' :
                                      note.includes('Lower') ? 'bg-green-100 text-green-700' :
                                      note.includes('Top-rated') || note.includes('Well-established') ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-gray-100 text-gray-600'
                                    }`}>
                                      {note}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500 bg-gray-50 rounded p-2">
                      <span>📍 Location: {websiteResult.competitors_snapshot.location_used || 'Unknown'}</span>
                      <span>🔍 Method: {
                        websiteResult.competitors_snapshot.search_method === 'stage1_enriched' 
                          ? 'Stage 1 Enriched' 
                          : websiteResult.competitors_snapshot.search_method === 'stage1_discovery'
                          ? 'Stage 1 Discovery'
                          : websiteResult.competitors_snapshot.search_method
                      }</span>
                      {websiteResult.competitors_snapshot.search_radius_meters && (
                        <span>📏 Radius: {(websiteResult.competitors_snapshot.search_radius_meters / 1000).toFixed(1)}km</span>
                      )}
                      <span>🌐 {websiteResult.competitors_snapshot.competitors_with_website} with websites</span>
                      <span>❌ {websiteResult.competitors_snapshot.competitors_without_website} without</span>
                      {websiteResult.competitors_snapshot.your_place_id && (
                        <span className="text-green-600">✓ Your Place ID matched</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ================================================================= */}
            {/* Owner-Style Findings */}
            {websiteResult.site_report_summary.owner_style_findings.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">🔍 Key Findings & Recommendations</h2>
                <div className="space-y-3">
                  {websiteResult.site_report_summary.owner_style_findings.map((finding, index) => (
                    <div key={index} className={`p-4 rounded-lg border-l-4 ${
                      finding.severity === 'high' ? 'bg-red-50 border-red-500' :
                      finding.severity === 'medium' ? 'bg-yellow-50 border-yellow-500' :
                      'bg-blue-50 border-blue-400'
                    }`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                              finding.severity === 'high' ? 'bg-red-200 text-red-800' :
                              finding.severity === 'medium' ? 'bg-yellow-200 text-yellow-800' :
                              'bg-blue-200 text-blue-800'
                            }`}>
                              {finding.severity.toUpperCase()}
                            </span>
                            <span className="text-xs text-gray-500">{finding.category}</span>
                          </div>
                          <h4 className="font-semibold text-gray-900">{finding.issue}</h4>
                          <p className="text-sm text-gray-600 mt-1">{finding.evidence}</p>
                          <p className="text-sm text-green-700 mt-2 font-medium">💡 {finding.fix}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Intent Coverage */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">📋 Page Coverage</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(websiteResult.site_report_summary.intent_coverage).map(([key, value]) => (
                  <div key={key} className={`flex items-center gap-2 p-2 rounded ${value ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <span className={`text-lg ${value ? 'text-green-600' : 'text-gray-400'}`}>
                      {value ? '✓' : '✗'}
                    </span>
                    <span className={`text-sm ${value ? 'text-green-800' : 'text-gray-500'}`}>
                      {key.replace('has_', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Site Overview */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Site Overview</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Domain:</span>
                  <span className="ml-2 font-medium">{websiteResult.site_overview.primary_domain}</span>
                </div>
                <div>
                  <span className="text-gray-500">CMS:</span>
                  <span className="ml-2 font-medium">{websiteResult.site_overview.cms_detected || 'Unknown'}</span>
                </div>
                <div>
                  <span className="text-gray-500">HTTPS:</span>
                  <span className={`ml-2 font-medium ${websiteResult.site_overview.https_enforced ? 'text-green-600' : 'text-red-600'}`}>
                    {websiteResult.site_overview.https_enforced ? '✓ Yes' : '✗ No'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Sitemap URLs:</span>
                  <span className="ml-2 font-medium">{websiteResult.site_overview.sitemap_urls.length}</span>
                </div>
                <div>
                  <span className="text-gray-500">robots.txt:</span>
                  <span className={`ml-2 font-medium ${websiteResult.site_overview.robots_txt ? 'text-green-600' : 'text-yellow-600'}`}>
                    {websiteResult.site_overview.robots_txt ? '✓ Found' : '✗ Not Found'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Crawl Time:</span>
                  <span className="ml-2 font-medium">{websiteResult.scrape_metadata.crawl_duration_seconds.toFixed(1)}s</span>
                </div>
              </div>
            </div>

            {/* Pages List */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Crawled Pages</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-2">URL</th>
                      <th className="text-left p-2">Type</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Content</th>
                      <th className="text-left p-2">CTA</th>
                      <th className="text-left p-2">Trust</th>
                      <th className="text-left p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {websiteResult.crawl_map.map((page, index) => (
                      <tr key={index} className={`border-b hover:bg-gray-50 ${page.ux_checks?.thin_content ? 'bg-yellow-50' : ''}`}>
                        <td className="p-2 max-w-[180px]">
                          <div className="truncate" title={page.url}>
                            {new URL(page.url).pathname || '/'}
                          </div>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            page.page_type === 'home' ? 'bg-purple-100 text-purple-700' :
                            page.page_type === 'contact' ? 'bg-green-100 text-green-700' :
                            page.page_type === 'service' ? 'bg-blue-100 text-blue-700' :
                            page.page_type === 'blog' ? 'bg-yellow-100 text-yellow-700' :
                            page.page_type === 'about' ? 'bg-pink-100 text-pink-700' :
                            page.page_type === 'booking' ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {page.page_type}
                          </span>
                        </td>
                        <td className="p-2">
                          <span className={`${page.http_status === 200 ? 'text-green-600' : 'text-red-600'}`}>
                            {page.http_status}
                          </span>
                        </td>
                        <td className="p-2 max-w-[200px]">
                          <div className="text-xs text-gray-600 truncate" title={page.content_digest?.content_snippet || ''}>
                            {page.content_digest?.content_snippet?.slice(0, 60) || '-'}...
                          </div>
                          <div className="text-xs text-gray-400">
                            {page.content_digest?.word_count_visible || 0} words
                            {page.ux_checks?.thin_content && <span className="text-yellow-600 ml-1">⚠️ thin</span>}
                          </div>
                        </td>
                        <td className="p-2">
                          {page.viewport_checks?.primary_cta_visible ? (
                            <span className="text-green-600 text-xs">✓ Visible</span>
                          ) : (
                            <span className="text-red-500 text-xs">✗ Hidden</span>
                          )}
                          {page.viewport_checks?.tel_visible && <span className="text-blue-500 text-xs ml-1">📞</span>}
                        </td>
                        <td className="p-2">
                          <div className="flex gap-1">
                            {page.enhanced_trust_signals?.has_testimonials && <span title="Testimonials">💬</span>}
                            {page.enhanced_trust_signals?.has_reviews_widget && <span title="Reviews">⭐</span>}
                            {page.enhanced_trust_signals?.has_awards_badges && <span title="Awards">🏆</span>}
                            {page.enhanced_trust_signals?.trust_blocks_found?.length === 0 && <span className="text-gray-400 text-xs">-</span>}
                          </div>
                        </td>
                        <td className="p-2">
                          <button
                            onClick={() => setSelectedPage(page)}
                            className="text-blue-600 hover:underline text-xs font-medium"
                          >
                            Details →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Selected Page Details Modal */}
            {selectedPage && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                  <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center z-10">
                    <h3 className="text-lg font-bold text-gray-900">Page Analysis</h3>
                    <button onClick={() => setSelectedPage(null)} className="text-gray-500 hover:text-gray-700 text-xl">
                      ✕
                    </button>
                  </div>
                  <div className="p-6 space-y-6">
                    {/* URL & Basic Info */}
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Basic Info</h4>
                      <div className="bg-gray-50 rounded p-3 text-sm space-y-1">
                        <div><span className="text-gray-500">URL:</span> <a href={selectedPage.url} target="_blank" className="text-blue-600 hover:underline">{selectedPage.url}</a></div>
                        <div><span className="text-gray-500">Page Type:</span> {selectedPage.page_type}</div>
                        <div><span className="text-gray-500">Intent:</span> {selectedPage.primary_intent}</div>
                        <div><span className="text-gray-500">Word Count:</span> {selectedPage.content_digest?.word_count_visible || selectedPage.word_count}</div>
                        <div><span className="text-gray-500">HTTP Status:</span> {selectedPage.http_status}</div>
                      </div>
                    </div>

                    {/* Above the Fold */}
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">📱 Above the Fold</h4>
                      <div className="bg-orange-50 rounded p-3 text-sm border border-orange-200">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex items-center gap-2">
                            <span className={selectedPage.viewport_checks?.primary_cta_visible ? 'text-green-600' : 'text-red-500'}>
                              {selectedPage.viewport_checks?.primary_cta_visible ? '✓' : '✗'}
                            </span>
                            <span className="text-gray-700">CTA Visible</span>
                            {selectedPage.viewport_checks?.primary_cta_text && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                                "{selectedPage.viewport_checks.primary_cta_text}"
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={selectedPage.viewport_checks?.tel_visible ? 'text-green-600' : 'text-gray-400'}>
                              {selectedPage.viewport_checks?.tel_visible ? '✓' : '✗'}
                            </span>
                            <span className="text-gray-700">Phone Visible</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={selectedPage.viewport_checks?.whatsapp_visible ? 'text-green-600' : 'text-gray-400'}>
                              {selectedPage.viewport_checks?.whatsapp_visible ? '✓' : '✗'}
                            </span>
                            <span className="text-gray-700">WhatsApp Visible</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={selectedPage.viewport_checks?.email_visible ? 'text-green-600' : 'text-gray-400'}>
                              {selectedPage.viewport_checks?.email_visible ? '✓' : '✗'}
                            </span>
                            <span className="text-gray-700">Email Visible</span>
                          </div>
                        </div>
                        {selectedPage.viewport_checks?.cta_position && selectedPage.viewport_checks.cta_position !== 'unknown' && (
                          <div className="mt-2 text-xs text-orange-700">
                            CTA Position: <span className="font-medium">{selectedPage.viewport_checks.cta_position}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Content Digest */}
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">📝 Content Digest</h4>
                      <div className="bg-blue-50 rounded p-3 text-sm border border-blue-200 space-y-3">
                        <div>
                          <span className="text-gray-500">Content Preview:</span>
                          <p className="text-gray-800 mt-1 italic">"{selectedPage.content_digest?.content_snippet || 'No content extracted'}"</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div><span className="text-gray-500">Visible Words:</span> {selectedPage.content_digest?.word_count_visible || 0}</div>
                          <div>
                            <span className="text-gray-500">Content Status:</span>
                            {selectedPage.ux_checks?.thin_content ? (
                              <span className="text-yellow-600 ml-1">⚠️ Thin content</span>
                            ) : (
                              <span className="text-green-600 ml-1">✓ Sufficient</span>
                            )}
                          </div>
                        </div>
                        {selectedPage.content_digest?.top_phrases && selectedPage.content_digest.top_phrases.length > 0 && (
                          <div>
                            <span className="text-gray-500">Top Phrases:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {selectedPage.content_digest.top_phrases.slice(0, 8).map((phrase, i) => (
                                <span key={i} className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">{phrase}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {selectedPage.content_digest?.entities?.service_keywords && selectedPage.content_digest.entities.service_keywords.length > 0 && (
                          <div>
                            <span className="text-gray-500">Service Keywords:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {selectedPage.content_digest.entities.service_keywords.map((kw, i) => (
                                <span key={i} className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs">{kw}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Trust Signals */}
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">⭐ Trust Signals</h4>
                      <div className="bg-emerald-50 rounded p-3 text-sm border border-emerald-200">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-2">
                            <span className={selectedPage.enhanced_trust_signals?.has_testimonials ? 'text-green-600' : 'text-gray-400'}>
                              {selectedPage.enhanced_trust_signals?.has_testimonials ? '✓' : '✗'}
                            </span>
                            <span>Testimonials</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={selectedPage.enhanced_trust_signals?.has_reviews_widget ? 'text-green-600' : 'text-gray-400'}>
                              {selectedPage.enhanced_trust_signals?.has_reviews_widget ? '✓' : '✗'}
                            </span>
                            <span>Reviews Widget</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={selectedPage.enhanced_trust_signals?.has_awards_badges ? 'text-green-600' : 'text-gray-400'}>
                              {selectedPage.enhanced_trust_signals?.has_awards_badges ? '✓' : '✗'}
                            </span>
                            <span>Awards/Badges</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={selectedPage.enhanced_trust_signals?.has_social_proof_numbers ? 'text-green-600' : 'text-gray-400'}>
                              {selectedPage.enhanced_trust_signals?.has_social_proof_numbers ? '✓' : '✗'}
                            </span>
                            <span>Social Proof</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={selectedPage.enhanced_trust_signals?.has_team_section ? 'text-green-600' : 'text-gray-400'}>
                              {selectedPage.enhanced_trust_signals?.has_team_section ? '✓' : '✗'}
                            </span>
                            <span>Team Section</span>
                          </div>
                        </div>
                        {selectedPage.enhanced_trust_signals?.testimonial_samples && selectedPage.enhanced_trust_signals.testimonial_samples.length > 0 && (
                          <div className="mt-3 pt-2 border-t border-emerald-200">
                            <span className="text-gray-500">Sample Testimonial:</span>
                            <p className="text-gray-700 italic text-xs mt-1">{selectedPage.enhanced_trust_signals.testimonial_samples[0]}</p>
                          </div>
                        )}
                        {selectedPage.enhanced_trust_signals?.social_proof_samples && selectedPage.enhanced_trust_signals.social_proof_samples.length > 0 && (
                          <div className="mt-2">
                            <span className="text-gray-500">Social Proof:</span>
                            <span className="ml-2 text-emerald-700">{selectedPage.enhanced_trust_signals.social_proof_samples[0]}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* SEO */}
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">🔍 SEO Analysis</h4>
                      <div className="bg-gray-50 rounded p-3 text-sm space-y-2">
                        <div>
                          <span className="text-gray-500">Title ({selectedPage.title_length} chars):</span>
                          <div className="font-medium text-gray-900">{selectedPage.title || <span className="text-red-600">Missing!</span>}</div>
                        </div>
                        <div>
                          <span className="text-gray-500">Meta Description ({selectedPage.meta_desc_length} chars):</span>
                          <div className="font-medium text-gray-900">{selectedPage.meta_description || <span className="text-red-600">Missing!</span>}</div>
                        </div>
                        <div>
                          <span className="text-gray-500">H1 Tags ({selectedPage.h1_count}):</span>
                          <div className={`font-medium ${selectedPage.h1_count === 0 ? 'text-red-600' : selectedPage.h1_count > 1 ? 'text-yellow-600' : 'text-gray-900'}`}>
                            {selectedPage.h1_text.join(', ') || <span className="text-red-600">None</span>}
                            {selectedPage.h1_count > 1 && <span className="text-yellow-600 ml-1">(Multiple H1s!)</span>}
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-500">Canonical:</span>
                          <span className={`ml-2 ${selectedPage.canonical_consistent ? 'text-green-600' : 'text-yellow-600'}`}>
                            {selectedPage.canonical_consistent ? '✓ Consistent' : '⚠ Inconsistent'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Indexable:</span>
                          <span className={`ml-2 ${selectedPage.indexability.is_indexable ? 'text-green-600' : 'text-red-600'}`}>
                            {selectedPage.indexability.is_indexable ? '✓ Yes' : '✗ No'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* UX Checks */}
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">✅ UX Quality Checks</h4>
                      <div className="bg-gray-50 rounded p-3 text-sm">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-2">
                            <span className={selectedPage.ux_checks?.has_h1 ? 'text-green-600' : 'text-red-500'}>
                              {selectedPage.ux_checks?.has_h1 ? '✓' : '✗'}
                            </span>
                            <span className="text-gray-700">Has H1</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={!selectedPage.ux_checks?.meta_description_missing ? 'text-green-600' : 'text-red-500'}>
                              {!selectedPage.ux_checks?.meta_description_missing ? '✓' : '✗'}
                            </span>
                            <span className="text-gray-700">Has Meta Description</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={selectedPage.ux_checks?.has_clear_contact_path ? 'text-green-600' : 'text-yellow-500'}>
                              {selectedPage.ux_checks?.has_clear_contact_path ? '✓' : '⚠'}
                            </span>
                            <span className="text-gray-700">Clear Contact Path</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={selectedPage.ux_checks?.has_local_intent_terms ? 'text-green-600' : 'text-gray-400'}>
                              {selectedPage.ux_checks?.has_local_intent_terms ? '✓' : '✗'}
                            </span>
                            <span className="text-gray-700">Local Intent Terms</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={selectedPage.ux_checks?.has_service_terms ? 'text-green-600' : 'text-gray-400'}>
                              {selectedPage.ux_checks?.has_service_terms ? '✓' : '✗'}
                            </span>
                            <span className="text-gray-700">Service Keywords</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={selectedPage.ux_checks?.has_pricing_signals ? 'text-green-600' : 'text-gray-400'}>
                              {selectedPage.ux_checks?.has_pricing_signals ? '✓' : '✗'}
                            </span>
                            <span className="text-gray-700">Pricing Signals</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={selectedPage.ux_checks?.has_faq ? 'text-green-600' : 'text-gray-400'}>
                              {selectedPage.ux_checks?.has_faq ? '✓' : '✗'}
                            </span>
                            <span className="text-gray-700">Has FAQ</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={!selectedPage.ux_checks?.blocked_by_captcha ? 'text-green-600' : 'text-red-500'}>
                              {!selectedPage.ux_checks?.blocked_by_captcha ? '✓' : '✗'}
                            </span>
                            <span className="text-gray-700">Not Blocked</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Contact Info */}
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Contact Information</h4>
                      <div className="bg-gray-50 rounded p-3 text-sm grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-gray-500">Phones:</span>
                          <div>{selectedPage.contact_methods.phone.length > 0 ? selectedPage.contact_methods.phone.join(', ') : 'None found'}</div>
                        </div>
                        <div>
                          <span className="text-gray-500">Emails:</span>
                          <div>{selectedPage.contact_methods.email.length > 0 ? selectedPage.contact_methods.email.join(', ') : 'None found'}</div>
                        </div>
                        <div>
                          <span className="text-gray-500">Forms:</span>
                          <div>{selectedPage.contact_methods.forms}</div>
                        </div>
                        <div>
                          <span className="text-gray-500">Contact Locations:</span>
                          <div>{selectedPage.contact_methods.locations.join(', ') || 'Not detected'}</div>
                        </div>
                      </div>
                    </div>

                    {/* Links */}
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Links Analysis</h4>
                      <div className="bg-gray-50 rounded p-3 text-sm grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-gray-500">Internal Links:</span>
                          <div>{selectedPage.internal_link_count}</div>
                        </div>
                        <div>
                          <span className="text-gray-500">Social Links:</span>
                          <div>{selectedPage.external_links.social.length}</div>
                        </div>
                        <div>
                          <span className="text-gray-500">Booking Links:</span>
                          <div>{selectedPage.external_links.booking.length}</div>
                        </div>
                        <div>
                          <span className="text-gray-500">Review Links:</span>
                          <div>{selectedPage.external_links.reviews.length}</div>
                        </div>
                      </div>
                      {selectedPage.external_links.social.length > 0 && (
                        <div className="mt-2 text-xs text-gray-600">
                          <strong>Social:</strong> {selectedPage.external_links.social.map(s => new URL(s).hostname).join(', ')}
                        </div>
                      )}
                    </div>

                    {/* CTA */}
                    {selectedPage.primary_cta.button_text && (
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2">Primary CTA</h4>
                        <div className="bg-gray-50 rounded p-3 text-sm">
                          <div><span className="text-gray-500">Text:</span> {selectedPage.primary_cta.button_text}</div>
                          <div><span className="text-gray-500">Destination:</span> {selectedPage.primary_cta.destination}</div>
                          <div><span className="text-gray-500">Above Fold:</span> {selectedPage.primary_cta.above_fold ? '✓' : '✗'}</div>
                        </div>
                      </div>
                    )}

                    {/* Analytics */}
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Analytics & Tracking</h4>
                      <div className="bg-gray-50 rounded p-3 text-sm flex flex-wrap gap-2">
                        {selectedPage.analytics.google_analytics && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">Google Analytics</span>}
                        {selectedPage.analytics.ga4 && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">GA4</span>}
                        {selectedPage.analytics.gtm && <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded">GTM: {selectedPage.analytics.gtm}</span>}
                        {selectedPage.analytics.meta_pixel && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">Meta Pixel</span>}
                        {selectedPage.analytics.tiktok_pixel && <span className="px-2 py-1 bg-pink-100 text-pink-700 rounded">TikTok Pixel</span>}
                        {selectedPage.analytics.hotjar && <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded">Hotjar</span>}
                        {!selectedPage.analytics.google_analytics && !selectedPage.analytics.ga4 && !selectedPage.analytics.gtm && !selectedPage.analytics.meta_pixel && (
                          <span className="text-gray-500">No analytics detected</span>
                        )}
                      </div>
                    </div>

                    {/* Images */}
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Images</h4>
                      <div className="bg-gray-50 rounded p-3 text-sm grid grid-cols-2 gap-2">
                        <div><span className="text-gray-500">Total Images:</span> {selectedPage.images.total_images}</div>
                        <div><span className="text-gray-500">Alt Coverage:</span> {selectedPage.images.alt_text_coverage}</div>
                        {selectedPage.images.logo_url && <div className="col-span-2"><span className="text-gray-500">Logo:</span> <img src={selectedPage.images.logo_url} alt="Logo" className="h-8 inline ml-2" /></div>}
                      </div>
                    </div>

                    {/* Performance */}
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Performance</h4>
                      <div className="bg-gray-50 rounded p-3 text-sm grid grid-cols-3 gap-2">
                        <div><span className="text-gray-500">HTML Size:</span> {selectedPage.performance.html_size_kb}KB</div>
                        <div><span className="text-gray-500">JS Files:</span> {selectedPage.performance.asset_count.js}</div>
                        <div><span className="text-gray-500">CSS Files:</span> {selectedPage.performance.asset_count.css}</div>
                      </div>
                      {selectedPage.performance.third_party_scripts.length > 0 && (
                        <div className="mt-2 text-xs text-gray-600">
                          <strong>Third-party scripts:</strong> {selectedPage.performance.third_party_scripts.slice(0, 5).join(', ')}
                        </div>
                      )}
                    </div>

                    {/* Structured Data */}
                    {selectedPage.structured_data.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2">Structured Data</h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedPage.structured_data.map((sd, i) => (
                            <span key={i} className="px-2 py-1 bg-green-100 text-green-700 rounded text-sm">
                              {sd.type} ({sd.format})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Orphan Pages */}
            {websiteResult.site_graph.orphan_pages.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h3 className="font-semibold text-yellow-800 mb-2">⚠️ Orphan Pages (No Internal Links)</h3>
                <ul className="text-sm text-yellow-700 list-disc list-inside">
                  {websiteResult.site_graph.orphan_pages.map((url, i) => (
                    <li key={i}>{url}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Full JSON Output */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setShowJsonOutput(!showJsonOutput)}
                  className="flex items-center gap-2 text-xl font-bold text-gray-900 hover:text-gray-700"
                >
                  <span>{showJsonOutput ? '▼' : '▶'}</span>
                  <span>📄 Complete JSON Output</span>
                </button>
                <button
                  onClick={() => {
                    const jsonString = JSON.stringify(websiteResult, null, 2);
                    navigator.clipboard.writeText(jsonString);
                    alert('JSON copied to clipboard!');
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  📋 Copy JSON
                </button>
              </div>
              {showJsonOutput && (
                <>
                  <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto max-h-[600px] overflow-y-auto">
                    <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-words">
                      {JSON.stringify(websiteResult, null, 2)}
                    </pre>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    This is the complete raw output from the website crawl. Use the copy button to export the data.
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        <hr className="my-12 border-gray-300" />

        {/* ================================================================= */}
        {/* FACEBOOK SECTION */}
        {/* ================================================================= */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🔵 Facebook Scraper Test
          </h1>
          <p className="text-gray-600 mb-6">
            Enter a Facebook page username/URL to scrape profile data (uses same navigation as screenshotter)
          </p>

          <form onSubmit={handleFacebookSubmit} className="flex gap-4">
            <input
              type="text"
              value={fbUsername}
              onChange={(e) => setFbUsername(e.target.value)}
              placeholder="Enter Facebook page username or URL (e.g., cafecapriceCT)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
            <button
              type="submit"
              disabled={fbLoading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
            >
              {fbLoading ? "Scraping..." : "Scrape"}
            </button>
          </form>
        </div>

        {fbError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-red-800 mb-2">❌ Facebook Error</h2>
            <p className="text-red-600">{fbError}</p>
          </div>
        )}

        {fbResult && (
          <div className="bg-white rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Facebook Profile Data</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {fbResult.profilePictureUrl && (
                <div className="md:col-span-2">
                  <img
                    src={fbResult.profilePictureUrl}
                    alt="Profile"
                    className="w-32 h-32 rounded-full object-cover"
                  />
                </div>
              )}
              {fbResult.name && (
                <div>
                  <label className="text-sm font-semibold text-gray-500">Page Name</label>
                  <p className="text-gray-900">{fbResult.name}</p>
                </div>
              )}
              {fbResult.category && (
                <div>
                  <label className="text-sm font-semibold text-gray-500">Category</label>
                  <p className="text-gray-900">{fbResult.category}</p>
                </div>
              )}
              {fbResult.description && (
                <div className="md:col-span-2">
                  <label className="text-sm font-semibold text-gray-500">Description</label>
                  <p className="text-gray-900 whitespace-pre-wrap">{fbResult.description}</p>
                </div>
              )}
              {fbResult.address && (
                <div>
                  <label className="text-sm font-semibold text-gray-500">📍 Address</label>
                  <p className="text-gray-900">{fbResult.address}</p>
                </div>
              )}
              {fbResult.phone && (
                <div>
                  <label className="text-sm font-semibold text-gray-500">📞 Phone</label>
                  <p className="text-gray-900">{fbResult.phone}</p>
                </div>
              )}
              {fbResult.email && (
                <div>
                  <label className="text-sm font-semibold text-gray-500">📧 Email</label>
                  <p className="text-gray-900">{fbResult.email}</p>
                </div>
              )}
              {fbResult.website && (
                <div>
                  <label className="text-sm font-semibold text-gray-500">🌐 Website</label>
                  <p className="text-gray-900">
                    <a 
                      href={fbResult.website.startsWith("http") ? fbResult.website : `https://${fbResult.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {fbResult.website}
                    </a>
                  </p>
                </div>
              )}
              {fbResult.hours && (
                <div>
                  <label className="text-sm font-semibold text-gray-500">🕐 Hours</label>
                  <p className="text-gray-900">{fbResult.hours}</p>
                </div>
              )}
              {fbResult.serviceOptions && (
                <div>
                  <label className="text-sm font-semibold text-gray-500">🍽️ Service Options</label>
                  <p className="text-gray-900">{fbResult.serviceOptions}</p>
                </div>
              )}
              {fbResult.priceRange && (
                <div>
                  <label className="text-sm font-semibold text-gray-500">💰 Price Range</label>
                  <p className="text-gray-900">{fbResult.priceRange}</p>
                </div>
              )}
              {fbResult.reviewsRating && (
                <div className="md:col-span-2">
                  <label className="text-sm font-semibold text-gray-500">⭐ Reviews/Rating</label>
                  <p className="text-gray-900">{fbResult.reviewsRating}</p>
                </div>
              )}
            </div>
            
            {/* Posts Section */}
            {fbResult.posts && fbResult.posts.length > 0 && (
              <div className="mt-8 pt-8 border-t border-gray-200">
                <h3 className="text-xl font-bold text-gray-900 mb-4">
                  Posts ({fbResult.posts.length})
                </h3>
                <div className="space-y-6">
                  {fbResult.posts.map((post, index) => (
                    <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="flex items-center gap-4 mb-3">
                        <span className="text-sm font-semibold text-gray-500">Post {index + 1}</span>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          post.mediaType === 'video' ? 'bg-purple-100 text-purple-700' :
                          post.mediaType === 'multiple_images' ? 'bg-blue-100 text-blue-700' :
                          post.mediaType === 'image' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {post.mediaType === 'video' ? '🎥 Video' :
                           post.mediaType === 'multiple_images' ? '🖼️ Multiple Images' :
                           post.mediaType === 'image' ? '📷 Image' :
                           '❓ Unknown'}
                        </span>
                      </div>
                      
                      {post.caption && (
                        <p className="text-gray-800 whitespace-pre-wrap mb-3">{post.caption}</p>
                      )}
                      
                      <div className="flex items-center gap-6 text-sm text-gray-600 mb-3">
                        {post.likeCount !== null && (
                          <span>👍 {post.likeCount.toLocaleString()} likes</span>
                        )}
                        {post.commentCount !== null && (
                          <span>💬 {post.commentCount.toLocaleString()} comments</span>
                        )}
                        {post.likeCount === null && post.commentCount === null && (
                          <span className="text-gray-400 italic">No engagement data found</span>
                        )}
                      </div>
                      
                      {/* Comments Section */}
                      {post.comments && post.comments.length > 0 && (
                        <div className="mt-4 pl-4 border-l-2 border-blue-200">
                          <h4 className="font-semibold text-gray-700 mb-2 text-sm">
                            Comments ({post.comments.length})
                          </h4>
                          <div className="space-y-3">
                            {post.comments.map((comment, commentIndex) => (
                              <div key={commentIndex} className="text-sm bg-gray-50 rounded p-2">
                                <div className="flex items-center gap-2 mb-1">
                                  {comment.author && (
                                    <span className="font-semibold text-gray-900">{comment.author}</span>
                                  )}
                                  {comment.timeAgo && (
                                    <span className="text-gray-500 text-xs">{comment.timeAgo}</span>
                                  )}
                                  {comment.reactionCount !== null && comment.reactionCount > 0 && (
                                    <span className="text-gray-500 text-xs">❤️ {comment.reactionCount}</span>
                                  )}
                                </div>
                                {comment.text && (
                                  <p className="text-gray-700">{comment.text}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Facebook JSON Output */}
            <div className="bg-white rounded-lg shadow-md p-6 mt-6">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setShowFbJsonOutput(!showFbJsonOutput)}
                  className="flex items-center gap-2 text-xl font-bold text-gray-900 hover:text-gray-700"
                >
                  <span>{showFbJsonOutput ? '▼' : '▶'}</span>
                  <span>📄 Complete Facebook JSON Output</span>
                </button>
                <button
                  onClick={() => {
                    const jsonString = JSON.stringify(fbResult, null, 2);
                    navigator.clipboard.writeText(jsonString);
                    alert('Facebook JSON copied to clipboard!');
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  📋 Copy JSON
                </button>
              </div>
              {showFbJsonOutput && (
                <>
                  <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto max-h-[600px] overflow-y-auto">
                    <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-words">
                      {JSON.stringify(fbResult, null, 2)}
                    </pre>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Complete raw output from the Facebook scrape. Use the copy button to export.
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        <hr className="my-12 border-gray-300" />

        {/* ================================================================= */}
        {/* INSTAGRAM SECTION */}
        {/* ================================================================= */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🧪 Instagram Scraper Test
          </h1>
          <p className="text-gray-600 mb-6">
            Enter an Instagram username to scrape profile data, posts, and comments
          </p>

          <form onSubmit={handleInstagramSubmit} className="flex gap-4">
            <input
              type="text"
              value={igUsername}
              onChange={(e) => setIgUsername(e.target.value)}
              placeholder="Enter Instagram username (without @)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
            <button
              type="submit"
              disabled={igLoading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
            >
              {igLoading ? "Scraping..." : "Scrape"}
            </button>
          </form>
        </div>

        {igError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-red-800 mb-2">❌ Instagram Error</h2>
            <p className="text-red-600">{igError}</p>
          </div>
        )}

        {igResult && (
          <div className="space-y-8">
            {/* Profile Data */}
            <div className="bg-white rounded-lg shadow-md p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Profile Data</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {igResult.profile.profilePictureUrl && (
                  <div className="md:col-span-2">
                    <img
                      src={`/api/proxy-image?url=${encodeURIComponent(igResult.profile.profilePictureUrl)}`}
                      alt="Profile"
                      className="w-32 h-32 rounded-full object-cover"
                    />
                  </div>
                )}
                <div>
                  <label className="text-sm font-semibold text-gray-500">Username</label>
                  <p className="text-gray-900 flex items-center gap-2">
                    {igResult.profile.username}
                    {igResult.profile.isVerified && (
                      <span className="text-blue-500" title="Verified">✓</span>
                    )}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500">Full Name</label>
                  <p className="text-gray-900">{igResult.profile.fullName || "N/A"}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500">Verification Status</label>
                  <p className="text-gray-900">{igResult.profile.isVerified ? "✓ Verified" : "Not Verified"}</p>
                </div>
                {igResult.profile.category && (
                  <div>
                    <label className="text-sm font-semibold text-gray-500">Category</label>
                    <p className="text-gray-900">{igResult.profile.category}</p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-semibold text-gray-500">Posts</label>
                  <p className="text-gray-900">{igResult.profile.postCount?.toLocaleString() || "N/A"}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500">Followers</label>
                  <p className="text-gray-900">{igResult.profile.followerCount?.toLocaleString() || "N/A"}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500">Following</label>
                  <p className="text-gray-900">{igResult.profile.followingCount?.toLocaleString() || "N/A"}</p>
                </div>
                {igResult.profile.website && (
                  <div>
                    <label className="text-sm font-semibold text-gray-500">Website</label>
                    <p className="text-gray-900">
                      <a 
                        href={igResult.profile.website.startsWith("http") ? igResult.profile.website : `https://${igResult.profile.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {igResult.profile.website}
                      </a>
                    </p>
                  </div>
                )}
                {igResult.profile.biography && (
                  <div className="md:col-span-2">
                    <label className="text-sm font-semibold text-gray-500">Biography</label>
                    <p className="text-gray-900 whitespace-pre-wrap">{igResult.profile.biography}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Posts */}
            <div className="bg-white rounded-lg shadow-md p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Last 5 Posts ({igResult.posts.length})
              </h2>
              <div className="space-y-8">
                {igResult.posts.map((post, index) => (
                  <div key={index} className="border-b border-gray-200 pb-8 last:border-b-0">
                    <div className="mb-4">
                      <div className="flex items-center gap-4 mb-2">
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-sm"
                        >
                          Open post ↗
                        </a>
                        {post.date && (
                          <span className="text-gray-500 text-sm">
                            {new Date(post.date).toLocaleString()}
                          </span>
                        )}
                        {post.likeCount != null && (
                          <span className="text-gray-500 text-sm">❤️ {post.likeCount.toLocaleString()} likes</span>
                        )}
                        {post.commentCount != null && (
                          <span className="text-gray-500 text-sm">💬 {post.commentCount.toLocaleString()} comments</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">Post ID: {post.id}</p>
                    </div>

                    {/* Thumbnail */}
                    <div className="mb-4">
                      {post.thumbnailUrl ? (
                        <img
                          src={post.thumbnailUrl}
                          alt={`Post ${index + 1} thumbnail`}
                          className="w-full max-w-xl rounded-lg object-cover"
                        />
                      ) : (
                        <p className="text-sm text-gray-500">No thumbnail found.</p>
                      )}
                    </div>

                    {/* Caption */}
                    {post.caption && (
                      <div className="mb-4">
                        <p className="text-gray-900 whitespace-pre-wrap">{post.caption}</p>
                      </div>
                    )}

                    {/* Comments */}
                    {post.comments.length > 0 && (
                      <div className="mt-4 pl-4 border-l-2 border-gray-200">
                        <h4 className="font-semibold text-gray-700 mb-2">
                          Comments ({post.comments.length})
                        </h4>
                        <div className="space-y-3">
                          {post.comments.map((comment, commentIndex) => (
                            <div key={commentIndex} className="text-sm">
                              <span className="font-semibold text-gray-900">{comment.author}</span>
                              <span className="text-gray-700 ml-2">{comment.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Instagram JSON Output */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setShowIgJsonOutput(!showIgJsonOutput)}
                  className="flex items-center gap-2 text-xl font-bold text-gray-900 hover:text-gray-700"
                >
                  <span>{showIgJsonOutput ? '▼' : '▶'}</span>
                  <span>📄 Complete Instagram JSON Output</span>
                </button>
                <button
                  onClick={() => {
                    const jsonString = JSON.stringify(igResult, null, 2);
                    navigator.clipboard.writeText(jsonString);
                    alert('Instagram JSON copied to clipboard!');
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  📋 Copy JSON
                </button>
              </div>
              {showIgJsonOutput && (
                <>
                  <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto max-h-[600px] overflow-y-auto">
                    <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-words">
                      {JSON.stringify(igResult, null, 2)}
                    </pre>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Complete raw output from the Instagram scrape. Use the copy button to export.
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* GOOGLE BUSINESS PROFILE ANALYZER SECTION */}
        {/* ================================================================= */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            📊 Google Business Profile Analyzer
          </h1>
          <p className="text-gray-600 mb-6">
            Search for your business and analyze your Google Business Profile completeness
          </p>

          {/* Search Input */}
          <div className="relative mb-6">
            <input
              type="text"
              value={gbpSearchInput}
              onChange={(e) => handleGbpSearchChange(e.target.value)}
              onFocus={() => setGbpShowAutocomplete(gbpSearchInput.length >= 2 && gbpAutocompleteResults.length > 0)}
              onBlur={() => {
                // Delay closing to allow click events to fire
                setTimeout(() => setGbpShowAutocomplete(false), 200);
              }}
              placeholder="Search your business..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            />
            
            {/* Autocomplete Dropdown */}
            {gbpShowAutocomplete && gbpAutocompleteResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {gbpAutocompleteResults.map((result) => (
                  <button
                    key={result.place_id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault(); // Prevent blur from firing
                      handleGbpPlaceSelect(result.place_id, result.description);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                  >
                    <div className="font-medium text-gray-900">{result.main_text}</div>
                    {result.secondary_text && (
                      <div className="text-sm text-gray-500">{result.secondary_text}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Loading State */}
          {gbpLoading && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <div className="flex items-center gap-3">
                <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                <span className="text-blue-800">Analyzing Google Business Profile...</span>
              </div>
            </div>
          )}

          {/* Error State */}
          {gbpError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold text-red-800 mb-2">❌ Error</h2>
              <p className="text-red-600">{gbpError}</p>
            </div>
          )}

          {/* Analysis Results */}
          {gbpAnalysis && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              {/* Header */}
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Google Business Profile
                </h2>
                <div className="flex items-center gap-4">
                  <div className="text-lg font-semibold text-gray-900">
                    {gbpAnalysis.analysis.businessName}
                  </div>
                  {gbpAnalysis.analysis.rating && (
                    <div className="flex items-center gap-1">
                      <span className="text-yellow-500">⭐</span>
                      <span className="font-semibold text-gray-900">
                        {gbpAnalysis.analysis.rating.toFixed(1)}
                      </span>
                      {gbpAnalysis.analysis.reviews !== undefined && (
                        <span className="text-gray-600">
                          ({gbpAnalysis.analysis.reviews} reviews)
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {gbpAnalysis.placeDetails.address && (
                  <div className="text-sm text-gray-600 mt-1">
                    {gbpAnalysis.placeDetails.address}
                  </div>
                )}
              </div>

              {/* Checklist */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Profile content</h3>
                {gbpAnalysis.analysis.checklist.map((item) => {
                  const isExpanded = gbpExpandedItem === item.key;
                  const explanation = getGbpItemExplanation(item.key, item.status, gbpAnalysis);
                  
                  return (
                    <div
                      key={item.key}
                      className="border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-colors"
                    >
                      {/* Clickable Header */}
                      <button
                        onClick={() => setGbpExpandedItem(isExpanded ? null : item.key)}
                        className="w-full flex items-start gap-4 p-4 hover:bg-gray-50 text-left"
                      >
                        {/* Status Icon */}
                        <div className="flex-shrink-0 mt-0.5">
                          {item.status === 'good' && (
                            <span className="text-2xl">✅</span>
                          )}
                          {item.status === 'warn' && (
                            <span className="text-2xl">⚠️</span>
                          )}
                          {item.status === 'bad' && (
                            <span className="text-2xl">❌</span>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-gray-900">{item.label}</span>
                            {item.value && (
                              <span className="text-sm text-gray-600">({item.value})</span>
                            )}
                            <span className="ml-auto text-gray-400">
                              {isExpanded ? '▼' : '▶'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">{item.helper}</p>
                        </div>
                      </button>

                      {/* Expandable Explanation */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-0 border-t border-gray-100 bg-gray-50">
                          <div className="pt-4 space-y-4">
                            {/* What we found section */}
                            {item.extractedValue && (
                              <div>
                                <h4 className="font-semibold text-gray-900 mb-2 text-sm">What we found:</h4>
                                <div className="bg-white border border-gray-200 rounded-lg p-3">
                                  <div className="text-sm text-gray-700 whitespace-pre-line font-mono break-words">
                                    {item.extractedValue}
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {/* Detailed explanation */}
                            {explanation && (
                              <div>
                                <h4 className="font-semibold text-gray-900 mb-2 text-sm">Why this matters:</h4>
                                <div className="text-sm text-gray-700 whitespace-pre-line">
                                  {explanation}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
