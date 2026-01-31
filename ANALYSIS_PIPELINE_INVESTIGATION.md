# Analysis Pipeline Investigation — Technical Report

**Purpose:** Map the current analysis pipeline end-to-end to support adding a shareable, immutable report URL.  
**Scope:** Investigation only; no code changes.

---

## A) TL;DR of Current Flow (10–15 lines)

1. **Landing:** User types in `BusinessSearch`, which calls `/api/places/autocomplete` and `/api/places/details`. On "Analyse my business", a **client-generated** `scanId` (timestamp + random, 10–12 chars) is created via `generateScanId()`, and the app navigates to `/report/<scanId>?placeId=...&name=...&addr=...`. A background POST to `/api/scan/socials` is fired for social extraction (non-blocking).
2. **Report page (`/report/[scanId]`):** Renders `ReportScanClient` with `scanId`, `placeId`, `name`, `addr` from URL. If `placeId` is missing, a "Missing Business Information" message is shown; otherwise the onboarding flow runs.
3. **Gating:** On mount, place details and social extraction run. When "agents" are shown (stage 0), the email verification modal appears. User confirms/edits Instagram/Facebook usernames, enters email, receives code via `/api/public/verify-email/request` (Supabase `email_verification_challenges` + SES). User submits code to `/api/public/verify-email/confirm`; a JWT proof is set in an httpOnly cookie. `onVerified` sets `emailVerified` and `userProvidedUsernames`, advances to stage 1, and calls `startAnalysis()` (POST `/api/public/analysis/start` — which only validates the proof and returns a mock `jobId`; it does **not** run the real pipeline).
4. **Real analysis:** Triggered **client-side** in `ReportScanClient` when `currentStep >= 1` and `emailVerified`. A single `useEffect` calls: `/api/gbp/place-details`, `/api/scan/search-visibility`, `/api/scan/website` (if website exists), `/api/scan/socials`, `/api/scan/socials/screenshot`, and (when social links exist) `/api/test/instagram-api` and `/api/test/facebook-scrape`. Results are written to **localStorage** under keys like `analysis_<scanId>_gbp`, `analysis_<scanId>_website`, `analysis_<scanId>_instagram`, etc.
5. **Stages:** Onboarding advances through stages (0 → 5). When stage 5 is shown and analyzers are complete, the client navigates to `/report/<scanId>/analysis?placeId=...&name=...&addr=...`.
6. **Analysis page:** Reads **localStorage** by `scanId` for all analysis types; if cache is missing, it **re-runs** search-visibility, website crawler, and reviews (and later AI). It assembles a report via `assembleReport()` and renders it. **No Supabase (or other DB) is used for report/analysis data** — only for email verification challenges.
7. **Why not shareable:** The URL path segment is `scanId`, which is a **session-style** id generated at button click. All result data is keyed by `scanId` in **localStorage** (browser-specific). A different visitor opening the same URL has no localStorage for that `scanId`, so the analysis page treats cache as missing and re-triggers APIs; there is no "completed_report_id" or server-side persistence of report results.

---

## B) Flow Diagram (ASCII)

