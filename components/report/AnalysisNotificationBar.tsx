"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

const STORAGE_KEY_PREFIX = "analysis_notification_dismissed_";

interface AnalysisNotificationBarProps {
  /** When true, the bar is visible (report loaded, not yet redirected). */
  visible: boolean;
  scanId: string;
  /** When true, add extra bottom spacing on mobile so the bar sits above a sticky footer. */
  aboveStickyFooter?: boolean;
}

/**
 * Closable bottom notification bar shown during analysis:
 * "We'll email the report when it's ready. You can also stay here to watch it."
 * Dismissal is persisted in sessionStorage per scanId.
 */
export default function AnalysisNotificationBar({ visible, scanId, aboveStickyFooter }: AnalysisNotificationBarProps) {
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [poppedIn, setPoppedIn] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !scanId) return;
    try {
      const key = `${STORAGE_KEY_PREFIX}${scanId}`;
      const stored = sessionStorage.getItem(key);
      setDismissed(stored === "1");
    } catch {
      // ignore
    }
  }, [mounted, scanId]);

  // Smooth pop-out: slide up after a short delay so it doesn't appear the same frame as the report
  useEffect(() => {
    if (!visible) {
      setPoppedIn(false);
      return;
    }
    const t = setTimeout(() => setPoppedIn(true), 600);
    return () => clearTimeout(t);
  }, [visible]);

  const handleClose = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(`${STORAGE_KEY_PREFIX}${scanId}`, "1");
    } catch {
      // ignore
    }
  };

  const show = visible && !dismissed && poppedIn;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 flex justify-center px-4 pointer-events-none ${aboveStickyFooter ? "pb-28 md:pb-6" : "pb-4 md:pb-6"}`}
      aria-live="polite"
      aria-hidden={!show}
    >
      <div
        className={`
          pointer-events-auto
          w-max max-w-[calc(100vw-2rem)] md:max-w-4xl
          rounded-xl border border-gray-200 bg-white shadow-lg
          px-4 py-3 md:px-5 md:py-4
          flex items-center justify-between gap-4
          transition-all duration-300 ease-out
          md:bottom-6
        `}
        style={{
          transform: show ? "translateY(0)" : "translateY(calc(100% + 1.5rem))",
          opacity: show ? 1 : 0,
        }}
      >
        <p className="text-sm md:text-base text-gray-700 flex-1 min-w-0">
          We&apos;ll email your report when it&apos;s ready, no need to wait. Or stay and watch it build in real time.
        </p>
        <button
          type="button"
          onClick={handleClose}
          className="flex-shrink-0 p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label="Dismiss"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
