# Antistatic Codebase - Delivery Audit Report

**Date:** 2025-01-11  
**Purpose:** Extract accurate "what was built + how hard it was" snapshot for estimating new URL scanning, ad generation, integrations, and dashboards product.

---

## 1. SYSTEM MAP

### Frontend Framework & Architecture
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** TailwindCSS
- **Runtime:** Node.js (forced for Playwright compatibility)
- **Deployment:** Vercel (serverless functions)

### Key Routes/Pages

#### Public Pages
- `/` - Landing page with Google Places autocomplete
- `/report/[scanId]` - Multi-stage report viewer (dynamic route)
- `/privacy` - Privacy policy
- `/terms` - Terms of service
- `/data-deletion` - Data deletion instructions
- `/test-instagram-scraper` - Test page for Instagram scraping
- `/test-social-scraper` - Test page for social scraper

#### Report Stages (within `/report/[scanId]`)
1. **Stage 0:** Competitor Map Analysis (`StageCompetitorMap.tsx`)
2. **Stage 1:** Google Business Profile (`StageGoogleBusinessProfile.tsx`)
3. **Stage 2:** Review Sentiment Analysis (`StageReviewSentiment.tsx`)
4. **Stage 3:** Photo Quality & Quantity (`StagePhotoCollage.tsx`)
5. **Stage 4:** Online Presence Analysis (`StageOnlinePresence.tsx`)

### Backend/API Routes

#### Google Places API Proxies (`/app/api/places/`)
- `GET /api/places/autocomplete` - Business search suggestions
- `GET /api/places/details` - Full business details (rating, photos, website, etc.)
- `GET /api/places/competitors` - Competitor discovery with strict filtering
- `GET /api/places/reviews` - Review fetching with variety selection
- `GET /api/places/photos` - Photo reference list
- `GET /api/places/photo` - Photo image streaming (with caching)
- `GET /api/places/static-map` - Static map image generation

#### Social Media Scraping (`/app/api/scan/`)
- `POST /api/scan/socials` - Main orchestrator: extracts social links, triggers screenshots
- `POST /api/scan/socials/screenshot` - Screenshot capture for Instagram/Facebook/websites

#### Test Routes (`/app/api/test/`)
- `POST /api/test/instagram-scrape` - Full Instagram profile + posts scraping (test endpoint)

### Supabase Schema Touchpoints

**Note:** Supabase is mentioned in privacy policy and environment variables, but **NO actual database usage found in codebase**. All data is:
- Cached in-memory (Map-based cache for scraper results)
- Stored in localStorage (client-side, metadata only)
- Cached via Next.js `next: { revalidate }` (server-side HTTP cache)

**Environment Variables Reference:**
- `NEXT_PUBLIC_SUPABASE_URL` - Referenced but not used
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Referenced but not used

**Actual Caching Strategy:**
- In-memory Map cache: `scraperCache` in `/app/api/scan/socials/route.ts` (line 105)
- Next.js fetch cache: `next: { revalidate: 3600 }` for Google Places API
- localStorage: Metadata only (not base64 screenshots - too large)

### External Integrations

#### 1. Google Business Profile / Google Places API
**Location:** `app/api/places/*/route.ts`
- **Usage:** Business search, details, competitors, reviews, photos, static maps
- **Authentication:** API key via `GOOGLE_PLACES_API_KEY`
- **Rate Limits:** Handled via Next.js caching (1 hour revalidation)
- **Complexity:** Medium - Multiple endpoints, pagination handling, strict filtering

#### 2. Meta Graph API / Instagram
**Location:** `app/api/scan/socials/screenshot/route.ts` (lines 46-119, 1954-2503)
- **Usage:** Instagram profile screenshot capture
- **Authentication:** Session cookies (`INSTAGRAM_SESSION_ID`, `INSTAGRAM_CSRF_TOKEN`, `INSTAGRAM_DS_USER_ID`)
- **Method:** Browser automation (Playwright) - **NO direct API calls**
- **Fallback:** Google CSE API bypass when session fails
- **Complexity:** **VERY HIGH** - Session management, state detection, CAPTCHA handling, fallback chains

