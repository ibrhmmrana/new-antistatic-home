"use client";

import { useState } from "react";
import { Share2, Link2 } from "lucide-react";
import ShareReportModal from "./ShareReportModal";

interface ShareButtonProps {
  reportId: string;
  className?: string;
  /** When true, shows "Share" instead of "Share Report" */
  shortLabel?: boolean;
  /** When "pill", no default size/padding is applied; use className for full control */
  variant?: "default" | "pill";
}

const defaultClass =
  "flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors";

/**
 * Share button that opens a modal to email the report link.
 */
export default function ShareButton({ reportId, className, shortLabel, variant = "default" }: ShareButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const buttonClass = variant === "pill" ? (className ?? "") : `${defaultClass} ${className ?? ""}`;

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className={buttonClass}
        title="Share report"
      >
        <Share2 className="w-3.5 h-3.5 shrink-0" />
        <span>{shortLabel ? "Share" : "Share Report"}</span>
      </button>

      <ShareReportModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        reportId={reportId}
      />
    </>
  );
}
