/**
 * WARNING: This endpoint performs automated browsing using Selenium WebDriver.
 * Use cautiously to avoid being blocked by target sites. Consider implementing:
 * - Rate limiting
 * - User-agent rotation
 * - Request delays
 * - Respect for robots.txt
 */

import { NextRequest, NextResponse } from "next/server";
import { Builder, WebDriver, By, until, WebElement, Key } from "selenium-webdriver";
import { Options as ChromeOptions, ServiceBuilder } from "selenium-webdriver/chrome";
import * as path from "path";
import * as fs from "fs";

// In-memory cache to prevent duplicate scraper executions
// Key: scanId, Value: { status: 'running' | 'completed', result?: any, promise?: Promise<any> }
const scraperCache = new Map<string, { status: 'running' | 'completed', result?: any, promise?: Promise<any> }>();

/**
 * Helper function to capture a screenshot by calling the screenshot API
 * This is used internally to capture screenshots after link extraction
 * Note: In server-side context, we need to use the full URL or localhost
 */
async function captureSocialScreenshot(
  platform: string,
  url: string,
  viewport: 'desktop' | 'mobile'
): Promise<{ platform: string; url: string; screenshot: string | null; status: 'success' | 'error' } | { websiteScreenshot: string | null }> {
  try {
    // Determine base URL for internal API calls
    // In production (Vercel), use the request host or environment variable
    // For local development, use localhost
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL 
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    
    const response = await fetch(`${baseUrl}/api/scan/socials/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, url, viewport }),
    });

    if (response.ok) {
      const data = await response.json();
      if (platform === 'website') {
        return { websiteScreenshot: data.screenshot || null };
      } else {
        return {
          platform,
          url,
          screenshot: data.screenshot || null,
          status: data.success ? 'success' : 'error',
        };
      }
    } else {
      if (platform === 'website') {
        return { websiteScreenshot: null };
      } else {
        return { platform, url, screenshot: null, status: 'error' };
      }
    }
  } catch (error) {
    console.error(`Error capturing screenshot for ${platform}:`, error);
    if (platform === 'website') {
      return { websiteScreenshot: null };
    } else {
      return { platform, url, screenshot: null, status: 'error' };
    }
  }
}

/**
 * Extracts social media profile links and website URL from a Google Business Profile (GBP) knowledge panel.
 * 
 * This function:
 * 1. Launches a headless browser using Selenium WebDriver
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
): Promise<{ socialLinks: { platform: string; url: string }[] }> {
  let driver: WebDriver | null = null;

  try {
    // Configure Chrome options with UNDETECTABLE headless mode
    const chromeOptions = new ChromeOptions();
    chromeOptions.addArguments(
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      // CRITICAL: These make headless look like headful
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu', // GPU can cause issues in headless
      // Window size arguments (must match viewport)
      '--window-size=1920,1080',
      '--start-maximized', // Pretend to be maximized
      // User agent (use a recent Chrome version)
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      // Additional stealth
      '--no-first-run',
      '--no-zygote',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-breakpad',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-domain-reliability',
      '--disable-sync',
      '--metrics-recording-only',
      '--safebrowsing-disable-auto-update',
      '--password-store=basic',
      '--use-mock-keychain'
    );
    
    // Set headless mode
    chromeOptions.addArguments('--headless=new');

    // Configure ChromeDriver service to use the chromedriver package
    // This fixes the Selenium Manager issue in Next.js bundled environments
    // Use require() for CommonJS module compatibility in Next.js
    const chromedriver = require('chromedriver');
    
    // Get the path from chromedriver package - it should be absolute
    let chromedriverPath = chromedriver.path;
    
    // Ensure it's an absolute path
    if (!path.isAbsolute(chromedriverPath)) {
      chromedriverPath = path.resolve(chromedriverPath);
    }
    
    // Try the chromedriver.path first, then fallback to project node_modules
    const possiblePaths = [
      chromedriverPath,
      path.resolve(process.cwd(), 'node_modules', 'chromedriver', 'lib', 'chromedriver', process.platform === 'win32' ? 'chromedriver.exe' : 'chromedriver'),
    ];
    
    // Find the first path that exists (if fs.existsSync works in this environment)
    let foundPath = chromedriverPath; // Default to chromedriver.path
    try {
      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          foundPath = testPath;
          break;
        }
      }
    } catch {
      // If fs.existsSync fails, just use chromedriver.path
      // ServiceBuilder will throw a better error if the path is wrong
    }
    
    console.log(`[DEBUG] Using ChromeDriver at: ${foundPath}`);
    const service = new ServiceBuilder(foundPath);

    // Build the WebDriver
    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(chromeOptions)
      .setChromeService(service)
      .build();

    // Set timeouts - increase script timeout to prevent stealth script timeouts
    driver.manage().setTimeouts({
      implicit: 10000,
      pageLoad: 30000,
      script: 5000 // Reduce script timeout to fail fast if stealth script hangs
    });

    // Set window size
    await driver.manage().window().setRect({ width: 1920, height: 1080 });

    // CRITICAL: Comprehensive stealth script to bypass headless detection
    // Note: Execute this AFTER navigating to a page, not before
    // We'll execute it after the first page load

    // Construct the search query: "BusinessName FullAddress"
    const searchQuery = `${businessName} ${address}`;
    console.log(`[DEBUG] Searching for: ${searchQuery}`);

    // Navigate directly to Google
    await driver.get('https://www.google.com');
    
    // Wait for page to load
    await driver.wait(until.titleContains('Google'), 30000);
    
    // CRITICAL: Execute stealth script AFTER page load to avoid property redefinition errors
    // Chrome already defines window.chrome, so we need to check before redefining
    await driver.executeScript(`
      // Override the navigator.webdriver property (only if not already false)
      try {
        if (navigator.webdriver !== false) {
          Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
            configurable: true
          });
        }
      } catch (e) {
        // Property might already be defined, ignore
      }

      // Only override chrome if it doesn't exist or is incomplete
      try {
        if (!window.chrome || !window.chrome.runtime) {
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
            configurable: true
          });
        }
      } catch (e) {
        // Chrome object might already be defined, ignore
      }

      // Override permissions query
      try {
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(parameters)
        );
      } catch (e) {
        // Ignore if can't override
      }

      // Override plugins to mimic a real browser
      try {
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
          configurable: true
        });
      } catch (e) {
        // Ignore if can't override
      }

      // Override languages
      try {
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en', 'en-GB'],
          configurable: true
        });
      } catch (e) {
        // Ignore if can't override
      }

      // Override hardware concurrency
      try {
        Object.defineProperty(navigator, 'hardwareConcurrency', {
          get: () => 8,
          configurable: true
        });
      } catch (e) {
        // Ignore if can't override
      }

      // WebGL vendor/renderer
      try {
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37445) return 'Intel Inc.'; // VENDOR
          if (parameter === 37446) return 'Intel Iris OpenGL Engine'; // RENDERER
          return getParameter.call(this, parameter);
        };
      } catch (e) {
        // Ignore if can't override
      }
    `);
    
    console.log('[DEBUG] Stealth script executed, ready to interact');
    
    // Minimal delay before interacting (reduced from 1-3s to 0.3-0.8s)
    const interactionDelay = 300 + Math.random() * 500;
    await new Promise(resolve => setTimeout(resolve, interactionDelay));

    // Find the search box more reliably - try multiple selectors
    console.log('[DEBUG] Looking for search box...');
    let searchBox: WebElement;
    try {
      // Wait for search box to be visible and interactable
      searchBox = await driver.wait(until.elementLocated(By.css('textarea[name="q"], input[name="q"]')), 10000);
      await driver.wait(until.elementIsVisible(searchBox), 5000);
      console.log('[DEBUG] Search box found and visible');
    } catch (error) {
      console.error('[DEBUG] Error finding search box with primary selector:', error);
      // Fallback selector
      try {
        searchBox = await driver.findElement(By.css('textarea[name="q"]'));
        await driver.wait(until.elementIsVisible(searchBox), 5000);
        console.log('[DEBUG] Search box found with fallback selector');
      } catch (fallbackError) {
        console.error('[DEBUG] Error finding search box with fallback selector:', fallbackError);
        throw new Error('Could not find Google search box');
      }
    }
    
    // Scroll to search box to ensure it's in view
    await driver.executeScript('arguments[0].scrollIntoView({behavior: "smooth", block: "center"});', searchBox);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Click the search box with a small delay
    console.log('[DEBUG] Clicking search box...');
    await searchBox.click();
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Clear any existing text first
    await searchBox.clear();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Type like a human with optimized delays (reduced from 50-150ms to 30-80ms)
    console.log(`[DEBUG] Typing search query: ${searchQuery}`);
    for (const char of searchQuery) {
      await searchBox.sendKeys(char);
      await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 50));
    }
    
    // Reduced hesitation before pressing Enter (from 500-1500ms to 200-600ms)
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 400));
    console.log('[DEBUG] Pressing Enter to search...');
    await searchBox.sendKeys(Key.RETURN);
    
    // Wait for search results to load - check if title contains business name OR URL contains 'search'
    try {
      await driver.wait(async () => {
        const title = await driver.getTitle();
        const url = await driver.getCurrentUrl();
        return title.includes(businessName) || url.includes('search');
      }, 30000);
    } catch {
      // Continue even if wait times out - page might have loaded
      console.log('[DEBUG] Wait for search results timed out, continuing...');
    }
    
    // Minimal wait for GBP panel to render (reduced from 5000ms to 2000ms)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Try multiple strategies to find the GBP panel
    console.log('[DEBUG] Looking for GBP panel...');
    
    let gbpPanel: WebElement | null = null;
    let panelFound = false;
    
    // Strategy 1: Look for role="complementary" (knowledge panel)
    try {
      gbpPanel = await driver.wait(until.elementLocated(By.css('[role="complementary"]')), 2000);
      panelFound = true;
      console.log('[DEBUG] Strategy 1 - Panel found via role="complementary"');
    } catch {
      // Strategy 2: Look for common GBP panel classes/attributes
      try {
        gbpPanel = await driver.wait(until.elementLocated(By.css('.kp-blk, .kp-wholepage, [data-ved*="Cg"], [jsname="kno-fv"]')), 2000);
        panelFound = true;
        console.log('[DEBUG] Strategy 2 - Panel found via classes');
      } catch {
        // Strategy 3: Look for business name in a prominent position (usually in GBP)
        try {
          const businessNameElements = await driver.findElements(By.xpath(`//*[contains(text(), "${businessName}")]`));
          if (businessNameElements.length > 0) {
            // Find parent container that likely contains the GBP
            gbpPanel = await driver.findElement(By.xpath(`//*[contains(text(), "${businessName}")]/ancestor::*[@role="complementary" or contains(@class, "kp-") or contains(@data-ved, "")][1]`));
            panelFound = true;
            console.log('[DEBUG] Strategy 3 - Panel found via business name');
          }
        } catch {
          console.log('[DEBUG] GBP panel not found with any strategy');
        }
      }
    }

    if (!panelFound) {
      console.log(`[DEBUG] GBP panel not found. Trying to find Profiles section directly on page...`);
      // If panel not found, try to find Profiles section anywhere on the page
      try {
        const profilesOnPage = await driver.findElements(By.xpath('//*[contains(text(), "Profiles")]'));
        if (profilesOnPage.length > 0) {
          console.log(`[DEBUG] Found Profiles section without GBP panel`);
          // Continue with extraction from page
        } else {
          console.log(`[DEBUG] No Profiles section found. Returning empty result.`);
          return { socialLinks: [] };
        }
      } catch {
        console.log(`[DEBUG] No Profiles section found. Returning empty result.`);
        return { socialLinks: [] };
      }
    }

    // Look for "Profiles" section - try multiple approaches
    console.log('[DEBUG] Looking for Profiles section...');
    let profilesSection: WebElement | null = null;
    let profilesFound = false;
    
    try {
      profilesSection = await driver.wait(until.elementLocated(By.xpath('//*[contains(text(), "Profiles")]')), 2000);
      profilesFound = true;
      console.log('[DEBUG] Profiles section found!');
    } catch {
      console.log('[DEBUG] Profiles text not found. Searching for social links directly...');
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
      try {
        const links = await driver.findElements(By.css(selector));
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
      } catch (error) {
        console.log(`[DEBUG] Error finding links with selector ${selector}:`, error);
      }
    }

    // Strategy 2: If Profiles section was found, look for links near it
    if (profilesFound && socialLinks.length === 0 && profilesSection) {
      console.log('[DEBUG] Profiles found but no links yet. Searching near Profiles section...');
      
      try {
        // Find the Profiles container and look for links within it
        const profilesContainer = await driver.findElement(By.xpath('//*[contains(text(), "Profiles")]/ancestor::*[contains(@class, "section") or contains(@data-ved, "")][1]'));
        const containerLinks = await profilesContainer.findElements(By.css('a[href]'));
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
      } catch (error) {
        console.log('[DEBUG] Error searching near Profiles section:', error);
      }
    }

    console.log(`[DEBUG] Total social links found: ${socialLinks.length}`);
    
    // Return only social links (website URL comes from GBP API, not scraping)
    return { socialLinks };

  } catch (error) {
    console.error('[ERROR] Error extracting social links from GBP:', error);
    if (error instanceof Error) {
      console.error('[ERROR] Error message:', error.message);
      console.error('[ERROR] Error stack:', error.stack);
    }
    
    // Driver will quit in finally block - no need to keep it open on error
    
    return { socialLinks: [] };
  } finally {
    // Always quit the driver to free resources
    if (driver) {
      try {
        await driver.quit();
      } catch (err) {
        console.error('Error quitting driver:', err);
      }
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

    // CRITICAL: Prevent duplicate execution using in-memory cache
    if (scanId) {
      const cached = scraperCache.get(scanId);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/scan/socials/route.ts:834',message:'Cache check',data:{scanId,hasCache:!!cached,cacheStatus:cached?.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      if (cached) {
        if (cached.status === 'completed' && cached.result) {
          // Already completed, return cached result immediately
          console.log(`[API] Returning cached result for scanId: ${scanId}`);
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/scan/socials/route.ts:840',message:'Returning cached result (completed)',data:{scanId,hasWebsiteScreenshot:!!cached.result.websiteScreenshot,socialLinksCount:cached.result.socialLinks?.length,socialLinksWithScreenshots:cached.result.socialLinks?.filter((l:any)=>l.screenshot)?.length,cacheStatus:'completed'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          return NextResponse.json(cached.result, { status: 200 });
        } else if (cached.status === 'running' && cached.promise) {
          // Already running, wait for existing promise
          console.log(`[API] Scraper already running for scanId: ${scanId}, waiting for completion...`);
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/scan/socials/route.ts:844',message:'Waiting for running scraper',data:{scanId,cacheStatus:'running'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          try {
            const result = await cached.promise;
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/scan/socials/route.ts:756',message:'Running scraper completed, returning result',data:{scanId,hasWebsiteScreenshot:!!result.websiteScreenshot,socialLinksCount:result.socialLinks?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
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
      // Call the extraction function (only extracts social links, not website URL)
      console.log(`[API] Starting Selenium extraction for: ${businessName}, ${address}`);
      const extractionResult = await extractSocialLinksFromGBP(businessName, address);
      console.log(`[API] Selenium extraction complete. Raw links found: ${extractionResult.socialLinks.length}`);

    // Clean and deduplicate the links
    const socialLinks = cleanAndDeduplicateSocialLinks(extractionResult.socialLinks);
    console.log(`[API] After cleaning/deduplication: ${socialLinks.length} links`);

    // Use website URL from GBP API (providedWebsiteUrl) instead of scraping it
    const websiteUrl = providedWebsiteUrl || null;

    // Now capture screenshots in parallel after links are extracted
    const screenshotPromises: Promise<{ platform: string; url: string; screenshot: string | null; status: 'success' | 'error' } | { websiteScreenshot: string | null }>[] = [];
    
    // Capture mobile screenshots for social media links
    for (const link of socialLinks) {
      screenshotPromises.push(
        captureSocialScreenshot(link.platform, link.url, 'mobile')
      );
    }

    // Capture website screenshot (desktop) if website URL exists (from GBP API)
    if (websiteUrl) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/scan/socials/route.ts:888',message:'Adding website screenshot to promises',data:{scanId,websiteUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
      // #endregion
      screenshotPromises.push(
        captureSocialScreenshot('website', websiteUrl, 'desktop')
      );
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/scan/socials/route.ts:892',message:'No website URL provided from GBP API',data:{scanId,providedWebsiteUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
      // #endregion
    }

    // Execute all screenshot captures in parallel
    const screenshotResults = await Promise.allSettled(screenshotPromises);

    // Process screenshot results
    const socialScreenshots: Array<{ platform: string; url: string; screenshot: string | null; status: 'success' | 'error' }> = [];
    let websiteScreenshot: string | null = null;

    for (const settledResult of screenshotResults) {
      if (settledResult.status === 'fulfilled') {
        const result = settledResult.value;
        if ('platform' in result) {
          // Social media screenshot
          socialScreenshots.push(result);
        } else if ('websiteScreenshot' in result) {
          // Website screenshot
          websiteScreenshot = result.websiteScreenshot;
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/scan/socials/route.ts:909',message:'Website screenshot received',data:{scanId,hasWebsiteScreenshot:!!websiteScreenshot,websiteScreenshotLength:websiteScreenshot?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
          // #endregion
        }
      } else {
        console.error('Screenshot capture failed:', settledResult.reason);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/scan/socials/route.ts:915',message:'Screenshot capture failed',data:{scanId,error:settledResult.reason instanceof Error ? settledResult.reason.message : 'Unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
        // #endregion
      }
    }

      // Return complete results with screenshots
      const result = {
        success: true,
        businessName,
        address,
        socialLinks: socialScreenshots,
        websiteUrl: websiteUrl, // Use website URL from GBP API
        websiteScreenshot,
        count: socialLinks.length,
        rawCount: extractionResult.socialLinks.length,
        scanId,
      };

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/scan/socials/route.ts:907',message:'Scraper result prepared',data:{scanId,hasWebsiteScreenshot:!!websiteScreenshot,socialLinksCount:socialScreenshots.length,socialLinksWithScreenshots:socialScreenshots.filter((l:any)=>l.screenshot).length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      // Cache the result
      // CRITICAL: Update cache to 'completed' status BEFORE storing metadata in localStorage
      // This ensures the cache is ready when StageOnlinePresence tries to fetch
      if (scanId) {
        scraperCache.set(scanId, { status: 'completed', result });
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/scan/socials/route.ts:922',message:'Result cached with completed status',data:{scanId,resultKeys:Object.keys(result),hasWebsiteScreenshot:!!result.websiteScreenshot,socialLinksCount:result.socialLinks?.length,socialLinksWithScreenshots:result.socialLinks?.filter((l:any)=>l.screenshot)?.length,cacheStatus:'completed'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        // Clean up cache after 1 hour to prevent memory leaks
        setTimeout(() => {
          scraperCache.delete(scanId);
        }, 3600000); // 1 hour
      }

      return result;
    })();

    // Store the promise in cache if scanId exists
    // CRITICAL: Only set to "running" if cache doesn't already exist or is not "completed"
    // This prevents overwriting a completed cache with a new "running" status
    if (scanId) {
      const existingCache = scraperCache.get(scanId);
      if (!existingCache || existingCache.status !== 'completed') {
        scraperCache.set(scanId, { status: 'running', promise: scraperPromise });
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/scan/socials/route.ts:870',message:'Setting cache to running status',data:{scanId,hadExistingCache:!!existingCache,existingCacheStatus:existingCache?.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
      } else {
        // Cache already completed, return it immediately instead of starting new scraper
        console.log(`[API] Cache already completed for scanId: ${scanId}, returning cached result`);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/scan/socials/route.ts:876',message:'Cache already completed, returning without starting new scraper',data:{scanId,hasWebsiteScreenshot:!!existingCache.result?.websiteScreenshot,socialLinksCount:existingCache.result?.socialLinks?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        return NextResponse.json(existingCache.result, { status: 200 });
      }
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
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error occurred"
      },
      { status: 500 }
    );
  }
}

