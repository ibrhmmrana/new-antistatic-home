# Standardized Owner.com-Style Report Structure (v1)

## Overview

This document defines the standardized report structure for Antistatic that works for **any business type** (restaurant, dentist, salon, dealership, plumber, etc.), matching Owner.com's structure while adding a Social Media layer.

---

## A0) Report Meta (Header Data)

**Purpose:** Business identification and scan metadata

**Fields:**
- `businessName`: string (from Places details OR business_identity)
- `categoryLabel`: string (from business_identity.category_label OR Places types)
- `locationLabel`: string (from business_identity.location_label, e.g., "Camps Bay, Cape Town")
- `scanDate`: ISO timestamp (from scrape_metadata.timestamp)
- `websiteUrl`: string | null (from Places details.website OR socials.websiteUrl)
- `googleRating`: number | null (from Places details.rating OR GBP analysis.rating)
- `googleReviewCount`: number | null (from Places details.user_ratings_total OR GBP analysis.reviews)
- `placeId`: string (from onboarding selection)

**Data Sources:**
- Primary: `GET /api/places/details` → `{ name, rating, user_ratings_total, website }`
- Secondary: `POST /api/scan/website` → `business_identity.{ business_name, category_label, location_label }`
- Fallback: `POST /api/scan/socials` → `websiteUrl`

**Fallback Behavior:**
- If business name missing: Use domain name from website URL
- If category missing: Use "Business" as default
- If location missing: Use address from Places details (formatted_address)
- If rating/reviews missing: Show "Not available"

---

## A1) Left Rail Summary (Owner-like)

**Purpose:** Overall health grade with category breakdown

### Overall Health Grade
- **Score Range:** 0-100
- **Labels:**
  - 80-100: "Good" (green)
  - 50-79: "Okay" (yellow)
  - 0-49: "Poor" (red)

**Formula:**
```
overallScore = searchResultsScore + websiteExperienceScore + localListingsScore + socialPresenceScore
```

### Category Scores

#### 1. Search Results (0-40 points)
**Purpose:** SEO and search visibility performance

**Scoring Formula:**
```
baseScore = search_visibility.visibility_score * 0.4  // 0-40 points from visibility
onPageScore = 0  // Additional points from on-page SEO checks

// On-page checks (max 10 bonus points):
+ 2 if homepage has H1 with service area
+ 2 if homepage has H1 with relevant keywords
+ 2 if homepage meta description includes service area
+ 2 if homepage meta description includes keywords
+ 2 if homepage has structured data (LocalBusiness/Organization)

searchResultsScore = min(40, baseScore + onPageScore)
```

**Data Sources:**
- `POST /api/scan/website` → `search_visibility.visibility_score` (0-100)
- `POST /api/scan/website` → `crawl_map[0]` (homepage) → `h1_text[]`, `meta_description`, `structured_data[]`
- `POST /api/scan/website` → `business_identity.{ service_keywords, location_label }`

**Fallback:**
- If search_visibility missing: `searchResultsScore = onPageScore` (max 10)
- If homepage missing: Use first page in crawl_map

#### 2. Website Experience (0-40 points)
**Purpose:** User experience, conversion optimization, trust signals

**Scoring Formula:**
```
conversionScore = 0
+ 5 if primary_cta exists and above_fold
+ 5 if contact_methods.phone.length > 0
+ 5 if contact_methods.email.length > 0
+ 3 if clickable_actions.tel_links.length > 0
+ 3 if clickable_actions.mailto_links.length > 0
+ 2 if forms.length > 0

trustScore = 0
+ 5 if enhanced_trust_signals.has_testimonials
+ 5 if enhanced_trust_signals.has_reviews_widget
+ 3 if enhanced_trust_signals.has_awards_badges
+ 3 if enhanced_trust_signals.has_social_proof_numbers
+ 2 if enhanced_trust_signals.has_team_section

uxScore = 0
+ 5 if viewport_checks.mobile_friendly
+ 3 if performance.lazy_loading_detected
+ 2 if performance.image_optimization_detected

websiteExperienceScore = min(40, conversionScore + trustScore + uxScore)
```

**Data Sources:**
- `POST /api/scan/website` → `crawl_map[0]` (homepage) → `primary_cta`, `contact_methods`, `clickable_actions`, `forms[]`
- `POST /api/scan/website` → `crawl_map[0]` → `enhanced_trust_signals`, `viewport_checks`, `performance`

**Fallback:**
- If homepage missing: Aggregate across all pages (any page with feature = +1 point, max per feature)

#### 3. Local Listings (0-20 points)
**Purpose:** Google Business Profile completeness

**Scoring Formula:**
```
gbpScore = 0
+ 3 if website exists
+ 3 if description exists
+ 3 if business hours exists
+ 2 if phone exists
+ 2 if price range exists
+ 2 if social media links found on website
+ 2 if description includes relevant keywords
+ 3 if categories match keywords

localListingsScore = min(20, gbpScore)
```

**Data Sources:**
- `GET /api/gbp/place-details` → `analysis.checklist[]` (status: 'good'/'warn'/'bad')
- `POST /api/scan/website` → `crawl_map[].external_links.social[]` (for social links detection)
- `GET /api/gbp/place-details` → `analysis.keywordChecks.{ descriptionKeywordMatchPct, categoryKeywordMatchPct }`

**Fallback:**
- If GBP analysis missing: `localListingsScore = 0` (show "Data not available")

#### 4. Social Presence (0-20 points) - NEW
**Purpose:** Social media presence and engagement

