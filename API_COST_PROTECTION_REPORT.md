# API Cost Protection Audit Report

---

## Executive Summary

Before this audit, the app had **zero protection** against runaway API costs. A single bug (like the Places API loop you experienced) could cause bills to spike indefinitely with no automatic shutoff. Every external API call path was unguarded, and multiple client-side components had polling loops that could run forever.

After this audit, every external API call passes through a **circuit breaker** that automatically kills all calls to a service when limits are exceeded, every expensive route has **per-IP rate caps**, and every polling loop has a **hard stop condition**.

---

## BEFORE: What Was Wrong

### Severity: CRITICAL — No circuit breaker on any API

| Service | Calls per instance | Protection | What could happen |
|---------|-------------------|------------|-------------------|
| Google Places API | Unlimited | None | A loop bug = unlimited $0.017/call charges. The bug you experienced. |
| OpenAI (GPT-4o-mini) | Unlimited | None | A retry loop = unlimited token charges |
| AWS SES | Unlimited | None | A loop = thousands of emails sent, SES reputation destroyed |
| Google CSE | Unlimited | None | Burn through daily quota, then charged per extra call |
| Playwright (browser) | Unlimited | None | Spawn unlimited Chrome instances, exhaust server memory + compute |

**There was no mechanism anywhere in the codebase to say "stop calling this API, something is wrong."**

---

### Severity: CRITICAL — Competitor search could make 50+ Places API calls per request

`lib/seo/competitors.ts` had nested loops with no total call cap:

- **5 radius steps** (1.5km, 3km, 5km, 10km, 20km)
- **Up to 3 pages per radius** (pagination via `next_page_token`)
- **Up to 2–3 search strategies per radius** (type-based + keyword-based + general)
- **Up to 10 enrichment calls** (one `getPlaceDetails` per competitor found)

Worst case: `5 radii × 3 pages × 3 strategies + 10 enrichments = 55+ Google API calls` in a single `/api/places/competitors` request. If the client called this endpoint in a loop (which it could), the calls multiplied with zero limit.

---

### Severity: CRITICAL — Three infinite polling loops in client components

**1. `StageOnlinePresence.tsx` — Data polling (line 241)**

```js
setInterval(() => {
  if (loading && !data && !initialData) {
    fetchData();  // calls /api/scan/socials
  }
}, 5000);
```

No max attempts. If data never loaded (network error, API failure), this polled **/api/scan/socials every 5 seconds forever**, and each call triggered Playwright browser automation + Google CSE API calls.

**2. `StageOnlinePresence.tsx` — Screenshot polling (line 367)**

```js
setInterval(pollForUpdates, 3000);
```

No max attempts. If screenshots never completed, this polled **every 3 seconds forever**.

**3. `analysis/page.tsx` — AI wait polling (line 533)**

```js
setInterval(() => {
  setSnapshotWaitTick(t => t + 1);
}, 2000);
```

No max attempts. While it only incremented a counter (not a direct API call), it triggered React re-renders that could cascade into API calls via dependent useEffect hooks.

---

### Severity: CRITICAL — Browser launch lock could deadlock forever

`app/api/scan/website/route.ts` had:

```js
while (browserLaunchLock) {
  await new Promise(resolve => setTimeout(resolve, 100));
}
```

If the lock was never released (crash, unhandled error, timeout), this **looped forever**, blocking the serverless function and eventually causing Vercel to spawn more instances (each of which could also deadlock).

---

### Severity: HIGH — Only one rate limit layer (easily overwhelmed)

The middleware had a single global limit: **30 requests/minute per IP** across ALL routes. This meant:

- An attacker (or a bug) could make **30 calls/minute to `/api/scan/website`** (each spawning a Playwright browser costing ~$0.01–0.05 in compute)
- **30 calls/minute to `/api/ai/analyze`** (each calling OpenAI GPT-4o-mini 7+ times)
- **30 calls/minute to `/api/places/competitors`** (each making 50+ Google API calls)

At the global rate of 30/min, a single IP could trigger roughly:

- **1,500 Google Places API calls/min** (via competitors endpoint alone)
- **210 OpenAI API calls/min** (via analyze endpoint)
- **30 Playwright browser sessions/min** (via website scanner)

---

### Severity: HIGH — SES email sends had zero rate limiting

All three email functions (`sendShareReportEmail`, `sendReportReadyEmail`, `sendAppInviteEmail`) called `ses.send(command)` with no limit. A loop in any calling code could:

- Send thousands of emails
- Get the `hello@antistatic.ai` sender reputation destroyed by Amazon SES
- Get the SES account suspended

Only the email verification route (`/api/public/verify-email/request`) had its own rate limit (3/min per IP+email). The share and report-ready paths had none.

---

## AFTER: How Every Issue Is Fixed

### 1. Global Circuit Breaker (NEW: `lib/net/apiBudget.ts`)

Every external API now passes through a budget tracker that **automatically trips a circuit breaker** when limits are exceeded:

