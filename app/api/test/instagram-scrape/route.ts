import { NextRequest, NextResponse } from "next/server";
import { chromium as pwChromium } from "playwright-core";
import type { Browser, Page, BrowserContext } from "playwright-core";
import chromium from "@sparticuz/chromium";

export const runtime = "nodejs";

const TIMEOUT_MS = 60000; // 60 seconds for scraping

// =============================================================================
// MINIMAL OUTPUT SHAPE (as requested)
// =============================================================================

type Comment = {
  author: string;
  text: string;
};

type ScrapeResult = {
  profile: {
    username: string;
    fullName: string | null;
    profilePictureUrl: string | null;
    biography: string | null;
    website: string | null;
    isVerified: boolean;
    category: string | null;
    postCount: number | null;
    followerCount: number | null;
    followingCount: number | null;
  };
  posts: Array<{
    id: string;
    url: string;
    thumbnailUrl: string | null;
    date: string | null; // ISO date (best effort)
    caption: string | null;
    likeCount: number | null;
    commentCount: number | null;
    comments: Comment[]; // comment with author and text
  }>;
};

type PostLink = {
  id: string;
  href: string; // /p/{id}/ or /reel/{id}/
  thumbnailUrl: string | null; // from grid
};

function parseCount(str: string | null | undefined): number | null {
  if (!str) return null;
  const cleaned = str.replace(/,/g, "").trim().toLowerCase();
  const numMatch = cleaned.match(/([\d.]+)/);
  if (!numMatch) return null;
  const num = parseFloat(numMatch[1]);
  if (Number.isNaN(num)) return null;
  if (cleaned.includes("m")) return Math.floor(num * 1_000_000);
  if (cleaned.includes("k")) return Math.floor(num * 1_000);
  return Math.floor(num);
}

function extractPostIdFromHref(href: string): string | null {
  const match = href.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
  return match ? match[2] : null;
}

function toAbsoluteInstagramUrl(href: string): string {
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return `https://www.instagram.com${href}`;
  return `https://www.instagram.com/${href}`;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Injects Instagram session cookies for authenticated access
 */
async function injectInstagramSessionCookies(context: BrowserContext): Promise<boolean> {
  const sessionId = process.env.INSTAGRAM_SESSION_ID;
  if (!sessionId) {
    console.log(`[SCRAPE] ⚠️ INSTAGRAM_SESSION_ID not configured`);
    return false;
  }

  const cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  }> = [
    {
      name: 'sessionid',
      value: sessionId,
      domain: '.instagram.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax' as const,
    },
  ];

  if (process.env.INSTAGRAM_CSRF_TOKEN) {
    cookies.push({
      name: 'csrftoken',
      value: process.env.INSTAGRAM_CSRF_TOKEN,
      domain: '.instagram.com',
      path: '/',
      secure: true,
      sameSite: 'Lax' as const,
    });
  }

  if (process.env.INSTAGRAM_DS_USER_ID) {
    cookies.push({
      name: 'ds_user_id',
      value: process.env.INSTAGRAM_DS_USER_ID,
      domain: '.instagram.com',
      path: '/',
      secure: true,
      sameSite: 'Lax' as const,
    });
  }

  try {
    await context.addCookies(cookies);
    console.log(`[SCRAPE] ✅ Session cookies injected (${cookies.length} cookies)`);
    return true;
  } catch (error) {
    console.error(`[SCRAPE] ❌ Cookie injection failed:`, error);
    return false;
  }
}

/**
 * Sets up stealth properties to avoid bot detection
 */
async function setupStealth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: PermissionDescriptor) => (
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : originalQuery(parameters)
    );

    Object.defineProperty(window, 'chrome', {
      get: () => ({
        runtime: {},
        loadTimes: () => {},
        csi: () => {},
        app: { isInstalled: false },
      }),
    });

    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });

    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
      if (parameter === 37445) return 'Intel Inc.';
      if (parameter === 37446) return 'Intel Iris OpenGL Engine';
      return getParameter.call(this, parameter);
    };
  });

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  });
}

