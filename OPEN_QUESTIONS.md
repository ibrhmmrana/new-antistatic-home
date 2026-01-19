# Open Questions + How to Answer

## 1. Stage 1 Competitors Source

**Question:** How are Stage 1 competitors discovered and passed to the website crawler?

**Current Evidence:**
- `app/api/scan/website/route.ts` line 2294: `console.log('[WEBSITE-SCRAPE] Stage 1 competitors provided: ${stage1Competitors?.length || 0}')`
- Line 2302: `stage1Competitors: stage1Competitors || []`
- But the POST handler doesn't show where `stage1Competitors` comes from in the request body

**How to Answer:**
1. **Check request body:** Search for `stage1Competitors` in `app/api/scan/website/route.ts` POST handler (around line 1890)
2. **Check caller:** Search for calls to `/api/scan/website` that include `stage1Competitors` in body
3. **Check onboarding:** Look at `StageCompetitorMap.tsx` to see if it stores competitors somewhere
4. **Check localStorage:** Search for localStorage keys containing "competitor" or "stage1"

**Files to Check:**
- `app/api/scan/website/route.ts` (POST handler, request body parsing)
- `components/report/StageCompetitorMap.tsx`
- `components/report/ReportScanClient.tsx` (where website crawler is called)
- `app/report/[scanId]/analysis/page.tsx` (fallback website crawler call)

---

## 2. Scan ID Collision Detection

**Question:** How do we handle scan ID collisions? Is there any deduplication?

**Current Evidence:**
- `lib/report/generateScanId.ts`: Uses `Date.now().toString(36) + Math.random().toString(36).substring(2, 8)`
- No collision detection found
- localStorage keys use `scanId` as part of key

**How to Answer:**
1. **Check localStorage before write:** Search for `localStorage.getItem` calls that check for existing `scanId` before writing
2. **Check server cache:** Verify if `scraperCache` Map handles collisions (it uses `scanId` as key)
3. **Test collision:** Generate 1000 scan IDs and check for duplicates

**Files to Check:**
- `lib/report/generateScanId.ts`
- `components/landing/BusinessSearch.tsx` (where scanId is generated)
- `app/api/scan/socials/route.ts` (scraperCache usage)

---

## 3. localStorage Quota Handling

**Question:** What happens when localStorage quota is exceeded? Is there error handling?

**Current Evidence:**
- `components/report/ReportScanClient.tsx` line 236: `try { localStorage.setItem(...) } catch (error) { console.warn('Failed to store in localStorage (quota exceeded?):', error); }`
- Only logs warning, doesn't retry or use alternative storage
- Analysis page reads from localStorage without fallback if read fails

**How to Answer:**
1. **Check all localStorage writes:** Search for all `localStorage.setItem` calls and verify try/catch
2. **Check quota detection:** See if code checks `localStorage.remainingSpace` or similar
3. **Test with large data:** Manually fill localStorage and trigger analysis to see behavior

**Files to Check:**
- `components/report/ReportScanClient.tsx` (all localStorage.setItem calls)
- `app/report/[scanId]/analysis/page.tsx` (all localStorage.setItem calls)
- Browser DevTools: Application → Local Storage → Check quota usage

---

## 4. Vercel Serverless Timeout Limits

**Question:** What happens if website crawler exceeds Vercel's function timeout? Is there chunking/streaming?

**Current Evidence:**
- `app/api/scan/website/route.ts` line 13: `const TIMEOUT_MS = 60000; // 60 seconds`
- Vercel Hobby: 10s timeout, Pro: 60s, Enterprise: 300s
- No streaming/chunking found - returns full result at end

**How to Answer:**
1. **Check Vercel plan:** Look at `vercel.json` or deployment settings
2. **Check error handling:** See if timeout errors are caught and returned gracefully
3. **Check partial results:** Verify if crawler can return partial results if interrupted
4. **Test with large site:** Crawl a site with 50+ pages and measure time

**Files to Check:**
- `app/api/scan/website/route.ts` (error handling, timeout logic)
- `vercel.json` (if exists)
- Vercel dashboard: Functions → Timeout settings

---

## 5. Social Link Deduplication Logic

**Question:** If multiple Instagram/Facebook links are found, which one is used? Is there deduplication?

**Current Evidence:**
- `app/api/scan/socials/route.ts` line 313: `const seenUrls = new Set<string>();`
- Line 344: `if (platform && !seenUrls.has(href)) { seenUrls.add(href); socialLinks.push(...); }`
- But no logic to pick "best" link if multiple exist

**How to Answer:**
1. **Check link selection:** See if code picks first match, or filters by username pattern
2. **Check username extraction:** See how `extractUsernameFromUrl` handles multiple candidates
3. **Test with multiple links:** Create a test website with 3 Instagram links and see which is used

