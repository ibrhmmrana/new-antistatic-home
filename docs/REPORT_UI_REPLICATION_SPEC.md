# Antistatic Report UI — Exact Replication Spec

**Purpose:** This document allows an LLM or developer in a **different webapp** to replicate the **final report UI exactly**. Reports are stored in a **shared database**; the other app will have the same snapshot data. Only the **UI and layout** must be duplicated.

---

## STRICT PROMPTS FOR THE LLM (do these literally)

1. **Copy the “Page Layout” block in Section 2 exactly** — same `className`s, same component order, same props. Only map your snapshot variable names to the props (e.g. `report`, `place`, `supporting`, `aiAnalysis`, `reportId`).
2. **Copy the “Global CSS” block in Section 3 exactly** — paste it into your global stylesheet without changing selectors or property values.
3. **Copy the “ReportSnapshotV1” and related TypeScript interfaces exactly** — use them as your canonical snapshot and report types so data binding matches.
4. **Copy the “SectionWithExpand” component in Section 8 exactly** — same JSX, same state, same button text (“Show N more”, “Show less”) and classes.
5. **Copy the “getStatusIcon” and “LOCAL_LISTINGS_LABEL_MAP” / “Module IDs and mapping constants” blocks in Section 8 exactly** — same keys, same labels, same module names and pill lead copy.
6. **Use the same Tailwind and custom class names** everywhere the spec specifies them (e.g. `report-issues-card`, `data-grade`, `md:ml-[21rem]`, `strip-cta-left`, `footer-cta-left`, `button-roll-text`, `button-icon-rotate`). Do not rename or “simplify” them.
7. **Do not add or remove sections** — render ReportAntistaticIntro, ReportVisualInsights, AllModulesShowcase, ReportAIAnalysis, ReportTopCards, ReportSearchVisibility, RecommendedFixStrip, summary header, then each ReportChecklistSection with its RecommendedFixStrip, then PrescriptionDrawer, in that order.
8. **In snapshot mode, do not call** `/api/scan`, `/api/places`, `/api/ai/analyze`, or `/api/gbp`. Use only data from the loaded snapshot (including `supporting.markerLocations` for maps and `place.businessPhotoUrl` for avatar).

---

## CRITICAL INSTRUCTIONS FOR THE LLM

1. **Copy and paste code blocks marked "COPY EXACTLY" character-for-character** where indicated. Do not paraphrase, simplify, or "equivalent" them.
2. **Preserve all class names, inline styles, structure, and order** of elements. The design depends on Tailwind classes and a few custom CSS classes.
3. **Data comes from the snapshot only.** Do not add API calls for report data. The snapshot contains everything needed to render the report (scores, sections, search visibility, AI analysis, place info, reviews, marker locations for maps).
4. **Snapshot mode:** When rendering from a persisted snapshot, pass flags so components do not fetch (e.g. `snapshotMode={true}`, `snapshotMarkerLocations`, `snapshotPhotoUrl`, `blurContent` for checklist sections as in the reference).
5. **Assets:** Use the same image paths or host equivalent assets (logos, module images, footer bg, arrow icon). Paths are listed in the Assets section.
6. **Dependencies:** Use the same libraries where specified (e.g. Recharts for bar chart, lucide-react for icons, Google Maps for map pack if you show maps).

---

## 1. Data Source and Snapshot Shape

- **Storage:** The report is stored in a shared database. The canonical shape is **ReportSnapshotV1** (see below).
- **Table:** e.g. `analysis_reports` with at least `report_id` and `report_payload` (JSON).
- **Loading:** Given a `reportId`, load the row and parse `report_payload` as ReportSnapshotV1. Do not call any scan/places/AI APIs.

### ReportSnapshotV1 (TypeScript) — COPY EXACTLY for your types

```ts
interface PlaceSnapshot {
  placeId: string;
  name: string;
  addr: string;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  businessPhotoUrl: string | null;
}

interface MarkerLocation {
  placeId: string;
  lat: number;
  lng: number;
  name: string;
}

interface ReportSnapshotV1 {
  version: 1;
  createdAt: string;   // ISO
  scanId: string;
  place: PlaceSnapshot;
  report: ReportSchema; // see ReportSchema below
  aiAnalysis: AIAnalysisSnapshot | null;
  reviews: ReviewSnapshot[];
  instagramComments?: InstagramCommentSnapshot[];
  sentimentAnalysis?: SentimentAnalysisSnapshot;
  thematicSentiment?: ThematicSentimentSnapshot;
  competitiveBenchmark?: CompetitiveBenchmarkSnapshot;
  supporting: { markerLocations: Record<string, MarkerLocation> };
  diagnosis?: DiagnosisSnapshot;
}
```

