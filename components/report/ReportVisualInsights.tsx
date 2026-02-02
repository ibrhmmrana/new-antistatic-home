"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import type { ReportScores } from "@/lib/report/types";
import type {
  ThematicSentimentSnapshot,
  CompetitiveBenchmarkSnapshot,
} from "@/lib/report/snapshotTypes";
import ThematicSentiment from "./ThematicSentiment";

const ANTISTATIC_BLUE = "#2563eb";
const LIGHT_GREY = "#94a3b8";

interface ReportVisualInsightsProps {
  scores: ReportScores;
  businessName?: string | null;
  thematicSentiment?: ThematicSentimentSnapshot | null;
  competitiveBenchmark?: CompetitiveBenchmarkSnapshot | null;
  isLoading?: boolean;
  onOpenPrescription?: (prescription: Prescription) => void;
}

function pct(s: { score: number; maxScore: number }) {
  return s.maxScore > 0 ? Math.round((s.score / s.maxScore) * 100) : 0;
}

function gapChartData(
  scores: ReportScores,
  benchmark?: CompetitiveBenchmarkSnapshot | null
) {
  const keys = [
    { key: "Search Results", yourBusiness: pct(scores.searchResults), marketLeader: benchmark?.marketLeaderAverage?.searchResults ?? 75 },
    { key: "Website Experience", yourBusiness: pct(scores.websiteExperience), marketLeader: benchmark?.marketLeaderAverage?.websiteExperience ?? 75 },
    { key: "Local Listings", yourBusiness: pct(scores.localListings), marketLeader: benchmark?.marketLeaderAverage?.localListings ?? 75 },
    { key: "Social Presence", yourBusiness: pct(scores.socialPresence), marketLeader: benchmark?.marketLeaderAverage?.socialPresence ?? 75 },
  ];
  return keys;
}

function VisualInsightsSkeleton() {
  return (
    <section className="mb-8">
      <div className="h-8 w-72 bg-gray-200 rounded-lg animate-pulse mb-4" />
      <div
        className="rounded-2xl border border-white/20 bg-white/70 backdrop-blur-md shadow-lg p-5"
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.06)" }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="h-4 w-28 bg-gray-200 rounded animate-pulse mb-3" />
            <div className="h-3 w-full max-w-sm bg-gray-100 rounded animate-pulse mb-3" />
            <div className="h-[240px] w-full bg-gray-100 rounded-lg animate-pulse" />
          </div>
          <div className="flex flex-col">
            <div className="h-4 w-36 bg-gray-200 rounded animate-pulse mb-3" />
            <div className="h-4 w-full bg-gray-100 rounded animate-pulse mb-2" />
            <div className="h-4 w-full bg-gray-100 rounded animate-pulse mb-2" />
            <div className="h-4 w-full max-w-[75%] bg-gray-100 rounded animate-pulse mb-4" />
            <div className="h-3 w-24 bg-gray-100 rounded animate-pulse mb-2" />
            <div className="h-4 w-full bg-gray-100 rounded animate-pulse mb-3" />
            <div className="h-3 w-20 bg-gray-100 rounded animate-pulse mb-2" />
            <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-gray-200/50">
          <div className="h-4 w-32 bg-gray-200 rounded animate-pulse mb-3" />
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-3 w-20 bg-gray-100 rounded animate-pulse flex-shrink-0" />
                <div className="h-4 flex-1 max-w-full bg-gray-100 rounded animate-pulse" style={{ width: `${60 + i * 8}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function ReportVisualInsights({
  scores,
  businessName,
  thematicSentiment,
  competitiveBenchmark,
  isLoading = false,
}: ReportVisualInsightsProps) {
  if (isLoading) {
    return <VisualInsightsSkeleton />;
  }

  const gapData = gapChartData(scores, competitiveBenchmark);
  const hasBenchmark = !!competitiveBenchmark?.marketLeaderAverage;
  const yourLabel = businessName?.trim() || "Your Business";
  const marketLabel = "Top 3 Competitors (Avg)";

  return (
    <section className="mb-8 report-visual-insights">
      <h2 className="text-2xl font-semibold text-gray-900 mb-4">
        Competitive Edge &amp; Insights
      </h2>

      {/* Single block: Performance gap + Revenue Opportunity + Thematic sentiment */}
      <div
        className="rounded-2xl border border-white/20 bg-white/70 backdrop-blur-md shadow-lg p-4 md:p-5 max-w-full overflow-hidden"
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.06)" }}
      >
        {/* Row 1: Performance gap + Revenue Opportunity side-by-side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">
              Performance gap
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Your scores vs market leader average. See exactly where you’re ahead or behind.
            </p>
            <div className="h-[240px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={gapData}
                  margin={{ top: 8, right: 16, left: 4, bottom: 32 }}
                >
                  <XAxis type="category" dataKey="key" tick={{ fontSize: 10 }} />
                  <YAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} width={28} />
                  <Tooltip
                    contentStyle={{
                      fontSize: "12px",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    }}
                    formatter={(value: number, name: string) => [`${value}%`, name]}
                  />
                  {hasBenchmark && <Legend />}
                  <Bar dataKey="yourBusiness" name={yourLabel} fill={ANTISTATIC_BLUE} radius={[4, 4, 0, 0]} maxBarSize={32} />
                  {hasBenchmark && (
                    <Bar dataKey="marketLeader" name={marketLabel} fill={LIGHT_GREY} radius={[4, 4, 0, 0]} maxBarSize={32} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex flex-col">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">
              Revenue Opportunity
            </h3>
            {competitiveBenchmark?.potentialImpact ? (
              <div className="flex flex-col gap-3 flex-1">
                <p className="text-sm text-gray-700 leading-relaxed">
                  {competitiveBenchmark.potentialImpact}
                </p>
                {competitiveBenchmark.competitiveAdvantage && (
                  <div>
                    <span className="text-xs font-medium text-emerald-700 uppercase tracking-wide">
                      Your advantage
                    </span>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {competitiveBenchmark.competitiveAdvantage}
                    </p>
                  </div>
                )}
                {competitiveBenchmark.urgentGap && (
                  <div>
                    <span className="text-xs font-medium text-amber-700 uppercase tracking-wide">
                      Urgent gap
                    </span>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {competitiveBenchmark.urgentGap}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic flex-1">
                Run a full report with competitors to see your revenue opportunity
                and how you compare to market leaders.
              </p>
            )}
          </div>
        </div>

        {/* Thematic sentiment (embedded, no extra card) */}
        <ThematicSentiment thematicSentiment={thematicSentiment} embedded />
      </div>
    </section>
  );
}
