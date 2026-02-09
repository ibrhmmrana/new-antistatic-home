import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { verifyEmailProof } from "@/lib/auth/verifyEmailProof";

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
 * Requires verified email (email_proof cookie). Creates subscription with 14-day trial, card collected up front.
 * Body: { plan: "essential" | "full_engine", country?: string, scanId?: string, placeId?: string, reportId?: string, email?: string }
 * Returns: { url: string } — Stripe Checkout URL to redirect the user to.
 */
export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe is not configured (STRIPE_SECRET_KEY missing)." },
      { status: 503 }
    );
  }

  const proof = await verifyEmailProof(request);
  if (!proof.valid || !proof.payload?.email) {
    return NextResponse.json(
      { error: "EMAIL_NOT_VERIFIED" },
      { status: 401 }
    );
  }
  if (proof.payload.purpose !== "unlock_report") {
    return NextResponse.json(
      { error: "EMAIL_NOT_VERIFIED" },
      { status: 401 }
    );
  }

  const verifiedEmail = proof.payload.email;

  let body: {
    plan?: string;
    country?: string;
    scanId?: string;
    placeId?: string;
    reportId?: string;
    email?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (typeof body.email === "string" && body.email.trim()) {
    if (body.email.trim().toLowerCase() !== verifiedEmail.toLowerCase()) {
      return NextResponse.json(
        { error: "EMAIL_MISMATCH" },
        { status: 400 }
      );
    }
  }

  const plan = body.plan as PlanId | undefined;
  if (!plan || !PLANS_ZA[plan]) {
    return NextResponse.json(
      { error: "Invalid or missing plan. Use 'essential' or 'full_engine'." },
      { status: 400 }
    );
  }

  const scanId = typeof body.scanId === "string" ? body.scanId.trim() || undefined : undefined;
  const placeId = typeof body.placeId === "string" ? body.placeId.trim() || undefined : undefined;
  const reportId = typeof body.reportId === "string" ? body.reportId.trim() || undefined : undefined;

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

  const appBaseUrl = process.env.STRIPE_SUCCESS_BASE_URL || "https://app.antistatic.ai";
  const appBase = appBaseUrl.replace(/\/$/, "");

  const successUrl =
    `${appBase}/onboarding?session_id={CHECKOUT_SESSION_ID}&plan=${encodeURIComponent(plan)}&source=landing` +
    (scanId ? `&scanId=${encodeURIComponent(scanId)}` : "") +
    (placeId ? `&placeId=${encodeURIComponent(placeId)}` : "") +
    (reportId ? `&reportId=${encodeURIComponent(reportId)}` : "");

  const cancelUrl = scanId
    ? `${origin}/report/${scanId}/analysis${placeId ? `?placeId=${encodeURIComponent(placeId)}` : ""}`
    : `${origin}/report`;

  const sessionMetadata: Record<string, string> = {
    plan,
    source: "landing",
  };
  if (scanId) sessionMetadata.scanId = scanId;
  if (placeId) sessionMetadata.placeId = placeId;
  if (reportId) sessionMetadata.reportId = reportId;

  const subscriptionMetadata: Record<string, string> = {
    plan,
    source: "landing",
  };
  if (scanId) subscriptionMetadata.scanId = scanId;
  if (placeId) subscriptionMetadata.placeId = placeId;
  if (reportId) subscriptionMetadata.reportId = reportId;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_collection: "always",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 14,
        metadata: subscriptionMetadata,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      metadata: sessionMetadata,
      customer_email: verifiedEmail,
      client_reference_id: verifiedEmail,
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
