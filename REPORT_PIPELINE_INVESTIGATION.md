# Antistatic Analysis + Report Pipeline — Technical Investigation

**Purpose:** Map the current flow end-to-end to enable a future shareable, immutable report URL (persisted snapshot, no recompute on view).  
**Constraints:** Investigation only; no implementation.

---

## 1) TL;DR of current flow

- **Landing:** User types in `BusinessSearch`, autocomplete calls `/api/places/autocomplete`; on pick, details from `/api/places/details`. "Analyse my business" calls `generateScanId()` (client-side, timestamp + random), then `router.push(/report/${scanId}?placeId=...&name=...&addr=...)`. Background POST to `/api/scan/socials` for social extraction.
- **Report route:** `app/report/[scanId]/page.tsx` reads `scanId` from URL and `placeId`, `name`, `addr` from query; requires `placeId` or shows "Missing Business Information". Renders `ReportScanClient` with those props.
- **Verification:** On `/report/[scanId]`, after "agents deployed" (stage 0), `EmailVerificationModal` opens. User enters email → `/api/public/verify-email/request` (Supabase `email_verification_challenges`); user enters 6-digit code → `/api/public/verify-email/confirm` → JWT proof token (cookie + optional sessionStorage key `email_verified_${placeId}`). `onVerified(socialUsernames)` closes modal and allows progression; analyses are gated by `emailVerified === true` and `currentStep >= 1`.
- **Analyses:** Orchestrated inside `ReportScanClient` and again on `app/report/[scanId]/analysis/page.tsx`. No single server-side "orchestrator": client triggers in parallel (GBP, search-visibility, website crawl, Instagram/Facebook scrapers, etc.). Results are written to **localStorage** under keys like `analysis_${scanId}_website`, `analysis_${scanId}_gbp`, `analysis_${scanId}_instagram`, `analysis_${scanId}_facebook`, `analysis_${scanId}_reviews`, `analysis_${scanId}_ai`, `onlinePresence_${scanId}`, `competitors_${scanId}`. `/api/public/analysis/start` exists but only returns a mock jobId; it does not run the pipeline. No queue/cron/n8n in use.
- **Navigation to report:** When `currentStep === 5` and `allAnalyzersComplete`, after a 4.5s minimum delay, client does `router.push(/report/${scanId}/analysis?placeId=...&name=...&addr=...)`.
- **Report render:** Analysis page loads; single `useEffect([scanId, placeId])` runs on mount: reads localStorage caches; if missing, fetches `/api/places/details`, `/api/scan/search-visibility`, optionally `/api/scan/website`, `/api/places/reviews`, and merges into localStorage + state. Then `assembleReport(...)` builds `ReportSchema` from in-memory state; sections (left rail, top cards, search visibility, checklist, AI analysis, Google Reviews) render from that. AI analysis is triggered in a separate `useEffect` when data is ready; result cached in `analysis_${scanId}_ai`.
- **Why new visitors re-trigger:** `scanId` is a **session-style ID** (new each time from landing). A new visitor either gets a new URL (new scanId) or same URL with no localStorage for that scanId. The analysis page **does not check** for a persisted "completed report" (e.g. DB by report_id); it always runs the same useEffect, and if cache is empty it runs all analyses again. There is no "immutable snapshot" route (e.g. `/r/:reportId`); `api/public/reports/persist` exists but is **never called** from the app.

---

## 2) ASCII flow diagram

