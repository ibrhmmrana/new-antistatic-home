/**
 * Report Assembly Function
 * Combines all analyzer outputs into standardized Owner.com-style report
 */

import type {
  ReportSchema,
  ReportMeta,
  ChecklistItem,
  ChecklistSection,
  TopProblem,
  ImpactCard,
  CompetitorsCard,
  SearchVisibility,
  DataFreshness,
} from './types';
import {
  calculateSearchResultsScore,
  calculateWebsiteExperienceScore,
  calculateLocalListingsScore,
  calculateSocialPresenceScore,
  calculateOverallScore,
} from './calculateScores';
import { resolveCategoryFamily } from '@/lib/seo/categoryFamilies';

// Input types (from existing analyzers)
interface WebsiteCrawlResult {
  scrape_metadata?: { timestamp?: string };
  site_overview?: { homepage_url?: string; primary_domain?: string; favicon_url?: string | null };
  crawl_map?: any[];
  business_identity?: {
    business_name?: string;
    category_label?: string;
    location_label?: string;
    location_suburb?: string | null;
    location_city?: string | null;
    service_keywords?: string[];
    place_id?: string | null;
  };
  search_visibility?: {
    visibility_score?: number;
    share_of_voice?: number;
    branded_visibility?: number;
    non_branded_visibility?: number;
    queries?: any[];
  };
  competitors_snapshot?: {
    competitors_places?: Array<{
      name?: string;
      rating?: number | null;
      reviews?: number | null;
      website?: string | null;
      place_id?: string;
    }>;
  };
}

interface GbpAnalysisResult {
  businessName?: string;
  rating?: number;
  reviews?: number;
  checklist?: Array<{ key?: string; status?: 'good' | 'warn' | 'bad'; extractedValue?: string }>;
  keywordChecks?: {
    descriptionKeywordMatchPct?: number;
    categoryKeywordMatchPct?: number;
  };
}

interface SocialsResult {
  websiteUrl?: string | null;
  websiteScreenshot?: string | null;
  socialLinks?: Array<{ platform?: string; url?: string; screenshot?: string | null }>;
}

interface InstagramResult {
  profile?: {
    biography?: string | null;
    website?: string | null;
    category?: string | null;
    followerCount?: number | null;
  };
  posts?: Array<{ date?: string | null; likeCount?: number | null; commentCount?: number | null }>;
}

interface FacebookResult {
  profile?: {
    description?: string | null;
    phone?: string | null;
    address?: string | null;
    website?: string | null;
    hours?: string | null;
  };
  posts?: Array<{ date?: string | null; likeCount?: number | null }>;
}

interface PlacesDetails {
  name?: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  website?: string | null;
  photos?: Array<{ photo_reference?: string }>;
}

interface AssembleReportInput {
  placeId: string;
  placeName?: string;
  placeAddress?: string;
  placesDetails?: PlacesDetails;
  websiteCrawl?: WebsiteCrawlResult | null;
  gbpAnalysis?: GbpAnalysisResult | null;
  socials?: SocialsResult | null;
  instagram?: InstagramResult | null;
  facebook?: FacebookResult | null;
}

/**
 * Calculate data freshness
 */
function calculateFreshness(timestamp: string | null | undefined): DataFreshness {
  if (!timestamp) return 'missing';
  const age = Date.now() - new Date(timestamp).getTime();
  const hours = age / (1000 * 60 * 60);
  return hours < 24 ? 'fresh' : 'stale';
}

/**
 * Estimate monthly loss (simple heuristic)
 */
function estimateMonthlyLoss(
  visibilityScore: number,
  failedChecks: TopProblem[],
  categoryLabel: string
): number | null {
  if (failedChecks.length === 0) return null;
  
  const categoryMultiplier: Record<string, number> = {
    restaurant: 150,
    dental_ortho: 200,
    salon: 100,
    plumber: 120,
    default: 100,
  };
  
  const family = resolveCategoryFamily(categoryLabel);
  const multiplier = categoryMultiplier[family] || categoryMultiplier.default;
  const baseVisibility = visibilityScore / 100;
  const highImpactCount = failedChecks.filter(p => p.impact === 'high').length;
  
  return Math.round((1 - baseVisibility) * highImpactCount * multiplier);
}

/**
 * Extract top problems from all checklist sections
 */
function extractTopProblems(sections: ChecklistSection[]): TopProblem[] {
  const allProblems: TopProblem[] = [];
  
  sections.forEach(section => {
    section.checks.forEach(check => {
      if (check.status === 'bad' || check.status === 'warn') {
        // Determine impact level
        const highImpactKeys = [
          'h1_service_area',
          'h1_keywords',
          'primary_cta',
          'contact_phone',
          'gbp_website',
          'indexability',
        ];
        const mediumImpactKeys = [
          'meta_desc_service_area',
          'meta_desc_keywords',
          'trust_testimonials',
          'gbp_social_links',
        ];
        
        let impact: 'high' | 'medium' | 'low' = 'low';
        if (highImpactKeys.includes(check.key)) impact = 'high';
        else if (mediumImpactKeys.includes(check.key)) impact = 'medium';
        
        allProblems.push({
          key: check.key,
          label: check.label,
          impact,
          section: section.id,
        });
      }
    });
  });
  
  // Sort by impact (high first), then by status (bad first)
  allProblems.sort((a, b) => {
    const impactOrder = { high: 3, medium: 2, low: 1 };
    if (impactOrder[a.impact] !== impactOrder[b.impact]) {
      return impactOrder[b.impact] - impactOrder[a.impact];
    }
    return 0;
  });
  
  return allProblems.slice(0, 3); // Top 3
}

/**
 * Build Search Results checklist section
 */
