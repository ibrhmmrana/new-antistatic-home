import path from "path";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

type PlanId = "essential" | "full_engine";

/**
 * POST /api/stripe/checkout
 * Body: { plan: "essential" | "full_engine" }
 * Returns: { url: string } — Stripe Checkout URL to redirect the user to.
 */
export async function POST(request: NextRequest) {
  let secretKey = process.env.STRIPE_SECRET_KEY;

  // If Next.js didn't load .env.local (e.g. when opened via /r/[id]), try loading it explicitly
  if (!secretKey || secretKey.trim() === "") {
    try {
      const { config } = await import("dotenv");
      const envPath = path.resolve(process.cwd(), ".env.local");
      config({ path: envPath });
      secretKey = process.env.STRIPE_SECRET_KEY;
    } catch {
      // dotenv failed; continue with empty key so we return the 503 below
    }
  }

  if (!secretKey || secretKey.trim() === "") {
    // Dev-only: show which STRIPE_* env keys Next.js has (names only) to debug loading
    const stripeEnvKeys = Object.keys(process.env).filter((k) => k.startsWith("STRIPE_"));
    const isDev = process.env.NODE_ENV === "development";
    return NextResponse.json(
      {
        error: "Stripe is not configured (STRIPE_SECRET_KEY missing).",
        ...(isDev && {
          debug: "Ensure .env.local is in the project root (same folder as package.json), has STRIPE_SECRET_KEY=sk_... with no spaces around =, and restart the dev server (npm run dev).",
          stripeEnvKeysPresent: stripeEnvKeys.length ? stripeEnvKeys : "(none – .env.local may not be loaded or file is in wrong place)",
        }),
      },
      { status: 503 }
    );
  }

  const priceIds: Record<PlanId, string | undefined> = {
    essential: process.env.STRIPE_PRICE_ESSENTIAL,
    full_engine: process.env.STRIPE_PRICE_FULL_ENGINE,
  };

  let body: { plan?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const plan = body.plan as PlanId | undefined;
  if (!plan || (plan !== "essential" && plan !== "full_engine")) {
    return NextResponse.json(
      { error: "Invalid or missing plan. Use 'essential' or 'full_engine'." },
      { status: 400 }
    );
  }

  const priceId = priceIds[plan];
  if (!priceId || priceId.trim() === "") {
    return NextResponse.json(
      { error: `Stripe Price ID not configured for plan: ${plan}.` },
      { status: 503 }
    );
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    (forwardedProto && forwardedHost ? `${forwardedProto}://${forwardedHost}` : request.nextUrl.origin);

  const successUrl = `${origin}/report?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/report`;

  const stripe = new Stripe(secretKey, {
    apiVersion: "2023-10-16",
  });

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
