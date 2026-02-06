# Instagram 429 + Decodo Proxy – Issue Breakdown for LLM Fix Guidance

## 1. What the issue entails

### Objective
The app programmatically fetches Instagram profile and posts for a given username (e.g. `@fynrestaurantcpt`) via Instagram’s internal web API:

1. **Get auth header** – Call `https://www.instagram.com/api/v1/users/web_profile_info/?username=<username>` to obtain an `ig-set-authorization` (or similar) response header used for later API calls.
2. **Fetch profile** – Same `web_profile_info` endpoint is used again to get profile JSON (bio, followers, etc.).
3. **Fetch feed** – `https://www.instagram.com/api/v1/feed/user/<userId>/` for posts.
4. **Fetch comments** – Per-post comment endpoints as needed.

All of these go through a single fetch abstraction that can route traffic via **Decodo residential proxies**.

### Primary symptom
- **HTTP 429 Too Many Requests** on both:
  - `getAuthHeader` (first `web_profile_info` call)
  - `fetchProfile` (second `web_profile_info` call)
- Retries are in place (e.g. 3 retries with exponential backoff); **all attempts still return 429**.
- Logs show: *"No explicit authorization header available"* → fallback to *"session cookie only"*; then profile fetch also fails with 429, so the run fails with a message like: *"(1) Session expired/invalid (2) Username doesn't exist (3) Profile is private (4) Instagram is blocking the request"*. Given the consistent 429s, **Instagram is rate-limiting/blocking the requests** (option 4).

### Auth flow
- Requests use a **session cookie** (Instagram `sessionid` from env, e.g. `INSTAGRAM_SESSION_ID`).
- Optionally an **authorization header** is read from the first `web_profile_info` response (`ig-set-authorization` etc.); if that first call gets 429, no auth header is available and the code proceeds with session-only.
- So 429 on the very first call both blocks auth-header extraction and causes the subsequent profile call to also hit 429 (same endpoint, same rate limit).

### Code entrypoints
- **Test/API route:** `app/api/test/instagram-api/route.ts`
  - `scrapeInstagramAPI(username)` (around line 893) orchestrates the flow.
  - It calls `getAuthorizationHeader(sessionId, username, defaultFetchOpts)` then `fetchProfile(username, sessionId, authHeader, defaultFetchOpts)`.
  - Error thrown around line 962–967 when profile is null (references the “(1)–(4)” causes).
- **Fetch layer:** All Instagram HTTP calls use `fetchInstagram()` from `lib/net/instagramFetch.ts`, which handles proxy selection, retries, and 429 handling (marks proxy as failed, retries with backoff).

---

## 2. How Decodo residential proxies are currently implemented

### 2.1 Enabling and configuration
- Proxy is enabled when **`DECODO_ENABLED`** or **`USE_DECODO_PROXY`** is `true` (or `1`).
- Credentials and endpoints:
  - **`DECODO_PROXY_USER`** / **`DECODO_PROXY_PASS`** – required when proxy is on (never logged).
  - **Single endpoint:** `DECODO_PROXY_HOST` + `DECODO_PROXY_PORT` (e.g. `gate.decodo.com`, `10001`).
  - **Multiple endpoints:** `DECODO_ENDPOINTS` – comma-separated `host:port` (e.g. `gate.decodo.com:10001,eu.gate.decodo.com:10003`). If set, this overrides the single host/port.
- **Rotation / stickiness (app-side):**
  - **`DECODO_ROTATION_MODE`:** `request` (new proxy endpoint per request) or `profile` (same proxy endpoint per “profile” until TTL). Default: `profile`.
  - **`DECODO_STICKY_TTL_SECONDS`:** TTL for reusing the same proxy for the same sticky key (default 300).

