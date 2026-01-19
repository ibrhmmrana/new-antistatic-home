"use client";

import { Zap } from "lucide-react";
import type { ReportScores } from "@/lib/report/types";

interface ReportLeftRailProps {
  scores: ReportScores;
}

export default function ReportLeftRail({ scores }: ReportLeftRailProps) {
  const { overall, searchResults, websiteExperience, localListings, socialPresence } = scores;
  
  // Calculate percentage for circular gauge
  const overallPercentage = (overall.score / overall.maxScore) * 100;
  
  // Determine color based on label - using intuitive grade colors
  const getColor = (label: string) => {
    if (label === 'Good') return 'text-green-500'; // green for good/success
    if (label === 'Okay') return 'text-yellow-500'; // yellow for okay/warning
    return 'text-red-500'; // red for poor/needs attention
  };
  
  const getBgColor = (label: string) => {
    if (label === 'Good') return 'bg-green-500'; // green for good/success
    if (label === 'Okay') return 'bg-yellow-500'; // yellow for okay/warning
    return 'bg-red-500'; // red for poor/needs attention
  };
  
  const getArcColor = (label: string) => {
    if (label === 'Good') return '#10b981'; // green-500
    if (label === 'Okay') return '#eab308'; // yellow-500
    return '#ef4444'; // red-500
  };
  
  // Calculate arc for circular gauge (SVG)
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (overallPercentage / 100) * circumference;
  
  return (
    <div className="w-64 bg-[#0a1628] sticky top-0 h-screen p-6 flex flex-col items-center overflow-y-auto">
      {/* Circular Gauge */}
      <div className="relative w-32 h-32 mb-4">
        <svg className="transform -rotate-90 w-32 h-32">
          {/* Background circle */}
          <circle
            cx="64"
            cy="64"
            r={radius}
            stroke="#1e3a5f"
            strokeWidth="12"
            fill="none"
          />
          {/* Progress arc */}
          <circle
            cx="64"
            cy="64"
            r={radius}
            stroke={getArcColor(overall.label)}
            strokeWidth="12"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        {/* Score text in center */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-bold text-white">
            {overall.score}
          </div>
          <div className="text-sm text-gray-400">/ {overall.maxScore}</div>
        </div>
      </div>
      
      {/* Health Grade Label */}
      <div className="text-center mb-6">
        <div className="text-sm text-gray-400 mb-1">Online health grade</div>
        <div className={`text-2xl font-semibold ${getColor(overall.label)}`}>
          {overall.label}
        </div>
      </div>
      
      {/* Category Scores */}
      <div className="w-full space-y-4 mb-6">
        {/* Search Results */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${getBgColor(searchResults.label)}`}></div>
            <span className="text-sm font-medium text-gray-200">Search Results</span>
          </div>
          <div className="text-sm text-gray-400">
            {searchResults.score}/{searchResults.maxScore}
          </div>
        </div>
        
        {/* Website Experience */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${getBgColor(websiteExperience.label)}`}></div>
            <span className="text-sm font-medium text-gray-200">Website Experience</span>
          </div>
          <div className="text-sm text-gray-400">
            {websiteExperience.score}/{websiteExperience.maxScore}
          </div>
        </div>
        
        {/* Local Listings */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${getBgColor(localListings.label)}`}></div>
            <span className="text-sm font-medium text-gray-200">Local Listings</span>
          </div>
          <div className="text-sm text-gray-400">
            {localListings.score}/{localListings.maxScore}
          </div>
        </div>
        
        {/* Social Presence */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${getBgColor(socialPresence.label)}`}></div>
            <span className="text-sm font-medium text-gray-200">Social Presence</span>
          </div>
          <div className="text-sm text-gray-400">
            {socialPresence.score}/{socialPresence.maxScore}
          </div>
        </div>
      </div>
      
      {/* CTA Button */}
      <button className="w-full bg-[#3b82f6] text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-[#2563eb] transition-colors mt-auto">
        <Zap className="w-4 h-4" />
        <span>Fix in 35 seconds</span>
      </button>
    </div>
  );
}
