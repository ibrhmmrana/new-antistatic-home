# n8n Workflow: Crawl Websites the Same Way as Our App

This doc explains **how we crawl** in this project and how to set up an n8n workflow that does the same thing (either by calling our API or by replicating the logic with nodes).

---

## How We Crawl (Current App)

1. **Input**: `url` (required), `maxDepth` (default 2), `maxPages` (default 20).
2. **Normalize URL**: Ensure `https://`, parse `baseUrl` (origin) and `baseDomain` (hostname).
3. **Pre-crawl** (parallel):
   - **robots.txt**: `GET https://{domain}/robots.txt` (we don’t block crawl by it; we only fetch for potential use).
   - **Sitemap**: Try `https://{domain}/sitemap.xml`, `sitemap_index.xml`, `sitemap-index.xml`; parse `<loc>...</loc>` and collect URLs (same domain only).
4. **Crawl queue**: BFS.
   - Seed: `[{ url: baseUrl, depth: 0 }]`.
   - Add up to 10 sitemap URLs as `depth: 1` (same domain, not already in queue).
   - Then process queue: shift URL, if not already crawled and `depth <= maxDepth`, scrape page; push discovered **internal** links with `depth + 1`; stop when `pageResults.length >= maxPages`.
5. **Per-page scrape** (Playwright headless Chrome):
   - New page, **stealth** (e.g. `navigator.webdriver = false`, permissions, plugins).
   - **Context**: viewport 1920×1080, Chrome 122 user-agent, locale en-US, timeouts 60s.
   - **Navigate**: `page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60s })`.
   - Optional: `waitForLoadState('networkidle', { timeout: 8s })`, then 1s delay.
   - **Extract in browser** (two `page.evaluate` calls):
     - Main: HTML, title, meta description, canonical, meta robots, h1–h4, all `a[href]` (href, text, isInHeader/Footer/Nav), all `img` (src, alt, dimensions), logo/hero, forms (action, method, fields, required), script srcs, stylesheet count, JSON-LD, Open Graph, analytics detection (GA, GA4, GTM, Meta Pixel, TikTok, Hotjar), Google Maps embed, copyright/dates, testimonials/team selectors, word count, favicon, HTTPS, FAQ/local/service/captcha detection, **main content** (main/article/role=main or body without nav/footer), above-fold text, content snippet, top phrases, entities.
     - Viewport: CTA visibility, tel/mailto/WhatsApp visibility, position (header/hero/body).
   - **Server-side**: Normalize all links with `normalizeUrl(href, baseUrl)`; discard `javascript:`, `mailto:`, `tel:`, `#`. **Internal** = same domain (hostname or `*.baseDomain`); internal links go to `discoveredUrls`. Classify external (social, booking, reviews, other). Extract phones/emails/prices from body text; classify forms; detect primary CTA; page type (home, contact, service, etc.); indexability (no `noindex`); build full `PageData` (SEO, performance, analytics, trust, UX checks, content_digest, viewport_checks).
   - **Timeout**: 30s per page; on timeout skip and continue.
   - **Politeness**: 300 ms delay between pages.
6. **Output**: `crawl_map` (array of `PageData`), `site_overview`, `scrape_metadata` (domain, crawl_duration_seconds, pages_crawled, crawl_depth), plus optional search_visibility, competitors, etc.

So “the same way” means: **headless Chrome, JS-rendered DOM, same viewport/UA/timeouts, BFS with depth/maxPages, sitemap seed, internal-link discovery, and the same per-page extraction and scoring.**

---

## Homepage only – one node

If you only need the **homepage** of any site (one URL, no deeper crawl), use a single node.

### Option 1: Use our API (full crawl, JS-rendered)

**One node: HTTP Request**

- **Method**: POST  
- **URL**: `https://YOUR_APP_URL/api/scan/website`  
- **Body** (JSON):
  ```json
  {
    "url": "https://example.com",
    "maxDepth": 0,
    "maxPages": 1
  }
  ```
- **Send** the site’s homepage as `url` (e.g. `https://example.com`). Response: `crawl_map` with one page (full Playwright extraction).

Use an expression for the URL if it comes from the previous node: `"url": "{{ $json.url }}"`.

---

### Option 2: Standalone in n8n (no API – static HTML only)

**One node: Code**

Paste this in a **Code** node. Input: one item with `url` (e.g. `https://example.com`). Output: one item with `title`, `meta_description`, `h1`, `links`, `status`.

```javascript
const url = ($input.first().json.url || '').trim();
const fullUrl = url.startsWith('http') ? url : `https://${url}`;

