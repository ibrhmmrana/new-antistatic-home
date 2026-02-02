# Smart Diagnosis — Inspection & Context (No Implementation)

This document answers the inspection questions for adding a "Smart Diagnosis" feature: fault inventory, data model, AI usage, where prescriptions attach, UI plan, and constraints.

---

## 1) What I found (routes, key files)

### Share report route and renderer

| Item | Location |
|------|----------|
| **Share route** | `app/r/[reportId]/page.tsx` — Server Component; loads snapshot via `loadSnapshot(reportId)` from `@/lib/report/loadSnapshot`; renders `<ReportSnapshotRenderer snapshot={snapshot} reportId={reportId} />`. |
| **View-only** | Comment in file: "This is a VIEW-ONLY route that renders a persisted report snapshot. It does NOT trigger any analysis or external fetches." |
| **OG image** | `app/r/[reportId]/opengraph-image.tsx` — uses same `loadSnapshot(reportId)` for OG image. |

### Component tree (report rendering)

Rendered in both **analysis page** (`app/report/[scanId]/analysis/page.tsx`) and **snapshot renderer** (`components/report/ReportSnapshotRenderer.tsx`):

1. **ReportLeftRail** — Sidebar: score gauge, category scores, Share + Fix buttons.
2. **ReportTopCards** — Two cards:
   - **Impact card**: "We found X issues affecting your visibility" + business info + **top issues** (from AI topPriorities + sections, or impact.topProblems).
   - **Competitors card**: "You're ranking below X competitors" + rankings list.
3. **ReportVisualInsights** — "Competitive Edge & Insights": Performance gap bar chart, Revenue Opportunity (competitiveBenchmark), Thematic sentiment chart.
4. **ReportAIAnalysis** — "AI-Powered Analysis": Top Priorities, Review Analysis, Instagram/Facebook/Consistency collapsible panels.
5. **ReportSearchVisibility** — Search visibility table (queries, map pack, organic).
6. **Summary header** — "X things reviewed, Y need work".
7. **ReportChecklistSection** (per section) — Four sections: Search Results, Website Experience, Google Business Profile, Social Presence; each renders `section.checks` as expandable rows.
8. **ReportGoogleReviews** / **ReportInstagramComments** — Currently **hidden** (commented out).

### Snapshot / report data structures

| Type / source | File | Purpose |
|---------------|------|---------|
| **ReportSnapshotV1** | `lib/report/snapshotTypes.ts` | Full snapshot: `version`, `createdAt`, `scanId`, `place`, `report`, `aiAnalysis`, `reviews`, `supporting`, optional `instagramComments`, `sentimentAnalysis`, `thematicSentiment`, `competitiveBenchmark`. |
| **ReportSchema** | `lib/report/types.ts` | `report` in snapshot: `meta`, `scores`, `summaryCards` (impact, competitors), `searchVisibility`, `sections`, `artifacts`. |
| **ImpactCard** | `lib/report/types.ts` | `impact`: `estimatedLossMonthly`, `topProblems: TopProblem[]` (max 3), `businessAvatar`. |
| **TopProblem** | `lib/report/types.ts` | `key`, `label`, `impact` (high/medium/low), `section` (SectionId). |
| **ChecklistSection** | `lib/report/types.ts` | `id` (SectionId), `title`, `score`, `maxScore`, `checks: ChecklistItem[]`. |
| **ChecklistItem** | `lib/report/types.ts` | `key`, `label`, `status` (good/warn/bad), `whyItMatters`, `whatWeFound`, `whatWeWereLookingFor`, `howToFix`, optional `evidence`. |
| **AIAnalysisSnapshot** | `lib/report/snapshotTypes.ts` | `instagram`, `facebook`, `consistency`, `reviews`, `instagramComments`, `facebookComments`, `overallScore`, **`topPriorities`**: `Array<{ priority, source, issue, recommendation }>`. |
| **CompetitiveBenchmarkSnapshot** | `lib/report/snapshotTypes.ts` | `marketLeaderAverage`, `competitiveAdvantage`, `urgentGap`, `potentialImpact`. |

