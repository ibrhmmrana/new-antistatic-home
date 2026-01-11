/**
 * WARNING: This endpoint performs automated browsing using Playwright.
 * Use cautiously to avoid being blocked by target sites. Consider implementing:
 * - Rate limiting
 * - User-agent rotation
 * - Request delays
 * - Respect for robots.txt
 */

import { NextRequest, NextResponse } from "next/server";
import { chromium as pwChromium, Browser, Page, Locator } from "playwright-core";
import chromium from "@sparticuz/chromium";

// Force Node.js runtime (Playwright is not compatible with Edge runtime)
export const runtime = "nodejs";

const DEFAULT_ACTION_TIMEOUT_MS = 15_000;
const DEFAULT_NAV_TIMEOUT_MS = 30_000;

// Randomized user agents (all recent Chrome on Windows)
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

async function humanMouseMove(page: Page): Promise<void> {
  // Simulate human-like mouse movement across the page
  const viewportSize = page.viewportSize();
  if (!viewportSize) return;
  
  const startX = Math.random() * viewportSize.width * 0.3;
  const startY = Math.random() * viewportSize.height * 0.3;
  const endX = viewportSize.width * 0.5 + Math.random() * viewportSize.width * 0.4;
  const endY = viewportSize.height * 0.3 + Math.random() * viewportSize.height * 0.4;
  
  // Move in steps to simulate human movement
  const steps = 5 + Math.floor(Math.random() * 5);
  for (let i = 0; i <= steps; i++) {
    const x = startX + (endX - startX) * (i / steps) + (Math.random() - 0.5) * 20;
    const y = startY + (endY - startY) * (i / steps) + (Math.random() - 0.5) * 20;
    await page.mouse.move(x, y);
    await randomDelay(10, 30);
  }
}

async function humanScroll(page: Page): Promise<void> {
  // Random small scroll to look human
  const scrollAmount = 100 + Math.random() * 200;
  await page.mouse.wheel(0, scrollAmount);
  await randomDelay(100, 300);
  await page.mouse.wheel(0, -scrollAmount * 0.3); // Scroll back up a bit
}

class CaptchaDetectedError extends Error {
  public readonly code = "CAPTCHA_DETECTED";

  constructor(message: string) {
    super(message);
    this.name = "CaptchaDetectedError";
  }
}

function isLikelyCaptchaUrl(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes("/sorry/") || u.includes("google.com/sorry") || u.includes("recaptcha");
}

async function throwIfCaptcha(page: Page, stage: string): Promise<void> {
  const url = page.url();

  if (isLikelyCaptchaUrl(url)) {
    throw new CaptchaDetectedError(`[${stage}] CAPTCHA/bot-check detected (url=${url})`);
  }

  // Fast selector/text checks (do not wait long; we only want to detect and fail fast)
  const checks: Array<Promise<boolean>> = [
    page.locator("form#captcha-form").first().isVisible({ timeout: 750 }).catch(() => false),
    page.locator("input[name=\"captcha\"]").first().isVisible({ timeout: 750 }).catch(() => false),
    page.locator("iframe[src*=\"recaptcha\"]").first().isVisible({ timeout: 750 }).catch(() => false),
    page.locator("text=/unusual traffic/i").first().isVisible({ timeout: 750 }).catch(() => false),
    page.locator("text=/verify you are a human/i").first().isVisible({ timeout: 750 }).catch(() => false),
  ];

  const results = await Promise.all(checks);
  if (results.some(Boolean)) {
    throw new CaptchaDetectedError(`[${stage}] CAPTCHA/bot-check detected`);
  }
}

// In-memory cache to prevent duplicate scraper executions
// Key: scanId, Value: { status: 'running' | 'completed', result?: any, promise?: Promise<any> }
const scraperCache = new Map<string, { status: 'running' | 'completed', result?: any, promise?: Promise<any> }>();

/**
 * Helper function to capture a screenshot by calling the screenshot API
 * This is used internally to capture screenshots after link extraction
 * Note: In server-side context, we need to use the full URL or localhost
 */
/**
 * Builds a protected Vercel request with bypass headers for Deployment Protection.
 * 
 * When Vercel Deployment Protection is enabled, internal API calls return 401.
 * This helper adds the necessary bypass header AND query parameters (belt + braces).
 * 
 * @param baseUrl - The base URL for the API call
 * @param path - The API path (e.g., '/api/scan/socials/screenshot')
 * @returns Object with the full URL and headers including bypass if configured
 */
function buildProtectedVercelRequest(baseUrl: string, path: string): { url: string; headers: Record<string, string> } {
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  // Build URL with query params
  let url = `${baseUrl}${path}`;
  const separator = url.includes('?') ? '&' : '?';
  
  if (bypassSecret) {
    // Add BOTH query params AND header (belt + braces approach)
    // Query param: x-vercel-protection-bypass=<token>
    // Query param: x-vercel-set-bypass-cookie=true
    // Header: x-vercel-protection-bypass: <token>
    url += `${separator}x-vercel-protection-bypass=${encodeURIComponent(bypassSecret)}&x-vercel-set-bypass-cookie=true`;
    headers['x-vercel-protection-bypass'] = bypassSecret;
    
    // Log bypass status (NEVER log the secret itself)
    console.log(`[SCREENSHOT CALL] Vercel bypass configured: true (header + query param)`);
  } else {
    // Just add the cookie param, but warn about missing secret
    url += `${separator}x-vercel-set-bypass-cookie=true`;
    console.warn(`[SCREENSHOT CALL] ⚠️ Missing VERCEL_AUTOMATION_BYPASS_SECRET — request may 401`);
  }
  
  return { url, headers };
}

