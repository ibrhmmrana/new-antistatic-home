# **Instagram Session Management - Technical Audit Report**

**Date:** 2025-01-11  
**Project:** antistatic-landing (Next.js Application)  
**Purpose:** Comprehensive audit for automated session credential renewal system

---

## **Phase 1: Project-Wide Code & Configuration Audit**

### **1. Credential Sources**

#### **Storage Location:**
- ✅ **Environment Variables Only** - No database or file storage detected
- Credentials are stored as **individual environment variables**:
  - `INSTAGRAM_SESSION_ID` (required)
  - `INSTAGRAM_CSRF_TOKEN` (optional)
  - `INSTAGRAM_DS_USER_ID` (optional)
  - `INSTAGRAM_USERNAME` (deprecated, legacy fallback)
  - `INSTAGRAM_PASSWORD` (deprecated, legacy fallback)

#### **Storage Format:**
- **Individual strings** - Each credential is a separate environment variable
- **NOT stored as cookie strings or header objects**
- Values are read directly from `process.env.*` at runtime

#### **Configuration Files:**
- No `.env*` files found in repository (likely gitignored)
- Credentials must be configured in deployment environment (Vercel, AWS Lambda, etc.)

---

### **2. Credential Usage Patterns**

#### **API Routes Using Credentials:**

1. **`app/api/scan/socials/screenshot/route.ts`** (Primary)
   - Function: `injectInstagramSessionCookies(context: BrowserContext)`
   - Line: ~46-119
   - Purpose: Screenshot capture for Instagram profiles
   - Injection method: Playwright `context.addCookies()`

2. **`app/api/test/instagram-scrape/route.ts`** (Test/Development)
   - Function: `injectInstagramSessionCookies(context: BrowserContext)`
   - Line: ~47-113
   - Purpose: Full profile + posts scraping (test endpoint)
   - Injection method: Playwright `context.addCookies()`

#### **Injection Mechanism:**
- **Method:** Browser context cookie injection via Playwright
- **Implementation:**
  ```typescript
  await context.addCookies([
    { name: 'sessionid', value: sessionId, domain: '.instagram.com', ... },
    { name: 'csrftoken', value: csrfToken, domain: '.instagram.com', ... },
    { name: 'ds_user_id', value: dsUserId, domain: '.instagram.com', ... }
  ]);
  ```
- **Timing:** Cookies injected **BEFORE** page creation/navigation
- **No direct HTTP client** - All authentication via browser automation

#### **Central Client/Requester:**
- ❌ **No centralized HTTP client** for authenticated API calls
- All Instagram access is **browser-based** (Playwright)
- No direct Instagram Graph API or REST API calls

---

### **3. Scraping Architecture**

#### **Primary Method:**
- ✅ **Playwright (headless browser automation)**
- Uses `playwright-core` + `@sparticuz/chromium` for serverless compatibility
- **No direct API calls** to Instagram endpoints

#### **Cookie Injection Flow:**
1. Browser context created with viewport/UA settings
2. `injectInstagramSessionCookies()` called on context
3. Cookies added via `context.addCookies()`
4. Page created from context (inherits cookies)
5. Navigation to Instagram profile URL
6. Page state classified (PROFILE/LOGIN/CHALLENGE/UNKNOWN)

#### **Session Validation:**
- ✅ **State-based validation** via `classifyInstagramPageState(url)`
- States detected:
  - `PROFILE` - Success, authenticated
  - `LOGIN` - Session expired/invalid
  - `CHALLENGE` - Verification required (2FA, suspicious activity)
  - `UNKNOWN` - Intermediate/unknown state
- **No explicit health check API call** - validation is implicit via navigation result

#### **Fallback Mechanisms:**
1. **Google CSE Bypass** (when session fails)
   - Uses Google Custom Search Engine API
   - Searches: `site:instagram.com "username"`
   - Extracts profile URL from search results
   - Clears cookies and navigates directly
   - Requires: `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_CX`

2. **Legacy Username/Password Login** (deprecated)
   - Function: `handleInstagramLogin()` (marked deprecated)
   - Only used if session cookies not configured
   - Unreliable due to 2FA/bot detection

---

### **4. Error Handling for Invalid Sessions**

#### **Detection Methods:**
- ✅ **URL-based state classification** after navigation
- Detects redirects to `/accounts/login` → `LOGIN` state
- Detects redirects to `/challenge`, `/checkpoint`, `/two_factor` → `CHALLENGE` state

