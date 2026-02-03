/**
 * Instagram Session Automation Service
 * Handles automatic login, session extraction, validation, and webhook integration
 */

import { chromium as pwChromium, Browser, BrowserContext, Page } from 'playwright-core';
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
   * Get Vercel timeout based on plan detection
   */
  private getVercelTimeout(): number {
    if (!process.env.VERCEL) return 60000; // Local: 60 seconds
    
    // Try to detect Vercel plan
    const isHobby = process.env.VERCEL_ENV === 'preview' || !process.env.VERCEL_ENV;
    const isPro = process.env.VERCEL_ENV === 'production';
    
    if (isHobby) {
      console.log('[SESSION] ⚠️ Vercel Hobby plan detected (10s timeout)');
      return 10000; // Hobby: 10 seconds
    }
    
    // Default to Pro/Enterprise
    console.log('[SESSION] ✅ Vercel Pro/Enterprise plan detected (60s timeout)');
    return 60000; // Pro/Enterprise: 60 seconds
  }

  /**
   * Refreshes Instagram session by logging in with headless browser
   */
  async refreshSession(options?: { headlessOverride?: boolean }): Promise<SessionRefreshResult> {
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
    
    // Declare variables for error handling
    let isServerless = false;
    let executablePath: string | undefined;
    let headlessMode = true; // Default to headless

    try {
      // Step 1: Detect environment and configure browser
      console.log('[SESSION] 🚀 Starting Instagram session refresh...');
      
      // Detect serverless environment (Vercel, AWS Lambda, etc.)
      isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.FUNCTION_TARGET;
      const localExecutablePath = process.env.CHROME_EXECUTABLE_PATH;
      
      // Log production diagnostics
      if (isServerless) {
        console.log('[SESSION] 🏢 PRODUCTION ENVIRONMENT DETECTED');
        console.log(`[SESSION] VERCEL: ${process.env.VERCEL}`);
        console.log(`[SESSION] VERCEL_ENV: ${process.env.VERCEL_ENV || 'not set'}`);
        console.log(`[SESSION] VERCEL_REGION: ${process.env.VERCEL_REGION || 'not set'}`);
        console.log(`[SESSION] NODE_ENV: ${process.env.NODE_ENV}`);
        console.log(`[SESSION] FUNCTION_TARGET: ${process.env.FUNCTION_TARGET || 'not set'}`);
        console.log(`[SESSION] AWS_LAMBDA_FUNCTION_NAME: ${process.env.AWS_LAMBDA_FUNCTION_NAME || 'not set'}`);
        console.log(`[SESSION] AWS_LAMBDA_FUNCTION_MEMORY_SIZE: ${process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || 'unknown'} MB`);
        console.log(`[SESSION] INSTAGRAM_AUTOMATION_HEADLESS: ${process.env.INSTAGRAM_AUTOMATION_HEADLESS || 'not set'}`);
        console.log(`[SESSION] Chromium args count: ${chromium.args.length}`);
      }
      
      // Determine headless mode - FORCE headless in serverless environments
      const envValue = process.env.INSTAGRAM_AUTOMATION_HEADLESS;
      headlessMode = options?.headlessOverride !== undefined 
        ? options.headlessOverride 
        : (isServerless ? true : envValue !== 'false');
      
      const modeText = headlessMode ? 'headless' : 'headful';
      console.log(`[SESSION] Headless mode: ${headlessMode} (serverless: ${isServerless}, env override: ${options?.headlessOverride !== undefined ? options.headlessOverride : 'none'})`);
      console.log(`[SESSION] Launching ${modeText} browser...`);
      
      // Get Chromium executable path with error handling
      try {
        if (isServerless) {
          console.log('[SESSION] Getting serverless Chromium executable path...');
          const chromiumPath = await chromium.executablePath();
          
          if (!chromiumPath) {
            throw new Error('chromium.executablePath() returned null/undefined');
          }
          
          console.log(`[SESSION] ✅ Chromium path resolved: ${chromiumPath}`);
          executablePath = chromiumPath;
        } else {
          executablePath = localExecutablePath || undefined;
          console.log(`[SESSION] Local Chromium path: ${executablePath || 'default (system)'}`);
        }
      } catch (pathError: any) {
        console.error('[SESSION] ❌ Failed to get Chromium executable path:', pathError);
        if (isServerless) {
          throw new Error(`Chromium setup failed in serverless: ${pathError.message}. Check @sparticuz/chromium bundling.`);
        }
        throw pathError;
      }
      
      // Determine timeout based on Vercel plan
      const vercelTimeout = this.getVercelTimeout();
      const browserTimeout = Math.min(60000, vercelTimeout - 5000); // Leave 5s buffer
      console.log(`[SESSION] Timeout configured: ${browserTimeout}ms (Vercel limit: ${vercelTimeout}ms)`);
      
      // Build launch options with serverless optimizations
      const launchOptions: any = {
        headless: headlessMode,
        args: [
          ...(isServerless ? chromium.args : []),
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
        ],
        executablePath,
        timeout: browserTimeout,
      };
      
      // Add serverless-specific optimizations for memory and performance
      if (isServerless) {
        launchOptions.args.push(
          '--single-process', // Reduces memory usage
          '--no-zygote',
          '--disable-gpu', // No GPU in serverless
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-breakpad',
          '--disable-component-extensions-with-background-pages',
          '--disable-default-apps',
          '--disable-features=TranslateUI,BlinkGenPropertyTrees',
          '--disable-ipc-flooding-protection',
          '--disable-renderer-backgrounding',
          '--enable-features=NetworkService,NetworkServiceInProcess',
          '--force-color-profile=srgb',
          '--metrics-recording-only',
          '--mute-audio',
        );
        
        // Set smaller viewport to reduce memory
        launchOptions.defaultViewport = { width: 1280, height: 720 };
        
        console.log(`[SESSION] Serverless optimizations applied (${launchOptions.args.length} args)`);
      } else {
        // Local development: add standard args
        launchOptions.args.push(
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
        );
      }
      
      console.log(`[SESSION] Launching browser with ${launchOptions.args.length} args...`);
      browser = await pwChromium.launch(launchOptions);

      // Create browser context with optimized viewport for serverless
      const viewportConfig = isServerless 
        ? { width: 1280, height: 720 } // Smaller viewport for serverless
        : { width: 1920, height: 1080 }; // Full viewport for local
      
      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: viewportConfig,
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
      // Based on Instagram's current structure: div[role="none"].x1ja2u2z containing span with "Log in" text
      let submitButtonFound = false;
      
      try {
        // Strategy 1: Find the outermost div[role="none"] with class x1ja2u2z that contains "Log in" text
        const submitButton = await page.waitForSelector('div[role="none"].x1ja2u2z:has-text("Log in")', { 
          timeout: 5000, 
          state: 'visible' 
        });
        
        if (submitButton) {
          console.log('[SESSION] Found submit button using div[role="none"].x1ja2u2z selector');
          await submitButton.click();
          submitButtonFound = true;
        }
      } catch (e) {
        console.log('[SESSION] Strategy 1 failed, trying alternative approach...');
      }
      
      // Strategy 2: Find span with "Log in" text and traverse up to find clickable parent
      if (!submitButtonFound) {
        try {
          const loginSpan = await page.waitForSelector('span:has-text("Log in"), span:has-text("Log In")', { 
            timeout: 5000, 
            state: 'visible' 
          });
          
          if (loginSpan) {
            console.log('[SESSION] Found "Log in" span, finding clickable parent...');
            
            // Find the clickable parent div[role="none"] with class x1ja2u2z
            const clickableParent = await loginSpan.evaluateHandle((el) => {
              let current = el;
              // Traverse up the DOM tree
              while (current && current !== document.body) {
                // Check if current element is the target div
                if (current.tagName === 'DIV' && 
                    current.getAttribute('role') === 'none' && 
                    current.classList.contains('x1ja2u2z')) {
                  return current;
                }
                current = current.parentElement;
              }
              // Fallback: return the span's parent or the span itself
              return el.parentElement || el;
            });
            
            const parentElement = await clickableParent.asElement();
            if (parentElement) {
              console.log('[SESSION] Clicking parent div[role="none"].x1ja2u2z element...');
              await parentElement.click();
              submitButtonFound = true;
            } else {
              // Fallback: click the span itself
              await loginSpan.click();
              submitButtonFound = true;
            }
          }
        } catch (e) {
          console.log('[SESSION] Strategy 2 failed, trying standard button selectors...');
        }
      }
      
      // Strategy 3: Fallback to standard button selectors
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
      
      // Wait for navigation after clicking (with adaptive timeout)
      const navigationTimeout = Math.min(30000, browserTimeout - 10000); // Leave 10s buffer
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: navigationTimeout });
      } catch (e) {
        console.log(`[SESSION] Navigation timeout (${navigationTimeout}ms), but continuing...`);
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
      console.error('[SESSION] ❌ Error during session refresh:', error);
      
      // Provide detailed error for production debugging
      if (isServerless) {
        const diagnostics = {
          error: error.message,
          stack: error.stack,
          isServerless: true,
          vercelEnv: process.env.VERCEL_ENV,
          nodeEnv: process.env.NODE_ENV,
          chromiumPath: executablePath,
          headlessMode,
          timestamp: new Date().toISOString(),
        };
        
        console.error('[SESSION] Production diagnostics:', JSON.stringify(diagnostics, null, 2));
        
        return {
          success: false,
          error: `Instagram login automation failed in production: ${error.message}. Check Vercel logs for details.`,
          steps,
          duration_ms: Date.now() - startTime,
        };
      }
      
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
   * Validates existing session by making a test request (via Decodo proxy when enabled).
   */
  async validateSession(sessionid?: string): Promise<boolean> {
    const sessionToValidate = sessionid || this.currentSession?.sessionid || process.env.INSTAGRAM_SESSION_ID;

    if (!sessionToValidate) {
      return false;
    }

    try {
      const decodedSession = sessionToValidate.includes("%")
        ? decodeURIComponent(sessionToValidate)
        : sessionToValidate;

      const { fetchInstagram } = await import("@/lib/net/instagramFetch");

      const response = await fetchInstagram(
        "https://www.instagram.com/api/v1/users/web_profile_info/?username=instagram",
        {
          method: "GET",
          headers: {
            Cookie: `sessionid=${decodedSession}`,
            "User-Agent": "Instagram 267.0.0.19.301 Android",
            "X-IG-App-ID": "567067343352427",
          },
          redirect: "manual",
        },
        {
          logContext: "validateSession",
          timeoutMs: 15000,
        }
      );

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (location && (location.includes("/accounts/login") || location.includes("/login"))) {
          return false;
        }
      }

      return response.ok || (response.status >= 300 && response.status < 400);
    } catch (error) {
      console.error("[SESSION] Error validating session:", error);
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
