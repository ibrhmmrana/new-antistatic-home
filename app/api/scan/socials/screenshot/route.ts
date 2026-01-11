/**
 * Social Media Profile Screenshot API
 * 
 * Takes screenshots of social media profiles using Playwright.
 * Supports desktop and mobile viewports.
 */

import { NextRequest, NextResponse } from "next/server";
import { chromium as pwChromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";
import chromium from "@sparticuz/chromium";

// Force Node.js runtime (Playwright is not compatible with Edge runtime)
export const runtime = "nodejs";

// Viewport configurations
const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  // Mobile viewport: phone-sized but will use DESKTOP UA to avoid "open in app" prompts
  mobile: { width: 390, height: 844 }, // iPhone 14 Pro dimensions
  website: { width: 1440, height: 900 }, // Cleaner viewport for business websites
};

// User agents - ALL use desktop Chrome UA to avoid mobile-app interstitials
// Even mobile viewport uses desktop UA (like Chrome DevTools responsive mode)
const USER_AGENTS = {
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  // IMPORTANT: Mobile uses DESKTOP UA to get web experience, not "open in app" prompts
  mobile: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  website: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};

// Timeout configuration
const TIMEOUT_MS = 30000; // 30 seconds

/**
 * Simple, clean website screenshot capture.
 * Uses a straightforward approach without complex stealth scripts.
 * Best for business websites that don't have aggressive bot detection.
 */
async function captureWebsiteScreenshot(
  url: string
): Promise<{ success: boolean; screenshot?: string; error?: string }> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    console.log(`[SCREENSHOT] Starting simple website capture for: ${url}`);

    const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    const localExecutablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
    const executablePath = isServerless
      ? await chromium.executablePath()
      : (localExecutablePath || undefined);

    // Launch browser with minimal args
    browser = await pwChromium.launch({
      headless: chromium.headless,
      args: chromium.args,
      executablePath,
      timeout: TIMEOUT_MS,
    });

    // Create page with clean 1440x900 viewport
    page = await browser.newPage({
      viewport: VIEWPORTS.website,
      userAgent: USER_AGENTS.website,
    });

    // Normalize URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    console.log(`[SCREENSHOT] Navigating to ${normalizedUrl}...`);

    // Simple navigation with networkidle wait
    await page.goto(normalizedUrl, {
      waitUntil: 'networkidle',
      timeout: TIMEOUT_MS,
    });

    // Brief wait for any final rendering
    await page.waitForTimeout(1000);

    console.log(`[SCREENSHOT] Taking viewport screenshot...`);

    // Viewport-only screenshot (not full page)
    const screenshotBuffer = await page.screenshot({
      fullPage: false,
      timeout: TIMEOUT_MS,
    });

    // Convert to base64
    const base64Screenshot = screenshotBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Screenshot}`;

    console.log(`[SCREENSHOT] ✅ Website screenshot captured (${base64Screenshot.length} chars)`);

    return {
      success: true,
      screenshot: dataUrl,
    };
  } catch (error) {
    console.error(`[SCREENSHOT] ❌ Website screenshot failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  } finally {
    await page?.close().catch(() => {});
    await browser?.close().catch(() => {});
    console.log(`[SCREENSHOT] Browser closed`);
  }
}

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
  
  // Strategy 0 (MOST AGGRESSIVE): Use JavaScript to find and remove login prompts directly
  // This catches all variants of the login/signup prompt
  try {
    const removed = await page.evaluate(() => {
      let removedCount = 0;
      
      // Find all "Log in" links by aria-label
      const loginLinks = Array.from(document.querySelectorAll('a[aria-label="Log in"]'));
      
      for (const loginLink of loginLinks) {
        // Walk up the DOM to find the outermost container with class "x78zum5"
        let current = loginLink.parentElement;
        let lastMatchingContainer: HTMLElement | null = null;
        
        while (current && current !== document.body) {
          // Check if this element has the characteristic Facebook container classes
          if (current.classList.contains('x78zum5') && current.classList.contains('xdt5ytf')) {
            lastMatchingContainer = current as HTMLElement;
          }
          current = current.parentElement;
        }
        
        // Remove the outermost matching container
        if (lastMatchingContainer) {
          lastMatchingContainer.remove();
          removedCount++;
        }
      }
      
      // Also look for "Create new account" links and remove their containers
      const signupLinks = Array.from(document.querySelectorAll('a[aria-label="Create new account"]'));
      for (const signupLink of signupLinks) {
        let current = signupLink.parentElement;
        let lastMatchingContainer: HTMLElement | null = null;
        
        while (current && current !== document.body) {
          if (current.classList.contains('x78zum5') && current.classList.contains('xdt5ytf')) {
            lastMatchingContainer = current as HTMLElement;
          }
          current = current.parentElement;
        }
        
        if (lastMatchingContainer) {
          lastMatchingContainer.remove();
          removedCount++;
        }
      }
      
      return removedCount;
    });
    
    if (removed > 0) {
      console.log(`[SCREENSHOT] ✅ Removed ${removed} Facebook login prompt container(s) via JS evaluation`);
      await page.waitForTimeout(300);
      return;
    }
  } catch (error) {
    console.log(`[SCREENSHOT] JS evaluation failed, trying other methods...`);
  }
  
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
 * Detects if we're on an Instagram login page and logs in if credentials are available
 * Returns true if login was performed, false otherwise
 */