function buildSearchResultsSection(
  websiteCrawl: WebsiteCrawlResult | null | undefined,
  gbpAnalysis: GbpAnalysisResult | null | undefined,
  businessIdentity: any
): ChecklistSection {
  const checks: ChecklistItem[] = [];
  const homepage = websiteCrawl?.crawl_map?.[0];
  const serviceKeywords = businessIdentity?.service_keywords || [];
  const locationLabel = businessIdentity?.location_label || '';
  const locationParts = locationLabel.split(',').map(s => s.trim());
  
  // Domain checks
  const homepageUrl = websiteCrawl?.site_overview?.homepage_url || '';
  const domain = homepageUrl ? new URL(homepageUrl).hostname.replace('www.', '') : '';
  const thirdPartyDomains = [
    'doordash.com', 'ubereats.com', 'toasttab.com', 'clover.com', 'chownow.com',
    'grubhub.com', 'squareup.com', 'square.site', 'seamless.com', 'order.online',
  ];
  const isThirdParty = thirdPartyDomains.some(d => domain.includes(d));
  
  checks.push({
    key: 'domain_custom',
    label: 'Using custom domain',
    status: homepageUrl && !isThirdParty ? 'good' : 'bad',
    whyItMatters: 'The business has and controls its own domain name instead of linking to a third-party website',
    whatWeFound: homepageUrl || 'Not found',
    whatWeWereLookingFor: 'A custom domain (not ' + thirdPartyDomains.slice(0, 3).join(', ') + ', etc.)',
    howToFix: 'Use your own domain name (e.g., yourbusiness.com) instead of third-party platforms',
    evidence: { fieldPath: 'site_overview.homepage_url', sampleValue: homepageUrl },
  });
  
  // H1 checks
  const h1Text = homepage?.h1_text?.[0] || 'None found';
  const h1Count = homepage?.h1_count || 0;
  
  checks.push({
    key: 'h1_exists',
    label: 'H1 exists',
    status: h1Count === 1 ? 'good' : h1Count === 0 ? 'bad' : 'warn',
    whyItMatters: 'An H1 tag is crucial for SEO and helps structure your content hierarchy',
    whatWeFound: h1Text,
    whatWeWereLookingFor: 'Exactly 1 H1 tag on homepage',
    howToFix: 'Add a single H1 tag to your homepage with your main headline',
    evidence: { fieldPath: 'crawl_map[0].h1_count', sampleValue: h1Count.toString() },
  });
  
  const hasServiceArea = locationParts.some(part => h1Text.toLowerCase().includes(part.toLowerCase()));
  checks.push({
    key: 'h1_service_area',
    label: 'Includes the service area',
    status: hasServiceArea ? 'good' : 'bad',
    whyItMatters: 'Mentioning your service area in the headline helps with local SEO',
    whatWeFound: h1Text,
    whatWeWereLookingFor: 'H1 should include one of: ' + locationParts.slice(0, 3).join(', '),
    howToFix: 'Update your H1 to include your neighborhood or city (e.g., "Best Burgers in TriBeCa")',
    evidence: { fieldPath: 'crawl_map[0].h1_text[0]', sampleValue: h1Text },
  });
  
  const hasKeywords = serviceKeywords.some(kw => h1Text.toLowerCase().includes(kw.toLowerCase()));
  checks.push({
    key: 'h1_keywords',
    label: 'Includes relevant keywords',
    status: hasKeywords ? 'good' : 'bad',
    whyItMatters: 'Including relevant keywords in your headline improves search visibility',
    whatWeFound: h1Text,
    whatWeWereLookingFor: 'H1 should include one of: ' + serviceKeywords.slice(0, 5).join(', '),
    howToFix: 'Add your main service keywords to your H1 (e.g., "Orthodontist", "Burgers", "Plumber")',
    evidence: { fieldPath: 'crawl_map[0].h1_text[0]', sampleValue: h1Text },
  });
  
  // Meta description checks
  const metaDesc = homepage?.meta_description || null;
  const metaDescLength = homepage?.meta_desc_length || 0;
  
  checks.push({
    key: 'meta_desc_length',
    label: 'Description length',
    status: metaDescLength >= 100 && metaDescLength <= 160 ? 'good' : metaDescLength < 100 ? 'warn' : 'bad',
    whyItMatters: 'A sufficiently long meta description provides more context in search results',
    whatWeFound: metaDesc ? `${metaDescLength} characters` : 'Not found',
    whatWeWereLookingFor: 'Meta description should be 100-160 characters',
    howToFix: 'Update your meta description to be between 100-160 characters',
    evidence: { fieldPath: 'crawl_map[0].meta_desc_length', sampleValue: metaDescLength.toString() },
  });
  
  if (metaDesc) {
    const metaHasServiceArea = locationParts.some(part => metaDesc.toLowerCase().includes(part.toLowerCase()));
    checks.push({
      key: 'meta_desc_service_area',
      label: 'Description includes the service area',
      status: metaHasServiceArea ? 'good' : 'bad',
      whyItMatters: 'Mentioning your service area in the meta description aids local SEO efforts',
      whatWeFound: metaDesc,
      whatWeWereLookingFor: 'Meta description should include: ' + locationParts.slice(0, 2).join(' or '),
      howToFix: 'Add your neighborhood or city to your meta description',
      evidence: { fieldPath: 'crawl_map[0].meta_description', sampleValue: metaDesc },
    });
    
    const metaHasKeywords = serviceKeywords.some(kw => metaDesc.toLowerCase().includes(kw.toLowerCase()));
    checks.push({
      key: 'meta_desc_keywords',
      label: 'Description includes relevant keywords',
      status: metaHasKeywords ? 'good' : 'bad',
      whyItMatters: 'Including relevant keywords in your meta description can improve click-through rates from search results',
      whatWeFound: metaDesc,
      whatWeWereLookingFor: 'Meta description should include one of: ' + serviceKeywords.slice(0, 5).join(', '),
      howToFix: 'Add your main service keywords to your meta description',
      evidence: { fieldPath: 'crawl_map[0].meta_description', sampleValue: metaDesc },
    });
  }
  
  // Page title checks
  const pageTitle = homepage?.title || null;
  const gbpName = gbpAnalysis?.businessName || '';
  
  if (pageTitle && gbpName) {
    const titleMatchesGbp = pageTitle.toLowerCase().includes(gbpName.toLowerCase());
    checks.push({
      key: 'title_matches_gbp',
      label: 'Page title matches Google Business Profile',
      status: titleMatchesGbp ? 'good' : 'bad',
      whyItMatters: 'Matching your page title with your Google listing provides consistency across platforms',
      whatWeFound: pageTitle,
      whatWeWereLookingFor: 'Title should include exact GBP listing name: ' + gbpName,
      howToFix: 'Update your page title to include your exact business name from Google',
      evidence: { fieldPath: 'crawl_map[0].title', sampleValue: pageTitle },
    });
  }
  
  if (pageTitle) {
    const titleHasServiceArea = locationParts.some(part => pageTitle.toLowerCase().includes(part.toLowerCase()));
    checks.push({
      key: 'title_service_area',
      label: 'Page title includes the service area',
      status: titleHasServiceArea ? 'good' : 'bad',
      whyItMatters: 'Including your service area in the page title helps with local search visibility',
      whatWeFound: pageTitle,
      whatWeWereLookingFor: 'Title should include: ' + locationParts.slice(0, 2).join(' or '),
      howToFix: 'Add your neighborhood or city to your page title',
      evidence: { fieldPath: 'crawl_map[0].title', sampleValue: pageTitle },
    });
    
    const titleHasKeywords = serviceKeywords.some(kw => pageTitle.toLowerCase().includes(kw.toLowerCase()));
    checks.push({
      key: 'title_keywords',
      label: 'Page title includes a relevant keyword',
      status: titleHasKeywords ? 'good' : 'bad',
      whyItMatters: 'Having a relevant keyword in your page title can improve search engine rankings',
      whatWeFound: pageTitle,
      whatWeWereLookingFor: 'Title should include one of: ' + serviceKeywords.slice(0, 5).join(', '),
      howToFix: 'Add your main service keyword to your page title',
      evidence: { fieldPath: 'crawl_map[0].title', sampleValue: pageTitle },
    });
  }
  
  // Images alt tags
  const totalImages = homepage?.images?.total_images || 0;
  const imagesWithAlt = homepage?.images?.images_with_alt || 0;
  const altCoverage = totalImages > 0 ? (imagesWithAlt / totalImages) * 100 : 0;
  
  checks.push({
    key: 'images_alt_tags',
    label: "Images have 'alt tags'",
    status: altCoverage >= 80 ? 'good' : altCoverage >= 50 ? 'warn' : 'bad',
    whyItMatters: "Google looks at alt tags to understand what images are on your site",
    whatWeFound: `${imagesWithAlt} images with alt tags (${Math.round(altCoverage)}% coverage)`,
    whatWeWereLookingFor: 'At least 80% of images should have alt tags',
    howToFix: 'Add descriptive alt text to all images on your homepage',
    evidence: { fieldPath: 'crawl_map[0].images', sampleValue: `${imagesWithAlt}/${totalImages}` },
  });
  
  // Indexability
  const isIndexable = homepage?.indexability?.is_indexable ?? true;
  checks.push({
    key: 'indexability',
    label: 'Page is indexable',
    status: isIndexable ? 'good' : 'bad',
    whyItMatters: 'If your page is not indexable, it won\'t appear in search results',
    whatWeFound: isIndexable ? 'Indexable' : 'Not indexable (noindex tag found)',
    whatWeWereLookingFor: 'Page should be indexable by search engines',
    howToFix: "Remove 'noindex' from meta robots tag or X-Robots-Tag header",
    evidence: { fieldPath: 'crawl_map[0].indexability.is_indexable', sampleValue: isIndexable.toString() },
  });
  
  // Structured data
  const structuredData = homepage?.structured_data || [];
  const hasLocalBusiness = structuredData.some((sd: any) => 
    sd.type === 'LocalBusiness' || sd.type === 'Organization'
  );
  
  checks.push({
    key: 'structured_data',
    label: 'Structured data present',
    status: hasLocalBusiness ? 'good' : structuredData.length > 0 ? 'warn' : 'bad',
    whyItMatters: 'Structured data helps Google understand your business and can improve rich snippets',
    whatWeFound: structuredData.length > 0 ? `${structuredData.length} structured data items found` : 'No structured data found',
    whatWeWereLookingFor: 'Structured data with type LocalBusiness or Organization',
    howToFix: 'Add LocalBusiness or Organization schema.org JSON-LD to your homepage',
    evidence: { fieldPath: 'crawl_map[0].structured_data', sampleValue: structuredData.length.toString() },
  });
  
  const score = calculateSearchResultsScore(
    websiteCrawl?.search_visibility?.visibility_score,
    checks
  );
  
  return {
    id: 'search-results',
    title: 'Get your website to the top of Google',
    score: score.score,
    maxScore: score.maxScore,
    checks,
  };
}

