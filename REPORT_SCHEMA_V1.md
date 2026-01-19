# Report Schema (v1) - JSON Structure

## Complete JSON Schema

```typescript
interface ReportSchema {
  // A0: Report Meta
  meta: {
    businessName: string;
    categoryLabel: string;
    locationLabel: string;
    scanDate: string; // ISO timestamp
    websiteUrl: string | null;
    googleRating: number | null;
    googleReviewCount: number | null;
    placeId: string;
  };

  // A1: Left Rail Summary
  scores: {
    overall: {
      score: number; // 0-100
      label: 'Good' | 'Okay' | 'Poor';
    };
    searchResults: {
      score: number; // 0-40
      maxScore: 40;
      label: 'Good' | 'Okay' | 'Poor';
    };
    websiteExperience: {
      score: number; // 0-40
      maxScore: 40;
      label: 'Good' | 'Okay' | 'Poor';
    };
    localListings: {
      score: number; // 0-20
      maxScore: 20;
      label: 'Good' | 'Okay' | 'Poor';
    };
    socialPresence: {
      score: number; // 0-20
      maxScore: 20;
      label: 'Good' | 'Okay' | 'Poor';
    };
  };

  // A2: Top Cards
  summaryCards: {
    impact: {
      estimatedLossMonthly: number | null; // null if cannot calculate
      topProblems: Array<{
        key: string;
        label: string;
        impact: 'high' | 'medium' | 'low';
        section: 'search-results' | 'website-experience' | 'local-listings' | 'social-presence';
      }>; // Max 3
      businessAvatar: string | null; // Image URL
    };
    competitors: {
      count: number;
      list: Array<{
        name: string;
        rating: number | null;
        reviewCount: number | null;
        rank: number; // 1, 2, 3, 4, 5
        website: string | null;
      }>; // Top 5
    };
  };

  // A3: Search Visibility
  searchVisibility: {
    visibilityScore: number; // 0-100
    shareOfVoice: number; // Percentage of queries in top 10
    brandedVisibility: number; // Percentage of branded queries ranking
    nonBrandedVisibility: number; // Percentage of non-branded queries ranking
    queries: Array<{
      query: string;
      intent: 'branded' | 'non_branded';
      rationale: string;
      mapPack: {
        rank: number | null; // 1-3 if ranked, null if unranked
        results: Array<{
          placeId: string;
          name: string;
          rating: number | null;
          reviews: number | null;
          address: string | null;
          website: string | null;
          isTargetBusiness: boolean; // true if this is the analyzed business
        }>; // Top 3
      };
      organic: {
        rank: number | null; // 1-10 if ranked, null if unranked
        results: Array<{
          position: number; // 1-10
          title: string;
          link: string; // Full URL
          displayLink: string; // Domain
          snippet: string | null;
          faviconUrl: string | null;
          domain: string; // Normalized domain
          isTargetBusiness: boolean; // true if domain matches target
        }>; // Top 10
      };
      notes: string;
    }>;
  };

  // A4: Detailed Checklist Sections
  sections: Array<{
    id: 'search-results' | 'website-experience' | 'local-listings' | 'social-presence';
    title: string;
    score: number;
    maxScore: number;
    checks: Array<{
      key: string;
      label: string;
      status: 'good' | 'warn' | 'bad';
      whyItMatters: string; // 1-2 lines
      whatWeFound: string; // Concrete extracted value
      whatWeWereLookingFor: string; // Expected pattern/threshold
      howToFix: string; // Short steps
      evidence?: {
        fieldPath: string; // e.g., "crawl_map[0].h1_text[0]"
        sampleUrl?: string; // URL of page where data was found
        sampleValue?: string; // Example extracted value
      };
    }>;
  }>;

  // Artifacts & Metadata
  artifacts: {
    links: {
      website: string | null;
      instagram: string | null;
      facebook: string | null;
    };
    screenshots: {
      website: string | null; // Base64 or URL
      instagram: string | null;
      facebook: string | null;
    };
    timestamps: {
      websiteCrawl: string | null; // ISO timestamp
      gbpAnalysis: string | null;
      instagramScrape: string | null;
      facebookScrape: string | null;
    };
    dataFreshness: {
      websiteCrawl: 'fresh' | 'stale' | 'missing'; // fresh = < 24h, stale = > 24h, missing = no data
      gbpAnalysis: 'fresh' | 'stale' | 'missing';
      instagramScrape: 'fresh' | 'stale' | 'missing';
      facebookScrape: 'fresh' | 'stale' | 'missing';
    };
  };
}
```

