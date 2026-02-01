# Report Data Audit: /r/[reportId] & Pipeline

**Purpose:** Inventory of all data used to produce the shareable report at `/r/[reportId]`, Instagram scraping (including comments), and OpenAI usage. No implementation—inspection only.

---

## 1) Report Data Inventory

The shareable report at `/r/[reportId]` is **view-only**: it loads a single snapshot from the DB and renders it. No external APIs or analyzers run for that route.

**Snapshot load:** `loadSnapshot(reportId)` → Supabase `analysis_reports` table, column `report_payload`.  
**Type:** `ReportSnapshotV1` (see `lib/report/snapshotTypes.ts`); includes optional `instagramComments` for shareable reports.  
**Renderer:** `ReportSnapshotRenderer` (`components/report/ReportSnapshotRenderer.tsx`) receives the snapshot and renders: left rail (scores), top cards, search visibility, checklist sections, AI analysis, Google reviews, Instagram comments (when present).

The **payload is built** during the scan/analysis flow: `assembleReport()` plus persistence. Below, “source” is where each piece of **report content** ultimately comes from (DB column, API, or internal code). “Computed” is where it’s produced. “Cached/stored” is where it lives before or after persistence.

| Report section / heading | Inputs used (exact field names) | Source (table+column OR API OR internal) | Where it's computed (file/function) | Cached/stored |
|---------------------------|----------------------------------|------------------------------------------|-------------------------------------|---------------|
| **Online health grade** (overall score + label) | `scores.overall`, `overall.score`, `overall.maxScore`, `overall.label` | Derived from four category scores in `assembleReport` | `lib/report/assembleReport.ts` (meta + sections + `calculateOverallScore`), `lib/report/calculateScores.ts` | In `report_payload` (inside `report.scores`) |
| **Category scores** (Search results, Website experience, Local listings, Social presence) | `scores.searchResults`, `scores.websiteExperience`, `scores.localListings`, `scores.socialPresence` | Same assembly; each section built from websiteCrawl, gbpAnalysis, socials, instagram, facebook | `assembleReport` → `buildSearchResultsSection`, `buildWebsiteExperienceSection`, `buildLocalListingsSection`, `buildSocialPresenceSection`; `calculateSearchResultsScore`, etc. in `calculateScores.ts` | In `report_payload.report.scores` |
| **Top problems / Impact card** | `summaryCards.impact` (`estimatedLossMonthly`, `topProblems`, `businessAvatar`) | `extractTopProblems(sections)`, `estimateMonthlyLoss(visibilityScore, topProblems, categoryLabel)`, avatar from `placesDetails.photos` or socials/websiteLogoUrl | `lib/report/assembleReport.ts` | In `report_payload.report.summaryCards.impact` |
| **Competitors** | `summaryCards.competitors` (`count`, `list`, `userRank`) | `websiteCrawl.competitors_snapshot.competitors_places`; user business merged from `placesDetails` | `lib/report/assembleReport.ts` (competitors raw + sort + user rank) | In `report_payload.report.summaryCards.competitors` |
| **Search visibility** (queries, map pack, organic) | `searchVisibility` (`visibilityScore`, `shareOfVoice`, `brandedVisibility`, `nonBrandedVisibility`, `queries`) | `websiteCrawl.search_visibility` (from website scan) | `lib/report/assembleReport.ts` maps `websiteCrawl?.search_visibility` into `ReportSchema` | In `report_payload.report.searchVisibility` |
| **Checklist sections** (Search results, Website experience, Local listings, Social presence) | `sections[]` (`id`, `title`, `score`, `maxScore`, `checks[]`) | Website crawl (crawl_map, site_report_summary, business_identity), GBP checklist, socials links, Instagram/Facebook profile + posts | `buildSearchResultsSection`, `buildWebsiteExperienceSection`, `buildLocalListingsSection`, `buildSocialPresenceSection` in `assembleReport.ts` | In `report_payload.report.sections` |
| **Cross-platform consistency** | N/A as standalone section; folded into **AI analysis** | Consistency is an OpenAI analysis type; inputs are instagram/facebook/website profile data | `lib/ai/analyzePresence.ts` → `analyzeConsistency`; called from `analyzeFullPresence` | In `report_payload.aiAnalysis.consistency` |
| **Social media analysis** (Instagram / Facebook panels in AI block) | Profile: biography, website, category, phone, address, hours, followerCount, postCount; Instagram also: posts (date, likeCount, commentCount), comments (flattened) | Instagram: `POST /api/test/instagram-api` with `includeComments: true` → profile + 24 posts + up to 30 comments per post. Facebook: `/api/test/facebook-scrape` | `assembleReport` uses `instagram`/`facebook` for checklist; OpenAI gets profile + `instagramComments` when present. `transformInstagramApiResponse` in ReportScanClient flattens comments to `{ text, postContext?, authorUsername? }[]` | localStorage `analysis_${scanId}_instagram` / `_facebook`; then in `report_payload.report` (sections), `report_payload.aiAnalysis` (instagram/facebook/instagramComments), and `report_payload.instagramComments` |
| **Website SEO / experience** | `websiteCrawl` (crawl_map, site_overview, site_report_summary, business_identity, search_visibility) | Internal website scanner: `POST /api/scan/website` (Playwright, no Apify) | `lib/report/assembleReport.ts` (website sections + meta + search visibility + competitors) | localStorage `analysis_${scanId}_website`; then in `report_payload.report` |
| **GBP (Google Business Profile)** | `gbpAnalysis` (businessName, rating, reviews count, checklist, keywordChecks), `placesDetails` (name, formatted_address, rating, user_ratings_total, website, photos) | GBP: `lib/gbp/analyzeGbp.ts` (via pipeline that stores to localStorage). Places: `GET /api/places/details` or equivalent (Google Places API) | `assembleReport` → `buildSearchResultsSection`, `buildLocalListingsSection`; meta (googleRating, googleReviewCount) from placesDetails/gbpAnalysis | localStorage `analysis_${scanId}_gbp`; placesDetails from API; then in `report_payload.report` |
| **Report meta** | `meta` (businessName, categoryLabel, locationLabel, scanDate, websiteUrl, websiteLogoUrl, googleRating, googleReviewCount, placeId) | business_identity, gbpAnalysis, placesDetails, websiteCrawl, socials | `assembleReport.ts` (top of function) | In `report_payload.report.meta` |
| **Artifacts** (links, screenshots, timestamps, dataFreshness) | `artifacts.links`, `artifacts.screenshots`, `artifacts.timestamps`, `artifacts.dataFreshness` | socials (links + screenshots), websiteCrawl/gbpAnalysis/instagram/facebook timestamps and freshness | `assembleReport.ts` | In `report_payload.report.artifacts` |
| **AI analysis** (Top Priorities, Instagram/Facebook/Consistency/Reviews/Instagram Comments panels) | `aiAnalysis` (instagram, facebook, consistency, reviews, instagramComments?, facebookComments?, overallScore, topPriorities) | OpenAI `analyzeFullPresence`; inputs: instagram/facebook/website profile, reviews, **instagramComments** (when scraped), optionally facebookComments | `lib/ai/analyzePresence.ts`; triggered from analysis page → `POST /api/ai/analyze` type `full`; analysis page sends `instagramComments` from `igResult.comments` | localStorage `analysis_${scanId}_ai`; then in `report_payload.aiAnalysis` |
| **Google Reviews** (list on report) | `reviews[]` (reviewId, authorName, profilePhotoUrl, relativeTime, rating, text, isLocalGuide) | Google Places API (reviews) via `GET /api/places/reviews?placeId=...&all=true` → `fetchPlaceDetailsNew` with reviews field mask | Normalized in `app/api/places/reviews/route.ts`; stored in snapshot when building payload | Fetched on analysis page; then in `report_payload.reviews` |
| **Instagram Comments** (list on report) | `instagramComments[]` (text, postContext?, authorUsername?) | Instagram API with `includeComments: true` → flattened from `posts[].comments` (and replies) in `transformInstagramApiResponse` | ReportScanClient transform; analysis page adds to snapshot at persist | In `report_payload.instagramComments`; displayed by `ReportInstagramComments` |
| **Supporting data** (e.g. map markers) | `supporting.markerLocations` (placeId → { placeId, lat, lng, name }) | Built on analysis page from search visibility results | Collected in analysis page (markerLocationsRef), passed into snapshot at persist | In `report_payload.supporting` |
| **Place snapshot** | `place` (placeId, name, addr, website, rating, reviewCount, businessPhotoUrl) | placesDetails + report meta | Set at snapshot build time from report/place data | In `report_payload.place` |

