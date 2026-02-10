# Stripe integration (paywall → Checkout)

When a user clicks **Get started** on the paywall (Essential Monitoring or Full Engine), the app creates a Stripe Checkout Session and redirects them to Stripe’s payment page. After payment, Stripe redirects back to your site.

---

## What you need to do

### 1. Create a Stripe account (if you don’t have one)

- Go to [https://dashboard.stripe.com/register](https://dashboard.stripe.com/register).
- Complete signup and verify your email.

### 2. Get your API keys

- In the Stripe Dashboard, open **Developers → API keys**.
- Copy:
  - **Secret key** (starts with `sk_test_` in test mode, `sk_live_` in live mode).  
    → You’ll use this as `STRIPE_SECRET_KEY` (server-only; never expose it in the browser).

You don’t need the Publishable key for the current flow (redirect to Checkout). You only need it if you later add Stripe.js on the frontend.

### 3. Create Products and Prices in Stripe

Pricing is **country-specific**: South Africa (ZA) sees ZAR prices; the rest of the world sees USD. You need **four** recurring monthly prices:

| Plan               | Region | Amount | Env variable                |
|--------------------|--------|--------|-----------------------------|
| Essential Monitoring | ZA (ZAR) | R499/m | `STRIPE_PRICE_ESSENTIAL`   |
| Full Engine        | ZA (ZAR) | R999/m | `STRIPE_PRICE_FULL_ENGINE` |
| Essential Monitoring | USD   | $29/m  | `STRIPE_PRICE_ESSENTIAL_USD` |
| Full Engine        | USD   | $99/m  | `STRIPE_PRICE_FULL_ENGINE_USD` |

**In Stripe Dashboard:**

1. Go to **Product catalog → Products**.
2. For **Essential Monitoring**: create two prices (one ZAR R499/month, one USD $29/month). Copy both Price IDs.
3. For **Full Engine**: create two prices (one ZAR R999/month, one USD $99/month). Copy both Price IDs.

### 4. Add environment variables

In your project root, create or edit `.env.local` and add:

```env
# Stripe (server-only; never commit the secret key)
STRIPE_SECRET_KEY=sk_test_...  # from Stripe Dashboard → Developers → API keys

# Price IDs from Stripe Dashboard (ZA = South Africa)
STRIPE_PRICE_ESSENTIAL=price_...  # ZAR price IDs from Stripe Dashboard
STRIPE_PRICE_FULL_ENGINE=price_...

# Price IDs for rest of world (USD)
STRIPE_PRICE_ESSENTIAL_USD=price_...
STRIPE_PRICE_FULL_ENGINE_USD=price_...
```

**Optional (for success/cancel redirect URLs):**

If your app is served from a different URL in production (e.g. `https://antistatic.ai`), set:

```env
NEXT_PUBLIC_APP_URL=https://antistatic.ai
```

Then Stripe will redirect to `https://antistatic.ai/report?session_id=...` after payment. If you don’t set this, the redirect uses the request host (e.g. `localhost:3000` in dev).

**Success URL (where the user lands after payment):**

By default, after payment Stripe redirects to **app.antistatic.ai** so the user can get an account and plan assigned there. See **STRIPE_APP_ONBOARDING.md** for what app.antistatic.ai must implement.

To use a different app URL, set:

```env
STRIPE_SUCCESS_BASE_URL=https://app.antistatic.ai
```

Success URL will be: `{STRIPE_SUCCESS_BASE_URL}/onboarding?session_id={CHECKOUT_SESSION_ID}`.

### 5. Restart the dev server

After changing `.env.local`:

```bash
npm run dev
```

### 6. Test the flow

1. Open a report page and open the paywall (e.g. **Unlock full report** in the pill).
2. Click **Get started** on **Essential Monitoring** or **Full Engine**.
3. You should be redirected to Stripe Checkout.
4. In **test mode**, use Stripe’s test card: `4242 4242 4242 4242` (any future expiry, any CVC).

---

## Flow summary

1. User clicks **Get started** on a plan → frontend calls `POST /api/stripe/checkout` with `{ plan: "essential" | "full_engine", country: "ZA" | "XX" | ... }`. Country comes from `/api/geo/country` (Cloudflare/Vercel headers).
2. API picks ZAR or USD Price ID based on `country === "ZA"`, creates a Stripe Checkout Session (subscription), and returns `{ url }`.
3. Frontend redirects to `url` (Stripe’s payment page).
4. User pays on Stripe; Stripe redirects to `success_url` (e.g. `/report?session_id=...`) or `cancel_url` (e.g. `/report`).

---

## Optional next steps

- **Webhooks**: To unlock the report or provision access when payment succeeds, add a Stripe webhook that listens for `checkout.session.completed` and then updates your DB or sends the user to the app. See [Stripe webhooks](https://docs.stripe.com/webhooks).
- **Success page**: You can add a dedicated page (e.g. `/report?session_id=...`) that reads `session_id`, optionally verifies the session with Stripe, and then shows “You’re in” or redirects to the app.
- **Customer portal**: For managing subscriptions (cancel, update payment method), use [Stripe Customer Portal](https://docs.stripe.com/customer-management/portal).

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| “Stripe is not configured” | `STRIPE_SECRET_KEY` is set in `.env.local` and the server was restarted. |
| “Stripe Price ID not configured for plan” | All four price IDs are set: `STRIPE_PRICE_ESSENTIAL`, `STRIPE_PRICE_FULL_ENGINE`, `STRIPE_PRICE_ESSENTIAL_USD`, `STRIPE_PRICE_FULL_ENGINE_USD`. |
| Redirect goes to wrong URL | Set `NEXT_PUBLIC_APP_URL` to your production URL (e.g. `https://antistatic.ai`). |
| Checkout shows wrong amount/currency | In Stripe Dashboard, check the Price for each product (amount, currency, interval). |