**Scoring Formula:**
```
discoveryScore = 0
+ 5 if Instagram found
+ 5 if Facebook found
+ 2 if website screenshot available

instagramScore = 0
+ 3 if profile.biography exists
+ 2 if profile.website exists
+ 2 if profile.category exists
+ 2 if posting consistency (>= 1 post/week in last 30 days)
+ 1 if engagement rate > 1% (for followers > 1000) OR > 3% (for followers <= 1000)

facebookScore = 0
+ 2 if profile.description exists
+ 2 if profile.phone exists
+ 2 if profile.address exists
+ 2 if profile.website exists
+ 2 if profile.hours exists
+ 2 if posting consistency (>= 1 post/week in last 30 days)

socialPresenceScore = min(20, discoveryScore + min(8, instagramScore) + min(8, facebookScore))
```

**Data Sources:**
- `POST /api/scan/socials` → `socialLinks[]`, `websiteScreenshot`
- `POST /api/test/instagram-scrape` → `profile`, `posts[]`
- `POST /api/test/facebook-scrape` → `profile`, `posts[]`

**Fallback:**
- If Instagram missing: `instagramScore = 0`
- If Facebook missing: `facebookScore = 0`
- If both missing: `socialPresenceScore = discoveryScore` (max 12 if website screenshot exists)

### CTA Button
- **Text:** "Fix in 35 seconds"
- **Action:** (To be wired later - likely navigate to AI website builder or action items)

---

## A2) Top Cards (Owner-like)

### Card 1: "You could be losing ~$X/month due to N problems"

**Purpose:** Highlight top issues with estimated impact

**Fields:**
- `estimatedLossMonthly`: number (heuristic calculation)
- `topProblems`: Array<{ key: string, label: string, impact: 'high'|'medium'|'low' }> (max 3)
- `businessAvatar`: string | null (image URL)

**Impact Estimation Formula:**
```
// Simple heuristic (can be refined later)
baseVisibility = search_visibility.visibility_score / 100  // 0-1
missingConversionItems = count of failed high-impact checks (primary_cta, contact_methods, etc.)
categoryMultiplier = {
  'restaurant': 150,
  'dental_ortho': 200,
  'salon': 100,
  'plumber': 120,
  'default': 100
}

estimatedLossMonthly = Math.round(
  (1 - baseVisibility) * missingConversionItems * categoryMultiplier[categoryFamily]
)
```

**Top Problems Selection:**
1. Sort all failed checks by impact weight:
   - High: H1 missing keywords/service area, no primary CTA, no contact methods, no GBP website
   - Medium: Missing meta description keywords, no trust signals, no social links
   - Low: Missing alt tags, no FAQ, no structured data
2. Take top 3 high-impact, then medium, then low

**Business Avatar:**
- Priority 1: `POST /api/scan/socials` → `websiteScreenshot` (if available)
- Priority 2: `GET /api/gbp/place-details` → `placeDetails.photoRef` → Generate Google Places photo URL
- Priority 3: `POST /api/test/instagram-scrape` → `profile.profilePictureUrl`
- Fallback: Default placeholder image

**Data Sources:**
- All checklist items from sections A4.1, A4.2, A4.3, A4.4
- `POST /api/scan/website` → `search_visibility.visibility_score`
- `POST /api/scan/website` → `business_identity.category_label` → resolve to category family

**Fallback:**
- If no problems found: Show "No critical issues found" (unlikely but handle gracefully)
- If estimatedLossMonthly cannot be calculated: Show "Issues detected" without dollar amount

### Card 2: "You're ranking below X competitors"

**Purpose:** Show competitive positioning

**Fields:**
- `competitorCount`: number
- `competitors`: Array<{ name: string, rating: number | null, reviewCount: number | null, rank: number }> (top 5)

**Data Sources:**
- `POST /api/scan/website` → `competitors_snapshot.competitors_places[]`
- Sort by `rating` (descending), then `reviewCount` (descending)
- Assign rank: 1st, 2nd, 3rd, 4th, 5th

**Fallback:**
- If competitors_snapshot missing: Show "Competitor data not available"
- If competitors_places empty: Show "No local competitors found"

---

## A3) Search Visibility Table (Owner-like)

**Title:** "This is how you're doing online"
**Subtitle:** "Where you are showing up when customers search you, next to your competitors"

### Query Row Structure

**Collapsed State:**
- Query text (e.g., "Best burgers in TriBeCa")
- Chips:
  - `#1: [Competitor Name]` (if map pack rank is null, show top competitor from mapPack.results[0])
  - `"Unranked map pack"` badge (if mapPack.rank === null)
  - `"Unranked organic"` badge (if organic.rank === null)
  - `"Ranked #X map pack"` (if mapPack.rank !== null, 1-3)
  - `"Ranked #X organic"` (if organic.rank !== null, 1-10)

**Expanded State:**
- **Left Column: Map Pack Results**
  - Mini map UI (frontend renders using Google Maps Static API or embed)
  - "Top 3 map results" list:
    - Name, rating (⭐), review count
    - Highlight if it's the target business (match by place_id)
    - Rank badge (1st, 2nd, 3rd)
  
- **Right Column: Organic Search Results**
  - "Google Search results" header
  - "You are Unranked" or "You are Ranked #X" message
  - List of top 10 organic results:
    - Favicon (from `getFaviconUrl`)
    - Title (clickable link)
    - URL (displayLink)
    - Snippet
    - Highlight if domain matches target business (normalize domains)

**Data Sources:**
- `POST /api/scan/website` → `search_visibility.queries[]`
  - `query`: string
  - `intent`: 'branded' | 'non_branded'
  - `mapPack.rank`: number | null (1-3)
  - `mapPack.results[]`: Array<{ place_id, name, rating, reviews, address, website }>
  - `organic.rank`: number | null (1-10)
  - `organic.results[]`: Array<{ position, title, link, displayLink, snippet, faviconUrl, domain }>

