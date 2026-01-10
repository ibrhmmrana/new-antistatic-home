import { Suspense } from "react";
import ReportScanClient from "@/components/report/ReportScanClient";
import Link from "next/link";

interface ReportPageProps {
  params: Promise<{ scanId: string }>;
  searchParams: Promise<{
    placeId?: string;
    name?: string;
    addr?: string;
  }>;
}

async function ReportPageContent({ params, searchParams }: ReportPageProps) {
  const { scanId } = await params;
  const { placeId, name, addr } = await searchParams;

  if (!placeId) {
    return (
      <div className="min-h-screen bg-[#f6f7f8] flex items-center justify-center">
        <div className="text-center bg-white rounded-lg border border-gray-200 shadow-sm p-8 max-w-md">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Missing Business Information
          </h1>
          <p className="text-gray-600 mb-6">
            Please go back and select a business first.
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Return to home
          </Link>
        </div>
      </div>
    );
  }

  const decodedName = name ? decodeURIComponent(name) : "Business";
  const decodedAddr = addr ? decodeURIComponent(addr) : "";

  return (
    <ReportScanClient
      scanId={scanId}
      placeId={placeId}
      name={decodedName}
      addr={decodedAddr}
    />
  );
}

export default function ReportPage(props: ReportPageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f6f7f8] flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      }
    >
      <ReportPageContent {...props} />
    </Suspense>
  );
}