```
Landing (BusinessSearch)
    │
    ├─ GET /api/places/autocomplete?input=...
    ├─ GET /api/places/details?placeId=...   (on selection)
    │
    └─ [Analyse my business]
           │
           ├─ scanId = generateScanId()   // client: timestamp + random
           ├─ router.push(/report/<scanId>?placeId=&name=&addr=)
           └─ POST /api/scan/socials (background, for prefilled usernames)
                    │
                    ▼
/report/[scanId] (ReportScanClient)
    │
    ├─ GET /api/places/details?placeId=...
    ├─ POST /api/scan/socials (extract socials for modal prefills)
    │
    ├─ Stage 0: "Agents" → show EmailVerificationModal
    │       │
    │       ├─ User: usernames (confirm/edit) → email → code
    │       ├─ POST /api/public/verify-email/request  → Supabase insert, SES email
    │       ├─ POST /api/public/verify-email/confirm  → JWT cookie, Supabase consumed_at
    │       └─ onVerified() → setEmailVerified, setCurrentStep(1), startAnalysis()
    │
    ├─ startAnalysis() → POST /api/public/analysis/start (proof only; returns jobId, no pipeline)
    │
    ├─ Stage 1+: useEffect( currentStep>=1 && emailVerified )
    │       │
    │       ├─ POST /api/scan/socials (full: links + screenshots)
    │       ├─ POST /api/scan/socials/screenshot (website)
    │       ├─ GET  /api/gbp/place-details?place_id=...
    │       ├─ POST /api/scan/search-visibility
    │       ├─ POST /api/scan/website (if website)
    │       ├─ POST /api/test/instagram-api (if username)
    │       ├─ POST /api/test/facebook-scrape (if username)
    │       └─ Write localStorage: analysis_<scanId>_gbp|website|instagram|facebook, onlinePresence_<scanId>
    │
    └─ Stage 5 + allAnalyzersComplete → router.push(/report/<scanId>/analysis?placeId=&name=&addr=)
                    │
                    ▼
/report/[scanId]/analysis (Analysis page)
    │
    ├─ Read localStorage: analysis_<scanId>_website|gbp|instagram|facebook|reviews|ai, onlinePresence_<scanId>
    ├─ GET /api/places/details?placeId=...
    ├─ If cache missing: POST /api/scan/search-visibility, POST /api/scan/website, GET /api/places/reviews
    ├─ POST /api/ai/analyze (if not cached)
    ├─ assembleReport(...) → setReport(...)
    └─ Render report (no DB read; all from state/localStorage)
```

---

## C) Key Files List (Grouped)

| Group | File path |
|-------|-----------|
| **Landing** | `components/landing/BusinessSearch.tsx` |
| | `lib/report/generateScanId.ts` |
| | `lib/types.ts` (Prediction, SelectedPlace) |
| **Report route** | `app/report/[scanId]/page.tsx` |
| | `app/report/[scanId]/analysis/page.tsx` |
| **Verification** | `components/report/EmailVerificationModal.tsx` |
| | `app/api/public/verify-email/request/route.ts` |
| | `app/api/public/verify-email/confirm/route.ts` |
| | `lib/email-verification.ts` (generateCode, verifyCode, hashCode) |
| **Analysis orchestrator (client)** | `components/report/ReportScanClient.tsx` |
| **Analysis page (client)** | `app/report/[scanId]/analysis/page.tsx` (client component: localStorage read, re-run logic) |
| **API routes (Places)** | `app/api/places/autocomplete/route.ts` |
| | `app/api/places/details/route.ts` |
| | `app/api/places/reviews/route.ts` |
| | `app/api/places/photo/route.ts`, `app/api/places/photos/route.ts` |
| | `app/api/places/static-map/route.ts`, `app/api/places/competitors/route.ts` |
| **API routes (scan / analysis)** | `app/api/public/analysis/start/route.ts` |
| | `app/api/scan/socials/route.ts` |
| | `app/api/scan/socials/screenshot/route.ts` |
| | `app/api/scan/search-visibility/route.ts` |
| | `app/api/scan/website/route.ts` |
| **API routes (GBP / social / AI)** | `app/api/gbp/place-details/route.ts` |
| | `app/api/test/instagram-api/route.ts` |
| | `app/api/test/facebook-scrape/route.ts` |
| | `app/api/ai/analyze/route.ts` |
| **DB / report assembly** | `lib/report/assembleReport.ts` |
| | `lib/report/types.ts` |
| | `lib/report/calculateScores.ts` |
| **DB (Supabase)** | `supabase/migrations/001_create_email_verification_challenges.sql` (table: `email_verification_challenges`) |

---

## D) Trigger Conditions Table

