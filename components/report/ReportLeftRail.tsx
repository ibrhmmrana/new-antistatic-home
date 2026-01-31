"use client";

import { Sparkles } from "lucide-react";
import type { ReportScores } from "@/lib/report/types";

interface ReportLeftRailProps {
  scores: ReportScores;
}

export default function ReportLeftRail({ scores }: ReportLeftRailProps) {
  const { overall, searchResults, websiteExperience, localListings } = scores;
  
  // Calculate percentage for circular gauge
  const overallPercentage = (overall.score / overall.maxScore) * 100;
  
  // Determine color based on label
  const getGradeColor = (label: string) => {
    if (label === 'Good') return 'text-green-600';
    if (label === 'Okay') return 'text-orange-500';
    return 'text-red-500';
  };
  
  const getProgressColor = (label: string) => {
    if (label === 'Good') return '#10b981'; // green
    if (label === 'Okay') return '#f97316'; // orange
    return '#ef4444'; // red
  };
  
  const getBackgroundColor = (label: string) => {
    if (label === 'Good') return '#f0fdf4'; // Very light green
    if (label === 'Okay') return '#fff7ed'; // Very light orange
    return '#fef2f2'; // Very light red/pink
  };
  
  const getBorderColor = (label: string) => {
    if (label === 'Good') return '#bbf7d0'; // Light green border
    if (label === 'Okay') return '#fed7aa'; // Light orange border
    return '#fecaca'; // Light red border
  };
  
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
            stroke="#e5e7eb"
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
    <button className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors md:mt-auto">
      <Sparkles className="w-4 h-4" />
      <span>Fix in 35 seconds</span>
    </button>
  );

  return (
    <>
      {/* Sidebar - hidden on mobile */}
      <div
        className="hidden md:flex flex-shrink-0 w-64 sticky top-4 p-8 flex-col items-center overflow-y-auto rounded-2xl ml-4 border-2"
        style={{
          height: 'calc(100vh - 2rem)',
          backgroundColor: getBackgroundColor(overall.label),
          borderColor: getBorderColor(overall.label),
        }}
      >
      {/* Circular Gauge */}
      <div className="relative w-40 h-40 mb-4">
        <svg className="transform -rotate-90 w-40 h-40">
          {/* Background circle - light gray */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            stroke="#e5e7eb"
            strokeWidth="14"
            fill="none"
          />
          {/* Progress arc - red/orange based on grade */}
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
        {/* Score text in center */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-4xl font-bold text-gray-900">
            {overall.score}
          </div>
          <div className="text-base text-gray-600">/100</div>
        </div>
      </div>
      
      {/* Health Grade Label */}
      <div className="text-center mb-8">
        <div className="text-sm text-gray-600 mb-1">Online health grade</div>
        <div className={`text-3xl font-bold ${getGradeColor(overall.label)}`}>
          {overall.label}
        </div>
      </div>
      
      {/* Category Scores */}
      <div className="w-full space-y-6 mb-8">
        {/* Search Results */}
        <div className="flex items-start gap-3">
          <MiniCircularProgress 
            score={searchResults.score} 
            maxScore={searchResults.maxScore} 
            label={searchResults.label}
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900">Search Results</div>
            <div className={`text-sm font-medium ${getGradeColor(searchResults.label)} mt-1`}>
              {searchResults.label}
            </div>
          </div>
          <div className="text-sm text-gray-600 whitespace-nowrap">
            {searchResults.score}/{searchResults.maxScore}
          </div>
        </div>
        
        {/* Website Experience */}
        <div className="flex items-start gap-3">
          <MiniCircularProgress 
            score={websiteExperience.score} 
            maxScore={websiteExperience.maxScore} 
            label={websiteExperience.label}
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900">Website Experience</div>
            <div className={`text-sm font-medium ${getGradeColor(websiteExperience.label)} mt-1`}>
              {websiteExperience.label}
            </div>
          </div>
          <div className="text-sm text-gray-600 whitespace-nowrap">
            {websiteExperience.score}/{websiteExperience.maxScore}
          </div>
        </div>
        
        {/* Local Listings */}
        <div className="flex items-start gap-3">
          <MiniCircularProgress 
            score={localListings.score} 
            maxScore={localListings.maxScore} 
            label={localListings.label}
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900">Local Listings</div>
            <div className={`text-sm font-medium ${getGradeColor(localListings.label)} mt-1`}>
              {localListings.label}
            </div>
          </div>
          <div className="text-sm text-gray-600 whitespace-nowrap">
            {localListings.score}/{localListings.maxScore}
          </div>
        </div>
      </div>
      
      {/* CTA Button - inside sidebar on desktop */}
      {fixButton}
    </div>

      {/* Mobile: floating Fix it button at bottom */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 p-4 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[320px]">
          <button className="w-full bg-blue-600 text-white py-3 px-4 rounded-2xl font-medium flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors shadow-lg">
            <Sparkles className="w-4 h-4" />
            <span>Fix in 35 seconds</span>
          </button>
        </div>
      </div>
    </>
  );
}