```
Landing (BusinessSearch)
  │
  ├─ GET /api/places/autocomplete?input=...
  ├─ GET /api/places/details?placeId=...  (on pick)
  ├─ generateScanId() → scanId (client, timestamp+random)
  ├─ router.push(/report/${scanId}?placeId=&name=&addr=)
  └─ POST /api/scan/socials (background, for modal prefill)
       │
       ▼
/report/[scanId] (ReportScanClient)
  │
  ├─ GET /api/places/details?placeId=...
  ├─ POST /api/scan/socials (extract usernames for modal)
  │
  ├─ Stage 0: "Agents deployed" → show EmailVerificationModal
  │     ├─ POST /api/public/verify-email/request → Supabase email_verification_challenges
  │     └─ POST /api/public/verify-email/confirm → JWT cookie + sessionStorage email_verified_${placeId}
  │
  ├─ onVerified() → setEmailVerified(true); modal closes
  │
  ├─ currentStep >= 1 && emailVerified:
  │     ├─ POST /api/scan/socials/screenshot (website)
  │     ├─ POST /api/scan/socials (with user usernames)
  │     ├─ GET /api/gbp/place-details?place_id=...
  │     ├─ POST /api/scan/search-visibility
  │     ├─ POST /api/scan/website (if website URL)
  │     ├─ POST /api/test/instagram-api, POST /api/test/facebook-scrape
  │     ├─ GET /api/places/competitors?placeId=... (preload)
  │     └─ GET /api/places/reviews?placeId=... (preload)
  │     → results stored in localStorage (analysis_${scanId}_*, onlinePresence_${scanId}, etc.)
  │
  ├─ Stages 1–5 (UI only); when step=5 && allAnalyzersComplete → after 4.5s:
  │     router.push(/report/${scanId}/analysis?placeId=&name=&addr=)
  │
  ▼
/report/[scanId]/analysis (Analysis page)
  │
  ├─ useEffect([scanId, placeId]): load from localStorage; if missing:
  │     ├─ GET /api/places/details?placeId=...
  │     ├─ POST /api/scan/search-visibility
  │     ├─ POST /api/scan/website (if website)
  │     └─ GET /api/places/reviews?placeId=...&all=true
  │     → merge into localStorage + state
  ├─ useEffect([...deps]): assembleReport(...) → setReport(assembled)
  ├─ useEffect([...deps]): POST /api/ai/analyze → setAiAnalysis; cache analysis_${scanId}_ai
  │
  └─ Render: ReportLeftRail(scores), ReportTopCards(...), ReportSearchVisibility(...),
             ReportChecklistSection(sections), ReportAIAnalysis(aiAnalysis), Google Reviews block
```

---

## 3) Key files list (grouped)

| Group | File paths |
|-------|------------|
| **Landing** | `app/page.tsx`, `components/landing/BusinessSearch.tsx`, `lib/report/generateScanId.ts` |
| **Places APIs (autocomplete/details)** | `app/api/places/autocomplete/route.ts`, `app/api/places/details/route.ts` |
| **Report route** | `app/report/[scanId]/page.tsx`, `app/report/[scanId]/analysis/page.tsx` |
| **Report client (onboarding + orchestrator)** | `components/report/ReportScanClient.tsx` |
| **Verification** | `components/report/EmailVerificationModal.tsx`, `app/api/public/verify-email/request/route.ts`, `app/api/public/verify-email/confirm/route.ts`, `lib/email-verification.ts` |
| **Analysis orchestrator (client)** | `components/report/ReportScanClient.tsx` (useEffects that trigger APIs), `app/report/[scanId]/analysis/page.tsx` (useEffect that loads cache + fetches if missing) |
| **API routes (pipeline)** | `app/api/places/details/route.ts`, `app/api/places/reviews/route.ts`, `app/api/places/competitors/route.ts`, `app/api/places/photos/route.ts`, `app/api/places/photo/route.ts`, `app/api/places/static-map/route.ts`, `app/api/gbp/place-details/route.ts`, `app/api/scan/search-visibility/route.ts`, `app/api/scan/website/route.ts`, `app/api/scan/socials/route.ts`, `app/api/scan/socials/screenshot/route.ts`, `app/api/test/instagram-api/route.ts`, `app/api/test/facebook-scrape/route.ts`, `app/api/ai/analyze/route.ts`, `app/api/public/analysis/start/route.ts`, `app/api/public/reports/persist/route.ts` |
| **DB / persistence** | Supabase: `email_verification_challenges` (verify-email flow), `analysis_reports` (used only by persist API; persist is not called from frontend). Client: localStorage keys per scanId. |
| **Report assembly & types** | `lib/report/assembleReport.ts`, `lib/report/types.ts`, `lib/report/calculateScores.ts` |
| **Section components** | `components/report/ReportLeftRail.tsx`, `components/report/ReportTopCards.tsx`, `components/report/ReportSearchVisibility.tsx`, `components/report/ReportChecklistSection.tsx`, `components/report/ReportAIAnalysis.tsx`; Google Reviews block inline in `app/report/[scanId]/analysis/page.tsx` |

