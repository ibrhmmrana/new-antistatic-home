/**
 * Section → recommended modules (1 or 2). Used to render fix strips outside blocks.
 * Creator Hub is pushed in relevant sections (reviews, social, content).
 */

import type { ModuleId } from "@/lib/report/snapshotTypes";

export type SectionModuleMapping = [ModuleId] | [ModuleId, ModuleId] | null;

/** Checklist section id → modules. website-experience has no strip. */
export const CHECKLIST_SECTION_MODULES: Record<string, SectionModuleMapping> = {
  "local-listings": ["reputation_hub", "creator_hub"],
  "social-presence": ["social_studio", "creator_hub"],
  "search-results": ["competitor_radar"],
  "website-experience": null,
};

/** Top Cards (impact + competitors): Reputation Hub + Creator Hub (push review growth via influencers). */
export const TOP_CARDS_MODULES: [ModuleId, ModuleId] = ["reputation_hub", "creator_hub"];

/** Competitive Edge section: Competitor Radar. */
export const VISUAL_INSIGHTS_MODULES: [ModuleId] = ["competitor_radar"];

/** AI Analysis section: Reputation Hub + Creator Hub (reviews + more reviews via influencers). */
export const AI_ANALYSIS_MODULES: [ModuleId, ModuleId] = ["reputation_hub", "creator_hub"];
