# Google Places API — Keep or Remove?

Your current monthly bill breakdown (Feb 10–11 spike):

| SKU | Usage | Raw Cost | After Savings |
|-----|-------|----------|---------------|
| **Places Details** | 50,455 calls | $185.13 | $23.83 |
| **Atmosphere Data** | 51,075 calls | $77.17 | $9.64 |
| **Contact Data** | 51,075 calls | $46.01 | $5.49 |
| **Places Photo** | 8,765 calls | $29.54 | $2.72 |

Below is every data field or API call grouped by the SKU it triggers. For each one, I show you **what data it fetches**, **a real example**, and **where in the app it's used**. Reply with **KEEP** or **REMOVE** next to each.

---

## 1. ATMOSPHERE DATA — $77.17/month (Enterprise + Atmosphere tier)

Atmosphere Data is triggered whenever ANY of these fields appear in a Place Details field mask. You currently request one of them.

### 1A. `editorialSummary` (Google's short description of the business)

**Example data returned:**
```
"A neighborhood café serving single-origin coffee and pastries in a relaxed setting."
```

**Where it's used:**
- **Onboarding Stage 1 (GBP card):** Shown as the business description text below the photo/map, e.g. *"Description: A neighborhood café serving..."*
- **GBP Analyzer (`analyzeGbp`):** Checks whether the business has a description or not. If missing, marks "Description" as ❌ in the report checklist. Also extracts keywords from the description for SEO analysis.
- **Report AI summaries:** The description is passed to the AI analyzer as context.

**What happens if removed:** The GBP card in onboarding would show "Description not found" (with a red warning). The report checklist would always mark "Description" as ❌ bad. AI analysis loses a small bit of context. You still see the business name, rating, address, photo, and map.

> **1A. `editorialSummary` →** REMOVE, but adjust the onboarding to just say "Finding description" with a loading icon. Adjust the AI analysis so that we do not take the description into account.

---

## 2. CONTACT DATA — $46.01/month (Enterprise tier)

Contact Data is triggered whenever ANY of these fields appear in a Place Details field mask. You currently request all three.

### 2A. `internationalPhoneNumber` (phone in international format)

**Example data returned:**
```
"+27 21 424 1836"
```

**Where it's used:**
- **Onboarding Stage 1 (GBP card):** Shown as "Phone: +27 21 424 1836" (clickable link). If missing, shows a red warning "Phone number not found".
- **GBP Analyzer:** Checks if the business has a phone number. If missing, marks "Phone number" as ❌ in the report checklist.
- **Report details response:** Returned as `phoneNumber` in the `/api/places/details` JSON.

> **2A. `internationalPhoneNumber` →** KEEP

### 2B. `nationalPhoneNumber` (phone in local format)

**Example data returned:**
```
"021 424 1836"
```

**Where it's used:**
- **Fallback only.** Only used if `internationalPhoneNumber` is null. The app prefers the international format. If you keep 2A, this is redundant.

> **2B. `nationalPhoneNumber` →** REMOVE

### 2C. `regularOpeningHours` (weekly opening hours + open/closed now)

**Example data returned:**
```json
{
  "openNow": true,
  "weekdayDescriptions": [
    "Monday: 7:00 AM – 5:00 PM",
    "Tuesday: 7:00 AM – 5:00 PM",
    "Wednesday: 7:00 AM – 5:00 PM",
    "Thursday: 7:00 AM – 5:00 PM",
    "Friday: 7:00 AM – 5:00 PM",
    "Saturday: 8:00 AM – 2:00 PM",
    "Sunday: Closed"
  ]
}
```

**Where it's used:**
- **Onboarding Stage 1 (GBP card):** Shows "Opening Hours:" with an "Open now" / "Closed now" badge, followed by each day's hours.
- **GBP Analyzer:** Checks if business has hours configured. If missing, marks "Business hours" as ❌ in the report checklist (e.g. "7 days configured").

> **2C. `regularOpeningHours` →** REMOVE, but adjust the onboarding to just say "Looking for opening hours" with a loading icon. Adjust the AI analysis so that we do not take the opening hours into account.

---

## 3. PLACES DETAILS — $185.13/month (multiple tiers combined)

This is your biggest cost. It's not one field — it's the **number of Place Details API calls**. Every call costs money regardless of which fields you request. Here are the individual call sites and whether they're necessary.

### 3A. Main business details (onboarding mount + GBP card)

**What it fetches:** Name, address, rating, review count, types, website, photo, Google Maps URL — for the business the user searched for.

