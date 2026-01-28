import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateCode, hashCode } from "@/lib/email-verification";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// Initialize Supabase client lazily to avoid build-time errors
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase configuration is missing");
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Rate limiting: track requests per IP + email (in-memory, simple approach)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 3; // Max 3 requests per minute per IP+email

function getRateLimitKey(ip: string, email: string): string {
  return `${ip}:${email}`;
}

function checkRateLimit(ip: string, email: string): boolean {
  const key = getRateLimitKey(ip, email);
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

async function sendEmailViaSES(email: string, code: string): Promise<void> {
  const sesClient = new SESClient({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  const fromEmail = process.env.SES_FROM_EMAIL || "noreply@antistatic.ai";
  const fromEmailWithName = `Antistatic <${fromEmail}>`;
  const subject = "Your Antistatic Verification Code";
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Verify Your Email</h2>
      <p>Your verification code is:</p>
      <div style="background: #f3f4f6; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 20px 0; border-radius: 8px;">
        ${code}
      </div>
      <p style="color: #6b7280; font-size: 14px;">This code will expire in 10 minutes.</p>
      <p style="color: #6b7280; font-size: 14px;">If you didn't request this code, please ignore this email.</p>
    </div>
  `;
  const textBody = `Your verification code is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, please ignore this email.`;

  const command = new SendEmailCommand({
    Source: fromEmailWithName,
    Destination: {
      ToAddresses: [email],
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: "UTF-8",
      },
      Body: {
        Html: {
          Data: htmlBody,
          Charset: "UTF-8",
        },
        Text: {
          Data: textBody,
          Charset: "UTF-8",
        },
      },
    },
  });

  await sesClient.send(command);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, placeId, placeName, utm } = body;

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    // Get IP and user agent
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || 
               request.headers.get("x-real-ip") || 
               "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Check rate limit
    if (!checkRateLimit(ip, email)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again in a minute." },
        { status: 429 }
      );
    }

    // Generate code and hash
    const code = generateCode();
    const codeHash = hashCode(code);

    // Expires in 10 minutes
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Insert challenge into database
    const supabase = getSupabaseClient();
    const { data, error: dbError } = await supabase
      .from("email_verification_challenges")
      .insert({
        email,
        code_hash: codeHash,
        expires_at: expiresAt.toISOString(),
        attempts: 0,
        purpose: "unlock_report",
        place_id: placeId || null,
        ip,
        user_agent: userAgent,
      })
      .select("id")
      .single();

    if (dbError || !data) {
      console.error("Database error:", dbError);
      return NextResponse.json(
        { error: "Failed to create verification challenge" },
        { status: 500 }
      );
    }

    // Send email via SES
    try {
      await sendEmailViaSES(email, code);
    } catch (emailError: any) {
      console.error("SES error:", emailError);
      // Still return success to avoid revealing email issues, but log it
      // In production, you might want to handle this differently
    }

    return NextResponse.json({
      challengeId: data.id,
      resendAfterSeconds: 30,
    });
  } catch (error: any) {
    console.error("Request error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
