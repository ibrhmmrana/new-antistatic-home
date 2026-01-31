/**
 * POST /api/app-invite
 * Send app sign-in link to OTP-verified email via AWS SES.
 * Server-only: uses Supabase service role and SES.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyEmailProof } from "@/lib/auth/verifyEmailProof";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendAppInviteEmail } from "@/lib/ses/sendAppInviteEmail";

const APP_CALLBACK_URL =
  process.env.APP_BASE_URL?.replace(/\/$/, "") || "https://app.antistatic.ai";
const REDIRECT_TO = `${APP_CALLBACK_URL}/auth/callback?next=/set-password`;

export async function POST(request: NextRequest) {
  try {
    const proof = await verifyEmailProof(request);
    if (!proof.valid || !proof.payload?.email) {
      return NextResponse.json(
        { error: proof.error || "Invalid or expired verification" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const placeId = typeof body.placeId === "string" ? body.placeId : undefined;
    const scanId = typeof body.scanId === "string" ? body.scanId : undefined;

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "email is required and must be valid" },
        { status: 400 }
      );
    }

    const proofEmail = (proof.payload!.email || "").toLowerCase();
    if (proofEmail !== email.toLowerCase()) {
      return NextResponse.json(
        { error: "Email does not match verified account" },
        { status: 403 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Find user by email (list users and filter)
    const { data: listData } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const users = listData?.users ?? [];
    const existing = users.find(
      (u: { email?: string | null }) =>
        (u.email ?? "").toLowerCase() === email.toLowerCase()
    );

    if (!existing) {
      const { error: createError } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        password: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      });
      if (createError) {
        console.error("[APP-INVITE] createUser error:", createError);
        return NextResponse.json(
          { error: "Failed to create account" },
          { status: 500 }
        );
      }
    }

    const { data: linkData, error: linkError } =
      await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: REDIRECT_TO },
      });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("[APP-INVITE] generateLink error:", linkError);
      return NextResponse.json(
        { error: "Failed to generate sign-in link" },
        { status: 500 }
      );
    }

    const signInLink = linkData.properties.action_link;

    await sendAppInviteEmail({ to: email, signInLink });

    return NextResponse.json({
      ok: true,
      message: "Sign-in link sent to your email",
    });
  } catch (error) {
    console.error("[APP-INVITE] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
