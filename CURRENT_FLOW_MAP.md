# Current Flow Map: Business Selection → Analysis → Report

## Entry Point: Business Selection

**Location:** `components/landing/BusinessSearch.tsx`
- **Route:** `/` (homepage)
- **Component:** `BusinessSearch`
- **User Action:** User types business name → selects from Google Places Autocomplete dropdown

**API Call (Autocomplete):**
- **Endpoint:** `GET /api/places/autocomplete?input={query}`
- **Implementation:** `app/api/places/autocomplete/route.ts`
- **Response:** `{ predictions: Array<{ place_id, description, main_text, secondary_text }> }`
- **Storage:** React state only (no persistence)

**On Selection (`handleSelect` function, line 81):**
1. Generates `scanId` via `generateScanId()` (timestamp + random, 12 chars)
2. Navigates to: `/report/${scanId}?placeId={place_id}&name={primary_text}&addr={secondary_text}`
3. **No API calls triggered yet** - navigation happens immediately

---

## Stage 1: Report Page Load (`/report/[scanId]`)

**Location:** `app/report/[scanId]/page.tsx`
- **Component:** `ReportScanClient` (client component)
- **Props:** `scanId`, `placeId`, `name`, `addr` (from URL params)

**Immediate Actions (on mount, `useEffect` line 62):**

### 1. Fetch Place Details
- **Endpoint:** `GET /api/places/details?placeId={placeId}`
- **Implementation:** `app/api/places/details/route.ts`
- **Response:** `{ website, formatted_address, rating, user_ratings_total, ... }`
- **Storage:** React state (`placeDetails`)
- **Purpose:** Get website URL for subsequent steps

### 2. Capture Website Screenshot (Immediate)
- **Endpoint:** `POST /api/scan/socials/screenshot`
- **Body:** `{ platform: 'website', url: websiteUrl, viewport: 'desktop' }`
- **Storage:** React state (`onlinePresenceData.websiteScreenshot`)
- **Purpose:** Fast visual preview for Stage 4

### 3. Trigger Social Links Scraper (Background)
- **Endpoint:** `POST /api/scan/socials`
- **Body:** `{ businessName, address, scanId, websiteUrl }`
- **Implementation:** `app/api/scan/socials/route.ts`
- **Orchestration:**
  - **Step 1:** Extract social links from website (`extractSocialLinksFromWebsite`)
    - Uses Playwright to visit website
    - Scans for `a[href*="instagram.com"]` and `a[href*="facebook.com"]`
    - Checks footer/header areas
  - **Step 2:** If missing platforms, use Google CSE API (`extractSocialLinksFromGBP`)
    - Searches Google for `"[businessName] [address]"`
    - Extracts links from GBP knowledge panel
  - **Step 3:** Capture screenshots in parallel for all found social links
    - Calls `/api/scan/socials/screenshot` for each platform
- **Response:** `{ websiteUrl, websiteScreenshot, socialLinks: [{ platform, url, screenshot }] }`
- **Storage:**
  - React state (`onlinePresenceData`)
  - localStorage: `onlinePresence_${scanId}` (metadata only, no base64)
  - In-memory cache: `scraperCache` Map (key: `scanId`, status: 'running'|'completed')
- **Caching:** Prevents duplicate execution via `scraperCache` Map (1-hour TTL)

---

## Stage 2: Analyzer Orchestration (Background, Parallel)

**Location:** `components/report/ReportScanClient.tsx` (line 254)

**Trigger:** `useEffect` watches `placeId`, `placeDetails`, `onlinePresenceData`

### Analyzer 1: GBP Analyzer (Immediate)
- **Trigger:** As soon as `placeId` is available
- **Endpoint:** `GET /api/gbp/place-details?place_id={placeId}`
- **Implementation:** `app/api/gbp/place-details/route.ts`
- **Response:** `{ placeDetails: {...}, analysis: { businessName, rating, reviews, checklist: [...] } }`
- **Storage:** localStorage: `analysis_${scanId}_gbp`
- **Status Tracking:** `analyzersComplete.gbp = true` when done

### Analyzer 2: Website Crawler (When website URL found)
- **Trigger:** When `placeDetails.website` OR `onlinePresenceData.websiteUrl` is available
- **Endpoint:** `POST /api/scan/website`
- **Body:** `{ url: websiteUrl, maxDepth: 2, maxPages: 10 }`
- **Implementation:** `app/api/scan/website/route.ts`
- **Orchestration:**
  1. Crawls website (Playwright, up to 10 pages, depth 2)
  2. Extracts page data (SEO, content, images, forms, etc.)
  3. Resolves business identity (`resolveBusinessIdentity`)
  4. Runs search visibility analysis (`getSearchVisibility`)
  5. Runs competitor analysis (`getCompetitorSnapshot`)