#### **Error Responses:**
- **LOGIN state:**
  - Logs: `"Session cookies were injected but got redirected to LOGIN - session expired"`
  - Action: Attempts Google CSE bypass
  - If CSE fails: Returns error with debug screenshot

- **CHALLENGE state:**
  - Logs: `"CHALLENGE page detected - session may be flagged"`
  - Action: Tries to dismiss challenge button, then CSE bypass
  - If all fails: Returns error with debug screenshot

#### **Retry Logic:**
- ❌ **No automatic retry** on session expiration
- ❌ **No exponential backoff**
- Errors are returned immediately to caller
- Manual intervention required to update environment variables

#### **Error Messages:**
- User-facing: `"Please refresh your INSTAGRAM_SESSION_ID in environment variables"`
- No automated notification system
- No alerting/email/SMS when session expires

---

### **5. Current Automation Level**

#### **Existing Automation:**
- ❌ **No automation for credential retrieval**
- ❌ **No scheduled session validation**
- ❌ **No automatic renewal**
- ❌ **No backup session rotation**

#### **Current Workflow:**
1. Developer manually logs into Instagram in browser
2. Extracts cookies via browser DevTools
3. Updates environment variables in Vercel/dashboard
4. Application uses new credentials until next expiration

#### **Multiple Accounts:**
- ❌ **Single account only** - One set of credentials
- No rotation or fallback accounts configured

#### **Credential Extraction:**
- **Manual process only**
- No scripts or tools for automated extraction
- No browser extension or helper utilities

---

## **Phase 2: Environment & Dependency Analysis**

### **Dependencies (package.json):**

```json
{
  "dependencies": {
    "@sparticuz/chromium": "^143.0.4",  // Serverless Chromium
    "playwright-core": "^1.57.0",       // Browser automation
    "next": "^14.2.0",                   // Next.js framework
    "selenium-webdriver": "^4.15.0"     // Legacy (unused for Instagram)
  }
}
```

**Key Libraries:**
- ✅ `playwright-core` - Primary browser automation
- ✅ `@sparticuz/chromium` - Serverless-compatible Chromium binary
- ❌ No cookie parsing libraries (`cookie`, `tough-cookie`)
- ❌ No HTTP clients for direct API calls (`axios`, `node-fetch`)
- ❌ No database clients (no persistent storage)

### **Environment Variables:**

**Instagram Authentication:**
- `INSTAGRAM_SESSION_ID` (required)
- `INSTAGRAM_CSRF_TOKEN` (optional)
- `INSTAGRAM_DS_USER_ID` (optional)
- `INSTAGRAM_USERNAME` (deprecated)
- `INSTAGRAM_PASSWORD` (deprecated)

**Google CSE (Fallback):**
- `GOOGLE_CSE_API_KEY` (required for CSE bypass)
- `GOOGLE_CSE_CX` (required for CSE bypass)

**Infrastructure:**
- `VERCEL` / `AWS_LAMBDA_FUNCTION_NAME` (auto-detected for serverless)
- `CHROMIUM_EXECUTABLE_PATH` (optional, for local dev)
- `VERCEL_AUTOMATION_BYPASS_SECRET` (for internal API calls)

### **Existing Scripts:**
- ❌ No login scripts found
- ❌ No cookie extractors found
- ❌ No browser automation flows for credential renewal
- ❌ No scheduled jobs or cron tasks

---

## **Phase 3: Recommended Implementation Plan**

### **Architecture Assessment:**

**Current State:**
- ✅ Well-structured Playwright-based scraping
- ✅ Robust state machine for page classification
- ✅ Fallback mechanism (Google CSE) when session fails
- ❌ No automated session renewal
- ❌ Manual credential management
- ❌ Single point of failure (one session)

**Constraints:**
- Serverless environment (Vercel/Lambda) - no persistent processes
- No database - credentials only in environment variables
- Playwright-based (not direct API calls)
- 2FA challenges common with automated login

---

### **Recommended Option: Option B - "Integrated Refresher"**

**Rationale:**
1. ✅ Already using Playwright - can reuse existing infrastructure
2. ✅ State machine already exists - can detect session expiration
3. ✅ No database needed - can update environment variables via API
4. ⚠️ 2FA challenges require manual intervention (hybrid approach)

**Hybrid Strategy:** Combine Option B (automated) with Option C (manual fallback)

