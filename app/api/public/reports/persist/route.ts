import { NextRequest, NextResponse } from "next/server";
import { verifyEmailProof, proofErrorResponse } from "@/lib/auth/verifyEmailProof";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sanitizeForDb } from "@/lib/report/sanitizePayload";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://www.antistatic.ai";

export async function POST(request: NextRequest) {
  try {
    const proof = await verifyEmailProof(request);
    const errResp = proofErrorResponse(proof);
    if (errResp) return errResp;

    const body = await request.json();
    const {
      scanId,
      placeId,
      name,
      addr,
      report,
      sources,
    } = body as {
      scanId?: string;
      placeId?: string;
      name?: string;
      addr?: string;
      report?: unknown;
      sources?: Record<string, unknown>;
    };

    if (!scanId || !placeId) {
      return NextResponse.json(
        { error: "scanId and placeId are required" },
        { status: 400 }
      );
    }

    if (!report || typeof report !== "object") {
      return NextResponse.json(
        { error: "report object is required" },
        { status: 400 }
      );
    }

    const sanitizedReport = sanitizeForDb(report) as object;
    const sanitizedSources = sources
      ? (sanitizeForDb(sources) as Record<string, unknown>)
      : null;

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from("analysis_reports")
      .select("report_id")
      .eq("scan_id", scanId)
      .single();

    let reportId: string;

    if (existing?.report_id) {
      const { error } = await supabase
        .from("analysis_reports")
        .update({
          report_payload: sanitizedReport,
          source_payload: sanitizedSources,
          completed_at: now,
          business_name: name ?? null,
          business_addr: addr ?? null,
        })
        .eq("scan_id", scanId);

      if (error) {
        console.error("[REPORTS PERSIST] Update error:", error);
        return NextResponse.json(
          { error: "Failed to update report" },
          { status: 500 }
        );
      }
      reportId = existing.report_id;
    } else {
      const { data: inserted, error } = await supabase
        .from("analysis_reports")
        .insert({
          scan_id: scanId,
          place_id: placeId,
          business_name: name ?? null,
          business_addr: addr ?? null,
          completed_at: now,
          report_payload: sanitizedReport,
          source_payload: sanitizedSources,
        })
        .select("report_id")
        .single();

      if (error) {
        console.error("[REPORTS PERSIST] Insert error:", error);
        return NextResponse.json(
          { error: "Failed to persist report" },
          { status: 500 }
        );
      }
      reportId = inserted.report_id;
    }

    const shareUrl = `${BASE_URL.replace(/\/$/, "")}/r/${reportId}`;
    return NextResponse.json({ reportId, shareUrl });
  } catch (error: unknown) {
    console.error("Reports persist error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
