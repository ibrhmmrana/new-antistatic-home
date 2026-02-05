"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Info, Sparkles, Layers } from "lucide-react";

/** Brand icons for Top Priorities source (24x24) – Instagram and Facebook from public SVGs */
function SourceIcon({ source }: { source: string }) {
  const s = source.toLowerCase();
  const className = "w-6 h-6 flex-shrink-0";
  if (s.includes("instagram")) {
    return (
      <Image
        src="/images/instagram-2-1-logo-svgrepo-com.svg"
        alt="Instagram"
        width={24}
        height={24}
        className={className}
        aria-hidden
      />
    );
  }
  if (s.includes("facebook")) {
    return (
      <Image
        src="/images/2023_Facebook_icon.svg"
        alt="Facebook"
        width={24}
        height={24}
        className={className}
        aria-hidden
      />
    );
  }
  if (s.includes("google") || s.includes("review")) {
    return (
      <svg className={className} viewBox="0 0 24 24" aria-hidden>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    );
  }
  if (s.includes("cross") || s.includes("platform") || s.includes("consistency")) {
    return <Layers className={`${className} text-indigo-600`} />;
  }
  return (
    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded" title={source}>
      {source}
    </span>
  );
}

interface AIAnalysisResult {
  instagram?: {
    score: number;
    summary: string;
    issues: Array<{
      severity: 'critical' | 'warning' | 'info';
      category: string;
      issue: string;
      recommendation: string;
    }>;
    highlights: string[];
  };
  facebook?: {
    score: number;
    summary: string;
    issues: Array<{
      severity: 'critical' | 'warning' | 'info';
      category: string;
      issue: string;
      recommendation: string;
    }>;
    highlights: string[];
  };
  consistency: {
    isConsistent: boolean;
    score: number;
    inconsistencies: Array<{
      field: string;
      platforms: string[];
      values: Record<string, string | null>;
      recommendation: string;
    }>;
    missingInfo: Array<{
      field: string;
      missingFrom: string[];
    }>;
  };
  reviews: {
    overallSentiment: 'positive' | 'mixed' | 'negative';
    sentimentScore: number;
    totalReviews: number;
    painPoints: Array<{
      topic: string;
      frequency: number;
      severity: 'high' | 'medium' | 'low';
      exampleReviews: string[];
      recommendation: string;
    }>;
    strengths: Array<{
      topic: string;
      frequency: number;
      exampleReviews: string[];
    }>;
    summary: string;
  };
  instagramComments?: {
    score: number;
    summary: string;
    issues: Array<{
      severity: 'critical' | 'warning' | 'info';
      category: string;
      issue: string;
      recommendation: string;
    }>;
    highlights: string[];
  };
  facebookComments?: {
    score: number;
    summary: string;
    issues: Array<{
      severity: 'critical' | 'warning' | 'info';
      category: string;
      issue: string;
      recommendation: string;
    }>;
    highlights: string[];
  };
  overallScore: number;
  topPriorities: Array<{
    priority: number;
    source: string;
    issue: string;
    recommendation: string;
  }>;
}

export interface AIAnalysisResultType extends AIAnalysisResult {}

interface ReportAIAnalysisProps {
  analysis: AIAnalysisResult | null;
  isLoading?: boolean;
  /** When true, only render header and Top Priorities (rest is shown below Thematic sentiment). */
  onlyTopPriorities?: boolean;
}

