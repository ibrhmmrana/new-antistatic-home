"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Unlock } from "lucide-react";
import ReportPaywallModal from "./ReportPaywallModal";

// Palette: #060315, #ff48aa, #5b8df9 — using darker variants for UI
const DARK = "#060315";
const DARK_PINK = "#c41a75";   // darker #ff48aa
const DARK_BLUE = "#2563eb";   // darker #5b8df9

export default function ReportAntistaticIntro() {
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
              Your customers decide in public, every day.
            </h2>
            <Link
              href="https://antistatic.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="order-1 md:order-2 flex-shrink-0 flex justify-center md:justify-end focus:outline-none focus:ring-2 focus:ring-gray-400 rounded-lg"
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
          </div>

          <p className="text-sm md:text-base text-gray-600 leading-relaxed max-w-2xl mb-5">
            Antistatic monitors your reputation 24/7, spots threats and opportunities, and tells you exactly what to do next.
          </p>

          {/* Outcome callout — blue CTA, clickable → https://antistatic.ai (new tab) */}
          <Link
            href="https://antistatic.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl py-2.5 px-4 border-l-4 cursor-pointer transition-all duration-200 ease-out bg-[rgba(37,99,235,0.1)] hover:bg-[rgba(37,99,235,0.22)] hover:shadow-md active:scale-[0.98] active:bg-[rgba(37,99,235,0.28)] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#5b8df9]"
            style={{
              borderLeftColor: DARK_BLUE,
            }}
            aria-label="Go to Antistatic homepage (opens in new tab)"
          >
            <span className="text-sm md:text-base font-medium text-gray-800">
              Turn a <span className="font-semibold" style={{ color: DARK }}>3.9-star</span> perception into a{" "}
              <span className="font-semibold" style={{ color: DARK }}>4.6-star</span> reality, fast.
            </span>
          </Link>
        </div>
      </section>

      {/* Fixed pill — logo + compact Unlock full report (link style with icon) */}
      <div
        className={`fixed top-4 right-4 md:top-6 md:right-6 z-50 flex items-center gap-3 rounded-full pl-3 pr-1 py-1 bg-white/95 backdrop-blur-sm border border-gray-200/80 shadow-lg transition-all duration-300 ease-out ${
          showPill
            ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
            : "opacity-0 translate-y-2 scale-95 pointer-events-none"
        }`}
      >
        <Link
          href="https://antistatic.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center shrink-0 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#5b8df9] rounded-lg py-1"
          aria-label="Go to Antistatic (opens in new tab)"
        >
          <Image
            src="/images/antistatic logo on white.svg"
            alt="Antistatic"
            width={90}
            height={22}
            className="h-5 w-auto object-contain"
          />
        </Link>
        <button
          type="button"
          onClick={() => setPaywallOpen(true)}
          className="flex items-center gap-1.5 shrink-0 rounded-full bg-blue-600 text-white pl-3 pr-3 py-2 text-xs font-medium hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          aria-label="Unlock full report"
        >
          <Unlock className="w-3.5 h-3.5" aria-hidden />
          <span>Unlock full report</span>
        </button>
      </div>

      <ReportPaywallModal open={paywallOpen} onOpenChange={setPaywallOpen} />
    </>
  );
}