- **Response:** `ScrapeResult` with:
  - `scrape_metadata`, `site_overview`, `crawl_map`, `summary_metrics`
  - `business_identity`, `search_visibility`, `competitors_snapshot`
- **Storage:** localStorage: `analysis_${scanId}_website`
- **Status Tracking:** `analyzersComplete.website = true` when done

### Analyzer 3: Instagram Scraper (When Instagram URL found)
- **Trigger:** When `onlinePresenceData.socialLinks` contains Instagram link
- **Endpoint:** `POST /api/test/instagram-scrape`
- **Body:** `{ username: extractedUsername }`
- **Implementation:** `app/api/test/instagram-scrape/route.ts`
- **Response:** `{ profile: {...}, posts: [...], ... }`
- **Storage:** localStorage: `analysis_${scanId}_instagram`
- **Status Tracking:** `analyzersComplete.instagram = true` when done
- **Parallel Execution:** Runs in parallel with Facebook scraper (via dedicated `useEffect` line 446)

### Analyzer 4: Facebook Scraper (When Facebook URL found)
- **Trigger:** When `onlinePresenceData.socialLinks` contains Facebook link
- **Endpoint:** `POST /api/test/facebook-scrape`
- **Body:** `{ username: extractedUsername }`
- **Implementation:** `app/api/test/facebook-scrape/route.ts`
- **Response:** `{ profile: {...}, posts: [...], ... }`
- **Storage:** localStorage: `analysis_${scanId}_facebook`
- **Status Tracking:** `analyzersComplete.facebook = true` when done
- **Parallel Execution:** Runs in parallel with Instagram scraper

---

## Stage 3: Onboarding UI Stages

**Location:** `components/report/ReportScanClient.tsx`

**Stages (sequential, controlled by `currentStep` state):**
1. **Stage 0:** Competitor Map (`StageCompetitorMap`)
2. **Stage 1:** Google Business Profile (`StageGoogleBusinessProfile`)
3. **Stage 2:** Review Sentiment (`StageReviewSentiment`)
4. **Stage 3:** Photo Collage (`StagePhotoCollage`)
5. **Stage 4:** Online Presence (`StageOnlinePresence`)
   - Displays website + social screenshots
   - Waits for all analyzers to complete
   - Auto-progresses after 5 seconds (if all screenshots ready)

**Navigation Logic (line 520):**
- When `currentStep === 4` AND `allAnalyzersComplete === true`:
  - Navigate to `/report/${scanId}/analysis`

---

## Stage 4: Analysis Page (`/report/[scanId]/analysis`)

**Location:** `app/report/[scanId]/analysis/page.tsx`

**On Load (`useEffect` line 553):**

### Data Loading Strategy:
1. **Load from localStorage cache:**
   - `analysis_${scanId}_gbp` → `gbpAnalysis`
   - `analysis_${scanId}_website` → `websiteResult`
   - `analysis_${scanId}_instagram` → `igResult`
   - `analysis_${scanId}_facebook` → `fbResult`
   - `onlinePresence_${scanId}` → Extract social usernames

2. **Fallback API calls (only if cache miss):**
   - GBP: `GET /api/gbp/place-details?place_id={placeId}`
   - Website: `POST /api/scan/website` (if website URL found)
   - Instagram: `POST /api/test/instagram-scrape` (if username found)
   - Facebook: `POST /api/test/facebook-scrape` (if username found)

3. **Reviews Fetch:**
   - `GET /api/places/reviews?placeId={placeId}&all=true`
   - Storage: localStorage: `analysis_${scanId}_reviews`

**UI Sections:**
- **Website Scraper & SEO Analyzer:** Full crawl results, business identity, search visibility, competitors
- **Instagram Scraper Test:** Profile + posts analysis
- **Facebook Scraper Test:** Profile + posts analysis
- **Google Business Profile Analyzer:** Checklist + reviews

---

## Data Persistence & Caching

### Client-Side (localStorage):
- **Keys:**
  - `onlinePresence_${scanId}` - Metadata (website URL, social links, completion flags)
  - `analysis_${scanId}_gbp` - Full GBP analysis JSON
  - `analysis_${scanId}_website` - Full website crawl JSON
  - `analysis_${scanId}_instagram` - Full Instagram scrape JSON
  - `analysis_${scanId}_facebook` - Full Facebook scrape JSON
  - `analysis_${scanId}_reviews` - All reviews JSON
- **TTL:** None (persists until browser clear)
- **Size Limit:** No base64 screenshots stored (too large)

