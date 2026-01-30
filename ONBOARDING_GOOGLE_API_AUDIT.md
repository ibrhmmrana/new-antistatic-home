# Onboarding Stages – Google API Endpoints Audit

This document lists every Google API endpoint used in the onboarding/report flow, which stage triggers it, and how it is called.

---

## Onboarding stages (ReportScanClient)

| Step | Label | Component | When / What triggers |
|------|--------|-----------|----------------------|
| 0 | Deploying agents | AIAgentLoadingScreen | Initial load |
| 1 | Your online profile review | StageGoogleBusinessProfile | After stage 0 |
| 2 | {name} competitors | StageCompetitorMap | After stage 1 |
| 3 | Review sentiment scoring | StageReviewSentiment | After stage 2 |
| 4 | Image quality and quantity | StagePhotoCollage | After stage 3 |
| 5 | Online presence analysis | StageOnlinePresence | After stage 4 |

---

## Google API endpoints used (by product)

### 1. **Places API (Legacy) – maps.googleapis.com/maps/api/place/…**

Auth: `key=<GOOGLE_PLACES_API_KEY>` (query param).  
All are **GET** unless noted.

| Endpoint | Path | Used in | Params / purpose |
|----------|------|---------|-------------------|
| **Place Details** | `/place/details/json` | Multiple | `place_id`, `fields`, `key`. Full place info (name, address, website, reviews, etc.). |
| **Place Autocomplete** | `/place/autocomplete/json` | Autocomplete flows | `input`, `key`; optional `components=country:XX`, `types=establishment`. |
| **Place Photo** | `/place/photo` | Photo proxy | `maxwidth`, `photo_reference`, `key`. Returns 302 to image URL. |
| **Find Place from Text** | `/place/findplacefromtext/json` | resolveBusinessIdentity | `input`, `inputtype=textquery`, `fields`, `key`. |
| **Text Search** | `/place/textsearch/json` | resolveBusinessIdentity, competitors, fetchMapPackForQuery | `query`, `key`; optional `location`, `radius`. |
| **Nearby Search** | `/place/nearbysearch/json` | competitors (places + lib/seo) | `location`, `radius`, `key`; optional `type`, `keyword`. Pagination: `pagetoken`, `key`. |
| **Static Map** | `/staticmap` (Maps Static API) | static-map route | `center`, `zoom`, `size`, `scale`, `maptype`, `style`, `markers`, `key`. |

---

### 2. **Places API (New) – places.googleapis.com/v1/…**

Auth: header `X-Goog-Api-Key: <GOOGLE_PLACES_API_KEY>`.  
Used for **Stage 2 (Competitors)** and **Stage 4 (Image quality and quantity)**.

| Endpoint | Path | Used in | Params / purpose |
|----------|------|---------|-------------------|
| **Place (details)** | `GET /v1/places/{placeId}` | app/api/places/photos/route.ts, app/api/places/competitors/route.ts | Headers: `X-Goog-Api-Key`, `X-Goog-FieldMask`. Returns place (photos, displayName, location, types, etc.). |
| **Photo Media** | `GET /v1/{photo.name}/media` | app/api/places/photos/route.ts | Query: `maxWidthPx`, `skipHttpRedirect=true`. Header: `X-Goog-Api-Key`. Returns JSON `{ photoUri }`. |
| **Search Nearby** | `POST /v1/places:searchNearby` | app/api/places/competitors/route.ts | Body: `locationRestriction` (circle), `includedTypes`, `maxResultCount`, `rankPreference`. Header: `X-Goog-FieldMask`. Returns `places[]`. |

---

### 3. **Custom Search API – www.googleapis.com/customsearch/v1**

Auth: `key=<GOOGLE_CSE_API_KEY>`, `cx=<GOOGLE_CSE_CX>` (query params).  
Used for **search visibility** and **social/screenshot** flows (organic results, bypass, etc.).

| Endpoint | Path | Used in | Params / purpose |
|----------|------|---------|-------------------|
| **Custom Search** | `GET /customsearch/v1` | lib/seo/searchVisibility.ts, app/api/scan/socials/route.ts, app/api/scan/socials/screenshot/route.ts | `key`, `cx`, `q`, `num`. Returns search results (title, link, snippet, etc.). |