async function extractProfileBasics(page: Page, username: string): Promise<ScrapeResult["profile"]> {
  await page.waitForSelector("header, main", { timeout: 15000 });
  await page.waitForTimeout(800);

  // Try to expand biography by clicking the "more" button
  // Button structure: <div role="button"><span>more</span></div>
  try {
    const moreButton = page.locator('div[role="button"]').filter({ hasText: /^more$/i }).first();
    if (await moreButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`[SCRAPE] Found "more" button, clicking to expand bio...`);
      await moreButton.click().catch(() => {});
      await page.waitForTimeout(1500); // Wait for bio to expand
    }
  } catch {
    // ignore if no more button
  }

  const profileData = await page.evaluate((targetUsername: string) => {
    const header = document.querySelector("header") || document.querySelector("main") || document.body;

    const getText = (el: Element | null): string | null => {
      const t = el?.textContent?.trim();
      return t && t.length > 0 ? t : null;
    };

    const parseCountFromText = (text: string | null): number | null => {
      if (!text) return null;
      const cleaned = text.replace(/,/g, "").trim().toLowerCase();
      const numMatch = cleaned.match(/([\d.]+)/);
      if (!numMatch) return null;
      const num = parseFloat(numMatch[1]);
      if (Number.isNaN(num)) return null;
      if (cleaned.includes("m")) return Math.floor(num * 1_000_000);
      if (cleaned.includes("k")) return Math.floor(num * 1_000);
      return Math.floor(num);
    };

    const pickBestFromSrcset = (img: Element): string | null => {
      const srcset = img.getAttribute("srcset");
      const src = (img as HTMLImageElement).src || null;
      if (!srcset) return src;
      let bestUrl: string | null = null;
      let bestW = 0;
      for (const part of srcset.split(",").map((p) => p.trim())) {
        const m = part.match(/^(.+?)\s+(\d+)w$/);
        if (!m) continue;
        const url = m[1];
        const w = parseInt(m[2], 10);
        if (w > bestW) {
          bestW = w;
          bestUrl = url;
        }
      }
      return bestUrl || src;
    };

    // Profile picture - look for profile picture image
    let profilePictureUrl: string | null = null;
    const imgs = Array.from(header.querySelectorAll("img"));
    for (const img of imgs) {
      const alt = (img.getAttribute("alt") || "").toLowerCase();
      if (alt.includes("profile picture") && alt.includes(targetUsername.toLowerCase())) {
        const url = pickBestFromSrcset(img);
        if (url) {
          profilePictureUrl = url;
          break;
        }
      }
    }
    if (!profilePictureUrl) {
      for (const img of imgs) {
        const url = pickBestFromSrcset(img);
        if (url && url.includes("cdninstagram.com") && url.includes("t51.2885-19")) {
          profilePictureUrl = url;
          break;
        }
      }
    }

    // Username - from span with specific classes
    // <span class="x1lliihq x193iq5w x6ikm8r x10wlt62 xlyipyv xuxw1ft">username</span>
    let extractedUsername: string | null = null;
    const usernameSpan = header.querySelector('span.x1lliihq.x193iq5w.x6ikm8r.x10wlt62.xlyipyv.xuxw1ft');
    if (usernameSpan) {
      extractedUsername = getText(usernameSpan);
    }

    // Full name - from span with specific classes and dir="auto"
    // <span class="x1lliihq x1plvlek xryxfnj x1n2onr6 xyejjpt x15dsfln x193iq5w xeuugli x1fj9vlw x13faqbe x1vvkbs x1s928wv xhkezso x1gmr53x x1cpjm7i x1fgarty x1943h6x x1i0vuye xvs91rp xo1l8bm x5n08af x10wh9bi xpm28yp x8viiok x1o7cslx" dir="auto">Full Name</span>
    let fullName: string | null = null;
    // Look for span with dir="auto" that has the style attribute with line-clamp (characteristic of full name)
    const fullNameSpans = Array.from(header.querySelectorAll('span[dir="auto"]'));
    for (const span of fullNameSpans) {
      const style = span.getAttribute('style') || '';
      // Full name span has this style: --x---base-line-clamp-line-height: 18px
      if (style.includes('--x---base-line-clamp-line-height') || style.includes('line-clamp')) {
        const spanText = getText(span);
        if (spanText && 
            spanText.toLowerCase() !== targetUsername.toLowerCase() &&
            !spanText.match(/^[\d.,KkMm]+\s*(posts?|followers?|following)/i) &&
            !spanText.match(/\.(com|co|za|net|org|restaurant)/i) &&
            spanText.length > 2 && spanText.length < 200) {
          // Make sure it's not inside a link
          if (!span.closest('a')) {
            fullName = spanText;
            break;
          }
        }
      }
    }

    // Followers count - look for span containing "followers"
    // <span>20.6K followers</span> or similar structure
    let followerCount: number | null = null;
    let followingCount: number | null = null;
    let postCount: number | null = null;
    
    const allSpans = Array.from(header.querySelectorAll('span'));
    for (const span of allSpans) {
      const spanText = getText(span);
      if (!spanText) continue;
      
      if (spanText.toLowerCase().includes('followers')) {
        // Extract the number part
        const countMatch = spanText.match(/([\d.,KkMm]+)\s*followers/i);
        if (countMatch) {
          followerCount = parseCountFromText(countMatch[1]);
        }
      }
      if (spanText.toLowerCase().includes('following') && !spanText.toLowerCase().includes('followers')) {
        const countMatch = spanText.match(/([\d.,KkMm]+)\s*following/i);
        if (countMatch) {
          followingCount = parseCountFromText(countMatch[1]);
        }
      }
      if (spanText.toLowerCase().includes('posts')) {
        const countMatch = spanText.match(/([\d.,KkMm]+)\s*posts?/i);
        if (countMatch) {
          postCount = parseCountFromText(countMatch[1]);
        }
      }
    }

    // Category - from div with specific classes
    // <div class="_ap3a _aaco _aacu _aacy _aad6 _aade" dir="auto">Restaurant</div>
    let category: string | null = null;
    const categoryDiv = header.querySelector('div._ap3a._aaco._aacu._aacy._aad6._aade[dir="auto"]');
    if (categoryDiv) {
      category = getText(categoryDiv);
    }

    // Biography - from span with specific classes (may be nested)
    // Structure after clicking "more": 
    // <span class="_ap3a _aaco _aacu _aacx _aad7 _aade" dir="auto">
    //   <div role="button"><span class="_ap3a _aaco _aacu _aacx _aad7 _aade" dir="auto">bio text</span></div>
    // </span>
    let biography: string | null = null;
    const bioSpans = Array.from(header.querySelectorAll('span._ap3a._aaco._aacu._aacx._aad7._aade[dir="auto"]'));
    for (const bioSpan of bioSpans) {
      // Look for the innermost bio span (inside div[role="button"])
      const innerBioSpan = bioSpan.querySelector('div[role="button"] span._ap3a._aaco._aacu._aacx._aad7._aade[dir="auto"]');
      let bioText = '';
      
      if (innerBioSpan) {
        // Get text from the inner span - this is the expanded bio
        bioText = innerBioSpan.textContent?.trim() || '';
      } else {
        // Fallback to outer span text
        bioText = bioSpan.textContent?.trim() || '';
      }
      
      // Remove any "more" or "less" button text
      bioText = bioText.replace(/\s*(more|less)\s*$/i, '').trim();
      
      if (bioText && 
          bioText.length > 10 && // Bio should be substantial
          !bioText.match(/^[\d.,KkMm]+\s*(posts?|followers?|following)/i) &&
          !bioText.toLowerCase().includes('view profile') &&
          bioText.toLowerCase() !== targetUsername.toLowerCase()) {
        biography = bioText;
        break;
      }
    }

    // Website - from div with specific classes
    // <div class="_ap3a _aaco _aacw _aacx _aada _aade" dir="auto">cafecaprice.co.za and 3 more</div>
    let website: string | null = null;
    const websiteDiv = header.querySelector('div._ap3a._aaco._aacw._aacx._aada._aade[dir="auto"]');
    if (websiteDiv) {
      let websiteText = getText(websiteDiv);
      if (websiteText && 
          websiteText.toLowerCase() !== targetUsername.toLowerCase() &&
          (websiteText.includes('.') || websiteText.match(/\.(com|co|io|net|org|za|restaurant)/i))) {
        // Clean up - remove "and X more" if present, just get the main URL
        websiteText = websiteText.replace(/\s+and\s+\d+\s+more$/i, '').trim();
        website = websiteText;
      }
    }
    
    // Fallback: look for website in links if not found in div
    if (!website) {
      const allLinks = Array.from(header.querySelectorAll('a[href]'));
      for (const link of allLinks) {
        const href = link.getAttribute('href') || '';
        const linkText = getText(link);
        // Check for external links
        if (href.includes('l.instagram.com') || (href.startsWith('http') && !href.includes('instagram.com/'))) {
          if (linkText && 
              linkText.toLowerCase() !== targetUsername.toLowerCase() &&
              (linkText.includes('.') || linkText.match(/\.(com|co|io|net|org|za|restaurant)/i))) {
            website = linkText.replace(/\s+and\s+\d+\s+more$/i, '').trim();
            break;
          }
        }
      }
    }

    // Verification status - look for verified badge SVG
    let isVerified = false;
    const verifiedSvg = header.querySelector('svg[aria-label="Verified"]');
    if (verifiedSvg) {
      isVerified = true;
    }
    const verifiedTitle = header.querySelector('[title="Verified"]');
    if (verifiedTitle) {
      isVerified = true;
    }

    return { 
      profilePictureUrl, 
      extractedUsername,
      fullName,
      postCount, 
      followerCount, 
      followingCount,
      category,
      biography, 
      website, 
      isVerified 
    };
  }, username);

  return { 
    username: profileData.extractedUsername || username, 
    fullName: profileData.fullName,
    profilePictureUrl: profileData.profilePictureUrl, 
    biography: profileData.biography,
    website: profileData.website,
    isVerified: profileData.isVerified,
    postCount: profileData.postCount,
    followerCount: profileData.followerCount,
    followingCount: profileData.followingCount,
    category: profileData.category,
  };
}

