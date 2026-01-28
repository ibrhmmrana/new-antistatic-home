# How Social Media Usernames Are Found

This document explains the process of finding and extracting social media usernames (Instagram and Facebook) for a selected business.

## Overview

The system uses a **multi-source approach** to find social media profiles:
1. **Website Scraping** - Extracts links from the business website
2. **Google Custom Search Engine (CSE) API** - Searches Google for social profiles
3. **Cross-validation** - Verifies and selects the best match from all sources

## Main Flow

**Entry Point**: `POST /api/scan/socials` (`app/api/scan/socials/route.ts`)

### Step 1: Extract from Business Website

**Function**: `extractSocialLinksFromWebsite(websiteUrl)`

**Process**:
1. Launches a headless browser (Playwright/Chromium)
2. Navigates to the business website URL
3. Scans the page for social media links using CSS selectors:
   - `a[href*="instagram.com"]`
   - `a[href*="facebook.com"]`
4. Also checks header and footer sections specifically
5. Returns array of found links with platform identification

**Code Location**: `app/api/scan/socials/route.ts` lines 253-393

**Example**:
```typescript
// Finds links like:
// <a href="https://instagram.com/mybusiness">Instagram</a>
// <a href="https://facebook.com/mybusiness">Facebook</a>
```

### Step 2: Search via Google CSE API

**Function**: `extractSocialLinksViaGoogleCse(businessName, address)`

**Process**:
1. Uses Google Custom Search Engine API to search for social profiles
2. Constructs search queries like:
   - `"Business Name" address instagram`
   - `Business Name address facebook`
3. Scores each result based on:
   - Business name matching in URL
   - URL structure (prefers clean profile URLs)
   - Relevance to business location
4. Returns scored candidates for cross-validation

**Code Location**: `app/api/scan/socials/route.ts` lines 1618-1751

**Scoring Logic** (`scoreSearchResult`):
- Business name appears in URL: +points
- Business name appears in title/snippet: +points
- Clean profile URL (single path segment): +points
- Location match: +points

### Step 3: Cross-Validation and Selection

**Function**: `verifyAndSelectSocialLink(candidates, businessName, platform)`

**Process**:
1. Combines candidates from both sources (website + CSE)
2. Normalizes URLs to canonical format
3. Scores each candidate:
   - Website source: +1 point
   - CSE source: +1.5 points (pre-filtered by Google)
   - Business name match in username: +2 points per matching word
   - Clean URL structure: +2 points
4. Selects the best candidate based on:
   - Highest score
   - Agreement between sources (if both found same URL)
   - Confidence threshold

**Code Location**: `app/api/scan/socials/route.ts` lines 1471-1606

### Step 4: Username Extraction

**Function**: `extractUsernameFromUrl(url, platform)` (in `ReportScanClient.tsx`)

**Process**:
1. Parses the social media URL
2. Extracts the username from the pathname
3. Filters out special paths:
   - Instagram: skips `/p/`, `/reel/`, `/stories/`, etc.
   - Facebook: skips `/pages/`, `/profile/`, `/people/`, etc.
4. Returns the username (first path segment)

**Code Location**: `components/report/ReportScanClient.tsx` lines 741-760

**Example**:
```typescript
// URL: https://instagram.com/mybusiness
// Extracted username: "mybusiness"

// URL: https://facebook.com/pages/MyBusiness/123456
// Extracted username: "MyBusiness" (if not in /pages/ path)
```

## URL Normalization

Before extraction, URLs are normalized:

### Instagram Normalization
**Function**: `normalizeInstagramUrl(url)`

- Converts `m.instagram.com` → `www.instagram.com`
- Removes query parameters
- Ensures `https://` protocol
- Validates it's actually an Instagram URL
- Returns canonical format: `https://www.instagram.com/username/`

**Code Location**: `app/api/scan/socials/route.ts` lines 1309-1357

### Facebook Normalization
**Function**: `normalizeFacebookUrl(url)`

- Converts `m.facebook.com` → `www.facebook.com`
- Removes query parameters and fragments
- Handles `/pages/` redirects
- Validates it's actually a Facebook URL
- Returns canonical format: `https://www.facebook.com/username` or `https://www.facebook.com/pages/PageName/ID`

**Code Location**: `app/api/scan/socials/route.ts` lines 1214-1307

## Usage Flow

1. **User selects business** → `BusinessSearch.tsx` navigates to report page
2. **Report page loads** → `ReportScanClient.tsx` triggers `/api/scan/socials`
3. **API extracts social links** → Returns array of `{ platform, url }`
4. **Frontend receives links** → Stored in `onlinePresenceData` state
5. **Username extraction** → `extractUsernameFromUrl()` extracts username from URL
6. **Scrapers triggered** → Instagram/Facebook scrapers called with username

**Code Location**: `components/report/ReportScanClient.tsx` lines 463-552

## Key Functions Summary

| Function | Purpose | Location |
|----------|---------|----------|
| `extractSocialLinksFromWebsite` | Scrapes business website for social links | `app/api/scan/socials/route.ts:253` |
| `extractSocialLinksViaGoogleCse` | Searches Google for social profiles | `app/api/scan/socials/route.ts:1618` |
| `verifyAndSelectSocialLink` | Cross-validates and selects best match | `app/api/scan/socials/route.ts:1471` |
| `normalizeInstagramUrl` | Normalizes Instagram URLs | `app/api/scan/socials/route.ts:1309` |
| `normalizeFacebookUrl` | Normalizes Facebook URLs | `app/api/scan/socials/route.ts:1214` |
| `extractUsernameFromUrl` | Extracts username from URL | `components/report/ReportScanClient.tsx:741` |
| `scoreSearchResult` | Scores Google search results | `app/api/scan/socials/route.ts:1356` |
| `scoreSocialUrl` | Scores social URLs directly | `app/api/scan/socials/route.ts:1399` |

## Environment Variables Required

- `GOOGLE_CSE_API_KEY` - Google Custom Search Engine API key
- `GOOGLE_CSE_CX` - Google Custom Search Engine ID (CX)

## Error Handling

- **Website scraping fails**: Falls back to Google CSE only
- **Google CSE fails**: Uses website links only (if available)
- **No links found**: Returns empty array
- **CAPTCHA detected**: Returns 429 error with CAPTCHA code
- **Invalid URLs**: Filtered out during normalization

## Notes

- The system prioritizes **accuracy over speed** - cross-validation ensures correct profiles
- **Username extraction** happens on the frontend after receiving URLs
- **Screenshots** are captured in parallel after links are verified
- The system only processes **Instagram and Facebook** (other platforms filtered out)
