import { NextRequest, NextResponse } from "next/server";
import { chromium as pwChromium } from "playwright-core";
import type { Browser, Page, BrowserContext } from "playwright-core";
import chromium from "@sparticuz/chromium";

export const runtime = "nodejs";

const TIMEOUT_MS = 60000; // 60 seconds for scraping

// Data structures matching the specification
interface InstagramComment {
  author: string;
  text: string;
  timestamp: Date | null;
  likeCount: number | null;
  isAuthorVerified: boolean;
}

interface InstagramPost {
  id: string; // From URL /p/{id}/
  type: 'image' | 'video' | 'carousel';
  timestamp: Date | null;
  likeCount: number | null;
  viewCount: number | null; // For Reels
  commentCount: number | null;
  caption: string | null;
  location: string | null;
  taggedUsers: string[];
  imageUrls: string[];
  videoUrl: string | null;
  comments: InstagramComment[]; // Limited to 5-10
}

interface InstagramProfile {
  username: string;
  fullName: string | null;
  bio: string | null;
  followerCount: number | null;
  followingCount: number | null;
  postCount: number | null;
  isVerified: boolean;
  isPrivate: boolean;
  profilePicUrl: string | null;
  website: string | null;
  businessCategory: string | null;
  recentPosts: InstagramPost[];
}

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
    return true;
  } catch (error) {
    console.error(`[SCRAPE] ❌ Failed to inject session cookies:`, error);
    return false;
  }
}

/**
 * Sets up stealth properties to avoid bot detection
 */
async function setupStealth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });

    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: any) => (
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : originalQuery(parameters)
    );

    Object.defineProperty(window, 'chrome', {
      get: () => ({
        runtime: {},
        loadTimes: () => {},
        csi: () => {},
        app: {
          isInstalled: false,
          InstallState: {
            DISABLED: 'disabled',
            INSTALLED: 'installed',
            NOT_INSTALLED: 'not_installed',
          },
          RunningState: {
            CANNOT_RUN: 'cannot_run',
            READY_TO_RUN: 'ready_to_run',
            RUNNING: 'running',
          },
        },
      }),
    });

    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });

    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en', 'en-GB'],
    });

    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 8,
    });

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

/**
 * Parses count strings like "1.2K", "5M", "1,234" to numbers
 */
function parseCount(text: string | null): number | null {
  if (!text) return null;
  
  const cleaned = text.replace(/,/g, '').trim();
  const hasK = /[kK]/.test(cleaned);
  const hasM = /[mM]/.test(cleaned);
  
  const numStr = cleaned.replace(/[kmKM]/g, '');
  const num = parseFloat(numStr);
  
  if (isNaN(num)) return null;
  
  if (hasM) return Math.floor(num * 1000000);
  if (hasK) return Math.floor(num * 1000);
  return Math.floor(num);
}

/**
 * Extracts profile header data using attribute-based selectors
 */
