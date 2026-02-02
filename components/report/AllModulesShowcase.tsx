"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import type { ModuleId } from "@/lib/report/snapshotTypes";

const MODULE_ORDER: ModuleId[] = [
  "creator_hub",
  "reputation_hub",
  "social_studio",
  "competitor_radar",
];

const MODULE_IMAGE: Record<ModuleId, string> = {
  creator_hub: "/images/creator hub.svg",
  reputation_hub: "/images/reputation hub.svg",
  social_studio: "/images/social studio.svg",
  competitor_radar: "/images/competitor radar.svg",
};

/** Slight rotation per image (scatter). */
const IMAGE_ROTATION = [-4, 2, -2, 4];

/**
 * Four module images in a row; slight rotation, pop-out on hover. Click opens image in-place overlay.
 */
export default function AllModulesShowcase() {
  const [lightboxModuleId, setLightboxModuleId] = useState<ModuleId | null>(null);

  useEffect(() => {
    if (!lightboxModuleId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxModuleId(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [lightboxModuleId]);

  return (
    <section className="mb-12">
      <div className="relative rounded-[32px] overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="/images/footer bg.svg"
            alt=""
            fill
            className="object-cover"
            aria-hidden
          />
        </div>
        <div className="relative z-10 px-4 sm:px-6 md:px-8 lg:px-10 py-3 md:py-4">
          <div className="text-left pt-4 md:pt-5 mb-3">
            <h2 className="text-2xl md:text-3xl font-semibold text-white mb-2">
              How Antistatic can help
            </h2>
            <p className="text-sm md:text-base text-white/80 max-w-xl">
              Generate more reviews with local influencers in Creator Hub. Plus reviews, content, and competitive insight.
            </p>
          </div>

          {/* Four images, spread out; pop-out on hover — scaled up, almost full width on desktop */}
          <div className="px-5 sm:px-0">
            <div className="relative flex items-center justify-center min-h-[240px] sm:min-h-[300px] md:min-h-[360px] lg:min-h-[420px] py-0">
              <div className="relative w-full max-w-5xl lg:max-w-none mx-auto h-[220px] sm:h-[280px] md:h-[340px] lg:h-[400px]">
              {MODULE_ORDER.map((moduleId, index) => {
                const imgSrc = MODULE_IMAGE[moduleId];
                const rotation = IMAGE_ROTATION[index];
                const offsetX = (index - 1.5) * 52;
                return (
                  <div
                    key={moduleId}
                    className="absolute top-1/2 left-1/2 w-[180px] sm:w-[240px] md:w-[280px] lg:w-[360px] xl:w-[400px] transition-transform duration-300 ease-out cursor-pointer"
                    style={{
                      transform: `translate(-50%, -50%) translateX(${offsetX}%) rotate(${rotation}deg)`,
                      zIndex: 10 + index,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = `translate(-50%, -50%) translateX(${offsetX}%) rotate(0deg) scale(1.12) translateY(-12px)`;
                      e.currentTarget.style.zIndex = "30";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = `translate(-50%, -50%) translateX(${offsetX}%) rotate(${rotation}deg)`;
                      e.currentTarget.style.zIndex = String(10 + index);
                    }}
                    onClick={() => setLightboxModuleId(moduleId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setLightboxModuleId(moduleId);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`View ${moduleId.replace(/_/g, " ")} image`}
                  >
                    <div className="relative w-full aspect-[4/3]">
                      <Image
                        src={imgSrc}
                        alt=""
                        fill
                        className="object-contain object-center"
                        sizes="(min-width: 1280px) 400px, (min-width: 1024px) 360px, (min-width: 768px) 280px, 240px"
                      />
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </div>

          {/* Lightbox: image opens in-place overlay */}
          {lightboxModuleId && (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-sm bg-white/5 p-4"
              onClick={() => setLightboxModuleId(null)}
              onKeyDown={(e) => e.key === "Escape" && setLightboxModuleId(null)}
              role="dialog"
              aria-modal="true"
              aria-label="View image"
              tabIndex={-1}
            >
              <button
                type="button"
                className="absolute top-4 right-4 z-10 rounded-full bg-white/90 p-2 text-gray-800 hover:bg-white focus:outline-none focus:ring-2 focus:ring-white"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxModuleId(null);
                }}
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div
                className="relative max-h-[85vh] max-w-[90vw] w-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <Image
                  src={MODULE_IMAGE[lightboxModuleId]}
                  alt=""
                  width={800}
                  height={600}
                  className="max-h-[85vh] w-auto object-contain"
                />
              </div>
            </div>
          )}

          <div className="mt-2 pb-4 md:pb-5 text-center">
            <Link
              href="https://antistatic.ai/#product"
              target="_blank"
              rel="noopener noreferrer"
              className="relative inline-flex items-center justify-start bg-gradient-to-r from-blue-500 to-blue-600 text-white pl-8 pr-16 py-3.5 md:pl-10 md:pr-20 md:py-4 font-medium hover:from-blue-600 hover:to-blue-700 transition-all button-roll-text footer-cta-left"
              style={{ borderRadius: "50px" }}
              data-text="Explore all modules"
            >
              <span>Explore all modules</span>
              <div
                className="absolute right-[1px] top-[1px] bottom-[1px] aspect-square flex items-center justify-center button-icon-rotate"
                style={{ borderRadius: "9999px" }}
              >
                <Image
                  src="/images/arrow icon.svg"
                  alt=""
                  width={32}
                  height={32}
                  className="flex-shrink-0"
                  aria-hidden
                />
              </div>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
