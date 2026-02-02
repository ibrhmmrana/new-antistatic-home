# Stripe integration (paywall → Checkout)

When a user clicks **Get started** on the paywall (Essential Monitoring or Full engine), the app creates a Stripe Checkout Session and redirects them to Stripe’s payment page. After payment, Stripe redirects back to your site.

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

You need two **recurring** prices (monthly) that match your plans:

| Plan               | Amount | Billing   |
|--------------------|--------|-----------|
| Essential Monitoring | R499   | Monthly   |
| Full engine        | R999   | Monthly   |

**In Stripe Dashboard:**

1. Go to **Product catalog → Products**.
2. **Add product** → **Essential Monitoring**
   - Price: **Recurring**, **Monthly**, **R499** (or your currency).
   - After saving, open the product and copy the **Price ID** (e.g. `price_1ABC...`).  
     → This is `STRIPE_PRICE_ESSENTIAL`.
3. **Add product** → **Full engine**
   - Price: **Recurring**, **Monthly**, **R999**.
   - Copy the **Price ID**.  
     → This is `STRIPE_PRICE_FULL_ENGINE`.

### 4. Add environment variables

In your project root, create or edit `.env.local` and add:

```env
# Stripe (server-only; never commit the secret key)
# Paste your Secret key from Dashboard → Developers → API keys (starts with sk_test_ or sk_live_)
STRIPE_SECRET_KEY=your_secret_key_from_stripe_dashboard

# Price IDs from Stripe Dashboard (Products → [product] → Price ID)
STRIPE_PRICE_ESSENTIAL=your_essential_price_id
STRIPE_PRICE_FULL_ENGINE=your_full_engine_price_id
```

**Optional (for success/cancel redirect URLs):**

If your app is served from a different URL in production (e.g. `https://antistatic.ai`), set:

```env
NEXT_PUBLIC_APP_URL=https://antistatic.ai
```

Then Stripe will redirect to `https://antistatic.ai/report?session_id=...` after payment. If you don’t set this, the redirect uses the request host (e.g. `localhost:3000` in dev).

### 5. Restart the dev server

After changing `.env.local`:

```bash
npm run dev
```

### 6. Test the flow

1. Open a report page and open the paywall (e.g. **Unlock full report** in the pill).
2. Click **Get started** on **Essential Monitoring** or **Full engine**.
3. You should be redirected to Stripe Checkout.
4. In **test mode**, use Stripe’s test card: `4242 4242 4242 4242` (any future expiry, any CVC).

---

## Flow summary

1. User clicks **Get started** on a plan → frontend calls `POST /api/stripe/checkout` with `{ plan: "essential" }` or `{ plan: "full_engine" }`.
2. API creates a Stripe Checkout Session (subscription) with the corresponding Price ID and returns `{ url }`.
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
| “Stripe Price ID not configured for plan” | `STRIPE_PRICE_ESSENTIAL` and `STRIPE_PRICE_FULL_ENGINE` are set and match the Price IDs in the Stripe Dashboard. |
| Redirect goes to wrong URL | Set `NEXT_PUBLIC_APP_URL` to your production URL (e.g. `https://antistatic.ai`). |
| Checkout shows wrong amount/currency | In Stripe Dashboard, check the Price for each product (amount, currency, interval). |
