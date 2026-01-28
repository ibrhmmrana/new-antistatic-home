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
// Key: scanId, Value: { status: 'running' | 'completed', result?: any, promise?: Promise<any>, partialResult?: any }
// partialResult is updated incrementally as screenshots complete
const scraperCache = new Map<string, { status: 'running' | 'completed', result?: any, promise?: Promise<any>, partialResult?: any }>();

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
  viewport: 'desktop' | 'mobile',
  businessName?: string,
  businessLocation?: string
): Promise<{ platform: string; url: string; screenshot: string | null; status: 'success' | 'error' } | { websiteScreenshot: string | null }> {
  const startTime = Date.now();
  console.log(`[SCREENSHOT CALL] Starting ${platform} screenshot for: ${url}${businessName ? ` (business: ${businessName})` : ''}`);
  
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
      body: JSON.stringify({ platform, url, viewport, businessName, businessLocation }),
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
 * Extracts social media profile links and website URL from a Google Business Profile (GBP) knowledge panel.
 * 
 * This function:
 * 1. Launches a headless browser with stealth techniques
 * 2. Navigates directly to Google search results for "[businessName] [address]"
 * 3. Locates the GBP knowledge panel on the right side
 * 4. Extracts all social media links from the "Profiles" section
 * 5. Extracts the business website URL
 * 
 * Uses direct URL navigation (not typing) to reduce CAPTCHA risk, combined with
 * extensive stealth techniques to mimic real browser behavior.
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
    
    // For local dev, try to find Chrome executable automatically
    let executablePath: string | undefined;
    if (isServerless) {
      executablePath = await chromium.executablePath();
    } else if (localExecutablePath) {
      executablePath = localExecutablePath;
    } else {
      // Try common Chrome paths on Windows
      const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      ];
      for (const chromePath of possiblePaths) {
        try {
          const fs = await import('fs');
          if (fs.existsSync(chromePath)) {
            executablePath = chromePath;
            console.log(`[DEBUG] Found Chrome at: ${chromePath}`);
            break;
          }
        } catch {
          // ignore
        }
      }
    }
    
    const headless = isServerless ? chromium.headless : false;
    console.log(`[DEBUG] Launching browser - isServerless: ${isServerless}, headless: ${headless}, executablePath: ${executablePath || 'default'}`);

    // Launch a Chromium browser
    // Run headful locally for debugging, headless in serverless
    try {
      if (isServerless) {
        // Serverless: use @sparticuz/chromium args
        browser = await pwChromium.launch({
          headless: chromium.headless,
          args: [
            ...chromium.args,
            '--disable-blink-features=AutomationControlled',
            '--window-size=1920,1080',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
          ],
          executablePath,
          timeout: 30000,
        });
      } else {
        // Local: simple launch with minimal args
        browser = await pwChromium.launch({
          headless: true,
          args: [
            '--disable-blink-features=AutomationControlled',
            '--window-size=1920,1080',
          ],
          executablePath,
          timeout: 30000,
        });
      }
      console.log(`[DEBUG] Browser launched successfully`);
    } catch (launchError) {
      console.error(`[DEBUG] Browser launch failed:`, launchError);
      if (!isServerless && !executablePath) {
        console.error(
          `[DEBUG] Chromium launch failed in local dev without a configured browser binary. ` +
          `Set CHROMIUM_EXECUTABLE_PATH to a local Chromium/Chrome executable path, ` +
          `or install Chrome at a standard location.`
        );
      }
      throw launchError;
    }

    const userAgent = getRandomUserAgent();
    
    // Create a new context - simpler for local, full settings for serverless
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: isServerless ? userAgent : undefined, // Use default UA locally
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      javaScriptEnabled: true,
      locale: 'en-US',
      ...(isServerless ? {
        permissions: ['geolocation'],
        timezoneId: 'America/New_York',
        bypassCSP: true,
      } : {}),
    });
    
    const page = await context.newPage();
    context.setDefaultTimeout(DEFAULT_ACTION_TIMEOUT_MS);
    context.setDefaultNavigationTimeout(DEFAULT_NAV_TIMEOUT_MS);
    page.setDefaultTimeout(DEFAULT_ACTION_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(DEFAULT_NAV_TIMEOUT_MS);

    // Only apply stealth techniques in serverless (not needed for local debugging)
    if (isServerless) {
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
    }
    
    // CRITICAL: Comprehensive stealth script to bypass headless detection (serverless only)
    if (isServerless) {
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
    } // End of isServerless stealth block

    // Construct the search query: "BusinessName FullAddress"
    const searchQuery = `${businessName} ${address}`;
    console.log(`[DEBUG] Searching for: ${searchQuery}`);

    // STRATEGY: Go to Google.com and type in search box (like a real user)
    console.log(`[DEBUG] Navigating to Google.com...`);
    await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: DEFAULT_NAV_TIMEOUT_MS });
    
    // Random delay after page load (like user looking at page)
    await randomDelay(500, 1000);
    
    // Find the search box and type the query
    console.log(`[DEBUG] Typing search query: ${searchQuery}`);
    const searchBox = page.locator('textarea[name="q"], input[name="q"]').first();
    await searchBox.waitFor({ state: 'visible', timeout: 10000 });
    await searchBox.click();
    await randomDelay(200, 400);
    
    // Type the search query with human-like speed
    await searchBox.fill(searchQuery);
    await randomDelay(300, 600);
    
    // Press Enter to search
    console.log(`[DEBUG] Pressing Enter to search...`);
    await searchBox.press('Enter');
    
    // Wait for search results to load
    await page.waitForLoadState('domcontentloaded', { timeout: DEFAULT_NAV_TIMEOUT_MS });
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

    // Look for the Profiles section using the exact structure from Google
    console.log('[DEBUG] Looking for Profiles section...');
    
    // Strategy 1: Look for the Profiles container by data-attrid attribute
    let profilesContainer = page.locator('div[role="presentation"][data-attrid="kc:/common/topic:social media presence"]').first();
    let profilesFound = await profilesContainer.count() > 0;
    
    // Strategy 2: Look for the span with class "kplpt" containing "Profiles"
    if (!profilesFound) {
      const profilesHeading = page.locator('span.kplpt:has-text("Profiles")').first();
      if (await profilesHeading.count() > 0) {
        // Find the parent container with role="presentation"
        profilesContainer = profilesHeading.locator('xpath=ancestor::div[@role="presentation"][1]').first();
        profilesFound = await profilesContainer.count() > 0;
        console.log(`[DEBUG] Strategy 2 - Profiles container found: ${profilesFound}`);
      }
    }
    
    // Strategy 3: Look for the Profiles heading by class
    if (!profilesFound) {
      const profilesHeading = page.locator('div.sq4Bpf.Ss2Faf.zbA8Me.q8U8x:has(span.kplpt:has-text("Profiles"))').first();
      if (await profilesHeading.count() > 0) {
        // Find the parent container
        profilesContainer = profilesHeading.locator('xpath=ancestor::div[@role="presentation"][1]').first();
        profilesFound = await profilesContainer.count() > 0;
        console.log(`[DEBUG] Strategy 3 - Profiles container found: ${profilesFound}`);
      }
    }

    if (!profilesFound) {
      console.log(`[DEBUG] Profiles section not found. Returning empty result.`);
      return { socialLinks: [], websiteUrl: null };
    }
    
    console.log('[DEBUG] Profiles section found!');

    // Extract social links from the Profiles container
    // Links are in div.PZPZlf.dRrfkf.kno-vrt-t within div.OOijTb.P6Tjc.gDQYEd.Dy8CGd.XWkUDf
    console.log('[DEBUG] Extracting social links from Profiles container...');
    const socialLinks: { platform: string; url: string }[] = [];
    const seenUrls = new Set<string>();

    // Find the links container within the Profiles section
    const linksContainer = profilesContainer.locator('div.OOijTb.P6Tjc.gDQYEd.Dy8CGd.XWkUDf').first();
    const hasLinksContainer = await linksContainer.count() > 0;
    
    if (hasLinksContainer) {
      // Find all social link divs within the container
      const linkDivs = await linksContainer.locator('div.PZPZlf.dRrfkf.kno-vrt-t').all();
      console.log(`[DEBUG] Found ${linkDivs.length} social link divs in Profiles container`);
      
      for (const linkDiv of linkDivs) {
        try {
          // Find the anchor tag within this div
          const link = linkDiv.locator('a[href]').first();
          if (await link.count() === 0) continue;
          
          let href = await link.getAttribute('href');
          if (!href) continue;

          // Handle Google's redirect URLs (e.g., /url?q=... or ping attribute)
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
          
          // Also check ping attribute which sometimes contains the real URL
          const ping = await link.getAttribute('ping');
          if (ping) {
            const pingMatch = ping.match(/url=([^&]+)/);
            if (pingMatch) {
              href = decodeURIComponent(pingMatch[1]);
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

          // Extract platform and validate (only Instagram and Facebook)
          const platform = extractPlatformFromUrl(href);
          if (platform && (platform === 'instagram' || platform === 'facebook') && !seenUrls.has(href)) {
            seenUrls.add(href);
            socialLinks.push({ platform, url: href });
            console.log(`[DEBUG] Found ${platform}: ${href}`);
          }
        } catch (error) {
          console.log(`[DEBUG] Error extracting link from div:`, error);
          continue;
        }
      }
    } else {
      // Fallback: search for links directly in the Profiles container
      console.log('[DEBUG] Links container not found, searching for links directly in Profiles section...');
      const allLinks = await profilesContainer.locator('a[href*="instagram.com"], a[href*="facebook.com"]').all();
      console.log(`[DEBUG] Found ${allLinks.length} social links in Profiles section`);
      
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
          
          // Check ping attribute
          const ping = await link.getAttribute('ping');
          if (ping) {
            const pingMatch = ping.match(/url=([^&]+)/);
            if (pingMatch) {
              href = decodeURIComponent(pingMatch[1]);
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
          if (platform && (platform === 'instagram' || platform === 'facebook') && !seenUrls.has(href)) {
            seenUrls.add(href);
            socialLinks.push({ platform, url: href });
            console.log(`[DEBUG] Found ${platform}: ${href}`);
          }
        } catch (error) {
          continue;
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

      // Alternative: Look for website in the knowledge panel (complementary role)
      if (!websiteUrl) {
        const knowledgePanel = page.locator('[role="complementary"]').first();
        if (await knowledgePanel.count() > 0) {
          const allLinks = await knowledgePanel.locator('a[href^="http"]').all();
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
// ============================================================================
// Google Custom Search API Integration
// ============================================================================

type SocialPlatform = 'facebook' | 'instagram';
type SocialLink = { platform: SocialPlatform; url: string };
type GoogleCseItem = { 
  link?: string; 
  title?: string; 
  snippet?: string; 
  displayLink?: string;
};
type GoogleCseResponse = { 
  items?: GoogleCseItem[];
  error?: { message?: string; code?: number };
};

/**
 * Performs a Google Custom Search API query.
 * 
 * @param query - The search query string
 * @param num - Number of results to return (default: 5)
 * @returns Promise resolving to array of search result items
 */
async function googleCseSearch(query: string, num: number = 5): Promise<GoogleCseItem[]> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  
  if (!apiKey || !cx) {
    console.warn(`[SOCIAL EXTRACTOR] Google CSE API credentials not configured (GOOGLE_CSE_API_KEY or GOOGLE_CSE_CX missing). Skipping API search.`);
    return [];
  }
  
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('cx', cx);
  url.searchParams.set('q', query);
  url.searchParams.set('num', num.toString());
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      const snippet = errorText.length > 300 ? errorText.substring(0, 300) + '...' : errorText;
      console.error(`[SOCIAL EXTRACTOR] Google CSE API error ${response.status}: ${snippet}`);
      return [];
    }
    
    const data: GoogleCseResponse = await response.json();
    
    if (data.error) {
      console.error(`[SOCIAL EXTRACTOR] Google CSE API error: ${data.error.message || 'Unknown error'}`);
      return [];
    }
    
    return data.items || [];
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[SOCIAL EXTRACTOR] Google CSE API request timeout`);
    } else {
      console.error(`[SOCIAL EXTRACTOR] Google CSE API request failed:`, error);
    }
    return [];
  }
}

/**
 * Normalizes and validates a Facebook URL.
 * Returns null if the URL should be rejected (not a profile/page).
 */
function normalizeFacebookUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    
    // CRITICAL: Only accept facebook.com domains
    const hostname = urlObj.hostname.toLowerCase();
    if (!hostname.includes('facebook.com')) {
      return null;
    }
    
    // Convert m.facebook.com to www.facebook.com
    if (hostname === 'm.facebook.com') {
      urlObj.hostname = 'www.facebook.com';
    }
    
    // Remove query string and fragments
    urlObj.search = '';
    urlObj.hash = '';
    
    const pathname = urlObj.pathname.toLowerCase();
    
    // Reject non-profile URLs
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
    
    // Reject root facebook.com with no page or invalid paths
    if (pathname === '/' || pathname === '' || pathname.length <= 1) {
      return null;
    }
    
    // Additional check: reject if pathname only has special segments (like /pages/ with no actual page)
    const pathSegments = pathname.split('/').filter(s => s.length > 0);
    if (pathSegments.length === 0 || (pathSegments.length === 1 && pathSegments[0] === 'pages')) {
      return null;
    }
    
    // Clean up the URL
    let cleanUrl = urlObj.toString();
    
    // Final safety check: reject if URL is just the root domain
    if (cleanUrl === 'https://www.facebook.com/' || cleanUrl === 'https://www.facebook.com' || 
        cleanUrl === 'https://facebook.com/' || cleanUrl === 'https://facebook.com') {
      return null;
    }
    
    // Ensure it ends with / for consistency (unless it's a /page/ URL)
    if (!cleanUrl.endsWith('/') && !cleanUrl.includes('/page/')) {
      cleanUrl += '/';
    }
    
    // One more check after adding trailing slash
    if (cleanUrl === 'https://www.facebook.com/' || cleanUrl === 'https://facebook.com/') {
      return null;
    }
    
    return cleanUrl;
  } catch {
    return null;
  }
}

/**
 * Normalizes and validates an Instagram URL.
 * Returns null if the URL should be rejected (not a profile).
 */
function normalizeInstagramUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    
    // Ensure it's an Instagram URL
    if (!urlObj.hostname.includes('instagram.com')) {
      return null;
    }
    
    // Remove query string and fragments
    urlObj.search = '';
    urlObj.hash = '';
    
    const pathname = urlObj.pathname.toLowerCase();
    
    // Reject non-profile URLs
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
    
    // Clean up the URL - remove trailing slash
    let cleanUrl = urlObj.toString();
    cleanUrl = cleanUrl.replace(/\/$/, '');
    
    return cleanUrl;
  } catch {
    return null;
  }
}

/**
 * Scores a search result item to determine if it's a good match for the business.
 * Higher score = better match.
 */
function scoreSearchResult(
  item: GoogleCseItem,
  businessName: string,
  platform: SocialPlatform
): number {
  let score = 0;
  const businessNameLower = businessName.toLowerCase();
  
  // Check displayLink matches platform domain
  const displayLink = (item.displayLink || '').toLowerCase();
  if (platform === 'facebook' && displayLink.includes('facebook.com')) {
    score += 3;
  } else if (platform === 'instagram' && displayLink.includes('instagram.com')) {
    score += 3;
  }
  
  // Check if title or snippet contains business name
  const title = (item.title || '').toLowerCase();
  const snippet = (item.snippet || '').toLowerCase();
  if (title.includes(businessNameLower) || snippet.includes(businessNameLower)) {
    score += 2;
  }
  
  // Check if URL path looks like a clean profile (single segment)
  const link = item.link || '';
  try {
    const url = new URL(link);
    const pathSegments = url.pathname.split('/').filter(s => s.length > 0);
    if (pathSegments.length <= 2) { // e.g., /username or /username/
      score += 1;
    }
  } catch {
    // Invalid URL, no bonus
  }
  
  return score;
}

/**
 * Scores a social media URL directly (not from search results).
 * Used for links extracted from websites.
 * Higher score = better match.
 */
function scoreSocialUrl(
  url: string,
  businessName: string,
  platform: SocialPlatform,
  source: 'website' | 'cse'
): number {
  let score = 0;
  const businessNameLower = businessName.toLowerCase();
  
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    const pathSegments = pathname.split('/').filter(s => s.length > 0);
    
    // Extract username/handle from URL
    const username = pathSegments[0] || '';
    
    // Check if username contains business name (or parts of it)
    const businessWords = businessNameLower.split(/\s+/).filter(w => w.length > 2);
    let nameMatchCount = 0;
    for (const word of businessWords) {
      if (username.includes(word)) {
        nameMatchCount++;
      }
    }
    if (nameMatchCount > 0) {
      score += nameMatchCount * 2; // More matching words = higher score
    }
    
    // Prefer clean profile URLs (single segment)
    if (pathSegments.length === 1) {
      score += 2;
    } else if (pathSegments.length === 2 && pathSegments[1] === '') {
      score += 2;
    }
    
    // Source reliability: website links are slightly more trusted (but need cross-validation)
    if (source === 'website') {
      score += 1;
    } else if (source === 'cse') {
      score += 1.5; // CSE results are pre-filtered by Google
    }
    
  } catch {
    // Invalid URL
    return 0;
  }
  
  return score;
}

/**
 * Checks if two URLs point to the same social media account.
 * Accounts for variations in URL format (trailing slashes, www, etc.)
 */
function urlsMatch(url1: string, url2: string): boolean {
  try {
    const normalize = (url: string): string => {
      const u = new URL(url);
      u.search = '';
      u.hash = '';
      let path = u.pathname.toLowerCase().replace(/\/$/, '');
      return `${u.hostname.toLowerCase()}${path}`;
    };
    
    return normalize(url1) === normalize(url2);
  } catch {
    return false;
  }
}

/**
 * Verifies and selects the best social media link for a platform.
 * Requires cross-validation between sources - if sources disagree, we need high confidence.
 * 
 * @param candidates - Array of candidate links with their source and score
 * @param businessName - Business name for additional validation
 * @param platform - Platform being verified
 * @returns The verified URL, or null if verification fails
 */
function verifyAndSelectSocialLink(
  candidates: Array<{ url: string; source: 'website' | 'cse'; score: number }>,
  businessName: string,
  platform: SocialPlatform
): string | null {
  if (candidates.length === 0) {
    return null;
  }
  
  // Group candidates by URL (normalized)
  const urlGroups = new Map<string, Array<{ url: string; source: 'website' | 'cse'; score: number }>>();
  
  for (const candidate of candidates) {
    let matched = false;
    for (const [normalizedUrl, group] of Array.from(urlGroups.entries())) {
      if (urlsMatch(candidate.url, normalizedUrl)) {
        group.push(candidate);
        matched = true;
        break;
      }
    }
    if (!matched) {
      urlGroups.set(candidate.url, [candidate]);
    }
  }
  
  // Score each unique URL based on:
  // 1. Number of sources that found it (cross-validation)
  // 2. Average score from all sources
  // 3. Highest individual score
  
  const urlScores = new Map<string, { 
    url: string; 
    sourceCount: number; 
    avgScore: number; 
    maxScore: number;
    sources: Array<'website' | 'cse'>;
  }>();
  
  for (const [url, group] of Array.from(urlGroups.entries())) {
    const sources = new Set(group.map(c => c.source));
    const scores = group.map(c => c.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const maxScore = Math.max(...scores);
    
    urlScores.set(url, {
      url: group[0].url, // Use first URL in group (they're all equivalent)
      sourceCount: sources.size,
      avgScore,
      maxScore,
      sources: Array.from(sources) as Array<'website' | 'cse'>,
    });
  }
  
  // Verification rules:
  // 1. If only one source found it, require high score (>= 5)
  // 2. If multiple sources found it, require moderate score (>= 4)
  // 3. Prefer URLs found by multiple sources (cross-validation)
  // 4. If sources disagree (different URLs), require very high confidence (>= 6) and prefer CSE
  
  const verifiedCandidates: Array<{
    url: string;
    finalScore: number;
    reason: string;
  }> = [];
  
  for (const [url, data] of Array.from(urlScores.entries())) {
    let verified = false;
    let finalScore = data.avgScore;
    let reason = '';
    
    // Cross-validated (found by multiple sources)
    if (data.sourceCount > 1) {
      if (data.avgScore >= 4) {
        verified = true;
        finalScore = data.avgScore + 2; // Bonus for cross-validation
        reason = `Cross-validated by ${data.sourceCount} sources`;
      }
    } 
    // Single source - require higher confidence
    else {
      if (data.maxScore >= 5) {
        verified = true;
        finalScore = data.maxScore;
        reason = `High confidence from ${data.sources[0]}`;
      }
    }
    
    if (verified) {
      verifiedCandidates.push({ url: data.url, finalScore, reason });
    }
  }
  
  // If we have verified candidates, select the best one
  if (verifiedCandidates.length > 0) {
    // Sort by final score (descending)
    verifiedCandidates.sort((a, b) => b.finalScore - a.finalScore);
    const best = verifiedCandidates[0];
    console.log(`[SOCIAL VERIFIER] ✅ Verified ${platform}: ${best.url} (${best.reason}, score: ${best.finalScore.toFixed(1)})`);
    return best.url;
  }
  
  // If sources disagree (multiple different URLs), check if any has very high confidence
  if (urlScores.size > 1) {
    const highConfidence = Array.from(urlScores.values())
      .filter(d => d.maxScore >= 6)
      .sort((a, b) => b.maxScore - a.maxScore);
    
    if (highConfidence.length > 0) {
      // Prefer CSE results when sources disagree (they're pre-filtered by Google)
      const csePreferred = highConfidence.find(d => d.sources.includes('cse')) || highConfidence[0];
      const selectedUrl = Array.from(urlGroups.entries())
        .find(([url]) => urlsMatch(url, csePreferred.url))?.[1]?.[0]?.url;
      
      if (selectedUrl) {
        console.log(`[SOCIAL VERIFIER] ⚠️ Sources disagree, but high confidence CSE result: ${selectedUrl} (score: ${csePreferred.maxScore})`);
        return selectedUrl;
      }
    }
    
    console.log(`[SOCIAL VERIFIER] ❌ Sources disagree and no high-confidence match. Rejecting ${platform} links.`);
    return null;
  }
  
  console.log(`[SOCIAL VERIFIER] ❌ No verified candidates for ${platform}. Rejecting.`);
  return null;
}

/**
 * Extracts social media links using Google Custom Search API.
 * Returns all candidates with scores for cross-validation.
 * 
 * This approach avoids CAPTCHAs by using Google's official API instead of scraping.
 * 
 * @param businessName - The name of the business
 * @param address - The full address of the business (can be partial, e.g., just city)
 * @param platformsToSearch - Optional array of platforms to search for. If not provided, searches for both.
 * @returns Promise resolving to an object with social media links (best candidates only, for backward compatibility)
 */
async function extractSocialLinksViaGoogleCse(
  businessName: string,
  address: string,
  platformsToSearch?: SocialPlatform[]
): Promise<{ socialLinks: SocialLink[]; candidates?: Array<{ url: string; platform: SocialPlatform; score: number }> }> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  
  if (!apiKey || !cx) {
    console.log(`[SOCIAL EXTRACTOR] Google CSE API not configured, skipping API search`);
    return { socialLinks: [], candidates: [] };
  }
  
  // Default to both platforms if not specified
  const platforms = platformsToSearch || ['facebook', 'instagram'];
  console.log(`[SOCIAL EXTRACTOR] Using Google CSE API to search for: ${platforms.join(', ')}`);
  
  const socialLinks: SocialLink[] = [];
  const allCandidates: Array<{ url: string; platform: SocialPlatform; score: number }> = [];
  const seenUrls = new Set<string>();
  
  // Extract just the city/area from the address for more focused searches
  // Full addresses often return too many unrelated results
  const addressParts = address.split(',').map(p => p.trim());
  const shortAddress = addressParts.length > 2 
    ? addressParts.slice(-2).join(', ')  // Last 2 parts (usually city, country)
    : address;
  
  // Minimum score threshold - candidates below this are rejected
  const MIN_SCORE_THRESHOLD = 3;
  
  // Search for Facebook profiles (if requested)
  if (platforms.includes('facebook')) {
    const facebookCandidates: Array<{ url: string; score: number }> = [];
    
    // Use natural language search queries
    const facebookQueries = [
      `"${businessName}" ${shortAddress} facebook`,
      `${businessName} ${shortAddress} facebook`,
    ];
    
    for (const query of facebookQueries) {
      console.log(`[SOCIAL EXTRACTOR] Searching Facebook: "${query}"`);
      const items = await googleCseSearch(query, 5);
      
      for (const item of items) {
        if (!item.link) continue;
        
        const normalized = normalizeFacebookUrl(item.link);
        if (!normalized || seenUrls.has(normalized)) continue;
        
        seenUrls.add(normalized);
        const score = scoreSearchResult(item, businessName, 'facebook');
        
        // Store all candidates (even low-scoring ones) for cross-validation
        facebookCandidates.push({ url: normalized, score });
        allCandidates.push({ url: normalized, platform: 'facebook', score });
        if (score >= MIN_SCORE_THRESHOLD) {
          console.log(`[SOCIAL EXTRACTOR] Facebook candidate: ${normalized} (score: ${score})`);
        } else {
          console.log(`[SOCIAL EXTRACTOR] Facebook candidate (low score ${score}): ${normalized}`);
        }
      }
      
      // If we found good candidates, no need to continue
      if (facebookCandidates.length > 0) break;
      
      // Small delay between queries
      await randomDelay(200, 400);
    }
    
    // Select best candidate (highest score)
    if (facebookCandidates.length > 0) {
      const bestFacebook = facebookCandidates.reduce((best, current) => 
        current.score > best.score ? current : best
      );
      socialLinks.push({ platform: 'facebook', url: bestFacebook.url });
      console.log(`[SOCIAL EXTRACTOR] Selected Facebook: ${bestFacebook.url} (score: ${bestFacebook.score})`);
    }
  }
  
  // Search for Instagram profiles (if requested)
  if (platforms.includes('instagram')) {
    const instagramCandidates: Array<{ url: string; score: number }> = [];
    
    // Use natural language search queries
    const instagramQueries = [
      `"${businessName}" ${shortAddress} instagram`,
      `${businessName} ${shortAddress} instagram`,
    ];
    
    for (const query of instagramQueries) {
      console.log(`[SOCIAL EXTRACTOR] Searching Instagram: "${query}"`);
      const items = await googleCseSearch(query, 5);
      
      for (const item of items) {
        if (!item.link) continue;
        
        const normalized = normalizeInstagramUrl(item.link);
        if (!normalized || seenUrls.has(normalized)) continue;
        
        seenUrls.add(normalized);
        const score = scoreSearchResult(item, businessName, 'instagram');
        
        // Store all candidates (even low-scoring ones) for cross-validation
        instagramCandidates.push({ url: normalized, score });
        allCandidates.push({ url: normalized, platform: 'instagram', score });
        if (score >= MIN_SCORE_THRESHOLD) {
          console.log(`[SOCIAL EXTRACTOR] Instagram candidate: ${normalized} (score: ${score})`);
        } else {
          console.log(`[SOCIAL EXTRACTOR] Instagram candidate (low score ${score}): ${normalized}`);
        }
      }
      
      // If we found good candidates, no need to continue
      if (instagramCandidates.length > 0) break;
      
      // Small delay between queries
      await randomDelay(200, 400);
    }
    
    // Select best candidate (highest score)
    if (instagramCandidates.length > 0) {
      const bestInstagram = instagramCandidates.reduce((best, current) => 
        current.score > best.score ? current : best
      );
      socialLinks.push({ platform: 'instagram', url: bestInstagram.url });
      console.log(`[SOCIAL EXTRACTOR] Selected Instagram: ${bestInstagram.url} (score: ${bestInstagram.score})`);
    }
  }
  
  console.log(`[SOCIAL EXTRACTOR] Google CSE API found ${socialLinks.length} social links (${allCandidates.length} total candidates)`);
  return { socialLinks, candidates: allCandidates };
}

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
        } else if (cached.status === 'running') {
          // Already running - return partial result if available, otherwise wait
          if (cached.partialResult) {
            console.log(`[API] Scraper running for scanId: ${scanId}, returning partial result`);
            return NextResponse.json(cached.partialResult, { status: 200 });
          } else if (cached.promise) {
            // No partial result yet, wait for existing promise
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
    }

    // Create the scraper execution promise
    const scraperPromise = (async () => {
      // APPROACH: 
      // 1. First try to extract social links from the business website (fastest, most reliable)
      // 2. If any platforms are missing, use Google CSE API to find them
      
      console.log(`[API] Extracting social links for: "${businessName}" at "${address}"`);
      
      // Use provided website URL
      const websiteUrlToUse = providedWebsiteUrl || null;
      console.log(`[API] Website URL: ${websiteUrlToUse || 'none'}`);
      
      let socialLinks: { platform: string; url: string }[] = [];
      
      // STEP 1: Extract social links from website (if available)
      const websiteCandidates: Array<{ url: string; platform: SocialPlatform; source: 'website' | 'cse'; score: number }> = [];
      
      if (websiteUrlToUse) {
        console.log(`[API] Step 1: Extracting social links from website: ${websiteUrlToUse}`);
        try {
          const websiteLinks = await extractSocialLinksFromWebsite(websiteUrlToUse);
          const cleanedWebsiteLinks = cleanAndDeduplicateSocialLinks(websiteLinks);
          console.log(`[API] Found ${cleanedWebsiteLinks.length} social links from website`);
          
          // Score each website link
          for (const link of cleanedWebsiteLinks) {
            if (link.platform === 'facebook' || link.platform === 'instagram') {
              const score = scoreSocialUrl(link.url, businessName, link.platform as SocialPlatform, 'website');
              websiteCandidates.push({
                url: link.url,
                platform: link.platform as SocialPlatform,
                source: 'website',
                score,
              });
              console.log(`[API] Website candidate: ${link.platform} -> ${link.url} (score: ${score})`);
            }
          }
        } catch (websiteError) {
          console.error(`[API] Website scraping failed:`, websiteError);
        }
      } else {
        console.log(`[API] Step 1: Skipped (no website URL provided)`);
      }
      
      // STEP 2: Always use Google CSE API to find social links (for cross-validation)
      console.log(`[API] Step 2: Using Google CSE API to find social links (for cross-validation)`);
      const cseCandidates: Array<{ url: string; platform: SocialPlatform; source: 'website' | 'cse'; score: number }> = [];
      
      try {
        const cseResult = await extractSocialLinksViaGoogleCse(businessName, address, ['facebook', 'instagram']);
        
        // Use candidates if available (for cross-validation), otherwise fall back to socialLinks
        if (cseResult.candidates && cseResult.candidates.length > 0) {
          console.log(`[API] Found ${cseResult.candidates.length} CSE candidates for cross-validation`);
          
          // Use the scores from CSE (they're already calculated)
          for (const candidate of cseResult.candidates) {
            cseCandidates.push({
              url: candidate.url,
              platform: candidate.platform,
              source: 'cse',
              score: candidate.score,
            });
            console.log(`[API] CSE candidate: ${candidate.platform} -> ${candidate.url} (score: ${candidate.score})`);
          }
        } else {
          // Fallback: use socialLinks and score them
          const cleanedCseLinks = cleanAndDeduplicateSocialLinks(cseResult.socialLinks);
          console.log(`[API] Found ${cleanedCseLinks.length} social links from Google CSE API (fallback mode)`);
          
          for (const link of cleanedCseLinks) {
            if (link.platform === 'facebook' || link.platform === 'instagram') {
              const score = scoreSocialUrl(link.url, businessName, link.platform as SocialPlatform, 'cse');
              cseCandidates.push({
                url: link.url,
                platform: link.platform as SocialPlatform,
                source: 'cse',
                score,
              });
              console.log(`[API] CSE candidate: ${link.platform} -> ${link.url} (score: ${score})`);
            }
          }
        }
      } catch (cseError) {
        console.error(`[API] Google CSE API failed:`, cseError);
      }
      
      // STEP 3: Verify and select the best link for each platform
      // For username-only extraction, use lenient verification (just pick best candidate)
      // For full analysis, use strict cross-validation
      const isUsernameOnlyExtraction = scanId && scanId.includes('_social_extract');
      
      console.log(`[API] Step 3: ${isUsernameOnlyExtraction ? 'Selecting best candidates (lenient mode)' : 'Verifying and selecting best links with cross-validation'}`);
      const verifiedLinks: Array<{ platform: SocialPlatform; url: string }> = [];
      
      for (const platform of ['facebook', 'instagram'] as SocialPlatform[]) {
        // Collect all candidates for this platform
        const allCandidates = [
          ...websiteCandidates.filter(c => c.platform === platform),
          ...cseCandidates.filter(c => c.platform === platform),
        ];
        
        if (allCandidates.length === 0) {
          console.log(`[API] No candidates found for ${platform}`);
          continue;
        }
        
        let verifiedUrl: string | null = null;
        
        if (isUsernameOnlyExtraction) {
          // Lenient mode: just pick the highest scoring candidate (minimum score 3)
          allCandidates.sort((a, b) => b.score - a.score);
          const bestCandidate = allCandidates[0];
          
          if (bestCandidate.score >= 3) {
            verifiedUrl = bestCandidate.url;
            console.log(`[API] ✅ Selected ${platform} (lenient): ${verifiedUrl} (score: ${bestCandidate.score})`);
          } else {
            console.log(`[API] ⚠️ Best ${platform} candidate score too low: ${bestCandidate.score} (min: 3)`);
          }
        } else {
          // Strict mode: use full verification with cross-validation
          verifiedUrl = verifyAndSelectSocialLink(
            allCandidates.map(c => ({ url: c.url, source: c.source, score: c.score })),
            businessName,
            platform
          );
          
          if (verifiedUrl) {
            console.log(`[API] ✅ Verified ${platform}: ${verifiedUrl}`);
          } else {
            console.log(`[API] ❌ Verification failed for ${platform} - rejecting all candidates`);
          }
        }
        
        if (verifiedUrl) {
          verifiedLinks.push({ platform, url: verifiedUrl });
        }
      }
      
      // Use verified/selected links
      socialLinks = verifiedLinks;
      console.log(`[API] Final ${isUsernameOnlyExtraction ? 'selected' : 'verified'} social links count: ${socialLinks.length}`);

    // Initialize partial result in cache before starting screenshots
    // This allows frontend to poll and get incremental updates
    if (scanId) {
      const initialPartialResult = {
        success: true,
        businessName,
        address,
        socialLinks: [], // Start with empty array, will be updated incrementally
        websiteUrl: websiteUrlToUse,
        websiteScreenshot: null,
        count: socialLinks.length,
        scanId,
      };
      const cached = scraperCache.get(scanId);
      if (cached && cached.status === 'running') {
        scraperCache.set(scanId, { ...cached, partialResult: initialPartialResult });
        console.log(`[API] Initialized partial result for incremental updates`);
      }
    }

    // Check if this is username-only extraction (no screenshots needed)
    // Note: isUsernameOnlyExtraction is already defined above in Step 3
    if (isUsernameOnlyExtraction) {
      console.log(`[API] Username-only extraction mode - skipping screenshots`);
      // Return early with just the links, no screenshots
      const result = {
        success: true,
        businessName,
        address,
        socialLinks: socialLinks.map(link => ({
          platform: link.platform,
          url: link.url,
          screenshot: null,
        })),
        websiteUrl: websiteUrlToUse,
        websiteScreenshot: null,
        count: socialLinks.length,
        scanId,
      };
      
      // Cache the result
      if (scanId) {
        scraperCache.set(scanId, { status: 'completed', result });
        // Clean up cache after 1 hour to prevent memory leaks
        setTimeout(() => {
          scraperCache.delete(scanId);
        }, 3600000); // 1 hour
      }
      
      return result;
    }

    // Capture screenshots in PARALLEL for social media (Facebook and Instagram)
    // Each screenshot updates partial result as soon as it completes, so frontend can display immediately
    const screenshotStartTime = Date.now();
    
    // Keep social links in original order for consistent result ordering
    const sortedSocialLinks = [...socialLinks];
    
    // Initialize socialScreenshots array with correct length (filled with placeholders that will be replaced)
    // Type matches what captureSocialScreenshot returns: 'success' | 'error'
    const socialScreenshots: Array<{ platform: string; url: string; screenshot: string | null; status: 'success' | 'error' }> = 
      sortedSocialLinks.map(link => ({
        platform: link.platform,
        url: link.url,
        screenshot: null,
        status: 'error' as const, // Placeholder - will be updated to 'success' or 'error' when screenshot completes
      }));
    
    let websiteScreenshot: string | null = null;
    
    const totalScreenshots = sortedSocialLinks.length + (websiteUrlToUse ? 1 : 0);
    console.log(`[API] Preparing to capture ${totalScreenshots} screenshots (${sortedSocialLinks.length} social in PARALLEL + ${websiteUrlToUse ? '1 website' : '0 websites'})`);
    console.log(`[API] Social platforms: ${sortedSocialLinks.map(l => l.platform).join(', ')}`);
    
    // Initialize partial result for incremental updates
    const updatePartialResult = () => {
      if (scanId) {
        // Include all social links (even if screenshot is null) so frontend knows what to expect
        // Frontend will display screenshots as they become available
        const partialResult = {
          success: true,
          businessName,
          address,
          socialLinks: [...socialScreenshots], // Include all, even placeholders
          websiteUrl: websiteUrlToUse,
          websiteScreenshot,
          count: socialLinks.length,
          scanId,
        };
        const cached = scraperCache.get(scanId);
        if (cached && cached.status === 'running') {
          scraperCache.set(scanId, { ...cached, partialResult });
          const completedCount = socialScreenshots.filter(s => s.screenshot !== null || s.status === 'error').length;
          console.log(`[API] Updated partial result - ${completedCount}/${sortedSocialLinks.length} social screenshots ready`);
        }
      }
    };
    
    // Capture social media screenshots in PARALLEL
    // Each screenshot updates partial result as soon as it completes, so frontend can display immediately
    // Pass business context to help with Google search bypass if Instagram blocks login
    const socialScreenshotPromises = sortedSocialLinks.map(async (link, index) => {
      console.log(`[API] 🚀 Starting parallel screenshot capture for ${link.platform}: ${link.url}`);
      try {
        const result = await captureSocialScreenshot(link.platform, link.url, 'mobile', businessName, address);
        if ('platform' in result) {
          console.log(`[API] ✅ Social screenshot for ${result.platform} completed: hasScreenshot=${!!result.screenshot}, status=${result.status}`);
          
          // Store result in the correct position to maintain order
          socialScreenshots[index] = result;
          
          // Update partial result immediately so frontend can display this screenshot
          updatePartialResult();
        }
        return { index, result, error: null };
      } catch (error) {
        console.error(`[API] ❌ Screenshot capture for ${link.platform} FAILED:`, error);
        const errorResult = {
          platform: link.platform,
          url: link.url,
          screenshot: null,
          status: 'error' as const,
        };
        
        // Store error result in the correct position
        socialScreenshots[index] = errorResult;
        
        // Update partial result even on error
        updatePartialResult();
        
        return { index, result: null, error };
      }
    });
    
    // Wait for all social screenshots to complete (they run in parallel)
    await Promise.allSettled(socialScreenshotPromises);
    console.log(`[API] ✅ All ${sortedSocialLinks.length} social screenshots completed (parallel execution)`);

    // Capture website screenshot
    if (websiteUrlToUse) {
      console.log(`[API] Capturing website screenshot for: ${websiteUrlToUse}`);
      try {
        const result = await captureSocialScreenshot('website', websiteUrlToUse, 'desktop', businessName, address);
        if ('websiteScreenshot' in result) {
          console.log(`[API] Website screenshot: hasScreenshot=${!!result.websiteScreenshot}`);
          websiteScreenshot = result.websiteScreenshot;
          // Update partial result after website screenshot completes
          updatePartialResult();
        }
      } catch (error) {
        console.error(`[API] Website screenshot capture FAILED:`, error);
        // Update partial result even on error
        updatePartialResult();
      }
    }
    
    const screenshotElapsed = Date.now() - screenshotStartTime;
    console.log(`[API] All ${totalScreenshots} screenshot captures completed in ${screenshotElapsed}ms`);

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