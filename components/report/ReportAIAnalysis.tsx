"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Info, Sparkles, Layers } from "lucide-react";

/** Official-style icons for Top Priorities source (24x24) */
function SourceIcon({ source }: { source: string }) {
  const s = source.toLowerCase();
  const className = "w-6 h-6 flex-shrink-0";
  if (s.includes("instagram")) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
      </svg>
    );
  }
  if (s.includes("facebook")) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
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
    return <Layers className={className} />;
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

interface ReportAIAnalysisProps {
  analysis: AIAnalysisResult | null;
  isLoading?: boolean;
}

export default function ReportAIAnalysis({ analysis, isLoading }: ReportAIAnalysisProps) {
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
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900">AI-Powered Analysis</h2>
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span>Analysing your online presence...</span>
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
        <div className="ml-auto px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
          {analysis.overallScore}/100
        </div>
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
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold text-sm">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="flex items-center justify-center shrink-0 text-gray-600" title={priority.source}>
                        <SourceIcon source={priority.source} />
                      </span>
                      <span className="text-sm text-gray-900 font-semibold">{priority.issue}</span>
                    </div>
                    <p className="text-sm text-gray-600">{priority.recommendation}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Review Analysis */}
      {analysis.reviews.totalReviews > 0 && (
        <div className="mb-6">
          <button
            onClick={() => toggleSection('reviews')}
            className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-900">Review Analysis</h3>
              <span className="text-sm text-gray-500">
                ({analysis.reviews.totalReviews} reviews, {analysis.reviews.sentimentScore}/100 sentiment)
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
                        <div className="flex items-center gap-2 mb-1">
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

      {/* Consistency Analysis */}
      {(analysis.consistency.inconsistencies.length > 0 || analysis.consistency.missingInfo.length > 0) && (
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
                  <div className="font-medium text-gray-900 mb-1">
                    Inconsistent {inc.field} across {inc.platforms.join(', ')}
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

      {/* Social Media Analysis */}
      {(analysis.instagram || analysis.facebook) && (
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
                          <div className="flex items-start gap-2">
                            {getSeverityIcon(issue.severity)}
                            <div className="flex-1">
                              <div className="font-medium mb-1">{issue.issue}</div>
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
                          <div className="flex items-start gap-2">
                            {getSeverityIcon(issue.severity)}
                            <div className="flex-1">
                              <div className="font-medium mb-1">{issue.issue}</div>
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