**Where the snapshot is stored:**  
- **Table:** `analysis_reports`  
- **Columns used for /r/[reportId]:** `report_id`, `report_payload`  
- **Schema:** `supabase/migrations/002_create_analysis_reports.sql`  
- **Persist API:** `POST /api/public/reports/persist` (writes `report_payload` as ReportSnapshotV1).  
- **Load:** `lib/report/loadSnapshot.ts` → `from("analysis_reports").select("report_payload").eq("report_id", reportId)`.

**Key files:**  
- Snapshot load: `lib/report/loadSnapshot.ts`  
- Snapshot types: `lib/report/snapshotTypes.ts`  
- Report schema types: `lib/report/types.ts`  
- Assembly: `lib/report/assembleReport.ts`  
- Score calculation: `lib/report/calculateScores.ts`  
- Shareable page: `app/r/[reportId]/page.tsx`  
- Renderer: `components/report/ReportSnapshotRenderer.tsx`  
- Persist: `app/api/public/reports/persist/route.ts`

---

## 2) Instagram Data & Comments

### Which Instagram API/scraper we use

- **No Apify.** We use our own **internal** Instagram path:
  - **Endpoint:** `POST /api/test/instagram-api` (body: `username`, optional `includeComments`).
  - **Implementation:** `app/api/test/instagram-api/route.ts`.
  - **Data source:** Instagram’s internal HTTP APIs (same as logged-in browser), with session cookie (and optional auth header):
    - Profile: `https://www.instagram.com/api/v1/users/web_profile_info/?username=...`
    - Feed: `https://www.instagram.com/api/v1/feed/user/{userId}/?count=24`
    - Post details: by shortcode (for comments).
    - Comments: REST `https://www.instagram.com/api/v1/media/{postPk}/comments/...` or GraphQL fallback.
  - **Session:** `INSTAGRAM_SESSION_ID` (env); optional refresh via `lib/services/instagram-session.ts` and `/api/instagram/session/refresh`.