---

### **Implementation Plan: Step-by-Step**

#### **Step 1: Create Session Manager Service**

**File:** `lib/instagram-session-manager.ts`

**Purpose:** Centralized session validation and renewal orchestration

**Key Functions:**
```typescript
class InstagramSessionManager {
  // Validate session health
  async validateSession(): Promise<SessionHealth>
  
  // Check if session is expired (via test navigation)
  async checkSessionValidity(): Promise<boolean>
  
  // Trigger renewal process
  async renewSession(): Promise<SessionCredentials>
  
  // Update environment variables (via Vercel API or internal endpoint)
  async updateCredentials(creds: SessionCredentials): Promise<void>
}
```

**Implementation Details:**
- Use existing `classifyInstagramPageState()` function
- Navigate to a test profile (e.g., `instagram.com/instagram`)
- Classify state - if `LOGIN` or `CHALLENGE`, session is invalid
- Return health status

---

#### **Step 2: Create Session Renewer (Playwright-based)**

**File:** `lib/instagram-session-renewer.ts`

**Purpose:** Automated login flow with cookie extraction

**Key Functions:**
```typescript
class InstagramSessionRenewer {
  // Perform login and extract cookies
  async loginAndExtractCookies(
    username: string,
    password: string
  ): Promise<SessionCredentials>
  
  // Handle 2FA challenge (manual intervention point)
  async handle2FAChallenge(page: Page): Promise<string>
  
  // Extract cookies from browser context
  async extractCookies(context: BrowserContext): Promise<SessionCredentials>
}
```

**Implementation Details:**
- Reuse existing `handleInstagramLogin()` logic (currently deprecated)
- After successful login, extract cookies via `context.cookies()`
- Filter for: `sessionid`, `csrftoken`, `ds_user_id`
- Return structured credentials object

**2FA Handling:**
- Detect challenge page via `classifyInstagramPageState()`
- Pause execution and wait for manual 2FA code entry
- Or: Return special status requiring manual intervention

---

#### **Step 3: Create Admin API Endpoint for Manual Renewal**

**File:** `app/api/admin/instagram/renew-session/route.ts`

**Purpose:** Secure web interface for manual credential renewal

**Features:**
- Launch controlled browser window (headful mode)
- Guide user through login
- Extract cookies automatically
- Update environment variables
- Return success/error status

**Security:**
- Require admin authentication token
- Rate limit renewal attempts
- Log all renewal events

---

#### **Step 4: Create Scheduled Validation Job**

**File:** `app/api/cron/validate-instagram-session/route.ts`

**Purpose:** Periodic session health checks

**Implementation:**
- Vercel Cron Job or external scheduler (e.g., GitHub Actions)
- Runs every 6-12 hours
- Calls `SessionManager.validateSession()`
- If invalid, triggers renewal or sends alert

**Alerting:**
- Send email/SMS when session expires
- Include link to admin renewal page
- Log to monitoring service (if configured)

---

#### **Step 5: Integrate with Existing Scraping Flow**

**Modify:** `app/api/scan/socials/screenshot/route.ts`

**Changes:**
1. Wrap main scraping logic in try-catch
2. On `LOGIN` or `CHALLENGE` state after cookie injection:
   - Call `SessionManager.renewSession()`
   - Retry with new credentials (max 1 retry)
   - If renewal fails, return error with admin renewal link

**Code Pattern:**
```typescript
// In captureScreenshot() function
try {
  const sessionInjected = await injectInstagramSessionCookies(context);
  // ... navigation and state check ...
  
  if (pageState === 'LOGIN' || pageState === 'CHALLENGE') {
    // Attempt automatic renewal
    const renewed = await sessionManager.renewSession();
    if (renewed) {
      // Retry with new credentials
      await injectInstagramSessionCookies(context); // Re-inject
      // Re-navigate and check state
    } else {
      // Return error with manual renewal link
    }
  }
} catch (error) {
  // Handle errors
}
```

---

#### **Step 6: Environment Variable Management**

**Option A: Vercel API (Recommended)**
- Use Vercel REST API to update environment variables
- Requires `VERCEL_TOKEN` environment variable
- Update variables via: `PATCH /v1/projects/{projectId}/env`

**Option B: Internal Database (Future Enhancement)**
- Store credentials in database (encrypted)
- Update environment variables on deployment
- Allows multiple backup sessions

