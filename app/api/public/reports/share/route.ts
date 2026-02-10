import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendShareReportEmail } from "@/lib/ses/sendShareReportEmail";
import { verifyEmailProof } from "@/lib/auth/verifyEmailProof";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://www.antistatic.ai";

/** Derive a display name from verified email (e.g. "john.doe@company.com" -> "John") */
function sharerDisplayNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim() || "";
  if (!local) return "";
  const name = local.replace(/[._]/g, " ").trim();
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

/**
 * POST /api/public/reports/share
 * Send a report link to a recipient via email. No auth required (sharing is frictionless).
 * If the request includes a valid email_proof cookie, the sharer's name (from email) is used in the email copy.
 * Body: { reportId: string, recipientEmail: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reportId, recipientEmail } = body as {
      reportId?: string;
      recipientEmail?: string;
    };

    // Validate required fields
    if (!reportId || typeof reportId !== "string") {
      return NextResponse.json({ error: "reportId is required." }, { status: 400 });
    }
    if (
      !recipientEmail ||
      typeof recipientEmail !== "string" ||
      !recipientEmail.includes("@") ||
      !recipientEmail.includes(".")
    ) {
      return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
    }

    // Optional: get sharer name from verified email cookie
    let sharerDisplayName: string | null = null;
    const proof = await verifyEmailProof(request);
    if (proof.valid && proof.payload?.email) {
      sharerDisplayName = sharerDisplayNameFromEmail(proof.payload.email) || null;
    }

    // Look up business name from the report
    const supabase = getSupabaseAdmin();
    const { data, error: dbError } = await supabase
      .from("analysis_reports")
      .select("business_name")
      .eq("report_id", reportId)
      .single();

    if (dbError || !data) {
      console.error("[REPORTS SHARE] Report not found:", dbError?.message || "No data");
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    const businessName: string | null = data.business_name ?? null;
    const reportUrl = `${BASE_URL.replace(/\/$/, "")}/r/${reportId}`;

    // Send the email
    await sendShareReportEmail({
      to: recipientEmail.trim(),
      reportUrl,
      businessName,
      sharerDisplayName,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[REPORTS SHARE] Error:", error);
    return NextResponse.json({ error: "Failed to send email. Please try again." }, { status: 500 });
  }
}