### What we collect (objects)

- **Profile:** username, fullName, biography, profilePicUrl, profilePicUrlHd, followerCount, followingCount, postCount, isVerified, isBusinessAccount, category, website, userId.
- **Posts (feed):** id, shortcode, mediaType, likeCount, commentCount, caption, thumbnailUrl, videoUrl, takenAt, owner. Optionally **per-post comments** when `includeComments === true` (see below).
- **Comments (when requested):** id, text, createdAt, likeCount, owner (username, fullName, userId, profilePicUrl, isVerified), replies. Fetched via `fetchCommentsREST` or `fetchCommentsGraphQL` in `app/api/test/instagram-api/route.ts`.

### Do we collect comments for the report?

- **Yes.** The report pipeline uses the same approach as `/new-test`: `ReportScanClient` calls the Instagram API with **`includeComments: true`** (see `components/report/ReportScanClient.tsx`). The API fetches **24 posts** per profile and up to **30 comments per post** (REST or GraphQL). Comments (including replies) are flattened in `transformInstagramApiResponse` to `{ text, postContext?, authorUsername? }[]` and stored in `igResult.comments`.

### Comment fields (when comments are fetched)

- From the route’s types: `id`, `text`, `createdAt`, `likeCount`, `owner` (username, fullName, userId, profilePicUrl, isVerified), `replies` (same shape). For the report we store: `text`, `postContext` (caption snippet or `Post /p/shortcode`), `authorUsername`.

### Where comment data is stored / linked

- **localStorage:** Flattened `comments` array is part of the Instagram result stored under `analysis_${scanId}_instagram` (same key as profile + posts).
- **Snapshot:** When the report is persisted, `instagramComments` is added to `ReportSnapshotV1` (see `lib/report/snapshotTypes.ts` → `InstagramCommentSnapshot[]`). It is written in `app/report/[scanId]/analysis/page.tsx` when building the snapshot (from `igResult.comments`).
- **Link to business/reportId:** Same scan/snapshot flow: same `scanId` → same snapshot → one `report_id`; `report_payload.instagramComments` holds the list.

### Comment limits

- **Extraction (API):** 24 posts per profile; 30 comments per post (so up to 720 comments in theory). Implemented in `app/api/test/instagram-api/route.ts` (`fetchUserFeed(..., 24)`, `fetchCommentsREST`/`fetchCommentsGraphQL` with count 30).
- **AI analysis:** Only the **first 30 comments** (total) are sent to OpenAI in `analyzeComments` (`lib/ai/analyzePresence.ts` → `comments.slice(0, 30)`). Display and snapshot use all extracted comments (no extra limit).

### Where comments are used in UI and AI

- **UI:** The report shows an **“Instagram Comments”** section after Google Reviews, in both `/report/[scanId]/analysis` and `/r/[reportId]`. Rendered by `ReportInstagramComments` (`components/report/ReportInstagramComments.tsx`), which receives `igResult.comments` (analysis page) or `snapshot.instagramComments` (shareable report).
- **AI:** The analysis page sends `instagramComments` (from `igResult.comments`, mapped to `{ text, postContext }`) in the body to `POST /api/ai/analyze` when present. `analyzeFullPresence` calls `analyzeComments` for Instagram (and optionally Facebook); the result is stored in `aiAnalysis.instagramComments` and shown in the AI block.