export default function ReportAIAnalysis({ analysis, isLoading, onlyTopPriorities = false }: ReportAIAnalysisProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['top-priorities']));

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8 shadow-md">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-6 h-6 bg-gray-200 rounded animate-pulse flex-shrink-0" />
          <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="ml-auto h-7 w-14 bg-gray-200 rounded-full animate-pulse" />
        </div>
        {/* Top Priorities skeleton */}
        <div className="mb-6">
          <div className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
            <div className="w-5 h-5 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="mt-2 pb-2 pt-1 bg-gray-50 rounded-lg space-y-2 px-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-start gap-3 py-3">
                <div className="h-4 w-4 flex-shrink-0 bg-gray-200 rounded animate-pulse mt-0.5" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: `${70 + (i % 3) * 10}%` }} />
                  <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: `${85 + (i % 2) * 5}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Review Analysis skeleton */}
        <div className="mb-6">
          <div className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="h-5 w-36 bg-gray-200 rounded animate-pulse" />
            <div className="w-5 h-5 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="mt-2 p-4 bg-gray-50 rounded-lg space-y-2">
            <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
            <div className="h-4 w-full max-w-[80%] bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
        {/* Social / Consistency skeleton */}
        <div>
          <div className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="h-5 w-44 bg-gray-200 rounded animate-pulse" />
            <div className="w-5 h-5 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return null;
  }

  const getSeverityColor = (severity: string) => {
    if (severity === 'critical' || severity === 'high') return 'text-red-600 bg-red-50';
    if (severity === 'warning' || severity === 'medium') return 'text-yellow-600 bg-yellow-50';
    return 'text-blue-600 bg-blue-50';
  };

  const getSeverityIcon = (severity: string) => {
    if (severity === 'critical' || severity === 'high') return <AlertCircle className="w-4 h-4" />;
    if (severity === 'warning' || severity === 'medium') return <Info className="w-4 h-4" />;
    return <CheckCircle2 className="w-4 h-4" />;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8 shadow-md">
      <div className="flex items-center gap-3 mb-6">
        <Sparkles className="w-6 h-6 text-blue-600" />
        <h2 className="text-xl font-semibold text-gray-900">AI-Powered Analysis</h2>
      </div>

      {/* Top Priorities */}
      {analysis.topPriorities.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => toggleSection('top-priorities')}
            className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <h3 className="text-lg font-semibold text-gray-900">Top Priorities</h3>
            {expandedSections.has('top-priorities') ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>
          {expandedSections.has('top-priorities') && (
            <div className="mt-2 pb-2 pt-1 bg-gray-50 rounded-lg space-y-2">
              {analysis.topPriorities.map((priority, idx) => (
                <div key={idx} className="flex items-start gap-3 py-3 px-3">
                  <span className="flex-shrink-0 text-sm font-semibold text-gray-700 tabular-nums">{idx + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 mb-0.5">
                      <span className="inline-flex align-middle shrink-0 mr-1.5" title={priority.source}>
                        <SourceIcon source={priority.source} />
                      </span>
                      <span>{priority.issue}</span>
                    </div>
                    <p className="text-sm text-gray-600">{priority.recommendation}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rest of AI sections (Review, Consistency, Social) — when not onlyTopPriorities */}
      {!onlyTopPriorities && analysis.reviews.totalReviews > 0 && (
        <div className="mb-6">
          <button
            onClick={() => toggleSection('reviews')}
            className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-900">Review Analysis</h3>
              <span className="text-sm text-gray-500">
                ({analysis.reviews.sentimentScore}/100 sentiment)
              </span>
            </div>
            {expandedSections.has('reviews') ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>
          {expandedSections.has('reviews') && (
            <div className="mt-2 pb-2 pt-1 bg-gray-50 rounded-lg space-y-4">
              <p className="text-sm text-gray-700 px-3 pt-2">{analysis.reviews.summary}</p>
              
              {analysis.reviews.painPoints.length > 0 && (
                <div className="px-3">
                  <h4 className="font-semibold text-gray-900 mb-2">Pain Points</h4>
                  <div className="space-y-2">
                    {analysis.reviews.painPoints.map((point, idx) => (
                      <div key={idx} className="p-3 bg-red-50 rounded-lg">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {getSeverityIcon(point.severity)}
                          <span className="font-medium text-gray-900">{point.topic}</span>
                          <span className="text-xs text-gray-500">({point.frequency} mentions)</span>
                        </div>
                        <p className="text-sm text-gray-700 mb-2">{point.recommendation}</p>
                        {point.exampleReviews.length > 0 && (
                          <div className="text-xs text-gray-600 italic">
                            Example: &ldquo;{point.exampleReviews[0]}&rdquo;
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analysis.reviews.strengths.length > 0 && (
                <div className="px-3">
                  <h4 className="font-semibold text-gray-900 mb-2">Strengths</h4>
                  <div className="space-y-2">
                    {analysis.reviews.strengths.map((strength, idx) => (
                      <div key={idx} className="p-3 bg-green-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          <span className="font-medium text-gray-900">{strength.topic}</span>
                          <span className="text-xs text-gray-500">({strength.frequency} mentions)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!onlyTopPriorities && (analysis.consistency.inconsistencies.length > 0 || analysis.consistency.missingInfo.length > 0) && (
        <div className="mb-6">
          <button
            onClick={() => toggleSection('consistency')}
            className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-900">Cross-Platform Consistency</h3>
              <span className={`text-sm font-medium ${analysis.consistency.isConsistent ? 'text-green-600' : 'text-red-600'}`}>
                {analysis.consistency.isConsistent ? 'Consistent' : 'Inconsistent'}
              </span>
            </div>
            {expandedSections.has('consistency') ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>
          {expandedSections.has('consistency') && (
            <div className="mt-2 pb-2 pt-1 bg-gray-50 rounded-lg space-y-2">
              {analysis.consistency.inconsistencies.map((inc, idx) => (
                <div key={idx} className="p-3 bg-yellow-50 rounded-lg mx-3">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-medium text-gray-900">
                      Inconsistent {inc.field} across {inc.platforms.join(', ')}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mb-2">
                    {Object.entries(inc.values).map(([platform, value]) => (
                      <div key={platform} className="mb-1">
                        <span className="font-medium">{platform}:</span> {value || 'Not set'}
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-gray-700">{inc.recommendation}</p>
                </div>
              ))}

              {analysis.consistency.missingInfo.map((missing, idx) => (
                <div key={idx} className="p-3 bg-blue-50 rounded-lg mx-3">
                  <div className="font-medium text-gray-900 mb-1">
                    Missing {missing.field} from {missing.missingFrom.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!onlyTopPriorities && (analysis.instagram || analysis.facebook) && (
        <div className="mb-6">
          <button
            onClick={() => toggleSection('social')}
            className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <h3 className="text-lg font-semibold text-gray-900">Social Media Analysis</h3>
            {expandedSections.has('social') ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>
          {expandedSections.has('social') && (
            <div className="mt-2 pb-2 pt-1 bg-gray-50 rounded-lg space-y-4">
              {analysis.instagram && (
                <div className="px-3">
                  <h4 className="font-semibold text-gray-900 mb-2">Instagram ({analysis.instagram.score}/100)</h4>
                  <p className="text-sm text-gray-700 mb-3">{analysis.instagram.summary}</p>
                  {analysis.instagram.issues.length > 0 && (
                    <div className="space-y-2">
                      {analysis.instagram.issues.map((issue, idx) => (
                        <div key={idx} className={`p-3 rounded-lg ${getSeverityColor(issue.severity)}`}>
                          <div className="flex items-start gap-2 flex-wrap">
                            {getSeverityIcon(issue.severity)}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium mb-1 flex items-center gap-2 flex-wrap">
                                {issue.issue}
                              </div>
                              <div className="text-xs">{issue.recommendation}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {analysis.facebook && (
                <div className="px-3">
                  <h4 className="font-semibold text-gray-900 mb-2">Facebook ({analysis.facebook.score}/100)</h4>
                  <p className="text-sm text-gray-700 mb-3">{analysis.facebook.summary}</p>
                  {analysis.facebook.issues.length > 0 && (
                    <div className="space-y-2">
                      {analysis.facebook.issues.map((issue, idx) => (
                        <div key={idx} className={`p-3 rounded-lg ${getSeverityColor(issue.severity)}`}>
                          <div className="flex items-start gap-2 flex-wrap">
                            {getSeverityIcon(issue.severity)}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium mb-1 flex items-center gap-2 flex-wrap">
                                {issue.issue}
                              </div>
                              <div className="text-xs">{issue.recommendation}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
