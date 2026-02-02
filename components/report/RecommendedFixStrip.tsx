"use client";

import Image from "next/image";
import type { ModuleId } from "@/lib/report/snapshotTypes";
import type { Prescription } from "@/lib/report/snapshotTypes";
import { MODULES, getGenericPrescription } from "@/lib/diagnosis/modules";

interface RecommendedFixStripProps {
  /** One or two module ids (max two). */
  modules: [ModuleId] | [ModuleId, ModuleId];
  /** If false, use "Improve with" instead of "Fix with". */
  hasAnyFault: boolean;
  onOpenPrescription: (prescription: Prescription) => void;
}

/**
 * Renders outside section blocks (below them). Same visual style as homepage footer CTA:
 * rounded-[32px], footer bg image, overflow-hidden.
 */
export default function RecommendedFixStrip({
  modules,
  hasAnyFault,
  onOpenPrescription,
}: RecommendedFixStripProps) {
  const verb = hasAnyFault ? "Fix with Antistatic's" : "Improve with Antistatic's";

  return (
    <div className="mb-8 w-full min-w-0 relative rounded-[32px] overflow-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* Same background as homepage footer CTA */}
      <div className="absolute inset-0">
        <Image
          src="/images/footer bg.svg"
          alt=""
          fill
          className="object-cover"
          aria-hidden
        />
      </div>
      <div className="relative z-10 px-4 sm:px-6 md:px-8 lg:px-10 py-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-center gap-2 md:gap-5 md:flex-nowrap">
          <span className="text-sm md:text-lg font-medium text-white/90 shrink-0">{verb}</span>
          <div className="flex flex-wrap items-center justify-center gap-2 shrink-0 md:flex-nowrap">
            {modules.map((moduleId, i) => (
              <span key={moduleId} className="flex items-center gap-2 shrink-0">
                {i > 0 && <span className="text-white/60 font-medium shrink-0">+</span>}
                <button
                  type="button"
                  onClick={() => onOpenPrescription(getGenericPrescription(moduleId))}
                  className="relative inline-flex items-center justify-start bg-gradient-to-r from-blue-500 to-blue-600 text-white pl-4 pr-10 py-2.5 md:pl-6 md:pr-14 md:py-3 text-sm font-medium hover:from-blue-600 hover:to-blue-700 transition-all shrink-0 button-roll-text strip-cta-left"
                  style={{ borderRadius: "50px" }}
                  data-text={MODULES[moduleId].name}
                >
                  <span>{MODULES[moduleId].name}</span>
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
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
