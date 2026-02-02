"use client";

import { useState, useEffect, useRef } from "react";
import type { ReportSnapshotV1, Prescription } from "@/lib/report/snapshotTypes";
import ReportLeftRail from "./ReportLeftRail";
import ReportTopCards from "./ReportTopCards";
import ReportVisualInsights from "./ReportVisualInsights";
import ReportSearchVisibility from "./ReportSearchVisibility";
import ReportChecklistSection from "./ReportChecklistSection";
import ReportAIAnalysis from "./ReportAIAnalysis";
import ReportGoogleReviews from "./ReportGoogleReviews";
import ReportInstagramComments from "./ReportInstagramComments";
import PrescriptionDrawer from "./PrescriptionDrawer";
import RecommendedFixStrip from "./RecommendedFixStrip";
import AllModulesShowcase from "./AllModulesShowcase";
import {
  TOP_CARDS_MODULES,
  VISUAL_INSIGHTS_MODULES,
  AI_ANALYSIS_MODULES,
  CHECKLIST_SECTION_MODULES,
} from "@/lib/diagnosis/sectionModuleMappings";

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activePrescription, setActivePrescription] = useState<Prescription | undefined>(undefined);

  const handleOpenPrescription = (prescription: Prescription) => {
    setActivePrescription(prescription);
    setDrawerOpen(true);
  };

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

  // Fault flags for fix strips (outside blocks)
  const hasTopCardsFault =
    (report.summaryCards.impact.topProblems?.length ?? 0) > 0 ||
    report.sections.some((s) => s.checks.some((c) => c.status === "bad" || c.status === "warn")) ||
    (report.summaryCards.competitors.list.some((c) => c.isTargetBusiness) &&
      (report.summaryCards.competitors.list.find((c) => c.isTargetBusiness)?.rank ?? 1) > 1);
  const competitiveBenchmark = snapshot.competitiveBenchmark;
  const hasVisualFault =
    !!competitiveBenchmark && !!(competitiveBenchmark.potentialImpact || competitiveBenchmark.urgentGap);
  const hasAIFault =
    (aiAnalysis?.topPriorities?.length ?? 0) > 0 ||
    (aiAnalysis?.reviews?.painPoints?.length ?? 0) > 0 ||
    (aiAnalysis?.consistency?.inconsistencies?.length ?? 0) > 0 ||
    (aiAnalysis?.instagram?.issues?.length ?? 0) > 0 ||
    (aiAnalysis?.facebook?.issues?.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-white md:bg-[#f6f7f8] flex overflow-x-hidden">
      {/* Left Rail - hidden on mobile */}
      <ReportLeftRail scores={report.scores} reportId={reportId} />

      {/* Main Content - left margin on desktop so content doesn't sit under fixed sidebar */}
      <div className="flex-1 min-w-0 p-4 sm:p-6 md:p-8 pb-24 md:pb-8 md:ml-[21rem]">
        <div className="max-w-6xl mx-auto w-full max-w-full">
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
          <RecommendedFixStrip
            modules={TOP_CARDS_MODULES}
            hasAnyFault={hasTopCardsFault}
            onOpenPrescription={handleOpenPrescription}
          />

          {/* Competitive Edge - benchmark radar, impact card, thematic sentiment */}
          <ReportVisualInsights
            scores={report.scores}
            businessName={report.meta.businessName}
            thematicSentiment={snapshot.thematicSentiment}
            competitiveBenchmark={snapshot.competitiveBenchmark}
          />
          {competitiveBenchmark && (
            <RecommendedFixStrip
              modules={VISUAL_INSIGHTS_MODULES}
              hasAnyFault={hasVisualFault}
              onOpenPrescription={handleOpenPrescription}
            />
          )}

          {/* AI Analysis - pass directly, no loading state in snapshot mode */}
          <ReportAIAnalysis analysis={aiAnalysis} isLoading={false} />
          {aiAnalysis && (
            <RecommendedFixStrip
              modules={AI_ANALYSIS_MODULES}
              hasAnyFault={hasAIFault}
              onOpenPrescription={handleOpenPrescription}
            />
          )}

          {/* Search Visibility Table - snapshot mode: pass marker data directly */}
          <ReportSearchVisibility
            searchVisibility={report.searchVisibility}
            targetPlaceId={report.meta.placeId}
            targetDomain={report.meta.websiteUrl || null}
            snapshotMode={true}
            snapshotMarkerLocations={supporting.markerLocations}
          />

          {/* Summary Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-1">
              {totalChecks} things reviewed, {needWork} need work
            </h2>
            <p className="text-sm text-gray-600">See what&apos;s wrong and how to improve</p>
          </div>

          {/* Checklist Sections */}
          {report.sections.map((section) => {
            const sectionModules = CHECKLIST_SECTION_MODULES[section.id];
            const sectionNeedWork = section.checks.filter((c) => c.status === "bad" || c.status === "warn").length > 0;
            return (
              <div key={section.id}>
                <ReportChecklistSection section={section} />
                {sectionModules && (
                  <RecommendedFixStrip
                    modules={sectionModules}
                    hasAnyFault={sectionNeedWork}
                    onOpenPrescription={handleOpenPrescription}
                  />
                )}
              </div>
            );
          })}

          {/* How Antistatic can help - all 4 modules (pushes Creator Hub) */}
          <AllModulesShowcase />

          {/* Google Reviews - hidden */}
          {/* <ReportGoogleReviews reviews={reviews} /> */}

          {/* Instagram Comments (from snapshot) - hidden */}
          {/* <ReportInstagramComments comments={snapshot.instagramComments ?? []} /> */}
        </div>
      </div>

      {/* Smart Diagnosis: prescription drawer (right on desktop, full-screen on mobile) */}
      <PrescriptionDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        prescription={activePrescription}
      />
    </div>
  );
}
