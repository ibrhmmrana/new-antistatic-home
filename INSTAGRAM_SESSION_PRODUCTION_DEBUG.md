# Instagram Session Automation - Production Debugging Guide

## Problem Statement

The Instagram session refresh automation works perfectly **locally** but fails in **production on Vercel**. This document provides comprehensive context about the current implementation to help diagnose and fix the production issue.

---

## Current Architecture Overview

### Technology Stack

1. **Browser Automation**: Playwright Core (`playwright-core`) with serverless-compatible Chromium (`@sparticuz/chromium`)
2. **Framework**: Next.js 14.2.0 with API Routes (`runtime: "nodejs"`)
3. **Deployment**: Vercel (serverless functions)
4. **Package Versions**:
   - `playwright-core`: `^1.57.0`
   - `@sparticuz/chromium`: `^143.0.4`
   - `playwright`: `^1.58.0` (also installed but not used)

### Key Components

1. **Session Service** (`lib/services/instagram-session.ts`)
   - Core automation logic using Playwright
   - Handles login, cookie extraction, webhook sending
   - Singleton pattern for state management

2. **API Endpoint** (`app/api/instagram/session/refresh/route.ts`)
   - POST endpoint with API key authentication
   - Calls session service and updates environment variables
   - Returns masked session credentials

3. **Environment Manager** (`lib/services/env-manager.ts`)
   - Updates `.env.local` file with new credentials
   - Only works locally (file system access)

---

## How It Works Locally (✅ Working)

### Browser Launch Process

1. **Environment Detection**:
   ```typescript
   const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.FUNCTION_TARGET;
   ```
   - Locally: `isServerless = false`
   - Uses system Chromium or `CHROME_EXECUTABLE_PATH` if set

2. **Browser Launch**:
   ```typescript
   browser = await pwChromium.launch({
     headless: headlessMode,
     args: [
       '--no-sandbox',
       '--disable-setuid-sandbox',
       '--disable-blink-features=AutomationControlled',
       '--disable-dev-shm-usage',
       '--disable-web-security',
       '--disable-features=IsolateOrigins,site-per-process',
     ],
     executablePath: localExecutablePath || undefined, // Uses system Chromium
     timeout: 60000,
   });
   ```

3. **Login Flow**:
   - Navigates to `https://www.instagram.com/accounts/login/`
   - Fills username and password fields (multiple selector fallbacks)
   - Clicks submit button (3-strategy approach)
   - Handles 2FA if required
   - Extracts cookies: `sessionid`, `csrftoken`, `ds_user_id`

4. **Post-Processing**:
   - Updates `.env.local` file (works locally)
   - Sends credentials to webhook
   - Returns success response

### Local Environment Setup

- **Playwright Browsers**: Installed via `npx playwright install chromium`
- **File System**: Full read/write access to `.env.local`
- **Network**: Direct internet access
- **Memory**: No restrictions
- **Timeout**: 60 seconds for browser operations

---

## How It Should Work in Production (❌ Currently Failing)

### Expected Behavior on Vercel

1. **Environment Detection**:
   - `process.env.VERCEL` is set to `"1"` on Vercel
   - `isServerless = true`
   - Should use `@sparticuz/chromium.executablePath()`

2. **Browser Launch**:
   ```typescript
   const executablePath = isServerless
     ? await chromium.executablePath()  // Should return path to bundled Chromium
     : (localExecutablePath || undefined);
   
   browser = await pwChromium.launch({
     headless: headlessMode,
     args: [
       ...(isServerless ? chromium.args : []),  // Serverless-specific args
       '--no-sandbox',
       '--disable-setuid-sandbox',
       // ... other args
     ],
     executablePath,  // Should point to @sparticuz/chromium binary
     timeout: 60000,
   });
   ```

3. **Serverless Chromium**:
   - `@sparticuz/chromium` provides a pre-built Chromium binary optimized for AWS Lambda/Vercel
   - No need to run `npx playwright install` in production
   - Binary is bundled with the deployment

### Vercel Environment Constraints

- **File System**: Read-only (except `/tmp`)
- **Memory**: Limited (depends on plan)
- **Timeout**: 
  - Hobby: 10 seconds
  - Pro: 60 seconds
  - Enterprise: 300 seconds
- **Network**: Full internet access
- **Environment Variables**: Available via `process.env`

---

## Current Implementation Details

### Serverless Detection Logic

**File**: `lib/services/instagram-session.ts` (lines 91-100)

```typescript
// Detect serverless environment (Vercel, AWS Lambda, etc.)
const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.FUNCTION_TARGET;
const localExecutablePath = process.env.CHROME_EXECUTABLE_PATH;

// Use serverless-compatible Chromium if in serverless environment
const executablePath = isServerless
  ? await chromium.executablePath()
  : (localExecutablePath || undefined);

console.log(`[SESSION] Serverless environment: ${isServerless}, executable path: ${executablePath || 'default'}`);
```

### Browser Launch Configuration

**File**: `lib/services/instagram-session.ts` (lines 102-115)