async function extractLast5PostLinksWithThumbnails(page: Page): Promise<PostLink[]> {
  // Instagram sometimes loads profile chrome but delays the grid, or the profile is private / has 0 posts.
  // So we retry a few times and avoid throwing.
  for (let attempt = 0; attempt < 5; attempt++) {
    // quick private/empty detection
    const isPrivateOrEmpty = await page.evaluate(() => {
      const t = (document.body.textContent || "").toLowerCase();
      return (
        t.includes("this account is private") ||
        t.includes("no posts yet") ||
        t.includes("when") && t.includes("posts") && t.includes("will appear here")
      );
    }).catch(() => false);
    if (isPrivateOrEmpty) return [];

    const found = await page.evaluate(() => {
    const pickBestFromSrcset = (img: Element): string | null => {
      const srcset = img.getAttribute("srcset");
      const src = (img as HTMLImageElement).src || null;
      if (!srcset) return src;
      let bestUrl: string | null = null;
      let bestW = 0;
      for (const part of srcset.split(",").map((p) => p.trim())) {
        const m = part.match(/^(.+?)\s+(\d+)w$/);
        if (!m) continue;
        const url = m[1];
        const w = parseInt(m[2], 10);
        if (w > bestW) {
          bestW = w;
          bestUrl = url;
        }
      }
      return bestUrl || src;
    };

    const seen = new Set<string>();
    const out: Array<{ id: string; href: string; thumbnailUrl: string | null }> = [];
    // Use contains selector (href*), because IG sometimes appends query params and doesn't always start with /p/
    const anchors = Array.from(document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]'));
    for (const a of anchors) {
      const href = a.getAttribute("href");
      if (!href) continue;
      const m = href.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
      if (!m) continue;
      const id = m[2];
      if (seen.has(id)) continue;
      seen.add(id);

      const img = a.querySelector("img");
      const thumbnailUrl = img ? pickBestFromSrcset(img) : null;
      out.push({ id, href, thumbnailUrl });
      if (out.length >= 5) break;
    }
    return out;
    });

    if (found.length > 0) return found;

    // retry: wait + scroll a bit to trigger lazy load
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await page.waitForTimeout(600);
  }

  return [];
}

