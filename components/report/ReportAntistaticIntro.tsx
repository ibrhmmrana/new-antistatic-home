"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Unlock } from "lucide-react";
import ReportPaywallModal from "./ReportPaywallModal";
import ShareButton from "./ShareButton";

// Palette: #060315, #ff48aa, #5b8df9 — using darker variants for UI
const DARK = "#060315";
const DARK_PINK = "#c41a75";   // darker #ff48aa
const DARK_BLUE = "#2563eb";   // darker #5b8df9

interface ReportAntistaticIntroProps {
  scanId?: string;
  placeId?: string;
  reportId?: string;
}

export default function ReportAntistaticIntro({ scanId, placeId, reportId }: ReportAntistaticIntroProps = {}) {
  const introRef = useRef<HTMLElement>(null);
  const [showPill, setShowPill] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  useEffect(() => {
    const el = introRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // When intro is no longer visible (scrolled past), show the pill
        setShowPill(!entry.isIntersecting);
      },
      {
        threshold: 0,
        rootMargin: "0px 0px -1px 0px", // consider "out" when top of intro has just left viewport
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <section
        ref={introRef}
        className="relative mb-8 rounded-2xl overflow-hidden max-w-full"
        style={{
          boxShadow: "0 8px 32px rgba(0,0,0,0.06)",
          background: "linear-gradient(135deg, #fefefe 0%, #f8f7fc 50%, #f2f0f8 100%)",
          border: "1px solid rgba(6, 3, 21, 0.08)",
        }}
        aria-label="About Antistatic"
      >
        {/* Accent bar */}
        <div
          className="h-1 w-full flex-shrink-0"
          style={{ backgroundColor: DARK }}
          aria-hidden
        />

        <div className="p-5 md:p-6 relative">
          {/* Mobile: logo on top, then heading. Desktop: heading left, logo right */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
            <h2
              className="order-2 md:order-1 text-xl md:text-2xl font-semibold leading-snug"
              style={{ color: DARK }}
            >
              Your customers decide your reputation in public, every day.
            </h2>
            <div className="order-1 md:order-2 flex-shrink-0 flex flex-col items-center md:items-end gap-1.5">
              <Link
                href="https://antistatic.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="focus:outline-none focus:ring-2 focus:ring-gray-400 rounded-lg"
                aria-label="Antistatic"
              >
                <Image
                  src="/images/antistatic logo on white.svg"
                  alt="Antistatic"
                  width={130}
                  height={30}
                  className="h-7 w-auto object-contain opacity-90 hover:opacity-100 transition-opacity"
                />
              </Link>
              <span className="text-[11px] md:text-xs text-gray-500 leading-snug text-center md:text-right max-w-[140px] md:max-w-none">
                Analyze your business at{" "}
                <span className="font-medium" style={{ color: DARK_BLUE }}>antistatic.ai</span>
              </span>
            </div>
          </div>

          <p className="text-sm md:text-base text-gray-600 leading-relaxed max-w-2xl mb-5">
            Antistatic monitors your reputation 24/7, spots threats and opportunities, and tells you exactly what to do next.
          </p>

          {/* Outcome callout + Share (when report is persisted) */}
          <div className="flex flex-wrap items-center gap-3">
            <div
              className="inline-flex items-center gap-2 rounded-xl py-2.5 px-4 border-l-4 bg-[rgba(37,99,235,0.1)]"
              style={{
                borderLeftColor: DARK_BLUE,
              }}
            >
              <span className="text-sm md:text-base font-medium text-gray-800">
                Turn a <span className="font-semibold" style={{ color: DARK }}>3.9-star</span> perception into a{" "}
                <span className="font-semibold" style={{ color: DARK }}>4.6-star</span> reality, fast.
              </span>
            </div>
            {reportId && (
              <ShareButton
                reportId={reportId}
                className="shrink-0 py-2.5 px-4 rounded-xl text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400"
              />
            )}
          </div>
        </div>
      </section>

      {/* Floating bar — appears on scroll: logo | actions (Share + Unlock) */}
      <div
        className={`fixed top-4 right-4 md:top-5 md:right-6 z-50 flex items-center rounded-2xl bg-white border border-gray-200 shadow-sm transition-all duration-300 ease-out ${
          showPill
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-2 pointer-events-none"
        }`}
      >
        <Link
          href="https://antistatic.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center shrink-0 pl-4 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#5b8df9] rounded-l-2xl rounded-r-md"
          aria-label="Go to Antistatic (opens in new tab)"
        >
          <Image
            src="/images/antistatic logo on white.svg"
            alt="Antistatic"
            width={96}
            height={24}
            className="h-5 w-auto object-contain"
          />
        </Link>
        <div className="flex items-center gap-1.5 pr-2 py-1.5 pl-1">
          {reportId && (
            <ShareButton
              reportId={reportId}
              shortLabel
              variant="pill"
              className="flex items-center justify-center gap-1.5 rounded-xl py-2 px-3 text-xs font-medium text-gray-700 bg-gray-100/90 border border-gray-200 hover:bg-gray-200/80 hover:border-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-gray-300"
            />
          )}
          <button
            type="button"
            onClick={() => setPaywallOpen(true)}
            className="flex items-center justify-center gap-1.5 rounded-xl py-2 px-3 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-500"
            aria-label="Unlock full report"
          >
            <Unlock className="w-3.5 h-3.5 shrink-0" aria-hidden />
            <span>Unlock full report</span>
          </button>
        </div>
      </div>

      <ReportPaywallModal
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        scanId={scanId}
        placeId={placeId}
        reportId={reportId}
      />
    </>
  );
}
