import { NextRequest, NextResponse } from "next/server";
import { chromium as pwChromium, Browser } from "playwright-core";
import chromium from "@sparticuz/chromium";

// Force Node.js runtime (Playwright is not compatible with Edge runtime)
export const runtime = "nodejs";

const DEFAULT_ACTION_TIMEOUT_MS = 15_000;
const DEFAULT_NAV_TIMEOUT_MS = 30_000;

// Randomized user agents
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Extracts username from Instagram URL
 * Uses the same validation logic as the main social extraction
 */
function extractInstagramUsername(url: string): string | null {
  try {
    const urlObj = new URL(url);
    
    // Ensure it's an Instagram URL
    if (!urlObj.hostname.includes('instagram.com')) {
      return null;
    }
    
    const pathname = urlObj.pathname.toLowerCase();
    
    // Reject non-profile URLs (same patterns as main extraction)
    const rejectedPatterns = [
      '/p/',
      '/reel/',
      '/tv/',
      '/explore/',
      '/accounts/',
      '/stories/',
      '/direct/',
    ];
    
    for (const pattern of rejectedPatterns) {
      if (pathname.includes(pattern)) {
        return null;
      }
    }
    
    // Extract username from pathname (first path segment)
    const pathParts = pathname.replace(/^\/|\/$/g, '').split('/').filter(p => p.length > 0);
    if (pathParts[0] && pathParts[0].length > 0) {
      return pathParts[0];
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts username from Facebook URL
 * Uses the same validation logic as the main social extraction
 */
function extractFacebookUsername(url: string): string | null {
  try {
    const urlObj = new URL(url);
    
    // CRITICAL: Only accept facebook.com domains
    const hostname = urlObj.hostname.toLowerCase();
    if (!hostname.includes('facebook.com')) {
      return null;
    }
    
    const pathname = urlObj.pathname.toLowerCase();
    const pathParts = pathname.replace(/^\/|\/$/g, '').split('/').filter(p => p.length > 0);
    
    // Reject non-profile URLs (same patterns as main extraction)
    const rejectedPatterns = [
      '/groups/',
      '/photo.php',
      '/photos/',
      '/posts/',
      '/reel/',
      '/watch/',
      '/events/',
      '/marketplace/',
      '/share/',
      '/sharer/',
      '/sharer.php',
      '/story.php',
      '/hashtag/',
      '/help/',
      '/policies/',
      '/login',
      '/recover/',
    ];
    
    for (const pattern of rejectedPatterns) {
      if (pathname.includes(pattern)) {
        return null;
      }
    }
    
    // Reject if it has fbid in query (photo/post links)
    if (url.toLowerCase().includes('fbid=')) {
      return null;
    }
    
    // Reject root facebook.com with no page
    if (pathParts.length === 0) {
      return null;
    }
    
    // Handle /pages/ URLs: /pages/PageName/ID -> extract PageName
    if (pathParts[0] === 'pages' && pathParts[1]) {
      return pathParts[1];
    }
    
    // Reject special paths
    const rejectedPaths = ['profile', 'people', 'login', 'signup', 'home', 'watch', 'marketplace'];
    if (pathParts[0] && rejectedPaths.includes(pathParts[0])) {
      return null;
    }
    
    // Extract username (first path segment)
    if (pathParts[0] && pathParts[0].length > 0) {
      return pathParts[0];
    }
    
    return null;
  } catch {
    return null;
  }
}

function extractUsernameFromUrl(url: string, platform: 'instagram' | 'facebook'): string | null {
  if (platform === 'instagram') {
    return extractInstagramUsername(url);
  } else if (platform === 'facebook') {
    return extractFacebookUsername(url);
  }
  return null;
}

function extractPlatformFromUrl(url: string): 'instagram' | 'facebook' | null {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    if (hostname.includes('instagram.com')) {
      return 'instagram';
    } else if (hostname.includes('facebook.com')) {
      return 'facebook';
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Lightweight extraction of social media usernames from GBP
 * Only extracts usernames, doesn't trigger screenshots or full analysis
 */
async function extractSocialUsernamesFromGBP(
  businessName: string,
  address: string
): Promise<{ instagram?: string; facebook?: string }> {
  let browser: Browser | null = null;

  try {
    const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    const localExecutablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
    const executablePath = isServerless
      ? await chromium.executablePath()
      : (localExecutablePath || undefined);

    browser = await pwChromium.launch({
      headless: chromium.headless,
      args: chromium.args,
      executablePath,
      timeout: 30000,
    });

    const userAgent = getRandomUserAgent();
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent,
    });
    
    const page = await context.newPage();
    context.setDefaultTimeout(DEFAULT_ACTION_TIMEOUT_MS);
    context.setDefaultNavigationTimeout(DEFAULT_NAV_TIMEOUT_MS);

    // Navigate to Google search
    const searchQuery = encodeURIComponent(`"${businessName}" ${address}`);
    const searchUrl = `https://www.google.com/search?q=${searchQuery}`;
    
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: DEFAULT_NAV_TIMEOUT_MS });
    
    // Wait a bit for page to load
    await page.waitForTimeout(2000);

    // Look for the GBP knowledge panel
    const profilesContainer = page.locator('div[role="presentation"][data-attrid="kc:/common/topic:social media presence"]').first();
    
    const usernames: { instagram?: string; facebook?: string } = {};
    
    if (await profilesContainer.count() > 0) {
      // Find all social links
      const allLinks = await profilesContainer.locator('a[href*="instagram.com"], a[href*="facebook.com"]').all();
      
      for (const link of allLinks) {
        try {
          let href = await link.getAttribute('href');
          if (!href) continue;

          // Handle Google redirect URLs
          if (href.startsWith('/url?q=')) {
            const urlMatch = href.match(/\/url\?q=([^&]+)/);
            if (urlMatch) {
              href = decodeURIComponent(urlMatch[1]);
            }
          }

          // Resolve relative URLs
          if (!href.startsWith('http')) {
            try {
              href = new URL(href, 'https://www.google.com').toString();
            } catch {
              continue;
            }
          }

          const platform = extractPlatformFromUrl(href);
          if (platform) {
            const username = extractUsernameFromUrl(href, platform);
            if (username && username.length > 0 && !usernames[platform]) {
              usernames[platform] = username;
              console.log(`[GBP EXTRACT] ✅ Extracted ${platform} username: "${username}" from URL: ${href}`);
            } else if (!username) {
              console.log(`[GBP EXTRACT] ⚠️ Could not extract username from ${platform} URL: ${href}`);
            }
          }
        } catch {
          // Skip problematic links
        }
      }
    }

    return usernames;
  } catch (error) {
    console.error('[GBP EXTRACT] Error:', error);
    return {};
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { businessName, address } = await request.json();

    if (!businessName || !address) {
      return NextResponse.json(
        { error: "businessName and address are required" },
        { status: 400 }
      );
    }

    const usernames = await extractSocialUsernamesFromGBP(businessName, address);

    return NextResponse.json({
      success: true,
      usernames,
    });
  } catch (error: any) {
    console.error("Error extracting social usernames:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
