import { NextRequest, NextResponse } from "next/server";
import { verifyEmailProof, proofErrorResponse } from "@/lib/auth/verifyEmailProof";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sanitizeForDb, isPayloadSizeAcceptable } from "@/lib/report/sanitizePayload";
import { isReportSnapshotV1 } from "@/lib/report/snapshotTypes";
import { sendReportReadyEmail } from "@/lib/ses/sendReportReadyEmail";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://www.antistatic.ai";

// Max payload size: 4MB (leaving buffer for Supabase)
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const proof = await verifyEmailProof(request);
    const errResp = proofErrorResponse(proof);
    if (errResp) return errResp;
    const email = proof.payload?.email;

    const body = await request.json();
    
    // Accept either new snapshot format or legacy format
    const { snapshot, scanId: legacyScanId, placeId: legacyPlaceId, name: legacyName, addr: legacyAddr, report: legacyReport } = body as {
      snapshot?: unknown;
      scanId?: string;
      placeId?: string;
      name?: string;
      addr?: string;
      report?: unknown;
    };

    let scanId: string;
    let placeId: string;
    let name: string | null;
    let addr: string | null;
    let payloadToStore: unknown;

    // New snapshot format (preferred)
    if (snapshot) {
      if (!isReportSnapshotV1(snapshot)) {
        return NextResponse.json(
          { error: "Invalid snapshot format - must be ReportSnapshotV1" },
          { status: 400 }
        );
      }
      
      scanId = snapshot.scanId;
      placeId = snapshot.place.placeId;
      name = snapshot.place.name;
      addr = snapshot.place.addr;
      payloadToStore = snapshot;
    } 
    // Legacy format (backwards compatibility)
    else {
      if (!legacyScanId || !legacyPlaceId) {
        return NextResponse.json(
          { error: "scanId and placeId are required" },
          { status: 400 }
        );
      }
      if (!legacyReport || typeof legacyReport !== "object") {
        return NextResponse.json(
          { error: "report object or snapshot is required" },
          { status: 400 }
        );
      }
      
      scanId = legacyScanId;
      placeId = legacyPlaceId;
      name = legacyName ?? null;
      addr = legacyAddr ?? null;
      payloadToStore = legacyReport;
    }

    // Sanitize payload (remove undefined, truncate huge strings, etc.)
    const sanitizedPayload = sanitizeForDb(payloadToStore) as object;

    // Check payload size
    if (!isPayloadSizeAcceptable(sanitizedPayload, MAX_PAYLOAD_BYTES)) {
      console.error("[REPORTS PERSIST] Payload too large");
      return NextResponse.json(
        { error: "Report payload too large to persist" },
        { status: 413 }
      );
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    // Check if report already exists for this scan
    const { data: existing } = await supabase
      .from("analysis_reports")
      .select("report_id")
      .eq("scan_id", scanId)
      .single();

    let reportId: string;

    if (existing?.report_id) {
      // Update existing report
      const { error } = await supabase
        .from("analysis_reports")
        .update({
          report_payload: sanitizedPayload,
          completed_at: now,
          business_name: name,
          business_addr: addr,
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
      console.log("[REPORTS PERSIST] Updated existing report:", reportId);
    } else {
      // Insert new report
      const { data: inserted, error } = await supabase
        .from("analysis_reports")
        .insert({
          scan_id: scanId,
          place_id: placeId,
          business_name: name,
          business_addr: addr,
          completed_at: now,
          report_payload: sanitizedPayload,
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
      console.log("[REPORTS PERSIST] Created new report:", reportId);
    }

    const shareUrl = `${BASE_URL.replace(/\/$/, "")}/r/${reportId}`;

    if (email && email.includes("@")) {
      try {
        await sendReportReadyEmail({
          to: email,
          reportUrl: shareUrl,
          businessName: name,
        });
      } catch (emailErr) {
        console.error("[REPORTS PERSIST] Report-ready email failed:", emailErr);
      }
    }

    return NextResponse.json({ reportId, shareUrl });
  } catch (error: unknown) {
    console.error("Reports persist error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