async function handleInstagramLoginIfNeeded(page: Page): Promise<boolean> {
  console.log(`[SCREENSHOT] Checking for Instagram login page...`);
  
  // Check for login form indicators using the exact selectors
  const loginDetected = await page.evaluate(() => {
    const usernameInput = document.querySelector('input[name="username"][aria-label*="Phone number, username, or email"]') as HTMLInputElement;
    const passwordInput = document.querySelector('input[name="password"][aria-label="Password"]') as HTMLInputElement;
    
    // Check if both inputs exist
    return !!(usernameInput && passwordInput);
  });
  
  if (!loginDetected) {
    console.log(`[SCREENSHOT] No login page detected, continuing...`);
    return false;
  }
  
  console.log(`[SCREENSHOT] 🔐 Login page detected!`);
  
  // Get credentials from environment
  const username = process.env.INSTAGRAM_USERNAME;
  const password = process.env.INSTAGRAM_PASSWORD;
  
  if (!username || !password) {
    console.log(`[SCREENSHOT] ⚠️ INSTAGRAM_USERNAME or INSTAGRAM_PASSWORD not set in environment`);
    console.log(`[SCREENSHOT] Cannot log in - proceeding without login`);
    return false;
  }
  
  console.log(`[SCREENSHOT] Credentials found, attempting login...`);
  
  try {
    // Fill username using exact selector
    const usernameInput = page.locator('input[name="username"][aria-label*="Phone number, username, or email"]');
    await usernameInput.fill(username);
    console.log(`[SCREENSHOT] Username filled`);
    
    // Small delay between fields (human-like)
    await page.waitForTimeout(500);
    
    // Fill password using exact selector
    const passwordInput = page.locator('input[name="password"][aria-label="Password"]');
    await passwordInput.fill(password);
    console.log(`[SCREENSHOT] Password filled`);
    
    // Small delay before clicking login
    await page.waitForTimeout(500);
    
    // Click login button using exact selector
    // Button has type="submit" and contains "Log in" text in a child div
    const loginButton = page.locator('button[type="submit"]').filter({ hasText: 'Log in' });
    await loginButton.click();
    console.log(`[SCREENSHOT] Login button clicked`);
    
    // ============================================
    // DEBUG PAUSE: After clicking login button
    // ============================================
    console.log(`[SCREENSHOT] 🛑 DEBUG PAUSE - After clicking login button`);
    await page.pause();
    console.log(`[SCREENSHOT] ▶️ Resuming after pause...`);
    // ============================================
    
    // Wait for navigation/response
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(3000);
    
    // Check if we're still on login page (login might have failed)
    const stillOnLogin = await page.evaluate(() => {
      return !!document.querySelector('input[name="username"]') && 
             !!document.querySelector('input[name="password"]');
    });
    
    if (stillOnLogin) {
      console.log(`[SCREENSHOT] ⚠️ Still on login page - login may have failed`);
      return false;
    }
    
    console.log(`[SCREENSHOT] ✅ Login appears successful!`);
    console.log(`[SCREENSHOT] Current URL after login: ${page.url()}`);
    
    // Handle "Save Login Info" popup if it appears
    try {
      const notNowButton = page.locator('button:has-text("Not Now"), button:has-text("Not now")').first();
      if (await notNowButton.isVisible({ timeout: 2000 })) {
        await notNowButton.click();
        console.log(`[SCREENSHOT] Dismissed "Save Login Info" popup`);
        await page.waitForTimeout(500);
      }
    } catch (e) {
      // No popup, continue
    }
    
    // Handle "Turn on Notifications" popup if it appears
    try {
      const notNowNotif = page.locator('button:has-text("Not Now"), button:has-text("Not now")').first();
      if (await notNowNotif.isVisible({ timeout: 2000 })) {
        await notNowNotif.click();
        console.log(`[SCREENSHOT] Dismissed notifications popup`);
        await page.waitForTimeout(500);
      }
    } catch (e) {
      // No popup, continue
    }
    
    return true;
  } catch (error) {
    console.error(`[SCREENSHOT] Login error:`, error);
    return false;
  }
}