Where "checks" / "issues" / "priorities" live:

- **Checks**: `report.sections[].checks[]` — each item has `key`, `label`, `status`, `howToFix`, etc.
- **Top issues (impact card)**: Derived from `impact.topProblems` (from `extractTopProblems(sections)`) and/or `aiAnalysis.topPriorities` + lowest section in **ReportTopCards**.
- **Top Priorities (AI block)**: `aiAnalysis.topPriorities` — array of `{ priority, source, issue, recommendation }`; **no stable id**, only array index.
- **AI sub-issues**: `aiAnalysis.instagram.issues`, `aiAnalysis.facebook.issues`, `aiAnalysis.consistency.inconsistencies`, `aiAnalysis.reviews.painPoints`, etc. — each has severity/category/issue/recommendation but **no shared fault id**.

---

## 2) Fault inventory (complete list, grouped)

### Group 1 — "We found X issues affecting your visibility" (top issues)

These are the 1–3 items shown in the Impact card. They are **derived**, not a single stored list:

| Fault key | Display title | Description / help | Severity / status | Data source | Rendered in |
|-----------|----------------|--------------------|-------------------|-------------|-------------|
| (derived) | From section title + AI priorities | Combined: lowest-scoring section phrased as action + up to 3 AI topPriorities.issue strings | N/A | `report.sections` (lowest score), `aiAnalysis.topPriorities`, fallback `impact.topProblems` | `ReportTopCards.tsx` — `topIssues` (useMemo), then `impact.topProblems` if no sections |
| impact.topProblems[].key | impact.topProblems[].label | N/A | impact (high/medium/low) | `report.summaryCards.impact.topProblems` (from `extractTopProblems(sections)`) | Same card when used as fallback |

So the "fault" here is either a **section-level action** (e.g. "Improve: Google Business Profile") or an **AI priority issue string** or a **check-based TopProblem** (key + label). There is no single canonical fault id for the top-issues list; it's a mix of section id, check key, and AI issue text.

### Group 2 — "Top Priorities" (AI block)

| Fault key | Display title | Description / help | Severity / status | Data source | Rendered in |
|-----------|----------------|--------------------|-------------------|-------------|-------------|
| (none; use index or generate) | priority.issue | priority.recommendation | Implicit from priority (1–3) | `aiAnalysis.topPriorities[]` — `{ priority, source, issue, recommendation }` | `ReportAIAnalysis.tsx` — Top Priorities section |

There are **no stable ids** for Top Priorities; only array index. Source is one of: Instagram, Facebook, Google Reviews, Cross-platform.

### Group 3 — Checklist items (four sections)

**Section: "Get your website to the top of Google"** (`id: 'search-results'`)

| Fault key | Display title | Description / help | Severity / status | Data source | Rendered in |
|-----------|----------------|--------------------|-------------------|-------------|-------------|
| domain_custom | Using custom domain | whyItMatters, howToFix | good/warn/bad | report.sections (search-results).checks | ReportChecklistSection.tsx |
| h1_exists | H1 exists | same | same | same | same |
| h1_service_area | Includes the service area | same | same | same | same |
| h1_keywords | Includes relevant keywords | same | same | same | same |
| meta_desc_length | Description length | same | same | same | same |
| meta_desc_service_area | Description includes the service area | same | same | same | same |
| meta_desc_keywords | Description includes relevant keywords | same | same | same | same |
| title_matches_gbp | Page title matches Google Business Profile | same | same | same | same |
| title_service_area | Page title includes the service area | same | same | same | same |
| title_keywords | Page title includes a relevant keyword | same | same | same | same |
| images_alt_tags | Images have 'alt tags' | same | same | same | same |
| indexability | Page is indexable | same | same | same | same |
| structured_data | Structured data present | same | same | same | same |

**Section: "Improve the experience on your website"** (`id: 'website-experience'`)