---

## By onboarding stage – which routes and Google APIs

### Stage 0 – Deploying agents
- **Client:** Fetches place info for UI.
- **Our route:** `GET /api/places/details?placeId=…`
- **Google:** **Place Details (Legacy)** – `maps.googleapis.com/maps/api/place/details/json` with `place_id`, `fields` (name, rating, photos, geometry, website, etc.), `key`.

### Stage 1 – Your online profile review
- **Client:** StageGoogleBusinessProfile; also triggers screenshot, scraper, website scan, search-visibility, tests.
- **Our routes / libs and Google:**
  - `GET /api/places/details?placeId=…` → **Place Details (Legacy)** (same as above).
  - `GET /api/gbp/place-details?place_id=…` → **Place Details (Legacy)** – same endpoint, different field set (editorial_summary, photos, etc.).
  - `POST /api/scan/socials` → may call **Custom Search** (`customsearch/v1`) for social discovery (GOOGLE_CSE_API_KEY, GOOGLE_CSE_CX).
  - `POST /api/scan/socials/screenshot` → can call **Custom Search** when handling challenges.
  - `POST /api/scan/website` → no direct Google API; may detect Google Maps embeds in HTML.
  - `POST /api/scan/search-visibility` → **Custom Search** (searchVisibility) + **Place Details / Text Search / Nearby Search** (competitors lib + buildBusinessIdentityFromPlaceId).

### Stage 2 – Competitors
- **Client:** StageCompetitorMap; preloads competitors data (stage 0/1).
- **Our route:** `GET /api/places/competitors?placeId=…`
- **Google:**
  - **Places API (New)** – `GET /v1/places/{placeId}` with FieldMask for target (lat/lng, types).
  - **Places API (New)** – `POST /v1/places:searchNearby` with `locationRestriction` (circle), `includedTypes`, `maxResultCount`, `rankPreference: DISTANCE`.

### Stage 3 – Review sentiment scoring
- **Client:** StageReviewSentiment; preloads reviews (stage 1).
- **Our route:** `GET /api/places/reviews?placeId=…`
- **Google:** **Place Details (Legacy)** – `place/details/json` with `fields=name,reviews`, `key`.

### Stage 4 – Image quality and quantity
- **Client:** StagePhotoCollage; always fetches from API first.
- **Our route:** `GET /api/places/photos?placeId=…`
- **Google:**
  - **Places API (New)** – `GET places.googleapis.com/v1/places/{placeId}` with `X-Goog-FieldMask: photos,displayName`.
  - **Places API (New)** – `GET places.googleapis.com/v1/{photo.name}/media?maxWidthPx=1600&skipHttpRedirect=true` per photo (up to 18).
- **Image display:** Either direct `photoUri` from New API, or legacy proxy:
  - **Our route:** `GET /api/places/photo?ref=…&maxw=…` → **Place Photo (Legacy)** – `place/photo?maxwidth&photo_reference&key` (302 to image).

### Stage 5 – Online presence analysis
- **Client:** StageOnlinePresence; uses data from analyzers (search-visibility, website, socials, etc.).
- **Google:** No direct call from stage 5 UI. All Google usage is in the analyzers triggered in stage 1 (search-visibility → CSE + Places; competitors → Place Details + Nearby Search; buildBusinessIdentityFromPlaceId → Find Place / Text Search / Place Details).

---

## By our API route / lib – Google endpoint summary

