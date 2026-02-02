import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover",
});

/** ZA = South Africa (R499/R999); rest of world uses USD ($29/$99) */
const PLANS_ZA = {
  essential: process.env.STRIPE_PRICE_ESSENTIAL!,
  full_engine: process.env.STRIPE_PRICE_FULL_ENGINE!,
} as const;

const PLANS_USD = {
  essential: process.env.STRIPE_PRICE_ESSENTIAL_USD!,
  full_engine: process.env.STRIPE_PRICE_FULL_ENGINE_USD!,
} as const;

type PlanId = keyof typeof PLANS_ZA;

/**
 * POST /api/stripe/checkout
 * Body: { plan: "essential" | "full_engine", country?: string, email?: string }
 * Returns: { url: string } — Stripe Checkout URL to redirect the user to.
 * Uses ZA price IDs when country is "ZA", otherwise USD price IDs.
 */
export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe is not configured (STRIPE_SECRET_KEY missing)." },
      { status: 503 }
    );
  }

  let body: { plan?: string; country?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const plan = body.plan as PlanId | undefined;
  if (!plan || !PLANS_ZA[plan]) {
    return NextResponse.json(
      { error: "Invalid or missing plan. Use 'essential' or 'full_engine'." },
      { status: 400 }
    );
  }

  /** Optional: prefill Stripe Checkout with email; also used as client_reference_id for app.antistatic.ai to find/link user */
  const customerEmail = typeof body.email === "string" && body.email.trim() ? body.email.trim() : undefined;

  const isZA = (body.country ?? "").toUpperCase() === "ZA";
  const priceId = isZA ? PLANS_ZA[plan] : PLANS_USD[plan];
  if (!priceId) {
    return NextResponse.json(
      { error: `Stripe Price ID not configured for plan: ${plan} (${isZA ? "ZA" : "USD"}).` },
      { status: 503 }
    );
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    (forwardedProto && forwardedHost ? `${forwardedProto}://${forwardedHost}` : request.nextUrl.origin);

  /** After payment, send user to app.antistatic.ai so they get an account and plan assigned (see STRIPE_APP_ONBOARDING.md) */
  const appBaseUrl = process.env.STRIPE_SUCCESS_BASE_URL || "https://app.antistatic.ai";
  const successUrl = `${appBaseUrl}/onboarding?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/report`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      /** So app.antistatic.ai can assign the correct plan when handling webhook or onboarding page */
      metadata: { plan },
      /** Optional: prefill email in Checkout; app can use this to create/find user */
      ...(customerEmail && { customer_email: customerEmail }),
      /** So app.antistatic.ai can link this payment to a user (e.g. email or internal user id) */
      ...(customerEmail && { client_reference_id: customerEmail }),
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/checkout]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Checkout session creation failed." },
      { status: 500 }
    );
  }
}
