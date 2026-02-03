# Decodo Proxy Setup for Instagram Scraping

All Instagram API HTTP calls go through `fetchInstagram()` in `lib/net/instagramFetch.ts`, which routes traffic via Decodo residential proxies when enabled.

## Environment Variables

Add to `.env.local` (and Vercel Environment Variables for production). **Never commit real credentials.**

| Variable | Required | Description |
|----------|----------|-------------|
| `DECODO_ENABLED` | No | Set to `true` or `1` to enable proxy. Omit or `false` = direct connection. |
| `USE_DECODO_PROXY` | No | Alternative to `DECODO_ENABLED` (same effect). |
| `DECODO_PROXY_HOST` | Yes* | Proxy hostname (e.g. `gate.decodo.com`). |
| `DECODO_PROXY_PORT` | Yes* | Proxy port (e.g. `10001`). |
| `DECODO_PROXY_USER` | Yes* | Proxy username. **Do not log.** |
| `DECODO_PROXY_PASS` | Yes* | Proxy password. **Do not log.** |
| `DECODO_ROTATION_MODE` | No | `request` = new IP per request; `profile` = same IP per profile run (sticky). Default: `profile`. |
| `DECODO_STICKY_TTL_SECONDS` | No | Sticky session TTL in seconds when using `profile` mode. Default: `300`. |
| `DECODO_ENDPOINTS` | No | Comma-separated list of `host:port` for multiple endpoints (e.g. `gate.decodo.com:10001,us.gate.decodo.com:10002`). Overrides single host/port when set. |

\* Required when proxy is enabled. If `DECODO_ENABLED` is not set, proxy is off and these are unused.

## Example (no real secrets)

```env
DECODO_ENABLED=true
DECODO_PROXY_HOST=gate.decodo.com
DECODO_PROXY_PORT=10001
DECODO_PROXY_USER=your_username
DECODO_PROXY_PASS=your_password
DECODO_ROTATION_MODE=profile
DECODO_STICKY_TTL_SECONDS=300
```

## Testing

- **Proxy connectivity:** `GET /api/test/proxy-test` — returns `yourIp` (exit IP). When proxy is enabled, this should be the proxy IP, not your server IP.
- **Instagram scrape:** Use the existing `POST /api/test/instagram-api` with `{ "username": "instagram", "includeComments": false }` and check logs for `[PROXY]` lines (no credentials logged).

## Behavior

- **Rotation mode `request`:** Each `fetchInstagram()` call may use a different proxy endpoint (round-robin).
- **Rotation mode `profile`:** All requests with the same `stickyKey` (e.g. username) use the same proxy for `DECODO_STICKY_TTL_SECONDS`.
- **429 / 5xx:** Automatically retried with backoff; the proxy that returned 429 is temporarily avoided.
- **Redirects:** Redirect follow-ups use the same proxy/sticky key as the initial request.

## Files

- `lib/net/instagramFetch.ts` — `fetchInstagram()` helper (proxy + retries + timeout).
- `lib/services/decodo-proxy-manager.ts` — Proxy selection, sticky sessions, failure cooldown.
- `app/api/test/instagram-api/route.ts` — All Instagram API calls use `fetchInstagram`.
- `lib/services/instagram-session.ts` — `validateSession()` uses `fetchInstagram`.
