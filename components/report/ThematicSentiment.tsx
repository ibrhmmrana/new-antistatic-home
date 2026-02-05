"use client";

import { useState, useCallback } from "react";
import type {
  ThematicSentimentSnapshot,
  ThematicSentimentCategory,
} from "@/lib/report/snapshotTypes";

const THEMATIC_COLORS: Record<string, string> = {
  Service: "#2563eb",
  Food: "#3b82f6",
  Atmosphere: "#60a5fa",
  Value: "#93c5fd",
};

const DYNAMIC_PALETTE = ["#2563eb", "#3b82f6", "#60a5fa", "#93c5fd"];

const CATEGORY_KEYS = ["service", "food", "atmosphere", "value"] as const;
const LABELS: Record<(typeof CATEGORY_KEYS)[number], string> = {
  service: "Service",
  food: "Food",
  atmosphere: "Atmosphere",
  value: "Value",
};

interface BarEntry {
  key: string;
  score: number;
  categoryKey: string;
  fill: string;
}

interface ThematicSentimentProps {
  thematicSentiment?: ThematicSentimentSnapshot | null;
  /** When true, render without outer card (for use inside a single block) */
  embedded?: boolean;
}

function barDataLegacy(thematic: ThematicSentimentSnapshot): BarEntry[] {
  return CATEGORY_KEYS.map((key) => ({
    key: LABELS[key],
    score: thematic[key],
    categoryKey: key,
    fill: THEMATIC_COLORS[LABELS[key]] ?? "#64748b",
  }));
}

function barDataFromCategories(categories: ThematicSentimentCategory[]): BarEntry[] {
  return categories.map((c, i) => ({
    key: c.label,
    score: c.score,
    categoryKey: c.key,
    fill: DYNAMIC_PALETTE[i % DYNAMIC_PALETTE.length] ?? "#64748b",
  }));
}

function getBarData(thematic: ThematicSentimentSnapshot): BarEntry[] {
  if (thematic.categories && thematic.categories.length >= 4) {
    return barDataFromCategories(thematic.categories);
  }
  return barDataLegacy(thematic);
}

export default function ThematicSentiment({
  thematicSentiment,
  embedded = false,
}: ThematicSentimentProps) {
  const [modal, setModal] = useState<{
    theme: string;
    categoryKey: string;
    justification: string;
    supportingQuotes: string[];
  } | null>(null);

  const data = thematicSentiment ? getBarData(thematicSentiment) : [];
  const openDetail = useCallback(
    (payload: { key: string; categoryKey: string }) => {
      const detail =
        thematicSentiment?.categories?.find((c) => c.key === payload.categoryKey)?.detail ??
        thematicSentiment?.categoryDetails?.[payload.categoryKey as (typeof CATEGORY_KEYS)[number]];
      if (!detail) return;
      setModal({
        theme: payload.key,
        categoryKey: payload.categoryKey,
        justification: detail.justification,
        supportingQuotes: detail.supportingQuotes ?? [],
      });
    },
    [thematicSentiment]
  );

  const content = (
    <div className="flex flex-col items-stretch text-left max-w-full min-w-0">
      <h3 className="text-sm font-semibold text-gray-800 mb-1 w-full">
        Thematic Sentiment (across Google and social media)
      </h3>
      <p className="text-xs text-gray-500 mb-3 w-full">
        See why each theme scored the way it did and read supporting quotes.
      </p>
      {data.length > 0 ? (
        <div className="space-y-3 w-full max-w-full min-w-0">
          {data.map((entry) => {
            const hasDetail =
              thematicSentiment?.categories?.find((c) => c.key === entry.categoryKey)?.detail ??
              thematicSentiment?.categoryDetails?.[entry.categoryKey as (typeof CATEGORY_KEYS)[number]];
            return (
              <div
                key={entry.categoryKey}
                className="flex items-center gap-3 min-w-0"
              >
                <span className="text-sm text-gray-700 shrink-0 w-[5.5rem] truncate" title={entry.key}>
                  {entry.key}
                </span>
                <div className="flex-1 min-w-0 h-7 rounded bg-gray-100 overflow-hidden flex items-stretch">
                  <div
                    className="h-full rounded-r flex items-center justify-end pr-1.5 transition-[width] duration-300"
                    style={{
                      width: `${Math.max(0, Math.min(100, entry.score))}%`,
                      backgroundColor: entry.fill,
                    }}
                  >
                    {entry.score >= 20 && (
                      <span className="text-xs font-medium text-white drop-shadow-sm">
                        {entry.score}
                      </span>
                    )}
                  </div>
                </div>
                {entry.score < 20 && (
                  <span className="text-xs font-medium text-gray-500 w-6 shrink-0">{entry.score}</span>
                )}
                {hasDetail ? (
                  <button
                    type="button"
                    onClick={() => openDetail({ key: entry.key, categoryKey: entry.categoryKey })}
                    className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded px-2 py-1"
                  >
                    Why?
                  </button>
                ) : (
                  <span className="w-10 shrink-0" aria-hidden />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="h-[120px] flex items-center justify-center text-gray-400 text-sm text-center w-full">
          No thematic sentiment data yet. Add reviews or comments and re-run
          analysis.
        </div>
      )}
    </div>
  );

  return (
    <>
      {embedded ? (
        <div className="pt-6 border-t border-gray-200/80 mt-6">
          {content}
        </div>
      ) : (
        <div
          className="rounded-2xl border border-white/20 bg-white/70 backdrop-blur-md shadow-lg p-5"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.06)" }}
        >
          {content}
        </div>
      )}

      {/* Evidence modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-white/5"
          onClick={() => setModal(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="evidence-modal-title"
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="evidence-modal-title" className="text-lg font-semibold text-gray-900 mb-4">
              {modal.theme} — Why this score?
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  The why
                </h3>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {modal.justification}
                </p>
              </div>
              {modal.supportingQuotes.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    The proof (quotes from reviews &amp; comments)
                  </h3>
                  <ul className="space-y-2">
                    {modal.supportingQuotes.map((q, i) => (
                      <li
                        key={i}
                        className="text-sm text-gray-600 pl-3 border-l-2 border-blue-200 italic"
                      >
                        &ldquo;{q}&rdquo;
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
