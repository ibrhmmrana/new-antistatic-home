"use client";

import type { ModuleId } from "@/lib/report/snapshotTypes";
import { MODULES, MODULE_DESCRIPTIONS } from "@/lib/diagnosis/modules";

/** Creator Hub first to push "generate more reviews with local influencers". */
const MODULE_ORDER: ModuleId[] = [
  "creator_hub",
  "reputation_hub",
  "social_studio",
  "competitor_radar",
];

/**
 * Showcase all four modules with full copy. Renders outside report blocks.
 * Creator Hub is first to emphasize review growth via local influencers.
 */
export default function AllModulesShowcase() {
  return (
    <section className="mb-12">
      <h2 className="text-2xl font-semibold text-gray-900 mb-2">
        How Antistatic can help
      </h2>
      <p className="text-sm text-gray-600 mb-6 max-w-2xl">
        Generate more reviews with local influencers in Creator Hub. Plus reviews, content, and competitive insight.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {MODULE_ORDER.map((moduleId) => {
          const def = MODULES[moduleId];
          const desc = MODULE_DESCRIPTIONS[moduleId];
          const isCreatorHub = moduleId === "creator_hub";
          return (
            <div
              key={moduleId}
              className={`rounded-xl border bg-white p-5 shadow-sm ${isCreatorHub ? "border-blue-200 ring-1 ring-blue-100" : "border-gray-200"}`}
            >
              <div className="mb-3">
                <h3 className="text-lg font-semibold text-gray-900">{def.name}</h3>
                <p className="text-sm text-gray-500">{desc?.tagline ?? def.tagline}</p>
              </div>
              {desc?.bullets && desc.bullets.length > 0 && (
                <ul className="space-y-1.5 text-sm text-gray-600 list-disc list-inside">
                  {desc.bullets.map((bullet, i) => (
                    <li key={i}>{bullet}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