**Fallback:**
- If search_visibility missing: Show empty state with message "Search visibility analysis not available. This requires a website URL."
- If queries array empty: Show "No search queries analyzed" with explanation

**Query Safety Rules:**
- Ensure queries are business-type agnostic (already handled by `buildOwnerStyleQueries.ts`)
- Filter out generic queries like "best services" (already handled by category families)

---

## A4) "Things reviewed" Detailed Checklist Sections

**Top Line:** "{total} things reviewed, {needWork} need work"

**Calculation:**
- `total` = sum of all checklist items across all 4 sections
- `needWork` = count of items with status 'bad' or 'warn'

### Section 1: Search Results (SEO) (0-40 points)

**Title:** "Get your website to the top of Google"
**Score Display:** "{score}/40"

**Checklist Items:**

#### 1.1 Domain
- **Key:** `domain_custom`
- **Label:** "Using custom domain"
- **Status Logic:**
  - `good`: website URL exists and domain is NOT in third-party list (doordash.com, ubereats.com, etc.)
  - `bad`: website URL is a third-party domain OR no website
- **What we found:** `site_overview.homepage_url` (domain only)
- **What we were looking for:** List of third-party domains (doordash.com, ubereats.com, toasttab.com, etc.)
- **Why it matters:** "Fracturing your web presence across multiple domains hurts Google rankings"
- **How to fix:** "Use your own domain name (e.g., yourbusiness.com) instead of third-party platforms"
- **Data Source:** `POST /api/scan/website` → `site_overview.homepage_url`

#### 1.2 Domain (continued)
- **Key:** `domain_single`
- **Label:** "Only one domain"
- **Status Logic:**
  - `good`: All pages in crawl_map use same primary domain (check `site_overview.primary_domain`)
  - `warn`: Some pages redirect to different domains
  - `bad`: Multiple primary domains detected
- **What we found:** `site_overview.primary_domain` + count of unique domains in crawl_map
- **What we were looking for:** Single primary domain
- **Why it matters:** "Multiple domains dilute your SEO authority"
- **How to fix:** "Consolidate all pages under one primary domain"
- **Data Source:** `POST /api/scan/website` → `site_overview.primary_domain`, `crawl_map[].url`

#### 1.3 Headline (H1)
- **Key:** `h1_exists`
- **Label:** "H1 exists"
- **Status Logic:**
  - `good`: Homepage has exactly 1 H1 (`h1_count === 1`)
  - `warn`: Homepage has 0 or >1 H1
- **What we found:** `crawl_map[0].h1_text[0]` or "None found"
- **What we were looking for:** Exactly 1 H1 tag on homepage
- **Why it matters:** "An H1 tag is crucial for SEO and helps structure your content hierarchy"
- **How to fix:** "Add a single H1 tag to your homepage with your main headline"
- **Data Source:** `POST /api/scan/website` → `crawl_map[0].h1_count`, `crawl_map[0].h1_text[]`

#### 1.4 Headline (H1) - Service Area
- **Key:** `h1_service_area`
- **Label:** "Includes the service area"
- **Status Logic:**
  - `good`: H1 text includes location_label (suburb OR city) from business_identity
  - `bad`: H1 text does not include service area
- **What we found:** `crawl_map[0].h1_text[0]` or "Home" (if generic)
- **What we were looking for:** H1 should include one of: `business_identity.location_suburb`, `business_identity.location_city`, or other location terms
- **Why it matters:** "Mentioning your service area in the headline helps with local SEO"
- **How to fix:** "Update your H1 to include your neighborhood or city (e.g., 'Best Burgers in TriBeCa')"
- **Data Source:** `POST /api/scan/website` → `crawl_map[0].h1_text[]`, `business_identity.location_label`

#### 1.5 Headline (H1) - Keywords
- **Key:** `h1_keywords`
- **Label:** "Includes relevant keywords"
- **Status Logic:**
  - `good`: H1 text includes at least one service_keyword from business_identity
  - `bad`: H1 text does not include relevant keywords
- **What we found:** `crawl_map[0].h1_text[0]`
- **What we were looking for:** H1 should include one of: `business_identity.service_keywords[]`
- **Why it matters:** "Including relevant keywords in your headline improves search visibility"
- **How to fix:** "Add your main service keywords to your H1 (e.g., 'Orthodontist', 'Burgers', 'Plumber')"
- **Data Source:** `POST /api/scan/website` → `crawl_map[0].h1_text[]`, `business_identity.service_keywords[]`

#### 1.6 Metadata - Images Alt Tags
- **Key:** `images_alt_tags`
- **Label:** "Images have 'alt tags'"
- **Status Logic:**
  - `good`: At least 80% of images on homepage have alt tags
  - `warn`: 50-79% have alt tags
  - `bad`: <50% have alt tags
- **What we found:** `crawl_map[0].images.images_with_alt` / `crawl_map[0].images.total_images` (percentage)
- **What we were looking for:** At least 80% of images should have alt tags
- **Why it matters:** "Google looks at alt tags to understand what images are on your site"
- **How to fix:** "Add descriptive alt text to all images on your homepage"
- **Data Source:** `POST /api/scan/website` → `crawl_map[0].images.{ total_images, images_with_alt }`

#### 1.7 Metadata - Description Length
- **Key:** `meta_desc_length`
- **Label:** "Description length"
- **Status Logic:**
  - `good`: Meta description length >= 100 and <= 160 characters
  - `warn`: Meta description length < 100 or > 160
  - `bad`: No meta description
