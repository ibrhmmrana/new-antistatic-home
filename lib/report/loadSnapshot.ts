/**
 * Load report snapshot from Supabase by reportId.
 * Used by /r/[reportId] page and opengraph-image.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isReportSnapshotV1, type ReportSnapshotV1 } from "@/lib/report/snapshotTypes";

export async function loadSnapshot(reportId: string): Promise<ReportSnapshotV1 | null> {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("analysis_reports")
      .select("report_payload")
      .eq("report_id", reportId)
      .single();

    if (error || !data) {
      console.error("[SHARE] Failed to load report:", error?.message || "Not found");
      return null;
    }

    const payload = data.report_payload;

    if (!isReportSnapshotV1(payload)) {
      console.error("[SHARE] Invalid snapshot format for reportId:", reportId);
      return null;
    }

    return payload;
  } catch (err) {
    console.error("[SHARE] Error loading snapshot:", err);
    return null;
  }
}