/**
 * Debug logging for Instagram screenshot diagnostics
 */
async function logInstagramPageState(page: Page, label: string): Promise<void> {
  const state = await page.evaluate(() => {
    // Count post thumbnail candidates
    const thumbnailSelectors = [
      'article img',
      'img[srcset]',
      'div[style*="background-image"]',
      'a[href*="/p/"] img',
      'div[role="tabpanel"] img',
    ];
    
    let totalThumbnails = 0;
    let loadedThumbnails = 0;
    
    thumbnailSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (el instanceof HTMLImageElement) {
          totalThumbnails++;
          if (el.complete && el.naturalWidth > 0) {
            loadedThumbnails++;
          }
        }
      });
    });
    
    // Check overflow state
    const htmlOverflow = getComputedStyle(document.documentElement).overflow;
    const bodyOverflow = getComputedStyle(document.body).overflow;
    const bodyPosition = getComputedStyle(document.body).position;
    
    // Check if main content exists
    const hasMain = !!document.querySelector('main');
    const hasArticles = document.querySelectorAll('article').length;
    
    return {
      url: window.location.href,
      totalThumbnails,
      loadedThumbnails,
      htmlOverflow,
      bodyOverflow,
      bodyPosition,
      hasMain,
      hasArticles,
      viewportHeight: window.innerHeight,
      scrollHeight: document.body.scrollHeight,
    };
  });
  
  console.log(`[INSTAGRAM DEBUG] ${label}:`, JSON.stringify(state, null, 2));
}

/**
 * Ensures Instagram post grid is fully rendered before screenshot
 * Waits for images to load and paint to settle
 */