- **What we found:** `crawl_map[0].meta_description` (with length)
- **What we were looking for:** Meta description should be 100-160 characters
- **Why it matters:** "A sufficiently long meta description provides more context in search results"
- **How to fix:** "Update your meta description to be between 100-160 characters"
- **Data Source:** `POST /api/scan/website` → `crawl_map[0].meta_description`, `crawl_map[0].meta_desc_length`

#### 1.8 Metadata - Description Service Area
- **Key:** `meta_desc_service_area`
- **Label:** "Description includes the service area"
- **Status Logic:**
  - `good`: Meta description includes location_label
  - `bad`: Meta description does not include service area
- **What we found:** `crawl_map[0].meta_description`
- **What we were looking for:** Meta description should include: `business_identity.location_suburb` OR `business_identity.location_city`
- **Why it matters:** "Mentioning your service area in the meta description aids local SEO efforts"
- **How to fix:** "Add your neighborhood or city to your meta description"
- **Data Source:** `POST /api/scan/website` → `crawl_map[0].meta_description`, `business_identity.location_label`

#### 1.9 Metadata - Description Keywords
- **Key:** `meta_desc_keywords`
- **Label:** "Description includes relevant keywords"
- **Status Logic:**
  - `good`: Meta description includes at least one service_keyword
  - `bad`: Meta description does not include keywords
- **What we found:** `crawl_map[0].meta_description`
- **What we were looking for:** Meta description should include one of: `business_identity.service_keywords[]`
- **Why it matters:** "Including relevant keywords in your meta description can improve click-through rates from search results"
- **How to fix:** "Add your main service keywords to your meta description"
- **Data Source:** `POST /api/scan/website` → `crawl_map[0].meta_description`, `business_identity.service_keywords[]`

#### 1.10 Page Title - Matches GBP
- **Key:** `title_matches_gbp`
- **Label:** "Page title matches Google Business Profile"
- **Status Logic:**
  - `good`: Page title includes business name from GBP (fuzzy match, case-insensitive)
  - `bad`: Page title does not match GBP name
- **What we found:** `crawl_map[0].title`
- **What we were looking for:** Title should include exact GBP listing name: `gbp_analysis.businessName`
- **Why it matters:** "Matching your page title with your Google listing provides consistency across platforms"
- **How to fix:** "Update your page title to include your exact business name from Google"
- **Data Source:** `POST /api/scan/website` → `crawl_map[0].title`, `GET /api/gbp/place-details` → `analysis.businessName`

#### 1.11 Page Title - Service Area
- **Key:** `title_service_area`
- **Label:** "Page title includes the service area"
- **Status Logic:**
  - `good`: Page title includes location_label
  - `bad`: Page title does not include service area
- **What we found:** `crawl_map[0].title`
- **What we were looking for:** Title should include: `business_identity.location_suburb` OR `business_identity.location_city`
- **Why it matters:** "Including your service area in the page title helps with local search visibility"
- **How to fix:** "Add your neighborhood or city to your page title"
- **Data Source:** `POST /api/scan/website` → `crawl_map[0].title`, `business_identity.location_label`

#### 1.12 Page Title - Keywords
- **Key:** `title_keywords`
- **Label:** "Page title includes a relevant keyword"
- **Status Logic:**
  - `good`: Page title includes at least one service_keyword
  - `bad`: Page title does not include keywords
- **What we found:** `crawl_map[0].title`
- **What we were looking for:** Title should include one of: `business_identity.service_keywords[]`
- **Why it matters:** "Having a relevant keyword in your page title can improve search engine rankings"
- **How to fix:** "Add your main service keyword to your page title"
- **Data Source:** `POST /api/scan/website` → `crawl_map[0].title`, `business_identity.service_keywords[]`

#### 1.13 Indexability
- **Key:** `indexability`
- **Label:** "Page is indexable"
- **Status Logic:**
  - `good`: Homepage `indexability.is_indexable === true`
  - `bad`: Homepage has `meta_robots: 'noindex'` OR `x_robots_tag: 'noindex'`
- **What we found:** `crawl_map[0].indexability.is_indexable` (true/false)
- **What we were looking for:** Page should be indexable by search engines
- **Why it matters:** "If your page is not indexable, it won't appear in search results"
- **How to fix:** "Remove 'noindex' from meta robots tag or X-Robots-Tag header"
- **Data Source:** `POST /api/scan/website` → `crawl_map[0].indexability`

#### 1.14 Structured Data
- **Key:** `structured_data`
- **Label:** "Structured data present"
- **Status Logic:**
  - `good`: Homepage has structured data with type 'LocalBusiness' OR 'Organization'
  - `warn`: Homepage has structured data but not LocalBusiness/Organization
  - `bad`: No structured data found
- **What we found:** `crawl_map[0].structured_data[]` (list of types)
- **What we were looking for:** Structured data with type 'LocalBusiness' or 'Organization'
- **Why it matters:** "Structured data helps Google understand your business and can improve rich snippets"
- **How to fix:** "Add LocalBusiness or Organization schema.org JSON-LD to your homepage"
- **Data Source:** `POST /api/scan/website` → `crawl_map[0].structured_data[]`

---

### Section 2: Website Experience (0-40 points)

**Title:** "Improve the experience on your website"
**Score Display:** "{score}/40"

**Checklist Items:**

#### 2.1 Primary CTA
- **Key:** `primary_cta`
- **Label:** "Clear call-to-action above the fold"
- **Status Logic:**
  - `good`: Homepage has `primary_cta` with `above_fold === true` and `button_text` is not generic ("Click here", "Learn more")
  - `warn`: Primary CTA exists but not above fold
  - `bad`: No primary CTA found