### 2.2 Proxy manager (`lib/services/decodo-proxy-manager.ts`)
- **Singleton** `DecodoProxyManager.getInstance()`.
- **Endpoints:** Loaded from env (single or `DECODO_ENDPOINTS`); default fallback: `gate.decodo.com:10001`.
- **`getProxyForRequest(stickyKey?, rotationMode?)`**:
  - Returns a proxy URL of the form `http://<user>:<pass>@<host>:<port>`.
  - **Profile mode + stickyKey:** Same `host:port` is reused for that `stickyKey` until `DECODO_STICKY_TTL_SECONDS` expires; then a new endpoint is picked.
  - **Request mode or no stickyKey:** Picks next endpoint in round-robin.
  - **Cooldown:** If a proxy returned 429 (or connection failure), it is **marked failed** and skipped for **60 seconds** (`FAILED_PROXY_COOLDOWN_MS`); the next request may use another endpoint in the list.
- **`markProxyFailed(proxyUrl)`:** Called by the fetch layer on 429 (or fetch failure) so that proxy is temporarily not reused.
- **Sticky key is not sent to Decodo** – we only reuse the same *our* proxy endpoint (host:port) for the same key. The actual proxy URL is always `http://user:pass@host:port` (no session ID or sticky parameter in the URL for Decodo).

### 2.3 Fetch layer (`lib/net/instagramFetch.ts`)
- **`fetchInstagram(url, init?, options?)`** is the single entrypoint for Instagram HTTP.
- **Options:** `stickyKey`, `rotationMode`, `timeoutMs`, `logContext`, `maxRetries` (default 3).
- **Proxy usage:**
  - If proxy is enabled and configured, gets a proxy URL from `DecodoProxyManager.getProxyForRequest(options.stickyKey, options.rotationMode)` and uses **undici `ProxyAgent`** with that URL.
  - Logs redacted endpoint (e.g. `gate.decodo.com:10001`) and mode (e.g. `(sticky: fynrestaurantcpt)`).
- **Retries:** On status in `{408, 429, 500, 502, 503, 504}`:
  - If status is **429** and a proxy was used, calls `proxyManager.markProxyFailed(proxyUrl)`.
  - Waits `backoffWithJitter(attempt)` (exponential + jitter), then retries (same URL, new proxy selection if using proxy).
- **Timeouts:** Per-request timeout via `AbortController` (default 30s).

### 2.4 How the test Instagram API uses it (`app/api/test/instagram-api/route.ts`)
- **`defaultFetchOpts`** for the scrape:
  - `stickyKey: username` (e.g. `fynrestaurantcpt`)
  - `rotationMode`: from env, default `profile`
  - `timeoutMs: 30000`
- **Headers:** `getInstagramHeaders(sessionId, authHeader)` – includes Instagram app IDs, device IDs, **Sec-Fetch-*** (e.g. `Sec-Fetch-Dest`, `Sec-Fetch-Mode`, `Sec-Fetch-Site`) to mimic browser and try to satisfy SecFetch policy, plus other browser-like headers.
- **Flow:** `getAuthorizationHeader` and `fetchProfile` both call `web_profile_info` via `fetchInstagram(..., instagramOpts)` with the same `stickyKey` (username), so in profile mode they use the same proxy endpoint. Both still get 429 on every attempt (including retries).

### 2.5 Summary of current proxy behavior
- Traffic is sent through Decodo residential proxies (one or more gate endpoints).
- Same username (stickyKey) reuses the same **app-chosen** proxy endpoint for 300s in profile mode; 429 triggers a 60s cooldown for that endpoint and the next request can use another endpoint.
- Retries (3) with backoff happen after 429, but every attempt still gets 429, so the run fails.
- Proxy URL does **not** include a Decodo-specific sticky/session parameter; stickiness is only our in-app mapping (stickyKey → endpoint). Decodo may still rotate the residential IP per request on their side unless their product supports a sticky parameter we are not using.

---

## 3. What we need from the LLM

