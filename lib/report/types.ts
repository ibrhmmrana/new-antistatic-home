/**
 * Report Schema Types (v1)
 * Standardized Owner.com-style report structure
 */

export type ScoreLabel = 'Good' | 'Okay' | 'Poor';
export type CheckStatus = 'good' | 'warn' | 'bad';
export type ImpactLevel = 'high' | 'medium' | 'low';
export type SectionId = 'search-results' | 'website-experience' | 'local-listings' | 'social-presence';
export type DataFreshness = 'fresh' | 'stale' | 'missing';

export interface ReportMeta {
  businessName: string;
  categoryLabel: string;
  locationLabel: string;
  scanDate: string; // ISO timestamp
  websiteUrl: string | null;
  /** Crawled logo from website (crawl_map[0].images.logo_url or site_overview.favicon_url); persisted with report. Optional for backwards compatibility with older snapshots. */
  websiteLogoUrl?: string | null;
  googleRating: number | null;
  googleReviewCount: number | null;
  placeId: string;
}

export interface Score {
  score: number;
  maxScore: number;
  label: ScoreLabel;
}

export interface ReportScores {
  overall: Score & { label: ScoreLabel };
  searchResults: Score;
  websiteExperience: Score;
  localListings: Score;
  socialPresence: Score;
}

export interface TopProblem {
  key: string;
  label: string;
  impact: ImpactLevel;
  section: SectionId;
}

export interface ImpactCard {
  estimatedLossMonthly: number | null;
  topProblems: TopProblem[]; // Max 3
  businessAvatar: string | null;
}

export interface Competitor {
  name: string;
  rating: number | null;
  reviewCount: number | null;
  rank: number; // 1, 2, 3, 4, 5, etc.
  website: string | null;
  isTargetBusiness?: boolean; // true if this is the user's business
}

export interface CompetitorsCard {
  count: number;
  list: Competitor[]; // All competitors with user's business included
  userRank?: number; // The user's business rank
}

export interface MapPackResult {
  placeId: string | null;
  name: string;
  rating: number | null;
  reviews: number | null;
  address: string | null;
  website: string | null;
  isTargetBusiness: boolean;
}

export interface OrganicResult {
  position: number;
  title: string;
  link: string;
  displayLink: string;
  snippet: string | null;
  faviconUrl: string | null;
  domain: string;
  isTargetBusiness: boolean;
}

export interface SearchQuery {
  query: string;
  intent: 'branded' | 'non_branded';
  rationale: string;
  mapPack: {
    rank: number | null; // 1-3 if ranked, null if unranked
    results: MapPackResult[]; // Top 3
  };
  organic: {
    rank: number | null; // 1-10 if ranked, null if unranked
    results: OrganicResult[]; // Top 10
  };
  notes: string;
}

export interface SearchVisibility {
  visibilityScore: number;
  shareOfVoice: number;
  brandedVisibility: number;
  nonBrandedVisibility: number;
  queries: SearchQuery[];
}

export interface ChecklistItem {
  key: string;
  label: string;
  status: CheckStatus;
  whyItMatters: string;
  whatWeFound: string;
  whatWeWereLookingFor: string;
  howToFix: string;
  evidence?: {
    fieldPath: string;
    sampleUrl?: string;
    sampleValue?: string;
  };
}

export interface ChecklistSection {
  id: SectionId;
  title: string;
  score: number;
  maxScore: number;
  checks: ChecklistItem[];
}

export interface ReportArtifacts {
  links: {
    website: string | null;
    instagram: string | null;
    facebook: string | null;
  };
  screenshots: {
    website: string | null;
    instagram: string | null;
    facebook: string | null;
  };
  timestamps: {
    websiteCrawl: string | null;
    gbpAnalysis: string | null;
    instagramScrape: string | null;
    facebookScrape: string | null;
  };
  dataFreshness: {
    websiteCrawl: DataFreshness;
    gbpAnalysis: DataFreshness;
    instagramScrape: DataFreshness;
    facebookScrape: DataFreshness;
  };
}

/**
 * Combined sentiment breakdown (GBP reviews + Instagram comments)
 * Stored in report snapshot as sentimentAnalysis
 */
export interface SentimentAnalysis {
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  combinedSummary: string;
}

/** Per-category sentiment detail for modal */
export interface ThematicSentimentCategoryDetail {
  justification: string;
  supportingQuotes: string[];
}

/** Category-specific sentiment (0-100) for snapshot */
export interface ThematicSentiment {
  service: number;
  food: number;
  atmosphere: number;
  value: number;
  categoryDetails?: {
    service: ThematicSentimentCategoryDetail;
    food: ThematicSentimentCategoryDetail;
    atmosphere: ThematicSentimentCategoryDetail;
    value: ThematicSentimentCategoryDetail;
  };
}

/** Competitive benchmark for snapshot */
export interface CompetitiveBenchmark {
  marketLeaderAverage: {
    searchResults: number;
    websiteExperience: number;
    localListings: number;
    socialPresence: number;
  };
  competitiveAdvantage: string;
  urgentGap: string;
  potentialImpact: string;
}

export interface ReportSchema {
  meta: ReportMeta;
  scores: ReportScores;
  summaryCards: {
    impact: ImpactCard;
    competitors: CompetitorsCard;
  };
  searchVisibility: SearchVisibility;
  sections: ChecklistSection[];
  artifacts: ReportArtifacts;
}