```typescript
browser = await pwChromium.launch({
  headless: headlessMode,
  args: [
    ...(isServerless ? chromium.args : []),  // Adds serverless-specific args when needed
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
  ],
  executablePath,
  timeout: 60000,
});
```

### Comparison with Working Scraper

**File**: `app/api/test/instagram-scrape/route.ts` (lines 792-812)

This scraper **works in production** and uses the same approach:

```typescript
const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
const localExecutablePath = process.env.CHROME_EXECUTABLE_PATH;

const executablePath = isServerless
  ? await chromium.executablePath()
  : (localExecutablePath || undefined);

browser = await pwChromium.launch({
  headless: true,
  args: [
    ...(isServerless ? chromium.args : []),
    '--disable-blink-features=AutomationControlled',
    '--window-size=1920,1080',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
  ],
  executablePath,
  timeout: TIMEOUT_MS,
});
```

**Key Differences**:
- Working scraper uses `headless: true` (always headless)
- Session service allows `headless: false` via environment variable
- Both use same serverless detection logic
- Both use `@sparticuz/chromium`

---

## Known Issues & Potential Problems

### 1. Headless Mode Configuration

**Issue**: The session service allows headful mode (`headless: false`) which may not work in serverless environments.

**Code Location**: `lib/services/instagram-session.ts` (lines 85-89)

```typescript
const envValue = process.env.INSTAGRAM_AUTOMATION_HEADLESS;
const headlessMode = envValue !== 'false'; // 'false' string means headful (visible browser)
```

**Problem**: Vercel serverless functions don't support GUI applications. Even if `headless: false` is set, there's no display server available.

**Potential Fix**: Force headless mode in serverless environments:
```typescript
const headlessMode = isServerless ? true : (envValue !== 'false');
```

### 2. Environment Variable Override

**Issue**: The API endpoint temporarily modifies `process.env.INSTAGRAM_AUTOMATION_HEADLESS` which may not persist correctly in serverless.

**Code Location**: `app/api/instagram/session/refresh/route.ts` (lines 28-82)

**Problem**: In serverless environments, modifying `process.env` may not work as expected, and the changes might not propagate to the session service.

### 3. Timeout Constraints

**Issue**: Vercel Hobby plan has 10-second timeout, which is insufficient for browser automation.

**Current Timeout**: 60 seconds (lines 114, 140, 306)

**Problem**: If deployed on Hobby plan, the function will timeout before browser automation completes.

**Potential Fix**: Check Vercel plan and adjust timeout, or add timeout detection and early failure.

### 4. Memory Constraints

**Issue**: Browser automation is memory-intensive. Vercel serverless functions have limited memory.

**Current Configuration**: No explicit memory limits set.

**Problem**: Chromium may fail to launch if memory is insufficient.

**Potential Fix**: Add memory checks or use lighter browser options.

### 5. File System Access

**Issue**: Environment manager tries to write to `.env.local` which doesn't work in production.

**Code Location**: `lib/services/env-manager.ts`

**Current Behavior**: 
- Locally: Updates `.env.local` file ✅
- Production: Fails silently (non-blocking) ⚠️

**Impact**: Environment variables are not updated in production, but webhook is still sent.

### 6. Chromium Binary Path

**Issue**: `@sparticuz/chromium.executablePath()` may return incorrect path or fail in Vercel.

**Potential Problems**:
- Binary not bundled correctly
- Path resolution issues
- Permissions issues
- Architecture mismatch (x64 vs ARM)

**Debugging**: Check logs for `executablePath` value in production.

---

## Error Scenarios

### Scenario 1: Browser Launch Fails

**Error**: `browserType.launch: Executable doesn't exist at /path/to/chromium`

**Possible Causes**:
1. `@sparticuz/chromium` binary not bundled
2. Wrong executable path returned
3. Architecture mismatch
4. Permissions issue

**Debugging Steps**:
1. Check `executablePath` value in logs
2. Verify `@sparticuz/chromium` is in `package.json` dependencies
3. Check Vercel build logs for Chromium bundling
4. Verify Next.js config doesn't exclude Chromium

### Scenario 2: Timeout

**Error**: Function timeout before browser automation completes

**Possible Causes**:
1. Vercel plan has short timeout (Hobby = 10s)
2. Network latency to Instagram
3. Instagram rate limiting
4. Slow page load

**Debugging Steps**:
1. Check Vercel plan limits
2. Add timeout logging
3. Check network requests timing
4. Consider reducing wait times

### Scenario 3: Memory Exhaustion

**Error**: Function runs out of memory

**Possible Causes**:
1. Chromium binary too large
2. Multiple browser instances
3. Memory leak in Playwright

**Debugging Steps**:
1. Check Vercel function memory usage
2. Verify browser cleanup (finally block)
3. Check for memory leaks

### Scenario 4: Selector Not Found

**Error**: `Could not find username input field` or `Could not find submit button`

**Possible Causes**:
1. Instagram changed HTML structure
2. Page didn't load completely
3. JavaScript not executed
4. Anti-bot detection

