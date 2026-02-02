"use client";

import type { ModuleId } from "@/lib/report/snapshotTypes";
import type { Prescription } from "@/lib/report/snapshotTypes";
import { MODULES, getGenericPrescription } from "@/lib/diagnosis/modules";

interface RecommendedFixStripProps {
  /** One or two module ids (max two). */
  modules: [ModuleId] | [ModuleId, ModuleId];
  /** If false, use "Improve with" instead of "Fix with". */
  hasAnyFault: boolean;
  onOpenPrescription: (prescription: Prescription) => void;
}

/**
 * Renders outside section blocks (below them). Clean strip with recommended modules.
 */
export default function RecommendedFixStrip({
  modules,
  hasAnyFault,
  onOpenPrescription,
}: RecommendedFixStripProps) {
  const verb = hasAnyFault ? "Fix with Antistatic's" : "Improve with Antistatic's";

  return (
    <div className="mb-8 w-full min-w-0 overflow-x-auto overflow-y-hidden rounded-xl border border-gray-200/80 bg-gray-50/80 px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex flex-nowrap items-center gap-2 min-w-max">
        <span className="text-sm font-medium text-gray-600 whitespace-nowrap shrink-0">{verb}</span>
        <div className="flex flex-nowrap items-center gap-2 shrink-0">
          {modules.map((moduleId, i) => (
            <span key={moduleId} className="flex items-center gap-2 shrink-0">
              {i > 0 && <span className="text-gray-400 font-medium shrink-0">+</span>}
              <button
                type="button"
                onClick={() => onOpenPrescription(getGenericPrescription(moduleId))}
                className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 hover:border-gray-400 transition-colors whitespace-nowrap shrink-0"
              >
                {MODULES[moduleId].name}
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