| Question | Answer |
|----------|--------|
| **When do analyses start?** | When `ReportScanClient` is on stage ≥ 1 and `emailVerified` is true: one `useEffect` sets `analyzersTriggeredRef.current = true` and fires GBP, search-visibility, website, and (via separate effect) Instagram/Facebook scrapers. All from the **client**. |
| **What makes them start again?** | (1) Same user: only once per mount (refs prevent duplicate triggers). (2) **New visitor:** opening `/report/<scanId>/analysis?placeId=...` — analysis **page** has no localStorage for that `scanId`, so its `useEffect` runs search-visibility, website, reviews, and AI again (cache-miss logic). |
| **What keys are used for caching/persistence?** | **Client only:** `localStorage` keys: `analysis_<scanId>_website`, `analysis_<scanId>_gbp`, `analysis_<scanId>_instagram`, `analysis_<scanId>_facebook`, `analysis_<scanId>_reviews`, `analysis_<scanId>_ai`, `onlinePresence_<scanId>`. **Server:** Supabase `email_verification_challenges` (id, email, code_hash, place_id, etc.) — not used for report data. |
| **Recompute vs reuse** | Reuse: if `localStorage.getItem(analysis_<scanId>_*)` exists (and for website, if `search_visibility.queries.length` exists), data is loaded from cache. Recompute: if key missing or (for website) search_visibility missing, the analysis page and/or ReportScanClient call the same APIs again. |

---

## E) Dynamic Segment `/report/[id]`: How It’s Generated and Used

- **Name in code:** The segment is `[scanId]` (folder: `app/report/[scanId]/`).
- **Generated:** In `BusinessSearch.tsx`, on "Analyse my business":
  - `generateScanId()` from `lib/report/generateScanId.ts` is called.
  - Implementation: `Date.now().toString(36)` + `Math.random().toString(36).substring(2, 8)`, then `.substring(0, 12)`. So it’s **random + time-based**, not derived from placeId or user.
- **Used:**  
  - **Report page:** Passed as `scanId` prop to `ReportScanClient`; used in every localStorage key (`analysis_<scanId>_*`, `onlinePresence_<scanId>`), in API bodies (e.g. `scanId` in `/api/scan/socials`, `/api/public/analysis/start`), and in navigation to `/report/<scanId>/analysis?...`.  
  - **Analysis page:** From `useParams().scanId`; used only to read/write localStorage and in API calls; **not** used to load a report from a database.  
- **Not tied to persisted report:** There is no table or document keyed by `scanId` that stores the final report. So the same URL in another browser/device always results in “empty” cache and re-execution of analyses.

---

## F) Likely Insertion Points for a Future “Immutable report_id / Shareable URL”

1. **After analyses complete, persist once under a new id**  
   When the client has all analyzer results (e.g. in `ReportScanClient` when navigating to `/report/<scanId>/analysis`, or in the analysis page after first assembly), call a new API (e.g. `POST /api/reports` or `POST /api/public/report/persist`) with the proof token (or session) and payload: `{ scanId, placeId, name, addr, reportPayload }`. Server creates a row in a new table (e.g. `reports` or `analysis_reports`) with a **stable** `report_id` (UUID or slug), stores the assembled report blob (or references to normalized tables), and returns `report_id`. Then redirect or offer shareable link: `/report/view/<report_id>` (or `/r/<report_id>`).

2. **New route: `/report/view/[reportId]` (or `/r/[reportId]`)**  
   A page that **only** accepts `reportId` (no `placeId`/`name`/`addr` in query). It loads report data from DB by `report_id` and renders the same report UI. No `scanId`, no localStorage keys, no re-run of analyses. Optional: require no auth for public share, or optional token for private links.

3. **Analysis start API: persist job and later the report**  
   In `app/api/public/analysis/start/route.ts`, after verifying the proof token, create a `report_jobs` (or `analysis_runs`) row keyed by `scanId` (or a new server-generated job id), and optionally enqueue a real server-side pipeline. When the pipeline (or client callbacks) finish, write results to a `reports` table with a new immutable `report_id` and link it to the job. Redirect or poll: when job is done, redirect to `/report/view/<report_id>`.

