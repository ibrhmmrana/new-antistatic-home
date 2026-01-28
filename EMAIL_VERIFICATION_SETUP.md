# Email OTP Verification Setup

This document describes the email OTP verification system for the public business analysis flow.

## Overview

The email verification system adds a security gate before starting the analysis process. Users must verify their email address via a 6-digit OTP code before analysis begins.

## Architecture

### Frontend Components

1. **EmailVerificationModal** (`components/report/EmailVerificationModal.tsx`)
   - Two-stage UI: email input → code verification
   - Handles resend logic with 30-second cooldown
   - Stores proof token in sessionStorage as fallback

2. **ReportScanClient** (`components/report/ReportScanClient.tsx`)
   - Shows verification modal after agents deploy (stage 0)
   - Only starts analysis after verification
   - Checks for existing verification on mount

### Backend API Routes

1. **POST /api/public/verify-email/request**
   - Accepts: `{ email, placeId, placeName, utm? }`
   - Rate limited: 3 requests per minute per IP+email
   - Creates challenge in Supabase
   - Sends OTP via AWS SES
   - Returns: `{ challengeId, resendAfterSeconds: 30 }`

2. **POST /api/public/verify-email/confirm**
   - Accepts: `{ challengeId, code }`
   - Validates code (max 5 attempts, 10min expiry)
   - Creates JWT proof token (30min expiry)
   - Sets httpOnly cookie + returns token
   - Returns: `{ success: true, proofToken }`

3. **POST /api/public/analysis/start**
   - Requires: Valid proof token (cookie or Bearer)
   - Accepts: `{ scanId, placeId, placeName, address }`
   - Triggers analysis pipeline
   - Returns: `{ success: true, jobId }`

### Database

**Table: `email_verification_challenges`**
- Stores verification challenges with hashed codes
- RLS enabled, server-only access
- Indexes on email+created_at, expires_at, place_id

## Setup Instructions

### 1. Install Dependencies

```bash
npm install @supabase/supabase-js jose @aws-sdk/client-ses
```

### 2. Environment Variables

Add to `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Email Verification
EMAIL_PROOF_SECRET=your-random-secret-key-min-32-chars
EMAIL_VERIFICATION_SALT=your-salt-for-code-hashing

# AWS SES
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
SES_FROM_EMAIL=noreply@yourdomain.com
```

### 3. Database Migration

Run the Supabase migration:

```bash
# Via Supabase CLI
supabase migration up

# Or manually execute:
supabase/migrations/001_create_email_verification_challenges.sql
```

### 4. AWS SES Configuration

1. Verify your sending domain/email in AWS SES
2. Move out of SES sandbox (if needed) to send to any email
3. Configure IAM user with `ses:SendEmail` permission
4. Set `SES_FROM_EMAIL` to verified email/domain

### 5. Verify Routes

Test the endpoints:

```bash
# Request code
curl -X POST http://localhost:3000/api/public/verify-email/request \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","placeId":"test123","placeName":"Test Business"}'

# Confirm code (use challengeId from above)
curl -X POST http://localhost:3000/api/public/verify-email/confirm \
  -H "Content-Type: application/json" \
  -d '{"challengeId":"...","code":"123456"}'

# Start analysis (requires proof token)
curl -X POST http://localhost:3000/api/public/analysis/start \
  -H "Content-Type: application/json" \
  -H "Cookie: email_proof=..." \
  -d '{"scanId":"...","placeId":"...","placeName":"...","address":"..."}'
```

## Security Considerations

1. **Code Hashing**: Codes are hashed with SHA-256 + salt before storage
2. **Rate Limiting**: 3 requests/minute per IP+email (in-memory, consider Redis for production)
3. **Token Expiry**: Proof tokens expire after 30 minutes
4. **Challenge Expiry**: Codes expire after 10 minutes
5. **Attempt Limits**: Max 5 failed attempts per challenge
6. **httpOnly Cookies**: Prevents XSS attacks on proof tokens
7. **RLS**: Database table is server-only, no client access

## Production Checklist

- [ ] Set strong `EMAIL_PROOF_SECRET` (min 32 chars, random)
- [ ] Set strong `EMAIL_VERIFICATION_SALT`
- [ ] Move AWS SES out of sandbox
- [ ] Configure proper rate limiting (Redis recommended)
- [ ] Set up monitoring for failed verifications
- [ ] Configure email templates in SES
- [ ] Test email delivery across providers
- [ ] Set up alerts for high failure rates
- [ ] Review and test RLS policies
- [ ] Configure CORS if needed for API routes

## Troubleshooting

### Emails not sending
- Check AWS SES configuration
- Verify email/domain in SES
- Check CloudWatch logs for SES errors
- Ensure IAM permissions are correct

### Codes not verifying
- Check code hashing matches (same salt)
- Verify challenge not expired
- Check attempts < 5
- Verify challenge not already consumed

### Proof token invalid
- Check token not expired (30min)
- Verify `EMAIL_PROOF_SECRET` matches
- Check cookie is being sent (httpOnly)
- Verify purpose === 'unlock_report'

## Future Enhancements

- [ ] Redis-based rate limiting
- [ ] Email template customization
- [ ] SMS OTP option
- [ ] Webhook for analysis completion
- [ ] Analytics tracking
- [ ] A/B testing for UX