---

## Field-to-Source Mapping

### Meta Fields

| Field | Source Path | Fallback |
|-------|-------------|----------|
| `businessName` | `places_details.name` OR `website_crawl.business_identity.business_name` | Domain name from website URL |
| `categoryLabel` | `website_crawl.business_identity.category_label` OR `places_details.types[0]` | "Business" |
| `locationLabel` | `website_crawl.business_identity.location_label` | `places_details.formatted_address` |
| `scanDate` | `website_crawl.scrape_metadata.timestamp` | Current timestamp |
| `websiteUrl` | `places_details.website` OR `socials.websiteUrl` | null |
| `googleRating` | `places_details.rating` OR `gbp_analysis.rating` | null |
| `googleReviewCount` | `places_details.user_ratings_total` OR `gbp_analysis.reviews` | null |
| `placeId` | From onboarding selection | null |

### Scores

| Score | Calculation | Source Data |
|-------|-------------|-------------|
| `overall` | `searchResults + websiteExperience + localListings + socialPresence` | All sections |
| `searchResults` | See formula in STANDARDIZED_REPORT_STRUCTURE.md A1.1 | `website_crawl.search_visibility.visibility_score`, `crawl_map[0]` |
| `websiteExperience` | See formula in STANDARDIZED_REPORT_STRUCTURE.md A1.2 | `crawl_map[0]` (homepage) |
| `localListings` | See formula in STANDARDIZED_REPORT_STRUCTURE.md A1.3 | `gbp_analysis.checklist[]` |
| `socialPresence` | See formula in STANDARDIZED_REPORT_STRUCTURE.md A1.4 | `socials`, `instagram_scrape`, `facebook_scrape` |

### Summary Cards

| Field | Source Path | Fallback |
|-------|-------------|----------|
| `impact.estimatedLossMonthly` | Calculated heuristic (see STANDARDIZED_REPORT_STRUCTURE.md A2.1) | null |
| `impact.topProblems` | Failed checks sorted by impact weight | Empty array |
| `impact.businessAvatar` | `socials.websiteScreenshot` OR `gbp_photoRef` OR `instagram_profile.profilePictureUrl` | Default placeholder |
| `competitors.count` | `website_crawl.competitors_snapshot.competitors_places.length` | 0 |
| `competitors.list` | `website_crawl.competitors_snapshot.competitors_places[]` (sorted, top 5) | Empty array |

### Search Visibility

| Field | Source Path | Fallback |
|-------|-------------|----------|
| `visibilityScore` | `website_crawl.search_visibility.visibility_score` | 0 |
| `shareOfVoice` | `website_crawl.search_visibility.share_of_voice` | 0 |
| `brandedVisibility` | `website_crawl.search_visibility.branded_visibility` | 0 |
| `nonBrandedVisibility` | `website_crawl.search_visibility.non_branded_visibility` | 0 |
| `queries[]` | `website_crawl.search_visibility.queries[]` | Empty array |

### Checklist Items - Search Results Section

