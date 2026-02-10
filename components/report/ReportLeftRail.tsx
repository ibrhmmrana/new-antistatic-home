"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { ReportScores } from "@/lib/report/types";
import ReportPaywallModal from "./ReportPaywallModal";

interface ReportLeftRailProps {
  scores: ReportScores;
  reportId?: string | null;
  businessName?: string | null;
  businessPhotoUrl?: string | null;
  scanId?: string | null;
  placeId?: string | null;
}

export default function ReportLeftRail({ scores, reportId, businessName, businessPhotoUrl, scanId, placeId }: ReportLeftRailProps) {
  const [paywallOpen, setPaywallOpen] = useState(false);
  const { overall, searchResults, websiteExperience, localListings } = scores;
  
  // Calculate percentage for circular gauge
  const overallPercentage = (overall.score / overall.maxScore) * 100;
  
  // Grade label text (light variants for dark rail)
  const getGradeColor = (label: string) => {
    if (label === 'Good') return 'text-green-400';
    if (label === 'Okay') return 'text-amber-400';
    return 'text-orange-400'; // Poor
  };

  // Progress arc colors (unchanged; visible on dark)
  const getProgressColor = (label: string) => {
    if (label === 'Good') return '#34d399'; // green-400
    if (label === 'Okay') return '#fbbf24'; // amber-400
    return '#fb923c'; // orange-400
  };

  const railBg = '#0C0824';
  const railBorder = '#1a1535';
  const trackStroke = 'rgba(255,255,255,0.12)';
  
  // Calculate arc for circular gauge (SVG)
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (overallPercentage / 100) * circumference;
  
  // Helper function to create mini circular progress indicator
  const MiniCircularProgress = ({ score, maxScore, label }: { score: number; maxScore: number; label: string }) => {
    const percentage = (score / maxScore) * 100;
    const miniRadius = 12;
    const miniCircumference = 2 * Math.PI * miniRadius;
    const miniOffset = miniCircumference - (percentage / 100) * miniCircumference;
    const progressColor = getProgressColor(label);
    
    return (
      <div className="relative w-8 h-8 flex-shrink-0">
        <svg className="transform -rotate-90 w-8 h-8">
          {/* Background circle */}
          <circle
            cx="16"
            cy="16"
            r={miniRadius}
            stroke={trackStroke}
            strokeWidth="3"
            fill="none"
          />
          {/* Progress arc */}
          <circle
            cx="16"
            cy="16"
            r={miniRadius}
            stroke={progressColor}
            strokeWidth="3"
            fill="none"
            strokeDasharray={miniCircumference}
            strokeDashoffset={miniOffset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
      </div>
    );
  };
  
  const fixButton = (
    <button
      type="button"
      onClick={() => setPaywallOpen(true)}
      className="w-full bg-blue-600 text-white py-2.5 px-3 rounded-lg font-medium flex items-center justify-center gap-1.5 hover:bg-blue-700 transition-colors text-sm"
    >
      <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
      <span>Start fixing on a free trial</span>
    </button>
  );

  return (
    <>
      {/* Sidebar - hidden on mobile; fixed so it stays in place when scrolling */}
      <div
        className="hidden md:flex flex-shrink-0 w-80 fixed left-4 top-4 p-4 flex-col items-center overflow-hidden rounded-2xl border-2 z-10"
        style={{
          height: 'calc(100vh - 2rem)',
          backgroundColor: railBg,
          borderColor: railBorder,
        }}
      >
        {/* Inner flex column: fills height, allows middle to shrink */}
        <div className="flex flex-col flex-1 min-h-0 w-full items-center gap-0">
          {/* Spacer where logo was (logo moved to intro section) */}
          <div className="flex-shrink-0 w-full h-4 mb-2" aria-hidden />
          {/* Business photo (first GBP image) + name above score */}
          {(businessPhotoUrl || businessName) && (
            <div className="flex-shrink-0 w-full flex flex-col items-center gap-1.5 mb-3">
              {businessPhotoUrl && (
                <div className="relative w-full max-w-64 h-36 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={businessPhotoUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              {businessName && (
                <span className="text-center text-[min(1rem,2.5vh)] font-medium text-white line-clamp-2 px-1">
                  {businessName}
                </span>
              )}
            </div>
          )}
          {/* Circular Gauge - viewport-relative so it scales on short windows */}
          <div
            className="relative flex-shrink-0"
            style={{ width: 'min(10rem, 22vh)', height: 'min(10rem, 22vh)' }}
          >
            <svg className="transform -rotate-90 w-full h-full" viewBox="0 0 160 160" preserveAspectRatio="xMidYMid meet">
              <circle cx="80" cy="80" r={radius} stroke={trackStroke} strokeWidth="14" fill="none" />
              <circle
                cx="80"
                cy="80"
                r={radius}
                stroke={getProgressColor(overall.label)}
                strokeWidth="14"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[min(2.25rem,5vh)] font-bold text-white leading-none">{overall.score}</span>
              <span className="text-[min(0.875rem,2.5vh)] text-gray-400">/100</span>
            </div>
          </div>

          {/* Health Grade Label - compact */}
          <div className="text-center flex-shrink-0 mt-2 mb-2">
            <div className="text-[min(0.75rem,1.8vh)] text-gray-400">Online health grade</div>
            <div className={`text-[min(1.5rem,4vh)] font-bold leading-tight ${getGradeColor(overall.label)}`}>
              {overall.label}
            </div>
          </div>

          {/* Category Scores - flex-1 min-h-0 so this block shrinks when space is tight */}
          <div className="w-full flex-1 min-h-0 flex flex-col justify-center gap-[min(0.75rem,2vh)] py-2">
            <div className="flex items-center gap-2">
              <MiniCircularProgress score={searchResults.score} maxScore={searchResults.maxScore} label={searchResults.label} />
              <div className="flex-1 min-w-0">
                <div className="text-[min(0.8125rem,1.9vh)] font-medium text-white">Search Results</div>
                <div className={`text-[min(0.8125rem,1.9vh)] font-medium ${getGradeColor(searchResults.label)}`}>{searchResults.label}</div>
              </div>
              <div className="text-[min(0.8125rem,1.9vh)] text-gray-400 whitespace-nowrap">{searchResults.score}/{searchResults.maxScore}</div>
            </div>
            <div className="flex items-center gap-2">
              <MiniCircularProgress score={websiteExperience.score} maxScore={websiteExperience.maxScore} label={websiteExperience.label} />
              <div className="flex-1 min-w-0">
                <div className="text-[min(0.8125rem,1.9vh)] font-medium text-white">Website Experience</div>
                <div className={`text-[min(0.8125rem,1.9vh)] font-medium ${getGradeColor(websiteExperience.label)}`}>{websiteExperience.label}</div>
              </div>
              <div className="text-[min(0.8125rem,1.9vh)] text-gray-400 whitespace-nowrap">{websiteExperience.score}/{websiteExperience.maxScore}</div>
            </div>
            <div className="flex items-center gap-2">
              <MiniCircularProgress score={localListings.score} maxScore={localListings.maxScore} label={localListings.label} />
              <div className="flex-1 min-w-0">
                <div className="text-[min(0.8125rem,1.9vh)] font-medium text-white">Local Listings</div>
                <div className={`text-[min(0.8125rem,1.9vh)] font-medium ${getGradeColor(localListings.label)}`}>{localListings.label}</div>
              </div>
              <div className="text-[min(0.8125rem,1.9vh)] text-gray-400 whitespace-nowrap">{localListings.score}/{localListings.maxScore}</div>
            </div>
          </div>

          {/* CTA - fixed at bottom of sidebar */}
          <div className="w-full flex-shrink-0 pt-2">
            {fixButton}
          </div>
        </div>
      </div>

      {/* Mobile: solid white sticky footer with Fix only (Share moved to intro + floating pill) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.08)] p-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] flex justify-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[400px] flex flex-row items-stretch gap-2">
          <button
            type="button"
            onClick={() => setPaywallOpen(true)}
            className="flex-1 min-w-0 bg-blue-600 text-white py-3 px-4 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors text-sm"
          >
            <Sparkles className="w-4 h-4 flex-shrink-0" />
            <span className="text-center">Start fixing on a<br />free trial</span>
          </button>
        </div>
      </div>

      <ReportPaywallModal
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        scanId={scanId ?? undefined}
        placeId={placeId ?? undefined}
        reportId={reportId ?? undefined}
      />
    </>
  );
}