async function extractPostDetails(page: Page, post: PostLink): Promise<ScrapeResult["posts"][number] | null> {
  const url = toAbsoluteInstagramUrl(post.href);
  console.log(`[POST ${post.id}] Starting extraction...`);

  // Primary path: click the post on the profile to open the modal dialog and extract from there.
  try {
    const modalOpened = await (async () => {
      try {
        const link = page.locator(`a[href*="/p/${post.id}"], a[href*="/reel/${post.id}"]`).first();
        if (await link.isVisible({ timeout: 3000 }).catch(() => false)) {
          console.log(`[POST ${post.id}] Found post link, clicking...`);
          await link.click({ timeout: 5000 }).catch(() => {});
        } else {
          // Fallback: try to click by any href containing the id
          const link2 = page.locator(`a[href*="${post.id}"]`).first();
          if (await link2.isVisible({ timeout: 2000 }).catch(() => false)) {
            console.log(`[POST ${post.id}] Found post link (fallback), clicking...`);
            await link2.click({ timeout: 5000 }).catch(() => {});
          } else {
            console.log(`[POST ${post.id}] Could not find post link on page`);
            return false;
          }
        }

        // Wait for dialog
        await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
        await page.waitForTimeout(800);
        console.log(`[POST ${post.id}] Modal dialog opened successfully`);
        return true;
      } catch (e) {
        console.log(`[POST ${post.id}] Failed to open modal:`, e);
        return false;
      }
    })();

    console.log(`[POST ${post.id}] Modal opened: ${modalOpened}`);

    if (modalOpened) {
      // Wait for comments to fully load
      await page.waitForTimeout(1500);

      const modalData = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
        if (!dialog) return null;

        const getText = (el: Element | null): string | null => {
          const t = el?.textContent?.trim();
          return t && t.length > 0 ? t : null;
        };

        // Date is reliably present inside the modal footer as time[datetime]
        const timeEl = dialog.querySelector('time[datetime]') as HTMLTimeElement | null;
        const date = timeEl?.getAttribute('datetime') || null;

        // Caption: Instagram uses h1[dir="auto"] for the main caption in the modal
        const captionEl = dialog.querySelector('h1[dir="auto"]');
        const caption = getText(captionEl);

        // Like/comment counts: best-effort parse from dialog text (avoid classnames)
        const dialogText = (dialog.textContent || "").replace(/\s+/g, " ").trim();
        const likeMatch = dialogText.match(/([\d,.KkMm]+)\s+likes?/i);
        const commentMatch = dialogText.match(/([\d,.KkMm]+)\s+comments?/i);

        const parseCountLocal = (str: string | null): number | null => {
          if (!str) return null;
          const cleaned = str.replace(/,/g, "").trim().toLowerCase();
          const numMatch = cleaned.match(/([\d.]+)/);
          if (!numMatch) return null;
          const num = parseFloat(numMatch[1]);
          if (Number.isNaN(num)) return null;
          if (cleaned.includes("m")) return Math.floor(num * 1_000_000);
          if (cleaned.includes("k")) return Math.floor(num * 1_000);
          return Math.floor(num);
        };

        const likeCount = parseCountLocal(likeMatch ? likeMatch[1] : null);
        const commentCount = parseCountLocal(commentMatch ? commentMatch[1] : null);

        // Comments extraction - based on actual Instagram modal structure:
        // Each comment is in: ul._a9ym > li._a9zj
        // Author: h3 > a[href^="/"][role="link"]
        // Comment text: span._ap3a._aaco._aacu._aacx._aad7._aade[dir="auto"]
        const comments: Array<{ author: string; text: string }> = [];
        const seen = new Set<string>();
        
        // Find all comment list items - each comment is in ul._a9ym > li
        // The structure is: ul._a9ym contains a single li for each comment
        const commentUls = Array.from(dialog.querySelectorAll('ul._a9ym'));
        const debug = { ulCount: commentUls.length, extracted: 0 };

        for (const ul of commentUls) {
          const li = ul.querySelector('li');
          if (!li) continue;
          
          // Skip if this is the caption (contains h1)
          if (li.querySelector('h1[dir="auto"]')) continue;
          
          // Get author from h3 > a[role="link"]
          const authorLink = li.querySelector('h3 a[role="link"]');
          const author = getText(authorLink) || "";
          if (!author) continue;
          
          // Get comment text from the specific span class used by Instagram
          // The class is: _ap3a _aaco _aacu _aacx _aad7 _aade
          const commentSpan = li.querySelector('span._ap3a._aaco._aacu._aacx._aad7._aade[dir="auto"]');
          const commentText = getText(commentSpan);
          if (!commentText) continue;
          
          // Skip if this looks like the caption's author area
          if (commentText === author) continue;
          
          const cleaned = commentText.replace(/\s+/g, " ").trim();
          if (cleaned.length < 1) continue;
          
          // Dedup by author+comment content
          const key = `${author}::${cleaned}`.substring(0, 200);
          if (seen.has(key)) continue;
          seen.add(key);
          comments.push({ author, text: cleaned });
          debug.extracted++;
        }

        return { date, caption, likeCount, commentCount, comments, debug };
      });

      // Close modal (Escape)
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(500);

      if (!modalData) {
        console.log(`[POST ${post.id}] Modal data extraction returned null`);
        return null;
      }
      
      // Log debug info
      console.log(`[POST ${post.id}] Modal extraction debug:`, JSON.stringify(modalData.debug));
      console.log(`[POST ${post.id}] Extracted ${modalData.comments.length} comments, commentCount=${modalData.commentCount}`);
      
      return {
        id: post.id,
        url,
        thumbnailUrl: post.thumbnailUrl,
        date: modalData.date,
        caption: modalData.caption,
        likeCount: modalData.likeCount,
        commentCount: modalData.commentCount,
        comments: modalData.comments,
      };
    }
  } catch (e) {
    console.warn(`[SCRAPE] ⚠️ Modal extraction failed for post ${post.id}:`, e);
  }

  // Fallback: navigate directly and use OG/meta + visible comments.
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("article, main", { timeout: 15000 });
    await page.waitForTimeout(1500);

    const data = await page.evaluate(() => {
      const getMeta = (selector: string): string | null => {
        const el = document.querySelector(selector);
        const v = el?.getAttribute("content");
        return v && v.trim().length > 0 ? v.trim() : null;
      };

      const ogImage = getMeta('meta[property="og:image"]');
      const ogDescription = getMeta('meta[property="og:description"]') || getMeta('meta[name="description"]');

      let likeCount: number | null = null;
      let commentCount: number | null = null;
      let captionFromOg: string | null = null;

      if (ogDescription) {
        const likeMatch = ogDescription.match(/([\d,]+)\s+likes?/i);
        const commentMatch = ogDescription.match(/([\d,]+)\s+comments?/i);
        if (likeMatch) likeCount = parseInt(likeMatch[1].replace(/,/g, ""), 10);
        if (commentMatch) commentCount = parseInt(commentMatch[1].replace(/,/g, ""), 10);
        const quoteMatch = ogDescription.match(/:\s*\"([\s\S]+)\"\s*$/);
        if (quoteMatch) captionFromOg = quoteMatch[1]?.trim() || null;
      }

      const article = document.querySelector("article") || document.querySelector("main") || document.body;
      const timeEl = article.querySelector("time[datetime]") as HTMLTimeElement | null;
      const date = timeEl?.getAttribute("datetime") || null;

      // Comments extraction - using same logic as modal
      const getText = (el: Element | null): string | null => {
        const t = el?.textContent?.trim();
        return t && t.length > 0 ? t : null;
      };

      const comments: Array<{ author: string; text: string }> = [];
      const seen = new Set<string>();
      
      // Find all comment list items using Instagram's specific class structure
      const commentUls = Array.from(article.querySelectorAll('ul._a9ym'));
      
      for (const ul of commentUls) {
        const li = ul.querySelector('li');
        if (!li) continue;
        
        // Skip caption (contains h1)
        if (li.querySelector('h1[dir="auto"]')) continue;
        
        // Get author from h3 > a[role="link"]
        const authorLink = li.querySelector('h3 a[role="link"]');
        const author = getText(authorLink) || "";
        if (!author) continue;
        
        // Get comment text from the specific span class
        const commentSpan = li.querySelector('span._ap3a._aaco._aacu._aacx._aad7._aade[dir="auto"]');
        const commentText = getText(commentSpan);
        if (!commentText || commentText === author) continue;
        
        const cleaned = commentText.replace(/\s+/g, " ").trim();
        if (cleaned.length < 1) continue;
        
        const key = `${author}::${cleaned}`.substring(0, 200);
        if (seen.has(key)) continue;
        seen.add(key);
        comments.push({ author, text: cleaned });
      }

      return { ogImage, date, likeCount, commentCount, caption: captionFromOg, comments };
    });

    return {
      id: post.id,
      url,
      thumbnailUrl: data.ogImage || post.thumbnailUrl,
      date: data.date,
      caption: data.caption,
      likeCount: data.likeCount,
      commentCount: data.commentCount,
      comments: data.comments,
    };
  } catch (e) {
    console.warn(`[SCRAPE] ⚠️ Failed to extract post ${post.id} via fallback:`, e);
    return null;
  }
}

