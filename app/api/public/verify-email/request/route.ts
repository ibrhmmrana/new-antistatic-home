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
  const supportEmail = process.env.SUPPORT_EMAIL || "hello@antistatic.ai";
  const logoUrl = "https://bmkdwnfrldoqvduhpgsu.supabase.co/storage/v1/object/public/Storage/antistatic-logo-on-white%20(1).png";
  const fromEmailWithName = `Antistatic <${fromEmail}>`;
  const subject = "Your Antistatic Verification Code";
  const htmlBody = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Verify your email</title>
  <style>
    @media (prefers-color-scheme: dark) {
      body, .bg { background:#0b0f19 !important; }
      .card { background:#111827 !important; border-color:#1f2937 !important; }
      .text { color:#f9fafb !important; }
      .muted { color:#9ca3af !important; }
      .rule { border-top-color:#1f2937 !important; }
      .codebox { background:#0b1220 !important; }
      .link { color:#93c5fd !important; }
    }
  </style>
</head>

<body style="margin:0;padding:0;background:#ffffff;">
  <!-- Preheader -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Your Antistatic verification code is ${code}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background:#ffffff;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
               class="card"
               style="width:600px;max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
          <tr>
            <td align="center" style="padding:34px 34px 26px 34px;">
              <!-- Logo -->
              <div style="text-align:center;margin-bottom:18px;">
                <img src="${logoUrl}"
                     width="200" height="33" alt="Antistatic"
                     style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;width:200px;height:33px;object-fit:contain;" />
              </div>

              <!-- Heading -->
              <h1 class="text"
                  style="margin:0 0 22px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                         font-size:24px;line-height:1.3;font-weight:600;color:#111827;text-align:center;">
                Verify your email to generate your business report
              </h1>

              <!-- Body copy -->
              <p class="text"
                 style="margin:0 0 12px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                        font-size:14px;line-height:1.6;color:#111827;text-align:center;">
                Use the 4-digit code below to confirm your email and start generating your analysis report.
              </p>

              <p class="text"
                 style="margin:0 0 18px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                        font-size:14px;line-height:1.6;color:#111827;text-align:center;">
                Enter this code in the original browser window:
              </p>

              <!-- Code box -->
              <div class="codebox"
                   style="background:#f3f4f6;border-radius:10px;padding:18px 16px;text-align:center;margin:0 auto 8px auto;">
                <span class="text"
                      style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                             font-size:24px;font-weight:600;letter-spacing:10px;color:#111827;display:inline-block;">
                  ${code}
                </span>
              </div>

              <p class="muted"
                 style="margin:12px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                        font-size:12px;line-height:1.6;color:#6b7280;text-align:center;">
                This code will expire in 10 minutes.
              </p>

              <!-- Divider -->
              <div class="rule" style="border-top:1px solid #e5e7eb;margin:28px 0 18px 0;"></div>

              <!-- Footer -->
              <p class="muted"
                 style="margin:0 0 10px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                        font-size:12px;line-height:1.6;color:#6b7280;text-align:center;">
                If you didn't request a business report, you can safely ignore this email.
                Don't share or forward this code to anyone.
              </p>

              <p class="muted"
                 style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                        font-size:12px;line-height:1.6;color:#6b7280;text-align:center;">
                Need help? Contact support at
                <a class="link" href="mailto:${supportEmail}" style="color:#2563eb;text-decoration:underline;">${supportEmail}</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  const textBody = `Your Antistatic verification code is: ${code}\n\nEnter this code in the original browser window. This code will expire in 10 minutes.\n\nIf you didn't request a business report, you can safely ignore this email. Need help? Contact ${supportEmail}.`;

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
        business_name: placeName && String(placeName).trim() ? String(placeName).trim() : null,
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