async function ensureInstagramGridRendered(page: Page): Promise<{ success: boolean; thumbnailCount: number; loadedCount: number }> {
  console.log(`[SCREENSHOT] Ensuring Instagram grid is rendered...`);
  
  // Step 1: Wait for main content to be visible
  try {
    await page.waitForSelector('main, article, [role="tabpanel"]', { timeout: 5000 });
    console.log(`[SCREENSHOT] Main content selector found`);
  } catch (e) {
    console.log(`[SCREENSHOT] Main content selector not found, continuing anyway`);
  }
  
  // Step 2: Scroll down to trigger lazy loading, then back up
  console.log(`[SCREENSHOT] Performing scroll warmup to trigger lazy loading...`);
  await page.evaluate(async () => {
    const scrollStep = window.innerHeight;
    const maxScroll = Math.min(document.body.scrollHeight, scrollStep * 3);
    
    // Scroll down in steps
    for (let y = 0; y <= maxScroll; y += scrollStep) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 200));
    }
    
    // Scroll back to top
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 200));
  });
  
  // Step 3: Wait for thumbnail images to exist (minimum 6, ideally 12)
  const MIN_THUMBNAILS = 6;
  const MAX_WAIT_MS = 8000;
  const POLL_INTERVAL_MS = 500;
  let elapsed = 0;
  let thumbnailCount = 0;
  let loadedCount = 0;
  
  while (elapsed < MAX_WAIT_MS) {
    const counts = await page.evaluate(() => {
      const images = document.querySelectorAll('article img, a[href*="/p/"] img, div[role="tabpanel"] img');
      let total = 0;
      let loaded = 0;
      
      images.forEach(img => {
        if (img instanceof HTMLImageElement) {
          total++;
          if (img.complete && img.naturalWidth > 0) {
            loaded++;
          }
        }
      });
      
      return { total, loaded };
    });
    
    thumbnailCount = counts.total;
    loadedCount = counts.loaded;
    
    console.log(`[SCREENSHOT] Thumbnails: ${loadedCount}/${thumbnailCount} loaded (elapsed: ${elapsed}ms)`);
    
    if (loadedCount >= MIN_THUMBNAILS) {
      console.log(`[SCREENSHOT] ✅ Sufficient thumbnails loaded`);
      break;
    }
    
    await page.waitForTimeout(POLL_INTERVAL_MS);
    elapsed += POLL_INTERVAL_MS;
  }
  
  // Step 4: Wait for images to decode
  await page.evaluate(async () => {
    const images = document.querySelectorAll('article img, a[href*="/p/"] img');
    const promises: Promise<void>[] = [];
    
    images.forEach(img => {
      if (img instanceof HTMLImageElement && !img.complete) {
        promises.push(
          new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            // Timeout fallback
            setTimeout(resolve, 2000);
          })
        );
      }
    });
    
    await Promise.all(promises);
  });
  
  // Step 5: Paint settle - wait for a few animation frames
  await page.evaluate(() => {
    return new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(resolve, 300);
          });
        });
      });
    });
  });
  
  console.log(`[SCREENSHOT] Grid render complete: ${loadedCount}/${thumbnailCount} thumbnails loaded`);
  
  return {
    success: loadedCount >= MIN_THUMBNAILS,
    thumbnailCount,
    loadedCount,
  };
}

/**
 * Restores scroll ability after overlay removal
 * Instagram often locks scrolling when showing modals
 */
async function restoreInstagramScrollability(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Remove scroll locks
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflowY = 'auto';
    document.body.style.overflowY = 'auto';
    
    // Remove position:fixed that's sometimes used for scroll lock
    if (getComputedStyle(document.body).position === 'fixed') {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
    }
    
    // Remove any transform locks
    document.body.style.transform = '';
    document.documentElement.style.transform = '';
  });
  console.log(`[SCREENSHOT] Scroll locks removed`);
}

/**
 * Neutralizes Instagram overlays without breaking page structure
 * Uses visibility/opacity instead of display:none, and tries close buttons first
 */