### Server-Side (In-Memory):
- **Location:** `app/api/scan/socials/route.ts` (line 105)
- **Cache:** `scraperCache` Map
- **Key:** `scanId`
- **Value:** `{ status: 'running'|'completed', result?, promise?, partialResult? }`
- **TTL:** 1 hour (auto-cleanup)
- **Purpose:** Prevent duplicate scraper executions

### Server-Side (Next.js HTTP Cache):
- **Location:** `app/api/gbp/place-details/route.ts` (line 88)
- **Cache:** `next: { revalidate: 3600 }` (1 hour)
- **Purpose:** Reduce Google Places API calls

### Database:
- **Status:** ❌ **NO DATABASE USAGE FOUND**
- **Note:** Supabase env vars exist but are not used
- **All data is:** localStorage (client) + in-memory Map (server) + Next.js HTTP cache

---

## Orchestration Model

**Type:** **Client-Side Orchestration (React useEffect hooks)**

**Execution Model:**
- **Synchronous:** ❌ No
- **Async/Job Queue:** ❌ No
- **Polling:** ✅ Yes (for social links, 1-second interval)
- **Status Tracking:** ✅ Yes (React state: `analyzersComplete`)

**Status Values:**
- `analyzersComplete.gbp: boolean`
- `analyzersComplete.website: boolean`
- `analyzersComplete.instagram: boolean`
- `analyzersComplete.facebook: boolean`
- `allAnalyzersComplete: boolean` (computed from above)

**Execution Order:**
1. GBP analyzer starts immediately (when `placeId` available)
2. Website crawler starts when website URL found
3. Social scrapers start when social links found (parallel)
4. All run in background, results cached in localStorage
5. Analysis page reads from cache (no re-execution)

**No Queue/Worker:**
- All analyzers run as client-side API calls
- No background jobs, no Supabase functions, no cron

---

## Social Profile Discovery

**Method:** **Multi-Step Fallback Chain**

### Step 1: Extract from Website (Primary)
- **Function:** `extractSocialLinksFromWebsite` (`app/api/scan/socials/route.ts` line 253)
- **Process:**
  1. Launch Playwright browser
  2. Navigate to business website
  3. Query: `a[href*="instagram.com"]`, `a[href*="facebook.com"]`
  4. Also check footer/header areas
- **Output:** `Array<{ platform: 'instagram'|'facebook', url: string }>`

### Step 2: Extract from GBP Knowledge Panel (Fallback)
- **Function:** `extractSocialLinksFromGBP` (`app/api/scan/socials/route.ts` line 412)
- **Process:**
  1. Launch Playwright browser
  2. Navigate to Google search: `"[businessName] [address]"`
  3. Locate GBP knowledge panel (right side)
  4. Extract links from "Profiles" section
  5. Extract website URL
- **Output:** `{ socialLinks: [...], websiteUrl: string | null }`

### Step 3: Google CSE API (If GBP scraping fails)
- **Function:** Uses Google Programmable Search Engine
- **Process:** Search for `"[businessName] [address] instagram"` or `"[businessName] [address] facebook"`
- **Output:** Social profile URLs from search results

**Failure Cases:**
- **Missing socials:** Analyzers marked complete, no error (graceful degradation)
- **Multiple candidates:** First match used (no deduplication logic found)
- **CAPTCHA:** Error logged, fallback to CSE API

---

## API Endpoints Summary

### ✅ Confirmed Endpoints:

1. **`GET /api/places/autocomplete`**
   - **File:** `app/api/places/autocomplete/route.ts`
   - **Used in:** `BusinessSearch.tsx` (line 32)
   - **Response:** `{ predictions: Array<{ place_id, description, main_text, secondary_text }> }`

2. **`GET /api/places/details`**
   - **File:** `app/api/places/details/route.ts`
   - **Used in:** `ReportScanClient.tsx` (line 138, 168, 300)
   - **Response:** `{ website, formatted_address, rating, user_ratings_total, ... }`

3. **`GET /api/gbp/place-details`**
   - **File:** `app/api/gbp/place-details/route.ts`
   - **Used in:** `ReportScanClient.tsx` (line 273), `analysis/page.tsx` (line 655)
   - **Response:** `{ placeDetails: {...}, analysis: { checklist, ... } }`

4. **`POST /api/scan/socials`**
   - **File:** `app/api/scan/socials/route.ts`
   - **Used in:** `ReportScanClient.tsx` (line 179)
   - **Response:** `{ websiteUrl, websiteScreenshot, socialLinks: [...] }`

5. **`POST /api/scan/socials/screenshot`**
   - **File:** `app/api/scan/socials/screenshot/route.ts`
   - **Used in:** `ReportScanClient.tsx` (line 83), internal calls from `/api/scan/socials`
   - **Response:** `{ success: boolean, screenshot: string | null }`

