# Instagram Scraping – Proxy Investigation (Inspection Only)

**Purpose:** Identify how Instagram scraping makes outbound HTTP requests so we can later add Decodo residential proxy support (rotation + sticky sessions). **No implementation in this step.**

---

## 1) Outbound request map

All Instagram-related outbound HTTP calls, by file and function:

### `app/api/test/instagram-api/route.ts`

| Function | Endpoint(s) | Notes |
|----------|-------------|--------|
| `getAuthorizationHeader` | `GET https://www.instagram.com/api/v1/users/web_profile_info/?username={username}` | 1 initial `fetch`, then optionally 1 follow-up `fetch` on redirect (manual redirect handling). |
| `fetchProfile` | Same `web_profile_info` URL | 1 `fetch`, then optionally 1 redirect `fetch`. |
| `fetchUserFeed` | `GET https://www.instagram.com/api/v1/feed/user/{userId}/?count={count}` | 1 `fetch`, optional 1 redirect. |
| `fetchPostByShortcode` | `GET https://www.instagram.com/api/v1/media/shortcode/{shortcode}/` | 1 `fetch`, optional 1 redirect. |
| `fetchCommentsREST` | `GET https://www.instagram.com/api/v1/media/{postPk}/comments/?can_support_threading=true&permalink_enabled=false&count={count}` | 1 `fetch`, optional 1 redirect. |
| `fetchCommentsGraphQL` | `GET https://www.instagram.com/graphql/query/?query_hash=bc3296d1ce80a24b1b6e40b1e72903f5&variables={...}` | 1 `fetch`, optional 1 redirect. |

- **HTTP client:** Global `fetch` only (no axios, undici import, or ProxyAgent).
- **Redirects:** All use `redirect: "manual"` and follow at most one redirect with a second `fetch` when status is 3xx.

### `lib/services/instagram-session.ts`

| Function | Outbound call | Notes |
|----------|----------------|--------|
| `validateSession` | `GET https://www.instagram.com/api/v1/users/web_profile_info/?username=instagram` | Single `fetch` with minimal headers (Cookie, User-Agent, X-IG-App-ID). **Does not use** the same header builder as the API route. |
| `sendToWebhook` | `POST` to `process.env.INSTAGRAM_WEBHOOK_URL` | Not Instagram; internal webhook. No proxy needed for Instagram. |
| `refreshSession` | Playwright `page.goto('https://www.instagram.com/accounts/login/')` and subsequent browser traffic | Real browser (Chromium). Proxy for this would be via Playwright’s `context`/launch proxy args, **separate** from the fetch-based proxy (Decodo for API route). |

**Summary:** Every **Instagram API** call that goes through HTTP (not the browser) is a direct `fetch()` in either `app/api/test/instagram-api/route.ts` or `lib/services/instagram-session.ts` (`validateSession`). There are no other files that call `instagram.com` APIs via fetch/axios/undici for scraping.

---

## 2) Runtime + HTTP client

- **Route runtime:** `app/api/test/instagram-api/route.ts` sets `export const runtime = "nodejs"`. So this runs in the Node.js runtime, not Edge.
- **HTTP client:** Node’s built-in `fetch` (Node 18+ uses undici under the hood). No explicit `import` of `undici` or `axios`; the API route and `instagram-session.ts` both use the global `fetch`.
- **Existing proxy support:** None. No `HTTP_PROXY` / `HTTPS_PROXY` usage, no custom `Dispatcher` (undici), no `ProxyAgent`, and no agent passed into `fetch`. So adding proxy will require either:
  - A custom agent (e.g. `undici.ProxyAgent` or `https-proxy-agent`) and passing it into a fetch that supports it (Node’s `fetch` in Node 18+ can use `dispatcher` in `RequestInit` with undici), or
  - A wrapper that sends requests through a proxy HTTP tunnel.
- **Vercel:** Node.js serverless functions on Vercel support the Node `fetch` and agent/dispatcher options. Edge runtime would be a different story (no Node `undici`); staying on `runtime = "nodejs"` keeps proxy options viable.

---

## 3) Concurrency / backoff analysis

- **Profile run (no comments):**  
  - `getAuthorizationHeader`: 1–2 requests (initial + optional redirect).  
  - `fetchProfile`: 1–2 requests.  
  - `fetchUserFeed`: 1–2 requests.  
  All are **sequential**. No retries, no handling of 429 or 5xx, no exponential backoff in this route.