---

## 4) Section Dependency Map

| SECTION NAME | COMPONENT PATH | DATA FETCH LOCATION | API ROUTES CALLED | DB TABLES/KEYS | RE-RUN TRIGGERS | NOTES |
|--------------|----------------|---------------------|-------------------|----------------|-----------------|--------|
| Left summary sidebar (overall + category scores, "Fix in 35 seconds") | `components/report/ReportLeftRail.tsx` | Props from parent; parent gets `report.scores` from `assembleReport()` | None (scores from assembled report) | None; report built from localStorage + state | Re-run when `assembleReport()` runs (page state/localStorage change) | CTA "Fix in 35 seconds" is hardcoded in component (no logic). Scores from `lib/report/calculateScores.ts` via `assembleReport`. |
| Top visibility cards ("We found X issues", "You're ranking below competitors") | `components/report/ReportTopCards.tsx` | Props `impact`, `competitors`, `sections`, `aiAnalysis`; optional client fetch for business photo | `GET /api/places/details?placeId=...`, `GET /api/places/photo?ref=...` (for avatar only) | None for main data; photo can re-fetch per placeId | Re-run when report/aiAnalysis/sections change; photo when placeId changes | Impact/competitors from `report.summaryCards` (assembleReport). Competitor list from `competitors_snapshot` in website/search-visibility data. |
| "This is how you're doing online" (search visibility table) | `components/report/ReportSearchVisibility.tsx` | Props `searchVisibility`, `targetPlaceId`, `targetDomain`; client fetches details per map pack result for map markers | `GET /api/places/details?placeId=...` (per result for lat/lng) | None | Re-run when `report.searchVisibility` changes; map markers when query results change | Data from `websiteCrawlData.search_visibility` / search-visibility API; ordering from `assembleReport` (buildSearchVisibility). |
| AI-Powered Analysis (Top Priorities, collapsible panels) | `components/report/ReportAIAnalysis.tsx` | Props `analysis`, `isLoading`; analysis fetched in analysis page useEffect | Analysis page: `POST /api/ai/analyze` | None; cached in `localStorage` as `analysis_${scanId}_ai` | Re-run when analysis page effect runs and cache missing or invalid | LLM output from `lib/ai/analyzePresence.ts` via `/api/ai/analyze`. Stored only in localStorage. |
| Checklist / audit sections ("X things reviewed, Y need work") | `components/report/ReportChecklistSection.tsx` | Props `section` (per section from `report.sections`) | None | None | Re-run when `report.sections` change (assembleReport) | Sections built in `assembleReport.ts` (buildSearchResultsSection, buildWebsiteExperienceSection, buildLocalListingsSection, buildSocialPresenceSection). |
| Google Reviews | Inline in `app/report/[scanId]/analysis/page.tsx` | State `reviews`; loaded from localStorage or fetched in analysis page useEffect | `GET /api/places/reviews?placeId=...&all=true` | None; cached as `analysis_${scanId}_reviews` | Re-run when analysis page effect runs and cache missing | No AI sentiment in this block; sentiment/grouping in AI analysis (reviews painPoints/strengths). |

---

## 5) Notes on /report/[id]: how it's generated + what it means

- **Dynamic segment:** `[scanId]` in `app/report/[scanId]/page.tsx` and `app/report/[scanId]/analysis/page.tsx`.
- **How scanId is generated:** In `BusinessSearch.tsx`, on "Analyse my business", `generateScanId()` is called. Implemented in `lib/report/generateScanId.ts`:

```ts
// lib/report/generateScanId.ts
export function generateScanId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  const combined = timestamp + random;
  return combined.substring(0, 12);
}
```

- **Meaning:** `scanId` is a **client-generated, ephemeral session identifier**. It is not a database primary key and is not tied to a stored report. Same business (same placeId) can have many different scanIds over time. Used only to:
  - Namespace localStorage keys (`analysis_${scanId}_*`, etc.)
  - Build URLs `/report/${scanId}` and `/report/${scanId}/analysis?...`
