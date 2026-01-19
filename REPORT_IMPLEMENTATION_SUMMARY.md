# Report Implementation Summary

## Quick Reference

This document provides a high-level summary of the standardized Owner.com-style report structure for Antistatic.

---

## Report Structure Overview

### Left Rail (Fixed Position)
- **Online Health Grade:** 0-100 score with label (Good/Okay/Poor)
- **Category Scores:**
  - Search Results (0-40)
  - Website Experience (0-40)
  - Local Listings (0-20)
  - Social Presence (0-20) ← NEW
- **CTA Button:** "Fix in 35 seconds"

### Top Cards
1. **Impact Card:** "You could be losing ~$X/month due to N problems"
   - Shows top 3 issues
   - Business avatar/image
   - Estimated monthly loss (heuristic)

2. **Competitors Card:** "You're ranking below X competitors"
   - Top 5 competitors with rating, reviews, rank

### Main Content

#### Search Visibility Table
- **Title:** "This is how you're doing online"
- **Subtitle:** "Where you are showing up when customers search you, next to your competitors"
- Expandable rows showing:
  - Map pack results (top 3) + mini map
  - Organic results (top 10) with favicons

#### Detailed Checklist Sections
- **Header:** "{total} things reviewed, {needWork} need work"
- **4 Sections:**
  1. Search Results (SEO) - 14 checks
  2. Website Experience - 12 checks
  3. Local Listings (GBP) - 8 checks
  4. Social Presence - 9 checks ← NEW

---

## Data Source Mapping

### Primary Data Sources (Required for Full Report)

1. **Website Crawl:** `POST /api/scan/website`
   - Provides: SEO data, UX checks, business identity, search visibility, competitors
   - Used in: Search Results, Website Experience, Search Visibility, Competitors

2. **GBP Analysis:** `GET /api/gbp/place-details`
   - Provides: GBP checklist, keyword matching
   - Used in: Local Listings, Meta (rating/reviews)

3. **Social Discovery:** `POST /api/scan/socials`
   - Provides: Social links, website screenshot
   - Used in: Social Presence (discovery), Artifacts

4. **Instagram Scrape:** `POST /api/test/instagram-scrape`
   - Provides: Profile data, posts, engagement metrics
   - Used in: Social Presence (Instagram checks)

5. **Facebook Scrape:** `POST /api/test/facebook-scrape`
   - Provides: Profile data, posts (NO comments used in scoring)
   - Used in: Social Presence (Facebook checks)

6. **Places Details:** `GET /api/places/details`
   - Provides: Basic business info, website URL, rating
   - Used in: Meta, fallbacks

---

## Key Differences from Owner.com

### Added Features:
1. **Social Presence Section** (0-20 points)
   - Instagram analysis (profile completeness, posting consistency, engagement)
   - Facebook analysis (page completeness, posting consistency)
   - Social discovery status

2. **Business-Type Agnostic Language**
   - "Online ordering" → "Primary conversion CTA"
   - "Menu page" → "Services/Products page"
   - All explanations avoid restaurant-specific terms

### Maintained Features:
- Left rail with health grade
- Top impact + competitors cards
- Search visibility table with expandable rows
- Detailed checklist with "what we found" / "what we were looking for" / "why it matters" / "how to fix"
- Scoring formulas (adapted for 4 sections instead of 3)

---

## Scoring Formulas (Simplified)

### Overall Score
```
overall = searchResults + websiteExperience + localListings + socialPresence
```

### Search Results (0-40)
```
baseScore = search_visibility.visibility_score * 0.4
onPageBonus = sum of on-page SEO checks (max 10)
searchResults = min(40, baseScore + onPageBonus)
```

### Website Experience (0-40)
```
conversionScore = primary_cta (5) + contact_methods (13) + forms (2) = max 20
trustScore = testimonials (5) + reviews (5) + awards (3) + social_proof (3) + team (2) = max 18
uxScore = mobile_friendly (5) + lazy_loading (3) + image_opt (2) = max 10
websiteExperience = min(40, conversionScore + trustScore + uxScore)
```

### Local Listings (0-20)
```
gbpScore = website (3) + description (3) + hours (3) + phone (2) + price (2) + social (2) + desc_keywords (2) + categories (3) = max 20
localListings = min(20, gbpScore)
```

### Social Presence (0-20)
```
discoveryScore = instagram_found (5) + facebook_found (5) + website_screenshot (2) = max 12
instagramScore = profile_complete (7) + posting_consistency (2) + engagement (1) = max 10
facebookScore = page_complete (10) + posting_consistency (2) = max 12
socialPresence = min(20, discoveryScore + min(8, instagramScore) + min(8, facebookScore))
```

---

## Fallback Behavior

### When Website Crawl Missing:
- Search Results: Score 0, show "Website URL required" check
- Website Experience: Score 0, show empty checks with explanation
- Search Visibility: Empty queries array, show "Website analysis required" message

### When GBP Analysis Missing:
- Local Listings: Score 0, show "GBP data required" check
- Meta rating/reviews: Use Places details if available, else null

### When Social Media Missing:
- Social Presence: Score 0, show "Social profiles not found" check
- Artifacts: screenshots = null, links = null

### When Search Visibility Missing:
- Search Visibility: Empty queries array, show "Search visibility analysis not available"
- Impact card: estimatedLossMonthly = null

---

## Implementation Checklist