| Fault key | Display title | Severity | Data source | Rendered in |
|-----------|----------------|----------|-------------|-------------|
| primary_cta | Clear call-to-action above the fold | good/warn/bad | report.sections (website-experience).checks | ReportChecklistSection.tsx |
| contact_phone | Phone number | same | same | same |
| contact_email | Email address | same | same | same |
| contact_forms | Contact form | same | same | same |
| mobile_friendly | Mobile friendly | same | same | same |
| trust_testimonials | Customer testimonials | same | same | same |
| trust_reviews | Review widgets | same | same | same |
| content_sufficient | Sufficient text content | same | same | same |
| favicon | Favicon | same | same | same |
| trust_about | Compelling About Us section | same | same | same |
| trust_faq | FAQ section | same | same | same |
| lazy_loading | Images use lazy loading | same | same | same |

**Section: "Google Business Profile"** (`id: 'local-listings'`)

| Fault key | Display title | Severity | Data source | Rendered in |
|-----------|----------------|----------|-------------|-------------|
| gbp_website | First-party website | good/warn/bad | report.sections (local-listings).checks | ReportChecklistSection.tsx |
| gbp_description | Description | same | same (from gbpAnalysis.checklist) | same |
| gbp_hours | Business hours | same | same | same |
| gbp_phone | Phone number | same | same | same |
| gbp_price / gbp_price_range | Price range | same | same | same |
| gbp_social | Social media links (on GBP) | same | same | same |
| gbp_description_keywords | Description includes relevant keywords | same | same | same |
| gbp_category_keywords | Categories match keywords | same | same | same |
| gbp_social_links | Social media links (from website) | same | same | same |
| gbp_desc_keywords | Description includes relevant keywords (keywordChecks) | same | same | same |

**Section: "Build your social media presence"** (`id: 'social-presence'`)

| Fault key | Display title | Severity | Data source | Rendered in |
|-----------|----------------|----------|-------------|-------------|
| social_instagram_found | Instagram profile found | good/bad | report.sections (social-presence).checks | ReportChecklistSection.tsx |
| social_facebook_found | Facebook page found | same | same | same |
| ig_profile_complete | Instagram profile complete | same | same | same |
| ig_posting_consistency | Posting consistency (IG) | same | same | same |
| ig_engagement_rate | Engagement rate (IG) | same | same | same |
| ig_recent_activity | Recent activity (IG) | same | same | same |
| fb_page_complete | Facebook page complete | same | same | same |
| fb_posting_consistency | Posting consistency (FB) | same | same | same |
| fb_recent_activity | Recent activity (FB) | same | same | same |

### Group 4 — Competitive components

| Fault / concept | Display | Description / help | Data source | Rendered in |
|-----------------|---------|--------------------|-------------|-------------|
| ranking_below_competitors | "You're ranking below X competitors" | N/A (informational) | report.summaryCards.competitors | ReportTopCards.tsx |
| performance_gap | Bar chart "Your scores vs market leader average" | Narrative in Revenue Opportunity | report.scores, aiAnalysis.competitiveBenchmark | ReportVisualInsights.tsx |
| competitive_advantage | "Your advantage" | competitiveBenchmark.competitiveAdvantage | aiAnalysis.competitiveBenchmark | ReportVisualInsights.tsx |
| urgent_gap | "Urgent gap" | competitiveBenchmark.urgentGap | aiAnalysis.competitiveBenchmark | ReportVisualInsights.tsx |
| potential_impact | "Revenue Opportunity" paragraph | competitiveBenchmark.potentialImpact | aiAnalysis.competitiveBenchmark | ReportVisualInsights.tsx |

These are **narrative/context** rather than discrete checklist faults; they could still get a "prescription" (e.g. Competitor Radar for urgent gap).

### Group 5 — Reviews / comments related