#### 3. Google Custom Search Engine (CSE) API
**Location:** `app/api/scan/socials/route.ts` (lines 1387-1517), `app/api/scan/socials/screenshot/route.ts` (lines 2066-2198)
- **Usage:** Fallback for finding Instagram profiles when session fails
- **Authentication:** API key + CX via `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_CX`
- **Complexity:** Medium - Used as bypass mechanism, requires URL extraction logic

#### 4. Apify Actors
**Status:** **NOT FOUND** - No Apify integration in codebase

#### 5. Email / SMS Sending
**Status:** **NOT IMPLEMENTED** - Only referenced in privacy policy:
- `app/privacy/page.tsx` mentions "AWS SES" (email) and "AWS SNS" (SMS) as subprocessors
- **No actual implementation found** - likely planned but not built

#### 6. Playwright / Browser Automation
**Location:** `app/api/scan/socials/route.ts`, `app/api/scan/socials/screenshot/route.ts`
- **Usage:** Website scraping, social media screenshot capture
- **Packages:** `playwright-core`, `@sparticuz/chromium` (serverless-compatible)
- **Complexity:** **VERY HIGH** - Stealth scripts, viewport emulation, session injection, CAPTCHA detection

---

## 2. THE 7 MOST COMPLEX/TIME-CONSUMING AREAS

### 1. Instagram Screenshot Capture with Session Management
**Files:**
- `app/api/scan/socials/screenshot/route.ts` (2,887 lines)
- `app/api/scan/socials/route.ts` (lines 167-242)

**What it does:**
- Captures screenshots of Instagram profiles using browser automation
- Handles authenticated access via session cookie injection
- Detects and handles session expiration, CAPTCHAs, and challenge pages
- Falls back to Google CSE API when session fails