/**
 * Build Website Experience checklist section
 */
function buildWebsiteExperienceSection(
  websiteCrawl: WebsiteCrawlResult | null | undefined
): ChecklistSection {
  const checks: ChecklistItem[] = [];
  const homepage = websiteCrawl?.crawl_map?.[0];
  
  // Primary CTA
  const primaryCta = homepage?.primary_cta;
  const hasCta = primaryCta?.button_text && primaryCta?.above_fold;
  checks.push({
    key: 'primary_cta',
    label: 'Clear call-to-action above the fold',
    status: hasCta ? 'good' : primaryCta?.button_text ? 'warn' : 'bad',
    whyItMatters: 'A clear call-to-action helps visitors know what action to take next',
    whatWeFound: primaryCta?.button_text || 'None found',
    whatWeWereLookingFor: 'A clear, action-oriented CTA button above the fold (e.g., "Book Appointment", "Order Online", "Get Quote")',
    howToFix: 'Add a prominent CTA button above the fold with a specific action (e.g., "Book Now", "Contact Us")',
    evidence: { fieldPath: 'crawl_map[0].primary_cta', sampleValue: primaryCta?.button_text || 'null' },
  });
  
  // Contact methods
  const phones = homepage?.contact_methods?.phone || [];
  const telLinks = homepage?.clickable_actions?.tel_links || [];
  const hasPhone = phones.length > 0 || telLinks.length > 0;
  
  checks.push({
    key: 'contact_phone',
    label: 'Phone number',
    status: hasPhone ? 'good' : 'bad',
    whyItMatters: 'Listing a phone number increases the number of ways people can contact you',
    whatWeFound: phones.length > 0 ? phones[0] : telLinks.length > 0 ? 'Clickable phone link found' : 'None found',
    whatWeWereLookingFor: 'At least one phone number visible on the site',
    howToFix: 'Add your business phone number to your homepage and contact page',
    evidence: { fieldPath: 'crawl_map[0].contact_methods.phone', sampleValue: phones[0] || 'null' },
  });
  
  const emails = homepage?.contact_methods?.email || [];
  const mailtoLinks = homepage?.clickable_actions?.mailto_links || [];
  const hasEmail = emails.length > 0 || mailtoLinks.length > 0;
  
  checks.push({
    key: 'contact_email',
    label: 'Email address',
    status: hasEmail ? 'good' : 'bad',
    whyItMatters: 'An email address provides another way for customers to reach you',
    whatWeFound: emails.length > 0 ? emails[0] : mailtoLinks.length > 0 ? 'Clickable email link found' : 'None found',
    whatWeWereLookingFor: 'At least one email address visible on the site',
    howToFix: 'Add your business email address to your contact page',
    evidence: { fieldPath: 'crawl_map[0].contact_methods.email', sampleValue: emails[0] || 'null' },
  });
  
  const forms = homepage?.forms || [];
  const contactForms = forms.filter((f: any) => f.type === 'contact');
  
  checks.push({
    key: 'contact_forms',
    label: 'Contact form',
    status: contactForms.length > 0 ? 'good' : 'bad',
    whyItMatters: 'Contact forms make it easy for visitors to reach out without leaving your site',
    whatWeFound: contactForms.length > 0 ? `${contactForms.length} contact form(s) found` : 'None found',
    whatWeWereLookingFor: 'At least one contact form on the site',
    howToFix: 'Add a contact form to your contact page or homepage',
    evidence: { fieldPath: 'crawl_map[0].forms', sampleValue: contactForms.length.toString() },
  });
  
  // Mobile friendly - check if viewport meta tag exists (heuristic)
  // Note: We don't have direct mobile-friendly detection, so we'll check for viewport meta
  // This is a simplified check - in a real implementation, you'd want to check viewport meta tag
  const hasViewportMeta = homepage?.viewport_checks ? true : false; // Simplified: if viewport_checks exist, assume mobile-aware
  checks.push({
    key: 'mobile_friendly',
    label: 'Mobile friendly',
    status: hasViewportMeta ? 'good' : 'warn', // Default to warn since we can't definitively check
    whyItMatters: 'Most users browse on mobile devices. A mobile-friendly site improves user experience',
    whatWeFound: hasViewportMeta ? 'Viewport checks available' : 'Unable to verify mobile-friendliness',
    whatWeWereLookingFor: 'Site should be mobile-friendly (responsive design)',
    howToFix: 'Ensure your site uses responsive design and works well on mobile screens',
    evidence: { fieldPath: 'crawl_map[0].viewport_checks', sampleValue: hasViewportMeta ? 'present' : 'not available' },
  });
  
  // Trust signals
  const hasTestimonials = homepage?.enhanced_trust_signals?.has_testimonials ?? false;
  checks.push({
    key: 'trust_testimonials',
    label: 'Customer testimonials',
    status: hasTestimonials ? 'good' : 'bad',
    whyItMatters: 'Testimonials build trust and credibility with potential customers',
    whatWeFound: hasTestimonials ? 'Testimonials found' : 'None found',
    whatWeWereLookingFor: 'Customer testimonials or reviews displayed on the site',
    howToFix: 'Add a testimonials section to your homepage or about page',
    evidence: { fieldPath: 'crawl_map[0].enhanced_trust_signals.has_testimonials', sampleValue: hasTestimonials.toString() },
  });
  
  const hasReviews = homepage?.enhanced_trust_signals?.has_reviews_widget ?? false;
  checks.push({
    key: 'trust_reviews',
    label: 'Review widgets',
    status: hasReviews ? 'good' : 'bad',
    whyItMatters: 'Review widgets showcase your reputation and help build trust',
    whatWeFound: hasReviews ? 'Review widget found' : 'None found',
    whatWeWereLookingFor: 'Google Reviews widget or other review platform widgets',
    howToFix: 'Add a Google Reviews widget or embed reviews from your review platforms',
    evidence: { fieldPath: 'crawl_map[0].enhanced_trust_signals.has_reviews_widget', sampleValue: hasReviews.toString() },
  });
  
  // Content
  const wordCount = homepage?.word_count || 0;
  checks.push({
    key: 'content_sufficient',
    label: 'Sufficient text content',
    status: wordCount >= 150 ? 'good' : wordCount >= 100 ? 'warn' : 'bad',
    whyItMatters: 'Content about your business helps Google understand what you do',
    whatWeFound: `${wordCount} words`,
    whatWeWereLookingFor: 'At least 150 words of text content on homepage',
    howToFix: 'Add more descriptive text content to your homepage (aim for 150+ words)',
    evidence: { fieldPath: 'crawl_map[0].word_count', sampleValue: wordCount.toString() },
  });
  
  // Favicon
  const favicon = websiteCrawl?.site_overview?.favicon_url;
  checks.push({
    key: 'favicon',
    label: 'Favicon',
    status: favicon ? 'good' : 'bad',
    whyItMatters: 'Including a favicon on your site improves the legitimacy of your site',
    whatWeFound: favicon || 'Not found',
    whatWeWereLookingFor: 'A favicon (site icon) should be present',
    howToFix: 'Add a favicon to your site (typically in the root directory as favicon.ico)',
    evidence: { fieldPath: 'site_overview.favicon_url', sampleValue: favicon || 'null' },
  });
  
  // About page check
  const aboutPage = websiteCrawl?.site_report_summary?.key_pages?.about_page;
  const aboutPageData = aboutPage ? websiteCrawl?.crawl_map?.find((p: any) => p.url === aboutPage) : null;
  const aboutWordCount = aboutPageData?.word_count || 0;
  checks.push({
    key: 'trust_about',
    label: 'Compelling About Us section',
    status: aboutPage && aboutWordCount >= 200 ? 'good' : aboutPage ? 'warn' : 'bad',
    whyItMatters: 'An About page helps visitors understand your business and builds trust',
    whatWeFound: aboutPage || 'None found',
    whatWeWereLookingFor: 'An About page with substantial content (200+ words)',
    howToFix: 'Create an About page with your business story, mission, and team information',
    evidence: { fieldPath: 'site_report_summary.key_pages.about_page', sampleValue: aboutPage || 'null' },
  });
  
  // FAQ check
  const hasFaq = homepage?.ux_checks?.has_faq ?? false;
  checks.push({
    key: 'trust_faq',
    label: 'FAQ section',
    status: hasFaq ? 'good' : 'bad',
    whyItMatters: 'FAQs answer common questions and reduce support inquiries',
    whatWeFound: hasFaq ? 'FAQ section found' : 'None found',
    whatWeWereLookingFor: 'A FAQ section or page',
    howToFix: 'Add a FAQ section to your site addressing common customer questions',
    evidence: { fieldPath: 'crawl_map[0].ux_checks.has_faq', sampleValue: hasFaq.toString() },
  });
  
  // Lazy loading (simplified - we don't have direct detection)
  checks.push({
    key: 'lazy_loading',
    label: 'Images use lazy loading',
    status: 'warn', // Default to warn since we can't definitively check
    whyItMatters: 'Lazy loading improves page load speed, especially on mobile',
    whatWeFound: 'Unable to verify lazy loading',
    whatWeWereLookingFor: 'Images should use lazy loading for better performance',
    howToFix: "Add lazy loading attributes to images (loading='lazy')",
    evidence: { fieldPath: 'crawl_map[0].images', sampleValue: 'not verified' },
  });
  
  const score = calculateWebsiteExperienceScore(checks);
  
  return {
    id: 'website-experience',
    title: 'Improve the experience on your website',
    score: score.score,
    maxScore: score.maxScore,
    checks,
  };
}

