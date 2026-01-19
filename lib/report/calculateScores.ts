/**
 * Scoring Functions for Report
 * Calculates scores for all 4 sections based on checklist items and data
 */

import type { Score, ScoreLabel, CheckStatus } from './types';

/**
 * Calculate score label from score and maxScore
 */
export function calculateScoreLabel(score: number, maxScore: number): ScoreLabel {
  const percentage = (score / maxScore) * 100;
  if (percentage >= 80) return 'Good';
  if (percentage >= 50) return 'Okay';
  return 'Poor';
}

/**
 * Calculate Search Results score (0-40)
 */
export function calculateSearchResultsScore(
  visibilityScore: number | undefined,
  checks: Array<{ status: CheckStatus; weight?: number }>
): Score {
  const maxScore = 40;
  
  // Base score from search visibility (0-40 points)
  const baseScore = visibilityScore ? (visibilityScore / 100) * 40 : 0;
  
  // Bonus points from on-page SEO checks (max 10)
  let onPageBonus = 0;
  const highValueChecks = [
    'h1_service_area',
    'h1_keywords',
    'meta_desc_service_area',
    'meta_desc_keywords',
    'structured_data',
  ];
  
  checks.forEach(check => {
    if (check.status === 'good' && check.key && highValueChecks.includes(check.key)) {
      onPageBonus += 2;
    }
  });
  
  const score = Math.min(maxScore, baseScore + onPageBonus);
  
  return {
    score: Math.round(score),
    maxScore,
    label: calculateScoreLabel(score, maxScore),
  };
}

/**
 * Calculate Website Experience score (0-40)
 */
export function calculateWebsiteExperienceScore(
  checks: Array<{ status: CheckStatus; key: string }>
): Score {
  const maxScore = 40;
  let score = 0;
  
  // Conversion elements (max 20)
  const conversionChecks = {
    primary_cta: 5,
    contact_phone: 5,
    contact_email: 5,
    contact_forms: 2,
  };
  
  // Trust signals (max 18)
  const trustChecks = {
    trust_testimonials: 5,
    trust_reviews: 5,
    trust_about: 3,
    trust_faq: 3,
    trust_awards: 2,
  };
  
  // UX elements (max 10)
  const uxChecks = {
    mobile_friendly: 5,
    lazy_loading: 3,
    performance_optimized: 2,
  };
  
  checks.forEach(check => {
    if (check.status === 'good') {
      if (check.key in conversionChecks) {
        score += conversionChecks[check.key as keyof typeof conversionChecks];
      } else if (check.key in trustChecks) {
        score += trustChecks[check.key as keyof typeof trustChecks];
      } else if (check.key in uxChecks) {
        score += uxChecks[check.key as keyof typeof uxChecks];
      }
    }
  });
  
  return {
    score: Math.min(maxScore, Math.round(score)),
    maxScore,
    label: calculateScoreLabel(score, maxScore),
  };
}

/**
 * Calculate Local Listings score (0-20)
 */
export function calculateLocalListingsScore(
  gbpChecklist: Array<{ key: string; status: CheckStatus }>,
  socialLinksFound: boolean
): Score {
  const maxScore = 20;
  let score = 0;
  
  const weights: Record<string, number> = {
    website: 3,
    description: 3,
    hours: 3,
    phone: 2,
    price_range: 2,
    desc_keywords: 2,
    categories_keywords: 3,
  };
  
  gbpChecklist.forEach(item => {
    if (item.status === 'good' && item.key in weights) {
      score += weights[item.key];
    }
  });
  
  // Social links bonus (2 points)
  if (socialLinksFound) {
    score += 2;
  }
  
  return {
    score: Math.min(maxScore, Math.round(score)),
    maxScore,
    label: calculateScoreLabel(score, maxScore),
  };
}

/**
 * Calculate Social Presence score (0-20)
 */
export function calculateSocialPresenceScore(
  hasInstagram: boolean,
  hasFacebook: boolean,
  hasWebsiteScreenshot: boolean,
  instagramChecks: Array<{ status: CheckStatus; key: string }>,
  facebookChecks: Array<{ status: CheckStatus; key: string }>
): Score {
  const maxScore = 20;
  let score = 0;
  
  // Discovery score (max 12)
  if (hasInstagram) score += 5;
  if (hasFacebook) score += 5;
  if (hasWebsiteScreenshot) score += 2;
  
  // Instagram score (max 8, capped)
  let instagramScore = 0;
  const igWeights: Record<string, number> = {
    ig_profile_complete: 7,
    ig_posting_consistency: 2,
    ig_engagement_rate: 1,
  };
  
  instagramChecks.forEach(check => {
    if (check.status === 'good' && check.key in igWeights) {
      instagramScore += igWeights[check.key];
    }
  });
  
  score += Math.min(8, instagramScore);
  
  // Facebook score (max 8, capped)
  let facebookScore = 0;
  const fbWeights: Record<string, number> = {
    fb_page_complete: 10,
    fb_posting_consistency: 2,
  };
  
  facebookChecks.forEach(check => {
    if (check.status === 'good' && check.key in fbWeights) {
      facebookScore += fbWeights[check.key];
    }
  });
  
  score += Math.min(8, facebookScore);
  
  return {
    score: Math.min(maxScore, Math.round(score)),
    maxScore,
    label: calculateScoreLabel(score, maxScore),
  };
}

/**
 * Calculate overall score (0-100)
 */
export function calculateOverallScore(
  searchResults: number,
  websiteExperience: number,
  localListings: number,
  socialPresence: number
): Score {
  const maxScore = 100;
  const score = searchResults + websiteExperience + localListings + socialPresence;
  
  return {
    score: Math.round(score),
    maxScore,
    label: calculateScoreLabel(score, maxScore),
  };
}