async function neutralizeInstagramOverlays(page: Page): Promise<void> {
  console.log(`[SCREENSHOT] Neutralizing Instagram overlays...`);
  
  // First, try pressing Escape to close any modal
  try {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    console.log(`[SCREENSHOT] Pressed Escape to close modals`);
  } catch (e) {
    console.log(`[SCREENSHOT] Escape key failed, continuing`);
  }
  
  // Try clicking close buttons if present
  const closeButtonClicked = await page.evaluate(() => {
    const closeSelectors = [
      'button[aria-label="Close"]',
      'svg[aria-label="Close"]',
      '[aria-label="Close"] button',
      'button:has(svg[aria-label="Close"])',
    ];
    
    for (const selector of closeSelectors) {
      const btn = document.querySelector(selector);
      if (btn instanceof HTMLElement) {
        btn.click();
        return true;
      }
    }
    return false;
  });
  
  if (closeButtonClicked) {
    await page.waitForTimeout(500);
    console.log(`[SCREENSHOT] Clicked close button`);
  }
  
  // Neutralize overlays using visibility/opacity instead of display:none
  const neutralized = await page.evaluate(() => {
    let count = 0;
    
    // Helper to neutralize an element without breaking layout
    const neutralize = (el: HTMLElement) => {
      el.style.visibility = 'hidden';
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
      count++;
    };
    
    // 1. Neutralize "Continue watching" / signup modals
    const signupModals = document.querySelectorAll('div');
    signupModals.forEach(el => {
      const hasClasses = el.classList.contains('x1oiqv2n') && el.classList.contains('x1sgudl8');
      if (hasClasses) {
        neutralize(el as HTMLElement);
      }
    });
    
    // 2. Neutralize login dialogs (role="dialog" with login form)
    const dialogs = document.querySelectorAll('div[role="dialog"]');
    dialogs.forEach(dialog => {
      if (dialog.querySelector('input[name="username"]') || 
          dialog.querySelector('form#loginForm') ||
          dialog.textContent?.includes('See more from')) {
        neutralize(dialog as HTMLElement);
      }
    });
    
    // 3. Neutralize fixed backdrop overlays
    const allDivs = document.querySelectorAll('div');
    allDivs.forEach(el => {
      const style = getComputedStyle(el);
      // Fixed overlay with high z-index, not containing main content
      if (style.position === 'fixed' && 
          parseInt(style.zIndex || '0') > 100 &&
          !el.querySelector('main, article, nav')) {
        // Check if it looks like an overlay (dark background or high opacity backdrop)
        const bg = style.backgroundColor;
        if (bg.includes('rgba') && bg.includes('0.') || el.classList.contains('x1uvtmcs')) {
          neutralize(el as HTMLElement);
        }
      }
    });
    
    // 4. Neutralize specific Instagram overlay classes
    const overlayClasses = [
      'x1uvtmcs.x4k7w5x.x1h91t0o',
      'x1ey2m1c.xtijo5x.x1o0tod',
      'xg6iff7.xippug5',
    ];
    
    overlayClasses.forEach(classStr => {
      const selector = classStr.split('.').map(c => `.${c}`).join('');
      document.querySelectorAll(selector).forEach(el => {
        neutralize(el as HTMLElement);
      });
    });
    
    return count;
  });
  
  console.log(`[SCREENSHOT] Neutralized ${neutralized} overlay elements`);
  
  // Restore scroll ability
  await restoreInstagramScrollability(page);
}

/**
 * Removes Instagram popup overlays when navigating via Google search
 * This is specifically for the popups that appear when coming from Google
 * Different from removeInstagramPrompts which handles direct navigation popups
 */
