/**
 * Instagram Session Automation Service
 * Handles automatic login, session extraction, validation, and webhook integration
 */

import { chromium as playwrightChromium, Browser, BrowserContext, Page } from 'playwright-core';
import chromium from '@sparticuz/chromium';

export interface InstagramSession {
  sessionid: string;
  csrftoken: string;
  ds_user_id: string;
  expires_at: Date;
  refreshed_at: Date;
  is_valid: boolean;
}

export interface SessionRefreshResult {
  success: boolean;
  session?: InstagramSession;
  error?: string;
  diagnostics?: {
    errorMessages?: string[];
    formVisible?: boolean;
    usernameFieldVisible?: boolean;
    passwordFieldVisible?: boolean;
    has2FAPrompt?: boolean;
    pageTitle?: string;
    url?: string;
    bodyTextSample?: string;
    screenshot_available?: boolean;
  };
  steps?: {
    browser_launch?: string;
    login?: string;
    cookie_extraction?: string;
    webhook_send?: string;
  };
  duration_ms?: number;
}

export class InstagramSessionService {
  private static instance: InstagramSessionService;
  private currentSession: InstagramSession | null = null;
  private lastRefreshAttempt: Date | null = null;
  private readonly MIN_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  static getInstance(): InstagramSessionService {
    if (!InstagramSessionService.instance) {
      InstagramSessionService.instance = new InstagramSessionService();
    }
    return InstagramSessionService.instance;
  }

