"use client";

import { useState, useCallback } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";
import type { ThematicSentimentSnapshot } from "@/lib/report/snapshotTypes";

const THEMATIC_COLORS: Record<string, string> = {
  Service: "#2563eb",
  Food: "#3b82f6",
  Atmosphere: "#60a5fa",
  Value: "#93c5fd",
};

const CATEGORY_KEYS = ["service", "food", "atmosphere", "value"] as const;
const LABELS: Record<(typeof CATEGORY_KEYS)[number], string> = {
  service: "Service",
  food: "Food",
  atmosphere: "Atmosphere",
  value: "Value",
};

interface ThematicSentimentProps {
  thematicSentiment?: ThematicSentimentSnapshot | null;
  /** When true, render without outer card (for use inside a single block) */
  embedded?: boolean;
}

function barData(thematic: ThematicSentimentSnapshot) {
  return CATEGORY_KEYS.map((key) => ({
    key: LABELS[key],
    score: thematic[key],
    categoryKey: key,
    fill: THEMATIC_COLORS[LABELS[key]] ?? "#64748b",
  }));
}

export default function ThematicSentiment({
  thematicSentiment,
  embedded = false,
}: ThematicSentimentProps) {
  const [modal, setModal] = useState<{
    theme: string;
    categoryKey: (typeof CATEGORY_KEYS)[number];
    justification: string;
    supportingQuotes: string[];
  } | null>(null);

  const data = thematicSentiment ? barData(thematicSentiment) : [];
  const handleBarClick = useCallback(
    (payload: { key: string; categoryKey: (typeof CATEGORY_KEYS)[number] }) => {
      if (!thematicSentiment?.categoryDetails?.[payload.categoryKey]) {
        return;
      }
      const detail = thematicSentiment.categoryDetails[payload.categoryKey];
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
    <>
      <h3 className="text-sm font-semibold text-gray-800 mb-1">
        Thematic sentiment (reviews &amp; comments)
      </h3>
      <p className="text-xs text-gray-500 mb-3">
        Click a bar to see why it scored that way and supporting quotes.
      </p>
      {data.length > 0 ? (
          <div className="h-[200px] w-full cursor-pointer">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={data}
                margin={{ top: 4, right: 24, left: 72, bottom: 4 }}
              >
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="key" width={68} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number) => [`${value}/100`, "Score"]}
                  contentStyle={{
                    fontSize: "12px",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                  }}
                />
                <Bar
                  dataKey="score"
                  name="Score"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={28}
                  onClick={(data: { key?: string; categoryKey?: (typeof CATEGORY_KEYS)[number] }) => {
                    if (data?.categoryKey) handleBarClick({ key: data.key ?? "", categoryKey: data.categoryKey });
                  }}
                >
                  {data.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.fill}
                      cursor={
                        thematicSentiment?.categoryDetails?.[entry.categoryKey]
                          ? "pointer"
                          : "default"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
      ) : (
        <div className="h-[120px] flex items-center justify-center text-gray-400 text-sm">
          No thematic sentiment data yet. Add reviews or comments and re-run
          analysis.
        </div>
      )}
    </>
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
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