| Check Key | Source Path | Fallback |
|-----------|-------------|----------|
| `domain_custom` | `website_crawl.site_overview.homepage_url` | status: 'bad' |
| `domain_single` | `website_crawl.site_overview.primary_domain`, `crawl_map[].url` | status: 'warn' |
| `h1_exists` | `website_crawl.crawl_map[0].h1_count` | status: 'bad' |
| `h1_service_area` | `website_crawl.crawl_map[0].h1_text[]`, `business_identity.location_label` | status: 'bad' |
| `h1_keywords` | `website_crawl.crawl_map[0].h1_text[]`, `business_identity.service_keywords[]` | status: 'bad' |
| `images_alt_tags` | `website_crawl.crawl_map[0].images.{total_images, images_with_alt}` | status: 'bad' |
| `meta_desc_length` | `website_crawl.crawl_map[0].meta_desc_length` | status: 'bad' |
| `meta_desc_service_area` | `website_crawl.crawl_map[0].meta_description`, `business_identity.location_label` | status: 'bad' |
| `meta_desc_keywords` | `website_crawl.crawl_map[0].meta_description`, `business_identity.service_keywords[]` | status: 'bad' |
| `title_matches_gbp` | `website_crawl.crawl_map[0].title`, `gbp_analysis.businessName` | status: 'bad' |
| `title_service_area` | `website_crawl.crawl_map[0].title`, `business_identity.location_label` | status: 'bad' |
| `title_keywords` | `website_crawl.crawl_map[0].title`, `business_identity.service_keywords[]` | status: 'bad' |
| `indexability` | `website_crawl.crawl_map[0].indexability.is_indexable` | status: 'bad' |
| `structured_data` | `website_crawl.crawl_map[0].structured_data[]` | status: 'bad' |

### Checklist Items - Website Experience Section

| Check Key | Source Path | Fallback |
|-----------|-------------|----------|
| `primary_cta` | `website_crawl.crawl_map[0].primary_cta` | status: 'bad' |
| `contact_phone` | `website_crawl.crawl_map[0].contact_methods.phone[]`, `clickable_actions.tel_links[]` | status: 'bad' |
| `contact_email` | `website_crawl.crawl_map[0].contact_methods.email[]`, `clickable_actions.mailto_links[]` | status: 'bad' |
| `contact_forms` | `website_crawl.crawl_map[0].forms[]` | status: 'bad' |
| `mobile_friendly` | `website_crawl.crawl_map[0].viewport_checks.mobile_friendly` | status: 'bad' |
| `lazy_loading` | `website_crawl.crawl_map[0].performance.lazy_loading_detected` | status: 'warn' |
| `trust_testimonials` | `website_crawl.crawl_map[0].enhanced_trust_signals.has_testimonials` | status: 'bad' |
| `trust_reviews` | `website_crawl.crawl_map[0].enhanced_trust_signals.has_reviews_widget` | status: 'bad' |
| `trust_about` | `website_crawl.site_report_summary.key_pages.about_page` | status: 'bad' |
| `trust_faq` | `website_crawl.site_report_summary.intent_coverage.has_faq` | status: 'bad' |
| `content_sufficient` | `website_crawl.crawl_map[0].word_count` | status: 'bad' |
| `favicon` | `website_crawl.site_overview.favicon_url` | status: 'bad' |

### Checklist Items - Local Listings Section

| Check Key | Source Path | Fallback |
|-----------|-------------|----------|
| `gbp_website` | `gbp_analysis.checklist.find(c => c.key === 'website')` | status: 'bad' |
| `gbp_description` | `gbp_analysis.checklist.find(c => c.key === 'description')` | status: 'bad' |
| `gbp_hours` | `gbp_analysis.checklist.find(c => c.key === 'hours')` | status: 'bad' |
| `gbp_phone` | `gbp_analysis.checklist.find(c => c.key === 'phone')` | status: 'bad' |
| `gbp_price_range` | `gbp_analysis.checklist.find(c => c.key === 'price_range')` | status: 'warn' |
| `gbp_social_links` | `website_crawl.crawl_map[].external_links.social[]` (aggregate) | status: 'warn' |
| `gbp_desc_keywords` | `gbp_analysis.keywordChecks.descriptionKeywordMatchPct` | status: 'bad' |
| `gbp_categories_keywords` | `gbp_analysis.keywordChecks.categoryKeywordMatchPct`, `placeDetails.types[]` | status: 'bad' |

### Checklist Items - Social Presence Section