- **Why Instagram returns 429** in this setup (e.g. IP reputation, request pattern, headers, cookie vs auth, rate limits per IP or per session).
- **Changes to our Decodo usage** (if any): e.g. different endpoints, sticky/session parameters in the proxy URL or auth, rotation strategy, or request pacing.
- **Changes to request pattern or headers** (e.g. delays between getAuthHeader and fetchProfile, different headers, or fewer retries / different backoff) to reduce 429s.
- **Any Decodo-side configuration** (e.g. session stickiness, geo, or product features) we should enable so the same residential IP is used for the whole scrape for one username.

Reference code:
- **Proxy manager:** `lib/services/decodo-proxy-manager.ts`
- **Fetch + retries + 429 handling:** `lib/net/instagramFetch.ts`
- **Instagram API flow (getAuthHeader, fetchProfile, scrapeInstagramAPI):** `app/api/test/instagram-api/route.ts`

---

## 4. Implementation applied (Decodo sticky sessions)

The following changes were implemented to use Decodo’s “Sticky (10min)” sessions correctly and reduce 429s:

- **Proxy URL:** Session param (`?session=...`) was removed from the proxy URL because **undici's ProxyAgent** rejects proxy URLs with query strings (`parseOrigin` throws `InvalidArgumentError: invalid url`). Sticky behaviour is app-side only: same endpoint per `stickyKey` for 10min TTL; session IDs are still generated for logging. If Decodo supports session via a header or a different client is used later, session can be re-added.
- **TTL and cooldown:** `DECODO_STICKY_TTL_SECONDS` default is **600** (10 min). Failed-proxy cooldown reduced to **30s** (from 60s).
- **Pacing:** 2.5s delay between `getAuthorizationHeader` and `fetchProfile` in `app/api/test/instagram-api/route.ts`.
- **Retries:** Instagram test route uses `maxRetries: 2` and `retryDelayBaseMs: 2000` in fetch options.
- **Logging:** First attempt logs redacted session label (e.g. `session_***_1234`) and endpoint for debugging.
- **Referer:** Already set in Instagram headers (`Referer: https://www.instagram.com/`); no change.

### Additional fixes (endpoint stickiness)

- **Profile mode ignores cooldown:** In profile mode with a valid sticky session, the proxy manager now uses the **sticky endpoint regardless of cooldown**. Switching endpoints mid-scrape (e.g. auth on `:10001`, profile on `:10002`) is worse for Instagram than retrying on the same rate-limited endpoint.
- **Same proxy for all retries:** `fetchInstagram` now gets the proxy URL **once** before the retry loop and reuses the same dispatcher for all attempts. Previously each retry called `getProxyForRequest`, which could return a different endpoint if the first was in cooldown.
- **Mark failed only after retries exhausted:** The proxy is only marked failed when all retries are exhausted (or on non-retryable error), not on each 429 during the retry loop.
- **Force profile mode in route:** The Instagram test route now always uses `rotationMode: "profile"` (ignoring `DECODO_ROTATION_MODE` env) so auth, profile, and feed share the same endpoint.

### Header fingerprint fix (consistent browser identity)

Previous headers mixed Android app UA (`Instagram 267.0.0.19.301 Android`) with Chrome browser `Sec-Ch-Ua`, Windows `Sec-Ch-Ua-Platform`, and Instagram Android device headers (`X-IG-Android-ID`, `X-IG-Device-ID`)—while hitting a **web** endpoint (`web_profile_info`). Instagram detects this mismatch as a bot → instant 429.

Fixed to a consistent **Chrome 120 on Windows** browser identity:
- `User-Agent`: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/120.0.0.0 Safari/537.36`
- `X-IG-App-ID`: `936619743392459` (web, not the Android/embed `567067343352427`)
- `Sec-Ch-Ua` / `Sec-Ch-Ua-Platform` matching the UA
- Removed: `X-IG-Device-ID`, `X-IG-Android-ID`, `X-IG-Device-Locale`, `X-IG-Mapped-Locale`, `X-IG-Connection-Type`, `X-IG-Capabilities` (all Android-only headers that contradict a browser identity)