const res = await fetch(fullUrl, {
  redirect: 'follow',
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0' },
  signal: AbortSignal.timeout(15000)
});
const html = await res.text();

const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() || null;
const metaDesc = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1] || null;
const h1s = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || []).map(h => h.replace(/<[^>]+>/g, '').trim());
const links = (html.match(/<a\s+[^>]*href="([^"]+)"/gi) || []).map(m => (m.match(/href="([^"]+)"/i) || [])[1]).filter(Boolean);

return [{
  json: {
    url: fullUrl,
    title,
    meta_description: metaDesc,
    h1: h1s,
    links,
    status: res.status
  }
}];
```

That’s one node: homepage only, static HTML (no JavaScript rendering).

---

## Option A: Same Result – Call Our API from n8n (Recommended)

To get **exactly** the same crawl result from n8n with minimal setup:

1. **Trigger** (e.g. Manual, Webhook, or Schedule).
2. **HTTP Request** node:
   - **Method**: POST  
   - **URL**: `https://YOUR_DEPLOYMENT_URL/api/scan/website` (e.g. your Vercel URL).  
   - **Body Content Type**: JSON  
   - **Body**:
     ```json
     {
       "url": "https://example.com",
       "maxDepth": 2,
       "maxPages": 10
     }
     ```
   - Use expressions if you want: `{{ $json.url }}`, `{{ $json.maxDepth ?? 2 }}`, `{{ $json.maxPages ?? 20 }}`.
3. **Optional**: **Code** or **Set** node to reshape the response (e.g. only `crawl_map` and `scrape_metadata`).
4. **Optional**: **Split Out** on `crawl_map` to get one item per page for downstream nodes.

No browser in n8n; our API does the full Playwright crawl and returns the same structure.

---

## Option B: Replicate in n8n With Nodes (No Browser)

n8n has no built-in Playwright/Puppeteer. So we can only **approximate** the same logic using HTTP + HTML parsing (no JS execution). That gives:

- Same **flow**: normalize URL → robots/sitemap → BFS queue → per-URL fetch → extract links + meta → enqueue internal links.
- **Different** per-page content: we only see static HTML (no JS-rendered main content, no viewport checks, no real “above the fold”). So it’s “same structure of workflow,” not “same data” as the app.

Below is a node-by-node setup for Option B.

---

### Node 1: Trigger

- **Node**: **Manual Trigger** (or **Webhook** / **Schedule**).
- **Output**: One item, e.g. `{ "url": "https://example.com", "maxDepth": 2, "maxPages": 10 }`. You can use **Set** before this to define defaults.

---

### Node 2: Normalize URL and set base domain

- **Node**: **Code** (JavaScript).
- **Input**: `$input.first().json` with `url`, optionally `maxDepth`, `maxPages`.
- **Logic**:
  - Ensure URL has scheme: if `url` doesn’t start with `http`, prepend `https://`.
  - `new URL(url)` → `baseUrl = origin`, `baseDomain = hostname`.
- **Output**: One item, e.g. `{ url, baseUrl, baseDomain, maxDepth: maxDepth ?? 2, maxPages: maxPages ?? 20 }`.

Example (pseudo):

```js
const url = $input.first().json.url?.trim() || '';
const full = url.startsWith('http') ? url : `https://${url}`;
const u = new URL(full);
return [{
  json: {
    url: full,
    baseUrl: u.origin,
    baseDomain: u.hostname,
    maxDepth: $input.first().json.maxDepth ?? 2,
    maxPages: $input.first().json.maxPages ?? 20
  }
}];
```

---

### Node 3: Fetch robots.txt (optional)

- **Node**: **HTTP Request**.
- **Method**: GET  
- **URL**: `https://{{ $json.baseDomain }}/robots.txt`  
- **Options**: Timeout 8s, ignore SSL errors if needed.  
- **Output**: Pass through (e.g. add `robotsTxt: $binary?.data ? $binary.data.toString() : null` in a later Code node if you need it). For “same as app” we don’t use it to block; you can skip or just log.

---

### Node 4: Fetch sitemap and get initial URL list

- **Node**: **HTTP Request** (or **Code** that does 3 requests).
- Try in order:
  - `https://{{ $json.baseDomain }}/sitemap.xml`
  - `https://{{ $json.baseDomain }}/sitemap_index.xml`
  - `https://{{ $json.baseDomain }}/sitemap-index.xml`
- **Options**: Timeout 8s; continue on 404.
- **Next**: **Code** node to parse response body: match `<loc>([^<]+)</loc>`, filter URLs with same host as `baseDomain`, dedupe, take first 10.  
- **Output**: One item with `baseUrl`, `baseDomain`, `maxDepth`, `maxPages`, and `sitemapUrls: string[]` (length ≤ 10).