**ReportSchema** (minimal fields used by the UI):

- `report.meta`: `businessName`, `placeId`, `websiteUrl`, `locationLabel`, etc.
- `report.scores`: `overall` (score, maxScore, label: 'Good'|'Okay'|'Poor'), `searchResults`, `websiteExperience`, `localListings`, `socialPresence` (each: score, maxScore, label).
- `report.summaryCards.impact`: `topProblems`, `businessAvatar`.
- `report.summaryCards.competitors`: `count`, `list` (each: name, rating, reviewCount, rank, isTargetBusiness).
- `report.searchVisibility`: `visibilityScore`, `queries` (each: query, intent, rationale, mapPack { rank, results }, organic { rank, results }, notes). Each mapPack result: placeId, name, rating, reviews, address, website, isTargetBusiness. Each organic result: position, title, link, displayLink, snippet, faviconUrl, domain, isTargetBusiness.
- `report.sections`: array of ChecklistSection: id, title, score, maxScore, checks[]. Each check: key, label, status ('good'|'warn'|'bad'), whyItMatters, whatWeFound, whatWeWereLookingFor, howToFix.

**AIAnalysisSnapshot** (for ReportAIAnalysis / ReportVisualInsights): instagram, facebook, consistency, reviews, instagramComments, facebookComments, overallScore, **topPriorities**: array of { priority, source, issue, recommendation }.

**ThematicSentimentSnapshot**: service, food, atmosphere, value (0–100), optional categoryDetails, optional categories (industry axes).

**CompetitiveBenchmarkSnapshot**: marketLeaderAverage (searchResults, websiteExperience, localListings, socialPresence), competitiveAdvantage, urgentGap, potentialImpact.

**Prescription** (drawer): id, moduleId, moduleName, moduleTagline, title, whyThisMatters, howToFix[], ctaLabel, ctaHref.

---

## 2. Page Layout — COPY EXACTLY the structure and classes

The report page is a single full-height layout: **left rail (sidebar) + main content**. Mobile: sidebar hidden; sticky footer with Share + CTA.

```tsx
<div className="min-h-screen bg-white md:bg-[#f6f7f8] flex overflow-x-hidden">
  {/* Left Rail - hidden on mobile */}
  <ReportLeftRail
    scores={report.scores}
    reportId={reportId}
    businessName={report.meta.businessName}
    businessPhotoUrl={place.businessPhotoUrl || report.summaryCards.impact.businessAvatar}
  />

  <div className="flex-1 min-w-0 p-4 sm:p-6 md:p-8 pb-24 md:pb-8 md:ml-[21rem]">
    <div className="max-w-6xl mx-auto w-full max-w-full">
      <ReportAntistaticIntro reportId={reportId} scanId={snapshot.scanId} placeId={place.placeId} />
      <ReportVisualInsights scores={report.scores} businessName={report.meta.businessName} thematicSentiment={snapshot.thematicSentiment} competitiveBenchmark={snapshot.competitiveBenchmark} aiAnalysis={aiAnalysis ?? null} />
      <AllModulesShowcase />
      <ReportAIAnalysis analysis={aiAnalysis} isLoading={false} onlyTopPriorities />
      <ReportTopCards impact={report.summaryCards.impact} competitors={report.summaryCards.competitors} businessName={report.meta.businessName} websiteUrl={report.meta.websiteUrl} businessAvatar={place.businessPhotoUrl || report.summaryCards.impact.businessAvatar} placeId={report.meta.placeId} sections={report.sections} overallGrade={report.scores.overall.label} aiAnalysis={aiAnalysis} snapshotMode={true} snapshotPhotoUrl={place.businessPhotoUrl} />
      <ReportSearchVisibility searchVisibility={report.searchVisibility} targetPlaceId={report.meta.placeId} targetDomain={report.meta.websiteUrl || null} snapshotMode={true} snapshotMarkerLocations={supporting.markerLocations} />
      <RecommendedFixStrip modules={SEARCH_VISIBILITY_MODULES} hasAnyFault={false} onOpenPrescription={handleOpenPrescription} />

      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-1">{totalChecks} things reviewed, {needWork} need work</h2>
        <p className="text-sm text-gray-600">See what&apos;s wrong and how to improve</p>
      </div>

      {report.sections.map((section) => (
        <div key={section.id}>
          <ReportChecklistSection section={section} blurContent />
          {CHECKLIST_SECTION_MODULES[section.id] && (
            <RecommendedFixStrip modules={CHECKLIST_SECTION_MODULES[section.id]} hasAnyFault={sectionNeedWork} onOpenPrescription={handleOpenPrescription} />
          )}
        </div>
      ))}
    </div>
  </div>

  <PrescriptionDrawer open={drawerOpen} onOpenChange={setDrawerOpen} prescription={activePrescription} />
</div>
```

