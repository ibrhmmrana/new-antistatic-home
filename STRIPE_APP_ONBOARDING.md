# Assigning plan and account on app.antistatic.ai after Stripe payment

After a user pays on Stripe (from this landing/report app), they should land on **app.antistatic.ai** with an account and the correct plan (Essential or Full engine) assigned in their dashboard. This doc describes what **app.antistatic.ai** (the other webapp) needs to implement.

---

## Flow overview

1. User pays on Stripe Checkout (from this repo’s paywall).
2. Stripe redirects to **app.antistatic.ai** with `session_id` (success URL).
3. **app.antistatic.ai** must:
   - Verify the Stripe Checkout Session (using the same Stripe secret key).
   - Get the customer email and the plan from the session.
   - Create or find the user and assign the plan in your DB.
   - Log them in (or send a “set password” / magic link) and show the dashboard.

You can do this in two ways (or both):

- **A. Success page (onboarding)** – User lands on app.antistatic.ai with `?session_id=...`; your server verifies the session and provisions the account/plan.
- **B. Stripe webhook** – Stripe sends `checkout.session.completed` to app.antistatic.ai; your server provisions the account/plan. More reliable (Stripe retries if your server was down).

Using **both** is recommended: webhook for reliable provisioning, success page for good UX (e.g. “Setting up your account…” then redirect to dashboard).

---

## What this repo sends to Stripe

When creating the Checkout Session (in `app/api/stripe/checkout/route.ts`), we set:

- **success_url**: `https://app.antistatic.ai/onboarding?session_id={CHECKOUT_SESSION_ID}`  
  (Override with env `STRIPE_SUCCESS_BASE_URL` if your app URL is different.)
- **metadata.plan**: `"essential"` or `"full_engine"`  
  So app.antistatic.ai knows which plan to assign.
- **customer_email** (optional): If the paywall passes `email` in the request body, Stripe Checkout is prefilled and we set `client_reference_id` to that email so you can link the payment to a user.

So after payment, Stripe redirects to:

`https://app.antistatic.ai/onboarding?session_id=cs_xxxxx`

---

## Option A: Success page on app.antistatic.ai (recommended)

### 1. Route: e.g. `GET /onboarding?session_id=...`

When the user lands here after payment:

1. Read `session_id` from the query.
2. **Server-side**: Call Stripe to retrieve the session (with your **secret key**):

   ```ts
   const session = await stripe.checkout.sessions.retrieve(session_id, {
     expand: ['subscription'],
   });
   ```

3. Check:
   - `session.payment_status === 'paid'`
   - `session.mode === 'subscription'`
4. Get:
   - **Email**: `session.customer_details?.email` or `session.customer_email`
   - **Plan**: `session.metadata?.plan` (`"essential"` or `"full_engine"`)
   - Optional: `session.client_reference_id` (if you passed it from the landing app, e.g. email)
5. In your DB:
   - **Create or find user** by email.
   - **Assign plan** (e.g. store `plan: 'essential' | 'full_engine'` and/or Stripe `subscription.id` / `customer.id` for billing).
6. **Log the user in** (set session cookie / JWT) and redirect to dashboard (e.g. `/dashboard`).

If `session_id` is missing or invalid, or payment not completed, redirect to login or show an error.

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
   - Check `session.payment_status === 'paid'` and `session.mode === 'subscription'`.
   - Get **email**: `session.customer_details?.email` or `session.customer_email`.
   - Get **plan**: `session.metadata?.plan` (`"essential"` or `"full_engine"`).
   - In your DB: **create or find user** by email, **assign plan** (and optionally store `stripe_customer_id`, `stripe_subscription_id` for billing).
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
