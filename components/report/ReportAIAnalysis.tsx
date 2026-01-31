"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Info, Sparkles } from "lucide-react";

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
    if (severity === 'critical' || severity === 'high') return 'text-red-600 bg-red-50 border-red-200';
    if (severity === 'warning' || severity === 'medium') return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-blue-600 bg-blue-50 border-blue-200';
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
            <div className="mt-4 space-y-3">
              {analysis.topPriorities.map((priority, idx) => (
                <div key={idx} className="p-4 border border-gray-200 rounded-xl shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold text-sm">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-500">{priority.source}</span>
                        <span className="text-sm text-gray-700 font-semibold">{priority.issue}</span>
                      </div>
                      <p className="text-sm text-gray-600">{priority.recommendation}</p>
                    </div>
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
            <div className="mt-4 space-y-4">
              <p className="text-sm text-gray-700">{analysis.reviews.summary}</p>
              
              {analysis.reviews.painPoints.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Pain Points</h4>
                  <div className="space-y-2">
                    {analysis.reviews.painPoints.map((point, idx) => (
                      <div key={idx} className="p-3 border border-red-200 bg-red-50 rounded-xl shadow-sm">
                        <div className="flex items-center gap-2 mb-1">
                          {getSeverityIcon(point.severity)}
                          <span className="font-medium text-gray-900">{point.topic}</span>
                          <span className="text-xs text-gray-500">({point.frequency} mentions)</span>
                        </div>
                        <p className="text-sm text-gray-700 mb-2">{point.recommendation}</p>
                        {point.exampleReviews.length > 0 && (
                          <div className="text-xs text-gray-600 italic">
                            Example: "{point.exampleReviews[0]}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analysis.reviews.strengths.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Strengths</h4>
                  <div className="space-y-2">
                    {analysis.reviews.strengths.map((strength, idx) => (
                      <div key={idx} className="p-3 border border-green-200 bg-green-50 rounded-xl shadow-sm">
                        <div className="flex items-center gap-2 mb-1">
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
            <div className="mt-4 space-y-4">
              {analysis.consistency.inconsistencies.map((inc, idx) => (
                <div key={idx} className="p-3 border border-yellow-200 bg-yellow-50 rounded-xl shadow-sm">
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
                <div key={idx} className="p-3 border border-blue-200 bg-blue-50 rounded-xl shadow-sm">
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
            <div className="mt-4 space-y-4">
              {analysis.instagram && (
                <div className="p-4 border border-gray-200 rounded-xl shadow-sm">
                  <h4 className="font-semibold text-gray-900 mb-2">Instagram ({analysis.instagram.score}/100)</h4>
                  <p className="text-sm text-gray-700 mb-3">{analysis.instagram.summary}</p>
                  {analysis.instagram.issues.length > 0 && (
                    <div className="space-y-2">
                      {analysis.instagram.issues.map((issue, idx) => (
                        <div key={idx} className={`p-2 rounded border ${getSeverityColor(issue.severity)}`}>
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
                <div className="p-4 border border-gray-200 rounded-xl shadow-sm">
                  <h4 className="font-semibold text-gray-900 mb-2">Facebook ({analysis.facebook.score}/100)</h4>
                  <p className="text-sm text-gray-700 mb-3">{analysis.facebook.summary}</p>
                  {analysis.facebook.issues.length > 0 && (
                    <div className="space-y-2">
                      {analysis.facebook.issues.map((issue, idx) => (
                        <div key={idx} className={`p-2 rounded border ${getSeverityColor(issue.severity)}`}>
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