**Option C: External Secret Manager**
- AWS Secrets Manager / Google Secret Manager
- Update via API, app reads on startup
- Better for multi-environment setups

---

### **Required Environment Variables (New):**

```bash
# Session Renewal
INSTAGRAM_RENEWAL_USERNAME=your_username
INSTAGRAM_RENEWAL_PASSWORD=your_password  # Encrypted/stored securely

# Admin Interface
ADMIN_AUTH_TOKEN=secure_random_token

# Vercel API (for updating env vars)
VERCEL_TOKEN=your_vercel_api_token
VERCEL_PROJECT_ID=your_project_id

# Alerting (optional)
ALERT_EMAIL=admin@example.com
TWILIO_API_KEY=...  # For SMS alerts
```

---

### **File Structure (New Files):**

```
lib/
  ├── instagram-session-manager.ts      # Session validation & orchestration
  ├── instagram-session-renewer.ts      # Automated login & cookie extraction
  └── instagram-credential-storage.ts   # Environment variable updates

app/api/
  ├── admin/
  │   └── instagram/
  │       └── renew-session/
  │           └── route.ts              # Manual renewal endpoint
  └── cron/
      └── validate-instagram-session/
          └── route.ts                  # Scheduled validation

components/
  └── admin/
      └── InstagramRenewalInterface.tsx # Admin UI component
```

---

### **Implementation Priority:**

1. **Phase 1 (Week 1):** Session Manager + Manual Renewal Endpoint
   - Create validation logic
   - Build admin renewal page
   - Test manual renewal flow

2. **Phase 2 (Week 2):** Automated Renewal Integration
   - Integrate with existing scraping routes
   - Add retry logic on session failure
   - Test automatic renewal

3. **Phase 3 (Week 3):** Scheduled Validation + Alerting
   - Set up cron job
   - Add email/SMS alerts
   - Monitor and refine

4. **Phase 4 (Future):** Multi-Account Support
   - Database for credential storage
   - Session rotation
   - Backup account fallback

---

### **Code Snippets (Core Logic):**

#### **Session Validation:**
```typescript
async function validateSession(): Promise<SessionHealth> {
  const browser = await pwChromium.launch({ headless: true });
  const context = await browser.newContext();
  await injectInstagramSessionCookies(context);
  const page = await context.newPage();
  
  await page.goto('https://www.instagram.com/instagram/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  
  const url = page.url();
  const state = classifyInstagramPageState(url);
  
  await browser.close();
  
  return {
    isValid: state === 'PROFILE',
    state,
    timestamp: Date.now()
  };
}
```

#### **Cookie Extraction:**
```typescript
async function extractCookies(context: BrowserContext): Promise<SessionCredentials> {
  const cookies = await context.cookies('https://www.instagram.com');
  
  const sessionId = cookies.find(c => c.name === 'sessionid')?.value;
  const csrfToken = cookies.find(c => c.name === 'csrftoken')?.value;
  const dsUserId = cookies.find(c => c.name === 'ds_user_id')?.value;
  
  if (!sessionId) {
    throw new Error('sessionid cookie not found');
  }
  
  return { sessionId, csrfToken, dsUserId };
}
```

---

### **Security Considerations:**

1. **Credential Storage:**
   - Never log full session IDs
   - Encrypt passwords in transit
   - Use secure environment variable storage

2. **Admin Interface:**
   - Require authentication token
   - Rate limit renewal attempts
   - Log all renewal events

3. **2FA Handling:**
   - Never store 2FA codes
   - Require manual entry for challenges
   - Timeout after reasonable wait period

---

### **Testing Strategy:**

1. **Unit Tests:**
   - Session validation logic
   - Cookie extraction
   - State classification

2. **Integration Tests:**
   - Full renewal flow (with test account)
   - Error handling (expired session)
   - Retry logic

3. **Manual Testing:**
   - Admin renewal interface
   - 2FA challenge handling
   - Environment variable updates

---

## **Conclusion**

The current implementation is well-structured for browser-based scraping but lacks automated session management. The recommended **Option B (Integrated Refresher)** with **manual fallback (Option C)** provides the best balance of automation and reliability, especially given Instagram's 2FA challenges.

**Next Steps:**
1. Review and approve this implementation plan
2. Set up development environment with test Instagram account
3. Begin Phase 1 implementation (Session Manager + Manual Renewal)
4. Iterate based on testing and production feedback

---

**End of Audit Report**