- `totalChecks` = sum of section.checks.length; `needWork` = count of checks with status 'bad' or 'warn'.
- **Section module mapping:** `CHECKLIST_SECTION_MODULES`: `"local-listings"` → `["reputation_hub"]`, `"social-presence"` → `["social_studio"]`, `"search-results"` → `["competitor_radar"]`, `"website-experience"` → null. `SEARCH_VISIBILITY_MODULES` = `["creator_hub"]`.

---

## 3. Global CSS — COPY EXACTLY

Add these rules to your global stylesheet so the report looks identical.

```css
/* "We found X issues" card: score-based background only below desktop (md = 768px) */
@media (max-width: 767px) {
  .report-issues-card[data-grade="Good"] {
    background-color: #dcfce7;
  }
  .report-issues-card[data-grade="Okay"] {
    background-color: #ffddd2;
  }
  .report-issues-card[data-grade="Poor"] {
    background-color: #f7d7d1;
  }
}

/* Report: mobile-only – performance gap legend centre aligned */
@media (max-width: 767px) {
  .report-visual-insights .recharts-legend-wrapper {
    display: flex !important;
    justify-content: center !important;
  }
}

/* Button roll text (hover) */
.button-roll-text {
  position: relative;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.button-roll-text span {
  display: block;
  transition: transform 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}
.button-roll-text::after {
  content: attr(data-text);
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, 150%);
  white-space: nowrap;
  transition: transform 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}
.button-roll-text:hover span {
  transform: translateY(-150%);
}
.button-roll-text:hover::after {
  transform: translate(-50%, -50%);
}
.strip-cta-left::after {
  left: 1rem;
  transform: translateY(150%);
}
.strip-cta-left:hover::after {
  transform: translateY(-50%);
}
@media (min-width: 768px) {
  .strip-cta-left::after {
    left: 1.5rem;
  }
}
.footer-cta-left::after {
  left: 2rem;
  transform: translateY(150%);
}
.footer-cta-left:hover::after {
  transform: translateY(-50%);
}
@media (min-width: 768px) {
  .footer-cta-left::after {
    left: 2.5rem;
  }
}
.button-icon-rotate {
  transition: transform 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}
.button-roll-text:hover .button-icon-rotate {
  transform: rotate(45deg);
}
@media (prefers-reduced-motion: reduce) {
  .button-roll-text span,
  .button-roll-text::after {
    transition: none;
  }
  .button-roll-text:hover span {
    transform: none;
  }
  .button-roll-text:hover::after {
    transform: none;
  }
  .button-roll-text:hover .button-icon-rotate {
    transform: rotate(45deg);
  }
}
```

---

## 4. Component-by-Component Spec

### 4.1 ReportLeftRail

- **Role:** Fixed left sidebar (hidden on mobile) with overall score gauge, category scores, business photo/name, Share button, “Start fixing on a free trial” CTA. Mobile: sticky bottom bar with Share + CTA only.
- **Props:** scores, reportId, businessName, businessPhotoUrl.

**COPY EXACTLY** the following structure and classes. Only the values (scores, labels, URLs) come from props.