/**
 * Logs error response with truncated body and helpful hints.
 */
function logScreenshotError(platform: string, status: number, body: string): void {
  // Truncate body to first 300 chars to avoid logging huge HTML
  const snippet = body.length > 300 ? body.substring(0, 300) + '...' : body;
  
  console.error(`[SCREENSHOT CALL] ${platform} HTTP error ${status}`);
  console.error(`[SCREENSHOT CALL] Response snippet: ${snippet}`);
  
  // Add hint for auth errors
  if (status === 401 || status === 403) {
    console.error(`[SCREENSHOT CALL] HINT: Deployment Protection likely enabled — ensure VERCEL_AUTOMATION_BYPASS_SECRET is configured and header is sent.`);
  }
}

async function captureSocialScreenshot(
  platform: string,
  url: string,
  viewport: 'desktop' | 'mobile'
): Promise<{ platform: string; url: string; screenshot: string | null; status: 'success' | 'error' } | { websiteScreenshot: string | null }> {
  const startTime = Date.now();
  console.log(`[SCREENSHOT CALL] Starting ${platform} screenshot for: ${url}`);
  
  try {
    // Determine base URL for internal API calls
    // In production (Vercel), use the request host or environment variable
    // For local development, use localhost
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL 
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    
    console.log(`[SCREENSHOT CALL] Using base URL: ${baseUrl}`);
    
    // Build protected request with Vercel bypass headers
    const { url: requestUrl, headers } = buildProtectedVercelRequest(baseUrl, '/api/scan/socials/screenshot');
    
    // Use AbortController for timeout (60 seconds to allow for slow screenshots)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ platform, url, viewport }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const elapsed = Date.now() - startTime;
    console.log(`[SCREENSHOT CALL] ${platform} response received in ${elapsed}ms, status: ${response.status}`);

    if (response.ok) {
      const data = await response.json();
      // Check if screenshot capture was successful
      const hasScreenshot = data.success && data.screenshot;
      console.log(`[SCREENSHOT CALL] ${platform} success: ${hasScreenshot}, screenshot chars: ${data.screenshot?.length || 0}`);
      
      if (platform === 'website') {
        return { websiteScreenshot: hasScreenshot ? data.screenshot : null };
      } else {
        return {
          platform,
          url,
          screenshot: hasScreenshot ? data.screenshot : null,
          status: hasScreenshot ? 'success' : 'error',
        };
      }
    } else {
      const errorText = await response.text().catch(() => 'Unknown error');
      logScreenshotError(platform, response.status, errorText);
      if (platform === 'website') {
        return { websiteScreenshot: null };
      } else {
        return { platform, url, screenshot: null, status: 'error' };
      }
    }
  } catch (error) {
    const elapsed = Date.now() - startTime;
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[SCREENSHOT CALL] ${platform} TIMEOUT after ${elapsed}ms`);
    } else {
      console.error(`[SCREENSHOT CALL] ${platform} ERROR after ${elapsed}ms:`, error);
    }
    if (platform === 'website') {
      return { websiteScreenshot: null };
    } else {
      return { platform, url, screenshot: null, status: 'error' };
    }
  }
}

/**
 * Extracts social media profile links from a business website.
 * 
 * This approach avoids Google search CAPTCHAs by directly visiting the business website
 * and scanning for social media links (typically found in headers/footers).
 * 
 * @param websiteUrl - The business website URL to scan
 * @returns Promise resolving to an array of social media links found
 */
async function extractSocialLinksFromWebsite(
  websiteUrl: string
): Promise<{ platform: string; url: string }[]> {
  let browser: Browser | null = null;

  try {
    // Configure serverless Chromium for production (Vercel/Lambda)
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
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      javaScriptEnabled: true,
    });
    
    const page = await context.newPage();
    context.setDefaultTimeout(DEFAULT_ACTION_TIMEOUT_MS);
    context.setDefaultNavigationTimeout(DEFAULT_NAV_TIMEOUT_MS);

    // Normalize URL
    let normalizedUrl = websiteUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    console.log(`[SOCIAL EXTRACTOR] Navigating to business website: ${normalizedUrl}`);

    try {
      await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: DEFAULT_NAV_TIMEOUT_MS });
    } catch (navError) {
      console.warn(`[SOCIAL EXTRACTOR] Navigation error, trying with http:`, navError);
      // Try http if https fails
      if (normalizedUrl.startsWith('https://')) {
        normalizedUrl = normalizedUrl.replace('https://', 'http://');
        await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: DEFAULT_NAV_TIMEOUT_MS });
      } else {
        throw navError;
      }
    }

    // Wait for page to settle
    await randomDelay(1000, 2000);

    // Collect social media links
    const socialLinks: { platform: string; url: string }[] = [];
    const seenUrls = new Set<string>();

    // Look for social media links on the page
    const socialLinkSelectors = [
      'a[href*="instagram.com"]',
      'a[href*="facebook.com"]',
    ];

    for (const selector of socialLinkSelectors) {
      const links = await page.locator(selector).all();
      console.log(`[SOCIAL EXTRACTOR] Found ${links.length} links matching ${selector}`);
      
      for (const link of links) {
        try {
          let href = await link.getAttribute('href');
          if (!href) continue;

          // Clean up URL
          href = href.trim();
          
          // Skip invalid or internal links
          if (href.startsWith('#') || href.startsWith('javascript:')) continue;
          
          // Determine platform
          let platform: string | null = null;
          if (href.includes('instagram.com')) {
            platform = 'instagram';
          } else if (href.includes('facebook.com')) {
            platform = 'facebook';
          }

          if (platform && !seenUrls.has(href)) {
            seenUrls.add(href);
            socialLinks.push({ platform, url: href });
            console.log(`[SOCIAL EXTRACTOR] Found ${platform} link: ${href}`);
          }
        } catch {
          // Skip problematic links
        }
      }
    }

    // Also check common footer/header areas
    const footerLinks = await page.locator('footer a[href*="instagram.com"], footer a[href*="facebook.com"], header a[href*="instagram.com"], header a[href*="facebook.com"]').all();
    console.log(`[SOCIAL EXTRACTOR] Found ${footerLinks.length} social links in header/footer`);

    for (const link of footerLinks) {
      try {
        let href = await link.getAttribute('href');
        if (!href || seenUrls.has(href)) continue;

        let platform: string | null = null;
        if (href.includes('instagram.com')) {
          platform = 'instagram';
        } else if (href.includes('facebook.com')) {
          platform = 'facebook';
        }

        if (platform) {
          seenUrls.add(href);
          socialLinks.push({ platform, url: href });
          console.log(`[SOCIAL EXTRACTOR] Found ${platform} link in footer/header: ${href}`);
        }
      } catch {
        // Skip problematic links
      }
    }

    await context.close();
    console.log(`[SOCIAL EXTRACTOR] ✅ Extracted ${socialLinks.length} social links from website`);
    return socialLinks;

  } catch (error) {
    console.error(`[SOCIAL EXTRACTOR] ❌ Error extracting social links:`, error);
    return [];
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * @deprecated This function navigates to Google Search which triggers CAPTCHAs.
 * Use extractSocialLinksFromWebsite() instead.
 * 
 * Extracts social media profile links and website URL from a Google Business Profile (GBP) knowledge panel.
 * 
 * This function:
 * 1. Launches a headless browser
 * 2. Searches Google for the business
 * 3. Locates the GBP knowledge panel on the right side
 * 4. Expands the panel to reveal the "Profiles" section
 * 5. Extracts all social media links from that section
 * 6. Extracts the business website URL
 * 
 * @param businessName - The name of the business to search for
 * @param address - The full address of the business
 * @returns Promise resolving to an object with social media links and website URL
 */
async function extractSocialLinksFromGBP(
  businessName: string,
  address: string
): Promise<{ socialLinks: { platform: string; url: string }[]; websiteUrl: string | null }> {
  let browser: Browser | null = null;

  try {
    // Configure serverless Chromium for production (Vercel/Lambda)
    const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    const localExecutablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
    const executablePath = isServerless
      ? await chromium.executablePath()
      : (localExecutablePath || undefined);

    // Launch a Chromium browser with UNDETECTABLE headless mode
    // Note: Playwright's headless: true uses the new headless mode by default (more stealthy than old headless)
    try {
      browser = await pwChromium.launch({
        headless: chromium.headless,
        args: [
          // Start with @sparticuz/chromium defaults (serverless-safe). Keep our extras minimal to avoid conflicts.
          ...chromium.args,
          '--disable-blink-features=AutomationControlled',
          // Window size arguments (must match viewport)
          '--window-size=1920,1080',
          // Keep existing behavior for some sites; avoid adding redundant sandbox/dev-shm flags (already in chromium.args).
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
        ],
        executablePath,
        timeout: 30000,
      });
    } catch (launchError) {
      if (!isServerless && !localExecutablePath) {
        console.error(
          `[DEBUG] Chromium launch failed in local dev without a configured browser binary. ` +
          `Set CHROMIUM_EXECUTABLE_PATH to a local Chromium/Chrome executable path, ` +
          `or run this route in Linux/serverless where @sparticuz/chromium can provide the binary.`
        );
      }
      throw launchError;
    }

    const userAgent = getRandomUserAgent();
    
    // Create a new context with realistic settings
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      javaScriptEnabled: true,
      permissions: ['geolocation'],
      // Set locale and timezone to look more realistic
      locale: 'en-US',
      timezoneId: 'America/New_York',
      // Bypass CSP for stealth scripts
      bypassCSP: true,
    });
    
    const page = await context.newPage();
    context.setDefaultTimeout(DEFAULT_ACTION_TIMEOUT_MS);
    context.setDefaultNavigationTimeout(DEFAULT_NAV_TIMEOUT_MS);
    page.setDefaultTimeout(DEFAULT_ACTION_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(DEFAULT_NAV_TIMEOUT_MS);

    // Set comprehensive HTTP headers including Chrome Client Hints (Sec-CH-*)
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    });
    
    // CRITICAL: Comprehensive stealth script to bypass headless detection
    await page.addInitScript(() => {
      // Delete webdriver property entirely
      delete (navigator as any).__proto__.webdriver;
      
      // Also override it in case it gets re-added
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true,
      });

      // Override chrome object with realistic properties
      Object.defineProperty(window, 'chrome', {
        writable: true,
        enumerable: true,
        configurable: true,
        value: {
          runtime: {
            PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
            PlatformArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
            PlatformNaclArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
            RequestUpdateCheckStatus: { THROTTLED: 'throttled', NO_UPDATE: 'no_update', UPDATE_AVAILABLE: 'update_available' },
            OnInstalledReason: { INSTALL: 'install', UPDATE: 'update', CHROME_UPDATE: 'chrome_update', SHARED_MODULE_UPDATE: 'shared_module_update' },
            OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
          },
          loadTimes: function() { return {}; },
          csi: function() { return {}; },
          app: {
            isInstalled: false,
            InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
            RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
          },
        },
      });

      // Override permissions query to look realistic
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) => {
        if (parameters.name === 'notifications') {
          return Promise.resolve({ state: Notification.permission, onchange: null } as PermissionStatus);
        }
        return originalQuery.call(window.navigator.permissions, parameters);
      };

      // Realistic plugins array (mimics Chrome)
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const plugins = [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
            { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
          ];
          const pluginArray = Object.create(PluginArray.prototype);
          plugins.forEach((p, i) => {
            const plugin = Object.create(Plugin.prototype);
            Object.defineProperties(plugin, {
              name: { value: p.name },
              filename: { value: p.filename },
              description: { value: p.description },
              length: { value: 0 },
            });
            pluginArray[i] = plugin;
          });
          Object.defineProperty(pluginArray, 'length', { value: plugins.length });
          return pluginArray;
        },
      });

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      // Override hardware concurrency (randomize a bit)
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8,
      });

      // Override device memory
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
      });

      // Override connection info
      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          effectiveType: '4g',
          rtt: 50,
          downlink: 10,
          saveData: false,
        }),
      });

      // WebGL fingerprint spoofing
      const getParameterOriginal = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
        if (parameter === 37445) return 'Google Inc. (Intel)'; // UNMASKED_VENDOR_WEBGL
        if (parameter === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)'; // UNMASKED_RENDERER_WEBGL
        return getParameterOriginal.call(this, parameter);
      };

      // Also handle WebGL2
      if (typeof WebGL2RenderingContext !== 'undefined') {
        const getParameter2Original = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function(parameter: number) {
          if (parameter === 37445) return 'Google Inc. (Intel)';
          if (parameter === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)';
          return getParameter2Original.call(this, parameter);
        };
      }

      // Mask automation-related window properties
      Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
      Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight + 85 }); // Account for Chrome UI
      
      // Override screen properties to look normal
      Object.defineProperty(screen, 'availWidth', { get: () => screen.width });
      Object.defineProperty(screen, 'availHeight', { get: () => screen.height - 40 }); // Taskbar

      // Fix iframe contentWindow detection
      const originalContentWindow = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
      Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
        get: function() {
          const win = originalContentWindow?.get?.call(this);
          if (win) {
            try {
              // Ensure webdriver is also false in iframes
              Object.defineProperty(win.navigator, 'webdriver', { get: () => undefined });
            } catch (e) { /* cross-origin, ignore */ }
          }
          return win;
        },
      });

      // Prevent detection via toString
      const oldCall = Function.prototype.call;
      Function.prototype.call = function(...args: any[]) {
        if (args[0] === null && this === toString) {
          return 'function webdriver() { [native code] }';
        }
        return oldCall.apply(this, args);
      };
    });

    // Construct the search query: "BusinessName FullAddress"
    const searchQuery = `${businessName} ${address}`;
    console.log(`[DEBUG] Searching for: ${searchQuery}`);

    // STRATEGY: Navigate directly to Google search results URL
    // This is less detectable than typing in search box because:
    // 1. Fewer interactions for Google to analyze
    // 2. No typing patterns to fingerprint
    // 3. Mimics clicking a link/bookmark
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&hl=en&gl=us`;
    console.log(`[DEBUG] Direct navigation to: ${searchUrl}`);
    
    // Random delay before navigation (looks like user thinking)
    await randomDelay(500, 1500);
    
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: DEFAULT_NAV_TIMEOUT_MS });
    await throwIfCaptcha(page, "after_search_results_load");
    
    // Human-like behavior after page load
    await randomDelay(800, 1500);
    await humanMouseMove(page);
    await randomDelay(300, 700);
    
    // Small random scroll to look human
    try {
      await humanScroll(page);
    } catch {
      // Scroll might fail, not critical
    }
    
    // Wait for GBP panel to render
    await randomDelay(1500, 2500);

    // Try multiple strategies to find the GBP panel
    console.log('[DEBUG] Looking for GBP panel...');
    
    // Strategy 1: Look for role="complementary" (knowledge panel)
    let gbpPanel = page.locator('[role="complementary"]').first();
    let panelFound = await gbpPanel.count() > 0;
    
    // Strategy 2: Look for common GBP panel classes/attributes
    if (!panelFound) {
      gbpPanel = page.locator('.kp-blk, .kp-wholepage, [data-ved*="Cg"], [jsname="kno-fv"]').first();
      panelFound = await gbpPanel.count() > 0;
      console.log(`[DEBUG] Strategy 2 - Panel found: ${panelFound}`);
    }

    // Strategy 3: Look for business name in a prominent position (usually in GBP)
    if (!panelFound) {
      const businessNameLocator = page.locator(`text=/^${businessName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$/i`).first();
      if (await businessNameLocator.count() > 0) {
        // Find parent container that likely contains the GBP
        gbpPanel = businessNameLocator.locator('xpath=ancestor::*[@role="complementary" or contains(@class, "kp-") or contains(@data-ved, "")][1]').first();
        panelFound = await gbpPanel.count() > 0;
        console.log(`[DEBUG] Strategy 3 - Panel found: ${panelFound}`);
      }
    }

    if (!panelFound) {
      console.log(`[DEBUG] GBP panel not found. Trying to find Profiles section directly on page...`);
      // If panel not found, try to find Profiles section anywhere on the page
      const profilesOnPage = page.locator('text=/Profiles/i');
      if (await profilesOnPage.count() > 0) {
        console.log(`[DEBUG] Found Profiles section without GBP panel`);
        // Continue with extraction from page
      } else {
        console.log(`[DEBUG] No Profiles section found. Returning empty result.`);
        return { socialLinks: [], websiteUrl: null };
      }
    }

    // Look for "Profiles" section - try multiple approaches
    console.log('[DEBUG] Looking for Profiles section...');
    let profilesSection = page.locator('text=/^Profiles$/i, text=/Profiles/i').first();
    let profilesFound = await profilesSection.count() > 0;

    // If Profiles not found, try looking for social media icons/links directly
    if (!profilesFound) {
      console.log('[DEBUG] Profiles text not found. Searching for social links directly...');
    } else {
      console.log('[DEBUG] Profiles section found!');
    }

    // Collect all potential social media links from the page
    // Google often wraps links in redirect URLs, so we need to handle that
    const socialLinks: { platform: string; url: string }[] = [];
    const seenUrls = new Set<string>();

    // Strategy 1: Find all links that contain social media domains (only Instagram and Facebook)
    const socialLinkSelectors = [
      'a[href*="instagram.com"]',
      'a[href*="facebook.com"]',
    ];

    for (const selector of socialLinkSelectors) {
      const links = await page.locator(selector).all();
      console.log(`[DEBUG] Found ${links.length} links matching ${selector}`);
      
      for (const link of links) {
        try {
          let href = await link.getAttribute('href');
          if (!href) continue;

          // Handle Google's redirect URLs (e.g., /url?q=...)
          if (href.startsWith('/url?q=')) {
            const urlMatch = href.match(/\/url\?q=([^&]+)/);
            if (urlMatch) {
              href = decodeURIComponent(urlMatch[1]);
            }
          } else if (href.startsWith('/url?')) {
            // Alternative redirect format
            const urlParams = new URLSearchParams(href.split('?')[1]);
            const qParam = urlParams.get('q');
            if (qParam) {
              href = decodeURIComponent(qParam);
            }
          }

          // Resolve relative URLs
          if (!href.startsWith('http')) {
            try {
              href = new URL(href, 'https://www.google.com').toString();
            } catch {
              continue; // Skip invalid URLs
            }
          }

          // Extract platform and validate
          const platform = extractPlatformFromUrl(href);
          if (platform && !seenUrls.has(href)) {
            seenUrls.add(href);
            socialLinks.push({ platform, url: href });
            console.log(`[DEBUG] Found ${platform}: ${href}`);
          }
        } catch (error) {
          // Skip problematic links
          continue;
        }
      }
    }

    // Strategy 2: If Profiles section was found, look for links near it
    if (profilesFound && socialLinks.length === 0) {
      console.log('[DEBUG] Profiles found but no links yet. Searching near Profiles section...');
      
      // Find the Profiles container and look for links within it
      const profilesContainer = profilesSection.locator('xpath=ancestor::*[contains(@class, "section") or contains(@data-ved, "")][1]').first();
      if (await profilesContainer.count() > 0) {
        const containerLinks = await profilesContainer.locator('a[href]').all();
        console.log(`[DEBUG] Found ${containerLinks.length} links in Profiles container`);
        
        for (const link of containerLinks) {
          try {
            let href = await link.getAttribute('href');
            if (!href) continue;

            // Handle redirects
            if (href.startsWith('/url?q=')) {
              const urlMatch = href.match(/\/url\?q=([^&]+)/);
              if (urlMatch) {
                href = decodeURIComponent(urlMatch[1]);
              }
            }

            if (!href.startsWith('http')) {
              try {
                href = new URL(href, 'https://www.google.com').toString();
              } catch {
                continue;
              }
            }

            const platform = extractPlatformFromUrl(href);
            if (platform && !seenUrls.has(href)) {
              seenUrls.add(href);
              socialLinks.push({ platform, url: href });
              console.log(`[DEBUG] Found ${platform} near Profiles: ${href}`);
            }
          } catch (error) {
            continue;
          }
        }
      }
    }

    console.log(`[DEBUG] Total social links found: ${socialLinks.length}`);
    
    // Extract website URL from GBP panel
    let websiteUrl: string | null = null;
    try {
      console.log('[DEBUG] Looking for website URL in GBP panel...');
      
      // Look for website link in the GBP panel
      // Website links are usually in a "Website" button or link
      const websiteSelectors = [
        'a[href*="http"]:has-text("Website")',
        'a:has-text("Website")',
        'a[data-ved*="Cg"]:has-text("Website")',
        // Also look for links that are clearly website links (not social media)
        'a[href^="http"]:not([href*="instagram.com"]):not([href*="facebook.com"]):not([href*="twitter.com"]):not([href*="x.com"]):not([href*="linkedin.com"])',
      ];

      for (const selector of websiteSelectors) {
        try {
          const websiteLink = page.locator(selector).first();
          const isVisible = await websiteLink.isVisible({ timeout: 1000 }).catch(() => false);
          
          if (isVisible) {
            let href = await websiteLink.getAttribute('href');
            if (href) {
              // Handle Google redirects
              if (href.startsWith('/url?q=')) {
                const urlMatch = href.match(/\/url\?q=([^&]+)/);
                if (urlMatch) {
                  href = decodeURIComponent(urlMatch[1]);
                }
              } else if (href.startsWith('/url?')) {
                const urlParams = new URLSearchParams(href.split('?')[1]);
                const qParam = urlParams.get('q');
                if (qParam) {
                  href = decodeURIComponent(qParam);
                }
              }

              // Validate it's a proper website URL (not social media)
              if (href.startsWith('http') && 
                  !href.includes('instagram.com') && 
                  !href.includes('facebook.com') && 
                  !href.includes('twitter.com') && 
                  !href.includes('x.com') &&
                  !href.includes('linkedin.com')) {
                websiteUrl = href;
                console.log(`[DEBUG] Found website URL: ${websiteUrl}`);
                break;
              }
            }
          }
        } catch {
          continue;
        }
      }

      // Alternative: Look for website in the GBP panel by checking for common patterns
      if (!websiteUrl && panelFound) {
        const allLinks = await gbpPanel.locator('a[href^="http"]').all();
        for (const link of allLinks) {
          try {
            let href = await link.getAttribute('href');
            if (!href) continue;

            // Handle redirects
            if (href.startsWith('/url?q=')) {
              const urlMatch = href.match(/\/url\?q=([^&]+)/);
              if (urlMatch) {
                href = decodeURIComponent(urlMatch[1]);
              }
            }

            // Check if it's a website (not social media, not Google)
            if (href.startsWith('http') && 
                !href.includes('google.com') &&
                !href.includes('instagram.com') && 
                !href.includes('facebook.com') && 
                !href.includes('twitter.com') && 
                !href.includes('x.com') &&
                !href.includes('linkedin.com') &&
                !href.includes('youtube.com') &&
                !href.includes('maps.google.com')) {
              websiteUrl = href;
              console.log(`[DEBUG] Found website URL (alternative method): ${websiteUrl}`);
              break;
            }
          } catch {
            continue;
          }
        }
      }
    } catch (error) {
      console.log(`[DEBUG] Error extracting website URL:`, error);
    }

    // Return social links and website URL
    return { socialLinks, websiteUrl };

  } catch (error) {
    console.error('[ERROR] Error extracting social links from GBP:', error);
    if (error instanceof Error) {
      console.error('[ERROR] Error message:', error.message);
      console.error('[ERROR] Error stack:', error.stack);
    }
    
    // Browser will close in finally block - no need to keep it open on error
    
    return { socialLinks: [], websiteUrl: null };
  } finally {
    // Always close the browser to free resources
    if (browser) {
      await browser.close().catch((err) => {
        console.error('Error closing browser:', err);
      });
    }
  }
}