**Example:** `"Cafe Paradiso" — 4.6★ — 234 reviews — "123 Main St, Cape Town" — cafeparadiso.co.za`

**Call count:** 1 per scan (cached for 5 minutes).

**Where it's used:** Everywhere — the business name, rating, and address appear on every stage and the final report.

> **3A. Main business details (1 call) →** KEEP (required)

### 3B. GBP analyzer details (separate call with different mask)

**What it fetches:** Same business but with `priceLevel` and `businessStatus` added. Also fetches its first photo URI separately.

**Example:** Same data as 3A plus `"priceLevel": "MODERATE"` and `"businessStatus": "OPERATIONAL"`.

**Call count:** 1 per scan + 1 photo media call.

**Where it's used:** `analyzeGbp` uses price level and business status for the checklist. The photo is used for the GBP card display.

**Note:** This is a **second Place Details call for the same business** with a slightly different field mask. Could be merged with 3A to save 1 call per scan.

> **3B. GBP analyzer details (1 call, mergeable with 3A) →** Merge with 3A

### 3C. Reviews fetch

**What it fetches:** The business's Google reviews (up to 5, selected for rating variety).

**Example:**
```
★★★★★ "Best coffee in Cape Town! The barista really knows their stuff."
★★★☆☆ "Good food but slow service on weekends."
★☆☆☆☆ "Parking is a nightmare and the staff were rude."
```

**Call count:** 1 per scan.

**Where it's used:** Onboarding Stage 3 (review sentiment cards), AI analysis (review sentiment scoring), report.

> **3C. Reviews (1 call) →** KEEP

### 3D. Competitor target lookup

**What it fetches:** The target business's location (lat/lng) and types — used to find nearby competitors.

**Example:** `lat: -33.9249, lng: 18.4241, types: ["cafe", "restaurant", "food"]`

**Call count:** 1 per scan. Uses a minimal field mask: `id, name, displayName, location, types, formattedAddress` (no Atmosphere or Contact fields).

**Where it's used:** `/api/places/competitors` — needed to know WHERE to search and WHAT type of business to look for.

> **3D. Competitor target lookup (1 call, minimal mask) →** KEEP (required)

### 3E. Photos list + media URIs

**What it fetches:** List of the business's Google photos, then fetches a CDN URL for each one.

**Example:** Up to 18 photos like `https://places.googleapis.com/v1/places/ChIJ.../photos/AUc7t.../media` → resolves to a CDN image URL.

**Call count:** 1 Place Details call (field mask: `photos, displayName` — cheap, no Atmosphere/Contact) + **up to 18 Photo Media calls**.

**Where it's used:** Onboarding Stage 4 (photo collage showing the business's Google photos).

> **3E. Photos list (1 call) →** KEEP

> **3E-ii. Photo Media URIs (up to 18 calls per scan) →** KEEP

> **If you want to keep photos but reduce cost, we could cap at e.g. 8 instead of 18. → Cap at 8 photos** CAP AT 8 PHOTOS

### 3F. Search visibility — map pack enrichment (LEGACY API)

**What it fetches:** For each of 10 search queries (like "cafe near me", "coffee Cape Town"), it runs a Google Text Search to get the map pack, then fetches Place Details for the top 3 results per query to get their name, rating, review count, address, and website.

**Example per query:**
```
Query: "cafe cape town"
→ Text Search returns 20 results
→ Top 3 enriched:
  1. "Cafe Paradiso" — 4.6★ — 234 reviews — cafeparadiso.co.za
  2. "Truth Coffee" — 4.5★ — 1,892 reviews — truthcoffee.com
  3. "Rosetta" — 4.4★ — 567 reviews — rosettaroasting.com
```

**Call count:** 10 Text Search + 30 Place Details = **40 Legacy calls per pipeline run**.

**Where it's used:** The "Search Visibility" section of the report — shows where the business ranks in Google for relevant queries.

**THE PROBLEM:** This pipeline runs TWICE — once via `/api/scan/search-visibility` and again inside `/api/scan/website`. That means **80 Legacy calls** instead of 40.

> **3F. Search visibility (40 calls, currently doubled to ~80) →** INSTEAD OF 10 SEARCHES, LET'S RATHER CAP AT 7

> **3F-ii. Fix the double-pipeline so it only runs once? →** YES

### 3G. Competitor enrichment (LEGACY API)

**What it fetches:** For competitors found in the map pack results, fetches full Place Details to get their rating, review count, website, phone, address, and opening hours.