async function removeInstagramOverlaysViaGoogle(page: Page): Promise<void> {
  console.log(`[SCREENSHOT] Removing Instagram overlays (Google navigation)...`);
  
  // Log initial state
  await logInstagramPageState(page, 'Before overlay removal');
  
  // Wait for initial content to load
  console.log(`[SCREENSHOT] Waiting for initial content...`);
  await page.waitForTimeout(1500);
  
  // Use the new neutralization approach
  await neutralizeInstagramOverlays(page);
  
  // Ensure grid is rendered after overlay changes
  const gridResult = await ensureInstagramGridRendered(page);
  
  // Log state after rendering
  await logInstagramPageState(page, 'After grid render');
  
  if (!gridResult.success) {
    console.log(`[SCREENSHOT] ⚠️ Warning: Only ${gridResult.loadedCount} thumbnails loaded, expected at least 6`);
  }
  
  // Legacy removal for stubborn elements (use remove() only for non-critical overlays)
  const removedCount = await page.evaluate(() => {
    let removed = 0;
    
    // Only remove backdrop/spinner elements that are definitely not content
    const safeToRemove = [
      'div.x1uvtmcs.x4k7w5x.x1h91t0o.xaigb6o', // backdrop
      'div.xg6iff7.xippug5', // spinner
    ];
    
    safeToRemove.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        el.remove();
        removed++;
      });
    });
    
    return removed;
  });
  
  console.log(`[SCREENSHOT] Removed ${removedCount} additional overlay elements`);
  
  // Wait a moment for DOM to settle
  await page.waitForTimeout(300);
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
 * Takes a screenshot of a social media profile or website.
 * Routes to simple approach for websites, complex stealth for social media.
 */
