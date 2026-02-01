/**
 * Shareable Report View - /r/[reportId]
 * 
 * This is a VIEW-ONLY route that renders a persisted report snapshot.
 * It does NOT trigger any analysis or external fetches.
 * 
 * Server Component: loads snapshot from Supabase, passes to client renderer.
 */

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { loadSnapshot } from "@/lib/report/loadSnapshot";
import ReportSnapshotRenderer from "@/components/report/ReportSnapshotRenderer";
import Link from "next/link";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://www.antistatic.ai";

interface ShareableReportPageProps {
  params: Promise<{ reportId: string }>;
}

/**
 * Not Found / Expired State
 */
function ReportNotFound() {
  return (
    <div className="min-h-screen bg-[#f6f7f8] flex items-center justify-center">
      <div className="text-center bg-white rounded-lg border border-gray-200 shadow-sm p-8 max-w-md mx-4">
        <div className="text-6xl mb-4">📊</div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          Report Not Found
        </h1>
        <p className="text-gray-600 mb-6">
          This report link may have expired or doesn&apos;t exist.
          Try running a new analysis to get a fresh report.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Analyse a Business
        </Link>
      </div>
    </div>
  );
}

/**
 * Loading State
 */
function ReportLoading() {
  return (
    <div className="min-h-screen bg-[#f6f7f8] flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Loading report...</p>
      </div>
    </div>
  );
}

/**
 * Main content component (async)
 */
async function ShareableReportContent({ reportId }: { reportId: string }) {
  const snapshot = await loadSnapshot(reportId);

  if (!snapshot) {
    return <ReportNotFound />;
  }

  return <ReportSnapshotRenderer snapshot={snapshot} reportId={reportId} />;
}

/**
 * Page Component (Server Component)
 */
export default async function ShareableReportPage({ params }: ShareableReportPageProps) {
  const { reportId } = await params;

  // Basic validation
  if (!reportId || reportId.length < 5) {
    notFound();
  }

  return (
    <Suspense fallback={<ReportLoading />}>
      <ShareableReportContent reportId={reportId} />
    </Suspense>
  );
}

/**
 * Generate metadata for the page (title, description, Open Graph, Twitter)
 */
export async function generateMetadata({ params }: ShareableReportPageProps) {
  const { reportId } = await params;
  const snapshot = await loadSnapshot(reportId);

  const baseUrl = BASE_URL.replace(/\/$/, "");
  const ogImageUrl = new URL(`/r/${reportId}/opengraph-image`, baseUrl).toString();

  if (!snapshot) {
    return {
      title: "Report Not Found | Antistatic",
      openGraph: {
        title: "Report Not Found | Antistatic",
        type: "website",
        images: [{ url: ogImageUrl, width: 1200, height: 630, alt: "Antistatic report preview" }],
      },
      twitter: {
        card: "summary_large_image",
        title: "Report Not Found | Antistatic",
        images: [ogImageUrl],
      },
    };
  }

  const title = `${snapshot.place.name} - Business Report | Antistatic`;
  const description = `Online presence analysis for ${snapshot.place.name}. Overall score: ${snapshot.report.scores.overall.score}/100.`;

  return {
    metadataBase: new URL(baseUrl),
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: "Antistatic report preview" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}