| Fault / concept | Display | Description / help | Data source | Rendered in |
|-----------------|---------|--------------------|-------------|-------------|
| reviews.painPoints[] | (In Review Analysis panel) | topic, recommendation, severity | aiAnalysis.reviews.painPoints | ReportAIAnalysis.tsx |
| instagram.issues[] | (In Instagram panel) | issue, recommendation, severity | aiAnalysis.instagram.issues | ReportAIAnalysis.tsx |
| facebook.issues[] | (In Facebook panel) | same | aiAnalysis.facebook.issues | ReportAIAnalysis.tsx |
| consistency.inconsistencies[] | (In Consistency panel) | field, platforms, recommendation | aiAnalysis.consistency.inconsistencies | ReportAIAnalysis.tsx |
| instagramComments.issues[] | (If shown) | same shape as instagram.issues | aiAnalysis.instagramComments?.issues | ReportAIAnalysis.tsx |
| facebookComments.issues[] | (If shown) | same | aiAnalysis.facebookComments?.issues | ReportAIAnalysis.tsx |

Google Reviews and Instagram Comments **sections** are currently hidden; the **AI panels** (Review Analysis, Instagram, Facebook, Consistency) are visible and contain the issues above. These issues have **no stable id**; they are array items with category/issue/recommendation.

---

## 3) Existing AI analysis (how priorities are made; prompt structure)

### Where OpenAI is called

| File | Function | Purpose |
|------|----------|---------|
| `lib/ai/analyzePresence.ts` | `analyzeSocialProfile` | Single profile (Instagram/Facebook/website): score, issues, highlights. |
| `lib/ai/analyzePresence.ts` | `analyzeConsistency` | Cross-platform consistency: inconsistencies, missingInfo. |
| `lib/ai/analyzePresence.ts` | `analyzeReviews` | GBP reviews: sentiment, painPoints, strengths, summary. |
| `lib/ai/analyzePresence.ts` | `analyzeComments` | Instagram/Facebook comments: score, issues, highlights. |
| `lib/ai/analyzePresence.ts` | `analyzeThematicSentiment` | Service/Food/Atmosphere/Value scores + categoryDetails. |
| `lib/ai/analyzePresence.ts` | `analyzeCompetitiveBenchmark` | Market leader avg, competitiveAdvantage, urgentGap, potentialImpact. |
| `lib/ai/analyzePresence.ts` | **`analyzeFullPresence`** | Orchestrates all of the above and **builds `topPriorities`**. |

API entry: `app/api/ai/analyze/route.ts` — POST, `type: 'full'` calls `analyzeFullPresence(businessName, businessCategory, data)` and returns `analysis: result`.

### How Top Priorities is produced

- **Fully AI-derived** from sub-analyses:
  - Instagram issues → each becomes `{ priority: severityWeight[severity], source: 'Instagram', issue, recommendation }`.
  - Facebook issues → same with source `'Facebook'`.
  - Consistency inconsistencies → `{ priority: 3, source: 'Cross-platform', issue: 'Inconsistent ${field}...', recommendation }`.
  - Review pain points → `{ priority: 1|2|3 by severity, source: 'Google Reviews', issue: topic, recommendation }`.
- **No rule-based checklist** in Top Priorities; it's purely from AI outputs.
- **Sort** by `priority` descending, **slice(0, 5)**.
- **Stored** in `aiAnalysis.topPriorities` (and in snapshot as `snapshot.aiAnalysis.topPriorities`).
- **No ids or links** today; only `priority`, `source`, `issue`, `recommendation`.

### Prompt structure (representative)

- **analyzeSocialProfile**: Single user message with profile data (bio, website, category, phone, etc.); JSON response with `score`, `summary`, `issues[]` (severity, category, issue, recommendation), `highlights[]`.
- **analyzeConsistency**: Two+ profiles; returns `isConsistent`, `score`, `inconsistencies[]`, `missingInfo[]`.
- **analyzeReviews**: Reviews + optional GBP context string; returns sentiment, painPoints, strengths, summary.
- **analyzeComments**: Comments + optional recentCaptions; same shape as profile issues.
- **analyzeCompetitiveBenchmark**: User scores, competitors, rank; returns marketLeaderAverage, competitiveAdvantage, urgentGap, potentialImpact (narrative).

---

## 4) Where prescriptions should attach (recommended schema + reasoning)

### Option 1: Add `prescription` to each checklist item / check

