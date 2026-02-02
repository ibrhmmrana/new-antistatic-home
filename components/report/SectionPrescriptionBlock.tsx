"use client";

import type { ModuleId } from "@/lib/report/snapshotTypes";
import type { Prescription } from "@/lib/report/snapshotTypes";
import { MODULES, getGenericPrescription } from "@/lib/diagnosis/modules";

interface SectionPrescriptionBlockProps {
  /** One or two module ids (max two). */
  modules: [ModuleId] | [ModuleId, ModuleId];
  /** If false, use "Improve with" instead of "Fix with". */
  hasAnyFault: boolean;
  onOpenPrescription: (prescription: Prescription) => void;
}

export default function SectionPrescriptionBlock({
  modules,
  hasAnyFault,
  onOpenPrescription,
}: SectionPrescriptionBlockProps) {
  if (modules.length === 0) return null;

  const verb = hasAnyFault ? "Fix with" : "Improve with";
  const names = modules.map((id) => MODULES[id].name);

  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <p className="text-sm text-gray-600 mb-2">
        {verb} {names.length === 1 ? names[0] : `${names[0]} + ${names[1]}`}
      </p>
      <div className="flex flex-wrap gap-2">
        {modules.map((moduleId) => (
          <button
            key={moduleId}
            type="button"
            onClick={() => onOpenPrescription(getGenericPrescription(moduleId))}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg transition-colors"
          >
            {MODULES[moduleId].name}
          </button>
        ))}
      </div>
    </div>
  );
}