**Key files:**  
- Instagram API route: `app/api/test/instagram-api/route.ts`  
- Client that calls it: `components/report/ReportScanClient.tsx` (search for `instagram-api`, `includeComments`, `transformInstagramApiResponse`)  
- AI comments: `lib/ai/analyzePresence.ts` (`analyzeComments`, `analyzeFullPresence` with `instagramComments`/`facebookComments`)  
- AI route: `app/api/ai/analyze/route.ts`

---

## 3) OpenAI Analysis & Prompting

Every report-related OpenAI usage goes through `lib/ai/analyzePresence.ts`. The API route is `POST /api/ai/analyze` (`app/api/ai/analyze/route.ts`). For the report, the analysis page sends `type: 'full'`, which calls `analyzeFullPresence`. There is **no separate system message**: each call uses a **single user message** (the prompt string). No dedicated “system prompt” file or template; prompts are inline in `analyzePresence.ts`.

| # | File | Function | Model | Inputs sent | Prompt structure (user message only) | Output schema / format | Where stored | Guardrails |
|---|------|----------|--------|-------------|--------------------------------------|------------------------|--------------|------------|
| 1 | `lib/ai/analyzePresence.ts` | `analyzeSocialProfile` | gpt-4o-mini | businessName, businessCategory, profile (biography, description, website, category, phone, address, hours, followerCount, postCount) | “You are an expert social media analyst for local businesses. Analyze this {platform} profile for \"{businessName}\" ({businessCategory}). Profile Data: … Analyze: 1. Is the biography/description compelling… 2. Keywords… 3. Contact info… 4. Red flags…” → JSON with score, summary, issues[], highlights[] | `{ score, summary, issues: [{ severity, category, issue, recommendation }], highlights: string[] }` | In-memory then `FullPresenceAnalysis.instagram` or `.facebook`; persisted in snapshot `aiAnalysis.instagram` / `aiAnalysis.facebook` | response_format: json_object, temperature 0.3, max_tokens 1000; try/catch fallback to default score 50 |
| 2 | `lib/ai/analyzePresence.ts` | `analyzeConsistency` | gpt-4o-mini | businessName, profiles[] (platform, description, website, phone, address, hours) | “You are a business consistency analyst. Check if \"{businessName}\" has consistent information across platforms. Platform Data: <JSON> Analyze: 1. Phone consistent? 2. Address? 3. Hours? 4. Website? 5. Descriptions? 6. Missing info?” → JSON | `{ isConsistent, score, inconsistencies[], missingInfo[] }` | `FullPresenceAnalysis.consistency`; snapshot `aiAnalysis.consistency` | Same as above, max_tokens 1000 |
| 3 | `lib/ai/analyzePresence.ts` | `analyzeReviews` | gpt-4o-mini | businessName, businessCategory, reviews[] (text, rating; optional authorName, relativeTime) | “You are a customer feedback analyst for local businesses. Analyze these Google reviews for \"{businessName}\" ({businessCategory}). Reviews (N of M total): Review 1 (5★): \"…\" … Identify: 1. Pain points 2. Negative patterns 3. Strengths 4. Recommendations” → JSON | `{ overallSentiment, sentimentScore, totalReviews, painPoints[], strengths[], summary }` | `FullPresenceAnalysis.reviews`; snapshot `aiAnalysis.reviews` | Same; max_tokens 2000; reviews limited to 50 in code |
| 4 | `lib/ai/analyzePresence.ts` | `analyzeComments` | gpt-4o-mini | businessName, platform ('instagram'\|'facebook'), comments[] (text, postContext?) | “You are a social media engagement analyst. Analyze these {platform} comments for \"{businessName}\". Comments: Comment 1: \"…\" … Analyze: 1. What are customers asking? 2. Complaints? 3. Positive patterns? 4. Missed opportunities? 5. What to address?” → JSON | Same as AnalysisResult: `{ score, summary, issues[], highlights }` | `FullPresenceAnalysis.instagramComments` / `.facebookComments`; snapshot `aiAnalysis.instagramComments` (when comments are sent). Analysis page sends `instagramComments` from `igResult.comments` when available. | comments sliced to first 30 for prompt; temp 0.3, max_tokens 1000 |