async function captureScreenshot(
  url: string,
  viewport: 'desktop' | 'mobile',
  platformParam?: string
): Promise<{ success: boolean; screenshot?: string; error?: string }> {
  // Detect platform early
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

  // For websites, use the simple clean approach (no stealth needed)
  if (platform === 'website') {
    console.log(`[SCREENSHOT] Using simple website capture for: ${url}`);
    return captureWebsiteScreenshot(url);
  }

  // For social media (Instagram, Facebook), use stealth approach
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    console.log(`[SCREENSHOT] Starting ${platform} capture for ${viewport} viewport`);
    console.log(`[SCREENSHOT] URL: ${url}`);

      const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
      const localExecutablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
      const executablePath = isServerless
        ? await chromium.executablePath()
        : (localExecutablePath || undefined);

      // Launch browser
      // DEBUG: Set headless: false locally to see what's happening
      const useHeadless = isServerless ? chromium.headless : false;
      console.log(`[SCREENSHOT] Launching browser - headless: ${useHeadless}, isServerless: ${isServerless}`);
      
      try {
        browser = await pwChromium.launch({
          headless: useHeadless,
        args: [
          // Start with @sparticuz/chromium defaults (serverless-safe). Keep our extras minimal to avoid conflicts.
          ...(isServerless ? chromium.args : []),
          '--disable-blink-features=AutomationControlled',
          // Window size arguments (must match viewport)
          '--window-size=1920,1080',
          // Keep existing behavior for some sites; avoid adding redundant sandbox/dev-shm flags (already in chromium.args).
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          // Incognito mode for cleaner session (no cached data)
          '--incognito',
        ],
        executablePath,
        timeout: TIMEOUT_MS
      });
      } catch (launchError) {
        if (!isServerless && !localExecutablePath) {
          console.error(
            `[SCREENSHOT] Chromium launch failed in local dev without a configured browser binary. ` +
            `Set CHROMIUM_EXECUTABLE_PATH to a local Chromium/Chrome executable path, ` +
            `or run this route in Linux/serverless where @sparticuz/chromium can provide the binary.`
          );
        }
        throw launchError;
      }

      console.log(`[SCREENSHOT] Browser launched successfully`);

      // Create context with appropriate viewport and user agent
      const viewportConfig = VIEWPORTS[viewport];
      const userAgent = USER_AGENTS[viewport];
      
      // IMPORTANT: Always use isMobile: false, hasTouch: false
      // This gives us "Chrome DevTools responsive mode" behavior:
      // - Small viewport (phone-sized)
      // - Desktop UA (no "open in app" prompts)
      // - No touch emulation (avoids mobile OS detection)
      const deviceScaleFactor = viewport === 'mobile' ? 2 : 1;

      const context = await browser.newContext({
        viewport: viewportConfig,
        userAgent: userAgent,
        // Higher scale factor for mobile to get crisp screenshots
        deviceScaleFactor,
        // NEVER use isMobile/hasTouch - triggers "open in app" flows on IG/FB
        isMobile: false,
        hasTouch: false,
        // Keep JavaScript enabled
        javaScriptEnabled: true,
        // Add permissions
        permissions: ['geolocation'],
        // Set locale for consistent rendering
        locale: 'en-US',
      });

      // Debug log context settings (safe to log, no secrets)
      console.log(`[SCREENSHOT] Context created: ${viewportConfig.width}x${viewportConfig.height}, scale=${deviceScaleFactor}, isMobile=false, hasTouch=false, UA starts with Chrome/${userAgent.includes('Chrome/') ? 'yes' : 'no'}`);

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
      
      // INSTAGRAM: Navigate directly and handle login if needed
      if (platform === 'instagram') {
        console.log(`[SCREENSHOT] 🔍 Instagram detected - navigating directly to profile`);
        
        // Navigate directly to Instagram URL
        console.log(`[SCREENSHOT] Navigating to: ${normalizedUrl}`);
        await page.goto(normalizedUrl, {
          waitUntil: 'domcontentloaded',
          timeout: TIMEOUT_MS
        });
        await page.waitForTimeout(2000);
        
        console.log(`[SCREENSHOT] Current URL: ${page.url()}`);
        
        // Check if we're on a login page and handle it
        const loggedIn = await handleInstagramLoginIfNeeded(page);
        
        if (loggedIn) {
          // After login, navigate to the profile URL again
          console.log(`[SCREENSHOT] Navigating to profile after login: ${normalizedUrl}`);
          await page.goto(normalizedUrl, {
            waitUntil: 'domcontentloaded',
            timeout: TIMEOUT_MS
          });
          await page.waitForTimeout(2000);
        }
        
        // Remove Instagram popup overlays
        console.log(`[SCREENSHOT] Removing Instagram popup overlays...`);
        await removeInstagramOverlaysViaGoogle(page);
        
      } else {
        // FACEBOOK and WEBSITE: Direct navigation (unchanged)
        try {
          const response = await page.goto(normalizedUrl, {
            waitUntil: 'domcontentloaded',
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
      } // End of else block (Facebook/Website direct navigation)

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

      // At this point, we're only handling social media (instagram/facebook)
      // Websites are handled by captureWebsiteScreenshot() above
      console.log(`[SCREENSHOT] ${platform} detected, dismissing popups...`);
      await dismissSocialMediaPopups(page, platform);
      
      // Platform-specific element removal
      if (platform === 'facebook') {
        await removeFacebookLoginPrompt(page);
      } else if (platform === 'instagram') {
        await removeInstagramPrompts(page);
        
        // INSTAGRAM: Ensure grid is rendered before screenshot
        console.log(`[SCREENSHOT] Instagram: Ensuring grid is rendered before capture...`);
        await logInstagramPageState(page, 'Before Instagram capture');
        const gridResult = await ensureInstagramGridRendered(page);
        await logInstagramPageState(page, 'After grid render check');
        
        if (!gridResult.success) {
          console.log(`[SCREENSHOT] ⚠️ Instagram grid may not be fully loaded (${gridResult.loadedCount} thumbnails)`);
        }
      }

      // Take screenshot
      // IMPORTANT: Use viewport-only for Instagram to avoid fullPage rendering issues
      const isMobile = viewport === 'mobile';
      const isInstagram = platform === 'instagram';
      
      // Instagram always uses viewport mode to avoid fullPage bugs
      // Facebook and other social media use fullPage for desktop
      const useFullPage = isInstagram ? false : !isMobile;
      
      console.log(`[SCREENSHOT] Capturing ${useFullPage ? 'full-page' : 'viewport'} screenshot (platform: ${platform})...`);
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

