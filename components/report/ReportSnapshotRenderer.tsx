"use client";

import { useEffect, useRef } from "react";
import type { ReportSnapshotV1 } from "@/lib/report/snapshotTypes";
import ReportLeftRail from "./ReportLeftRail";
import ReportTopCards from "./ReportTopCards";
import ReportSearchVisibility from "./ReportSearchVisibility";
import ReportChecklistSection from "./ReportChecklistSection";
import ReportAIAnalysis from "./ReportAIAnalysis";
import ReportGoogleReviews from "./ReportGoogleReviews";
import ShareButton from "./ShareButton";

interface ReportSnapshotRendererProps {
  snapshot: ReportSnapshotV1;
  reportId: string;
}

/**
 * Renders a persisted report snapshot
 * 
 * CRITICAL: This component must NOT trigger any network requests.
 * All data comes from the snapshot prop.
 */
export default function ReportSnapshotRenderer({ snapshot, reportId }: ReportSnapshotRendererProps) {
  const { report, aiAnalysis, reviews, place, supporting } = snapshot;
  const devAssertionRef = useRef(false);

  // DEV ONLY: Assert no API fetches happen in snapshot mode
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    if (devAssertionRef.current) return;
    devAssertionRef.current = true;

    const originalFetch = window.fetch;
    window.fetch = function (...args: Parameters<typeof fetch>) {
      const url = typeof args[0] === 'string' ? args[0] : args[0] instanceof Request ? args[0].url : '';
      
      // Check for forbidden API calls in snapshot mode
      const forbiddenPatterns = ['/api/scan', '/api/places', '/api/ai/analyze', '/api/gbp'];
      for (const pattern of forbiddenPatterns) {
        if (url.includes(pattern)) {
          console.error(
            `[SNAPSHOT MODE ERROR] Forbidden fetch detected: ${url}\n` +
            `Snapshot mode should not make any API calls. This is a bug.`
          );
        }
      }

      return originalFetch.apply(this, args);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  // Calculate totals for the summary header
  const totalChecks = report.sections.reduce((sum, section) => sum + section.checks.length, 0);
  const needWork = report.sections.reduce(
    (sum, section) => sum + section.checks.filter(c => c.status === 'bad' || c.status === 'warn').length,
    0
  );

  return (
    <div className="min-h-screen bg-white md:bg-[#f6f7f8] flex">
      {/* Left Rail - hidden on mobile */}
      <ReportLeftRail
        scores={report.scores}
        businessName={report.meta.businessName}
        websiteLogoUrl={report.meta.websiteLogoUrl ?? null}
      />

      {/* Main Content */}
      <div className="flex-1 p-8 pb-24 md:pb-8">
        <div className="max-w-6xl mx-auto">
          {/* Share Button */}
          <div className="flex justify-end mb-4">
            <ShareButton reportId={reportId} />
          </div>

          {/* Top Cards - snapshot mode: pass photo URL directly, skip fetches */}
          <ReportTopCards
            impact={report.summaryCards.impact}
            competitors={report.summaryCards.competitors}
            businessName={report.meta.businessName}
            websiteUrl={report.meta.websiteUrl}
            businessAvatar={place.businessPhotoUrl || report.summaryCards.impact.businessAvatar}
            placeId={report.meta.placeId}
            sections={report.sections}
            overallGrade={report.scores.overall.label}
            aiAnalysis={aiAnalysis}
            snapshotMode={true}
            snapshotPhotoUrl={place.businessPhotoUrl}
          />

          {/* Search Visibility Table - snapshot mode: pass marker data directly */}
          <ReportSearchVisibility
            searchVisibility={report.searchVisibility}
            targetPlaceId={report.meta.placeId}
            targetDomain={report.meta.websiteUrl || null}
            snapshotMode={true}
            snapshotMarkerLocations={supporting.markerLocations}
          />

          {/* AI Analysis - pass directly, no loading state in snapshot mode */}
          <ReportAIAnalysis analysis={aiAnalysis} isLoading={false} />

          {/* Summary Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-1">
              {totalChecks} things reviewed, {needWork} need work
            </h2>
            <p className="text-sm text-gray-600">See what&apos;s wrong and how to improve</p>
          </div>

          {/* Checklist Sections */}
          {report.sections.map((section) => (
            <ReportChecklistSection key={section.id} section={section} />
          ))}

          {/* Google Reviews */}
          <ReportGoogleReviews reviews={reviews} />
        </div>
      </div>
    </div>
  );
}