/**
 * Build Local Listings checklist section
 */
function buildLocalListingsSection(
  gbpAnalysis: GbpAnalysisResult | null | undefined,
  websiteCrawl: WebsiteCrawlResult | null | undefined
): ChecklistSection {
  const checks: ChecklistItem[] = [];
  
  // Convert GBP checklist items to our format
  if (gbpAnalysis?.checklist) {
    gbpAnalysis.checklist.forEach(item => {
      const key = item.key || '';
      const labelMap: Record<string, string> = {
        website: 'First-party website',
        description: 'Description',
        hours: 'Business hours',
        phone: 'Phone number',
        price_range: 'Price range',
      };
      
      checks.push({
        key: `gbp_${key}`,
        label: labelMap[key] || item.key || 'Unknown',
        status: item.status || 'bad',
        whyItMatters: 'See GBP analysis for details',
        whatWeFound: item.extractedValue || 'Not found',
        whatWeWereLookingFor: 'Should be set on Google Business Profile',
        howToFix: `Update your Google Business Profile to include ${labelMap[key] || key}`,
      });
    });
  }
  
  // Social links check
  const allPages = websiteCrawl?.crawl_map || [];
  const socialLinks = allPages.flatMap((page: any) => page.external_links?.social || []);
  const hasSocialLinks = socialLinks.length > 0;
  
  checks.push({
    key: 'gbp_social_links',
    label: 'Social media links',
    status: hasSocialLinks ? 'good' : 'warn',
    whyItMatters: 'Social media links extend your reach and provide additional ways for customers to engage',
    whatWeFound: hasSocialLinks ? `${socialLinks.length} social link(s) found on website` : 'None found',
    whatWeWereLookingFor: 'Social media links (Instagram, Facebook) present on website or GBP',
    howToFix: 'Add links to your social media profiles on your website and Google Business Profile',
    evidence: { fieldPath: 'crawl_map[].external_links.social', sampleValue: socialLinks.length.toString() },
  });
  
  // Keyword checks
  if (gbpAnalysis?.keywordChecks?.descriptionKeywordMatchPct !== undefined) {
    const matchPct = gbpAnalysis.keywordChecks.descriptionKeywordMatchPct;
    checks.push({
      key: 'gbp_desc_keywords',
      label: 'Description includes relevant keywords',
      status: matchPct >= 30 ? 'good' : matchPct >= 10 ? 'warn' : 'bad',
      whyItMatters: 'Relevant keywords in your description improve search engine visibility',
      whatWeFound: `${matchPct}% keyword match`,
      whatWeWereLookingFor: 'Description should include at least 30% of relevant service keywords',
      howToFix: 'Update your GBP description to naturally include your main service keywords',
    });
  }
  
  const score = calculateLocalListingsScore(
    gbpAnalysis?.checklist || [],
    hasSocialLinks
  );
  
  return {
    id: 'local-listings',
    title: 'Make your business easy to find',
    score: score.score,
    maxScore: score.maxScore,
    checks,
  };
}