| Check Key | Source Path | Fallback |
|-----------|-------------|----------|
| `social_instagram_found` | `socials.socialLinks.find(l => l.platform === 'instagram')` | status: 'bad' |
| `social_facebook_found` | `socials.socialLinks.find(l => l.platform === 'facebook')` | status: 'bad' |
| `ig_profile_complete` | `instagram_scrape.profile.{biography, website, category}` | status: 'bad' |
| `ig_posting_consistency` | `instagram_scrape.posts[]` (filter by date, count last 30 days) | status: 'bad' |
| `ig_engagement_rate` | Calculate from `instagram_scrape.posts[]` (last 12), `profile.followerCount` | status: 'bad' |
| `ig_recent_activity` | `instagram_scrape.posts[0].date` (most recent) | status: 'bad' |
| `fb_page_complete` | `facebook_scrape.profile.{description, phone, address, website, hours}` | status: 'bad' |
| `fb_posting_consistency` | `facebook_scrape.posts[]` (filter by date, count last 30 days) | status: 'bad' |
| `fb_recent_activity` | `facebook_scrape.posts[0].date` (most recent) | status: 'bad' |

### Artifacts

| Field | Source Path | Fallback |
|-------|-------------|----------|
| `links.website` | `places_details.website` OR `socials.websiteUrl` | null |
| `links.instagram` | `socials.socialLinks.find(l => l.platform === 'instagram').url` | null |
| `links.facebook` | `socials.socialLinks.find(l => l.platform === 'facebook').url` | null |
| `screenshots.website` | `socials.websiteScreenshot` | null |
| `screenshots.instagram` | `socials.socialLinks.find(l => l.platform === 'instagram').screenshot` | null |
| `screenshots.facebook` | `socials.socialLinks.find(l => l.platform === 'facebook').screenshot` | null |
| `timestamps.websiteCrawl` | `website_crawl.scrape_metadata.timestamp` | null |
| `timestamps.gbpAnalysis` | Current timestamp when analysis runs | null |
| `timestamps.instagramScrape` | Current timestamp when scrape runs | null |
| `timestamps.facebookScrape` | Current timestamp when scrape runs | null |
| `dataFreshness.*` | Calculate from timestamps: fresh = < 24h, stale = > 24h, missing = null | 'missing' |

---

## Required vs Optional Fields

### Required (Report cannot render without these):
- `meta.businessName`
- `meta.scanDate`
- `meta.placeId`
- `scores.overall`
- `sections[]` (at least 1 section must exist)

### Optional (Report can render with fallbacks):
- All other fields in `meta`
- `scores.searchResults`, `scores.websiteExperience`, `scores.localListings`, `scores.socialPresence` (default to 0 if missing)
- `summaryCards.impact.estimatedLossMonthly` (can be null)
- `summaryCards.competitors` (can be empty)
- `searchVisibility.queries[]` (can be empty array)
- `sections[].checks[]` (can be empty, but section should still exist)
- `artifacts.*` (all optional, defaults to null/empty)

---

## Default Empty States

### When Website Crawl Missing:
```json
{
  "scores": {
    "searchResults": { "score": 0, "maxScore": 40, "label": "Poor" },
    "websiteExperience": { "score": 0, "maxScore": 40, "label": "Poor" }
  },
  "sections": [
    {
      "id": "search-results",
      "title": "Get your website to the top of Google",
      "score": 0,
      "maxScore": 40,
      "checks": [
        {
          "key": "website_required",
          "label": "Website URL required",
          "status": "bad",
          "whyItMatters": "Website analysis requires a website URL",
          "whatWeFound": "No website URL found",
          "whatWeWereLookingFor": "A website URL from Google Business Profile or Places API",
          "howToFix": "Ensure your business has a website listed on Google Business Profile"
        }
      ]
    },
    {
      "id": "website-experience",
      "title": "Improve the experience on your website",
      "score": 0,
      "maxScore": 40,
      "checks": [] // Empty - explain that website crawl is required
    }
  ],
  "searchVisibility": {
    "visibilityScore": 0,
    "shareOfVoice": 0,
    "brandedVisibility": 0,
    "nonBrandedVisibility": 0,
    "queries": []
  }
}
```

