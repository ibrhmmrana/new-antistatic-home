# Instagram Session Automation - Quick Setup Guide

## ✅ What's Been Built

1. ✅ **Session Service** - Playwright automation for Instagram login
2. ✅ **API Endpoints** - Refresh, status, and manual endpoints
3. ✅ **Environment Manager** - Updates `.env.local` automatically
4. ✅ **Webhook Integration** - Sends credentials to n8n
5. ✅ **Frontend Integration** - Status indicators on `/new-test` page
6. ✅ **Existing Scraper Integration** - Works seamlessly with current code

## 🚀 Quick Start

### 1. Install Dependencies

**For Local Development:**
```bash
npm install
# Playwright browsers are automatically installed via postinstall script
```

**For Vercel/Serverless:**
- No additional setup needed! The code automatically uses `@sparticuz/chromium` for serverless environments
- The `postinstall` script is skipped on Vercel (not needed)
- Browser binaries are bundled with `@sparticuz/chromium`

**For Traditional Servers (non-serverless):**
If deploying to a traditional server and browsers aren't installed, SSH into the server and run:
```bash
cd /path/to/your/app
npm install
# Or manually: npx playwright install chromium
```

### 2. Add Environment Variables to `.env.local`

```env
# Required for automation
INSTAGRAM_USERNAME=your_instagram_username
INSTAGRAM_PASSWORD=your_instagram_password

# Optional - for 2FA
INSTAGRAM_2FA_BACKUP_CODE=your_backup_code_if_2fa_enabled

# Browser mode (optional, defaults to headless=true)
# Set to 'false' to run in headful mode (visible browser) - useful for debugging
INSTAGRAM_AUTOMATION_HEADLESS=true

# Webhook configuration
INSTAGRAM_WEBHOOK_URL=https://ai.intakt.co.za/webhook/instagram-scraper
INSTAGRAM_WEBHOOK_SECRET=optional_secret_for_webhook

# API security (required for refresh endpoint)
SESSION_REFRESH_API_KEY=your_secure_random_key_here

# These will be auto-updated by the system
INSTAGRAM_SESSION_ID=...
INSTAGRAM_CSRF_TOKEN=...
INSTAGRAM_DS_USER_ID=...
```

### 3. Test Manual Refresh

```bash
# Headless mode (default)
curl -X POST http://localhost:3000/api/instagram/session/refresh \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json"

# Headful mode (visible browser - useful for debugging)
curl -X POST "http://localhost:3000/api/instagram/session/refresh?headful=true" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json"
```

Or use the frontend at `/new-test` - click "Refresh Session" button. You'll be prompted to choose headful or headless mode.

### 4. Set Up n8n Cron Job

**Schedule:** Every 6 hours (`0 */6 * * *`)

**HTTP Request Node:**
- Method: `POST`
- URL: `https://your-domain.com/api/instagram/session/refresh`
- Headers:
  - `X-API-Key`: `[SESSION_REFRESH_API_KEY]`
  - `Content-Type`: `application/json`

**Health Check (Optional):**
- Schedule: Every hour (`0 * * * *`)
- Method: `GET`
- URL: `https://your-domain.com/api/instagram/session/status`
- Alert if: `needs_refresh === true` or `healthy === false`

## 📋 API Endpoints

### POST `/api/instagram/session/refresh`
Refreshes session automatically.

**Headers:**
- `X-API-Key`: Required (matches `SESSION_REFRESH_API_KEY`)

**Response:**
```json
{
  "success": true,
  "message": "Session refreshed successfully",
  "session": { ... },
  "steps": { ... },
  "duration_ms": 12345
}
```

### GET `/api/instagram/session/status`
Checks current session health.

**Response:**
```json
{
  "healthy": true,
  "message": "Session is valid",
  "session_age_hours": 2.5,
  "needs_refresh": false,
  "has_session": true
}
```

### POST `/api/instagram/session/manual`
Manual session creation for testing.

**Body:**
```json
{
  "username": "your_username",
  "password": "your_password"
}
```

## 🔍 Frontend Features

Visit `/new-test` page:
- **Session Status Indicator** - Shows green (healthy) or yellow (needs refresh)
- **Session Age** - Displays how old the current session is
- **Refresh Button** - Manually trigger session refresh

## 🐛 Troubleshooting

### "Rate limit" Error
Wait 5 minutes between refresh attempts.

### "2FA challenge detected"
Add `INSTAGRAM_2FA_BACKUP_CODE` to `.env.local`.

### "Login failed"
- Check credentials are correct
- Check if Instagram is blocking automated logins
- Try logging in manually first to verify account isn't locked

### Webhook Not Working
- Check `INSTAGRAM_WEBHOOK_URL` is correct
- Verify server can reach webhook URL
- Check webhook logs in n8n

### Environment Variables Not Updating
- Check `.env.local` file permissions
- Verify file is writable
- Check server logs for errors

### Browser Installation Error (Fixed for Vercel)

**Error:** `Executable doesn't exist at .../chromium_headless_shell-...`

**Solution:** This has been fixed! The code now automatically detects serverless environments (Vercel) and uses `@sparticuz/chromium` instead of requiring Playwright browser binaries.

**How it works:**
- **On Vercel/Serverless:** Automatically uses `playwright-core` + `@sparticuz/chromium` (no browser installation needed)
- **On Local/Traditional Servers:** Uses regular Playwright (requires `npx playwright install chromium`)

**If you still see this error:**
1. Make sure `@sparticuz/chromium` is installed: `npm install @sparticuz/chromium`
2. For traditional servers (not Vercel), run: `npx playwright install chromium`
3. Check that `playwright-core` is installed: `npm install playwright-core`

## 📚 Full Documentation

See `INSTAGRAM_SESSION_AUTOMATION.md` for complete documentation.

## 🎯 Next Steps

1. ✅ Configure environment variables
2. ✅ Install Playwright: `npx playwright install chromium`
3. ✅ Test manual refresh
4. ✅ Set up n8n cron job
5. ✅ Monitor session health

## 🔐 Security Notes

- **Never commit `.env.local`** - Already in `.gitignore`
- **Use strong API key** - Generate random string for `SESSION_REFRESH_API_KEY`
- **Protect webhook secret** - If using webhook authentication
- **Rate limiting** - Built-in 5-minute cooldown prevents abuse
