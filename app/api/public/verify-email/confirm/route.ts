import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCode } from "@/lib/email-verification";
import { SignJWT } from "jose";

// Initialize Supabase client lazily to avoid build-time errors
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase configuration is missing");
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
}

const EMAIL_PROOF_SECRET = process.env.EMAIL_PROOF_SECRET || "change-this-secret-in-production";

// Rate limiting: max confirm attempts per IP per minute (reduces code brute-force)
const confirmRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const CONFIRM_RATE_WINDOW_MS = 60 * 1000;
const CONFIRM_RATE_MAX = 10;

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

function checkConfirmRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = confirmRateLimitMap.get(ip);
  if (!record || now > record.resetAt) {
    confirmRateLimitMap.set(ip, { count: 1, resetAt: now + CONFIRM_RATE_WINDOW_MS });
    return true;
  }
  if (record.count >= CONFIRM_RATE_MAX) return false;
  record.count++;
  return true;
}

async function createProofToken(email: string, challengeId: string, placeId?: string): Promise<string> {
  const secret = new TextEncoder().encode(EMAIL_PROOF_SECRET);
  
  const token = await new SignJWT({
    email,
    purpose: "unlock_report",
    challengeId,
    placeId: placeId || null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(secret);

  return token;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!checkConfirmRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again in a minute." },
      { status: 429 }
    );
  }
  try {
    const body = await request.json();
    const { challengeId, code } = body;

    if (!challengeId || !code || code.length !== 4) {
      return NextResponse.json(
        { error: "Valid challengeId and 4-digit code are required" },
        { status: 400 }
      );
    }

    // Fetch challenge from database
    const supabase = getSupabaseClient();
    const { data: challenge, error: fetchError } = await supabase
      .from("email_verification_challenges")
      .select("*")
      .eq("id", challengeId)
      .single();

    if (fetchError || !challenge) {
      return NextResponse.json(
        { error: "Invalid verification challenge" },
        { status: 400 }
      );
    }

    // Check if already consumed
    if (challenge.consumed_at) {
      return NextResponse.json(
        { error: "This verification code has already been used" },
        { status: 400 }
      );
    }

    // Check if expired
    if (new Date(challenge.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Verification code has expired. Please request a new one." },
        { status: 400 }
      );
    }

    // Check attempts
    if (challenge.attempts >= 5) {
      return NextResponse.json(
        { error: "Too many failed attempts. Please request a new code." },
        { status: 400 }
      );
    }

    // Verify code
    const isValid = verifyCode(code, challenge.code_hash);

    if (!isValid) {
      // Increment attempts
      await supabase
        .from("email_verification_challenges")
        .update({ attempts: challenge.attempts + 1 })
        .eq("id", challengeId);

      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 400 }
      );
    }

    // Mark as consumed
    await supabase
      .from("email_verification_challenges")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", challengeId);

    // Create proof token
    const proofToken = await createProofToken(
      challenge.email,
      challengeId,
      challenge.place_id || undefined
    );

    // Set httpOnly cookie
    const response = NextResponse.json({
      success: true,
      proofToken, // Also return for client fallback
    });

    response.cookies.set("email_proof", proofToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 60, // 30 minutes
      path: "/",
    });

    return response;
  } catch (error: any) {
    console.error("Confirm error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