/**
 * Build Social Presence checklist section
 */
function buildSocialPresenceSection(
  socials: SocialsResult | null | undefined,
  instagram: InstagramResult | null | undefined,
  facebook: FacebookResult | null | undefined
): ChecklistSection {
  const checks: ChecklistItem[] = [];
  
  const hasInstagram = socials?.socialLinks?.some(l => l.platform === 'instagram') ?? false;
  const hasFacebook = socials?.socialLinks?.some(l => l.platform === 'facebook') ?? false;
  const hasWebsiteScreenshot = !!socials?.websiteScreenshot;
  
  // Discovery checks
  checks.push({
    key: 'social_instagram_found',
    label: 'Instagram profile found',
    status: hasInstagram ? 'good' : 'bad',
    whyItMatters: 'Instagram helps you reach a wider audience and showcase your business visually',
    whatWeFound: hasInstagram ? socials?.socialLinks?.find(l => l.platform === 'instagram')?.url || 'Found' : 'Not found',
    whatWeWereLookingFor: 'An Instagram profile URL',
    howToFix: 'Create an Instagram business profile and add the link to your website',
  });
  
  checks.push({
    key: 'social_facebook_found',
    label: 'Facebook page found',
    status: hasFacebook ? 'good' : 'bad',
    whyItMatters: 'Facebook helps you connect with local customers and build community',
    whatWeFound: hasFacebook ? socials?.socialLinks?.find(l => l.platform === 'facebook')?.url || 'Found' : 'Not found',
    whatWeWereLookingFor: 'A Facebook page URL',
    howToFix: 'Create a Facebook business page and add the link to your website',
  });
  
  // Instagram checks
  if (hasInstagram && instagram) {
    const profile = instagram.profile || {};
    const hasBio = !!profile.biography;
    const hasWebsite = !!profile.website;
    const hasCategory = !!profile.category;
    const profileComplete = hasBio && hasWebsite && hasCategory;
    
    checks.push({
      key: 'ig_profile_complete',
      label: 'Instagram profile complete',
      status: profileComplete ? 'good' : hasBio || hasWebsite || hasCategory ? 'warn' : 'bad',
      whyItMatters: 'A complete profile helps visitors understand your business and find your website',
      whatWeFound: `Biography: ${hasBio ? 'Yes' : 'No'}, Website: ${hasWebsite ? 'Yes' : 'No'}, Category: ${hasCategory ? 'Yes' : 'No'}`,
      whatWeWereLookingFor: 'Biography, website link, and category should all be set',
      howToFix: 'Fill out your Instagram bio, add your website link, and set your business category',
    });
    
    // Posting consistency
    const posts = instagram.posts || [];
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    const recentPosts = posts.filter(p => {
      if (!p.date) return false;
      const postDate = new Date(p.date).getTime();
      return postDate >= thirtyDaysAgo;
    });
    const postsIn30Days = recentPosts.length;
    
    checks.push({
      key: 'ig_posting_consistency',
      label: 'Posting consistency',
      status: postsIn30Days >= 4 ? 'good' : postsIn30Days >= 1 ? 'warn' : 'bad',
      whyItMatters: 'Regular posting keeps your audience engaged and helps you stay top-of-mind',
      whatWeFound: `${postsIn30Days} posts in the last 30 days`,
      whatWeWereLookingFor: 'At least 4 posts in the last 30 days (1 post per week)',
      howToFix: 'Aim to post at least once per week to maintain engagement',
    });
    
    // Engagement rate
    if (profile.followerCount && profile.followerCount > 0 && posts.length > 0) {
      const recentPostsForEngagement = posts.slice(0, 12);
      const avgLikes = recentPostsForEngagement.reduce((sum, p) => sum + (p.likeCount || 0), 0) / recentPostsForEngagement.length;
      const avgComments = recentPostsForEngagement.reduce((sum, p) => sum + (p.commentCount || 0), 0) / recentPostsForEngagement.length;
      const engagementRate = ((avgLikes + avgComments) / profile.followerCount) * 100;
      const threshold = profile.followerCount <= 1000 ? 3 : 1;
      
      checks.push({
        key: 'ig_engagement_rate',
        label: 'Engagement rate',
        status: engagementRate > threshold ? 'good' : engagementRate > threshold * 0.5 ? 'warn' : 'bad',
        whyItMatters: 'Higher engagement indicates your content resonates with your audience',
        whatWeFound: `${engagementRate.toFixed(1)}% engagement rate`,
        whatWeWereLookingFor: `Engagement rate should be > ${threshold}%`,
        howToFix: 'Post more engaging content, use relevant hashtags, and interact with your audience',
      });
    }
    
    // Recent activity
    if (posts.length > 0 && posts[0].date) {
      const lastPostDate = new Date(posts[0].date).getTime();
      const daysSince = (now - lastPostDate) / (24 * 60 * 60 * 1000);
      
      checks.push({
        key: 'ig_recent_activity',
        label: 'Recent activity',
        status: daysSince <= 14 ? 'good' : daysSince <= 30 ? 'warn' : 'bad',
        whyItMatters: 'Recent activity shows your business is active and engaged',
        whatWeFound: `${Math.round(daysSince)} days since last post`,
        whatWeWereLookingFor: 'At least 1 post in the last 14 days',
        howToFix: 'Post new content at least every 2 weeks to maintain visibility',
      });
    }
  }
  
  // Facebook checks
  if (hasFacebook && facebook) {
    const profile = facebook.profile || {};
    const fields = {
      description: !!profile.description,
      phone: !!profile.phone,
      address: !!profile.address,
      website: !!profile.website,
      hours: !!profile.hours,
    };
    const completeCount = Object.values(fields).filter(Boolean).length;
    
    checks.push({
      key: 'fb_page_complete',
      label: 'Facebook page complete',
      status: completeCount >= 4 ? 'good' : completeCount >= 2 ? 'warn' : 'bad',
      whyItMatters: 'A complete page provides all the information customers need to contact you',
      whatWeFound: `${completeCount}/5 fields completed`,
      whatWeWereLookingFor: 'Description, phone, address, website, and hours should all be set',
      howToFix: 'Fill out all sections of your Facebook page, especially contact information and hours',
    });
    
    // Posting consistency
    const posts = facebook.posts || [];
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    const recentPosts = posts.filter(p => {
      if (!p.date) return false;
      const postDate = new Date(p.date).getTime();
      return postDate >= thirtyDaysAgo;
    });
    const postsIn30Days = recentPosts.length;
    
    checks.push({
      key: 'fb_posting_consistency',
      label: 'Posting consistency',
      status: postsIn30Days >= 4 ? 'good' : postsIn30Days >= 1 ? 'warn' : 'bad',
      whyItMatters: 'Regular posting keeps your page active and helps you reach more customers',
      whatWeFound: `${postsIn30Days} posts in the last 30 days`,
      whatWeWereLookingFor: 'At least 4 posts in the last 30 days (1 post per week)',
      howToFix: 'Aim to post at least once per week to maintain engagement',
    });
    
    // Recent activity
    if (posts.length > 0 && posts[0].date) {
      const lastPostDate = new Date(posts[0].date).getTime();
      const daysSince = (now - lastPostDate) / (24 * 60 * 60 * 1000);
      
      checks.push({
        key: 'fb_recent_activity',
        label: 'Recent activity',
        status: daysSince <= 14 ? 'good' : daysSince <= 30 ? 'warn' : 'bad',
        whyItMatters: 'Recent activity shows your business is active and engaged',
        whatWeFound: `${Math.round(daysSince)} days since last post`,
        whatWeWereLookingFor: 'At least 1 post in the last 14 days',
        howToFix: 'Post new content at least every 2 weeks to maintain visibility',
      });
    }
  }
  
  const instagramChecks = checks.filter(c => c.key.startsWith('ig_'));
  const facebookChecks = checks.filter(c => c.key.startsWith('fb_'));
  
  const score = calculateSocialPresenceScore(
    hasInstagram,
    hasFacebook,
    hasWebsiteScreenshot,
    instagramChecks,
    facebookChecks
  );
  
  return {
    id: 'social-presence',
    title: 'Build your social media presence',
    score: score.score,
    maxScore: score.maxScore,
    checks,
  };
}

