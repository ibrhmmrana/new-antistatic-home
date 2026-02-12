"use client";

import { useRef, useEffect, useState } from "react";
import Image from "next/image";
import BusinessSearch from "./BusinessSearch";

const HERO_SEARCH_ID = "hero-search";
const TOOLTIP_DURATION_MS = 6000;

function scrollToHeroSearch() {
  const el = document.getElementById(HERO_SEARCH_ID);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

export function scrollToHeroInputAndShowTooltip() {
  scrollToHeroSearch();
  window.dispatchEvent(new CustomEvent("hero-search-cta-click"));
}

// At this hero image width (px), content scale = 1. Higher = smaller left content vs image.
const REF_IMAGE_WIDTH = 620;
const SCALE_MIN = 0.78;
const SCALE_MAX = 1.12;
const DESKTOP_BREAKPOINT_PX = 1024;

export default function Hero() {
  const imageColumnRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [isDesktop, setIsDesktop] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Desktop-only: detect viewport >= lg
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT_PX}px)`);
    const handler = () => setIsDesktop(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Desktop-only: observe hero image column width and derive scale from ratio
  useEffect(() => {
    if (!isDesktop || !imageColumnRef.current) return;
    const el = imageColumnRef.current;
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0]?.contentRect ?? { width: 0 };
      if (width <= 0) return;
      const raw = width / REF_IMAGE_WIDTH;
      const s = Math.min(SCALE_MAX, Math.max(SCALE_MIN, raw));
      setScale(s);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isDesktop]);

  const applyScale = isDesktop && scale !== 1;

  // When a CTA leads to the hero search, show tooltip
  useEffect(() => {
    const handleCtaClick = () => {
      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
      setShowTooltip(true);
      tooltipTimeoutRef.current = setTimeout(() => {
        setShowTooltip(false);
        tooltipTimeoutRef.current = null;
      }, TOOLTIP_DURATION_MS);
    };

    const handleHashChange = () => {
      if (typeof window !== "undefined" && window.location.hash === `#${HERO_SEARCH_ID}`) {
        scrollToHeroSearch();
        handleCtaClick();
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    };

    window.addEventListener("hero-search-cta-click", handleCtaClick);
    window.addEventListener("hashchange", handleHashChange);
    if (window.location.hash === `#${HERO_SEARCH_ID}`) handleHashChange();

    return () => {
      window.removeEventListener("hero-search-cta-click", handleCtaClick);
      window.removeEventListener("hashchange", handleHashChange);
      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    };
  }, []);

  return (
    <div className="relative min-h-[calc(100vh-80px)] flex items-center">
      <div
        className="w-full px-6 md:px-8 lg:px-12 animate-hero-content-in opacity-0"
        style={{ animationFillMode: "forwards" }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          {/* Left Section — top aligned with hero image; same top padding as image column */}
          <div className="flex flex-col items-start pt-4 md:pt-6 lg:pt-6">
            <div
              className="flex flex-col space-y-6 origin-top-left"
              style={
                applyScale
                  ? {
                      width: `${100 / scale}%`,
                      transform: `scale(${scale})`,
                    }
                  : undefined
              }
            >
              {/* Tagline Pill */}
              <div
                className="inline-flex items-center justify-center w-fit px-5 py-2.5 rounded-full mt-5"
                style={{
                  backgroundColor: "#F2F5FF",
                  border: "1px solid #D5E2FF",
                  boxShadow: "inset 0 -2px 4px rgba(213, 226, 255, 1)",
                }}
              >
                <span className="text-sm text-gray-600 font-medium">
                  Put a finger on the pulse of your digital reputation.
                </span>
              </div>

              {/* Main Headline */}
              <h1
                className="text-4xl md:text-5xl lg:text-6xl font-bold"
                style={{
                  fontWeight: 700,
                  color: "#666b82",
                  lineHeight: "1.2",
                }}
              >
                Your competitor down the road is{" "}
                <span style={{ color: "#666b82" }}>4.6 stars</span>. You're{" "}
                <span style={{ color: "#666b82" }}>3.9</span>.{" "}
                <span className="font-bold" style={{ color: "#000000" }}>
                  We fix that.
                </span>
              </h1>

              {/* Supporting Text */}
              <p className="text-lg md:text-xl text-gray-600 max-w-xl">
                Antistatic is active reputational intelligence with rapid
                response.
              </p>

              {/* Business Search — scroll target for CTAs */}
              <div
                id={HERO_SEARCH_ID}
                className="pt-4 w-full scroll-mt-24 md:scroll-mt-28"
              >
                <BusinessSearch />
                {showTooltip && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="mt-3 px-4 py-3 rounded-xl bg-gray-100 border border-gray-200 text-sm text-gray-700 shadow-sm"
                  >
                    We need to analyse your business first. Search for your business above to get started.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Section - Hero Image + overlays (measured for ratio, desktop only) */}
          <div
            ref={imageColumnRef}
            className="relative w-full flex items-center justify-center pt-4 md:pt-6 pb-16 md:pb-24 lg:pb-32 pl-6 md:pl-8 lg:pl-10"
          >
            <div className="relative w-full max-w-full mx-auto md:w-[80%]">
              <Image
                src="/images/hero img.svg"
                alt="Hero"
                width={800}
                height={600}
                className="w-full h-auto object-contain"
                priority
              />
              {/* Upper left: opportunity detected — lower and left so it overlaps and flows out */}
              <div
                className="absolute -left-[6%] top-[12%] z-10 w-[45%] max-w-[280px] animate-hero-overlay-float-up rounded-[20px] overflow-hidden"
                style={{ boxShadow: "0 6px 16px 12px rgba(0, 0, 0, 0.02)" }}
              >
                <Image
                  src="/images/opportunity detected.svg"
                  alt="Opportunity detected"
                  width={280}
                  height={120}
                  className="w-full h-auto"
                />
              </div>
              {/* Just below opportunity: review sticker — less gap above, bigger */}
              <div
                className="absolute -left-[6%] top-[24%] z-10 w-[64%] max-w-[470px] animate-hero-overlay-float-up rounded-[20px] overflow-hidden"
                style={{ boxShadow: "0 6px 16px 12px rgba(0, 0, 0, 0.02)" }}
              >
                <Image
                  src="/images/review sticker.svg"
                  alt="Review"
                  width={470}
                  height={198}
                  className="w-full h-auto object-contain"
                />
              </div>
              {/* Bottom right: sentiment graph — opposite hover direction */}
              <div
                className="absolute -right-[4%] bottom-[12%] z-10 w-[42%] max-w-[260px] animate-hero-overlay-float-down rounded-[20px] overflow-hidden"
                style={{ boxShadow: "0 6px 16px 12px rgba(0, 0, 0, 0.02)" }}
              >
                <Image
                  src="/images/sentiment graph.svg"
                  alt="Sentiment"
                  width={260}
                  height={150}
                  className="w-full h-auto ml-auto"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
