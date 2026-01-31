"use client";

import { useState, useCallback } from "react";
import ReportLeftRail from "@/components/report/ReportLeftRail";
import ReportTopCards from "@/components/report/ReportTopCards";
import ReportSearchVisibility from "@/components/report/ReportSearchVisibility";
import ReportChecklistSection from "@/components/report/ReportChecklistSection";
import ReportAIAnalysis from "@/components/report/ReportAIAnalysis";
import type { ReportSchema } from "@/lib/report/types";

export interface ReportReview {
  reviewId: string;
  authorName: string;
  profilePhotoUrl: string | null;
  relativeTime: string | null;
  rating: number;
  text: string;
  isLocalGuide: boolean;
}

export interface ReportRendererProps {
  report: ReportSchema & { reviews?: ReportReview[]; aiAnalysis?: unknown };
  business: { placeId: string; name: string; addr: string };
  aiAnalysis?: unknown;
  aiAnalysisLoading?: boolean;
  readOnly?: boolean;
  shareUrl?: string | null;
}

function ReviewsSection({
  placeId,
  reviews,
}: {
  placeId: string;
  reviews: ReportReview[];
}) {
  if (!placeId || !reviews.length) return null;

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const renderStars = (rating: number, reviewId: string) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    return (
      <div className="flex items-center gap-0.5">
        {[...Array(fullStars)].map((_, i) => (
          <svg
            key={`full-${i}`}
            className="w-4 h-4 text-yellow-400 fill-current"
            viewBox="0 0 20 20"
          >
            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
          </svg>
        ))}
        {hasHalfStar && (
          <svg
            className="w-4 h-4 text-yellow-400 fill-current"
            viewBox="0 0 20 20"
          >
            <defs>
              <linearGradient id={`half-fill-${reviewId}`}>
                <stop offset="50%" stopColor="currentColor" />
                <stop offset="50%" stopColor="transparent" stopOpacity="1" />
              </linearGradient>
            </defs>
            <path
              fill={`url(#half-fill-${reviewId})`}
              d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"
            />
          </svg>
        )}
        {[...Array(emptyStars)].map((_, i) => (
          <svg
            key={`empty-${i}`}
            className="w-4 h-4 text-gray-300 fill-current"
            viewBox="0 0 20 20"
          >
            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
          </svg>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8 shadow-sm">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">📝 Google Reviews</h2>
      <div className="space-y-4">
        {reviews.map((review) => (
          <div
            key={review.reviewId}
            className="border border-gray-200 rounded-lg p-6 hover:border-gray-300 transition-colors"
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 relative">
                {review.profilePhotoUrl && !review.profilePhotoUrl.startsWith("data:") ? (
                  <div className="relative w-12 h-12 rounded-full overflow-hidden">
                    <img
                      src={review.profilePhotoUrl}
                      alt={review.authorName}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = "none";
                        if (target.parentElement) {
                          target.parentElement.innerHTML = `
                            <div class="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-sm">
                              ${getInitials(review.authorName)}
                            </div>
                          `;
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-sm">
                    {getInitials(review.authorName)}
                  </div>
                )}
                {review.isLocalGuide && (
                  <div
                    className="absolute w-4 h-4 bg-yellow-400 rounded-full ring-2 ring-white shadow-sm flex items-center justify-center"
                    style={{ bottom: "-2px", right: "-2px" }}
                  >
                    <svg className="w-2.5 h-2.5 text-white fill-current" viewBox="0 0 20 20">
                      <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-lg font-semibold text-gray-900 mb-1">
                      {review.authorName}
                    </div>
                    {review.relativeTime && (
                      <div className="text-sm text-gray-500">{review.relativeTime}</div>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {renderStars(review.rating, review.reviewId)}
                  </div>
                </div>
                <div className="text-gray-700 leading-relaxed">{review.text}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReportRenderer({
  report,
  business,
  aiAnalysis: aiAnalysisProp,
  aiAnalysisLoading = false,
  readOnly = false,
  shareUrl: shareUrlProp,
}: ReportRendererProps) {
  const [copied, setCopied] = useState(false);
  const aiAnalysis = aiAnalysisProp ?? (report as ReportSchema & { aiAnalysis?: unknown }).aiAnalysis;
  const reviews = (report as ReportSchema & { reviews?: ReportReview[] }).reviews ?? [];

  const copyShareLink = useCallback(() => {
    const url = readOnly ? (typeof window !== "undefined" ? window.location.href : "") : (shareUrlProp ?? "");
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [readOnly, shareUrlProp]);

  const totalChecks = report.sections.reduce((sum, section) => sum + section.checks.length, 0);
  const needWork = report.sections.reduce(
    (sum, section) =>
      sum + section.checks.filter((c) => c.status === "bad" || c.status === "warn").length,
    0
  );

  const showShareButton = readOnly || shareUrlProp;

  return (
    <div className="min-h-screen bg-white md:bg-[#f6f7f8] flex">
      <ReportLeftRail scores={report.scores} />
      <div className="flex-1 p-8 pb-24 md:pb-8">
        <div className="max-w-6xl mx-auto">
          {showShareButton && (
            <div className="flex justify-end mb-4">
              <button
                type="button"
                onClick={copyShareLink}
                className="text-sm px-4 py-2 rounded-full border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition-colors"
              >
                {copied ? "Copied!" : "Copy share link"}
              </button>
            </div>
          )}
          <ReportTopCards
            impact={report.summaryCards.impact}
            competitors={report.summaryCards.competitors}
            businessName={report.meta.businessName}
            websiteUrl={report.meta.websiteUrl}
            businessAvatar={report.summaryCards.impact.businessAvatar}
            placeId={report.meta.placeId}
            sections={report.sections}
            overallGrade={report.scores.overall.label}
            aiAnalysis={aiAnalysis}
          />
          <ReportSearchVisibility
            searchVisibility={report.searchVisibility}
            targetPlaceId={report.meta.placeId}
            targetDomain={report.meta.websiteUrl || null}
          />
          <ReportAIAnalysis analysis={aiAnalysis} isLoading={aiAnalysisLoading} />
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-1">
              {totalChecks} things reviewed, {needWork} need work
            </h2>
            <p className="text-sm text-gray-600">See what&apos;s wrong and how to improve</p>
          </div>
          {report.sections.map((section) => (
            <ReportChecklistSection key={section.id} section={section} />
          ))}
          <ReviewsSection placeId={business.placeId} reviews={reviews} />
        </div>
      </div>
    </div>
  );
}
