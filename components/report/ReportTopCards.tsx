"use client";

import { useState, useEffect, useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import type { ImpactCard, CompetitorsCard, ChecklistSection } from "@/lib/report/types";

/** AI analysis result shape (topPriorities only) for issues card */
interface AIAnalysisForTopCards {
  topPriorities?: Array<{
    priority: number;
    source: string;
    issue: string;
    recommendation: string;
  }>;
}

interface ReportTopCardsProps {
  impact: ImpactCard;
  competitors: CompetitorsCard;
  businessName: string;
  websiteUrl: string | null;
  businessAvatar?: string | null;
  placeId?: string | null;
  sections?: ChecklistSection[];
  /** Overall score label (Good / Okay / Poor) for score-based background on issues card */
  overallGrade?: string;
  /** AI analysis: used to show top priorities + section with lowest score as action */
  aiAnalysis?: AIAnalysisForTopCards | null;
  /** Snapshot mode: when true, skip all API fetches */
  snapshotMode?: boolean;
  /** Pre-loaded photo URL for snapshot mode */
  snapshotPhotoUrl?: string | null;
}

export default function ReportTopCards({
  impact,
  competitors,
  businessName,
  websiteUrl,
  businessAvatar,
  placeId,
  sections,
  overallGrade,
  aiAnalysis,
  snapshotMode = false,
  snapshotPhotoUrl,
}: ReportTopCardsProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  
  // Fetch business photo from Places API
  // SKIP in snapshot mode - use pre-loaded photo URL instead
  useEffect(() => {
    // In snapshot mode, never fetch - use snapshotPhotoUrl
    if (snapshotMode) return;
    if (!placeId) return;
    
    const fetchBusinessPhoto = async () => {
      try {
        // First, get place details to get photo reference
        const detailsResponse = await fetch(`/api/places/details?placeId=${encodeURIComponent(placeId)}`);
        if (!detailsResponse.ok) return;
        
        const detailsData = await detailsResponse.json();
        // Prefer direct photoUri from New API; fallback to legacy proxy
        if (detailsData.photoUri) {
          setPhotoUrl(detailsData.photoUri);
          return;
        }
        const photoRef = detailsData.photoRef;
        if (!photoRef) return;
        const photoResponse = await fetch(`/api/places/photo?ref=${encodeURIComponent(photoRef)}&maxw=200`);
        if (photoResponse.ok) {
          const blob = await photoResponse.blob();
          const url = URL.createObjectURL(blob);
          setPhotoUrl(url);
        }
      } catch (error) {
        console.error('Error fetching business photo:', error);
      }
    };
    
    fetchBusinessPhoto();
    
    // Cleanup: revoke object URL on unmount
    return () => {
      if (photoUrl) {
        URL.revokeObjectURL(photoUrl);
      }
    };
  }, [placeId, snapshotMode]);
  
  // In snapshot mode, use snapshotPhotoUrl; otherwise use fetched photo or fallbacks
  const avatarUrl = snapshotMode 
    ? (snapshotPhotoUrl || businessAvatar || impact.businessAvatar)
    : (photoUrl || businessAvatar || impact.businessAvatar);
  
  // Top issues: prefer AI analysis top priorities + section with lowest score as action; else fallback to checklist/sections
  const topIssues = useMemo(() => {
    const priorities = aiAnalysis?.topPriorities;
    const hasAiPriorities = Array.isArray(priorities) && priorities.length > 0;
    const hasSections = sections && sections.length > 0;

    if (hasAiPriorities && hasSections) {
      // Section with lowest score (by ratio) → action heading
      const lowestSection = [...sections].sort(
        (a, b) => (a.score / Math.max(1, a.maxScore)) - (b.score / Math.max(1, b.maxScore))
      )[0];
      const title = lowestSection?.title?.trim() ?? "";
      // Phrase as an action: avoid "Improve Get your website..." – use title as-is if it's already imperative
      const actionLabel = lowestSection
        ? (() => {
            const lower = title.toLowerCase();
            if (lower.startsWith("improve ") || lower.startsWith("get ") || lower.startsWith("build ") || lower.startsWith("make ")) {
              return title; // Already imperative
            }
            if (lower.startsWith("add ") || lower.startsWith("ensure ") || lower.startsWith("fix ")) {
              return title;
            }
            return `Improve: ${title}`; // Use colon so "Improve: Get your website..." reads correctly
          })()
        : null;
      const aiLabels = priorities.slice(0, 3).map((p) => p.issue.trim()).filter(Boolean);
      const combined: string[] = [];
      if (actionLabel) combined.push(actionLabel);
      aiLabels.forEach((label) => {
        if (combined.length < 3 && !combined.includes(label)) combined.push(label);
      });
      return combined.slice(0, 3).map((label) => ({ label }));
    }

    // Fallback: from sections/checks or impact.topProblems
    if (!hasSections) {
      return (impact.topProblems || []).slice(0, 3).map((p) => ({ label: p.label }));
    }

    const allIssues: Array<{ label: string; impact: 'high' | 'medium' | 'low'; status: 'bad' | 'warn' }> = [];
    sections.forEach((section) => {
      section.checks.forEach((check) => {
        if (check.status === 'bad' || check.status === 'warn') {
          const highImpactKeys = [
            'h1_service_area', 'h1_keywords', 'primary_cta', 'contact_phone',
            'gbp_website', 'indexability', 'gbp_description', 'gbp_hours', 'gbp_phone',
          ];
          const mediumImpactKeys = [
            'meta_desc_service_area', 'meta_desc_keywords', 'trust_testimonials',
            'gbp_social_links', 'gbp_price_range',
          ];
          let impactLevel: 'high' | 'medium' | 'low' = 'low';
          if (highImpactKeys.includes(check.key)) impactLevel = 'high';
          else if (mediumImpactKeys.includes(check.key)) impactLevel = 'medium';
          allIssues.push({ label: check.label, impact: impactLevel, status: check.status });
        }
      });
    });
    allIssues.sort((a, b) => {
      const o = { high: 3, medium: 2, low: 1 };
      if (o[a.impact] !== o[b.impact]) return o[b.impact] - o[a.impact];
      return a.status === 'bad' ? -1 : 1;
    });
    return allIssues.slice(0, 3).map((issue) => ({ label: issue.label }));
  }, [sections, impact.topProblems, aiAnalysis?.topPriorities]);
  
  // Generate problem-focused header
  const getImpactHeader = () => {
    const count = topIssues.length;
    if (count === 0) return "Your online presence looks good!";
    if (count === 1) return "We found 1 issue affecting your visibility";
    return `We found ${count} issues affecting your visibility`;
  };
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
      {/* Impact Card - score-based background only below desktop (see .report-issues-card in globals.css) */}
      <div
        className="report-issues-card rounded-xl border border-gray-200 p-6 shadow-md bg-white"
        {...(overallGrade ? { "data-grade": overallGrade } : {})}
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          {getImpactHeader()}
        </h3>
        
        {/* Business Info */}
        <div className="flex items-center gap-3 mb-4">
          {avatarUrl ? (
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
              <img
                src={avatarUrl}
                alt={businessName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Fallback to initial on error
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    parent.innerHTML = `<span class="text-gray-500 text-lg font-medium">${businessName.charAt(0)}</span>`;
                    parent.className = 'w-12 h-12 rounded-lg bg-gray-200 flex-shrink-0 flex items-center justify-center';
                  }
                }}
              />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-lg bg-gray-200 flex-shrink-0 flex items-center justify-center">
              <span className="text-gray-500 text-lg font-medium">{businessName.charAt(0)}</span>
            </div>
          )}
          <div>
            <div className="font-medium text-gray-900">{businessName}</div>
            {websiteUrl && (
              <div className="text-sm text-gray-500">{websiteUrl.replace(/^https?:\/\//, '')}</div>
            )}
          </div>
        </div>
        
        {/* Top Problems */}
        <div className="space-y-2">
          {topIssues.map((issue, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-gray-700">{issue.label}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Competitors Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-md">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          {(() => {
            // Find the user's business in the competitors list
            const userBusiness = competitors.list.find(c => c.isTargetBusiness);
            if (!userBusiness) {
              return `You're ranking below ${competitors.count} competitors`;
            }
            
            // Count how many competitors are ranked above the user
            const competitorsAbove = competitors.list.filter(
              c => !c.isTargetBusiness && c.rank < userBusiness.rank
            ).length;
            
            if (competitorsAbove === 0) {
              return "You're ranked #1! 🎉";
            } else if (competitorsAbove === 1) {
              return "You're ranking below 1 competitor";
            } else {
              return `You're ranking below ${competitorsAbove} competitors`;
            }
          })()}
        </h3>
        
        {/* Scrollable list showing 5 items, scroll to see more */}
        <div className="md:max-h-[180px] md:overflow-y-auto space-y-0.5 pr-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {competitors.list.map((competitor) => (
            <div 
              key={competitor.rank} 
              className={`flex items-center justify-between py-1 ${
                competitor.isTargetBusiness ? 'bg-blue-50 rounded-lg px-2 -mx-2' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                  competitor.isTargetBusiness ? 'bg-blue-200' : 'bg-gray-100'
                }`}>
                  <span className="text-xs">🍴</span>
                </div>
                <div>
                  <div className={`font-medium text-sm ${
                    competitor.isTargetBusiness ? 'text-blue-600' : 'text-gray-900'
                  }`}>
                    {competitor.name}{competitor.isTargetBusiness ? ' (You)' : ''}
                  </div>
                  {competitor.rating && (
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <span>{competitor.rating}</span>
                      <span className="text-yellow-500">⭐</span>
                    </div>
                  )}
                </div>
              </div>
              <div className={`text-sm font-medium flex-shrink-0 ${
                competitor.isTargetBusiness
                  ? 'text-blue-600'
                  : competitor.rank <= 3 
                  ? 'text-green-600' 
                  : 'text-orange-600'
              }`}>
                {competitor.rank === 1 ? '1st'
                  : competitor.rank === 2 ? '2nd'
                  : competitor.rank === 3 ? '3rd'
                  : `${competitor.rank}th`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
