/**
 * Social Media Profile Screenshot API
 * 
 * Takes screenshots of social media profiles using Playwright.
 * Supports desktop and mobile viewports.
 */

import { NextRequest, NextResponse } from "next/server";
import { chromium, Browser, Page } from "playwright";

// Viewport configurations
const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  mobile: { width: 375, height: 812 }
};

// User agents for different viewports
const USER_AGENTS = {
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
};

// Timeout configuration
const TIMEOUT_MS = 30000; // 30 seconds

/**
 * Dismisses popups and modals for social media platforms (Instagram and Facebook only)
 */
async function dismissSocialMediaPopups(page: Page, platform: string): Promise<void> {
  console.log(`[SCREENSHOT] Checking for ${platform} popups...`);
  
  // Platform-specific selectors
  const platformSelectors: Record<string, string[]> = {
    instagram: [
      // Instagram: Click the parent div that contains the Close SVG
      'div[role="button"]:has(svg[aria-label="Close"])',
      'svg[aria-label="Close"]',
      'div[role="button"] svg[aria-label="Close"]',
    ],
    facebook: [
      // Facebook: Close button with aria-label="Close" and role="button"
      'div[role="button"][aria-label="Close"]',
      'div[role="button"][aria-label="Close"] span',
      // Facebook also uses data-action-id for close buttons
      'div[role="button"][data-action-id]',
    ],
  };

  // Common selectors for all platforms
  const commonSelectors = [
    'button[aria-label="Close"]',
    'button:has-text("Close")',
    '[aria-label="Close"]',
    // "Not Now" buttons
    'button:has-text("Not Now")',
    'button:has-text("Not now")',
    'div[role="button"]:has-text("Not Now")',
    'div[role="button"]:has-text("Not now")',
    // Generic close buttons
    '[data-testid*="close"]',
    '[data-testid*="dismiss"]',
    // Escape key target (modals/dialogs)
    '[role="dialog"] button[aria-label*="Close"]',
  ];

  // Combine platform-specific and common selectors
  const closeSelectors = [
    ...(platformSelectors[platform] || []),
    ...commonSelectors,
  ];

  // Try each selector
  for (const selector of closeSelectors) {
    try {
      const element = page.locator(selector).first();
      const isVisible = await element.isVisible({ timeout: 1000 }).catch(() => false);
      
      if (isVisible) {
        console.log(`[SCREENSHOT] Found popup, attempting to close with selector: ${selector}`);
        await element.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(500);
        console.log(`[SCREENSHOT] Popup closed successfully`);
        break;
      }
    } catch (error) {
      // Continue to next selector
      continue;
    }
  }

  // Also try pressing Escape key for modals
  try {
    const dialog = page.locator('[role="dialog"]').first();
    const dialogVisible = await dialog.isVisible({ timeout: 1000 }).catch(() => false);
    
    if (dialogVisible) {
      console.log(`[SCREENSHOT] Found dialog, pressing Escape key`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  } catch {
    // No dialog found or error, continue
  }

  // Wait a bit for popup animations to complete
  await page.waitForTimeout(1000);
  
  // Verify popup is gone by checking if close button still exists (platform-specific)
  try {
    let closeButtonStillVisible = false;
    
    if (platform === 'instagram') {
      closeButtonStillVisible = await page.locator('div[role="button"] svg[aria-label="Close"]').first().isVisible({ timeout: 500 }).catch(() => false);
    } else if (platform === 'facebook') {
      closeButtonStillVisible = await page.locator('div[role="button"][aria-label="Close"]').first().isVisible({ timeout: 500 }).catch(() => false);
    } else {
      // Generic check
      closeButtonStillVisible = await page.locator('[aria-label="Close"]').first().isVisible({ timeout: 500 }).catch(() => false);
    }
    
    if (closeButtonStillVisible) {
      console.log(`[SCREENSHOT] Popup still visible, trying Escape key again`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }
  } catch {
    // Ignore errors in verification
  }
  
  console.log(`[SCREENSHOT] Popup dismissal complete`);
}

/**
 * Removes Facebook login/signup prompt element
 * Targets the specific container div that contains the login/signup prompt
 */
async function removeFacebookLoginPrompt(page: Page): Promise<void> {
  console.log(`[SCREENSHOT] Checking for Facebook login/signup prompt...`);
  
  // Multiple strategies to find and remove the login prompt container
  // The container has specific classes and contains the text "Log in or sign up for Facebook to connect with friends, family and people you know."
  
  // Strategy 1: Find by the specific text content
  try {
    const textElement = page.locator('text=/Log in or sign up for Facebook to connect with friends, family and people you know/i').first();
    const textVisible = await textElement.isVisible({ timeout: 1000 }).catch(() => false);
    
    if (textVisible) {
      console.log(`[SCREENSHOT] Found login prompt by text, finding parent container...`);
      // Find the outermost container div with class "x78zum5" that contains this text
      const parentContainer = textElement.locator('xpath=ancestor::div[contains(@class, "x78zum5") and contains(@class, "xdt5ytf") and contains(@class, "x2lah0s")][1]').first();
      const containerExists = await parentContainer.count() > 0;
      
      if (containerExists) {
        await parentContainer.evaluate((el) => el.remove());
        console.log(`[SCREENSHOT] Facebook login prompt removed via text search`);
        await page.waitForTimeout(500);
        return;
      }
    }
  } catch (error) {
    console.log(`[SCREENSHOT] Text search failed, trying other methods...`);
  }

  // Strategy 2: Find by aria-labels on the links
  try {
    const loginLink = page.locator('a[aria-label="Log in"]').first();
    const signupLink = page.locator('a[aria-label="Create new account"]').first();
    
    const loginVisible = await loginLink.isVisible({ timeout: 1000 }).catch(() => false);
    const signupVisible = await signupLink.isVisible({ timeout: 1000 }).catch(() => false);
    
    if (loginVisible && signupVisible) {
      console.log(`[SCREENSHOT] Found login and signup links, finding common parent container...`);
      // Find the common parent container that contains both links
      const loginParent = loginLink.locator('xpath=ancestor::div[contains(@class, "x78zum5")][1]').first();
      const signupParent = signupLink.locator('xpath=ancestor::div[contains(@class, "x78zum5")][1]').first();
      
      // Try to find the outermost container that contains both
      const commonContainer = page.locator('div:has(a[aria-label="Log in"]):has(a[aria-label="Create new account"])').first();
      const containerExists = await commonContainer.count() > 0;
      
      if (containerExists) {
        // Find the outermost parent with the specific classes
        const outerContainer = commonContainer.locator('xpath=ancestor::div[contains(@class, "x78zum5") and contains(@class, "xdt5ytf")][1]').first();
        if (await outerContainer.count() > 0) {
          await outerContainer.evaluate((el) => el.remove());
          console.log(`[SCREENSHOT] Facebook login prompt removed via link search`);
          await page.waitForTimeout(500);
          return;
        } else {
          // Fallback: remove the common container directly
          await commonContainer.evaluate((el) => el.remove());
          console.log(`[SCREENSHOT] Facebook login prompt removed (common container)`);
          await page.waitForTimeout(500);
          return;
        }
      }
    }
  } catch (error) {
    console.log(`[SCREENSHOT] Link search failed, trying fallback...`);
  }

  // Strategy 3: Find by div containing both login and signup links
  try {
    const containerSelector = 'div:has(a[aria-label="Log in"]):has(a[aria-label="Create new account"])';
    const container = page.locator(containerSelector).first();
    const containerVisible = await container.isVisible({ timeout: 1000 }).catch(() => false);
    
    if (containerVisible) {
      console.log(`[SCREENSHOT] Found container with login/signup links, removing...`);
      // Find the outermost parent with class "x78zum5"
      const outerContainer = container.locator('xpath=ancestor::div[contains(@class, "x78zum5")][last()]').first();
      if (await outerContainer.count() > 0) {
        await outerContainer.evaluate((el) => el.remove());
        console.log(`[SCREENSHOT] Facebook login prompt removed (outermost container)`);
        await page.waitForTimeout(500);
        return;
      } else {
        await container.evaluate((el) => el.remove());
        console.log(`[SCREENSHOT] Facebook login prompt removed (direct container)`);
        await page.waitForTimeout(500);
        return;
      }
    }
  } catch (error) {
    console.log(`[SCREENSHOT] Container search failed`);
  }

  console.log(`[SCREENSHOT] Facebook login prompt removal complete`);
}

/**
 * Removes Instagram signup/login prompts and "Open app" link
 * Works for both desktop and mobile viewports
 * Must be called in this specific order:
 * 1. Remove "Get the full experience" / "Sign up for Instagram" div
 * 2. Remove "Log in" link
 * 3. Remove "Open app" link
 */
async function removeInstagramPrompts(page: Page): Promise<void> {
  console.log(`[SCREENSHOT] Removing Instagram prompts and links...`);
  
  // Step 1: Remove "Get the full experience" / "Sign up for Instagram" div
  // Target the container div with class "html-div" that contains both the span and the signup link
  try {
    const signupSelectors = [
      // Most specific: div with html-div class containing both elements
      'div.html-div:has(span:has-text("Get the full experience")):has(a:has-text("Sign up for Instagram"))',
      // Alternative: find by span text and check for signup link
      'div:has(span:has-text("Get the full experience")):has(a[href*="/accounts/signup/"])',
      // Fallback: just find div with signup link
      'div:has(a:has-text("Sign up for Instagram"))',
      'div:has(a[href*="/accounts/signup/phone"])',
    ];

    for (const selector of signupSelectors) {
      try {
        const element = page.locator(selector).first();
        const isVisible = await element.isVisible({ timeout: 1000 }).catch(() => false);
        
        if (isVisible) {
          console.log(`[SCREENSHOT] Found "Get the full experience" div, removing...`);
          await element.evaluate((el) => el.remove());
          console.log(`[SCREENSHOT] "Get the full experience" div removed`);
          await page.waitForTimeout(300);
          break;
        }
      } catch {
        continue;
      }
    }
  } catch (error) {
    console.log(`[SCREENSHOT] Error removing signup prompt:`, error);
  }

  // Step 2: Remove "Log in" link
  // Target the link with href containing "/accounts/login/" and text "Log in"
  try {
    const loginSelectors = [
      // Most specific: link with login URL and "Log in" text
      'a[href*="/accounts/login/"]:has-text("Log in")',
      'a[href*="/accounts/login/?next"]:has-text("Log in")',
      // Alternative: find by text and check href
      'a:has-text("Log in")[href*="/accounts/login/"]',
      // Fallback: any link with login URL
      'a[href*="/accounts/login/"]',
    ];

    for (const selector of loginSelectors) {
      try {
        const element = page.locator(selector).first();
        const isVisible = await element.isVisible({ timeout: 1000 }).catch(() => false);
        
        if (isVisible) {
          console.log(`[SCREENSHOT] Found "Log in" link, removing...`);
          await element.evaluate((el) => el.remove());
          console.log(`[SCREENSHOT] "Log in" link removed`);
          await page.waitForTimeout(300);
          break;
        }
      } catch {
        continue;
      }
    }
  } catch (error) {
    console.log(`[SCREENSHOT] Error removing login link:`, error);
  }

  // Step 3: Remove "Open app" link
  // Target the link with href containing "applink.instagram.com" and text "Open app"
  try {
    const openAppSelectors = [
      // Most specific: link with applink URL and "Open app" text
      'a[href*="applink.instagram.com"]:has-text("Open app")',
      'a:has-text("Open app")[href*="applink.instagram.com"]',
      // Alternative: any link with applink URL
      'a[href*="applink.instagram.com"]',
      // Fallback: find by text
      'a:has-text("Open app")',
    ];

    for (const selector of openAppSelectors) {
      try {
        const element = page.locator(selector).first();
        const isVisible = await element.isVisible({ timeout: 1000 }).catch(() => false);
        
        if (isVisible) {
          console.log(`[SCREENSHOT] Found "Open app" link, removing...`);
          await element.evaluate((el) => el.remove());
          console.log(`[SCREENSHOT] "Open app" link removed`);
          await page.waitForTimeout(300);
          break;
        }
      } catch {
        continue;
      }
    }
  } catch (error) {
    console.log(`[SCREENSHOT] Error removing "Open app" link:`, error);
  }

  console.log(`[SCREENSHOT] Instagram prompts removal complete`);
}

/**
 * Sets up stealth properties on a page to avoid detection
 * CRITICAL: Comprehensive stealth script to bypass headless detection
 */
async function setupStealth(page: Page): Promise<void> {
  // CRITICAL: Comprehensive stealth script to bypass headless detection
  await page.addInitScript(() => {
    // Override the navigator.webdriver property
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });

    // Override chrome object
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: any) => (
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : originalQuery(parameters)
    );

    // Mock Chrome runtime
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

    // Override plugins to mimic a real browser
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });

    // Override languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en', 'en-GB'],
    });

    // Override hardware concurrency
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 8,
    });

    // WebGL vendor/renderer
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
      if (parameter === 37445) return 'Intel Inc.'; // VENDOR
      if (parameter === 37446) return 'Intel Iris OpenGL Engine'; // RENDERER
      return getParameter.call(this, parameter);
    };
  });

  // Set realistic HTTP headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  });
}

