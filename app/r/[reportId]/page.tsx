import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import ReportRenderer from "@/components/report/ReportRenderer";

interface PageProps {
  params: Promise<{ reportId: string }>;
}

export default async function ShareReportPage({ params }: PageProps) {
  const { reportId } = await params;
  const supabase = getSupabaseAdmin();

  const { data: row, error } = await supabase
    .from("analysis_reports")
    .select("report_id, place_id, business_name, business_addr, report_payload, report_version, created_at")
    .eq("report_id", reportId)
    .single();

  if (error || !row?.report_payload) {
    notFound();
  }

  const report = row.report_payload as Parameters<typeof ReportRenderer>[0]["report"];
  const business = {
    placeId: row.place_id,
    name: row.business_name ?? "Business",
    addr: row.business_addr ?? "",
  };

  return (
    <ReportRenderer
      report={report}
      business={business}
      readOnly
    />
  );
}
