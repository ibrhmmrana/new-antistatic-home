"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Check, X, AlertCircle } from "lucide-react";
import type { ChecklistSection } from "@/lib/report/types";

/** Friendly labels for GBP/local-listings checks (so snapshots and any legacy data show correct headings) */
const LOCAL_LISTINGS_LABEL_MAP: Record<string, string> = {
  gbp_price: "Price range",
  gbp_price_range: "Price range",
  gbp_social: "Social media links",
  gbp_description_keywords: "Description includes relevant keywords",
  gbp_desc_keywords: "Description includes relevant keywords",
  gbp_category_keywords: "Categories match keywords",
};

function getDisplayLabel(sectionId: string, checkKey: string, fallbackLabel: string): string {
  if (sectionId === "local-listings" && LOCAL_LISTINGS_LABEL_MAP[checkKey]) {
    return LOCAL_LISTINGS_LABEL_MAP[checkKey];
  }
  return fallbackLabel;
}

/** Section id → 1 or 2 modules (hardcoded). website-experience has no block. */
const SECTION_MODULES: Record<string, [ModuleId] | [ModuleId, ModuleId] | null> = {
  "local-listings": ["reputation_hub"],
  "social-presence": ["social_studio"],
  "search-results": ["competitor_radar"],
  "website-experience": null,
};

interface ReportChecklistSectionProps {
  section: ChecklistSection;
  onOpenPrescription?: (prescription: Prescription) => void;
}

export default function ReportChecklistSection({ section, onOpenPrescription }: ReportChecklistSectionProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  
  const toggleItem = (key: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedItems(newExpanded);
  };
  
  const getStatusIcon = (status: string) => {
    const iconClass = "w-3 h-3 text-white flex-shrink-0";
    switch (status) {
      case 'good':
        return (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-600 flex-shrink-0">
            <Check className={iconClass} strokeWidth={3} />
          </span>
        );
      case 'warn':
        return (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 flex-shrink-0">
            <AlertCircle className={iconClass} strokeWidth={2.5} />
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-600 flex-shrink-0">
            <X className={iconClass} strokeWidth={3} />
          </span>
        );
    }
  };

  const needWork = section.checks.filter(c => c.status === 'bad' || c.status === 'warn').length;
  const total = section.checks.length;
  const isFaulty = (status: string) => status === 'bad' || status === 'warn';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8 shadow-md">
      {/* Section heading */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-semibold text-gray-900">{section.title}</h2>
          <span className="text-sm font-medium text-gray-500">
            {section.score}/{section.maxScore}
          </span>
        </div>
        {total > 0 && (
          <p className="text-sm text-gray-500">
            {total} things reviewed{needWork > 0 ? `, ${needWork} need work` : ''}
          </p>
        )}
      </div>

      {/* Checklist items */}
      {section.checks.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No checklist items available for this section.
        </div>
      ) : (
        <div className="space-y-1">
          {section.checks.map((check) => {
            const isExpanded = expandedItems.has(check.key);
            const faulty = isFaulty(check.status);

            return (
              <div key={check.key} className="overflow-hidden">
                <button
                  onClick={() => toggleItem(check.key)}
                  className="w-full py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors text-left rounded"
                >
                  <div className="flex-shrink-0 mt-0.5">{getStatusIcon(check.status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900">{getDisplayLabel(section.id, check.key, check.label)}</div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      {faulty ? check.howToFix : check.whatWeFound}
                    </div>
                  </div>
                  <div className="flex-shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Expanded: what we found + what we were looking for (and how to fix if faulty) */}
                {isExpanded && (
                  <div className="pb-3 pt-1 bg-gray-50 space-y-3 text-sm">
                    <div>
                      <h5 className="font-semibold text-gray-900 mb-1">What we found</h5>
                      <p className="text-gray-600">{check.whatWeFound}</p>
                    </div>
                    <div>
                      <h5 className="font-semibold text-gray-900 mb-1">What we were looking for</h5>
                      <p className="text-gray-600">{check.whatWeWereLookingFor}</p>
                    </div>
                    {faulty && (
                      <div>
                        <h5 className="font-semibold text-gray-900 mb-1">How to fix</h5>
                        <p className="text-gray-600">{check.howToFix}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
