"use client";

import Image from "next/image";
import { AlertCircle, CheckCircle2, Info, Layers } from "lucide-react";
import type { AIAnalysisResultType } from "./ReportAIAnalysis";

/** Source icon for Issues list — same style as Top Priorities (Cross-Platform = Layers, Instagram/Facebook = brand logos) */
function SourceIcon({ source }: { source: "Cross-Platform" | "Instagram" | "Facebook" }) {
  const className = "w-6 h-6 flex-shrink-0";
  if (source === "Instagram") {
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
  if (source === "Facebook") {
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
  return <Layers className={`${className} text-indigo-600`} aria-hidden />;
}

function getSeverityTextColor(severity: string) {
  if (severity === "critical" || severity === "high") return "text-red-600";
  if (severity === "warning" || severity === "medium") return "text-amber-600";
  return "text-gray-700";
}

function getSeverityIcon(severity: string) {
  if (severity === "critical" || severity === "high") return <AlertCircle className="w-4 h-4 text-red-600" />;
  if (severity === "warning" || severity === "medium") return <Info className="w-4 h-4 text-amber-600" />;
  return <CheckCircle2 className="w-4 h-4 text-gray-700" />;
}

interface ReportAIAnalysisRestProps {
  analysis: AIAnalysisResultType | null;
}

/** Renders Review Analysis, Cross-Platform Consistency, and Social Media Analysis (below Thematic sentiment). Always expanded. */
export default function ReportAIAnalysisRest({ analysis }: ReportAIAnalysisRestProps) {
  if (!analysis) return null;

  const hasReviews = analysis.reviews.totalReviews > 0;
  const hasConsistency =
    analysis.consistency.inconsistencies.length > 0 || analysis.consistency.missingInfo.length > 0;
  const hasSocial = !!(analysis.instagram || analysis.facebook);

  // Combined list: consistency (inconsistencies + missing) + social (Instagram + Facebook issues)
  const consistencyItems: Array<{ source: "Cross-Platform"; type: "inconsistency"; data: (typeof analysis.consistency.inconsistencies)[0] } | { source: "Cross-Platform"; type: "missing"; data: (typeof analysis.consistency.missingInfo)[0] }> = [];
  analysis.consistency.inconsistencies.forEach((inc) => consistencyItems.push({ source: "Cross-Platform", type: "inconsistency", data: inc }));
  analysis.consistency.missingInfo.forEach((m) => consistencyItems.push({ source: "Cross-Platform", type: "missing", data: m }));

  const socialItems: Array<{ source: "Instagram" | "Facebook"; issue: { severity: string; issue: string; recommendation: string } }> = [];
  analysis.instagram?.issues?.forEach((issue) => socialItems.push({ source: "Instagram", issue }));
  analysis.facebook?.issues?.forEach((issue) => socialItems.push({ source: "Facebook", issue }));

  const hasIssuesList = consistencyItems.length > 0 || socialItems.length > 0;

  if (!hasReviews && !hasIssuesList) return null;

  return (
    <div className="pt-4 mt-4 rounded-xl border border-gray-200 p-4 md:p-5">
      {/* Review Analysis */}
      {hasReviews && (
        <div className="mb-6 last:mb-0">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Review Analysis
            <span className="text-sm font-normal text-gray-500 ml-2">
              ({analysis.reviews.totalReviews} reviews, {analysis.reviews.sentimentScore}/100 sentiment)
            </span>
          </h3>
          <div className="mt-2 space-y-4">
            <p className="text-sm text-gray-700">{analysis.reviews.summary}</p>
            {analysis.reviews.painPoints.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Pain Points</h4>
                <div className="space-y-2">
                  {analysis.reviews.painPoints.map((point, idx) => (
                    <div key={idx} className="p-3 rounded-lg">
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
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Strengths</h4>
                <div className="space-y-2">
                  {analysis.reviews.strengths.map((strength, idx) => (
                    <div key={idx} className="p-3 rounded-lg flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <span className="font-medium text-gray-900">{strength.topic}</span>
                      <span className="text-xs text-gray-500">({strength.frequency} mentions)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Combined list: issues & missing info from Cross-Platform + Social (icons like Top Priorities) */}
      {hasIssuesList && (
        <div className="mb-0">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Issues & missing info</h3>
          <div className="space-y-2">
            {consistencyItems.map((item, idx) => (
              <div key={`cp-${idx}`} className="flex items-start gap-3 p-3 rounded-lg">
                <span className="flex-shrink-0 mt-0.5" title="Cross-Platform">
                  <SourceIcon source="Cross-Platform" />
                </span>
                <div className="flex-1 min-w-0">
                  {item.type === "inconsistency" ? (
                    <>
                      <div className="font-medium text-gray-900">
                        <span>Inconsistent {item.data.field} across {item.data.platforms.join(", ")}</span>
                        <span className="inline-flex align-middle ml-1.5 shrink-0" aria-hidden>
                          <Info className="w-4 h-4 text-amber-600" />
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 my-1">
                        {Object.entries(item.data.values).map(([platform, value]) => (
                          <div key={platform}>
                            <span className="font-medium">{platform}:</span> {value || "Not set"}
                          </div>
                        ))}
                      </div>
                      <p className="text-sm text-gray-700">{item.data.recommendation}</p>
                    </>
                  ) : (
                    <div className="font-medium text-gray-900">
                      <span>Missing {item.data.field} from {item.data.missingFrom.join(", ")}</span>
                      <span className="inline-flex align-middle ml-1.5 shrink-0" aria-hidden>
                        <Info className="w-4 h-4 text-amber-600" />
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {socialItems.map((item, idx) => (
              <div
                key={`social-${idx}`}
                className={`flex items-start gap-3 p-3 rounded-lg ${getSeverityTextColor(item.issue.severity)}`}
              >
                <span className="flex-shrink-0 mt-0.5" title={item.source}>
                  <SourceIcon source={item.source} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">
                    <span>{item.issue.issue}</span>
                    <span className="inline-flex align-middle ml-1.5 shrink-0" aria-hidden>
                      {getSeverityIcon(item.issue.severity)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">{item.issue.recommendation}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