If you use a single HTTP Request, only one of the three sitemaps will return 200; parse that. If none exist, `sitemapUrls = []`.

---

### Node 5: Build initial crawl queue

- **Node**: **Code**.
- **Input**: Item from Node 4.
- **Logic**:
  - `crawlQueue = [{ url: baseUrl, depth: 0 }]`.
  - For each `sitemapUrls`, if same domain and not already in queue, push `{ url, depth: 1 }`.
  - Emit **one** item with `crawlQueue`, `crawledUrls: []`, `baseUrl`, `baseDomain`, `maxDepth`, `maxPages`, `pageResults: []`.

---

### Node 6: Loop – process one URL from the queue

Use an **n8n Loop** (or **Split In Batches** + **Merge** pattern). Here we describe a **Code** node that runs inside the loop and simulates “process one page and return updated state.”

- **Input**: One item with `crawlQueue`, `crawledUrls`, `baseUrl`, `baseDomain`, `maxDepth`, `maxPages`, `pageResults`.
- **Logic**:
  - If `crawlQueue.length === 0` or `pageResults.length >= maxPages` → return current state and signal “done” (e.g. a flag).
  - Shift one `{ url, depth }` from `crawlQueue`. If `url` is in `crawledUrls`, skip (get next); otherwise add to `crawledUrls`.
  - **HTTP Request** (sub-node or separate node): GET that `url`, timeout 30s, follow redirects. Save HTML body.
  - Parse HTML (next node): extract links (all `a[href]`), title, meta description, canonical, h1–h4, etc. (e.g. with **Code** using regex or a simple HTML parser; n8n’s “Extract from File” can help if you pass HTML as buffer).
  - **Normalize links**: for each href, resolve with `baseUrl`, drop hash, skip `javascript:`, `mailto:`, `tel:`, `#`. **Internal** = hostname === `baseDomain` (or ends with `.baseDomain`). Add internal links to `discoveredUrls`.
  - Build a **minimal page object** (title, meta, h1, url, internal_links, etc.) and push to `pageResults`.
  - For each `discoveredUrl` not in `crawledUrls` and not in `crawlQueue`, push `{ url: discoveredUrl, depth: depth + 1 }` to `crawlQueue` (only if `depth < maxDepth`).
  - Wait 300 ms (e.g. in Code with `await new Promise(r => setTimeout(r, 300))` if running in Code; or use n8n “Wait” node).
  - Return one item with updated `crawlQueue`, `crawledUrls`, `pageResults`, and “done” flag when queue empty or `pageResults.length >= maxPages`.

In n8n you typically implement the “loop” by:
- **Option 6a**: **Loop Over Items** (or **Split In Batches**): each iteration runs HTTP Request → Parse HTML → Code (normalize links, update queue, build page result). You need to pass the full state (queue, crawled, pageResults) in each item and merge back (e.g. with **Merge** or **Aggregate**).
- **Option 6b**: **Code** node that runs a `while` loop internally: in one execution it does multiple HTTP requests (respecting 300 ms delay), until `maxPages` or queue empty. Then returns one item with `pageResults` and metadata. This avoids n8n loop wiring but may hit execution-time limits for large crawls.

Recommendation for “same as app” **structure** in n8n: use **Option 6b** in a single **Code** node (with a simple HTTP client and HTML parser) so you have one place that implements BFS, same-domain check, and maxDepth/maxPages. Below is a minimal Code sketch.

---

### Node 6b (single Code node that does BFS)

- **Input**: One item from Node 5: `baseUrl`, `baseDomain`, `maxDepth`, `maxPages`, `crawlQueue`, `crawledUrls`, `pageResults`.
- **Code** (simplified; run in n8n Code node with `fetch` available, or use HTTP Request in a subflow):

