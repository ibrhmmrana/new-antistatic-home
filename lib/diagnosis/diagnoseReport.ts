/**
 * Smart Diagnosis: rule-based mapping from faults to prescriptions.
 * Generates prescriptions for checklist items, top issues, AI priorities, AI panel issues, and competitive blocks.
 */

import type { ReportSchema } from '@/lib/report/types';
import type { SectionId } from '@/lib/report/types';
import type {
  AIAnalysisSnapshot,
  CompetitiveBenchmarkSnapshot,
  DiagnosisSnapshot,
  Prescription,
  ModuleId,
} from '@/lib/report/snapshotTypes';
import {
  MODULES,
  REPUTATION_HUB_ADDONS,
  SOCIAL_STUDIO_ADDONS,
  COMPETITOR_RADAR_ADDONS,
  CREATOR_HUB_ADDONS,
} from './modules';

const SEARCH_KEYWORDS = ['keyword', 'keywords', 'ranking', 'search', 'visibility', 'title_', 'meta_desc', 'h1_', 'domain', 'indexability', 'structured_data'];
const TRUST_KEYS = ['trust_testimonials', 'trust_reviews'];
const CREATOR_TOPIC_WORDS = ['trust', 'testimonial', 'testimonials', 'word of mouth', 'ugc', 'influencer', 'influencers', 'community'];

function getModuleForCheck(sectionId: SectionId, checkKey: string): ModuleId {
  if (sectionId === 'local-listings' || checkKey.startsWith('gbp_')) return 'reputation_hub';
  if (sectionId === 'social-presence') return 'social_studio';
  if (TRUST_KEYS.includes(checkKey)) return 'creator_hub';
  if (sectionId === 'search-results') return 'competitor_radar';
  if (sectionId === 'website-experience') return 'social_studio';
  return 'social_studio';
}

function getModuleForTopPriority(source: string): ModuleId {
  const s = (source || '').toLowerCase();
  if (s.includes('google') || s.includes('review')) return 'reputation_hub';
  if (s.includes('instagram') || s.includes('facebook')) return 'social_studio';
  if (s.includes('cross') || s.includes('platform') || s.includes('consistency')) return 'reputation_hub';
  return 'social_studio';
}

function getModuleForAIIssue(type: 'instagram' | 'facebook' | 'reviews' | 'consistency' | 'comments', topic?: string): ModuleId {
  if (type === 'reviews') {
    const t = (topic || '').toLowerCase();
    if (CREATOR_TOPIC_WORDS.some((w) => t.includes(w))) return 'creator_hub';
    return 'reputation_hub';
  }
  if (type === 'consistency') return 'reputation_hub';
  return 'social_studio';
}

function getAddons(moduleId: ModuleId): string[] {
  switch (moduleId) {
    case 'reputation_hub': return REPUTATION_HUB_ADDONS;
    case 'social_studio': return SOCIAL_STUDIO_ADDONS;
    case 'competitor_radar': return COMPETITOR_RADAR_ADDONS;
    case 'creator_hub': return CREATOR_HUB_ADDONS;
    default: return [];
  }
}

function buildSteps(baseSteps: string[], moduleId: ModuleId): string[] {
  const addons = getAddons(moduleId);
  const combined = [...baseSteps];
  for (const a of addons) {
    if (combined.length >= 7) break;
    combined.push(a);
  }
  return combined.slice(0, 7);
}

function createPrescription(
  faultId: string,
  moduleId: ModuleId,
  title: string,
  whyThisMatters: string,
  baseSteps: string[]
): Prescription {
  const mod = MODULES[moduleId];
  const howToFix = buildSteps(baseSteps, moduleId);
  return {
    id: faultId,
    moduleId,
    moduleName: mod.name,
    moduleTagline: mod.tagline,
    title,
    whyThisMatters,
    howToFix,
    ctaLabel: mod.ctaLabel,
    ctaHref: mod.ctaHref,
  };
}

export interface DiagnoseInput {
  report: ReportSchema;
  aiAnalysis: AIAnalysisSnapshot | null;
  competitiveBenchmark?: CompetitiveBenchmarkSnapshot | null;
}