| Our route / lib | Google endpoint(s) | Auth |
|------------------|--------------------|------|
| **GET /api/places/details** | Place Details (Legacy) | key=GOOGLE_PLACES_API_KEY |
| **GET /api/places/autocomplete** | Place Autocomplete (Legacy) | key=GOOGLE_PLACES_API_KEY |
| **GET /api/places/photo** | Place Photo (Legacy) | key=GOOGLE_PLACES_API_KEY |
| **GET /api/places/photos** | Places (New) place + photo media | X-Goog-Api-Key: GOOGLE_PLACES_API_KEY |
| **GET /api/places/competitors** | Place Details (New) + searchNearby (New) | X-Goog-Api-Key: GOOGLE_PLACES_API_KEY |
| **GET /api/places/reviews** | Place Details (Legacy) | key=GOOGLE_PLACES_API_KEY |
| **GET /api/places/static-map** | Place Details (geometry) + Static Map | GOOGLE_MAPS_API_KEY or GOOGLE_PLACES_API_KEY |
| **GET /api/gbp/place-details** | Place Details (Legacy) | key=GOOGLE_PLACES_API_KEY |
| **GET /api/gbp/autocomplete** | Place Autocomplete (Legacy) | key=GOOGLE_PLACES_API_KEY |
| **POST /api/scan/search-visibility** | Custom Search + (via competitors/identity) Place Details, Text Search, Nearby Search | CSE: key + cx; Places: GOOGLE_PLACES_API_KEY |
| **POST /api/scan/socials** | Custom Search (optional) | GOOGLE_CSE_API_KEY, GOOGLE_CSE_CX |
| **POST /api/scan/socials/screenshot** | Custom Search (when needed) | GOOGLE_CSE_API_KEY, GOOGLE_CSE_CX |
| **lib/business/resolveBusinessIdentity** | Find Place from Text, Text Search, Place Details (Legacy) | GOOGLE_PLACES_API_KEY |
| **lib/seo/competitors** | Nearby Search, Text Search, Place Details (Legacy) | GOOGLE_PLACES_API_KEY |
| **lib/seo/searchVisibility** | Custom Search | GOOGLE_CSE_API_KEY, GOOGLE_CSE_CX |
| **lib/maps/fetchMapPackForQuery** | Text Search + Place Details (Legacy) | GOOGLE_PLACES_API_KEY |

---

## Env vars required for Google APIs

| Env var | Used for |
|---------|----------|
| **GOOGLE_PLACES_API_KEY** | All Places (Legacy) + Places (New) v1 |
| **GOOGLE_MAPS_API_KEY** | Static Map only (optional; fallback GOOGLE_PLACES_API_KEY) |
| **GOOGLE_CSE_API_KEY** | Custom Search (search visibility, socials, screenshot) |
| **GOOGLE_CSE_CX** | Custom Search engine ID |

---

## Feasibility: Migrating Legacy Places API → New API

For every place we use the **Legacy** Places API, below is the feasibility of switching to the **New** Places API (v1). Same key (`GOOGLE_PLACES_API_KEY`) works for both; New API uses header `X-Goog-Api-Key` and requires **Places API (New)** enabled in the project.

| Legacy endpoint | New API equivalent | Feasibility | Effort | Notes |
|-----------------|--------------------|-------------|--------|--------|
| **Place Details** (`/place/details/json`) | `GET /v1/places/{placeId}` with `X-Goog-FieldMask` | **High** | Low–medium | New API has full parity. Change: URL, auth (header), request to use **resource name** `places/{placeId}`; response is different (camelCase, nested objects). Map fields: `formatted_address` → `formattedAddress`, `place_id` → `id` in `name`, etc. We already use this pattern in `/api/places/photos`. |
| **Place Autocomplete** (`/place/autocomplete/json`) | `POST /v1/places:autocomplete` | **High** | Medium | New API is **POST** with JSON body. Params: `input` → body, `components` → `includedRegionCodes`, `types` → `includedPrimaryTypes`. Response: `suggestions[]` with `placePrediction` (different shape than `predictions[]`). Need to map to existing UI (place_id, main_text, secondary_text). |
| **Place Photo** (`/place/photo`) | Already covered by New API media | **Done** | — | Stage 4 uses New API `photoUri`. Legacy photo is only for **other consumers** (StageGoogleBusinessProfile, ReportTopCards, BusinessSearch, assembleReport) that still use `photo_reference`. **Feasible:** have those call New API place + media and use `photoUri`, then deprecate `/api/places/photo?ref=…`. |
| **Find Place from Text** (`/place/findplacefromtext/json`) | **Text Search (New)** `POST /v1/places:searchText` | **High** | Medium | No direct “Find Place from Text” in New API; use Text Search with `textQuery` and take first result. Request: POST body with `textQuery`, `maxResultCount`; optional `locationBias`. Response: `places[]` (Place objects). Map to current “single candidate” usage in `resolveBusinessIdentity`. |
| **Text Search** (`/place/textsearch/json`) | `POST /v1/places:searchText` | **High** | Medium | New API: POST, body `textQuery`, optional `locationBias`, `maxResultCount`; header `X-Goog-FieldMask` for returned fields. Response: `places[]` with New Place schema. Used in: resolveBusinessIdentity, competitors, fetchMapPackForQuery. |
| **Nearby Search** (`/place/nearbysearch/json`) | `POST /v1/places:searchNearby` | **High** | Medium | New API: POST, body `locationRestriction` (circle with `center` + `radius`), `includedTypes` (required in New API), `maxResultCount`; header `X-Goog-FieldMask`. Pagination differs (no `next_page_token` in same form). Used in: `/api/places/competitors`, `lib/seo/competitors`. |
| **Static Map** (`/staticmap`) | **No New “Places” equivalent** | **N/A** | — | Static Map is **Maps Static API**, not Places. It stays as-is (same key or Maps-specific key). No migration to “Places New” for this. |

