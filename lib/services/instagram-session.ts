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
        // Configure Chromium for serverless
        chromium.setGraphicsMode(false);
        
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

      // Step 2: Navigate to Instagram login
      console.log('[SESSION] Navigating to Instagram login...');
      await page.goto('https://www.instagram.com/accounts/login/', {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // Step 3: Fill login form
      console.log('[SESSION] Filling login form...');
      // Try multiple selectors for username field (Instagram may change their HTML)
      const usernameSelectors = [
        'input[name="username"]',
        'input[type="text"]',
        'input[placeholder*="username" i]',
        'input[placeholder*="phone" i]',
        'input[aria-label*="username" i]',
        'input[aria-label*="phone" i]',
      ];
      
      let usernameSelector = '';
      let usernameFieldFound = false;
      for (const selector of usernameSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
          usernameSelector = selector;
          usernameFieldFound = true;
          console.log(`[SESSION] Found username field with selector: ${selector}`);
          break;
        } catch (e) {
          // Try next selector
          continue;
        }
      }
      
      if (!usernameFieldFound) {
        // If headful mode, wait longer and show page content for debugging
        if (!headlessMode) {
          console.log('[SESSION] Username field not found, waiting 5 more seconds in headful mode...');
          await page.waitForTimeout(5000);
          const pageContent = await page.content();
          console.log('[SESSION] Page HTML snippet:', pageContent.substring(0, 500));
        }
        throw new Error('Could not find username input field. Instagram may have changed their login page structure.');
      }
      
      // Find password field similarly
      const passwordSelectors = [
        'input[name="password"]',
        'input[type="password"]',
        'input[aria-label*="password" i]',
      ];
      
      let passwordSelector = '';
      let passwordFieldFound = false;
      for (const selector of passwordSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
          passwordSelector = selector;
          passwordFieldFound = true;
          console.log(`[SESSION] Found password field with selector: ${selector}`);
          break;
        } catch (e) {
          continue;
        }
      }
      
      if (!passwordFieldFound) {
        throw new Error('Could not find password input field.');
      }
      
      // Fill username and password
      await page.fill(usernameSelector, username);
      await page.fill(passwordSelector, password);

      // Step 4: Submit form
      console.log('[SESSION] Submitting login form...');
      
      // Try to find and click the submit button
      // Based on Instagram's current structure: div[role="none"] containing span with "Log in" text
      let submitButtonFound = false;
      
      try {
        // First, try to find the span containing "Log in" text
        const loginSpan = await page.waitForSelector('span:has-text("Log in"), span:has-text("Log In")', { 
          timeout: 5000, 
          state: 'visible' 
        });
        
        if (loginSpan) {
          console.log('[SESSION] Found "Log in" span, finding clickable parent...');
          
          // Find the clickable parent div[role="none"] that contains the span
          const clickableParent = await loginSpan.evaluateHandle((el) => {
            let parent = el.parentElement;
            while (parent && parent !== document.body) {
              // Look for the div[role="none"] with class x1ja2u2z (from user's HTML structure)
              if (parent.getAttribute('role') === 'none' && parent.classList.contains('x1ja2u2z')) {
                return parent;
              }
              parent = parent.parentElement;
            }
            // Fallback: return the span's immediate parent
            return el.parentElement || el;
          });
          
          const parentElement = await clickableParent.asElement();
          if (parentElement) {
            console.log('[SESSION] Clicking parent div[role="none"] element...');
            await parentElement.click();
            submitButtonFound = true;
          } else {
            // Fallback: click the span itself
            await loginSpan.click();
            submitButtonFound = true;
          }
        }
      } catch (e) {
        console.log('[SESSION] Could not find "Log in" span, trying alternative selectors...');
      }
      
      // Fallback to standard button selectors
      if (!submitButtonFound) {
        const submitSelectors = [
          'button[type="submit"]',
          'button:has-text("Log in")',
          'button:has-text("Log In")',
          'button:has-text("Sign in")',
          'form button',
        ];
        
        for (const selector of submitSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 3000, state: 'visible' });
            console.log(`[SESSION] Found submit button with selector: ${selector}`);
            await page.click(selector);
            submitButtonFound = true;
            break;
          } catch (e) {
            continue;
          }
        }
      }
      
      if (!submitButtonFound) {
        throw new Error('Could not find submit button. Instagram may have changed their login page structure.');
      }
      
      // Wait for navigation after clicking
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
      } catch (e) {
        console.log('[SESSION] Navigation timeout, but continuing...');
      }

      // Step 5: Handle 2FA if required
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

      // Step 6: Check if login was successful
      const finalUrl = page.url();
      if (finalUrl.includes('/accounts/login') || finalUrl.includes('/challenge')) {
        return {
          success: false,
          error: 'Login failed - still on login page. Check credentials or handle 2FA manually.',
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