- **What we found:** `crawl_map[0].primary_cta.button_text` or "None found"
- **What we were looking for:** A clear, action-oriented CTA button above the fold (e.g., "Book Appointment", "Order Online", "Get Quote")
- **Why it matters:** "A clear call-to-action helps visitors know what action to take next"
- **How to fix:** "Add a prominent CTA button above the fold with a specific action (e.g., 'Book Now', 'Contact Us')"
- **Data Source:** `POST /api/scan/website` → `crawl_map[0].primary_cta`

#### 2.2 Contact Methods - Phone
- **Key:** `contact_phone`
- **Label:** "Phone number"
- **Status Logic:**
  - `good`: `contact_methods.phone.length > 0` OR `clickable_actions.tel_links.length > 0`
  - `bad`: No phone number found
- **What we found:** `crawl_map[0].contact_methods.phone[0]` or "None found"
- **What we were looking for:** At least one phone number visible on the site
- **Why it matters:** "Listing a phone number increases the number of ways people can contact you"
- **How to fix:** "Add your business phone number to your homepage and contact page"
- **Data Source:** `POST /api/scan/website` → `crawl_map[0].contact_methods.phone[]`, `crawl_map[0].clickable_actions.tel_links[]`

#### 2.3 Contact Methods - Email
- **Key:** `contact_email`
- **Label:** "Email address"
- **Status Logic:**
  - `good`: `contact_methods.email.length > 0` OR `clickable_actions.mailto_links.length > 0`
  - `warn`: Email found but not clickable
  - `bad`: No email found
- **What we found:** `crawl_map[0].contact_methods.email[0]` or "None found"
- **What we were looking for:** At least one email address visible on the site
- **Why it matters:** "An email address provides another way for customers to reach you"
- **How to fix:** "Add your business email address to your contact page"
- **Data Source:** `POST /api/scan/website` → `crawl_map[0].contact_methods.email[]`, `crawl_map[0].clickable_actions.mailto_links[]`

#### 2.4 Contact Methods - Forms
- **Key:** `contact_forms`
- **Label:** "Contact form"
- **Status Logic:**
  - `good`: `forms.length > 0` AND at least one form has type 'contact'
  - `bad`: No contact forms found
- **What we found:** `crawl_map[0].forms.length` (count) or "None found"
- **What we were looking for:** At least one contact form on the site
- **Why it matters:** "Contact forms make it easy for visitors to reach out without leaving your site"
- **How to fix:** "Add a contact form to your contact page or homepage"
- **Data Source:** `POST /api/scan/website` → `crawl_map[0].forms[]`

#### 2.5 Mobile Friendly
- **Key:** `mobile_friendly`
- **Label:** "Mobile friendly"
- **Status Logic:**
  - `good`: `viewport_checks.mobile_friendly === true`
  - `bad`: Not mobile friendly
- **What we found:** `crawl_map[0].viewport_checks.mobile_friendly` (true/false)
- **What we were looking for:** Site should be mobile-friendly (responsive design)
- **Why it matters:** "Most users browse on mobile devices. A mobile-friendly site improves user experience"
- **How to fix:** "Ensure your site uses responsive design and works well on mobile screens"
- **Data Source:** `POST /api/scan/website` → `crawl_map[0].viewport_checks.mobile_friendly`

#### 2.6 Performance - Lazy Loading
- **Key:** `lazy_loading`
- **Label:** "Images use lazy loading"
- **Status Logic:**
  - `good`: `performance.lazy_loading_detected === true`
  - `warn`: Not detected (may still be present but not detectable)
- **What we found:** `crawl_map[0].performance.lazy_loading_detected` (true/false)
- **What we were looking for:** Images should use lazy loading for better performance
- **Why it matters:** "Lazy loading improves page load speed, especially on mobile"
- **How to fix:** "Add lazy loading attributes to images (loading='lazy')"
- **Data Source:** `POST /api/scan/website` → `crawl_map[0].performance.lazy_loading_detected`

#### 2.7 Trust Signals - Testimonials
- **Key:** `trust_testimonials`
- **Label:** "Customer testimonials"
- **Status Logic:**
  - `good`: `enhanced_trust_signals.has_testimonials === true`
  - `bad`: No testimonials found
- **What we found:** `crawl_map[0].enhanced_trust_signals.has_testimonials` (true/false)
- **What we were looking for:** Customer testimonials or reviews displayed on the site
- **Why it matters:** "Testimonials build trust and credibility with potential customers"
- **How to fix:** "Add a testimonials section to your homepage or about page"
- **Data Source:** `POST /api/scan/website` → `crawl_map[0].enhanced_trust_signals.has_testimonials`

#### 2.8 Trust Signals - Review Widgets
- **Key:** `trust_reviews`
- **Label:** "Review widgets"
- **Status Logic:**
  - `good`: `enhanced_trust_signals.has_reviews_widget === true`
  - `bad`: No review widgets found
- **What we found:** `crawl_map[0].enhanced_trust_signals.has_reviews_widget` (true/false)
- **What we were looking for:** Google Reviews widget or other review platform widgets
- **Why it matters:** "Review widgets showcase your reputation and help build trust"
- **How to fix:** "Add a Google Reviews widget or embed reviews from your review platforms"
- **Data Source:** `POST /api/scan/website` → `crawl_map[0].enhanced_trust_signals.has_reviews_widget`

#### 2.9 Trust Signals - About Us
- **Key:** `trust_about`
- **Label:** "Compelling About Us section"
- **Status Logic:**
  - `good`: `site_report_summary.key_pages.about_page !== null` AND page has sufficient content (word_count > 200)
  - `warn`: About page exists but content is thin
  - `bad`: No about page found
