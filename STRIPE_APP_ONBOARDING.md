# Assigning plan and account on app.antistatic.ai after Stripe payment

After a user starts a trial or pays on Stripe (from this landing/report app), they should land on **app.antistatic.ai** with an account and the correct plan (Essential or Full engine) assigned in their dashboard. This doc describes what **app.antistatic.ai** (the other webapp) needs to implement.

---

## Flow overview

1. User clicks “Start 14-day free trial” on the landing paywall (email already verified via OTP).
2. Landing creates a Stripe Checkout **subscription** with **14-day trial**, **card collected up front** (`payment_method_collection: "always"`).
3. User completes Checkout; Stripe redirects to **app.antistatic.ai** with `session_id` and context params.
4. **app.antistatic.ai** must:
   - Retrieve the Checkout Session by `session_id` (Stripe API).
   - Read **email** and **metadata** from the session as source of truth.
   - Create or find the user, attach the subscription (trial), send set-password/sign-in link email.
   - Implement cancel, downgrade, and pay-now (trial and billing are handled in Stripe; app reflects plan and access).

You can do this in two ways (or both):

- **A. Success page (onboarding)** – User lands on app.antistatic.ai with `?session_id=...&plan=...&source=landing` (and optionally `scanId`, `placeId`, `reportId`); your server verifies the session and provisions the account/plan.
- **B. Stripe webhook** – Stripe sends `checkout.session.completed` to app.antistatic.ai; your server provisions the account/plan. More reliable (Stripe retries if your server was down).

Using **both** is recommended: webhook for reliable provisioning, success page for good UX (e.g. “Setting up your account…” then redirect to dashboard).

---

## What this repo sends to Stripe (landing checkout contract)

When creating the Checkout Session (in `app/api/stripe/checkout/route.ts`), the landing app sets:

- **mode**: `"subscription"`
- **payment_method_collection**: `"always"` — card is collected up front even though the first charge is after the trial.
- **subscription_data**:
  - **trial_period_days**: `14`
  - **metadata**: `plan`, `scanId` (if provided), `placeId` (if provided), `reportId` (if provided), `source: "landing"`
- **metadata** (session): same keys — `plan`, `scanId`, `placeId`, `reportId`, `source: "landing"` (only defined values are set).
- **customer_email**: verified email from `email_proof` cookie (required; checkout API enforces proof).
- **client_reference_id**: same verified email (for correlation on app side).
- **success_url**:  
  `{STRIPE_SUCCESS_BASE_URL}/onboarding?session_id={CHECKOUT_SESSION_ID}&plan=...&source=landing&scanId=...&placeId=...&reportId=...`  
  (Override with env `STRIPE_SUCCESS_BASE_URL` if your app URL is not `https://app.antistatic.ai`.)
- **cancel_url**: back to report page when possible, e.g. `{origin}/report/{scanId}/analysis?placeId=...` or `{origin}/report`.

So after the user completes Checkout, Stripe redirects to:

`https://app.antistatic.ai/onboarding?session_id=cs_xxxxx&plan=essential|full_engine&source=landing&scanId=...&placeId=...&reportId=...`

**app.antistatic.ai** should use the **Checkout Session** (and optionally the **Subscription**) as the source of truth for email and metadata — not the query params — and must:

- Retrieve the session by `session_id`.
- Read email from `session.customer_details?.email` or `session.customer_email`.
- Read plan and context from `session.metadata` (plan, scanId, placeId, reportId, source).
- Create or find the user, attach the subscription, start trial access, send set-password/sign-in link email.
- Implement cancel, downgrade, and pay-now (Stripe Billing Portal or your own UI; trial counts down 14 days and then auto-charges for the selected plan).

---

## Option A: Success page on app.antistatic.ai (recommended)

### 1. Route: e.g. `GET /onboarding?session_id=...`

When the user lands here after completing Checkout (trial or paid):

1. Read `session_id` from the query.
2. **Server-side**: Call Stripe to retrieve the session (with your **secret key**):

   ```ts
   const session = await stripe.checkout.sessions.retrieve(session_id, {
     expand: ['subscription'],
   });
   ```

3. Check:
   - `session.mode === 'subscription'`
   - `session.status === 'complete'` (trial subscriptions may have `payment_status === 'unpaid'` until the first charge after trial)