```js
// Pseudocode – adapt to n8n (e.g. use $httpRequest or fetch from Code)
const baseUrl = $input.first().json.baseUrl;
const baseDomain = $input.first().json.baseDomain;
const maxDepth = $input.first().json.maxDepth;
const maxPages = $input.first().json.maxPages;
let crawlQueue = [...($input.first().json.crawlQueue || [{ url: baseUrl, depth: 0 }])];
let crawled = new Set($input.first().json.crawledUrls || []);
let pageResults = $input.first().json.pageResults || [];

function normalizeUrl(href, base) {
  if (!href || /^(javascript:|mailto:|tel:|#)/.test(href)) return null;
  try {
    const u = new URL(href, base);
    u.hash = '';
    return u.href.replace(/\/$/, '') || u.href;
  } catch { return null; }
}
function isSameDomain(url, domain) {
  try {
    const h = new URL(url).hostname;
    return h === domain || h.endsWith('.' + domain);
  } catch { return false; }
}

while (crawlQueue.length > 0 && pageResults.length < maxPages) {
  const { url, depth } = crawlQueue.shift();
  if (crawled.has(url) || depth > maxDepth) continue;
  crawled.add(url);
  let html = '';
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
    html = await res.text();
  } catch (e) {
    continue;
  }
  // Parse: title, meta description, h1, links (regex or simple parser)
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || null;
  const metaDesc = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1] || null;
  const h1Match = html.match(/<h1[^>]*>([^<]*)<\/h1>/gi);
  const h1Texts = h1Match ? h1Match.map(h => h.replace(/<[^>]+>/g, '').trim()) : [];
  const linkMatches = html.match(/<a\s+[^>]*href="([^"]*)"/gi) || [];
  const discovered = [];
  for (const m of linkMatches) {
    const href = m.match(/href="([^"]*)"/)?.[1];
    const norm = normalizeUrl(href, baseUrl);
    if (norm && isSameDomain(norm, baseDomain) && !crawled.has(norm) && !crawlQueue.some(q => q.url === norm)) {
      discovered.push(norm);
      crawlQueue.push({ url: norm, depth: depth + 1 });
    }
  }
  pageResults.push({
    url,
    depth,
    title,
    meta_description: metaDesc,
    h1_text: h1Texts,
    internal_links: discovered
  });
  await new Promise(r => setTimeout(r, 300));
}

return [{ json: { pageResults, baseUrl, baseDomain, pages_crawled: pageResults.length } }];
```

- **Output**: One item with `pageResults`, `baseUrl`, `baseDomain`, `pages_crawled`. This is the “crawl_map” equivalent (simplified; no JS-rendered content).

---

### Node 7: Final shape (optional)

- **Code** or **Set**: Format output like our API, e.g.  
  `{ crawl_map: $json.pageResults, scrape_metadata: { domain: $json.baseDomain, pages_crawled: $json.pages_crawled } }`.

---

## Summary

| Goal | Approach | n8n setup |
|------|----------|-----------|
| **Exact same crawl (JS, viewport, scoring)** | Use our API | Trigger → **HTTP Request** POST `.../api/scan/website` with `{ url, maxDepth, maxPages }`. |
| **Same flow, static HTML only** | Replicate in n8n | Trigger → Normalize URL (Code) → Sitemap (HTTP + Code) → Build queue (Code) → BFS loop (Code with fetch + parse) → Format (Code). |

For “the exact same way” in terms of **data**, use **Option A**. For learning or running without calling your app, use **Option B** and accept that per-page content will be static-HTML-only unless you add a browser (e.g. a custom n8n node or external service that runs Playwright).

---

## Quick node checklist

### Option A – Use our API (exact same crawl)

| # | Node            | What to set |
|---|-----------------|-------------|
| 1 | **Manual Trigger** (or Webhook/Schedule) | — |
| 2 | **Set** (optional) | `url`, `maxDepth` (default 2), `maxPages` (default 10) |
| 3 | **HTTP Request** | Method: POST. URL: `https://YOUR_APP_URL/api/scan/website`. Body (JSON): `{ "url": "{{ $json.url }}", "maxDepth": {{ $json.maxDepth ?? 2 }}, "maxPages": {{ $json.maxPages ?? 10 }} }` |
| 4 | **Code** or **Set** (optional) | Take `crawl_map`, `scrape_metadata` from response for next steps |

### Option B – Replicate in n8n (static HTML only)

| # | Node            | What to set |
|---|-----------------|-------------|
| 1 | **Manual Trigger** | — |
| 2 | **Code** | Normalize URL → output `url`, `baseUrl`, `baseDomain`, `maxDepth`, `maxPages` |
| 3 | **HTTP Request** (optional) | GET `https://{{ $json.baseDomain }}/robots.txt` |
| 4 | **HTTP Request** | GET sitemap (e.g. `https://{{ $json.baseDomain }}/sitemap.xml`) |
| 5 | **Code** | Parse `<loc>` from sitemap; same-domain filter; build `crawlQueue` with seed + first 10 sitemap URLs |
| 6 | **Code** | BFS loop: while queue not empty and `pageResults.length < maxPages`, fetch URL, parse HTML (title, meta, h1, links), normalize links, same-domain → discovered, push to queue; 300 ms delay; build `pageResults` |
| 7 | **Code** or **Set** | Format as `crawl_map` + `scrape_metadata` |