/**
 * Cleans and deduplicates social media links, keeping only one canonical URL per platform.
 * 
 * @param rawLinks - Array of raw social media links from extraction
 * @returns Array of cleaned, deduplicated links (one per platform)
 */
function cleanAndDeduplicateSocialLinks(
  rawLinks: { platform: string; url: string }[]
): { platform: string; url: string }[] {
  if (!rawLinks || rawLinks.length === 0) {
    return [];
  }

  // Group links by platform
  const linksByPlatform = new Map<string, { platform: string; url: string }[]>();

  for (const link of rawLinks) {
    // Validate platform matches URL
    const urlPlatform = extractPlatformFromUrl(link.url);
    if (!urlPlatform || urlPlatform !== link.platform) {
      // Skip invalid platform/URL mismatches
      continue;
    }

    // Only process Instagram and Facebook links
    if (link.platform !== 'instagram' && link.platform !== 'facebook') {
      continue;
    }

    if (!linksByPlatform.has(link.platform)) {
      linksByPlatform.set(link.platform, []);
    }
    linksByPlatform.get(link.platform)!.push(link);
  }

  const cleanedLinks: { platform: string; url: string }[] = [];

  // Process each platform and select the best URL (only Instagram and Facebook)
  for (const [platform, links] of Array.from(linksByPlatform.entries())) {
    if (links.length === 0) continue;

    // Skip any platforms that aren't Instagram or Facebook
    if (platform !== 'instagram' && platform !== 'facebook') {
      continue;
    }

    let bestLink = links[0];

    try {
      if (platform === 'instagram') {
        // Prefer URL without query parameters (cleaner canonical URL)
        bestLink = links.find(link => !link.url.includes('?')) || links[0];
        
        // Clean up the URL: remove query params and trailing slashes
        try {
          const url = new URL(bestLink.url);
          url.search = ''; // Remove query parameters
          bestLink = { platform, url: url.toString().replace(/\/$/, '') };
        } catch {
          // If URL parsing fails, use original but remove query params manually
          bestLink = { platform, url: bestLink.url.split('?')[0].replace(/\/$/, '') };
        }
      } 
      else if (platform === 'facebook') {
        // Prefer main page URL, discard photos/about/reviews/etc.
        const mainPageLink = links.find(link => {
          try {
            const url = new URL(link.url);
            const pathname = url.pathname.toLowerCase();
            // Keep main page (ends with / or /page/ or just username)
            return !pathname.includes('/photos/') && 
                   !pathname.includes('/about/') && 
                   !pathname.includes('/reviews/') &&
                   !pathname.includes('/events/') &&
                   !pathname.includes('/community/') &&
                   !pathname.includes('/videos/') &&
                   (pathname === '/' || pathname.endsWith('/') || pathname.includes('/page/'));
          } catch {
            return false;
          }
        });
        
        if (mainPageLink) {
          try {
            // Clean up: ensure it ends with / for consistency
            const url = new URL(mainPageLink.url);
            url.search = ''; // Remove query parameters
            let cleanUrl = url.toString();
            if (!cleanUrl.endsWith('/') && !cleanUrl.includes('/page/')) {
              cleanUrl += '/';
            }
            bestLink = { platform, url: cleanUrl };
          } catch {
            // Fallback: manual cleaning
            bestLink = { platform, url: mainPageLink.url.split('?')[0] + (mainPageLink.url.split('?')[0].endsWith('/') ? '' : '/') };
          }
        } else {
          // If no main page found, use first link but clean it
          try {
            const url = new URL(links[0].url);
            url.search = '';
            let cleanUrl = url.toString();
            // Extract just the base path (username or page name)
            const pathParts = url.pathname.split('/').filter(p => p);
            if (pathParts.length > 0) {
              cleanUrl = `${url.protocol}//${url.host}/${pathParts[0]}/`;
            }
            bestLink = { platform, url: cleanUrl };
          } catch {
            // Fallback: use first link as-is but remove query params
            bestLink = { platform, url: links[0].url.split('?')[0] + (links[0].url.split('?')[0].endsWith('/') ? '' : '/') };
          }
        }
      }
    } catch (error) {
      // If any error occurs, use the first link as-is
      console.warn(`[WARN] Error cleaning ${platform} URL, using original:`, error);
      bestLink = links[0];
    }

    cleanedLinks.push(bestLink);
  }

  return cleanedLinks;
}