- **Grade colors:** Good → green (`#10b981`, bg `#dcfce7`, border `#a7f3d0`); Okay → orange (`#f97316`, bg `#ffddd2`, border `#fda4a4`); Poor → orange-red (`#ea580c`, bg `#f7d7d1`, border `#fdba74`).
- **Circular gauge:** SVG circle, radius 50, stroke `#ecd1cc` background; progress arc with `strokeDasharray`/`strokeDashoffset` from `(overall.score/overall.maxScore)*100`. Center text: `{overall.score}` and `/100`.
- **Sidebar container:** `hidden md:flex flex-shrink-0 w-80 fixed left-4 top-4 p-4 flex-col ... rounded-2xl border-2 z-10` with `height: calc(100vh - 2rem)` and dynamic backgroundColor/borderColor from grade.
- **Mini circular progress** for Search Results, Website Experience, Local Listings: same logic, radius 12, same color by label.
- **Share button:** Copy link `{origin}/r/{reportId}`; show “Link copied!” with check icon for 2s after copy.
- **Mobile footer:** `md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.08)]`; two buttons: Share + “Start fixing on a free trial” (Sparkles icon).

### 4.2 ReportAntistaticIntro

- **Role:** Intro card with gradient background, Antistatic logo, headline “Your customers decide your reputation in public, every day.”, short copy, outcome callout (“Turn a 3.9-star perception into a 4.6-star reality”), and optional fixed pill (logo + “Unlock full report” button).
- **Styling:** Section with `rounded-2xl`, `boxShadow: "0 8px 32px rgba(0,0,0,0.06)"`, `background: "linear-gradient(135deg, #fefefe 0%, #f8f7fc 50%, #f2f0f8 100%)"`, `border: "1px solid rgba(6, 3, 21, 0.08)"`. Top accent bar `height: 1` `backgroundColor: #060315`.
- **COPY EXACTLY:** Use the same headline text, paragraph text, and callout text. Logo: `/images/antistatic logo on white.svg`. “Analyze your business at antistatic.ai” with blue `#2563eb`.

### 4.3 ReportTopCards