**Prompt templates:** All live in `lib/ai/analyzePresence.ts` as template literals (no separate file). No system role; only `messages: [{ role: 'user', content: prompt }]`.

**Output storage:**  
- In memory as `FullPresenceAnalysis`; then returned by `POST /api/ai/analyze`.  
- Analysis page puts result in `localStorage` under `analysis_${scanId}_ai`.  
- When the snapshot is built and persisted, that AI result is included in `report_payload.aiAnalysis` (see `snapshotTypes.ts` `AIAnalysisSnapshot`).  
- DB: `analysis_reports.report_payload` (JSONB). No separate AI table.

**Other guardrails:**  
- No explicit rate limit or retry in this file.  
- API route checks `process.env.OPENAI_API_KEY` and returns 500 if missing.  
- Truncation: reviews limited to 50; comments to 30.  
- No caching of OpenAI responses except via the snapshot once persisted.

**Key files:**  
- All prompts and calls: `lib/ai/analyzePresence.ts`  
- API entry: `app/api/ai/analyze/route.ts`  
- Client that triggers full analysis: `app/report/[scanId]/analysis/page.tsx` (effect that calls `/api/ai/analyze` with type `full`)  
- OpenAI client: `lib/ai/openaiClient.ts`

---

## 4) Key file paths (quick open)

| Purpose | Path |
|--------|------|
| Load snapshot for /r/[reportId] | `lib/report/loadSnapshot.ts` |
| Snapshot + report types | `lib/report/snapshotTypes.ts`, `lib/report/types.ts` |
| Build report from pipeline data | `lib/report/assembleReport.ts` |
| Score calculation | `lib/report/calculateScores.ts` |
| Shareable report page | `app/r/[reportId]/page.tsx` |
| Snapshot renderer | `components/report/ReportSnapshotRenderer.tsx` |
| Persist snapshot | `app/api/public/reports/persist/route.ts` |
| Instagram API (profile + posts + comments) | `app/api/test/instagram-api/route.ts` |
| Where Instagram is called (includeComments: true; transform flattens comments) | `components/report/ReportScanClient.tsx` |
| OpenAI analysis (all prompts + full presence) | `lib/ai/analyzePresence.ts` |
| AI API route | `app/api/ai/analyze/route.ts` |
| Analysis page (assemble + AI trigger + persist) | `app/report/[scanId]/analysis/page.tsx` |
| Website scan (no Apify) | `app/api/scan/website/route.ts` |
| Google reviews API | `app/api/places/reviews/route.ts` |
| Instagram comments display | `components/report/ReportInstagramComments.tsx` |
| Supabase report table | `supabase/migrations/002_create_analysis_reports.sql` |

---

## 5) Missing questions (for next steps)

To add:

1. **Sentiment analysis based on GBP reviews + Instagram comments**
2. **At least two charts in the report (different chart types)**

please clarify:

1. **Sentiment scope**  
   Should the new “sentiment” be:
   - (a) A single combined score/label (e.g. “Overall sentiment: Positive”) from both GBP reviews and Instagram comments,  
   - (b) Two separate outputs (one for reviews, one for comments) both shown in the report, or  
   - (c) One sentiment model that runs on the concatenation of review texts + comment texts, with one output?

2. **Where to show sentiment**  
   Should it live in the existing “AI analysis” block (e.g. new subsection or card), or in a new dedicated section (e.g. “Sentiment” between Top Cards and Search visibility)?

3. **Instagram comments for sentiment**  
   We **do** fetch and store Instagram comments for the report (24 posts, up to 30 comments per post; flattened in snapshot as `instagramComments`). They are already sent to AI for engagement analysis. For sentiment, do you want a **separate** sentiment pass over the same comment set, or to reuse/expand the existing engagement analysis output?

4. **Chart data source**  
   Should the two charts:
   - (a) Use only data already in the snapshot (e.g. scores over time not available; we could do score breakdown by category, or checklist pass/fail by section),  
   - (b) Use new data we start storing (e.g. time-series of scores or sentiment per scan), or  
   - (c) Mix: one from current snapshot (e.g. category scores pie/bar) and one from a new source (e.g. sentiment over time once we have multiple snapshots)?

5. **Chart types**  
   Do you have a preference for the two chart types (e.g. bar, line, pie, donut, radial) and what each should represent (e.g. “Category scores” vs “Sentiment distribution” or “Checklist health by section”)?

6. **Chart placement**  
   Where should the charts sit: same section (e.g. “Insights” with two charts), or one in AI block and one next to Search visibility / scores?

Once these are decided, the next step is to design the schema and UI for sentiment and charts (still no implementation).