- **Query params:** `placeId`, `name`, `addr` are required for the report flow. Validated in `app/report/[scanId]/page.tsx`: if `!placeId`, show "Missing Business Information" and link back home. No server-side normalization; `name`/`addr` are decoded for display.

---

## 6) Why new visitors re-trigger analysis today

1. **URL is not tied to persisted results**  
   The URL is `/report/<scanId>?placeId=...`. Persisted reports in Supabase (`analysis_reports`) are keyed by `scan_id` and `report_id`, but the app never fetches by `report_id` and the persist API is never called from the frontend. So the same URL never "points" to a stored snapshot.

2. **Analysis is triggered on page load when cache is empty**  
   In `app/report/[scanId]/analysis/page.tsx`, one main `useEffect([scanId, placeId])` runs on mount. It:
   - Reads from localStorage for this `scanId` (website, GBP, instagram, facebook, reviews, socials).
   - If cache is missing, it fetches `/api/places/details`, `/api/scan/search-visibility`, optionally `/api/scan/website`, `/api/places/reviews`, and writes to localStorage + state.  
   So a **new visitor** (new device/profile or new scanId) has no cache → all those requests run again.

3. **No "completed snapshot" check**  
   There is no logic that:
   - Checks for an existing report by a stable ID (e.g. `report_id` or `report_snapshot_id`) in the URL or DB, or
   - Skips analysis and only renders from stored payload when such an ID is present.  
   So every load that misses localStorage is treated as a new run.

4. **Auth/verification does not persist across visitors**  
   Email verification sets a cookie and optionally `sessionStorage` key `email_verified_${placeId}`. A new visitor does not have that cookie/sessionStorage, but the **analysis page** (`/report/[scanId]/analysis`) does not require verification; only the onboarding client (`ReportScanClient`) does. So a direct visit to `/report/<scanId>/analysis?placeId=...` (e.g. shared link) bypasses verification and still runs the analysis useEffect; the re-trigger is due to cache/design, not auth reset.

5. **localStorage is device/tab-scoped**  
   Even if the same `/report/<scanId>/analysis` URL is shared, another user’s browser has no localStorage for that scanId → cache miss → full re-run.

---

## 7) Future snapshot insertion points (3–5)

1. **After report assembly, before or after navigation to /analysis**  
   When the client has a full `ReportSchema` (and optionally AI analysis + reviews), call `POST /api/public/reports/persist` with proof token, `scanId`, `placeId`, `name`, `addr`, and the assembled `report` (+ sources if desired). Backend already writes to `analysis_reports` and returns `reportId` and `shareUrl` (e.g. `/r/${reportId}`). Frontend can then offer "Share report" with that URL. **Insertion:** In `ReportScanClient` when navigating to `/report/${scanId}/analysis`, or in the analysis page once `report` and optional `aiAnalysis`/reviews are ready, call persist and store `reportId` (e.g. in state or replaceHistory with `/r/${reportId}`).

2. **New route: `/r/[reportId]` (or `/report/s/[reportId]`)**  
   Add a route that loads a **single** report by `report_id` from `analysis_reports.report_payload` (and optionally source_payload). Render the same section components (ReportLeftRail, ReportTopCards, ReportSearchVisibility, ReportChecklistSection, ReportAIAnalysis, Google Reviews) from that payload. No `scanId` or `placeId` in URL needed for data; no useEffect that triggers analyses. **Insertion:** New page + optional redirect from `/report/[scanId]/analysis` when a `reportId` exists (e.g. after persist).

3. **Conditional load on `/report/[scanId]/analysis`**  
   Support a query like `?snapshot=:reportId` or use a path like `/report/s/[reportId]` for view-only. When the page sees `snapshot` (or is the `/r/[reportId]` page), first try to load report by `report_id` from an API that reads `analysis_reports`; if found, set report state from payload and **skip** the useEffect that reads localStorage and calls search-visibility/website/reviews/ai. **Insertion:** At the top of the analysis page’s data-loading logic (before the existing useEffect that fills cache and runs analyses).