**Example:**
```
"Truth Coffee" — 4.5★ — 1,892 reviews — truthcoffee.com — +27 21 200 0440
"Rosetta Roastery" — 4.4★ — 567 reviews — rosettaroasting.com
```

**Call count:** Up to 10 Place Details (Legacy) per pipeline run. Doubled if both pipelines run.

**Where it's used:** Competitor comparison card in the report. Shows "You're ranked #X out of Y competitors".

**Note:** The Legacy field mask includes `opening_hours` and `formatted_phone_number` for competitors, but these are **never displayed** in the competitor card. Only name, rating, review count, and website are shown.

> **3G. Competitor enrichment (up to 10 calls, doubled to ~20) →** IF WE NEED THIS TO GET THE RANKING, THEN KEEP. OTHERWISE, YOUR BEST DISCRETION

> **3G-ii. Remove unused fields (opening_hours, phone) from competitor lookups? →** REMOVE UNUSED FIELDS. WE ONLY NEED NAME AND AVERAGE RATING. INVESTIGATE SOMETHING FOR ME HERE, CHECK OUT WHERE WE ARE DISPLAYING THIS INFO. IF IT'S IN THE "This is how you're doing online" SECTION, UNDER "Google Maps results", THEN IN THE REPORT WE ARE ONLY DISPLAYING THE NAME, AVG RATING AND RANKING, NOTHING ELSE. SO REMOVE ALL UNNECESSARY FIELDS.

### 3H. Snapshot marker locations (analysis page)

**What it fetches:** For every unique placeId that appears in the search visibility map packs, fetches full Place Details just to get the **lat/lng** for placing a map marker.

**Example:** For placeId `ChIJx1A...` → only needs `lat: -33.92, lng: 18.42` but currently requests the FULL field mask including editorialSummary (Atmosphere), phone numbers (Contact), opening hours, photos, etc.

**Call count:** 15–30 calls per report (one per unique competitor across all queries).

**Where it's used:** Map markers in the search visibility section. Each query's map shows pins for the top 3 results.

**Note:** These calls use the FULL `/api/places/details` mask. They only need `id`, `location`, and `displayName`. Switching to a minimal mask would eliminate Atmosphere and Contact charges on all these calls.

> **3H. Snapshot marker locations (15-30 calls with full mask) →** KEEP WITH MINIMAL

> **3H-ii. Switch to minimal mask (id, location, displayName only) for markers? →** YES

### 3I. Client-side map markers (ReportSearchVisibility)

**What it fetches:** Same as 3H — full Place Details just for lat/lng — but triggered client-side when a user expands a search query row.

**Call count:** Up to 3 per expanded query. If user expands all 10: up to 30 calls. Typical: 3-6.

**Already solved in snapshot mode:** Once the report is persisted, snapshot mode uses precomputed locations (0 API calls).

> **3I. Client-side marker fetches (0-30 calls) →** KEEP BUT MINIMAL

> **3I-ii. Switch to minimal mask for these too? →** YES

---

## 4. PLACES PHOTO — $29.54/month

### 4A. Business first photo (onboarding GBP card + report avatar)

**Call count:** 2 per scan (one from `/api/places/details`, one from `/api/gbp/place-details`). Could be 1 if 3B is merged with 3A.

> **4A. Business first photo (2 calls, reducible to 1) →** REDUCE TO 1

### 4B. Photo collage (Stage 4)

**Call count:** Up to 18 per scan (see 3E above).

> **Already covered in 3E-ii above.**

---

## Summary of potential savings

| Action | Calls saved per scan | SKU impact |
|--------|---------------------|------------|
| Remove `editorialSummary` | 0 calls but removes Atmosphere billing from ~6 calls | **Eliminates Atmosphere Data SKU entirely** |
| Remove `nationalPhoneNumber` | 0 calls | Negligible (fallback only) |
| Remove `regularOpeningHours` | 0 calls but reduces Enterprise tier | Reduces Contact Data billing |
| Merge GBP analyzer with main details | 1 Place Details + 1 Photo | Saves ~2 calls |
| Fix double search-visibility pipeline | ~50 Legacy calls | **Biggest single saving** |
| Remove unused fields from competitor lookups | 0 calls | Reduces per-call cost |
| Minimal mask for marker locations | 0 calls but drops tier from Enterprise+Atmosphere to Essentials | **Major per-call savings on 15-30 calls** |
| Cap photos at 8 instead of 18 | ~10 Photo calls | Modest saving |

---

**Instructions:** Write KEEP or REMOVE next to each `→ ___` above, then I'll implement all the changes in one go.