### Phase 1: Core Structure (Must-Have for v1)
- [ ] Create report schema TypeScript interface
- [ ] Build report assembly function (combines all analyzer outputs)
- [ ] Implement scoring functions for all 4 sections
- [ ] Create left rail component with health grade + category scores
- [ ] Create top cards component (impact + competitors)
- [ ] Create search visibility table with expandable rows
- [ ] Create checklist section components (4 sections)
- [ ] Implement fallback empty states for all missing data scenarios
- [ ] Add business-type-agnostic language throughout

### Phase 2: Data Integration (Must-Have for v1)
- [ ] Map website crawl data to Search Results checks
- [ ] Map website crawl data to Website Experience checks
- [ ] Map GBP analysis to Local Listings checks
- [ ] Map social scrapes to Social Presence checks
- [ ] Calculate impact estimation heuristic
- [ ] Extract top problems from failed checks
- [ ] Generate competitor list from competitors_snapshot
- [ ] Build search visibility queries display

### Phase 3: UI Polish (Nice-to-Have for v1, Must-Have for v2)
- [ ] Add mini map UI for map pack results (Google Maps Static API)
- [ ] Add favicon loading for organic results
- [ ] Add expand/collapse animations for checklist items
- [ ] Add expand/collapse for search visibility query rows
- [ ] Add loading states for each section
- [ ] Add error states for failed analyzers
- [ ] Add "Fix in 35 seconds" CTA action (wire to AI builder or action items)

### Phase 4: Enhancements (Nice-to-Have for v2)
- [ ] Refine impact estimation model (more sophisticated)
- [ ] Add competitor comparison charts
- [ ] Add historical trend tracking (requires database)
- [ ] Add export PDF functionality
- [ ] Add email report delivery
- [ ] Add AI-suggested action item prioritization
- [ ] Add A/B test suggestions for CTAs
- [ ] Add social media content suggestions

---

## Generalization Checklist

Ensure all text is business-type-agnostic:

- [ ] Replace "online ordering" with "primary conversion CTA"
- [ ] Replace "menu" with "services/products"
- [ ] Replace "food photos" with "product/service images"
- [ ] Replace "reservation" with "booking/appointment"
- [ ] Replace "delivery" with "service options"
- [ ] Review all helper text for restaurant-specific language
- [ ] Review all "how to fix" steps for generic applicability
- [ ] Test with different business types (dentist, plumber, salon)

---

## Testing Scenarios

### Test Case 1: Complete Data
- All analyzers succeed
- All 4 sections have data
- All checks can be evaluated
- **Expected:** Full report with all sections populated

### Test Case 2: Missing Website
- Website crawl fails or no website URL
- **Expected:** Search Results and Website Experience show empty states, other sections work

### Test Case 3: Missing GBP
- GBP analysis fails or no placeId
- **Expected:** Local Listings shows empty state, other sections work

### Test Case 4: Missing Social Media
- No Instagram/Facebook profiles found
- **Expected:** Social Presence shows "not found" checks, other sections work

### Test Case 5: Missing Search Visibility
- Search visibility analysis fails
- **Expected:** Search visibility table shows empty state, impact card shows null estimatedLossMonthly

### Test Case 6: Different Business Types
- Test with restaurant, dentist, plumber, salon
- **Expected:** All language is generic, no restaurant-specific terms

---

## File Organization

### Recommended File Structure:
```
lib/report/
  ├── assembleReport.ts          # Main assembly function
  ├── calculateScores.ts         # Scoring functions
  ├── extractProblems.ts         # Top problems extraction
  ├── estimateImpact.ts         # Impact estimation heuristic
  └── types.ts                   # ReportSchema interface

components/report/
  ├── ReportLeftRail.tsx         # Health grade + category scores
  ├── ReportTopCards.tsx         # Impact + competitors cards
  ├── ReportSearchVisibility.tsx # Search visibility table
  ├── ReportChecklistSection.tsx # Reusable checklist section
  └── ReportChecklistItem.tsx    # Individual check item with expand/collapse

app/report/[scanId]/analysis/
  └── page.tsx                   # Main report page (uses components above)
```

---

## Next Steps

1. **Review & Approve:** Review STANDARDIZED_REPORT_STRUCTURE.md and REPORT_SCHEMA_V1.md
2. **Create Types:** Implement TypeScript interfaces from REPORT_SCHEMA_V1.md
3. **Build Assembly Function:** Create `lib/report/assembleReport.ts` that combines all analyzer outputs
4. **Implement Scoring:** Create `lib/report/calculateScores.ts` with all scoring formulas
5. **Build Components:** Create React components for each section
6. **Wire Up Data:** Connect components to assembled report data
7. **Test & Iterate:** Test with real data, refine scoring formulas, polish UI

---

## Questions to Resolve

1. **Impact Estimation:** Current heuristic is simple. Should we refine with:
   - Industry benchmarks?
   - Historical data (if we add database)?
   - User-provided conversion rates?

2. **Social Engagement Thresholds:** Current thresholds (3% for small accounts, 1% for large) are generic. Should we:
   - Use industry-specific benchmarks?
   - Make them configurable?

3. **Competitor Ranking:** Currently sorted by rating + reviews. Should we:
   - Include distance?
   - Include website presence?
   - Use search visibility rank?

4. **"Fix in 35 seconds" CTA:** What should this do?
   - Navigate to AI website builder?
   - Show prioritized action items?
   - Open a modal with quick fixes?