- **With `includeComments`:**  
  After profile + feed, the route loops over `posts.length` (up to 24) and for each post:
  1. `fetchPostByShortcode` (1–2 requests),
  2. then `fetchCommentsREST` (1–2), or on REST failure `fetchCommentsGraphQL` (1–2).  
  So **comments are sequential** (no parallel fan-out). Per post: ~2–4 requests; for 24 posts: **~48–96** extra requests, all one-after-another.

- **Retry / 429 / 5xx:**  
  The instagram-api route does **not** use `lib/net/fetchWithTimeout.ts`. That helper does implement retries with backoff and treats 429 as retryable; the Instagram code path does not use it. So today:
  - **429:** Treated like any other non-ok response (e.g. profile returns null, feed returns [], comments return []).
  - **5xx:** Same; no retry.
  - **Retries:** Only the high-level “try get auth header, catch and continue” in `scrapeInstagramAPI`; no per-request retry.

- **Worst-case request count per profile:**  
  - Auth: 1–2  
  - Profile: 1–2  
  - Feed: 1–2  
  - Comments (if enabled, 24 posts): 24 × (1 post + 1 comments) = 48, each possibly +1 for redirect → **~51–100+** requests per profile run, all from the same server IP and same session, with no backoff on 429.

---

## 4) Session / auth analysis

- **Cookie:** Only `sessionid` is sent in the `Cookie` header. Built in `getInstagramHeaders()` as `Cookie: sessionid=${sessionId}`. `sessionId` comes from `process.env.INSTAGRAM_SESSION_ID` (decoded via `decodeSessionId`). **`csrftoken` and `ds_user_id` are not** included in the instagram-api route (they exist in env and in the Playwright session service but are not passed to these API calls).

- **Headers:**  
  - `X-IG-App-ID`: hardcoded `567067343352427`.  
  - `X-IG-Device-ID` and `X-IG-Android-ID`: **new random values on every request** (generated inside `getInstagramHeaders()` via `generateAndroidId()`). So every call looks like a different device, which can look like bot behavior.  
  - `Authorization`: optional; only set when `getAuthorizationHeader()` returns a value (from response header `ig-set-authorization`). Not scraped from HTML; only from API response headers.  
  - No `x-asbd-id` or other auth headers are set in code.

- **Where session is stored/refreshed:**  
  - **Storage:** Session is read from env (`INSTAGRAM_SESSION_ID`; optionally `INSTAGRAM_CSRF_TOKEN`, `INSTAGRAM_DS_USER_ID` in other routes). Refreshed session is sent to `INSTAGRAM_WEBHOOK_URL` by `lib/services/instagram-session.ts`; something external (e.g. app backend) is expected to persist it and update env or config.  
  - **Refresh:** `/api/instagram/session/refresh` (and manual flow) use `InstagramSessionService.refreshSession()` (Playwright login), then `sendToWebhook(session)`. The API route does not refresh the session itself; it only uses whatever is in `INSTAGRAM_SESSION_ID`.

- **Reuse:** The same `sessionId` (and optional `authHeader`) is reused for **all** requests in a single profile run (auth header is fetched once, then passed into profile, feed, post, comments). So one logical “session” per run, but device IDs change every request.

---

## 5) Best insertion point for proxy logic

- **Single abstraction:** Introduce one helper through which every Instagram API HTTP call goes, e.g. **`fetchInstagram(url, init, options)`**, so that proxy (and later rotation/sticky behavior) is in one place.

- **Suggested location:** **`lib/net/instagramFetch.ts`** (new file). This keeps net-related helpers in `lib/net/` and keeps the API route focused on flow and parsing.

- **Suggested signature (for later implementation):**
  - `fetchInstagram(url: string | URL, init?: RequestInit, options?: { stickyKey?: string; rotationMode?: 'request' | 'profile'; timeoutMs?: number; logContext?: string }) : Promise<Response>`
  - `stickyKey`: e.g. username or scanId; used to pin the same proxy IP when using sticky sessions (e.g. Decodo sticky TTL).
  - `rotationMode`: “request” = new IP per call; “profile” = same IP for the whole profile run (e.g. one sticky key per scan).
  - `timeoutMs` and `logContext`: for timeout/abort and for safe logging (no secrets).

