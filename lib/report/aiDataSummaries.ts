/**
 * Curated data summaries for AI analysis.
 * We do NOT pass raw crawler/GBP payloads; only structured, relevant subsets
 * to keep prompts focused and token-efficient.
 */

/** Website crawl: only business-relevant subset (not full crawl_map, structured_data, etc.) */
export interface WebsiteSummary {
  site_overview?: {
    homepage_url?: string | null;
    primary_domain?: string | null;
    https_enforced?: boolean;
    favicon_url?: string | null;
  };
  business_identity?: {
    business_name?: string | null;
    category_label?: string | null;
    location_label?: string | null;
    service_keywords?: string[];
  };
  /** Homepage only (crawl_map[0]) – title, meta, h1s, CTA, contact */
  homepage?: {
    title?: string | null;
    meta_description?: string | null;
    h1_text?: string[];
    word_count?: number;
    primary_cta?: { button_text?: string; destination?: string; above_fold?: boolean } | null;
    contact_methods?: {
      phone?: string[];
      email?: string[];
    };
    money_page_links?: string[];
  };
  site_report_summary?: {
    key_pages?: {
      contact_page?: string | null;
      booking_or_lead_page?: string | null;
      about_page?: string | null;
      services_page?: string | null;
    };
    intent_coverage?: {
      has_contact?: boolean;
      has_booking?: boolean;
      has_about?: boolean;
      has_services?: boolean;
    };
    conversion_path_score?: number;
    content_quality_score?: number;
    trust_score?: number;
  };
}

/** GBP: place details + optional GBP analysis checklist/keywords */
export interface GbpSummary {
  name?: string | null;
  address?: string | null;
  types?: string[];
  category_label?: string | null;
  description?: string | null;
  opening_hours?: {
    open_now?: boolean;
    weekday_text?: string[];
  } | null;
  rating?: number | null;
  review_count?: number | null;
  website?: string | null;
  phone?: string | null;
  /** From GBP analysis when available */
  gbp_checks?: {
    description_keyword_match_pct?: number;
    category_keyword_match_pct?: number;
    checklist_summary?: string[];
  };
}

/**
 * Build a curated website summary from full website crawl result.
 * Does not include full crawl_map, structured_data, or per-page details.
 */
export function buildWebsiteSummary(websiteResult: unknown): WebsiteSummary | null {
  if (!websiteResult || typeof websiteResult !== 'object') return null;
  const w = websiteResult as Record<string, unknown>;

  const siteOverview = w.site_overview as Record<string, unknown> | undefined;
  const businessIdentity = w.business_identity as Record<string, unknown> | undefined;
  const crawlMap = Array.isArray(w.crawl_map) ? w.crawl_map : [];
  const homepageEntry = crawlMap[0] as Record<string, unknown> | undefined;
  const siteReport = w.site_report_summary as Record<string, unknown> | undefined;

  const summary: WebsiteSummary = {};

  if (siteOverview) {
    summary.site_overview = {
      homepage_url: (siteOverview.homepage_url as string) ?? null,
      primary_domain: (siteOverview.primary_domain as string) ?? null,
      https_enforced: siteOverview.https_enforced as boolean | undefined,
      favicon_url: (siteOverview.favicon_url as string) ?? null,
    };
  }

  if (businessIdentity) {
    summary.business_identity = {
      business_name: (businessIdentity.business_name as string) ?? null,
      category_label: (businessIdentity.category_label as string) ?? null,
      location_label: (businessIdentity.location_label as string) ?? null,
      service_keywords: Array.isArray(businessIdentity.service_keywords)
        ? (businessIdentity.service_keywords as string[])
        : [],
    };
  }

  if (homepageEntry) {
    const contactMethods = homepageEntry.contact_methods as Record<string, unknown> | undefined;
    summary.homepage = {
      title: (homepageEntry.title as string) ?? null,
      meta_description: (homepageEntry.meta_description as string) ?? null,
      h1_text: Array.isArray(homepageEntry.h1_text) ? (homepageEntry.h1_text as string[]) : [],
      word_count: typeof homepageEntry.word_count === 'number' ? homepageEntry.word_count : undefined,
      primary_cta: (homepageEntry.primary_cta as { button_text?: string; destination?: string; above_fold?: boolean } | null) ?? null,
      contact_methods: contactMethods
        ? {
            phone: Array.isArray(contactMethods.phone) ? (contactMethods.phone as string[]) : undefined,
            email: Array.isArray(contactMethods.email) ? (contactMethods.email as string[]) : undefined,
          }
        : undefined,
      money_page_links: Array.isArray(homepageEntry.money_page_links)
        ? (homepageEntry.money_page_links as string[])
        : undefined,
    };
  }

  if (siteReport) {
    const keyPages = siteReport.key_pages as Record<string, unknown> | undefined;
    const intentCoverage = siteReport.intent_coverage as Record<string, unknown> | undefined;
    summary.site_report_summary = {
      key_pages: keyPages
        ? {
            contact_page: (keyPages.contact_page as string) ?? null,
            booking_or_lead_page: (keyPages.booking_or_lead_page as string) ?? null,
            about_page: (keyPages.about_page as string) ?? null,
            services_page: (keyPages.services_page as string) ?? null,
          }
        : undefined,
      intent_coverage: intentCoverage
        ? {
            has_contact: intentCoverage.has_contact as boolean | undefined,
            has_booking: intentCoverage.has_booking as boolean | undefined,
            has_about: intentCoverage.has_about as boolean | undefined,
            has_services: intentCoverage.has_services as boolean | undefined,
          }
        : undefined,
      conversion_path_score: typeof siteReport.conversion_path_score === 'number' ? siteReport.conversion_path_score : undefined,
      content_quality_score: typeof siteReport.content_quality_score === 'number' ? siteReport.content_quality_score : undefined,
      trust_score: typeof siteReport.trust_score === 'number' ? siteReport.trust_score : undefined,
    };
  }

  if (
    !summary.site_overview &&
    !summary.business_identity &&
    !summary.homepage &&
    !summary.site_report_summary
  ) {
    return null;
  }
  return summary;
}