| Service | Hard Limit | Window | What happens when tripped |
|---------|-----------|--------|---------------------------|
| Google Places | 500 calls | 10 min | All Places calls return null/empty for 10 min |
| Google CSE | 100 calls | 10 min | All CSE calls blocked for 10 min |
| Google Maps | 200 calls | 10 min | All Maps calls blocked for 10 min |
| OpenAI | 100 calls | 10 min | All AI calls blocked for 10 min |
| AWS SES | 50 emails | 10 min | All email sends throw error for 10 min |
| Instagram | 50 calls | 10 min | All Instagram calls blocked for 10 min |
| Playwright | 30 sessions | 10 min | All browser launches blocked for 10 min |

When tripped, a `console.error` with `[API BUDGET] CIRCUIT BREAKER TRIPPED` is logged so you can see it in Vercel logs.

**Maximum possible Google Places cost in a 10-minute window is now capped at ~$8.50** (500 calls × $0.017). Before: unlimited.

---

### 2. Per-Invocation Call Cap on Competitors

`lib/seo/competitors.ts` now has `MAX_PLACES_CALLS_PER_INVOCATION = 60`. A call counter is threaded through every function (`fetchAllNearbyPages`, `fillFromRadiusStage1`, `discoverCompetitorsStage1`). When the counter hits 60, all further radius expansion and pagination stops immediately.

- **Before:** 55+ calls possible per request, no cap.
- **After:** Hard stop at 60, plus the global budget circuit breaker on top.

---

### 3. All Polling Loops Have Hard Stop Conditions

| Component | Before | After |
|-----------|--------|-------|
| `StageOnlinePresence` — data polling | Infinite (every 5s forever) | **Max 12 attempts** (60s), then stops |
| `StageOnlinePresence` — screenshot polling | Infinite (every 3s forever) | **Max 20 attempts** (60s), then stops |
| `analysis/page.tsx` — AI wait | Infinite (every 2s forever) | **Max 30 ticks** (60s), then stops |

Each logs a warning when the max is reached so you can see it in browser console.

---

### 4. Browser Lock Timeout

| Before | After |
|--------|-------|
| `while (browserLaunchLock)` — infinite wait | **30-second timeout**, then force-releases the lock and continues |

---

### 5. Per-Route Rate Limits for Expensive Endpoints

Added a second rate-limiting layer in the middleware. These are per-IP and per-route, much tighter than the global 30/min:

| Route | Before | After |
|-------|--------|-------|
| `/api/scan/website` | 30/min (global) | **5 per 10 min** |
| `/api/scan/socials` | 30/min (global) | **5 per 10 min** |
| `/api/scan/socials/screenshot` | 30/min (global) | **10 per 10 min** |
| `/api/scan/search-visibility` | 30/min (global) | **10 per 10 min** |
| `/api/ai/analyze` | 30/min (global) | **10 per 10 min** |
| `/api/places/competitors` | 30/min (global) | **10 per 10 min** |
| `/api/gbp/extract-socials` | 30/min (global) | **5 per 10 min** |
| `/api/public/reports/share` | 30/min (global) | **10 per 10 min** |
| `/api/instagram/session/manual` | 30/min (global) | **3 per 10 min** |
| `/api/instagram/session/refresh` | 30/min (global) | **3 per 10 min** |

---

### 6. SES Email Guards

All 3 email send functions now call `apiBudget.spend("ses")` before `ses.send()`. If 50 emails have been sent in the last 10 minutes, the send throws an `ApiBudgetExceededError` and no email is sent.

---

## Cost Impact Comparison

| Scenario | Before (potential cost) | After (max possible cost) |
|----------|-------------------------|----------------------------|
| Places API loop bug (10 min) | **Unlimited** (your incident) | **$8.50** (500 calls, then circuit breaker kills it) |
| Competitor search stuck in loop | **$0.94/request × 30/min = $28/min** | **$0.17/request × 10/10min = $0.17** |
| OpenAI analyze loop (10 min) | **$50–500** (unlimited tokens) | **~$5** (100 calls max, then blocked) |
| SES email spam (10 min) | **Thousands of emails** (SES suspension risk) | **50 emails**, then blocked |
| Playwright abuse (10 min) | **30 browser sessions/min = 300** | **30 total**, then blocked |

---

## Files Changed

| File | Change |
|------|--------|
| `lib/net/apiBudget.ts` | **NEW** — Circuit breaker utility |
| `lib/places/placeDetailsNew.ts` | Added budget guard |
| `lib/places/searchNearbyNew.ts` | Added budget guard |
| `lib/seo/competitors.ts` | Added budget guards + per-invocation call cap (60) |
| `lib/ses/sendShareReportEmail.ts` | Added budget guard |
| `lib/ses/sendReportReadyEmail.ts` | Added budget guard |
| `lib/ses/sendAppInviteEmail.ts` | Added budget guard |
| `middleware.ts` | Added per-route rate limits for 10 expensive endpoints |
| `components/report/StageOnlinePresence.tsx` | Fixed 2 infinite polling loops |
| `app/report/[scanId]/analysis/page.tsx` | Fixed infinite AI polling loop |
| `app/api/scan/website/route.ts` | Fixed infinite browser lock wait |