4. **Analysis page: check for existing report_id first**  
   In `app/report/[scanId]/analysis/page.tsx` (or a wrapper), before reading from localStorage: call `GET /api/reports?scanId=<scanId>` (or similar). If the server returns a persisted `report_id` and report payload (e.g. from a previous visitor who already ran and saved), redirect to `/report/view/<report_id>` or render from that payload so the same URL does not re-trigger analysis. This reduces duplicate work when the same `scanId` URL is revisited from the same “logical” run.

5. **Landing: optional “share link” flow**  
   When generating the report link, the server could return a “view” link (e.g. after first persistence) and the client could show “Share this report” with that link. So the UX stays “Analyse my business” → onboarding → analysis, but the canonical shareable URL becomes the persisted `report_id` URL, not `/report/<scanId>?placeId=...`.

---

## Env Vars Relevant to the Pipeline (names only)

- **Places / Maps:** `GOOGLE_PLACES_API_KEY`, `GOOGLE_MAPS_API_KEY`
- **Email verification:** `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EMAIL_PROOF_SECRET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_FROM_EMAIL`
- **Scan / social:** `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_CX`, `INSTAGRAM_SESSION_ID`, `INSTAGRAM_CSRF_TOKEN`, `INSTAGRAM_DS_USER_ID`, `INSTAGRAM_USERNAME`, `INSTAGRAM_PASSWORD`, `VERCEL_AUTOMATION_BYPASS_SECRET`, `NEXT_PUBLIC_BASE_URL`
- **Runtime / Chrome:** `VERCEL`, `AWS_LAMBDA_FUNCTION_NAME`, `CHROME_EXECUTABLE_PATH`, `CHROME_PATH`, `CHROMIUM_EXECUTABLE_PATH`
- **AI:** `OPENAI_API_KEY`
- **Session refresh:** `SESSION_REFRESH_API_KEY`

---

## Small Code Snippets (Reference)

**URL construction (landing):**

```193:208:components/landing/BusinessSearch.tsx
  const handleGetReport = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!selectedPlace) return;

    // Generate scan ID
    const scanId = generateScanId();
    ...
    const params = new URLSearchParams({
      placeId: selectedPlace.place_id,
      name: selectedPlace.primary_text,
      addr: selectedPlace.secondary_text,
    });
    router.push(`/report/${scanId}?${params.toString()}`);
```

**Navigation to analysis page:**

```779:781:components/report/ReportScanClient.tsx
        router.push(`/report/${scanId}/analysis?placeId=${encodeURIComponent(placeId)}&name=${encodeURIComponent(name)}&addr=${encodeURIComponent(addr)}`);
```

**Analysis start (proof-only):**

```51:60:app/api/public/analysis/start/route.ts
    // TODO: Here you would:
    // 1. Create a lead/analysis_request row in your database
    // 2. Enqueue the real analysis pipeline (call existing internal function/n8n webhook)
    // 3. Return a jobId for tracking

    // For now, return a mock jobId
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
```

**Cache key pattern (analysis page):**

```64:68:app/report/[scanId]/analysis/page.tsx
  useEffect(() => {
    ...
    const cachedWebsite = localStorage.getItem(`analysis_${scanId}_website`);
    ...
    const cachedGbp = localStorage.getItem(`analysis_${scanId}_gbp`);
```

**Trigger condition for analyzers:**

```424:429:components/report/ReportScanClient.tsx
  useEffect(() => {
    if (currentStep < 1) return; // Don't trigger until stage 1
    if (!emailVerified) return; // Don't trigger until email is verified
    if (analyzersTriggeredRef.current) return; // Already triggered
    const triggerAnalyzers = async () => {
```

---

*End of report.*