6. **`POST /api/scan/website`**
   - **File:** `app/api/scan/website/route.ts`
   - **Used in:** `ReportScanClient.tsx` (line 332), `analysis/page.tsx` (line 698)
   - **Response:** `ScrapeResult` (includes `business_identity`, `search_visibility`, `competitors_snapshot`)

7. **`POST /api/test/instagram-scrape`**
   - **File:** `app/api/test/instagram-scrape/route.ts`
   - **Used in:** `ReportScanClient.tsx` (line 468), `analysis/page.tsx` (line 716)
   - **Response:** `{ profile: {...}, posts: [...] }`

8. **`POST /api/test/facebook-scrape`**
   - **File:** `app/api/test/facebook-scrape/route.ts`
   - **Used in:** `ReportScanClient.tsx` (line 504), `analysis/page.tsx` (line 734)
   - **Response:** `{ profile: {...}, posts: [...] }`

9. **`GET /api/places/reviews`**
   - **File:** `app/api/places/reviews/route.ts`
   - **Used in:** `analysis/page.tsx` (line 680)
   - **Response:** `{ reviews: Array<NormalizedReview> }`

### ❌ Missing/Not Found:
- **Search Visibility API:** ❌ No standalone endpoint (integrated into `/api/scan/website`)
- **Competitors API:** ❌ No standalone endpoint (integrated into `/api/scan/website`)

---

## Report Schema (Implied by UI)

**Location:** `app/report/[scanId]/analysis/page.tsx`

### Expected Sections:

1. **Website Scraper & SEO Analyzer**
   - `WebsiteScrapeResult` interface (line 304)
   - Fields: `scrape_metadata`, `site_overview`, `crawl_map`, `summary_metrics`, `site_report_summary`
   - **NEW:** `business_identity`, `search_visibility`, `competitors_snapshot`

2. **Instagram Scraper Test**
   - Profile data, posts array, engagement metrics

3. **Facebook Scraper Test**
   - Profile data, posts array, engagement metrics

4. **Google Business Profile Analyzer**
   - `GbpAnalysis` interface
   - Fields: `businessName`, `rating`, `reviews`, `checklist: Array<ChecklistItem>`
   - Reviews section (all reviews, not just 5)

### Defaults When Data Missing:
- **No website:** Website section shows error/empty state
- **No socials:** Social sections show "Not found" or skip
- **No GBP:** GBP section shows error/empty state
- **No search visibility:** Shows empty queries array, score 0
- **No competitors:** Shows empty competitors array

---

## Key Findings & Assumptions

### ✅ What Works:
1. **Client-side orchestration** via React `useEffect` hooks
2. **Parallel execution** of Instagram + Facebook scrapers
3. **localStorage caching** prevents re-execution on analysis page
4. **In-memory server cache** prevents duplicate scraper runs
5. **Graceful degradation** when data missing

### ⚠️ Assumptions/TODOs:
1. **No database persistence** - all data is ephemeral (localStorage + in-memory)
2. **No status API** - status tracked in React state only
3. **No retry logic** - if API fails, user must refresh
4. **No queue system** - all analyzers run as client-side API calls
5. **Social discovery fallback** - uses Google CSE if website/GBP scraping fails
6. **Stage 1 competitors** - mentioned in website crawler but not clearly sourced from onboarding

### 🔍 Unknowns:
1. **How Stage 1 competitors are passed to website crawler** - code references `stage1Competitors` but source unclear
2. **Scan ID uniqueness** - `generateScanId()` uses timestamp + random, no collision detection
3. **localStorage quota** - no handling for quota exceeded errors (only try/catch)
4. **Vercel serverless timeout** - website crawler may timeout on large sites (60s timeout set)

---

## File Paths Reference

- **Entry:** `components/landing/BusinessSearch.tsx`
- **Onboarding:** `app/report/[scanId]/page.tsx` → `components/report/ReportScanClient.tsx`
- **Analysis:** `app/report/[scanId]/analysis/page.tsx`
- **APIs:**
  - `app/api/places/autocomplete/route.ts`
  - `app/api/places/details/route.ts`
  - `app/api/gbp/place-details/route.ts`
  - `app/api/scan/socials/route.ts`
  - `app/api/scan/socials/screenshot/route.ts`
  - `app/api/scan/website/route.ts`
  - `app/api/test/instagram-scrape/route.ts`
  - `app/api/test/facebook-scrape/route.ts`
  - `app/api/places/reviews/route.ts`
- **Libraries:**
  - `lib/business/resolveBusinessIdentity.ts`
  - `lib/seo/searchVisibility.ts`
  - `lib/seo/competitors.ts`
  - `lib/gbp/analyzeGbp.ts`
  - `lib/report/generateScanId.ts`