- **Pros**: Every checklist fault can have a prescription next to it; no extra lookup.
- **Cons**: Top Priorities and AI sub-issues (reviews, instagram, facebook, consistency) are not checklist items; they live in `aiAnalysis`. So you’d cover only checklist faults, not AI-only faults.

### Option 2: Separate `diagnosis.prescriptions[]` keyed by faultId

- **Pros**: Single map for the whole report; can key by stable fault id (e.g. `gbp_phone`, `top_priority_0`, `reviews_pain_0`).
- **Cons**: Need to define fault ids for every surface (check keys already exist; Top Priorities and AI issues need a scheme). Rendering needs to look up by fault id from many places.

### Option 3: Both — computed map + convenience field

- **Pros**: Prescriptions computed once (e.g. at persist time) into a `diagnosis.prescriptions` map by fault id; optionally also attach `prescriptionId` or `prescription` on checklist items and on Top Priorities items so UI doesn’t need to know the key scheme.
- **Cons**: Slight duplication; need to keep map and convenience fields in sync when building snapshot.

### Recommendation: **Option 3 (both)**

- **Stable fault ids**:
  - **Checklist**: Use existing `check.key`; for section-scoped id use `${section.id}:${check.key}` or just `check.key` (keys are already unique across sections in practice: search-results, website-experience, local-listings, social-presence have distinct key names).
  - **Top Priorities**: Assign a synthetic id, e.g. `top_priority_0`, `top_priority_1`, … from index (or a hash of source+issue if you want idempotence).
  - **AI sub-issues**: e.g. `instagram_issue_0`, `reviews_pain_0`, `consistency_0`, etc., or a single namespace like `ai_instagram_0`, `ai_reviews_pain_0`.
  - **Competitive**: e.g. `competitive_urgent_gap`, `competitive_advantage`, `ranking_below_competitors`.
- **Where to store**:
  - Add a **`diagnosis`** (or `smartDiagnosis`) object to the **snapshot** (and optionally to the in-memory report when building for analysis page):
    - `diagnosis.prescriptions: Record<string, Prescription>` where `Prescription = { moduleId, whyItMatters, steps: string[], ctaLabel, ctaHref }` (or your chosen shape).
  - Optionally add **`prescriptionId?: string`** on each checklist item when building the report (so the checklist component can render "Fix" without knowing the key scheme). For Top Priorities, either store prescription id in an extended topPriorities item or look up by `top_priority_${index}`.
- **When to compute**: During **analysis/persist** (see §6). So diagnosis is **computed before persist** and written into the snapshot; `/r/[reportId]` stays view-only and just reads `snapshot.report` / `snapshot.aiAnalysis` / `snapshot.diagnosis`.

---

## 5) UI integration plan (where chips appear + how panel works)

### Existing UI patterns

- **Modal**: `ThematicSentiment.tsx` and `EmailVerificationModal.tsx` use `fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50` with a white rounded content box; `role="dialog"`, `aria-modal="true"`. No drawer/slide-over in report today.
- **Expandable rows**: Checklist and AI sections use buttons + chevrons to expand/collapse content in place.

### Inline prescription trigger

- **Checklist**: Add a small clickable **chip/button** (e.g. "How to fix" or "Fix with [Module]" or an icon) **next to** the check row (e.g. right side, or under the subtext when status is bad/warn). Only show when `status !== 'good'` and a prescription exists for that `check.key`.
- **Top Priorities**: Add a chip/button next to each priority row (e.g. "Get solution" or module name). Same for Review Analysis / Instagram / Facebook / Consistency panels: per-issue chip when prescription exists for that fault id.
- **Competitive**: Optional chip next to "Urgent gap" or "Revenue Opportunity" block that opens the prescription for `competitive_urgent_gap` (or similar).

### On click: panel (drawer or modal)

- **Recommendation**: Use the **same pattern as ThematicSentiment** (centered modal, overlay) for consistency; alternatively a **right-side drawer** (slide-in panel) would keep context. Your choice.
- **Content**:
  - **Why this matters**: 1–2 lines (from prescription or existing `whyItMatters` / issue text).
  - **Prescribed module**: One of the 4 (Reputation Hub, Social Studio, Competitor Radar, Creator Hub) — name + short tagline.
  - **How to fix**: 3–7 steps (bulleted or numbered).
  - **CTA**: One primary button, e.g. "Open Reputation Hub" / "Open Social Studio" / etc., linking to module route or signup.