- **Role:** Two cards side by side (grid cols 1 md:2): (1) “We found N issues affecting your visibility” with business avatar, name, website, and top 3 issues (AlertTriangle icon + label); (2) Competitors ranking (“You’re ranked #1!” / “You’re ranking below N competitors”) with list of competitors (rank, name, rating, “You” highlight).
- **Props:** impact, competitors, businessName, websiteUrl, businessAvatar, placeId, sections, overallGrade, aiAnalysis, snapshotMode, snapshotPhotoUrl.
- **Issues card:** Root div must have `className="report-issues-card ..."` and `data-grade={overallGrade}` so the global CSS applies on mobile. Min height `min-h-[274px]`, `rounded-xl border border-gray-200 p-4 shadow-md bg-white`.
- **Avatar:** 28×28 (w-28 h-28) rounded-xl; fallback first letter of businessName in gray circle. In snapshot mode use snapshotPhotoUrl / businessAvatar only (no fetch).
- **Competitors list:** Scrollable `md:max-h-[260px]`, user row with `bg-blue-50 rounded-lg`, rank 1st/2nd/3rd in green/orange. Blur competitor names for rank ≤ 5 if desired (reference uses `blur-sm select-none` for non-target).

### 4.4 ReportVisualInsights

- **Role:** Section “{businessName} Competitive Edge & Insights” with: (1) Performance gap bar chart (your business vs Top 3 Competitors avg) — Recharts BarChart, bars #c41a75 (business) and #2563eb (competitors); (2) Revenue Opportunity copy (potentialImpact, competitiveAdvantage, urgentGap); (3) Thematic Sentiment (embedded); (4) ReportAIAnalysisRest (Review Analysis + Issues & missing info).
- **Container:** `rounded-2xl border border-white/20 bg-white/70 backdrop-blur-md ...` with `boxShadow: "0 8px 32px rgba(0,0,0,0.06)"`. Section title `text-2xl font-semibold text-gray-900`.
- **Chart:** Recharts ResponsiveContainer, BarChart, XAxis (category), YAxis 0–100, Bar maxBarSize={32}, radius [4,4,0,0]. Tooltip with border and shadow as in reference.

### 4.5 ThematicSentiment (embedded)

- **Role:** “Thematic Sentiment (across Google and social media)” with horizontal bars (label + bar 0–100 + score). Optional “Why?” button opening modal with justification and supporting quotes.
- **Bar colors:** Service #2563eb, Food #3b82f6, Atmosphere #60a5fa, Value #93c5fd; or use dynamic palette for categories[]. Modal: “{theme} — Why this score?”, “The why”, “The proof (quotes)”.

### 4.6 ReportAIAnalysis

- **Role:** “AI-Powered Analysis” with Sparkles icon; collapsible “Top Priorities” with list of priority (number, source icon, issue, recommendation). Source icons: Instagram/Facebook from images, Google/review = SVG G logo, Cross-Platform/consistency = Layers icon.
- **onlyTopPriorities=true:** Only show header and Top Priorities block (no Review / Consistency / Social sections — those are in ReportAIAnalysisRest below Thematic Sentiment).
- **COPY EXACTLY:** Button toggles ChevronUp/ChevronDown; list items `flex items-start gap-3 py-3 px-3`, numbered, SourceIcon + issue + recommendation.

### 4.7 ReportAIAnalysisRest

- **Role:** Below Thematic Sentiment: “Review Analysis (sentiment/100)”, summary, Pain Points (red-50 cards), Strengths (green-50); then “Issues & missing info” with Cross-Platform / Instagram / Facebook icons and severity styling.
- **Container:** `pt-4 mt-4 rounded-xl border border-gray-200 p-4 md:p-5`.

### 4.8 ReportSearchVisibility

- **Role:** “This is how you’re doing online” — list of search queries; each row expandable to show Google Maps results (map + top 3 list) and Google Search results (organic list with favicon, displayLink, title). In snapshot mode use **snapshotMarkerLocations** to place map markers (no /api/places/details calls).
- **Map:** Google Maps with markers; target business = black circle, others = red circle. Options: disableDefaultUI, zoomControl: false, no POI labels.
- **Favicon for organic:** Use `result.faviconUrl` if present; else `https://www.google.com/s2/favicons?domain=${encodeURIComponent(displayLink)}&sz=64`.
- **Badges:** “#1: {name}”, “Unranked on Google Maps”, “Unranked on Google Search”, “Ranked #N on Google Maps”, “Ranked #N on Google Search”. Unranked background `#ffb4b4`.

### 4.9 ReportChecklistSection

- **Role:** Section card with title, score (score/maxScore), “N things reviewed, M need work”. Expandable rows per check: status icon (green check / amber alert / red X), label, one-line (howToFix if faulty else whatWeFound), chevron. Expanded: “What we found”, “What we were looking for”, “How to fix” (if faulty).
- **blurContent:** When true (snapshot/demo), apply `blur-sm select-none` to analysis paragraphs and to the one-line preview; keep headings unblurred.
- **Label map for local-listings (COPY EXACTLY):**
```ts
const LOCAL_LISTINGS_LABEL_MAP: Record<string, string> = {
  gbp_price: "Price range",
  gbp_price_range: "Price range",
  gbp_social: "Social media links",
  gbp_description_keywords: "Description includes relevant keywords",
  gbp_desc_keywords: "Description includes relevant keywords",
  gbp_category_keywords: "Categories match keywords",
};
```
  Use: `sectionId === "local-listings" && LOCAL_LISTINGS_LABEL_MAP[check.key] ?? check.label`.

### 4.10 RecommendedFixStrip

- **Role:** Rounded strip with footer bg image; text “{MODULE_PILL_LEAD[moduleId]}” + button “{MODULES[moduleId].name}” with arrow icon, hover roll effect. Same background image as AllModulesShowcase: `/images/footer bg.svg`.
- **MODULE_PILL_LEAD:** reputation_hub “Generate more reviews with”, social_studio “Create content with”, competitor_radar “Track your competitors with”, creator_hub “Work with local influencers in”.
- **Button:** `bg-gradient-to-r from-blue-500 to-blue-600`, rounded 50px, `button-roll-text strip-cta-left`, `data-text={MODULES[moduleId].name}`, arrow in circle on right `button-icon-rotate`.

### 4.11 AllModulesShowcase

- **Role:** “How Antistatic can help” with four module images (Creator Hub, Reputation Hub, Social Studio, Competitor Radar) with slight rotation and hover scale; “Explore all modules” CTA button; lightbox on image click.
- **Images:** `/images/creator hub.svg`, `/images/reputation hub.svg`, `/images/social studio.svg`, `/images/competitor radar.svg`. Background same `/images/footer bg.svg`. CTA: `footer-cta-left`, `data-text="Explore all modules"`, arrow icon.

### 4.12 PrescriptionDrawer

- **Role:** Slide-in drawer (right on desktop, full-screen on mobile). Overlay `bg-black/40` desktop only. Content: title, module badge (name + tagline), “Why this matters”, “How to fix” (numbered list), “Sign up” CTA to app.antistatic.ai. Close button at bottom.
- **COPY EXACTLY:** `fixed top-4 right-4 bottom-4 left-4 ... md:left-auto md:w-full md:max-w-lg`, transform translateX(100%+2rem) when closed.

### 4.13 ShareButton

- **Role:** Button “Share Report” with Link2 icon; on click copy `{origin}/r/{reportId}`; show “Link copied!” + Check icon for 2s.
- **Classes:** `flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50`.

### 4.14 SectionWithExpand

- **Role:** List of items; show first `maxVisible` (default 3), then “Show N more” (ChevronDown); when expanded show all and “Show less” (ChevronUp). Used for search visibility queries and for checklist (different renderRow).
- **COPY EXACTLY:** Same state (expanded boolean), same button classes and aria-expanded.

---

## 5. Assets (images) — use same paths or equivalent

| Path | Usage |
|------|--------|
| `/images/antistatic logo on white.svg` | Intro, pill |
| `/images/footer bg.svg` | RecommendedFixStrip, AllModulesShowcase background |
| `/images/arrow icon.svg` | CTA buttons (strip, footer) |
| `/images/creator hub.svg` | AllModulesShowcase |
| `/images/reputation hub.svg` | AllModulesShowcase |
| `/images/social studio.svg` | AllModulesShowcase |
| `/images/competitor radar.svg` | AllModulesShowcase |
| `/images/instagram-2-1-logo-svgrepo-com.svg` | ReportAIAnalysis source icon |
| `/images/2023_Facebook_icon.svg` | ReportAIAnalysis source icon |

---

## 6. Dependencies

- **Tailwind CSS** (all spacing, colors, typography as in classes above).
- **lucide-react:** Sparkles, ChevronDown, ChevronUp, Check, X, AlertCircle, Unlock, Share2, Check, Copy, Link2, AlertTriangle, Layers, Info, CheckCircle2.
- **recharts:** ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend (for ReportVisualInsights and ThematicSentiment if you use a chart for thematic).
- **Google Maps (optional):** @react-google-maps/api for ReportSearchVisibility map; in snapshot mode use precomputed marker positions from `supporting.markerLocations`.
- **Next.js Image (optional):** You can use plain `<img>` for snapshot-only app; preserve same aspect ratios and sizes.

---

## 7. Summary Checklist for the LLM

- [ ] Load snapshot by reportId from shared DB; no scan/places/AI API calls.
- [ ] Use exact page wrapper and main content classes (`min-h-screen`, `md:bg-[#f6f7f8]`, `md:ml-[21rem]`, `max-w-6xl`, etc.).
- [ ] Implement ReportLeftRail with circular gauge, grade colors, mini scores, Share + CTA; mobile sticky footer.
- [ ] Implement ReportAntistaticIntro with gradient, logo, headline, callout; optional pill.
- [ ] Implement ReportTopCards with issues card (data-grade, report-issues-card) and competitors card.
- [ ] Implement ReportVisualInsights with Recharts bar chart (colors #c41a75, #2563eb), Revenue Opportunity, ThematicSentiment, ReportAIAnalysisRest.
- [ ] Implement ReportAIAnalysis (only Top Priorities when onlyTopPriorities=true), ReportChecklistSection with blurContent support.
- [ ] Implement ReportSearchVisibility with snapshotMarkerLocations; favicon fallback for organic results.
- [ ] Implement RecommendedFixStrip, AllModulesShowcase, PrescriptionDrawer, ShareButton, SectionWithExpand.
- [ ] Copy global CSS for .report-issues-card, .report-visual-insights, .button-roll-text, .strip-cta-left, .footer-cta-left, .button-icon-rotate.
- [ ] Use same section order and same module mappings (CHECKLIST_SECTION_MODULES, SEARCH_VISIBILITY_MODULES).
- [ ] Preserve exact copy (“We found N issues…”, “things reviewed, N need work”, “This is how you’re doing online”, etc.) and exact class names for pixel-accurate match.

---

## 8. COPY-EXACTLY Code Blocks (paste into your codebase as-is where applicable)

**Prompt for the LLM:** Copy each of the following blocks exactly. Only replace the type imports or framework-specific bits (e.g. `@/lib/...`) with your own module paths; do not change class names, structure, or text.

### SectionWithExpand component (generic list with Expand/Collapse)

```tsx
const DEFAULT_MAX_VISIBLE = 3;

interface SectionWithExpandProps<T> {
  items: T[];
  renderRow: (item: T, index: number) => React.ReactNode;
  maxVisible?: number;
  className?: string;
}

export default function SectionWithExpand<T>({
  items,
  renderRow,
  maxVisible = DEFAULT_MAX_VISIBLE,
  className = "",
}: SectionWithExpandProps<T>) {
  const [expanded, setExpanded] = useState(false);
  const total = items.length;
  const shouldCollapse = total > maxVisible;
  const visibleItems = shouldCollapse && !expanded ? items.slice(0, maxVisible) : items;
  const hiddenCount = total - maxVisible;

  return (
    <div className={className}>
      {visibleItems.map((item, i) => (
        <Fragment key={i}>{renderRow(item, i)}</Fragment>
      ))}
      {shouldCollapse && (
        <div className="flex justify-center py-3">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded-lg px-3 py-2 transition-colors"
            aria-expanded={expanded}
          >
            {expanded ? (
              <>
                <ChevronUp className="w-4 h-4" aria-hidden />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" aria-hidden />
                Show {hiddenCount} more
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
```

### Report Check status icons (for ReportChecklistSection)

```tsx
function getStatusIcon(status: string) {
  const iconClass = "w-3 h-3 text-white flex-shrink-0";
  switch (status) {
    case "good":
      return (
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-600 flex-shrink-0">
          <Check className={iconClass} strokeWidth={3} />
        </span>
      );
    case "warn":
      return (
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 flex-shrink-0">
          <AlertCircle className={iconClass} strokeWidth={2.5} />
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-600 flex-shrink-0">
          <X className={iconClass} strokeWidth={3} />
        </span>
      );
  }
}
```

### Module IDs and mapping constants (COPY EXACTLY)

```ts
export type ModuleId = "reputation_hub" | "social_studio" | "competitor_radar" | "creator_hub";

export const SEARCH_VISIBILITY_MODULES: [ModuleId] = ["creator_hub"];

export const CHECKLIST_SECTION_MODULES: Record<string, [ModuleId] | [ModuleId, ModuleId] | null> = {
  "local-listings": ["reputation_hub"],
  "social-presence": ["social_studio"],
  "search-results": ["competitor_radar"],
  "website-experience": null,
};

export const MODULE_PILL_LEAD: Record<ModuleId, string> = {
  reputation_hub: "Generate more reviews with",
  social_studio: "Create content with",
  competitor_radar: "Track your competitors with",
  creator_hub: "Work with local influencers in",
};

export const MODULES: Record<ModuleId, { name: string; tagline: string; ctaLabel: string; ctaHref: string }> = {
  reputation_hub: { name: "Reputation Hub", tagline: "Reviews & messaging", ctaLabel: "Open Reputation Hub", ctaHref: "/#reputation-hub" },
  social_studio: { name: "Social Studio", tagline: "Content & insights", ctaLabel: "Open Social Studio", ctaHref: "/#social-studio" },
  competitor_radar: { name: "Competitor Radar", tagline: "Watchlist & alerts", ctaLabel: "Open Competitor Radar", ctaHref: "/#competitor-radar" },
  creator_hub: { name: "Creator Hub", tagline: "Creator partnerships", ctaLabel: "Open Creator Hub", ctaHref: "/#creator-hub" },
};
```

### Favicon helper (organic results)

```ts
export function getFaviconUrl(link: string, displayLink?: string): string {
  let domain = displayLink ?? (() => {
    try {
      const url = new URL(link.startsWith("http") ? link : `https://${link}`);
      return url.hostname;
    } catch {
      return link;
    }
  })();
  domain = domain.replace(/^www\./, "");
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}
```

---

End of spec.