export function diagnoseSnapshot(input: DiagnoseInput): DiagnosisSnapshot {
  const { report, aiAnalysis, competitiveBenchmark } = input;
  const prescriptions: Record<string, Prescription> = {};
  const now = new Date().toISOString();

  // (1) Checklist: every check with status !== "good"
  for (const section of report.sections) {
    for (const check of section.checks) {
      if (check.status === 'good') continue;
      const faultId = `check:${section.id}:${check.key}`;
      const moduleId = getModuleForCheck(section.id as SectionId, check.key);
      const baseSteps: string[] = [];
      if (check.howToFix && check.howToFix.trim()) baseSteps.push(check.howToFix.trim());
      if (check.whatWeFound && check.whatWeWereLookingFor)
        baseSteps.push(`Current: ${check.whatWeFound}. Goal: ${check.whatWeWereLookingFor}`);
      if (baseSteps.length === 0) baseSteps.push(`Address: ${check.label}`);
      prescriptions[faultId] = createPrescription(
        faultId,
        moduleId,
        check.label,
        check.whyItMatters || `Fixing this improves your report score and visibility.`,
        baseSteps
      );
    }
  }

  // (2) Top problems (impact.topProblems)
  for (const tp of report.summaryCards.impact.topProblems || []) {
    const faultId = `top_problem:${tp.section}:${tp.key}`;
    if (prescriptions[faultId]) continue;
    const moduleId = getModuleForCheck(tp.section as SectionId, tp.key);
    prescriptions[faultId] = createPrescription(
      faultId,
      moduleId,
      tp.label,
      `This issue is affecting your visibility and score.`,
      [tp.label, `Focus on the "${tp.label}" area in your report.`]
    );
  }

  // (3) Section low (one per section for "Improve: X" top issue)
  for (const section of report.sections) {
    const faultId = `section_low:${section.id}`;
    if (prescriptions[faultId]) continue;
    const needWork = section.checks.filter((c) => c.status !== 'good').length;
    if (needWork === 0) continue;
    const moduleId = getModuleForCheck(section.id as SectionId, '');
    prescriptions[faultId] = createPrescription(
      faultId,
      moduleId,
      `Improve: ${section.title}`,
      `This section has ${needWork} item(s) that need attention. Addressing them will improve your score.`,
      [`Review each item in "${section.title}" and apply the suggested fixes.`]
    );
  }

  // (4) AI Top Priorities
  if (aiAnalysis?.topPriorities?.length) {
    aiAnalysis.topPriorities.forEach((p, index) => {
      const faultId = `ai_top_priority:${index}`;
      const moduleId = getModuleForTopPriority(p.source);
      const baseSteps = [p.recommendation].filter(Boolean);
      prescriptions[faultId] = createPrescription(
        faultId,
        moduleId,
        p.issue,
        `From ${p.source}: addressing this will improve your presence.`,
        baseSteps
      );
    });
  }

  // (5) AI panel issues
  if (aiAnalysis?.instagram?.issues?.length) {
    aiAnalysis.instagram.issues.forEach((issue, index) => {
      const faultId = `ai_instagram_issue:${index}`;
      prescriptions[faultId] = createPrescription(
        faultId,
        'social_studio',
        issue.issue,
        `${issue.category}: ${issue.issue}`,
        [issue.recommendation]
      );
    });
  }
  if (aiAnalysis?.facebook?.issues?.length) {
    aiAnalysis.facebook.issues.forEach((issue, index) => {
      const faultId = `ai_facebook_issue:${index}`;
      prescriptions[faultId] = createPrescription(
        faultId,
        'social_studio',
        issue.issue,
        `${issue.category}: ${issue.issue}`,
        [issue.recommendation]
      );
    });
  }
  if (aiAnalysis?.reviews?.painPoints?.length) {
    aiAnalysis.reviews.painPoints.forEach((p, index) => {
      const faultId = `ai_reviews_pain:${index}`;
      const moduleId = getModuleForAIIssue('reviews', p.topic);
      prescriptions[faultId] = createPrescription(
        faultId,
        moduleId,
        p.topic,
        `Reviewers frequently mention this. Severity: ${p.severity}.`,
        [p.recommendation]
      );
    });
  }
  if (aiAnalysis?.consistency?.inconsistencies?.length) {
    aiAnalysis.consistency.inconsistencies.forEach((inc, index) => {
      const faultId = `ai_consistency:${index}`;
      prescriptions[faultId] = createPrescription(
        faultId,
        'reputation_hub',
        `Inconsistent ${inc.field} across ${inc.platforms.join(', ')}`,
        `Keeping information consistent builds trust.`,
        [inc.recommendation]
      );
    });
  }
  if (aiAnalysis?.instagramComments?.issues?.length) {
    aiAnalysis.instagramComments.issues.forEach((issue, index) => {
      const faultId = `ai_instagram_comments:${index}`;
      prescriptions[faultId] = createPrescription(
        faultId,
        'social_studio',
        issue.issue,
        `${issue.category}: ${issue.issue}`,
        [issue.recommendation]
      );
    });
  }
  if (aiAnalysis?.facebookComments?.issues?.length) {
    aiAnalysis.facebookComments.issues.forEach((issue, index) => {
      const faultId = `ai_facebook_comments:${index}`;
      prescriptions[faultId] = createPrescription(
        faultId,
        'social_studio',
        issue.issue,
        `${issue.category}: ${issue.issue}`,
        [issue.recommendation]
      );
    });
  }

  // (6) Competitive blocks
  const competitiveFaults: Array<{ faultId: string; title: string; why: string; steps: string[] }> = [
    {
      faultId: 'competitive:ranking_below_competitors',
      title: 'You\'re ranking below competitors',
      why: 'Improving your visibility and engagement relative to competitors can win more customers.',
      steps: ['See how you rank vs nearby businesses.', 'Identify what top-ranked businesses do well.'],
    },
    {
      faultId: 'competitive:urgent_gap',
      title: 'Close the urgent gap vs competitors',
      why: 'Closing this gap can improve your visibility and revenue opportunity.',
      steps: ['Focus on the area where you\'re furthest behind.', 'Set a monthly target to close the gap.'],
    },
    {
      faultId: 'competitive:performance_gap',
      title: 'Close the performance gap vs competitors',
      why: 'Your scores vs market leader show where to improve visibility and trust.',
      steps: ['Benchmark your four scores against the top 3 competitors.', 'Prioritize the lowest-scoring area.'],
    },
    {
      faultId: 'competitive:revenue_opportunity',
      title: 'Capture your revenue opportunity',
      why: 'Addressing visibility and reputation gaps can unlock revenue.',
      steps: ['Use the Revenue Opportunity narrative above.', 'Track progress monthly.'],
    },
  ];
  for (const { faultId, title, why, steps } of competitiveFaults) {
    prescriptions[faultId] = createPrescription(
      faultId,
      'competitor_radar',
      title,
      why,
      steps
    );
  }

  return {
    version: 1,
    generatedAt: now,
    prescriptions,
  };
}