// =============================================================================
// PHASE 2: POSTS GRID EXTRACTION  
// =============================================================================

// NOTE: legacy grid/modal extraction removed. We now:
// - grab last 5 post links + thumbnails from the profile grid
// - navigate to each post URL and use OG meta tags + visible comment text

// =============================================================================
// MAIN SCRAPER ORCHESTRATOR
// =============================================================================

async function scrapeInstagramProfile(username: string): Promise<ScrapeResult> {
  let browser: Browser | null = null;
  let page: Page | null = null;
  
  const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
  const localExecutablePath = process.env.CHROME_EXECUTABLE_PATH;
  
  try {
    const executablePath = isServerless
      ? await chromium.executablePath()
      : (localExecutablePath || undefined);

    console.log(`[SCRAPE] Launching browser (headless: true)...`);
    browser = await pwChromium.launch({
      headless: true,
      args: [
        ...(isServerless ? chromium.args : []),
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
      executablePath,
      timeout: TIMEOUT_MS,
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      locale: 'en-US',
    });

    context.setDefaultNavigationTimeout(TIMEOUT_MS);
    context.setDefaultTimeout(TIMEOUT_MS);

    // Inject session cookies BEFORE creating page
    await injectInstagramSessionCookies(context);

    page = await context.newPage();
    page.setDefaultNavigationTimeout(TIMEOUT_MS);
    page.setDefaultTimeout(TIMEOUT_MS);

    // Apply stealth techniques
    await setupStealth(page);
    console.log(`[SCRAPE] Stealth setup complete`);

    // Navigate to profile
    const profileUrl = `https://www.instagram.com/${username}/`;
    console.log(`[SCRAPE] Navigating to ${profileUrl}`);
    
    await page.goto(profileUrl, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT_MS,
    });

    // Try to wait for network to settle
    try {
      await page.waitForLoadState('networkidle', { timeout: 15000 });
    } catch {
      console.log(`[SCRAPE] Network idle timeout, proceeding anyway...`);
    }

    // Wait for content to stabilize
    await page.waitForTimeout(3000);

    // Check for login/challenge redirects
    const currentUrl = page.url();
    if (currentUrl.includes('/accounts/login') || currentUrl.includes('/accounts/emailsignup')) {
      throw new Error('Instagram redirected to login page. Session may be expired.');
    }
    if (currentUrl.includes('/challenge') || currentUrl.includes('/checkpoint')) {
      throw new Error('Instagram is requiring verification/challenge.');
    }

    console.log(`[SCRAPE] Successfully loaded profile: ${currentUrl}`);

    const profile = await extractProfileBasics(page, username);
    const last5 = await extractLast5PostLinksWithThumbnails(page);

    const posts: ScrapeResult["posts"] = [];
    
    for (let i = 0; i < last5.length; i++) {
      const p = last5[i];
      console.log(`[SCRAPE] Processing post ${i + 1}/${last5.length}: ${p.id}`);
      const details = await extractPostDetails(page, p);
      if (details) posts.push(details);
      
      // Ensure we're back on the profile page for the next post
      if (i < last5.length - 1) {
        const currentUrl = page.url();
        if (!currentUrl.includes(`/${username}`)) {
          console.log(`[SCRAPE] Navigating back to profile...`);
          await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await page.waitForTimeout(1500);
        } else {
          await page.waitForTimeout(800);
        }
      }
    }

    return { profile, posts };

  } catch (error) {
    console.error(`[SCRAPE] Error:`, error);
    throw error;
  } finally {
    await page?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

// =============================================================================
// API ROUTE HANDLER
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json();

    if (!username || typeof username !== 'string') {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Clean username (remove @ if present)
    const cleanUsername = username.replace(/^@/, '').trim();

    if (!cleanUsername) {
      return NextResponse.json(
        { error: 'Invalid username' },
        { status: 400 }
      );
    }

    console.log(`[SCRAPE] Starting Instagram scrape for: @${cleanUsername}`);

    const result = await scrapeInstagramProfile(cleanUsername);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error(`[SCRAPE] Scraping failed:`, error);
    const message = error instanceof Error ? error.message : 'Scraping failed';
    const stack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json(
      {
        error: message,
        details: stack,
      },
      { status: 500 }
    );
  }
}