async function extractProfileHeader(page: Page, username: string): Promise<Partial<InstagramProfile>> {
  // Wait for header element
  await page.waitForSelector('header', { timeout: 10000 }).catch(() => {
    console.log(`[SCRAPE] ⚠️ Header not found, proceeding anyway`);
  });
  
  await page.waitForTimeout(1000); // Stability wait

  const profileData = await page.evaluate((targetUsername: string) => {
    // Helper function to parse count strings
    const parseCount = (text: string | null): number | null => {
      if (!text) return null;
      const cleaned = text.replace(/,/g, '').trim();
      const hasK = /[kK]/.test(cleaned);
      const hasM = /[mM]/.test(cleaned);
      const numStr = cleaned.replace(/[kmKM]/g, '');
      const num = parseFloat(numStr);
      if (isNaN(num)) return null;
      if (hasM) return Math.floor(num * 1000000);
      if (hasK) return Math.floor(num * 1000);
      return Math.floor(num);
    };

    const header = document.querySelector('header');
    if (!header) return null;

    // 1. Username - h2 element or data-testid
    let username: string = targetUsername;
    try {
      const usernameEl = header.querySelector('h2') || header.querySelector('[data-testid="user-profile-name"]');
      if (usernameEl) {
        const text = usernameEl.textContent?.trim();
        if (text && text.length > 0 && text.length < 50) {
          username = text;
        }
      }
    } catch {}

    // 2. Full Name - second span[dir="auto"] in header
    let fullName: string | null = null;
    try {
      const nameSpans = Array.from(header.querySelectorAll('span[dir="auto"]'));
      if (nameSpans.length >= 2) {
        const nameText = nameSpans[1].textContent?.trim();
        if (nameText && nameText.length > 0 && nameText.length < 100) {
          fullName = nameText;
        }
      }
    } catch {}

    // 3. Bio - div after name spans
    let bio: string | null = null;
    try {
      const bioDiv = header.querySelector('div:has(> span[dir="auto"]) + div');
      if (bioDiv) {
        const bioText = bioDiv.textContent?.trim();
        if (bioText && bioText.length > 0) {
          bio = bioText;
        }
      }
      // Fallback: extract all text from header and parse
      if (!bio) {
        const allText = header.textContent || '';
        // Try to find bio-like text (longer spans not in buttons)
        const spans = Array.from(header.querySelectorAll('span[dir="auto"]'));
        const bioCandidates = spans
          .map(s => s.textContent?.trim() || '')
          .filter(t => t.length > 10 && t.length < 500 && !t.match(/^\d+/) && !t.includes('•'));
        if (bioCandidates.length > 0) {
          bio = bioCandidates.join('\n');
        }
      }
    } catch {}

    // 4. Profile Picture - img with avatar indicator
    let profilePicUrl: string | null = null;
    try {
      const avatarImg = header.querySelector('img[data-testid="user-avatar"]') || 
                       header.querySelector('img[alt*="profile picture" i]') ||
                       header.querySelector('img[alt*="profile" i]');
      if (avatarImg) {
        profilePicUrl = avatarImg.getAttribute('src') || null;
      }
    } catch {}

    // 5. Verification Status - blue checkmark
    let isVerified = false;
    try {
      isVerified = !!header.querySelector('svg[aria-label="Verified"]') ||
                   !!header.querySelector('svg[aria-label*="verified" i]');
    } catch {}

    // 6. Follower Count - from followers link
    let followerCount: number | null = null;
    try {
      const followersLink = header.querySelector('a[href*="/followers/"]');
      if (followersLink) {
        // Try nested spans first
        const spans = followersLink.querySelectorAll('span span');
        if (spans.length > 0) {
          const countText = Array.from(spans).map(s => s.textContent?.trim()).join(' ');
          followerCount = parseCount(countText);
        }
        // Fallback: aria-label
        if (followerCount === null) {
          const ariaLabel = followersLink.getAttribute('aria-label');
          if (ariaLabel) {
            const match = ariaLabel.match(/([\d,KM]+)/);
            if (match) followerCount = parseCount(match[1]);
          }
        }
      }
    } catch {}

    // 7. Following Count - from following link
    let followingCount: number | null = null;
    try {
      const followingLink = header.querySelector('a[href*="/following/"]');
      if (followingLink) {
        const spans = followingLink.querySelectorAll('span span');
        if (spans.length > 0) {
          const countText = Array.from(spans).map(s => s.textContent?.trim()).join(' ');
          followingCount = parseCount(countText);
        }
        if (followingCount === null) {
          const ariaLabel = followingLink.getAttribute('aria-label');
          if (ariaLabel) {
            const match = ariaLabel.match(/([\d,KM]+)/);
            if (match) followingCount = parseCount(match[1]);
          }
        }
      }
    } catch {}

    // 8. Post Count - first list item in stats
    let postCount: number | null = null;
    try {
      const firstLi = header.querySelector('li');
      if (firstLi) {
        const firstSpan = firstLi.querySelector('span');
        if (firstSpan) {
          const countText = firstSpan.textContent?.trim();
          postCount = parseCount(countText);
        }
      }
    } catch {}

    // 9. Website - link not pointing to Instagram
    let website: string | null = null;
    try {
      const externalLink = header.querySelector('a[href^="http"]:not([href*="instagram.com"])');
      if (externalLink) {
        website = externalLink.getAttribute('href') || null;
      }
    } catch {}

    // 10. Business Category - small text under bio
    let businessCategory: string | null = null;
    try {
      const categoryDiv = header.querySelector('div:has(> span[dir="auto"]) + div + div');
      if (categoryDiv) {
        const categoryText = categoryDiv.textContent?.trim();
        if (categoryText && categoryText.length < 50) {
          businessCategory = categoryText;
        }
      }
    } catch {}

    // Check if private account
    let isPrivate = false;
    try {
      const bodyText = document.body.textContent?.toLowerCase() || '';
      isPrivate = bodyText.includes('private account') || 
                  bodyText.includes('this account is private') ||
                  !!header.querySelector('[aria-label*="private" i]');
    } catch {}

    return {
      username,
      fullName,
      bio,
      followerCount,
      followingCount,
      postCount,
      isVerified,
      isPrivate,
      profilePicUrl,
      website,
      businessCategory,
    };
  }, username);

  if (!profileData) {
    throw new Error('Failed to extract profile header data');
  }

  return profileData;
}