/**
 * Build a curated GBP summary from Places details and optional GBP analysis.
 */
export function buildGbpSummary(
  placesDetails: unknown,
  gbpAnalysis?: unknown
): GbpSummary | null {
  if (!placesDetails || typeof placesDetails !== 'object') return null;
  const p = placesDetails as Record<string, unknown>;

  const openingHours = p.openingHours as Record<string, unknown> | undefined;
  const summary: GbpSummary = {
    name: (p.name as string) ?? null,
    address: (p.address as string) ?? (p.formatted_address as string) ?? null,
    types: Array.isArray(p.types) ? (p.types as string[]) : undefined,
    category_label: (p.categoryLabel as string) ?? null,
    description: (p.description as string) ?? null,
    opening_hours: openingHours
      ? {
          open_now: openingHours.open_now as boolean | undefined,
          weekday_text: Array.isArray(openingHours.weekday_text)
            ? (openingHours.weekday_text as string[])
            : Array.isArray(openingHours.weekdayDescriptions)
              ? (openingHours.weekdayDescriptions as string[])
              : undefined,
        }
      : null,
    rating: typeof p.rating === 'number' ? p.rating : (p.rating as number) ?? null,
    review_count:
      typeof p.userRatingsTotal === 'number'
        ? p.userRatingsTotal
        : typeof p.user_ratings_total === 'number'
          ? p.user_ratings_total
          : null,
    website: (p.website as string) ?? null,
    phone: (p.phoneNumber as string) ?? (p.international_phone_number as string) ?? null,
  };

  if (gbpAnalysis && typeof gbpAnalysis === 'object') {
    const g = gbpAnalysis as Record<string, unknown>;
    const keywordChecks = g.keywordChecks as Record<string, unknown> | undefined;
    const checklist = Array.isArray(g.checklist) ? (g.checklist as Array<{ key?: string; status?: string; extractedValue?: string }>) : [];
    summary.gbp_checks = {
      description_keyword_match_pct:
        typeof keywordChecks?.descriptionKeywordMatchPct === 'number'
          ? keywordChecks.descriptionKeywordMatchPct
          : undefined,
      category_keyword_match_pct:
        typeof keywordChecks?.categoryKeywordMatchPct === 'number'
          ? keywordChecks.categoryKeywordMatchPct
          : undefined,
      checklist_summary: checklist
        .filter((c) => c.key && c.status)
        .map((c) => `${c.key}: ${c.status}${c.extractedValue ? ` (${c.extractedValue})` : ''}`),
    };
  }

  return summary;
}