  /**
   * Refreshes Instagram session by logging in with headless browser
   */
  async refreshSession(): Promise<SessionRefreshResult> {
    const startTime = Date.now();
    const steps: SessionRefreshResult['steps'] = {};

    // Rate limiting: prevent too frequent refresh attempts
    if (this.lastRefreshAttempt) {
      const timeSinceLastAttempt = Date.now() - this.lastRefreshAttempt.getTime();
      if (timeSinceLastAttempt < this.MIN_REFRESH_INTERVAL_MS) {
        return {
          success: false,
          error: `Rate limit: Please wait ${Math.ceil((this.MIN_REFRESH_INTERVAL_MS - timeSinceLastAttempt) / 1000)} seconds before refreshing again`,
          duration_ms: Date.now() - startTime,
        };
      }
    }

    this.lastRefreshAttempt = new Date();

    const username = process.env.INSTAGRAM_USERNAME;
    const password = process.env.INSTAGRAM_PASSWORD;

    if (!username || !password) {
      return {
        success: false,
        error: 'INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD environment variables are required',
        duration_ms: Date.now() - startTime,
      };
    }

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      // Step 1: Launch browser
      // Check if we're in a serverless environment (Vercel)
      const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;
      const isServerless = isVercel || process.env.AWS_LAMBDA_FUNCTION_NAME;
      
      // Check if headful mode is enabled (useful for debugging)
      // Note: Headful mode doesn't work on serverless environments, so force headless
      const envValue = process.env.INSTAGRAM_AUTOMATION_HEADLESS;
      const headlessMode = isServerless ? true : (envValue !== 'false'); // Force headless on serverless
      const modeText = headlessMode ? 'headless' : 'headful';
      console.log(`[SESSION] Environment: isServerless=${isServerless}, INSTAGRAM_AUTOMATION_HEADLESS="${envValue}"`);
      console.log(`[SESSION] Launching ${modeText} browser (headless=${headlessMode})...`);
      
      // Use serverless Chromium on Vercel/serverless, regular Playwright locally
      if (isServerless) {
        // Use serverless Chromium (bundled binary, no installation needed)
        browser = await playwrightChromium.launch({
          args: chromium.args,
          executablePath: await chromium.executablePath(),
          headless: true, // Always headless on serverless
        });
      } else {
        // Local development: use regular Playwright
        browser = await playwrightChromium.launch({
          headless: headlessMode,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
          ],
        });
      }

      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
      });

      // Add stealth properties
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        // @ts-ignore - Adding chrome property for stealth
        (window as any).chrome = { runtime: {} };
      });

      page = await context.newPage();
      steps.browser_launch = 'success';

      // Step 2: Navigate to Instagram login with proper wait conditions
      console.log('[SESSION] Navigating to Instagram login...');
      
      // Navigate and wait for DOM to be ready
      await page.goto('https://www.instagram.com/accounts/login/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // Wait for page to actually load content (Instagram loads dynamically)
      console.log('[SESSION] Waiting for page content to load...');
      
      // Wait for either the login form or any content to appear
      try {
        await Promise.race([
          page.waitForSelector('input[name="username"], input[type="text"]', { timeout: 15000 }),
          page.waitForSelector('body', { state: 'attached', timeout: 5000 }),
        ]);
      } catch (e) {
        console.log('[SESSION] ⚠️ Initial wait timeout, checking page state...');
      }
      
      // Additional wait for JavaScript to execute
      await page.waitForTimeout(3000);
      
      // Check if page has actual content
      const pageContent = await page.evaluate(() => {
        return {
          bodyHTML: document.body.innerHTML,
          bodyText: document.body.innerText,
          hasScripts: document.querySelectorAll('script').length,
          title: document.title,
        };
      });
      
      console.log(`[SESSION] Page state - Title: "${pageContent.title}", Scripts: ${pageContent.hasScripts}, Body length: ${pageContent.bodyHTML.length}`);
      
      // If page is empty, Instagram might be blocking or JavaScript isn't executing
      if (pageContent.bodyHTML.length < 100 && pageContent.hasScripts === 0) {
        console.log('[SESSION] ❌ Page appears empty - Instagram may be blocking or JavaScript disabled');
        throw new Error('Instagram page loaded but appears empty. This may indicate: 1) Instagram is blocking automation, 2) JavaScript is not executing, 3) Rate limiting. Try again later or check account status.');
      }
      
      if (pageContent.bodyHTML.length < 100) {
        console.log('[SESSION] ⚠️ Page content is minimal, waiting longer for dynamic content...');
        await page.waitForTimeout(5000);
        
        // Try waiting for specific Instagram elements
        try {
          await page.waitForSelector('input, form, [role="main"]', { timeout: 10000 });
        } catch (e) {
          console.log('[SESSION] ⚠️ Still no content after extended wait');
        }
      }

      // Check if page is available (Instagram sometimes shows "Page isn't available")
      const pageTitle = await page.title();
      const pageUrl = page.url();
      console.log(`[SESSION] Page loaded - Title: "${pageTitle}", URL: ${pageUrl}`);
      
      if (pageTitle.includes("isn't available") || pageTitle.includes("Error") || pageTitle.includes("Page not found")) {
        console.log('[SESSION] ❌ Instagram shows error page, attempting refresh...');
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
        const newTitle = await page.title();
        if (newTitle.includes("isn't available")) {
          throw new Error(`Instagram page unavailable: "${newTitle}". This may indicate rate limiting or account issues.`);
        }
      }
      
      // Final check: ensure we have actual content before proceeding
      const finalContentCheck = await page.evaluate(() => document.body.innerHTML.length);
      if (finalContentCheck < 100) {
        // Try one more time with a longer wait - Instagram's React app might be slow to load
        console.log('[SESSION] ⚠️ Page still empty, waiting for React app to load...');
        await page.waitForTimeout(5000);
        
        // Check if React has loaded (Instagram uses React)
        const reactLoaded = await page.evaluate(() => {
          // Check for React root or Instagram's app container
          return !!(
            document.querySelector('#react-root') ||
            document.querySelector('[id*="react"]') ||
            document.querySelector('input[name="username"]') ||
            document.body.innerHTML.length > 100
          );
        });
        
        if (!reactLoaded) {
          // Log what we can see
          const debugInfo = await page.evaluate(() => {
            return {
              bodyHTML: document.body.innerHTML,
              scripts: Array.from(document.querySelectorAll('script')).map(s => s.src || 'inline'),
              metaTags: Array.from(document.querySelectorAll('meta')).map(m => m.getAttribute('name') || m.getAttribute('property')),
            };
          });
          console.log('[SESSION] ❌ React app not loaded. Debug info:', JSON.stringify(debugInfo, null, 2));
          throw new Error('Instagram page is still empty after extended wait. This may indicate: 1) Instagram is blocking automation, 2) JavaScript execution issues in serverless environment, 3) Rate limiting. Try again later or use a different approach.');
        }
      }

      // Step 3: Fill login form with robust selectors and human-like behavior
      console.log('[SESSION] 🔍 Looking for login form...');
      
      // Try multiple username field selectors (Instagram's actual selectors)
      const usernameSelectors = [
        'input[name="username"]', // Instagram's primary selector
        'input[autocomplete="username"]',
        'input[type="text"][aria-label*="Phone number" i]',
        'input[type="text"][aria-label*="Username" i]',
        'input[type="text"]:not([type="password"])',
        'input[placeholder*="username" i]',
        'input[placeholder*="phone" i]',
      ];
      
      let usernameField = null;
      let usernameSelector = '';
      for (const selector of usernameSelectors) {
        try {
          usernameField = await page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
          if (usernameField) {
            usernameSelector = selector;
            console.log(`[SESSION] ✅ Found username field with selector: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!usernameField) {
        // Log page content for debugging
        const pageContent = await page.content().catch(() => '');
        const pageText = await page.textContent('body').catch(() => '');
        console.log('[SESSION] ❌ Could not find username field');
        console.log('[SESSION] Page HTML snippet:', pageContent.substring(0, 1000));
        console.log('[SESSION] Page text snippet:', pageText?.substring(0, 500));
        throw new Error('Could not find username input field. Instagram may have changed their login page structure or the page is blocked.');
      }
      
      // Find password field with robust selectors
      const passwordSelectors = [
        'input[name="password"]', // Instagram's primary selector
        'input[type="password"]',
        'input[autocomplete="current-password"]',
        'input[aria-label*="password" i]',
      ];
      
      let passwordField = null;
      let passwordSelector = '';
      for (const selector of passwordSelectors) {
        try {
          passwordField = await page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
          if (passwordField) {
            passwordSelector = selector;
            console.log(`[SESSION] ✅ Found password field with selector: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!passwordField) {
        throw new Error('Could not find password input field.');
      }
      
      // Fill username with human-like typing
      console.log('[SESSION] 📝 Filling username...');
      await usernameField.click({ clickCount: 3 }); // Select all if there's existing text
      await usernameField.press('Backspace');
      await page.waitForTimeout(500 + Math.random() * 500); // Random delay 500-1000ms
      await usernameField.type(username, { delay: 50 + Math.random() * 50 }); // Type with random delays
      
      // Small delay between fields
      await page.waitForTimeout(300 + Math.random() * 300);
      
      // Fill password with human-like typing
      console.log('[SESSION] 📝 Filling password...');
      await passwordField.click();
      await page.waitForTimeout(200 + Math.random() * 200);
      await passwordField.type(password, { delay: 30 + Math.random() * 30 }); // Type with random delays
      
      // Wait before submitting (more human-like)
      await page.waitForTimeout(1000 + Math.random() * 1000);

      // Step 4: Submit form with multiple fallback methods
      console.log('[SESSION] 🚀 Submitting login form...');
      
      let formSubmitted = false;
      
      // Helper function to check for Instagram errors
      const checkForInstagramErrors = async (): Promise<string | null> => {
        const errorInfo = await page.evaluate(() => {
          const errorSelectors = [
            '[role="alert"]',
            'p[data-testid="login-error-message"]',
            '#slfErrorAlert',
            'div.error',
            '[class*="error"]',
            '[id*="error"]',
          ];
          
          const errors: string[] = [];
          for (const selector of errorSelectors) {
            try {
              const elements = document.querySelectorAll(selector);
              elements.forEach((el) => {
                if (el.textContent && el.textContent.trim()) {
                  errors.push(el.textContent.trim());
                }
              });
            } catch (e) {
              continue;
            }
          }
          
          // Check page content for error keywords
          const pageText = document.body.innerText || '';
          const errorKeywords = [
            'try again later',
            'too many attempts',
            'suspended',
            'temporarily blocked',
            'incorrect password',
            'problem logging in',
            'sorry',
            'wrong',
            'incorrect',
          ];
          
          for (const keyword of errorKeywords) {
            if (pageText.toLowerCase().includes(keyword)) {
              // Find the containing element
              const errorDivs = Array.from(document.querySelectorAll('div')).filter(
                (div) => div.textContent && div.textContent.toLowerCase().includes(keyword)
              );
              errorDivs.forEach((div) => {
                if (div.textContent && div.textContent.trim().length < 200) {
                  errors.push(div.textContent.trim());
                }
              });
            }
          }
          
          return errors.length > 0 ? errors.join(' | ') : null;
        });
        
        return errorInfo;
      };
      
      // Approach 1: Try standard submit button (most reliable)
      const submitSelectors = [
        'button[type="submit"]',
        'button:has-text("Log In")',
        'button:has-text("Log in")',
        'div[role="button"][tabindex="0"]',
        'form button',
      ];
      
      for (const selector of submitSelectors) {
        try {
          const submitButton = await page.$(selector);
          if (submitButton && await submitButton.isVisible()) {
            console.log(`[SESSION] ✅ Clicking submit button: ${selector}`);
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
              submitButton.click(),
            ]);
            formSubmitted = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      // Approach 2: Try finding "Log in" span and clicking parent
      if (!formSubmitted) {
        try {
          const loginSpan = await page.waitForSelector('span:has-text("Log in"), span:has-text("Log In")', { 
            timeout: 3000, 
            state: 'visible' 
          });
          
          if (loginSpan) {
            console.log('[SESSION] ✅ Found "Log in" span, clicking parent...');
            const clickableParent = await loginSpan.evaluateHandle((el) => {
              let parent = el.parentElement;
              while (parent && parent !== document.body) {
                if (parent.getAttribute('role') === 'none' && parent.classList.contains('x1ja2u2z')) {
                  return parent;
                }
                parent = parent.parentElement;
              }
              return el.parentElement || el;
            });
            
            const parentElement = await clickableParent.asElement();
            if (parentElement) {
              await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
                parentElement.click(),
              ]);
              formSubmitted = true;
            }
          }
        } catch (e) {
          console.log('[SESSION] Could not find "Log in" span, trying form submit...');
        }
      }
      
      // Approach 3: Try form.submit()
      if (!formSubmitted) {
        try {
          const form = await page.$('form');
          if (form) {
            console.log('[SESSION] ✅ Submitting form directly...');
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
              form.evaluate((f: HTMLFormElement) => f.submit()),
            ]);
            formSubmitted = true;
          }
        } catch (e) {
          console.log('[SESSION] Form submit failed, trying Enter key...');
        }
      }
      
      // Approach 4: Press Enter on password field (last resort)
      if (!formSubmitted) {
        console.log('[SESSION] ⚠️ No submit button found, pressing Enter on password field...');
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
          passwordField.press('Enter'),
        ]);
        formSubmitted = true;
      }
      
      // Wait for page to process
      await page.waitForTimeout(3000);
      
      // Check for errors immediately after submission
      const errorMessages = await checkForInstagramErrors();
      if (errorMessages) {
        console.log(`[SESSION] ❌ Error detected after submission: ${errorMessages}`);
        // Log page state for debugging
        const pageText = await page.textContent('body').catch(() => '');
        console.log('[SESSION] Page text after error:', pageText?.substring(0, 500));
        throw new Error(`Login error: ${errorMessages}`);
      }
      
      // Step 5: Check for CAPTCHA or challenges before checking 2FA
      const captchaCheck = await page.evaluate(() => {
        return {
          url: window.location.href,
          hasCaptcha: document.querySelector('iframe[src*="recaptcha"]') !== null || 
                     document.querySelector('[class*="captcha"]') !== null ||
                     document.body.innerText.includes('captcha') ||
                     document.body.innerText.includes('verify') ||
                     document.body.innerText.includes('suspicious'),
          bodyText: document.body.innerText.substring(0, 1000),
        };
      });
      
      if (captchaCheck.hasCaptcha) {
        console.log('[SESSION] CAPTCHA or verification challenge detected');
        console.log('[SESSION] Page content snippet:', captchaCheck.bodyText.substring(0, 500));
        return {
          success: false,
          error: 'CAPTCHA or verification challenge detected. Manual intervention required.',
          steps: { ...steps, login: 'captcha_required' },
          duration_ms: Date.now() - startTime,
        };
      }
      
      // Step 6: Handle 2FA if required
      const currentUrl = page.url();
      if (currentUrl.includes('/accounts/two_factor') || currentUrl.includes('/challenge')) {
        console.log('[SESSION] 2FA challenge detected...');
        const backupCode = process.env.INSTAGRAM_2FA_BACKUP_CODE;
        
        if (backupCode) {
          console.log('[SESSION] Using backup code for 2FA...');
          try {
            await page.waitForSelector('input[name="verificationCode"]', { timeout: 5000 });
            await page.fill('input[name="verificationCode"]', backupCode);
            await page.click('button[type="submit"]');
            await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
          } catch (error) {
            return {
              success: false,
              error: '2FA backup code failed or expired. Manual intervention required.',
              steps: { ...steps, login: '2fa_failed' },
              duration_ms: Date.now() - startTime,
            };
          }
        } else {
          return {
            success: false,
            error: '2FA challenge detected but INSTAGRAM_2FA_BACKUP_CODE not configured. Manual intervention required.',
            steps: { ...steps, login: '2fa_required' },
            duration_ms: Date.now() - startTime,
          };
        }
      }

      // Step 7: Check if login was successful with detailed diagnostics
      const finalUrl = page.url();
      const finalTitle = await page.title();
      console.log(`[SESSION] 🔍 Final check - URL: ${finalUrl}, Title: "${finalTitle}"`);
      
      if (finalUrl.includes('/accounts/login') && !finalUrl.includes('/accounts/two_factor')) {
        // Still on login page - gather comprehensive diagnostics
        const diagnostics = await page.evaluate(() => {
          const errorElements = Array.from(document.querySelectorAll('[role="alert"], .error, [class*="error"], p[data-testid="login-error-message"], #slfErrorAlert'));
          const errorTexts = errorElements.map(el => el.textContent?.trim()).filter(Boolean);
          
          return {
            errorMessages: errorTexts,
            formVisible: document.querySelector('form') !== null,
            usernameFieldVisible: document.querySelector('input[name="username"]') !== null,
            passwordFieldVisible: document.querySelector('input[name="password"]') !== null,
            has2FAPrompt: document.querySelector('input[name="verificationCode"]') !== null,
            pageTitle: document.title,
            url: window.location.href,
            bodyTextSample: document.body.innerText.substring(0, 500),
          };
        });
        
        console.log('[SESSION] ❌ Login failed - Diagnostics:', JSON.stringify(diagnostics, null, 2));
        
        // Build comprehensive error message
        let errorMsg = 'Login failed - still on login page. ';
        
        if (diagnostics.errorMessages.length > 0) {
          errorMsg += `Instagram errors: ${diagnostics.errorMessages.join('; ')}. `;
        }
        
        if (finalTitle.includes("isn't available")) {
          errorMsg += `Page shows "${finalTitle}" - Instagram may be blocking the request or rate limiting. `;
        }
        
        if (diagnostics.has2FAPrompt) {
          errorMsg += '2FA challenge detected. ';
        }
        
        errorMsg += 'Check credentials, account status, or handle 2FA manually.';
        
        return {
          success: false,
          error: errorMsg,
          diagnostics: {
            ...diagnostics,
          },
          steps: { ...steps, login: 'failed' },
          duration_ms: Date.now() - startTime,
        };
      }

      console.log('[SESSION] Login successful, extracting cookies...');
      steps.login = 'success';

      // Step 7: Extract cookies
      const cookies = await context.cookies();
      const sessionCookie = cookies.find(c => c.name === 'sessionid');
      const csrfCookie = cookies.find(c => c.name === 'csrftoken');
      const userIdCookie = cookies.find(c => c.name === 'ds_user_id');

      if (!sessionCookie) {
        return {
          success: false,
          error: 'Failed to extract sessionid cookie after login',
          steps: { ...steps, cookie_extraction: 'failed' },
          duration_ms: Date.now() - startTime,
        };
      }

      const session: InstagramSession = {
        sessionid: sessionCookie.value,
        csrftoken: csrfCookie?.value || '',
        ds_user_id: userIdCookie?.value || '',
        expires_at: sessionCookie.expires ? new Date(sessionCookie.expires * 1000) : new Date(Date.now() + 86400000), // Default 24h
        refreshed_at: new Date(),
        is_valid: true,
      };

      this.currentSession = session;
      steps.cookie_extraction = 'success';

      // Step 8: Send to webhook
      const webhookSuccess = await this.sendToWebhook(session);
      steps.webhook_send = webhookSuccess ? 'success' : 'failed';

      console.log('[SESSION] Session refresh completed successfully');
      return {
        success: true,
        session,
        steps,
        duration_ms: Date.now() - startTime,
      };
    } catch (error: any) {
      console.error('[SESSION] Error during session refresh:', error);
      return {
        success: false,
        error: error.message || 'Unknown error during session refresh',
        steps,
        duration_ms: Date.now() - startTime,
      };
    } finally {
      // Cleanup
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }

  /**
   * Validates existing session by making a test request
   */
  async validateSession(sessionid?: string): Promise<boolean> {
    const sessionToValidate = sessionid || this.currentSession?.sessionid || process.env.INSTAGRAM_SESSION_ID;
    
    if (!sessionToValidate) {
      return false;
    }

    try {
      // Decode if URL-encoded
      const decodedSession = sessionToValidate.includes('%') 
        ? decodeURIComponent(sessionToValidate)
        : sessionToValidate;

      // Make a lightweight request to Instagram API
      const response = await fetch('https://www.instagram.com/api/v1/users/web_profile_info/?username=instagram', {
        method: 'GET',
        headers: {
          'Cookie': `sessionid=${decodedSession}`,
          'User-Agent': 'Instagram 267.0.0.19.301 Android',
          'X-IG-App-ID': '567067343352427',
        },
        redirect: 'manual',
      });

      // Check if we got redirected to login (invalid session)
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location && (location.includes('/accounts/login') || location.includes('/login'))) {
          return false;
        }
      }

      // If we got a valid response (200 or valid redirect), session is likely valid
      return response.ok || (response.status >= 300 && response.status < 400);
    } catch (error) {
      console.error('[SESSION] Error validating session:', error);
      return false;
    }
  }

  /**
   * Sends session credentials to webhook
   */
  async sendToWebhook(session: InstagramSession): Promise<boolean> {
    const webhookUrl = process.env.INSTAGRAM_WEBHOOK_URL || 'https://ai.intakt.co.za/webhook/instagram-scraper';
    const webhookSecret = process.env.INSTAGRAM_WEBHOOK_SECRET;

    if (!webhookUrl) {
      console.warn('[SESSION] No webhook URL configured, skipping webhook send');
      return false;
    }

    const payload = {
      event: 'instagram_session_refresh',
      timestamp: new Date().toISOString(),
      source: 'antistatic-landing',
      credentials: {
        sessionid: session.sessionid,
        csrftoken: session.csrftoken,
        ds_user_id: session.ds_user_id,
        expires_in: Math.floor((session.expires_at.getTime() - Date.now()) / 1000),
      },
      metadata: {
        user_agent: 'Instagram 267.0.0.19.301 Android',
        extracted_at: session.refreshed_at.toISOString(),
        session_age_seconds: 0,
      },
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (webhookSecret) {
      // Add signature if secret is configured
      headers['X-Webhook-Secret'] = webhookSecret;
    }

    try {
      // Retry logic with exponential backoff
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10000), // 10 second timeout
          });

          if (response.ok) {
            console.log('[SESSION] Webhook sent successfully');
            return true;
          } else {
            const errorText = await response.text().catch(() => 'Unknown error');
            lastError = new Error(`Webhook returned ${response.status}: ${errorText}`);
          }
        } catch (error: any) {
          lastError = error;
        }

        // Wait before retry (exponential backoff)
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }

      console.error('[SESSION] Webhook send failed after retries:', lastError);
      return false;
    } catch (error) {
      console.error('[SESSION] Webhook send error:', error);
      return false;
    }
  }

  /**
   * Gets current session from memory or environment
   */
  getCurrentSession(): InstagramSession | null {
    if (this.currentSession) {
      return this.currentSession;
    }

    // Try to construct from environment variables
    const sessionid = process.env.INSTAGRAM_SESSION_ID;
    const csrftoken = process.env.INSTAGRAM_CSRF_TOKEN;
    const ds_user_id = process.env.INSTAGRAM_DS_USER_ID;

    if (sessionid) {
      return {
        sessionid: sessionid.includes('%') ? decodeURIComponent(sessionid) : sessionid,
        csrftoken: csrftoken || '',
        ds_user_id: ds_user_id || '',
        expires_at: new Date(Date.now() + 86400000), // Assume 24h expiry
        refreshed_at: new Date(0), // Unknown
        is_valid: false, // Needs validation
      };
    }

    return null;
  }

  /**
   * Health check for session status
   */
  async healthCheck(): Promise<{ healthy: boolean; message: string; session_age_hours?: number; needs_refresh?: boolean }> {
    const session = this.getCurrentSession();
    
    if (!session) {
      return {
        healthy: false,
        message: 'No session found',
        needs_refresh: true,
      };
    }

    const isValid = await this.validateSession(session.sessionid);
    const sessionAgeHours = session.refreshed_at.getTime() > 0
      ? (Date.now() - session.refreshed_at.getTime()) / (1000 * 60 * 60)
      : null;

    return {
      healthy: isValid,
      message: isValid ? 'Session is valid' : 'Session is invalid or expired',
      session_age_hours: sessionAgeHours || undefined,
      needs_refresh: !isValid || (sessionAgeHours !== null && sessionAgeHours > 6),
    };
  }
}