4. **Persist when user clicks "Share" (lazy snapshot)**  
   Don’t persist on every run. When the user clicks "Share report", call persist with current `report` + sources (and proof if required); get back `reportId` and `shareUrl`; show copy link. **Insertion:** Share button handler in report UI (e.g. in ReportLeftRail or a header); requires report (and optionally ai/reviews) to be in state so they can be sent in the persist payload.

5. **Background job or webhook after "all analyzers complete"**  
   When `allAnalyzersComplete` is true in `ReportScanClient`, call an API that (a) gathers current report from backend state or (b) receives a payload from the client (assembled report + sources) and persists to `analysis_reports`, then returns `reportId`. The client can then update the URL to `/r/${reportId}` (replaceState) or show a share link. **Insertion:** In the same effect that currently does `router.push(.../analysis?...)` after the 4.5s delay; before or after navigation, call the persist endpoint with the assembled data (may require passing report from analysis page back or having the persist API re-assemble from stored raw results keyed by scanId—currently raw results are only in localStorage, so client-side persist is simpler unless you add server-side storage for raw analyses).

---

## Env vars (names only, no secrets)

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `OPENAI_API_KEY` (AI analyze)
- `EMAIL_PROOF_SECRET` (JWT proof token)
- `EMAIL_VERIFICATION_SALT` or fallback `EMAIL_PROOF_SECRET` (code hash)
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_BASE_URL` (used in persist shareUrl)

---

## A) Landing page search → navigation flow (detail)

| Step | File / location | Function / behavior |
|------|------------------|----------------------|
| Search input & dropdown | `components/landing/BusinessSearch.tsx` | `fetchPredictions` → GET `/api/places/autocomplete?input=...`; debounced 250ms. Predictions in state; dropdown renders from `predictions`. |
| On pick suggestion | `components/landing/BusinessSearch.tsx` | `handleSelect(prediction)` → GET `/api/places/details?placeId=${prediction.place_id}`; sets `placeDetails` (name, rating, address, photoUrl). |
| "Analyse my business" | `components/landing/BusinessSearch.tsx` | `handleGetReport` → `generateScanId()` from `lib/report/generateScanId.ts`; `router.push(\`/report/${scanId}?${params}\`)` with `placeId`, `name`, `addr`; then fire-and-forget POST `/api/scan/socials` for background extraction. |
| Autocomplete API | `app/api/places/autocomplete/route.ts` | Reads `input` query; calls Google Places Autocomplete; returns `predictions` (primary_text, secondary_text, place_id, etc.). |
| Details API | `app/api/places/details/route.ts` | Reads `placeId`; calls Places (New) API; returns name, address, location, rating, website, photoRef/photoUri, etc. |

---

## B) /report route structure and state model

- **Route files:** `app/report/[scanId]/page.tsx`, `app/report/[scanId]/analysis/page.tsx`.
- **Dynamic segment:** `scanId` from URL path; used in localStorage key namespace and in navigation. Not stored in DB by the current flow.
- **Query params:** `placeId` (required), `name`, `addr` (decoded for display). Validated in page: missing `placeId` → "Missing Business Information" + link home.
- **Where "current analysis session state" lives:** **In-memory** in React state in `ReportScanClient` and in the analysis page; **persisted only in localStorage** under keys `analysis_${scanId}_website`, `analysis_${scanId}_gbp`, `analysis_${scanId}_instagram`, `analysis_${scanId}_facebook`, `analysis_${scanId}_reviews`, `analysis_${scanId}_ai`, `onlinePresence_${scanId}`, `competitors_${scanId}`, `reviews_${scanId}`, etc. No cookies or server session store for analysis state. Verification state: cookie `email_proof` (JWT) and sessionStorage `email_verified_${placeId}` (optional).

---

## C) Gating steps (social confirmation + email verification)

- **Where implemented:** `components/report/ReportScanClient.tsx` (shows `EmailVerificationModal`); modal UI in `components/report/EmailVerificationModal.tsx`.
- **When modal shows:** When `currentStep === 0` and `allAgentsDeployed` (after a 1s delay). So: after the "agents deployed" stage, modal opens.
- **Flow:** (1) User sees prefilled social usernames (from `/api/scan/socials`). (2) User enters email → POST `/api/public/verify-email/request` (body: email, placeId, placeName); server creates row in Supabase `email_verification_challenges`, sends email. (3) User enters 6-digit code → POST `/api/public/verify-email/confirm` (challengeId, code); server verifies code, marks challenge consumed, creates JWT (email, purpose, challengeId, placeId), sets cookie `email_proof` and returns `proofToken`. (4) Client stores `proofToken` in `sessionStorage` under `email_verified_${placeId}`. (5) `onVerified(socialUsernames)` is called with confirmed/edited Instagram/Facebook usernames; modal closes.
- **What marks "verification complete":** `onVerified` callback sets `emailVerified` to true and passes social usernames; modal closes. Cookie + sessionStorage hold proof for later API calls (e.g. `/api/public/analysis/start`, `/api/public/reports/persist`).
- **How system allows analyses:** In `ReportScanClient`, useEffects that trigger analyzers (search-visibility, website, GBP, social scrapers) run only when `currentStep >= 1` and `emailVerified === true`. So "verification complete" (modal submitted) is the gate.

---

## D) How analyses are kicked off (orchestrator)

- **Entrypoint:** Client-side only. (1) **ReportScanClient:** When `currentStep >= 1` and `emailVerified`, several useEffects run. One triggers "analyzers" (GBP, search-visibility, website crawl, then social scrapers when social links appear); another triggers website screenshot and `/api/scan/socials` with user usernames. Another effect triggers Instagram/Facebook scrapers when `userProvidedUsernames` or `onlinePresenceData.socialLinks` is set. (2) **Analysis page:** On mount, one useEffect with deps `[scanId, placeId]` runs: loads from localStorage; if cache missing, fetches details, search-visibility, website, reviews and merges into localStorage + state. A second useEffect assembles report when dependencies change. A third triggers POST `/api/ai/analyze` when data is ready and cache is missing.
- **APIs called in pipeline:**  
  - **Places:** `/api/places/details`, `/api/places/reviews`, `/api/places/competitors`, `/api/places/photos`, `/api/places/photo`, `/api/places/static-map`  
  - **GBP:** `/api/gbp/place-details`  
  - **Scan:** `/api/scan/search-visibility`, `/api/scan/website`, `/api/scan/socials`, `/api/scan/socials/screenshot`  
  - **Test scrapers:** `/api/test/instagram-api`, `/api/test/facebook-scrape`  
  - **AI:** `/api/ai/analyze`  
  - **Public:** `/api/public/analysis/start` (mock only), `/api/public/reports/persist` (not called from app)
- **Concurrency:** No single `Promise.all` over the whole pipeline. Multiple independent useEffects and async calls; GBP and search-visibility/website can run in parallel; Instagram and Facebook scrapers run in parallel; analysis page runs details + search-visibility + optional website + reviews in parallel when cache is missing.
- **Retry/timeout/caching:** `fetchWithTimeoutClient` used for some calls (e.g. GBP, screenshot, reviews); no global retry. Caching is localStorage per scanId; no cache headers or server-side cache documented for these APIs. **Cause of "randomly different results":** Live APIs (Places, search, crawl, scrapers, OpenAI) can change over time; no deterministic snapshot; same placeId can yield different results on different runs or devices.

---

## E) Section-by-section rendering and data (summary)

Already covered in the Section Dependency Map table above. In short:

- **Left sidebar:** `ReportLeftRail`; data = `report.scores` from `assembleReport()`; no direct API; CTA "Fix in 35 seconds" is static.
- **Top cards:** `ReportTopCards`; data = report summaryCards + optional client fetch for place photo; APIs: details, photo (for avatar).
- **Search visibility table:** `ReportSearchVisibility`; data = `report.searchVisibility`; client fetches details per result for map markers.
- **AI analysis:** `ReportAIAnalysis`; data = `aiAnalysis` from POST `/api/ai/analyze`; cached in localStorage.
- **Checklist sections:** `ReportChecklistSection`; data = `report.sections` from `assembleReport()`.
- **Google Reviews:** Inline in analysis page; data = `reviews` from localStorage or GET `/api/places/reviews`.

---

*End of report.*
