"use client";

import { useEffect, useState, useRef } from "react";
import { X, Send, Check } from "lucide-react";

interface ShareReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
}

type ModalState = "idle" | "sending" | "success" | "error";

/**
 * Modal that collects a recipient email and sends the report via email.
 */
export default function ShareReportModal({ open, onOpenChange, reportId }: ShareReportModalProps) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<ModalState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setState("idle");
      setErrorMsg(null);
      setEmail("");
      // Focus the input after a tick (modal animation)
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSend = async () => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@") || !trimmed.includes(".")) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }

    setState("sending");
    setErrorMsg(null);

    try {
      const res = await fetch("/api/public/reports/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reportId, recipientEmail: trimmed }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setState("error");
        setErrorMsg(data.error || "Something went wrong. Please try again.");
        return;
      }

      setState("success");
      // Auto-close after 2.5s
      setTimeout(() => onOpenChange(false), 2500);
    } catch {
      setState("error");
      setErrorMsg("Network error. Please try again.");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && state === "idle") {
      handleSend();
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] backdrop-blur-sm bg-black/20 transition-opacity duration-300 ease-out"
        aria-hidden
        onClick={() => onOpenChange(false)}
      />

      {/* Modal card */}
      <div
        className="fixed left-1/2 top-1/2 z-[61] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 id="share-modal-title" className="text-lg font-semibold text-gray-900">
            Share this report
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 md:p-6">
          {state === "success" ? (
            /* Success state */
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">Report sent</h3>
              <p className="text-sm text-gray-600">
                We sent the report link to <span className="font-medium text-gray-900">{email.trim()}</span>.
              </p>
            </div>
          ) : (
            /* Email input state */
            <>
              <p className="text-sm text-gray-600 mb-4">
                Enter an email address and we will send them a link to view this report.
              </p>

              {errorMsg && (
                <p className="text-sm text-red-600 mb-3" role="alert">
                  {errorMsg}
                </p>
              )}

              <div className="space-y-3">
                <input
                  ref={inputRef}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="colleague@example.com"
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-900 bg-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-60"
                  disabled={state === "sending"}
                />

                <button
                  type="button"
                  onClick={handleSend}
                  disabled={state === "sending"}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
                >
                  {state === "sending" ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send report</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