- **What we found:** `site_report_summary.key_pages.about_page` (URL or null)
- **What we were looking for:** An About page with substantial content (200+ words)
- **Why it matters:** "An About page helps visitors understand your business and builds trust"
- **How to fix:** "Create an About page with your business story, mission, and team information"
- **Data Source:** `POST /api/scan/website` → `site_report_summary.key_pages.about_page`, find page in `crawl_map[]` by URL

#### 2.10 Trust Signals - FAQ
- **Key:** `trust_faq`
- **Label:** "FAQ section"
- **Status Logic:**
  - `good`: `site_report_summary.intent_coverage.has_faq === true`
  - `bad`: No FAQ section found
- **What we found:** `site_report_summary.intent_coverage.has_faq` (true/false)
- **What we were looking for:** A FAQ section or page
- **Why it matters:** "FAQs answer common questions and reduce support inquiries"
- **How to fix:** "Add a FAQ section to your site addressing common customer questions"
- **Data Source:** `POST /api/scan/website` → `site_report_summary.intent_coverage.has_faq`

#### 2.11 Content - Sufficient Text
- **Key:** `content_sufficient`
- **Label:** "Sufficient text content"
- **Status Logic:**
  - `good`: Homepage `word_count >= 150`
  - `warn`: Homepage `word_count >= 100` but < 150
  - `bad`: Homepage `word_count < 100`
- **What we found:** `crawl_map[0].word_count` (number)
- **What we were looking for:** At least 150 words of text content on homepage
- **Why it matters:** "Content about your business helps Google understand what you do"
- **How to fix:** "Add more descriptive text content to your homepage (aim for 150+ words)"
- **Data Source:** `POST /api/scan/website` → `crawl_map[0].word_count`

#### 2.12 Favicon
- **Key:** `favicon`
- **Label:** "Favicon"
- **Status Logic:**
  - `good`: `site_overview.favicon_url !== null`
  - `bad`: No favicon found
- **What we found:** `site_overview.favicon_url` (URL or null)
- **What we were looking for:** A favicon (site icon) should be present
- **Why it matters:** "Including a favicon on your site improves the legitimacy of your site"
- **How to fix:** "Add a favicon to your site (typically in the root directory as favicon.ico)"
- **Data Source:** `POST /api/scan/website` → `site_overview.favicon_url`

---

### Section 3: Local Listings (GBP) (0-20 points)

**Title:** "Make your business easy to find"
**Score Display:** "{score}/20"

**Checklist Items:**

#### 3.1 Website
- **Key:** `gbp_website`
- **Label:** "First-party website"
- **Status Logic:**
  - `good`: `analysis.checklist` item with key 'website' has status 'good'
  - `bad`: Status 'bad'
- **What we found:** `analysis.checklist.find(c => c.key === 'website').extractedValue` or "Not found"
- **What we were looking for:** A first-party website URL (not third-party platform)
- **Why it matters:** "A website helps customers learn more about your business and find you online"
- **How to fix:** "Add your business website to your Google Business Profile"
- **Data Source:** `GET /api/gbp/place-details` → `analysis.checklist[]` (key: 'website')

#### 3.2 Description
- **Key:** `gbp_description`
- **Label:** "Description"
- **Status Logic:**
  - `good`: `analysis.checklist` item with key 'description' has status 'good'
  - `bad`: Status 'bad'
- **What we found:** `analysis.checklist.find(c => c.key === 'description').extractedValue` or "Not found"
- **What we were looking for:** A business description (from editorial_summary or owner description)
- **Why it matters:** "A description helps customers understand what your business offers"
- **How to fix:** "Add a compelling description to your Google Business Profile"
- **Data Source:** `GET /api/gbp/place-details` → `analysis.checklist[]` (key: 'description')

#### 3.3 Business Hours
- **Key:** `gbp_hours`
- **Label:** "Business hours"
- **Status Logic:**
  - `good`: `analysis.checklist` item with key 'hours' has status 'good'
  - `bad`: Status 'bad'
- **What we found:** `analysis.checklist.find(c => c.key === 'hours').extractedValue` or "Not found"
- **What we were looking for:** Business hours displayed on GBP
- **Why it matters:** "Displaying business hours helps customers plan their visits and reduces inquiries"
- **How to fix:** "Add your business hours to your Google Business Profile"
- **Data Source:** `GET /api/gbp/place-details` → `analysis.checklist[]` (key: 'hours')

#### 3.4 Phone Number
- **Key:** `gbp_phone`
- **Label:** "Phone number"
- **Status Logic:**
  - `good`: `analysis.checklist` item with key 'phone' has status 'good'
  - `bad`: Status 'bad'
- **What we found:** `analysis.checklist.find(c => c.key === 'phone').extractedValue` or "Not found"
- **What we were looking for:** A phone number on GBP
- **Why it matters:** "A visible phone number makes it easy for customers to contact you directly"
- **How to fix:** "Add your business phone number to your Google Business Profile"
- **Data Source:** `GET /api/gbp/place-details` → `analysis.checklist[]` (key: 'phone')

#### 3.5 Price Range
- **Key:** `gbp_price_range`
- **Label:** "Price range"
- **Status Logic:**
  - `good`: `analysis.checklist` item with key 'price_range' has status 'good'
  - `warn`: Status 'warn' (optional but recommended)
  - `bad`: Status 'bad'
- **What we found:** `analysis.checklist.find(c => c.key === 'price_range').extractedValue` or "Not found"
- **What we were looking for:** Price range indicator ($, $$, $$$, $$$$)
- **Why it matters:** "Showing price range sets clear expectations for potential customers"
- **How to fix:** "Add a price range to your Google Business Profile"
- **Data Source:** `GET /api/gbp/place-details` → `analysis.checklist[]` (key: 'price_range')