/**
 * Main assembly function
 */
export function assembleReport(input: AssembleReportInput): ReportSchema {
  const {
    placeId,
    placeName,
    placeAddress,
    placesDetails,
    websiteCrawl,
    gbpAnalysis,
    socials,
    instagram,
    facebook,
  } = input;
  
  // Build meta
  const businessIdentity = websiteCrawl?.business_identity;
  const meta: ReportMeta = {
    businessName: gbpAnalysis?.businessName || businessIdentity?.business_name || placeName || 'Business',
    categoryLabel: businessIdentity?.category_label || 'Business',
    locationLabel: businessIdentity?.location_label || placeAddress || '',
    scanDate: websiteCrawl?.scrape_metadata?.timestamp || new Date().toISOString(),
    websiteUrl: placesDetails?.website || socials?.websiteUrl || null,
    googleRating: placesDetails?.rating || gbpAnalysis?.rating || null,
    googleReviewCount: placesDetails?.user_ratings_total || gbpAnalysis?.reviews || null,
    placeId,
  };
  
  // Build checklist sections
  const searchResultsSection = buildSearchResultsSection(websiteCrawl, gbpAnalysis, businessIdentity);
  const websiteExperienceSection = buildWebsiteExperienceSection(websiteCrawl);
  const localListingsSection = buildLocalListingsSection(gbpAnalysis, websiteCrawl);
  const socialPresenceSection = buildSocialPresenceSection(socials, instagram, facebook);
  
  const sections = [
    searchResultsSection,
    websiteExperienceSection,
    localListingsSection,
    socialPresenceSection,
  ];
  
  // Calculate scores
  const searchResultsScore = calculateSearchResultsScore(
    websiteCrawl?.search_visibility?.visibility_score,
    searchResultsSection.checks
  );
  const websiteExperienceScore = calculateWebsiteExperienceScore(websiteExperienceSection.checks);
  const localListingsScore = calculateLocalListingsScore(
    gbpAnalysis?.checklist || [],
    (websiteCrawl?.crawl_map || []).some((page: any) => (page.external_links?.social || []).length > 0)
  );
  const socialPresenceScore = calculateSocialPresenceScore(
    socials?.socialLinks?.some(l => l.platform === 'instagram') ?? false,
    socials?.socialLinks?.some(l => l.platform === 'facebook') ?? false,
    !!socials?.websiteScreenshot,
    socialPresenceSection.checks.filter(c => c.key.startsWith('ig_')),
    socialPresenceSection.checks.filter(c => c.key.startsWith('fb_'))
  );
  
  const overallScore = calculateOverallScore(
    searchResultsScore.score,
    websiteExperienceScore.score,
    localListingsScore.score,
    socialPresenceScore.score
  );
  
  // Build summary cards
  const topProblems = extractTopProblems(sections);
  const estimatedLoss = estimateMonthlyLoss(
    websiteCrawl?.search_visibility?.visibility_score || 0,
    topProblems,
    meta.categoryLabel
  );
  
  // Get GBP photo (most recent photo from Places API)
  let businessAvatar: string | null = null;
  if (placesDetails?.photos && Array.isArray(placesDetails.photos) && placesDetails.photos.length > 0) {
    const firstPhoto = placesDetails.photos[0];
    if (firstPhoto.photo_reference) {
      businessAvatar = `/api/places/photo?ref=${encodeURIComponent(firstPhoto.photo_reference)}&maxwidth=200`;
    }
  }
  // Fallback to website screenshot if no GBP photo
  if (!businessAvatar) {
    businessAvatar = socials?.websiteScreenshot || null;
  }
  
  const impactCard: ImpactCard = {
    estimatedLossMonthly: estimatedLoss,
    topProblems,
    businessAvatar,
  };
  
  // Build competitors card
  const competitors = websiteCrawl?.competitors_snapshot?.competitors_places || [];
  const targetPlaceId = placeId;
  const targetWebsite = meta.websiteUrl;
  
  // Normalize domain for comparison
  const normalizeDomain = (url: string | null | undefined): string | null => {
    if (!url) return null;
    try {
      const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
      return hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return null;
    }
  };
  
  const targetDomainNormalized = targetWebsite ? normalizeDomain(targetWebsite) : null;
  
  // Sort competitors and identify target business
  const sortedCompetitors = [...competitors]
    .sort((a, b) => {
      const ratingA = a.rating || 0;
      const ratingB = b.rating || 0;
      if (ratingA !== ratingB) return ratingB - ratingA;
      return (b.reviews || 0) - (a.reviews || 0);
    })
    .map((comp, idx) => {
      // Check if this is the target business
      const isTarget = 
        (targetPlaceId && comp.place_id === targetPlaceId) ||
        (targetDomainNormalized && comp.website && normalizeDomain(comp.website) === targetDomainNormalized);
      
      return {
        name: comp.name || 'Unknown',
        rating: comp.rating || null,
        reviewCount: comp.reviews || null,
        rank: idx + 1,
        website: comp.website || null,
        isTargetBusiness: isTarget,
      };
    });
  
  // Find user's rank
  const userBusiness = sortedCompetitors.find(c => c.isTargetBusiness);
  const userRank = userBusiness ? userBusiness.rank : null;
  
  const competitorsCard: CompetitorsCard = {
    count: competitors.length,
    list: sortedCompetitors,
    userRank: userRank || undefined,
  };
  
  // Build search visibility
  const searchVisibilityQueries = websiteCrawl?.search_visibility?.queries || [];
  const searchVisibility: SearchVisibility = {
    visibilityScore: websiteCrawl?.search_visibility?.visibility_score || 0,
    shareOfVoice: websiteCrawl?.search_visibility?.share_of_voice || 0,
    brandedVisibility: websiteCrawl?.search_visibility?.branded_visibility || 0,
    nonBrandedVisibility: websiteCrawl?.search_visibility?.non_branded_visibility || 0,
    queries: searchVisibilityQueries.map((q: any) => ({
      query: q.query || '',
      intent: q.intent || 'non_branded',
      rationale: q.rationale || '',
      mapPack: {
        rank: q.mapPack?.rank ?? null,
        results: (q.mapPack?.results || []).map((r: any) => ({
          placeId: r.place_id || '',
          name: r.name || '',
          rating: r.rating ?? null,
          reviews: r.reviews ?? null,
          address: r.address || null,
          website: r.website || null,
          isTargetBusiness: r.place_id === businessIdentity?.place_id,
        })),
      },
      organic: {
        rank: q.organic?.rank ?? null,
        results: (q.organic?.results || []).map((r: any) => {
          // Normalize domain for comparison
          const normalizeDomain = (url: string): string => {
            try {
              const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
              return parsed.hostname.replace(/^www\./, '').toLowerCase();
            } catch {
              return url.toLowerCase().replace(/^www\./, '').replace(/^https?:\/\//, '');
            }
          };
          
          const targetDomain = meta.websiteUrl ? normalizeDomain(meta.websiteUrl) : null;
          const resultDomain = r.domain ? normalizeDomain(r.domain) : normalizeDomain(r.link || '');
          
          return {
            position: r.position || 0,
            title: r.title || '',
            link: r.link || '',
            displayLink: r.displayLink || r.domain || '',
            snippet: r.snippet || null,
            faviconUrl: r.faviconUrl || null,
            domain: r.domain || '',
            isTargetBusiness: targetDomain ? resultDomain === targetDomain : false,
          };
        }),
      },
      notes: q.notes || '',
    })),
  };
  
  // Build artifacts
  const artifacts = {
    links: {
      website: meta.websiteUrl,
      instagram: socials?.socialLinks?.find(l => l.platform === 'instagram')?.url || null,
      facebook: socials?.socialLinks?.find(l => l.platform === 'facebook')?.url || null,
    },
    screenshots: {
      website: socials?.websiteScreenshot || null,
      instagram: socials?.socialLinks?.find(l => l.platform === 'instagram')?.screenshot || null,
      facebook: socials?.socialLinks?.find(l => l.platform === 'facebook')?.screenshot || null,
    },
    timestamps: {
      websiteCrawl: websiteCrawl?.scrape_metadata?.timestamp || null,
      gbpAnalysis: gbpAnalysis ? new Date().toISOString() : null,
      instagramScrape: instagram ? new Date().toISOString() : null,
      facebookScrape: facebook ? new Date().toISOString() : null,
    },
    dataFreshness: {
      websiteCrawl: calculateFreshness(websiteCrawl?.scrape_metadata?.timestamp),
      gbpAnalysis: gbpAnalysis ? 'fresh' : 'missing',
      instagramScrape: instagram ? 'fresh' : 'missing',
      facebookScrape: facebook ? 'fresh' : 'missing',
    },
  };
  
  return {
    meta,
    scores: {
      overall: overallScore,
      searchResults: searchResultsScore,
      websiteExperience: websiteExperienceScore,
      localListings: localListingsScore,
      socialPresence: socialPresenceScore,
    },
    summaryCards: {
      impact: impactCard,
      competitors: competitorsCard,
    },
    searchVisibility,
    sections,
    artifacts,
  };
}
