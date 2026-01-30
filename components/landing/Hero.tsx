"use client";

import { useRef, useEffect, useState } from "react";
import Image from "next/image";
import BusinessSearch from "./BusinessSearch";

// At this hero image width (px), content scale = 1. Higher = smaller left content vs image.
const REF_IMAGE_WIDTH = 620;
const SCALE_MIN = 0.78;
const SCALE_MAX = 1.12;
const DESKTOP_BREAKPOINT_PX = 1024;

export default function Hero() {
  const imageColumnRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [isDesktop, setIsDesktop] = useState(false);

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

              {/* Business Search */}
              <div className="pt-4 w-full">
                <BusinessSearch />
              </div>
            </div>
          </div>

          {/* Right Section - Hero Image + overlays (measured for ratio, desktop only) */}
          <div
            ref={imageColumnRef}
            className="relative w-full flex items-center justify-center pt-4 md:pt-6 pb-16 md:pb-24 lg:pb-32 pl-6 md:pl-8 lg:pl-10"
          >
            <div className="relative w-full max-w-full">
              <Image
                src="/images/hero img.svg"
                alt="Hero"
                width={800}
                height={600}
                className="w-full h-auto object-contain"
                priority
              />
              {/* Upper left: opportunity detected — lower and left so it overlaps and flows out */}
              <div className="absolute -left-[6%] top-[12%] z-10 w-[45%] max-w-[280px] animate-hero-overlay-float-up">
                <Image
                  src="/images/opportunity detected.svg"
                  alt="Opportunity detected"
                  width={280}
                  height={120}
                  className="w-full h-auto"
                />
              </div>
              {/* Just below opportunity: review sticker — less gap above, bigger */}
              <div className="absolute -left-[6%] top-[24%] z-10 w-[64%] max-w-[470px] animate-hero-overlay-float-up">
                <Image
                  src="/images/review sticker.svg"
                  alt="Review"
                  width={470}
                  height={198}
                  className="w-full h-auto object-contain"
                />
              </div>
              {/* Bottom right: sentiment graph — opposite hover direction */}
              <div className="absolute -right-[4%] bottom-[12%] z-10 w-[42%] max-w-[260px] animate-hero-overlay-float-down">
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