/**
 * Extracts post links from the posts grid
 */
async function extractPostGrid(page: Page): Promise<Array<{ url: string; id: string; type: 'image' | 'video' | 'carousel' }>> {
  // Wait for posts grid
  await page.waitForSelector('article a[href*="/p/"]', { timeout: 10000 }).catch(() => {
    console.log(`[SCRAPE] ⚠️ Post grid not found, scrolling to load...`);
  });

  // Scroll to load more posts
  await page.evaluate(async () => {
    for (let i = 0; i < 3; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  });

  await page.waitForTimeout(2000); // Stability wait

  const postLinks = await page.evaluate(() => {
    const links: Array<{ url: string; id: string; type: 'image' | 'video' | 'carousel' }> = [];
    
    // Get all post links
    const postAnchors = Array.from(document.querySelectorAll('article a[href*="/p/"]'));
    
    for (const anchor of postAnchors.slice(0, 12)) { // Limit to 12 most recent
      const href = anchor.getAttribute('href');
      if (!href) continue;
      
      // Extract post ID from URL /p/{id}/
      const match = href.match(/\/p\/([^\/]+)\//);
      if (!match) continue;
      
      const postId = match[1];
      const fullUrl = href.startsWith('http') ? href : `https://www.instagram.com${href}`;
      
      // Determine type from indicators
      let type: 'image' | 'video' | 'carousel' = 'image';
      const parent = anchor.closest('article');
      if (parent) {
        if (parent.querySelector('[aria-label="Video"]') || parent.querySelector('video')) {
          type = 'video';
        } else if (parent.querySelector('[aria-label="Carousel"]') || 
                   parent.querySelectorAll('img').length > 1) {
          type = 'carousel';
        }
      }
      
      links.push({ url: fullUrl, id: postId, type });
    }
    
    return links;
  });

  return postLinks;
}

/**
 * Extracts full post details from modal
 */
async function extractPostModal(page: Page, postUrl: string, postId: string): Promise<InstagramPost | null> {
  try {
    // Extract post path from URL for selector matching
    const postPath = postUrl.includes('/p/') ? postUrl.split('/p/')[1].split('/')[0] : '';
    const hrefSelector = postPath ? `a[href*="/p/${postPath}/"]` : `a[href*="${postUrl}"]`;
    
    // Find and click post link
    const postLink = page.locator(hrefSelector).first();
    await postLink.waitFor({ state: 'visible', timeout: 10000 });
    await postLink.click({ timeout: 5000 });
    
    // Wait for modal
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    await page.waitForTimeout(1000); // Stability wait

    const postData = await page.evaluate((postId: string) => {
      const modal = document.querySelector('[role="dialog"]');
      if (!modal) return null;

      // Extract main image/video
      const imageUrls: string[] = [];
      const images = modal.querySelectorAll('img[data-testid="post-image"]');
      images.forEach(img => {
        const src = img.getAttribute('src');
        if (src && !src.includes('data:image')) {
          imageUrls.push(src);
        }
      });

      // If no data-testid images, try regular images (filter for post images)
      if (imageUrls.length === 0) {
        const allImages = Array.from(modal.querySelectorAll('img'));
        for (const img of allImages) {
          const src = img.getAttribute('src') || '';
          if (src.includes('cdninstagram.com') && 
              !src.includes('s150x150') && 
              !src.includes('s50x50') &&
              (img.width > 200 || img.height > 200)) {
            imageUrls.push(src);
          }
        }
      }

      // Extract video
      let videoUrl: string | null = null;
      const video = modal.querySelector('video');
      if (video) {
        videoUrl = video.getAttribute('src') || null;
      }

      // Extract caption - longest span[dir="auto"] text
      let caption: string | null = null;
      const captionSpans = Array.from(modal.querySelectorAll('span[dir="auto"]'));
      const captionCandidates = captionSpans
        .map(s => s.textContent?.trim() || '')
        .filter(t => t.length > 20 && t.length < 2200)
        .sort((a, b) => b.length - a.length);
      
      if (captionCandidates.length > 0) {
        caption = captionCandidates[0];
      }

      // Extract like count from aria-label
      let likeCount: number | null = null;
      const likeEl = modal.querySelector('[aria-label*="likes" i]');
      if (likeEl) {
        const ariaLabel = likeEl.getAttribute('aria-label') || '';
        const match = ariaLabel.match(/([\d,]+)/);
        if (match) {
          likeCount = parseInt(match[1].replace(/,/g, ''));
        }
      }

      // Extract view count (for Reels)
      let viewCount: number | null = null;
      const viewEl = modal.querySelector('span:has-text("views")');
      if (viewEl) {
        const viewText = viewEl.textContent || '';
        const match = viewText.match(/([\d,]+)/);
        if (match) {
          viewCount = parseInt(match[1].replace(/,/g, ''));
        }
      }

      // Extract timestamp
      let timestamp: Date | null = null;
      const timeEl = modal.querySelector('time');
      if (timeEl) {
        const datetime = timeEl.getAttribute('datetime');
        if (datetime) {
          timestamp = new Date(datetime);
        }
      }

      // Extract location
      let location: string | null = null;
      const locationLink = modal.querySelector('a[href*="/explore/locations/"]');
      if (locationLink) {
        location = locationLink.textContent?.trim() || null;
      }

      // Extract tagged users from caption
      const taggedUsers: string[] = [];
      if (caption) {
        const mentions = caption.match(/@([\w.]+)/g);
        if (mentions) {
          taggedUsers.push(...mentions.map(m => m.replace('@', '')));
        }
      }

      // Determine media type
      let type: 'image' | 'video' | 'carousel' = 'image';
      if (videoUrl) {
        type = 'video';
      } else if (imageUrls.length > 1 || modal.querySelector('[aria-label*="Next" i]')) {
        type = 'carousel';
      }

      // Extract comments (limit to 5-10)
      const comments: Array<{
        author: string;
        text: string;
        timestamp: Date | null;
        likeCount: number | null;
        isAuthorVerified: boolean;
      }> = [];

      const commentList = modal.querySelector('ul') || modal.querySelector('section[role="list"]');
      if (commentList) {
        const commentItems = Array.from(commentList.querySelectorAll('li'));
        
        for (const item of commentItems.slice(0, 10)) {
          // Author
          const authorLink = item.querySelector('a[href^="/"]');
          const author = authorLink?.textContent?.trim() || '';
          if (!author || author.length > 30) continue;

          // Check if author is verified
          const isAuthorVerified = !!item.querySelector('svg[aria-label*="verified" i]');

          // Comment text
          const textSpan = item.querySelector('span[dir="auto"]');
          const text = textSpan?.textContent?.trim() || '';
          if (!text || text === author) continue;

          // Timestamp
          let commentTimestamp: Date | null = null;
          const commentTime = item.querySelector('time');
          if (commentTime) {
            const datetime = commentTime.getAttribute('datetime');
            if (datetime) commentTimestamp = new Date(datetime);
          }

          // Like count
          let commentLikeCount: number | null = null;
          const commentLikeEl = item.querySelector('[aria-label*="like" i]');
          if (commentLikeEl) {
            const ariaLabel = commentLikeEl.getAttribute('aria-label') || '';
            const match = ariaLabel.match(/([\d,]+)/);
            if (match) {
              commentLikeCount = parseInt(match[1].replace(/,/g, ''));
            }
          }

          comments.push({
            author,
            text,
            timestamp: commentTimestamp,
            likeCount: commentLikeCount,
            isAuthorVerified,
          });
        }
      }

      // Comment count
      let commentCount: number | null = null;
      const commentCountEl = modal.querySelector('[aria-label*="comments" i]');
      if (commentCountEl) {
        const ariaLabel = commentCountEl.getAttribute('aria-label') || '';
        const match = ariaLabel.match(/([\d,]+)/);
        if (match) {
          commentCount = parseInt(match[1].replace(/,/g, ''));
        }
      }

      return {
        id: postId,
        type,
        timestamp,
        likeCount,
        viewCount,
        commentCount,
        caption,
        location,
        taggedUsers,
        imageUrls,
        videoUrl,
        comments,
      };
    }, postId);

    // Close modal
    try {
      const closeButton = page.locator('[role="dialog"] [aria-label="Close"]').first();
      if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeButton.click();
      } else {
        await page.keyboard.press('Escape');
      }
    } catch {
      await page.keyboard.press('Escape').catch(() => {});
    }

    await page.waitForTimeout(1000);

    return postData;
  } catch (error) {
    console.error(`[SCRAPE] Error extracting post modal:`, error);
    // Try to close modal
    await page.keyboard.press('Escape').catch(() => {});
    return null;
  }
}

/**
 * Main scraper function
 */
async function scrapeInstagramProfile(username: string): Promise<InstagramProfile> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    const localExecutablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
    const executablePath = isServerless
      ? await chromium.executablePath()
      : (localExecutablePath || undefined);

    browser = await pwChromium.launch({
      headless: chromium.headless, // Use serverless-compatible headless mode
      args: [
        ...(isServerless ? chromium.args : []),
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--incognito',
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

    const profileUrl = `https://www.instagram.com/${username}/`;
    console.log(`[SCRAPE] Navigating to ${profileUrl}`);

    // Navigation wait
    await page.goto(profileUrl, {
      waitUntil: 'networkidle',
      timeout: TIMEOUT_MS,
    });

    // Content wait - wait for header
    await page.waitForSelector('header', { timeout: 10000 });
    await page.waitForTimeout(1000); // Stability wait

    // Check for login/challenge pages
    const currentUrl = page.url();
    if (currentUrl.includes('/accounts/login') || currentUrl.includes('/accounts/emailsignup')) {
      throw new Error('Instagram redirected to login page. Session may be expired.');
    }
    if (currentUrl.includes('/challenge') || currentUrl.includes('/checkpoint') || currentUrl.includes('/two_factor')) {
      throw new Error('Instagram is requiring verification/challenge. Cannot proceed.');
    }

    console.log(`[SCRAPE] Successfully loaded profile page: ${currentUrl}`);

    // Extract profile header
    console.log(`[SCRAPE] Extracting profile header...`);
    const profileHeader = await extractProfileHeader(page, username);

    // Extract post grid
    console.log(`[SCRAPE] Extracting post grid...`);
    const postLinks = await extractPostGrid(page);
    console.log(`[SCRAPE] Found ${postLinks.length} posts`);

    // Extract individual posts (limit to 3 most recent)
    const recentPosts: InstagramPost[] = [];
    for (let i = 0; i < Math.min(postLinks.length, 3); i++) {
      const postLink = postLinks[i];
      console.log(`[SCRAPE] Extracting post ${i + 1}/${Math.min(postLinks.length, 3)}: ${postLink.id}`);
      
      const postData = await extractPostModal(page, postLink.url, postLink.id);
      if (postData) {
        recentPosts.push(postData);
        console.log(`[SCRAPE] ✅ Extracted post ${i + 1}`);
      } else {
        console.log(`[SCRAPE] ⚠️ Failed to extract post ${i + 1}`);
      }
      
      // Delay between posts
      await page.waitForTimeout(1000);
    }

    return {
      username: profileHeader.username || username,
      fullName: profileHeader.fullName || null,
      bio: profileHeader.bio || null,
      followerCount: profileHeader.followerCount || null,
      followingCount: profileHeader.followingCount || null,
      postCount: profileHeader.postCount || null,
      isVerified: profileHeader.isVerified || false,
      isPrivate: profileHeader.isPrivate || false,
      profilePicUrl: profileHeader.profilePicUrl || null,
      website: profileHeader.website || null,
      businessCategory: profileHeader.businessCategory || null,
      recentPosts,
    };
  } catch (error) {
    console.error(`[SCRAPE] Error:`, error);
    throw error;
  } finally {
    await page?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json();

    if (!username || typeof username !== 'string') {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    const cleanUsername = username.replace(/^@/, '').trim();

    if (!cleanUsername) {
      return NextResponse.json(
        { error: 'Invalid username' },
        { status: 400 }
      );
    }

    console.log(`[SCRAPE] Starting Instagram scrape for: ${cleanUsername}`);

    const result = await scrapeInstagramProfile(cleanUsername);

    console.log(`[SCRAPE] ✅ Scrape complete - Profile: ${result.fullName || 'N/A'}, Posts: ${result.recentPosts.length}`);
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error(`[SCRAPE] Scraping failed:`, error);
    return NextResponse.json(
      {
        error: error.message || 'Scraping failed',
        details: error.stack,
      },
      { status: 500 }
    );
  }
}