### Module routes / CTAs

- **Finding**: There are **no** report-level routes like `/reputation-hub`, `/social-studio`, `/competitor-radar`, `/creator-hub` in `app/`. The landing page uses components like `ProductFeatures.tsx` with assets (e.g. "reputation hub.svg"). So **module pages do not exist yet**.
- **Proposal**: Either (a) add placeholder routes (e.g. `app/reputation-hub/page.tsx`) that can later point to product or pricing, or (b) link CTAs to a **pricing/signup** page or **hash** (e.g. `/#reputation-hub`) until module pages exist. This is a product decision.

---

## 6) Constraints confirmed (view-only, persistence, where to inject)

- **`/r/[reportId]` is view-only**: Yes. It only loads the snapshot and renders `ReportSnapshotRenderer`; no analysis or external fetches. So **diagnosis must be computed before persist** and stored in the snapshot.
- **Persistence flow**:
  1. Analysis page builds `report` via `assembleReport(...)` in a useEffect when data (placeId, placesDetails, websiteResult, gbpAnalysis, etc.) is available.
  2. AI analysis is requested (e.g. when placeId, placesDetails, and some of ig/fb/reviews exist); result is stored in `aiAnalysis` and optionally in localStorage.
  3. When AI is ready (or timeout), the page runs **buildAndPersistSnapshot**: it builds a `ReportSnapshotV1` object (place, report, aiAnalysis, reviews, supporting, etc.) and POSTs `{ snapshot }` to **`/api/public/reports/persist`**.
  4. Persist API validates `ReportSnapshotV1`, sanitizes, and upserts into Supabase `analysis_reports` (report_payload = snapshot).
  5. Client then redirects to `/r/${newReportId}`.
- **Where to inject diagnosis**:
  - **Option A (client)**: In the analysis page, **before** calling buildAndPersistSnapshot, run a **diagnosis step** that takes `report`, `aiAnalysis`, and optionally competitiveBenchmark, and returns `diagnosis: { prescriptions: Record<string, Prescription> }`. Append `diagnosis` to the snapshot object you send to persist. No new API needed if the mapping is rule-based.
  - **Option B (server)**: Add a server step (e.g. in persist API or a separate API) that receives the same payload, computes diagnosis, and merges it into the snapshot before saving. Prefer if diagnosis uses OpenAI or heavy logic you don’t want on the client.
  - **Schema**: Add `diagnosis?: { prescriptions: Record<string, Prescription> }` to **ReportSnapshotV1** in `lib/report/snapshotTypes.ts` so existing snapshots without it still load (optional field).

---

## 7) Questions for you

1. **Module routes**: Should prescription CTAs link to new routes (e.g. `/reputation-hub`, `/social-studio`, `/competitor-radar`, `/creator-hub`), or to a single pricing/signup page (or hash on homepage) until those product pages exist?
2. **Diagnosis logic**: Should "prescribed module" and "how to fix" steps be **rule-based** (e.g. map fault key → module + static steps) or **AI-generated** (e.g. one more OpenAI call per fault or per report that returns module + steps)? If AI, should it run on the client before persist or on the server (e.g. in persist API)?
3. **Top Priorities id**: For Top Priorities, is it acceptable to use **index-based** ids (`top_priority_0`, …) given that the list is already fixed at persist time, or do you want a stable id (e.g. hash of source+issue) for de-duplication across re-runs?
4. **Competitive "faults"**: Should "Urgent gap" and "You're ranking below X competitors" be first-class prescription targets (with their own fault ids and prescriptions), or only checklist + AI issues?
5. **Panel UX**: Prefer a **centered modal** (like ThematicSentiment) or a **right-side drawer** for the prescription panel on desktop? On mobile, same as desktop or full-screen?

---

*End of Smart Diagnosis inspection document. No implementation was done; this is for planning only.*
