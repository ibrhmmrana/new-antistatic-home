"use client";

import type { DiagnosisSnapshot, Prescription } from "@/lib/report/snapshotTypes";

interface PrescriptionChipProps {
  faultId: string;
  diagnosis: DiagnosisSnapshot | undefined | null;
  onOpen: (prescription: Prescription) => void;
  className?: string;
}

export default function PrescriptionChip({
  faultId,
  diagnosis,
  onOpen,
  className = "",
}: PrescriptionChipProps) {
  const prescription = diagnosis?.prescriptions?.[faultId];
  if (!prescription) return null;

  return (
    <button
      type="button"
      onClick={() => onOpen(prescription)}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors flex-shrink-0 ${className}`}
    >
      Fix with {prescription.moduleName}
    </button>
  );
}