/**
 * Helper function to extract the platform name from a social media URL.
 * 
 * @param url - The URL to analyze
 * @returns The platform name (e.g., 'instagram', 'facebook') or null if not a recognized platform
 */
function extractPlatformFromUrl(url: string): string | null {
  const urlLower = url.toLowerCase();

  // Instagram
  if (urlLower.includes('instagram.com')) {
    return 'instagram';
  }

  // Facebook
  if (urlLower.includes('facebook.com')) {
    return 'facebook';
  }

  // Only Instagram and Facebook are supported
  return null;
}

export async function POST(request: NextRequest) {
  let scanId: string | undefined;
  
  try {
    // Parse the request body
    const body = await request.json();
    const { businessName, address, scanId: bodyScanId, websiteUrl: providedWebsiteUrl } = body;
    scanId = bodyScanId; // Store for error handling

    // Validate required parameters
    if (!businessName || !address) {
      return NextResponse.json(
        { 
          error: "Missing required parameters",
          message: "Please provide both 'businessName' and 'address' in the request body"
        },
        { status: 400 }
      );
    }
    
    console.log(`[API] Received websiteUrl from request: ${providedWebsiteUrl || 'none'}`);

    // CRITICAL: Prevent duplicate execution using in-memory cache
    if (scanId) {
      const cached = scraperCache.get(scanId);
      
      if (cached) {
        if (cached.status === 'completed' && cached.result) {
          // Already completed, return cached result
          console.log(`[API] Returning cached result for scanId: ${scanId}`);
          return NextResponse.json(cached.result, { status: 200 });
        } else if (cached.status === 'running' && cached.promise) {
          // Already running, wait for existing promise
          console.log(`[API] Scraper already running for scanId: ${scanId}, waiting for completion...`);
          try {
            const result = await cached.promise;
            return NextResponse.json(result, { status: 200 });
          } catch (error) {
            // If the running scraper failed, remove from cache and allow retry
            scraperCache.delete(scanId);
            throw error;
          }
        }
      }
    }

    // Create the scraper execution promise
    const scraperPromise = (async () => {
      // NEW APPROACH: Extract social links from business website instead of Google Search
      // This avoids CAPTCHAs that occur when navigating to Google Search
      
      // Use the website URL provided from Google Places API
      const websiteUrlToUse = providedWebsiteUrl || null;
      console.log(`[API] Website URL from Places API: ${websiteUrlToUse || 'none'}`);

      // Extract social links from the business website (if available)
      let socialLinks: { platform: string; url: string }[] = [];
      if (websiteUrlToUse) {
        console.log(`[API] Extracting social links from website: ${websiteUrlToUse}`);
        const extractedLinks = await extractSocialLinksFromWebsite(websiteUrlToUse);
        socialLinks = cleanAndDeduplicateSocialLinks(extractedLinks);
        console.log(`[API] Found ${socialLinks.length} social links from website`);
      } else {
        console.log(`[API] No website URL available, skipping social link extraction`);
      }

    // Now capture screenshots in parallel after links are extracted
    const screenshotPromises: Promise<{ platform: string; url: string; screenshot: string | null; status: 'success' | 'error' } | { websiteScreenshot: string | null }>[] = [];
    
    // Log what screenshots we're going to capture
    console.log(`[API] Preparing to capture screenshots for ${socialLinks.length} social links + ${websiteUrlToUse ? '1 website' : '0 websites'}`);
    
    // Capture mobile screenshots for social media links
    for (const link of socialLinks) {
      console.log(`[API] Queuing screenshot for ${link.platform}: ${link.url}`);
      screenshotPromises.push(
        captureSocialScreenshot(link.platform, link.url, 'mobile')
      );
    }

    // Capture website screenshot (desktop) if website URL exists
    if (websiteUrlToUse) {
      console.log(`[API] Queuing website screenshot for: ${websiteUrlToUse}`);
      screenshotPromises.push(
        captureSocialScreenshot('website', websiteUrlToUse, 'desktop')
      );
    }

    console.log(`[API] Starting ${screenshotPromises.length} screenshot captures in parallel...`);
    const screenshotStartTime = Date.now();
    
    // Execute all screenshot captures in parallel
    const screenshotResults = await Promise.allSettled(screenshotPromises);
    
    const screenshotElapsed = Date.now() - screenshotStartTime;
    console.log(`[API] All ${screenshotPromises.length} screenshot captures completed in ${screenshotElapsed}ms`);

    // Process screenshot results
    const socialScreenshots: Array<{ platform: string; url: string; screenshot: string | null; status: 'success' | 'error' }> = [];
    let websiteScreenshot: string | null = null;

    console.log(`[API] Processing ${screenshotResults.length} screenshot results...`);
    for (let i = 0; i < screenshotResults.length; i++) {
      const settledResult = screenshotResults[i];
      console.log(`[API] Result ${i + 1}: status=${settledResult.status}`);
      
      if (settledResult.status === 'fulfilled') {
        const result = settledResult.value;
        if ('platform' in result) {
          // Social media screenshot
          console.log(`[API] Social screenshot for ${result.platform}: hasScreenshot=${!!result.screenshot}, status=${result.status}`);
          socialScreenshots.push(result);
        } else if ('websiteScreenshot' in result) {
          // Website screenshot
          console.log(`[API] Website screenshot: hasScreenshot=${!!result.websiteScreenshot}`);
          websiteScreenshot = result.websiteScreenshot;
        }
      } else {
        console.error(`[API] Screenshot capture ${i + 1} REJECTED:`, settledResult.reason);
      }
    }

      // Return complete results with screenshots
      const result = {
        success: true,
        businessName,
        address,
        socialLinks: socialScreenshots,
        websiteUrl: websiteUrlToUse,
        websiteScreenshot,
        count: socialLinks.length,
        scanId,
      };
      
      console.log(`[API] Final result - websiteUrl: ${websiteUrlToUse || 'none'}, hasWebsiteScreenshot: ${!!websiteScreenshot}`);

      // Cache the result
      if (scanId) {
        scraperCache.set(scanId, { status: 'completed', result });
        // Clean up cache after 1 hour to prevent memory leaks
        setTimeout(() => {
          scraperCache.delete(scanId);
        }, 3600000); // 1 hour
      }

      return result;
    })();

    // Store the promise in cache if scanId exists
    if (scanId) {
      scraperCache.set(scanId, { status: 'running', promise: scraperPromise });
    }

    // Execute and return
    const result = await scraperPromise;
    return NextResponse.json(result, { status: 200 });

  } catch (error) {
    // Remove from cache on error to allow retry
    if (scanId) {
      scraperCache.delete(scanId);
    }
    
    console.error("Error in POST /api/scan/socials:", error);

    if (error instanceof CaptchaDetectedError) {
      return NextResponse.json(
        {
          error: error.code,
          message:
            "Google blocked this automated request with a bot-check/CAPTCHA. " +
            "This endpoint fails fast rather than hanging. " +
            "Try again later, reduce request volume, or use an official API-based data source.",
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}