**Files to Check:**
- `app/api/scan/socials/route.ts` (extractSocialLinksFromWebsite, cleanAndDeduplicateSocialLinks)
- `components/report/ReportScanClient.tsx` (extractUsernameFromUrl function)

---

## 6. Business Identity Resolution Stability

**Question:** Is resolved business identity stable across multiple runs? Does it change if website is updated?

**Current Evidence:**
- `lib/business/resolveBusinessIdentity.ts`: Uses GBP → Places → Website fallback
- No caching of resolved identity found
- Identity is re-computed on every website crawl

**How to Answer:**
1. **Check identity caching:** Search for localStorage keys or cache entries for `business_identity`
2. **Test stability:** Run website crawler twice on same site and compare `business_identity` output
3. **Check confidence scores:** See if low-confidence identities are flagged for manual review

**Files to Check:**
- `lib/business/resolveBusinessIdentity.ts` (caching logic)
- `app/api/scan/website/route.ts` (where identity is stored in result)

---

## 7. Error Recovery & Retry Logic

**Question:** If an analyzer fails, is there automatic retry? How are partial failures handled?

**Current Evidence:**
- `components/report/ReportScanClient.tsx`: Analyzers use `Promise.allSettled` (line 432) - doesn't retry on failure
- `app/report/[scanId]/analysis/page.tsx`: Fallback API calls only if cache miss, no retry on error
- No retry logic found

**How to Answer:**
1. **Check retry logic:** Search for "retry", "retries", "attempt" in analyzer code
2. **Check error states:** See if UI shows "Retry" buttons or auto-retries
3. **Test failure scenarios:** Manually trigger API errors and observe behavior

**Files to Check:**
- `components/report/ReportScanClient.tsx` (analyzer error handling)
- `app/report/[scanId]/analysis/page.tsx` (fallback error handling)
- All API route files (error responses)

---

## 8. Search Visibility Query Generation Source

**Question:** Where does the list of search queries come from? Is it configurable per business type?

**Current Evidence:**
- `lib/seo/searchVisibility.ts` line 2262: Calls `getSearchVisibility({ identity, maxQueries: 10, ... })`
- `lib/seo/buildOwnerStyleQueries.ts`: Generates queries based on `BusinessIdentity`
- Uses category families (`lib/seo/categoryFamilies.ts`)

**How to Answer:**
1. **Check query generation:** Read `lib/seo/buildOwnerStyleQueries.ts` to understand query templates
2. **Check category families:** Read `lib/seo/categoryFamilies.ts` to see business type mappings
3. **Test with different business types:** Run analysis for restaurant vs. dentist and compare queries

**Files to Check:**
- `lib/seo/buildOwnerStyleQueries.ts` (query generation logic)
- `lib/seo/categoryFamilies.ts` (category → service keywords mapping)
- `lib/seo/searchVisibility.ts` (how queries are used)

---

## 9. Competitor Discovery Fallback Logic

**Question:** If Stage 1 competitors are missing, how does the system discover competitors? Is it reliable?

**Current Evidence:**
- `lib/seo/competitors.ts`: Uses `getCompetitorSnapshot` function
- Line 2302 in website crawler: `stage1Competitors: stage1Competitors || []`
- Fallback to Places Nearby Search if no Stage 1 competitors

**How to Answer:**
1. **Check competitor discovery:** Read `lib/seo/competitors.ts` to see fallback logic
2. **Check Places API usage:** See if it uses Nearby Search or Text Search
3. **Test without Stage 1:** Run analysis without providing Stage 1 competitors and verify results

**Files to Check:**
- `lib/seo/competitors.ts` (competitor discovery logic)
- `app/api/scan/website/route.ts` (how competitors are passed)

---

## 10. Analysis Page Pre-fill Timing

**Question:** How does the analysis page know when all analyzers are complete? Is there a race condition?

**Current Evidence:**
- `components/report/ReportScanClient.tsx` line 520: Navigates when `allAnalyzersComplete === true`
- `allAnalyzersComplete` is computed from `analyzersComplete` state
- Analysis page loads from localStorage immediately on mount

**How to Answer:**
1. **Check navigation timing:** See if navigation happens before all analyzers finish writing to localStorage
2. **Check localStorage write timing:** Verify if analyzers write to localStorage before setting `complete = true`
3. **Test race condition:** Add delays to analyzers and see if analysis page shows partial data

**Files to Check:**
- `components/report/ReportScanClient.tsx` (navigation logic, analyzer completion)
- `app/report/[scanId]/analysis/page.tsx` (localStorage reads)

---

## Summary: How to Investigate Each Question

1. **Code Search:** Use `grep` or IDE search to find relevant code sections
2. **Read Implementation:** Read the identified files to understand logic
3. **Test Scenarios:** Create test cases to verify behavior
4. **Check Logs:** Add console.log statements to trace execution
5. **Check Browser DevTools:** Inspect localStorage, network requests, React state
6. **Check Server Logs:** Review Vercel function logs for errors/timeouts