#### 3.6 Social Media Links
- **Key:** `gbp_social_links`
- **Label:** "Social media links"
- **Status Logic:**
  - `good`: Social links found on website (`crawl_map[].external_links.social.length > 0`) OR GBP has social links (if available via GBP API in future)
  - `warn`: No social links detected
- **What we found:** List of social platforms found: `crawl_map[].external_links.social[]` (Instagram, Facebook, etc.)
- **What we were looking for:** Social media links (Instagram, Facebook) present on website or GBP
- **Why it matters:** "Social media links extend your reach and provide additional ways for customers to engage"
- **How to fix:** "Add links to your social media profiles on your website and Google Business Profile"
- **Data Source:** `POST /api/scan/website` → `crawl_map[].external_links.social[]` (aggregate across all pages)

#### 3.7 Description Keywords
- **Key:** `gbp_desc_keywords`
- **Label:** "Description includes relevant keywords"
- **Status Logic:**
  - `good`: `analysis.keywordChecks.descriptionKeywordMatchPct >= 30`
  - `warn`: `descriptionKeywordMatchPct >= 10` but < 30
  - `bad`: `descriptionKeywordMatchPct < 10` OR description missing
- **What we found:** `analysis.keywordChecks.descriptionKeywordMatchPct` (percentage) + list of matched keywords
- **What we were looking for:** Description should include at least 30% of relevant service keywords
- **Why it matters:** "Relevant keywords in your description improve search engine visibility"
- **How to fix:** "Update your GBP description to naturally include your main service keywords"
- **Data Source:** `GET /api/gbp/place-details` → `analysis.keywordChecks.descriptionKeywordMatchPct`

#### 3.8 Categories Match Keywords
- **Key:** `gbp_categories_keywords`
- **Label:** "Categories match keywords"
- **Status Logic:**
  - `good`: `analysis.keywordChecks.categoryKeywordMatchPct >= 50` OR strong business type in types (restaurant, dentist, etc.)
  - `warn`: Only generic types (point_of_interest, establishment)
  - `bad`: No relevant categories
- **What we found:** `placeDetails.types[]` (list of categories)
- **What we were looking for:** Categories should match your business type (e.g., 'restaurant', 'dentist', 'plumber')
- **Why it matters:** "The categories in your Google Business Profile should match your keywords"
- **How to fix:** "Update your GBP categories to match your primary business type"
- **Data Source:** `GET /api/gbp/place-details` → `placeDetails.types[]`, `analysis.keywordChecks.categoryKeywordMatchPct`

---

### Section 4: Social Presence (0-20 points) - NEW

**Title:** "Build your social media presence"
**Score Display:** "{score}/20"

**Checklist Items:**

#### 4.1 Social Discovery - Instagram
- **Key:** `social_instagram_found`
- **Label:** "Instagram profile found"
- **Status Logic:**
  - `good`: Instagram URL found in `socialLinks[]`
  - `bad`: No Instagram profile found
- **What we found:** `socialLinks.find(l => l.platform === 'instagram').url` or "Not found"
- **What we were looking for:** An Instagram profile URL
- **Why it matters:** "Instagram helps you reach a wider audience and showcase your business visually"
- **How to fix:** "Create an Instagram business profile and add the link to your website"
- **Data Source:** `POST /api/scan/socials` → `socialLinks[]`

#### 4.2 Social Discovery - Facebook
- **Key:** `social_facebook_found`
- **Label:** "Facebook page found"
- **Status Logic:**
  - `good`: Facebook URL found in `socialLinks[]`
  - `bad`: No Facebook page found
- **What we found:** `socialLinks.find(l => l.platform === 'facebook').url` or "Not found"
- **What we were looking for:** A Facebook page URL
- **Why it matters:** "Facebook helps you connect with local customers and build community"
- **How to fix:** "Create a Facebook business page and add the link to your website"
- **Data Source:** `POST /api/scan/socials` → `socialLinks[]`

#### 4.3 Instagram - Profile Completeness
- **Key:** `ig_profile_complete`
- **Label:** "Instagram profile complete"
- **Status Logic:**
  - `good`: `profile.biography` exists AND `profile.website` exists AND `profile.category` exists
  - `warn`: 1-2 of these missing
  - `bad`: All missing OR Instagram not found
- **What we found:** List of present fields: biography (Y/N), website (Y/N), category (Y/N)
- **What we were looking for:** Biography, website link, and category should all be set
- **Why it matters:** "A complete profile helps visitors understand your business and find your website"
- **How to fix:** "Fill out your Instagram bio, add your website link, and set your business category"
- **Data Source:** `POST /api/test/instagram-scrape` → `profile.{ biography, website, category }`

#### 4.4 Instagram - Posting Consistency
- **Key:** `ig_posting_consistency`
- **Label:** "Posting consistency"
- **Status Logic:**
  - `good`: >= 4 posts in last 30 days (>= 1 post/week)
  - `warn`: 1-3 posts in last 30 days
  - `bad`: 0 posts in last 30 days OR Instagram not found
- **What we found:** Count of posts in last 30 days: `posts.filter(p => dateWithin30Days(p.date)).length`
- **What we were looking for:** At least 4 posts in the last 30 days (1 post per week)
- **Why it matters:** "Regular posting keeps your audience engaged and helps you stay top-of-mind"
- **How to fix:** "Aim to post at least once per week to maintain engagement"
- **Data Source:** `POST /api/test/instagram-scrape` → `posts[]` (filter by date)

#### 4.5 Instagram - Engagement Rate
- **Key:** `ig_engagement_rate`
- **Label:** "Engagement rate"
- **Status Logic:**
  - `good`: Engagement rate > 3% (if followers <= 1000) OR > 1% (if followers > 1000)
  - `warn`: Engagement rate 1-3% (if followers <= 1000) OR 0.5-1% (if followers > 1000)
  - `bad`: Engagement rate < 1% (if followers <= 1000) OR < 0.5% (if followers > 1000) OR Instagram not found