4. Get:
   - **Email**: `session.customer_details?.email` or `session.customer_email`
   - **Plan**: `session.metadata?.plan` (`"essential"` or `"full_engine"`)
   - **Context**: `session.metadata?.scanId`, `placeId`, `reportId`, `source` (all optional strings)
   - Optional: `session.client_reference_id` (same as email from landing)
5. In your DB:
   - **Create or find user** by email.
   - **Assign plan** and attach subscription (e.g. store `stripe_subscription_id`, `stripe_customer_id`; subscription may be in trial).
   - **Send set-password / sign-in link email** so the user can log in.
6. **Log the user in** (set session cookie / JWT) and redirect to dashboard (e.g. `/dashboard`), or redirect to login with a message that an email was sent.

If `session_id` is missing or invalid, or session not complete, redirect to login or show an error.

### 2. Optional: collect password on onboarding

If you don’t have a password yet, you can:

- Show a short “Set your password” form on `/onboarding` (after verifying the session), then create the user and log them in, then redirect to dashboard.
- Or create the user with a random password and send a “Set your password” link by email; then redirect to login.

---

## Option B: Stripe webhook on app.antistatic.ai (recommended for reliability)

### 1. Webhook endpoint: e.g. `POST /api/webhooks/stripe`

- In **Stripe Dashboard → Developers → Webhooks**, add endpoint:  
  `https://app.antistatic.ai/api/webhooks/stripe`
- Subscribe to **`checkout.session.completed`**.
- Stripe will send a signing secret (e.g. `whsec_...`). Store it as `STRIPE_WEBHOOK_SECRET` on app.antistatic.ai.

### 2. Handler logic

1. **Verify signature** using `STRIPE_WEBHOOK_SECRET` and the raw body (see [Stripe webhooks – Verify signature](https://docs.stripe.com/webhooks/signatures)).
2. If event type is `checkout.session.completed`:
   - `const session = event.data.object;`
   - Check `session.mode === 'subscription'` and `session.status === 'complete'` (trial subs may have `payment_status === 'unpaid'`).
   - Get **email**: `session.customer_details?.email` or `session.customer_email`.
   - Get **plan** and context: `session.metadata?.plan`, `scanId`, `placeId`, `reportId`, `source`.
   - In your DB: **create or find user** by email, **assign plan**, attach subscription (trial or active), send set-password/sign-in email if desired.
3. Return 200 quickly so Stripe doesn’t retry.

If you use both webhook and success page, make the logic **idempotent**: “create or update user by email and set plan” so it’s safe if both run.

---

## Shared requirements on app.antistatic.ai

- **Stripe secret key**: Same as in this repo (`STRIPE_SECRET_KEY`). Used to:
  - Retrieve the Checkout Session (success page).
  - Optionally create customers/subscriptions elsewhere (same Stripe account).
- **Database**: Store at least:
  - User: email, password (or “magic link” style), and **plan** (`essential` | `full_engine`).
  - Optionally: `stripe_customer_id`, `stripe_subscription_id` for future billing (portal, renewals).
- **Dashboard**: When the user is logged in, read their `plan` from the DB and show the correct features (Essential vs Full engine).

---

## Env on this repo (landing)

Optional:

- **STRIPE_SUCCESS_BASE_URL**  
  Base URL for the app where users land after payment. Default: `https://app.antistatic.ai`.  
  Success URL becomes: `{STRIPE_SUCCESS_BASE_URL}/onboarding?session_id={CHECKOUT_SESSION_ID}`.

So you only need to set this if the app URL is not `https://app.antistatic.ai`.

---

## Summary

| Step | Who | What |
|------|-----|------|
| 1 | This repo | Create Checkout with `metadata.plan`, `success_url` → app.antistatic.ai/onboarding?session_id=... |
| 2 | Stripe | User pays; redirect to app.antistatic.ai with `session_id`. |
| 3 | app.antistatic.ai | **Onboarding page**: retrieve session, get email + plan, create/find user, assign plan, log in, redirect to dashboard. |
| 4 | app.antistatic.ai | **Webhook** (optional but recommended): on `checkout.session.completed`, create/find user, assign plan (idempotent). |
| 5 | app.antistatic.ai | **Dashboard**: read user’s `plan` from DB and show the right features. |

If you tell me the stack of app.antistatic.ai (e.g. Next.js, Node, Laravel), I can outline the exact code (e.g. Next.js API route + page) for the onboarding route and the webhook.