### When GBP Analysis Missing:
```json
{
  "scores": {
    "localListings": { "score": 0, "maxScore": 20, "label": "Poor" }
  },
  "sections": [
    {
      "id": "local-listings",
      "title": "Make your business easy to find",
      "score": 0,
      "maxScore": 20,
      "checks": [
        {
          "key": "gbp_data_required",
          "label": "Google Business Profile data required",
          "status": "bad",
          "whyItMatters": "Local listings analysis requires Google Business Profile data",
          "whatWeFound": "No GBP data available",
          "whatWeWereLookingFor": "Place ID from Google Places API",
          "howToFix": "Ensure your business is listed on Google Business Profile"
        }
      ]
    }
  ]
}
```

### When Social Media Missing:
```json
{
  "scores": {
    "socialPresence": { "score": 0, "maxScore": 20, "label": "Poor" }
  },
  "sections": [
    {
      "id": "social-presence",
      "title": "Build your social media presence",
      "score": 0,
      "maxScore": 20,
      "checks": [
        {
          "key": "social_discovery_required",
          "label": "Social media profiles not found",
          "status": "bad",
          "whyItMatters": "Social media helps you reach a wider audience",
          "whatWeFound": "No Instagram or Facebook profiles found on website",
          "whatWeWereLookingFor": "Social media links on your website (footer, header, or contact page)",
          "howToFix": "Add links to your Instagram and Facebook profiles on your website"
        }
      ]
    }
  ]
}
```

### When Search Visibility Missing:
```json
{
  "searchVisibility": {
    "visibilityScore": 0,
    "shareOfVoice": 0,
    "brandedVisibility": 0,
    "nonBrandedVisibility": 0,
    "queries": []
  },
  "summaryCards": {
    "impact": {
      "estimatedLossMonthly": null,
      "topProblems": [],
      "businessAvatar": null
    }
  }
}
```

---

## Example Complete Report (Minimal Data)