**Debugging Steps**:
1. Check page content in logs (if headful mode)
2. Verify network requests completed
3. Check for Instagram blocking/challenge pages
4. Test selectors manually

---

## Debugging Information Needed

### 1. Production Logs

Check Vercel function logs for:
- `[SESSION] Serverless environment: true/false`
- `[SESSION] executable path: <path>`
- `[SESSION] Launching headless/headful browser...`
- Any error messages from Playwright
- Browser launch success/failure

### 2. Environment Variables

Verify these are set in Vercel:
- `INSTAGRAM_USERNAME`
- `INSTAGRAM_PASSWORD`
- `INSTAGRAM_2FA_BACKUP_CODE` (if needed)
- `INSTAGRAM_WEBHOOK_URL`
- `SESSION_REFRESH_API_KEY`
- `INSTAGRAM_AUTOMATION_HEADLESS` (should be `"true"` or unset)

### 3. Vercel Configuration

Check:
- Function timeout setting
- Memory allocation
- Node.js version
- Build configuration
- Environment detection (`process.env.VERCEL`)

### 4. Package Installation

Verify in Vercel build logs:
- `@sparticuz/chromium` is installed
- `playwright-core` is installed
- No errors during `npm install`

---

## Recommended Fixes

### Fix 1: Force Headless in Serverless

```typescript
// In lib/services/instagram-session.ts
const envValue = process.env.INSTAGRAM_AUTOMATION_HEADLESS;
const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.FUNCTION_TARGET;
const headlessMode = isServerless ? true : (envValue !== 'false');
```

### Fix 2: Add Better Error Handling

```typescript
try {
  const executablePath = isServerless
    ? await chromium.executablePath()
    : (localExecutablePath || undefined);
  
  if (isServerless && !executablePath) {
    throw new Error('Failed to get Chromium executable path in serverless environment');
  }
  
  console.log(`[SESSION] Serverless: ${isServerless}, Executable: ${executablePath || 'default'}`);
} catch (error) {
  console.error('[SESSION] Chromium executable path error:', error);
  throw new Error(`Chromium setup failed: ${error.message}`);
}
```

### Fix 3: Add Timeout Detection

```typescript
// Check Vercel timeout limits
const vercelTimeout = process.env.VERCEL ? 10000 : 60000; // Hobby plan default
const browserTimeout = Math.min(60000, vercelTimeout - 5000); // Leave 5s buffer

browser = await pwChromium.launch({
  // ... config
  timeout: browserTimeout,
});
```

### Fix 4: Verify Chromium Bundling

Add to `next.config.js`:
```javascript
module.exports = {
  // ... existing config
  experimental: {
    serverComponentsExternalPackages: ['@sparticuz/chromium', 'playwright-core'],
  },
};
```

### Fix 5: Add Production-Specific Logging

```typescript
if (isServerless) {
  console.log('[SESSION] Production environment detected');
  console.log('[SESSION] VERCEL:', process.env.VERCEL);
  console.log('[SESSION] NODE_ENV:', process.env.NODE_ENV);
  console.log('[SESSION] Chromium args:', chromium.args);
}
```

---

## Testing Strategy

### Local Testing (Simulating Production)

1. Set environment variable to simulate Vercel:
   ```bash
   export VERCEL=1
   ```

2. Test browser launch:
   ```typescript
   const isServerless = !!process.env.VERCEL;
   const executablePath = isServerless ? await chromium.executablePath() : undefined;
   console.log('Executable path:', executablePath);
   ```

3. Test with headless forced:
   ```typescript
   const headlessMode = isServerless ? true : false;
   ```

### Production Testing

1. Add detailed logging to API endpoint
2. Check Vercel function logs after deployment
3. Test with minimal timeout first
4. Gradually increase complexity

---

## Files to Review

1. **`lib/services/instagram-session.ts`** - Core automation logic
2. **`app/api/instagram/session/refresh/route.ts`** - API endpoint
3. **`app/api/test/instagram-scrape/route.ts`** - Working reference implementation
4. **`package.json`** - Dependencies
5. **`next.config.js`** - Next.js configuration
6. **Vercel dashboard** - Function logs and configuration

---

## Next Steps for Debugging

1. **Check Production Logs**: Review Vercel function logs for exact error messages
2. **Compare with Working Scraper**: Identify differences between working scraper and session service
3. **Test Chromium Path**: Verify `chromium.executablePath()` returns valid path in production
4. **Verify Timeout**: Check Vercel plan timeout limits
5. **Test Headless Mode**: Ensure headless is forced in serverless
6. **Add Debugging**: Add more detailed logging for production debugging

---

## Summary

The Instagram session automation uses Playwright Core with `@sparticuz/chromium` for serverless compatibility. It works locally but fails in production on Vercel. The most likely issues are:

1. **Headless mode not forced** in serverless environments
2. **Chromium executable path** issues
3. **Timeout constraints** on Vercel
4. **Environment variable override** not working correctly
5. **Memory constraints** in serverless functions

The working scraper (`app/api/test/instagram-scrape/route.ts`) provides a reference implementation that successfully runs in production, suggesting the approach is correct but there may be configuration differences.