- **Call sites to switch to this helper:**  
  - In `app/api/test/instagram-api/route.ts`: replace every `fetch(...)` that targets `instagram.com` (including redirect follow-ups) with `fetchInstagram(...)`. That covers `getAuthorizationHeader`, `fetchProfile`, `fetchUserFeed`, `fetchPostByShortcode`, `fetchCommentsREST`, `fetchCommentsGraphQL`.  
  - In `lib/services/instagram-session.ts`: in `validateSession`, replace the single `fetch('https://www.instagram.com/api/v1/users/web_profile_info/...')` with `fetchInstagram(...)` so validation also goes through the same proxy when configured.

- **Playwright (session refresh):** Proxy for the **browser** (login flow) is a separate concern: either Playwright’s proxy in `browser.newContext({ proxy: { server, username, password } })` or launch args. That can be driven by the same Decodo env vars but implemented in `instagram-session.ts`; it does not go through `fetchInstagram`.

---

## 6) Proposed env var schema (names only)

Use these (or equivalent) for Decodo and behavior; **no secrets in this list**:

- `DECODO_PROXY_HOST` – proxy hostname.
- `DECODO_PROXY_PORT` – proxy port.
- `DECODO_PROXY_USER` – proxy username (secret; do not log).
- `DECODO_PROXY_PASS` – proxy password (secret; do not log).
- `DECODO_ROTATION_MODE` – `request` | `profile` (new IP per request vs per profile run).
- `DECODO_STICKY_TTL_SECONDS` – optional; sticky session TTL when using a sticky key (e.g. per-profile).

Optional:

- `DECODO_ENABLED` or `USE_DECODO_PROXY` – if unset or false, skip proxy and use direct fetch (for local/dev or when proxy is off).

Existing Instagram env vars (unchanged): `INSTAGRAM_SESSION_ID`, `INSTAGRAM_CSRF_TOKEN`, `INSTAGRAM_DS_USER_ID`, `INSTAGRAM_USERNAME`, `INSTAGRAM_PASSWORD`, `INSTAGRAM_WEBHOOK_URL`, `INSTAGRAM_WEBHOOK_SECRET`, `INSTAGRAM_2FA_BACKUP_CODE`, `INSTAGRAM_AUTOMATION_HEADLESS`. None of these need to be logged in full.

---

## 7) Risks / gotchas

- **Logging secrets:** Current code logs:
  - `Session ID length`, `Session ID decoded: ${sessionId.substring(0, 20)}...`, and auth header value `authHeader.substring(0, 50)...`. When adding proxy, ensure we never log proxy user/pass, full sessionid, or full auth header. Prefer `logContext` and redacted summaries (e.g. “auth present”, “session length 42”).
- **Redirect handling:** All current redirects are manual (second `fetch` to `location`). The proxy helper must apply the same proxy to this second request (same sticky key for that run), or Instagram may see IP change mid-flow.
- **Node fetch + agent:** In Node 18+, `fetch` can accept a `dispatcher` (undici) in `RequestInit`. We must pass the proxy agent/dispatcher into every `fetch` used for Instagram (including redirects). If the code ever runs in an environment where global fetch doesn’t support a custom dispatcher, we’d need a different approach (e.g. explicit proxy tunnel).
- **Vercel serverless:** Cold starts and short-lived processes are fine; sticky sessions can be in-memory per invocation (e.g. “this profile run uses this proxy IP”). For true sticky across invocations we’d need external state (e.g. cache by stickyKey); Decodo’s own sticky-by-session-id may handle that at the proxy layer if we send a consistent session identifier.
- **Playwright vs fetch:** Session refresh uses Playwright, not `fetchInstagram`. If we want login to also use Decodo, we must configure Playwright’s proxy in `instagram-session.ts` separately; otherwise only the API scraping route will use the proxy.
- **429 after proxy:** Adding proxy does not remove the need for retries/backoff. Consider using or adapting `fetchWithTimeout` (or equivalent) inside `fetchInstagram` so 429/5xx are retried with backoff even when using the proxy.
- **Device IDs:** Random `X-IG-Device-ID` / `X-IG-Android-ID` per request may still look suspicious. A later improvement could be one device id per sticky session (or per profile run) instead of per request; out of scope for this inspection.

---

**End of report. No code changes were made; inspection only.**