**Why it's complex:**
- **Session Management:** Manual cookie injection, state detection (PROFILE/LOGIN/CHALLENGE/UNKNOWN), no automatic renewal
- **Rate Limits:** Instagram blocks automated access aggressively
- **CAPTCHA Detection:** Multiple detection methods (URL patterns, DOM selectors, iframe detection)
- **Fallback Chains:** Session → Challenge dismissal → Google CSE → Error with debug screenshot
- **Stealth Requirements:** Comprehensive anti-detection scripts (WebGL fingerprinting, navigator properties, user agent rotation)
- **Viewport Emulation:** Different handling for mobile vs desktop (Instagram uses proper mobile emulation, Facebook doesn't)
- **Error Handling:** Multiple failure modes, debug screenshots on error, partial result updates

**Reliability Patterns:**
- ✅ Session cookie injection before navigation
- ✅ State-based validation via `classifyInstagramPageState()`
- ✅ Google CSE bypass fallback
- ❌ No automatic retry on session expiration
- ❌ No exponential backoff
- ❌ Manual credential renewal required (see `INSTAGRAM_SESSION_AUDIT.md`)

**Time Driver:** Instagram's aggressive bot detection, session expiration handling, multiple fallback mechanisms, stealth script maintenance

---

### 2. Competitor Discovery with Strict Filtering
**Files:**
- `app/api/places/competitors/route.ts` (592 lines)
- `components/report/StageCompetitorMap.tsx` (602 lines)

**What it does:**
- Finds 3-10 competitors using strict category matching
- Progressive radius expansion (1.5km → 3km → 5km → 10km → 20km)
- Filters by business type families (restaurant → restaurants/cafes/bars, cinema → cinemas only)
- Excludes broad container types (malls, schools) unless target is one
- Sequential pin drop animation on map

**Why it's complex:**
- **Category Matching:** Complex type family system (CATEGORY_FAMILIES mapping), generic type filtering
- **Radius-Fill Algorithm:** Multiple API calls with 2-second delays (Google requirement for pagination)
- **Data Normalization:** Primary type extraction, distance calculation, ranking by rating + distance
- **UI State Management:** Sequential animations, throttled map bounds updates, typing effects
- **Filtering Logic:** Multiple removal reasons tracked (isTarget, missingName, primaryTypeNotInFamily, broadTypeExcluded)

**Reliability Patterns:**
- ✅ Next.js fetch cache (300s revalidation for pagination)
- ✅ 2-second delay between pagination requests (Google requirement)
- ✅ Error handling with detailed removal reasons
- ✅ Fallback to broader search if insufficient results

**Time Driver:** Complex filtering logic, multiple API calls with delays, category family mapping, UI animation coordination

---

### 3. Social Link Extraction from Websites
**Files:**
- `app/api/scan/socials/route.ts` (lines 253-393)

**What it does:**
- Extracts social media links (Instagram, Facebook) from business websites
- Uses Playwright to navigate and scrape HTML
- Falls back to Google CSE API if links not found on website
- Cleans and deduplicates results

**Why it's complex:**
- **CAPTCHA Detection:** Multiple detection methods, fast-fail on CAPTCHA
- **Human-like Behavior:** Random delays, mouse movements, scrolling simulation
- **Link Extraction:** Multiple selector strategies (footer, header, common patterns), fallback selectors
- **Error Handling:** Navigation failures (http vs https), timeout handling, CAPTCHA errors
- **Data Normalization:** URL cleaning, platform detection, deduplication

**Reliability Patterns:**
- ✅ CAPTCHA detection with fast-fail (`CaptchaDetectedError`)
- ✅ Human-like delays and mouse movements
- ✅ Fallback to Google CSE if website scraping fails
- ✅ Timeout handling (30s navigation, 15s action)
- ❌ No retry logic (fails fast on CAPTCHA)

**Time Driver:** CAPTCHA handling, multiple extraction strategies, human-like behavior simulation, error recovery

---

### 4. Multi-Stage Report UI with State Management
**Files:**
- `components/report/ReportScanClient.tsx` (428 lines)
- `components/report/StageOnlinePresence.tsx` (634 lines)

**What it does:**
- Manages 5-stage report progression with manual navigation
- Triggers background scraping on page load
- Handles partial result updates (incremental screenshot completion)
- Manages localStorage + React state for data persistence across refreshes

**Why it's complex:**
- **State Synchronization:** React state + localStorage + API cache coordination
- **Background Processing:** Scraper triggered on mount, results available when user reaches stage 4
- **Partial Updates:** Incremental screenshot completion, partial result polling
- **Cache Invalidation:** Serverless cold starts clear in-memory cache, fallback to localStorage
- **Error Recovery:** Fallback UI when screenshots fail, retry mechanisms

**Reliability Patterns:**
- ✅ In-memory cache with 1-hour TTL
- ✅ localStorage for metadata (not base64 - too large)
- ✅ Partial result polling (3-second intervals)
- ✅ Fallback to API if localStorage missing
- ✅ Duplicate execution prevention (refs)

**Time Driver:** Complex state management, serverless cache volatility, partial result handling, error recovery

---

### 5. Google Places API Integration & Caching
**Files:**
- `app/api/places/details/route.ts`
- `app/api/places/reviews/route.ts`
- `app/api/places/photos/route.ts`
- `app/api/places/photo/route.ts`
- `app/api/places/static-map/route.ts`

**What it does:**
- Proxies all Google Places API calls server-side
- Handles field selection, response normalization
- Implements caching to reduce quota usage
- Streams photo images with CDN-friendly headers

**Why it's complex:**
- **Field Selection:** Optimized field requests to minimize API costs
- **Caching Strategy:** Different TTLs (1 hour for details, 1 week for photos)
- **Response Normalization:** Type extraction, primary type filtering, generic type exclusion
- **Error Handling:** Status code handling (OK, ZERO_RESULTS, error_message)
- **Photo Streaming:** Blob handling, content-type detection, CDN cache headers

**Reliability Patterns:**
- ✅ Next.js fetch cache (`next: { revalidate }`)
- ✅ CDN-friendly cache headers for photos
- ✅ Error message propagation
- ❌ No retry logic (relies on Next.js caching)

**Time Driver:** API quota management, caching strategy, response normalization, error handling

---

### 6. Review Sentiment Analysis & Variety Selection
**Files:**
- `app/api/places/reviews/route.ts` (lines 18-128)
- `components/report/StageReviewSentiment.tsx`

**What it does:**
- Fetches reviews from Google Places API
- Selects variety of reviews (5-star, 4-star, 3-star, 2-star, 1-star) for balanced display
- Normalizes review data (author, text, rating, time)
- Displays with sentiment visualization

**Why it's complex:**
- **Variety Selection Algorithm:** Buckets reviews by rating, selects balanced mix
- **Data Normalization:** Time parsing, author name extraction, text cleaning
- **UI State:** Loading states, error handling, avatar fallbacks
- **Review Limits:** Google typically returns 5 reviews max, algorithm handles edge cases

**Reliability Patterns:**
- ✅ Next.js fetch cache (1 hour)
- ✅ Fallback to initials if avatar fails
- ✅ Error handling for missing reviews
- ❌ No retry logic

**Time Driver:** Variety selection algorithm, data normalization, UI error handling

---

### 7. Photo Collage with Progressive Loading
**Files:**
- `app/api/places/photos/route.ts`
- `components/report/StagePhotoCollage.tsx`

**What it does:**
- Fetches photo references from Google Places API
- Displays photos in animated collage
- Progressive loading with staggered reveals
- Handles photo loading errors gracefully

**Why it's complex:**
- **Progressive Loading:** Staggered photo reveals, loading state management
- **Error Handling:** Individual photo failures don't break entire collage
- **Animation Coordination:** Timing for reveal animations, completion detection
- **Photo API:** Separate endpoint for photo streaming with caching

**Reliability Patterns:**
- ✅ Individual photo error handling (fallback to next photo)
- ✅ Next.js fetch cache (1 hour for photo list, 1 week for images)
- ✅ CDN-friendly cache headers
- ❌ No retry logic for failed photos

**Time Driver:** Animation coordination, progressive loading, error handling per photo

---

## 3. DELIVERY EVIDENCE

### Quick Patches & Workarounds

#### 1. Vercel Deployment Protection Bypass
**Location:** `app/api/scan/socials/route.ts` (lines 122-149)
**Evidence:**
```typescript
function buildProtectedVercelRequest(baseUrl: string, path: string): { url: string; headers: Record<string, string> } {
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  // Add BOTH query params AND header (belt + braces approach)
  url += `${separator}x-vercel-protection-bypass=${encodeURIComponent(bypassSecret)}&x-vercel-set-bypass-cookie=true`;
  headers['x-vercel-protection-bypass'] = bypassSecret;
}
```
**Indicates:** Real-world pain with Vercel's deployment protection blocking internal API calls. "Belt + braces" comment shows multiple attempts to fix.

#### 2. In-Memory Cache for Duplicate Prevention
**Location:** `app/api/scan/socials/route.ts` (lines 102-105, 1558-1586)
**Evidence:**
```typescript
const scraperCache = new Map<string, { status: 'running' | 'completed', result?: any, promise?: Promise<any>, partialResult?: any }>();
// CRITICAL: Prevent duplicate execution using in-memory cache
if (scanId) {
  const cached = scraperCache.get(scanId);
  // ... complex logic to handle running/completed states
}
```
**Indicates:** Serverless cold starts causing duplicate executions. In-memory cache is volatile but necessary workaround.

#### 3. Partial Result Updates
**Location:** `app/api/scan/socials/route.ts` (lines 1656-1674, 1771-1778)
**Evidence:**
```typescript
// Initialize partial result in cache before starting screenshots
// This allows frontend to poll and get incremental updates
if (scanId) {
  const initialPartialResult = { ... };
  scraperCache.set(scanId, { ...cached, partialResult: initialPartialResult });
}
// Update partial result after website screenshot completes
updatePartialResult();
```
**Indicates:** Long-running screenshot operations require incremental updates. Frontend polls for partial results.

#### 4. localStorage + React State Coordination
**Location:** `components/report/ReportScanClient.tsx` (lines 198-216), `components/report/StageOnlinePresence.tsx` (lines 74-196)
**Evidence:**
```typescript
// Store metadata to localStorage (NOT the actual base64 data - too large)
const dataToStore = { websiteUrl, hasWebsiteScreenshot, socialLinks: [...], timestamp, completed, screenshotsReady };
localStorage.setItem(`onlinePresence_${scanId}`, JSON.stringify(dataToStore));
// FALLBACK: If we have URL but no screenshot (cache cleared), capture it directly
```
**Indicates:** Serverless cache volatility requires client-side persistence. Multiple fallback layers.

#### 5. Google CSE Bypass for Instagram
**Location:** `app/api/scan/socials/screenshot/route.ts` (lines 2046-2198, 2261-2464)
**Evidence:**
```typescript
// STEP 3: Use Google CSE API to find missing platforms
// This avoids CAPTCHAs and rate limiting from Google
const searchQuery = `site:instagram.com "${username}"`;
// ... complex URL extraction and matching logic
```
**Indicates:** Instagram session expiration is common. Google CSE used as fallback to find profiles when session fails.

#### 6. CAPTCHA Detection with Fast-Fail
**Location:** `app/api/scan/socials/route.ts` (lines 66-100)
**Evidence:**
```typescript
async function throwIfCaptcha(page: Page, stage: string): Promise<void> {
  // Fast selector/text checks (do not wait long; we only want to detect and fail fast)
  const checks: Array<Promise<boolean>> = [
    page.locator("form#captcha-form").first().isVisible({ timeout: 750 }).catch(() => false),
    page.locator("iframe[src*=\"recaptcha\"]").first().isVisible({ timeout: 750 }).catch(() => false),
    // ...
  ];
  if (results.some(Boolean)) {
    throw new CaptchaDetectedError(`[${stage}] CAPTCHA/bot-check detected`);
  }
}
```
**Indicates:** CAPTCHAs are frequent. Fast-fail prevents hanging. No retry logic - fails immediately.

#### 7. Instagram Session State Classification
**Location:** `app/api/scan/socials/screenshot/route.ts` (lines 507-709)
**Evidence:**
```typescript
function classifyInstagramPageState(url: string, targetUsername?: string): InstagramPageState {
  // Complex URL pattern matching for PROFILE/LOGIN/CHALLENGE/UNKNOWN states
  if (url.includes('/accounts/login')) return 'LOGIN';
  if (url.includes('/challenge') || url.includes('/checkpoint')) return 'CHALLENGE';
  // ...
}
```
**Indicates:** Instagram blocking is sophisticated. Multiple states require different handling. No automatic renewal.

#### 8. Retry Logic Removal on Error
**Location:** `app/api/scan/socials/route.ts` (lines 1579-1582)
**Evidence:**
```typescript
// If the running scraper failed, remove from cache and allow retry
scraperCache.delete(scanId);
throw error;
```
**Indicates:** Errors require cache cleanup to allow manual retry. No automatic retry - manual intervention needed.

#### 9. Throttled Map Bounds Updates
**Location:** `components/report/StageCompetitorMap.tsx` (lines 74-82, 266-281)
**Evidence:**
```typescript
// Throttled fitBounds to prevent jitter
if (fitBoundsCounterRef.current >= 2) {
  applyFitBounds(mapInstance, boundsRef.current);
  fitBoundsCounterRef.current = 0;
}
```
**Indicates:** Map jitter from frequent bounds updates. Throttling required for smooth UX.

#### 10. Google Places Pagination Delay
**Location:** `app/api/places/competitors/route.ts` (lines 225-228)
**Evidence:**
```typescript
// Check for next page token
if (data.next_page_token) {
  // Wait 2 seconds as required by Google
  await new Promise((resolve) => setTimeout(resolve, 2000));
  currentUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${data.next_page_token}&key=${apiKey}`;
}
```
**Indicates:** Google API requirement for pagination delays. Adds significant time to competitor discovery.

---

## 4. ESTIMATION ANCHOR TABLE

| Feature / Integration / Module | Complexity | Time Driver | Reusability for New Ads Product |
|-------------------------------|------------|-------------|--------------------------------|
| **Instagram Screenshot Capture** | L | Session management, CAPTCHA detection, fallback chains, stealth scripts, state classification | **Low** - Instagram-specific, but browser automation patterns reusable |
| **Competitor Discovery** | M | Category family mapping, radius-fill algorithm, pagination delays, strict filtering | **High** - Business discovery logic directly applicable to competitor analysis for ads |
| **Social Link Extraction** | M | CAPTCHA handling, multiple extraction strategies, human-like behavior, fallback to CSE | **Medium** - Website scraping patterns reusable, but Instagram/Facebook specific |
| **Multi-Stage Report UI** | M | State synchronization (React + localStorage + API cache), partial updates, error recovery | **High** - Dashboard UI patterns, state management, progressive loading directly applicable |
| **Google Places API Integration** | S | Field optimization, caching strategy, response normalization | **High** - API integration patterns, caching strategies directly reusable |
| **Review Sentiment Analysis** | S | Variety selection algorithm, data normalization | **Medium** - Review analysis useful, but sentiment visualization less critical for ads |
| **Photo Collage** | S | Progressive loading, animation coordination | **Medium** - Image display patterns reusable, but less critical for ads product |
| **Browser Automation (Playwright)** | L | Stealth scripts, viewport emulation, session injection, CAPTCHA detection | **Medium** - Core automation patterns reusable, but Instagram-specific work not needed |
| **Google CSE API Fallback** | S | URL extraction, search result matching | **Low** - Instagram-specific fallback, not needed for ads product |
| **Vercel Deployment Protection Bypass** | S | Internal API call workaround | **High** - Infrastructure pattern directly applicable |
| **In-Memory Cache + localStorage** | M | Serverless cache volatility, state persistence | **High** - Caching and state management patterns directly reusable |
| **CAPTCHA Detection** | M | Fast-fail detection, multiple check methods | **Medium** - Detection patterns reusable, but may not be needed for ads product |
| **Error Handling & Fallbacks** | M | Multiple fallback layers, error recovery | **High** - Error handling patterns directly applicable |

### Complexity Legend
- **S (Small):** 1-3 days
- **M (Medium):** 4-10 days
- **L (Large):** 11+ days

### Reusability Legend
- **High:** Core patterns directly applicable, significant code reuse possible
- **Medium:** Some patterns reusable, but requires adaptation
- **Low:** Specific to current product, minimal reuse

---

## KEY INSIGHTS FOR NEW PRODUCT ESTIMATION

### High-Reusability Areas (Leverage Existing Code)
1. **Google Places API Integration** - Caching, field optimization, error handling
2. **Competitor Discovery Logic** - Business type matching, radius-fill, filtering
3. **Multi-Stage UI Patterns** - State management, progressive loading, error recovery
4. **Browser Automation Core** - Playwright setup, stealth scripts (minus Instagram-specific)

### Medium-Reusability Areas (Adapt Existing Patterns)
1. **Social Link Extraction** - Website scraping patterns, but may not need Instagram/Facebook
2. **Error Handling** - Fallback chains, retry logic patterns
3. **CAPTCHA Detection** - If URL scanning triggers CAPTCHAs

### Low-Reusability Areas (Build New)
1. **Instagram Session Management** - Not needed for ads product
2. **Google CSE Bypass** - Instagram-specific fallback
3. **Review Sentiment** - Less critical for ads product

### New Product Requirements (Not in Current Codebase)
1. **URL Scanning** - New feature, but can leverage browser automation patterns
2. **Ad Generation** - Completely new, no existing patterns
3. **Dashboards** - Can leverage multi-stage UI patterns, but needs new data visualization
4. **Email/SMS Sending** - Referenced but not implemented - needs to be built

### Estimated Complexity Multipliers
- **Instagram-specific work:** ~40% of total complexity (session management, CAPTCHA, fallbacks)
- **Browser automation:** ~30% of complexity (reusable patterns)
- **API integrations:** ~20% of complexity (Google Places patterns reusable)
- **UI/State management:** ~10% of complexity (highly reusable)

**Recommendation:** For new ads product, expect ~60% code reuse from existing patterns (API integration, UI state management, browser automation core), but Instagram-specific work (~40% of current complexity) can be eliminated.

---

**End of Delivery Audit Report**