- **What we found:** Engagement rate: `(avgLikes + avgComments) / followerCount * 100` (percentage)
- **What we were looking for:** Engagement rate should be > 3% (small accounts) or > 1% (large accounts)
- **Why it matters:** "Higher engagement indicates your content resonates with your audience"
- **How to fix:** "Post more engaging content, use relevant hashtags, and interact with your audience"
- **Data Source:** `POST /api/test/instagram-scrape` → Calculate from `posts[]` (last 12 posts): `avgLikes = sum(likes) / count`, `avgComments = sum(comments) / count`, `followerCount = profile.followerCount`

#### 4.6 Instagram - Recent Activity
- **Key:** `ig_recent_activity`
- **Label:** "Recent activity"
- **Status Logic:**
  - `good`: At least 1 post in last 14 days
  - `warn`: Last post 15-30 days ago
  - `bad`: Last post > 30 days ago OR Instagram not found
- **What we found:** Days since last post: `daysSince(posts[0].date)` (if posts exist)
- **What we were looking for:** At least 1 post in the last 14 days
- **Why it matters:** "Recent activity shows your business is active and engaged"
- **How to fix:** "Post new content at least every 2 weeks to maintain visibility"
- **Data Source:** `POST /api/test/instagram-scrape` → `posts[0].date` (most recent post)

#### 4.7 Facebook - Page Completeness
- **Key:** `fb_page_complete`
- **Label:** "Facebook page complete"
- **Status Logic:**
  - `good`: At least 4 of: description, phone, address, website, hours exist
  - `warn`: 2-3 of these exist
  - `bad`: < 2 exist OR Facebook not found
- **What we found:** List of present fields: description (Y/N), phone (Y/N), address (Y/N), website (Y/N), hours (Y/N)
- **What we were looking for:** Description, phone, address, website, and hours should all be set
- **Why it matters:** "A complete page provides all the information customers need to contact you"
- **How to fix:** "Fill out all sections of your Facebook page, especially contact information and hours"
- **Data Source:** `POST /api/test/facebook-scrape` → `profile.{ description, phone, address, website, hours }`

#### 4.8 Facebook - Posting Consistency
- **Key:** `fb_posting_consistency`
- **Label:** "Posting consistency"
- **Status Logic:**
  - `good`: >= 4 posts in last 30 days (>= 1 post/week)
  - `warn`: 1-3 posts in last 30 days
  - `bad`: 0 posts in last 30 days OR Facebook not found
- **What we found:** Count of posts in last 30 days: `posts.filter(p => dateWithin30Days(p.date)).length`
- **What we were looking for:** At least 4 posts in the last 30 days (1 post per week)
- **Why it matters:** "Regular posting keeps your page active and helps you reach more customers"
- **How to fix:** "Aim to post at least once per week to maintain engagement"
- **Data Source:** `POST /api/test/facebook-scrape` → `posts[]` (filter by date)

#### 4.9 Facebook - Recent Activity
- **Key:** `fb_recent_activity`
- **Label:** "Recent activity"
- **Status Logic:**
  - `good`: At least 1 post in last 14 days
  - `warn`: Last post 15-30 days ago
  - `bad`: Last post > 30 days ago OR Facebook not found
- **What we found:** Days since last post: `daysSince(posts[0].date)` (if posts exist)
- **What we were looking for:** At least 1 post in the last 14 days
- **Why it matters:** "Recent activity shows your business is active and engaged"
- **How to fix:** "Post new content at least every 2 weeks to maintain visibility"
- **Data Source:** `POST /api/test/facebook-scrape` → `posts[0].date` (most recent post)

---

## Generalization Notes

**Restaurant-Specific → Business-Type-Agnostic:**

1. **"Online ordering"** → **"Primary conversion CTA"** (works for any business: "Book Appointment", "Get Quote", "Order Online", etc.)
2. **"Menu page"** → **"Services/Products page"** (for service businesses, this becomes "Services" page)
3. **"Food photos"** → **"Product/Service images"** (generalized to any visual content)
4. **"Reservation system"** → **"Booking/Appointment system"** (works for salons, dentists, etc.)
5. **"Delivery options"** → **"Service options"** (for service businesses, this becomes "Service areas" or "Service types")

**All explanations and helper text should avoid restaurant-specific language:**
- ❌ "Order online"
- ✅ "Book an appointment" / "Get a quote" / "Contact us" (context-dependent)
- ❌ "Menu items"
- ✅ "Services" / "Products" (context-dependent)
- ❌ "Food quality"
- ✅ "Service quality" / "Product quality"

---

## Implementation Checklist

### Must-Have for v1:
- ✅ All 4 sections (Search Results, Website Experience, Local Listings, Social Presence)
- ✅ Left rail with overall score + 4 category scores
- ✅ Top 2 cards (impact + competitors)
- ✅ Search visibility table with expandable rows
- ✅ All checklist items with status, "what we found", "what we were looking for", "why it matters", "how to fix"
- ✅ Fallback behavior for all missing data
- ✅ Business-type-agnostic language

### Nice-to-Have for v2:
- ⏳ Impact estimation refinement (more sophisticated model)
- ⏳ Competitor comparison charts/graphs
- ⏳ Historical trend tracking (if we add database)
- ⏳ Export PDF functionality
- ⏳ Email report delivery
- ⏳ Action item prioritization (AI-suggested fixes)
- ⏳ A/B test suggestions for CTAs
- ⏳ Social media content suggestions