---

### Summary of feasibility

- **Place Details** – High. Straightforward migration: new URL, header auth, FieldMask, and response mapping in `/api/places/details`, `/api/gbp/place-details`, `/api/places/reviews`, `/api/places/static-map` (geometry), `resolveBusinessIdentity`, `competitors`, `fetchMapPackForQuery`.
- **Autocomplete** – High. New API supports the same use cases; request/response mapping in `/api/places/autocomplete` and `/api/gbp/autocomplete`.
- **Place Photo** – High. Remaining usage can be moved to New API place + media and `photoUri`; then remove or keep legacy proxy only for backward compatibility.
- **Find Place from Text** – High. Replace with Text Search (New), take first place; adapt `resolveBusinessIdentity`.
- **Text Search** – High. POST + FieldMask + response mapping in identity, competitors, fetchMapPackForQuery.
- **Nearby Search** – High. POST + `locationRestriction` + `includedTypes` + FieldMask; handle pagination differences in competitors.
- **Static Map** – N/A for Places; keep current Maps Static API.

### Cross-cutting changes

1. **Auth:** Every New API call uses `X-Goog-Api-Key` (and optionally `X-Goog-FieldMask`) instead of `key` in the query.
2. **Request method:** Autocomplete, Text Search, Nearby Search become **POST** with JSON body; Place Details and Photo Media stay **GET**.
3. **Response shape:** New API uses camelCase and different nesting (e.g. `displayName.text`, `formattedAddress`). Each route/lib needs a small mapping layer so the rest of the app keeps the same contracts.
4. **Billing:** New API uses different SKUs. Google recommends switching near the start of a billing month to avoid mixing tiers. Same key can have both Legacy and New enabled during migration.
5. **Order of migration:** Easiest first: Place Details (many call sites but same idea), then Text Search / Nearby Search (competitors, identity, map pack), then Autocomplete, then Find Place from Text; finally retire legacy photo proxy once all consumers use `photoUri`.

---

## Summary

- **Legacy Places (maps.googleapis.com):** Place Details, Autocomplete, Photo, Find Place from Text, Text Search, Nearby Search, Static Map. Used in stages 0–3, competitors, identity, map pack, GBP.
- **New Places (places.googleapis.com/v1):** Place (photos + displayName) and Photo Media. Used only in **stage 4** (Image quality and quantity) via `/api/places/photos`.
- **Custom Search (googleapis.com/customsearch/v1):** Used in **stage 1** analyzers (search-visibility, socials, screenshot) for organic results and bypass flows.
- **Migrating Legacy → New:** All Places endpoints we use have a New API equivalent and are **feasible** (high). Effort is low–medium per area (auth, POST/body, FieldMask, response mapping). Static Map stays on Maps Static API.