```json
{
  "meta": {
    "businessName": "Wild Cherry",
    "categoryLabel": "Restaurant",
    "locationLabel": "West Village, New York",
    "scanDate": "2026-01-09T00:02:38.000Z",
    "websiteUrl": "https://wildcherrynyc.com",
    "googleRating": 4.8,
    "googleReviewCount": 24,
    "placeId": "ChIJlZofFVNmzB0R3GxaFYr0p7Q"
  },
  "scores": {
    "overall": {
      "score": 46,
      "label": "Poor"
    },
    "searchResults": {
      "score": 14,
      "maxScore": 40,
      "label": "Poor"
    },
    "websiteExperience": {
      "score": 23,
      "maxScore": 40,
      "label": "Poor"
    },
    "localListings": {
      "score": 9,
      "maxScore": 20,
      "label": "Poor"
    },
    "socialPresence": {
      "score": 0,
      "maxScore": 20,
      "label": "Poor"
    }
  },
  "summaryCards": {
    "impact": {
      "estimatedLossMonthly": 187,
      "topProblems": [
        {
          "key": "h1_service_area",
          "label": "H1 doesn't mention the service area",
          "impact": "high",
          "section": "search-results"
        },
        {
          "key": "h1_keywords",
          "label": "H1 is missing relevant keywords",
          "impact": "high",
          "section": "search-results"
        },
        {
          "key": "images_alt_tags",
          "label": "Images are missing 'alt tags'",
          "impact": "medium",
          "section": "search-results"
        }
      ],
      "businessAvatar": "data:image/png;base64,..."
    },
    "competitors": {
      "count": 8,
      "list": [
        {
          "name": "BURGERHEAD West Village",
          "rating": 4.6,
          "reviewCount": 77,
          "rank": 1,
          "website": "https://burgerhead.com"
        },
        {
          "name": "Burgers & Beer",
          "rating": 4.9,
          "reviewCount": 77,
          "rank": 2,
          "website": null
        }
      ]
    }
  },
  "searchVisibility": {
    "visibilityScore": 35,
    "shareOfVoice": 20,
    "brandedVisibility": 60,
    "nonBrandedVisibility": 10,
    "queries": [
      {
        "query": "Best burgers in TriBeCa",
        "intent": "non_branded",
        "rationale": "Service keyword + location",
        "mapPack": {
          "rank": null,
          "results": [
            {
              "placeId": "ChIJ...",
              "name": "Au Cheval",
              "rating": 4.7,
              "reviews": 1200,
              "address": "33 Cortlandt Alley, New York, NY",
              "website": "https://aucheval.com",
              "isTargetBusiness": false
            }
          ]
        },
        "organic": {
          "rank": null,
          "results": [
            {
              "position": 1,
              "title": "TOP 10 BEST French in New York, NY",
              "link": "https://www.yelp.com/search?cflt=french&find_loc=New+York%2C+NY",
              "displayLink": "yelp.com",
              "snippet": "Best French restaurants in New York...",
              "faviconUrl": "https://www.google.com/s2/favicons?domain=yelp.com",
              "domain": "yelp.com",
              "isTargetBusiness": false
            }
          ]
        },
        "notes": "Unranked in both map pack and organic"
      }
    ]
  },
  "sections": [
    {
      "id": "search-results",
      "title": "Get your website to the top of Google",
      "score": 14,
      "maxScore": 40,
      "checks": [
        {
          "key": "h1_service_area",
          "label": "Includes the service area",
          "status": "bad",
          "whyItMatters": "Mentioning your service area in the headline helps with local SEO",
          "whatWeFound": "Home",
          "whatWeWereLookingFor": "H1 should include one of: TriBeCa, Greenwich Village, West Village, NY",
          "howToFix": "Update your H1 to include your neighborhood or city (e.g., 'Best Burgers in TriBeCa')",
          "evidence": {
            "fieldPath": "crawl_map[0].h1_text[0]",
            "sampleUrl": "https://wildcherrynyc.com",
            "sampleValue": "Home"
          }
        }
      ]
    }
  ],
  "artifacts": {
    "links": {
      "website": "https://wildcherrynyc.com",
      "instagram": null,
      "facebook": null
    },
    "screenshots": {
      "website": "data:image/png;base64,...",
      "instagram": null,
      "facebook": null
    },
    "timestamps": {
      "websiteCrawl": "2026-01-09T00:02:38.000Z",
      "gbpAnalysis": "2026-01-09T00:02:40.000Z",
      "instagramScrape": null,
      "facebookScrape": null
    },
    "dataFreshness": {
      "websiteCrawl": "fresh",
      "gbpAnalysis": "fresh",
      "instagramScrape": "missing",
      "facebookScrape": "missing"
    }
  }
}
```

---

## Implementation Notes

1. **Score Labels:** Calculate based on score ranges:
   - `Good`: score >= 80% of maxScore
   - `Okay`: score >= 50% of maxScore
   - `Poor`: score < 50% of maxScore

2. **Check Status Priority:** When determining `topProblems`, prioritize:
   - High impact + status 'bad'
   - Medium impact + status 'bad'
   - High impact + status 'warn'
   - Low impact + status 'bad'

3. **Data Freshness:** Calculate from timestamps:
   - `fresh`: timestamp exists AND (current time - timestamp) < 24 hours
   - `stale`: timestamp exists AND (current time - timestamp) >= 24 hours
   - `missing`: timestamp is null

4. **Competitor Ranking:** Sort by:
   - `rating` (descending)
   - Then `reviewCount` (descending)
   - Assign rank 1, 2, 3, 4, 5

5. **Query Expansion:** Frontend should handle:
   - Map pack mini map (use Google Maps Static API or embed)
   - Organic results favicon loading (use `faviconUrl` or fallback to Google favicon service)
   - Highlighting target business (match by `placeId` for map pack, normalize domain for organic)