/**
 * Takes a screenshot of a social media profile
 */
async function captureScreenshot(
  url: string,
  viewport: 'desktop' | 'mobile',
  platformParam?: string
): Promise<{ success: boolean; screenshot?: string; error?: string }> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    console.log(`[SCREENSHOT] Starting capture for ${viewport} viewport`);
    console.log(`[SCREENSHOT] URL: ${url}`);

    // Launch browser with UNDETECTABLE headless mode
    // Note: Playwright's headless: true uses the new headless mode by default (more stealthy than old headless)
    browser = await chromium.launch({
      headless: true,
      args: [
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
        '--use-mock-keychain',
      ],
      timeout: TIMEOUT_MS
    });

    console.log(`[SCREENSHOT] Browser launched successfully`);

    // Create context with appropriate viewport and user agent
    const viewportConfig = VIEWPORTS[viewport];
    const userAgent = USER_AGENTS[viewport];

    const context = await browser.newContext({
      viewport: viewportConfig,
      userAgent: userAgent,
      // Add device scale factor to look more realistic
      deviceScaleFactor: 1,
      isMobile: viewport === 'mobile',
      hasTouch: viewport === 'mobile',
      // Disable JavaScript-based detection
      javaScriptEnabled: true,
      // Add permissions
      permissions: ['geolocation'],
    });

    console.log(`[SCREENSHOT] Context created: ${viewportConfig.width}x${viewportConfig.height}`);

    // Set timeouts
    context.setDefaultNavigationTimeout(TIMEOUT_MS);
    context.setDefaultTimeout(TIMEOUT_MS);

    page = await context.newPage();
    page.setDefaultNavigationTimeout(TIMEOUT_MS);
    page.setDefaultTimeout(TIMEOUT_MS);

    // Apply stealth techniques
    await setupStealth(page);
    console.log(`[SCREENSHOT] Stealth setup complete`);

    // Validate and normalize URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    
    console.log(`[SCREENSHOT] Navigating to ${normalizedUrl}...`);
    console.log(`[SCREENSHOT] Original URL was: ${url}`);
    const startTime = Date.now();
    
    try {
      const response = await page.goto(normalizedUrl, {
        waitUntil: 'domcontentloaded', // Changed from 'networkidle' to 'domcontentloaded' for faster initial load
        timeout: TIMEOUT_MS
      });

      const navigationTime = Date.now() - startTime;
      console.log(`[SCREENSHOT] Navigation completed in ${navigationTime}ms`);

      // Check response status
      if (response) {
        const status = response.status();
        console.log(`[SCREENSHOT] Response status: ${status}`);
        
        if (status >= 400) {
          return {
            success: false,
            error: `HTTP ${status}: Failed to load page`
          };
        }
      }

      // Check if page loaded correctly
      const currentUrl = page.url();
      console.log(`[SCREENSHOT] Current URL after navigation: ${currentUrl}`);
      
      if (!currentUrl || currentUrl === 'about:blank' || currentUrl.startsWith('chrome-error://')) {
        return {
          success: false,
          error: `Page navigation failed - invalid URL after navigation: ${currentUrl}`
        };
      }

      // Wait for page to be fully loaded
      console.log(`[SCREENSHOT] Waiting for page to load...`);
      await page.waitForLoadState('domcontentloaded', { timeout: TIMEOUT_MS });
      
      // Wait for network to be idle (but with shorter timeout)
      try {
        await page.waitForLoadState('networkidle', { timeout: 15000 });
      } catch (e) {
        console.log(`[SCREENSHOT] Network idle timeout, proceeding anyway`);
      }
      
      // Additional wait for dynamic content (social media pages often load content dynamically)
      await page.waitForTimeout(3000);
      console.log(`[SCREENSHOT] Page load complete`);
    } catch (navigationError) {
      console.error(`[SCREENSHOT] Navigation error:`, navigationError);
      const currentUrl = page.url();
      console.log(`[SCREENSHOT] Current URL after error: ${currentUrl}`);
      
      if (currentUrl === 'about:blank' || currentUrl.startsWith('chrome-error://')) {
        return {
          success: false,
          error: `Navigation failed: ${navigationError instanceof Error ? navigationError.message : 'Unknown error'}`
        };
      }
      // If we got somewhere, continue anyway
    }

    // Wait for content to be visible (platform-specific selectors)
    const contentSelectors = [
      'body',
      'main',
      '[role="main"]',
      'article',
      'div[class*="main"]',
      'div[class*="content"]'
    ];

    let contentFound = false;
    for (const selector of contentSelectors) {
      try {
        const element = page.locator(selector).first();
        const isVisible = await element.isVisible({ timeout: 5000 }).catch(() => false);
        if (isVisible) {
          contentFound = true;
          console.log(`[SCREENSHOT] Content found using selector: ${selector}`);
          break;
        }
      } catch {
        // Continue to next selector
      }
    }

    if (!contentFound) {
      console.log(`[SCREENSHOT] Warning: No content selectors found, proceeding anyway`);
    }

    // Verify page actually loaded content (not just blank page)
    try {
      const pageContent = await page.content();
      const bodyText = await page.locator('body').textContent().catch(() => '');
      
      if (!pageContent || pageContent.length < 100 || (bodyText && bodyText.length < 10)) {
        console.log(`[SCREENSHOT] Warning: Page content seems empty (${pageContent?.length || 0} chars, body: ${bodyText?.length || 0} chars)`);
        // Don't fail, but log warning - some pages might load content dynamically
      } else {
        console.log(`[SCREENSHOT] Page content verified: ${pageContent.length} chars, body: ${bodyText?.length || 0} chars`);
      }
    } catch (e) {
      console.log(`[SCREENSHOT] Could not verify page content:`, e);
    }

    // Dismiss popups for social media platforms (only Instagram and Facebook supported)
    // Use platformParam if provided, otherwise detect from URL
    let platform = platformParam || 'unknown';
    if (platform === 'unknown') {
      if (url.includes('instagram.com')) {
        platform = 'instagram';
      } else if (url.includes('facebook.com')) {
        platform = 'facebook';
      } else {
        platform = 'website';
      }
    }

    if (platform === 'instagram' || platform === 'facebook') {
      console.log(`[SCREENSHOT] ${platform} detected, dismissing popups...`);
      await dismissSocialMediaPopups(page, platform);
      
      // Platform-specific element removal
      if (platform === 'facebook') {
        await removeFacebookLoginPrompt(page);
      } else if (platform === 'instagram') {
        await removeInstagramPrompts(page);
      }
    }

    // Take screenshot
    // For mobile: capture only viewport (typical phone screen height)
    // For desktop social media: capture full page
    // For desktop websites: capture only viewport (typical desktop screen height)
    const isMobile = viewport === 'mobile';
    const isWebsite = platform === 'website';
    const useFullPage = !isMobile && !isWebsite; // Full-page only for desktop social media, viewport for everything else
    
    console.log(`[SCREENSHOT] Capturing ${useFullPage ? 'full-page' : 'viewport'} screenshot...`);
    const screenshotStartTime = Date.now();
    
    const screenshotBuffer = await page.screenshot({
      fullPage: useFullPage,
      timeout: TIMEOUT_MS
    });

    const screenshotTime = Date.now() - screenshotStartTime;
    console.log(`[SCREENSHOT] Screenshot captured in ${screenshotTime}ms`);

    // Convert to base64
    const base64Screenshot = screenshotBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Screenshot}`;
    
    console.log(`[SCREENSHOT] Screenshot converted to base64 (${base64Screenshot.length} chars)`);
    console.log(`[SCREENSHOT] ✅ Screenshot capture successful`);

    return {
      success: true,
      screenshot: dataUrl
    };

  } catch (error) {
    console.error(`[SCREENSHOT] ❌ Error capturing screenshot:`, error);
    
    if (error instanceof Error) {
      console.error(`[SCREENSHOT] Error message: ${error.message}`);
      console.error(`[SCREENSHOT] Error stack: ${error.stack}`);
      
      // Check for timeout errors
      if (error.message.includes('timeout') || error.message.includes('Timeout')) {
        return {
          success: false,
          error: `Timeout: Page took longer than ${TIMEOUT_MS}ms to load`
        };
      }
      
      return {
        success: false,
        error: error.message
      };
    }
    
    return {
      success: false,
      error: 'Unknown error occurred during screenshot capture'
    };
  } finally {
    // Always close browser and page
    try {
      if (page) {
        await page.close().catch((err) => {
          console.error(`[SCREENSHOT] Error closing page:`, err);
        });
      }
    } catch (err) {
      console.error(`[SCREENSHOT] Error in page cleanup:`, err);
    }

    try {
      if (browser) {
        await browser.close().catch((err) => {
          console.error(`[SCREENSHOT] Error closing browser:`, err);
        });
        console.log(`[SCREENSHOT] Browser closed`);
      }
    } catch (err) {
      console.error(`[SCREENSHOT] Error in browser cleanup:`, err);
    }
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    console.log(`[API] POST /api/scan/socials/screenshot - Request received`);

    // Parse request body
    const body = await request.json();
    const { platform, url, viewport = 'desktop' } = body;

    console.log(`[API] Request body:`, { platform, url, viewport });

    // Validate required parameters
    if (!platform || !url) {
      console.error(`[API] ❌ Missing required parameters`);
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required parameters',
          message: 'Both "platform" and "url" are required'
        },
        { status: 400 }
      );
    }

    // Validate viewport
    if (viewport !== 'desktop' && viewport !== 'mobile') {
      console.error(`[API] ❌ Invalid viewport: ${viewport}`);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid viewport',
          message: 'Viewport must be either "desktop" or "mobile"'
        },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      console.error(`[API] ❌ Invalid URL format: ${url}`);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid URL format',
          message: 'The provided URL is not valid'
        },
        { status: 400 }
      );
    }

    console.log(`[API] Parameters validated, starting screenshot capture...`);

    // Capture screenshot
    const result = await captureScreenshot(url, viewport, platform);

    const totalTime = Date.now() - startTime;
    console.log(`[API] Total request time: ${totalTime}ms`);

    if (!result.success) {
      console.error(`[API] ❌ Screenshot capture failed: ${result.error}`);
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Screenshot capture failed',
          platform,
          url,
          viewport,
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      );
    }

    // Success response
    console.log(`[API] ✅ Screenshot captured successfully`);
    return NextResponse.json(
      {
        success: true,
        screenshot: result.screenshot,
        platform,
        url,
        viewport,
        timestamp: new Date().toISOString()
      },
      { status: 200 }
    );

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[API] ❌ Error in POST /api/scan/socials/screenshot:`, error);
    console.error(`[API] Request failed after ${totalTime}ms`);

    if (error instanceof Error) {
      console.error(`[API] Error message: ${error.message}`);
      console.error(`[API] Error stack: ${error.stack}`);
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

