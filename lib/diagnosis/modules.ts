/**
 * Canonical modules for Smart Diagnosis prescriptions.
 * CTA hrefs point to homepage anchors.
 */

import type { ModuleId, Prescription } from '@/lib/report/snapshotTypes';

export interface ModuleDef {
  id: ModuleId;
  name: string;
  tagline: string;
  ctaLabel: string;
  ctaHref: string;
}

export const MODULES: Record<ModuleId, ModuleDef> = {
  reputation_hub: {
    id: 'reputation_hub',
    name: 'Reputation Hub',
    tagline: 'Reviews & messaging',
    ctaLabel: 'Open Reputation Hub',
    ctaHref: '/#reputation-hub',
  },
  social_studio: {
    id: 'social_studio',
    name: 'Social Studio',
    tagline: 'Content & insights',
    ctaLabel: 'Open Social Studio',
    ctaHref: '/#social-studio',
  },
  competitor_radar: {
    id: 'competitor_radar',
    name: 'Competitor Radar',
    tagline: 'Watchlist & alerts',
    ctaLabel: 'Open Competitor Radar',
    ctaHref: '/#competitor-radar',
  },
  creator_hub: {
    id: 'creator_hub',
    name: 'Creator Hub',
    tagline: 'Creator partnerships',
    ctaLabel: 'Open Creator Hub',
    ctaHref: '/#creator-hub',
  },
};

/** Full display copy for each module (tagline + bullets for showcase). */
export const MODULE_DESCRIPTIONS: Record<ModuleId, { tagline: string; bullets: string[] }> = {
  reputation_hub: {
    tagline: 'Reviews & messaging',
    bullets: [
      'Monitor Google reviews and messages in one inbox',
      "Get AI-suggested replies in your brand's tone",
      'Request new reviews via SMS, WhatsApp, or email',
    ],
  },
  social_studio: {
    tagline: 'Content & scheduling',
    bullets: [
      'Turn ideas or links into ready-to-post content with AI',
      'Generate content for Instagram, Facebook, etc.',
    ],
  },
  competitor_radar: {
    tagline: 'Watchlist & alerts',
    bullets: [
      'Add competitors to a simple watchlist',
      'Get alerts when they spike in reviews or post high-performing content',
      'Compare ratings and review volume at a glance',
    ],
  },
  creator_hub: {
    tagline: 'Generate more reviews with local influencers',
    bullets: [
      'Generate more reviews using local influencers and creators who vouch for your business',
      'Run UGC, testimonial, and review-boost campaigns in one place',
      'Track which creators drive engagement and review lift',
    ],
  },
};

export const REPUTATION_HUB_ADDONS = [
  'Centralize reviews & messages so nothing gets missed.',
  'Generate on-brand replies and respond quickly.',
  'Launch a review request campaign (SMS/WhatsApp/email) to increase volume.',
];

export const SOCIAL_STUDIO_ADDONS = [
  'Generate high-performing content ideas, captions, hooks, and creatives with AI',
  'Monitor social stats and engagement across platforms',
  'Replicate competitor posts that are performing well with your own offer, tone, and branding',
];

export const COMPETITOR_RADAR_ADDONS = [
  'Add top competitors to the watchlist.',
  'Set alerts for review spikes and viral content.',
  'Compare rating + review volume monthly and react with specific actions.',
];

export const CREATOR_HUB_ADDONS = [
  'Generate more reviews using local influencers who vouch for your business.',
  'Run UGC, testimonial, and review-boost campaigns in one place.',
  'Track which creators drive engagement and review lift.',
];

const ADDONS_BY_MODULE: Record<ModuleId, string[]> = {
  reputation_hub: REPUTATION_HUB_ADDONS,
  social_studio: SOCIAL_STUDIO_ADDONS,
  competitor_radar: COMPETITOR_RADAR_ADDONS,
  creator_hub: CREATOR_HUB_ADDONS,
};

/** Build a generic prescription for a module (drawer content). */
export function getGenericPrescription(moduleId: ModuleId): Prescription {
  const def = MODULES[moduleId];
  const desc = MODULE_DESCRIPTIONS[moduleId];
  const steps = desc?.bullets ?? ADDONS_BY_MODULE[moduleId] ?? [];
  return {
    id: `module:${moduleId}`,
    moduleId,
    moduleName: def.name,
    moduleTagline: def.tagline,
    title: `Explore ${def.name}`,
    whyThisMatters: `${def.tagline}. ${def.name} helps you strengthen this area.`,
    howToFix: steps.slice(0, 7),
    ctaLabel: def.ctaLabel,
    ctaHref: def.ctaHref,
  };
}
