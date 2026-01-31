/**
 * Report Snapshot Types (v1)
 * Immutable snapshot payload for shareable reports
 * 
 * This contains EVERYTHING needed to render the report without any network requests.
 */

import type { ReportSchema } from './types';

/**
 * AI Analysis result shape (matches ReportAIAnalysis component props)
 */
export interface AIAnalysisSnapshot {
  instagram?: {
    score: number;
    summary: string;
    issues: Array<{
      severity: 'critical' | 'warning' | 'info';
      category: string;
      issue: string;
      recommendation: string;
    }>;
    highlights: string[];
  };
  facebook?: {
    score: number;
    summary: string;
    issues: Array<{
      severity: 'critical' | 'warning' | 'info';
      category: string;
      issue: string;
      recommendation: string;
    }>;
    highlights: string[];
  };
  consistency: {
    isConsistent: boolean;
    score: number;
    inconsistencies: Array<{
      field: string;
      platforms: string[];
      values: Record<string, string | null>;
      recommendation: string;
    }>;
    missingInfo: Array<{
      field: string;
      missingFrom: string[];
    }>;
  };
  reviews: {
    overallSentiment: 'positive' | 'mixed' | 'negative';
    sentimentScore: number;
    totalReviews: number;
    painPoints: Array<{
      topic: string;
      frequency: number;
      severity: 'high' | 'medium' | 'low';
      exampleReviews: string[];
      recommendation: string;
    }>;
    strengths: Array<{
      topic: string;
      frequency: number;
      exampleReviews: string[];
    }>;
    summary: string;
  };
  instagramComments?: {
    score: number;
    summary: string;
    issues: Array<{
      severity: 'critical' | 'warning' | 'info';
      category: string;
      issue: string;
      recommendation: string;
    }>;
    highlights: string[];
  };
  facebookComments?: {
    score: number;
    summary: string;
    issues: Array<{
      severity: 'critical' | 'warning' | 'info';
      category: string;
      issue: string;
      recommendation: string;
    }>;
    highlights: string[];
  };
  overallScore: number;
  topPriorities: Array<{
    priority: number;
    source: string;
    issue: string;
    recommendation: string;
  }>;
}

/**
 * Google Review shape (matches what's rendered in the report)
 */
export interface ReviewSnapshot {
  reviewId: string;
  authorName: string;
  profilePhotoUrl: string | null;
  relativeTime: string | null;
  rating: number;
  text: string;
  isLocalGuide: boolean;
}

/**
 * Place info for the snapshot (no user email or sensitive data)
 */
export interface PlaceSnapshot {
  placeId: string;
  name: string;
  addr: string;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  businessPhotoUrl: string | null;
}

/**
 * Pre-computed marker location for search visibility maps
 * This prevents the need to fetch /api/places/details for each result
 */
export interface MarkerLocation {
  placeId: string;
  lat: number;
  lng: number;
  name: string;
}

/**
 * Supporting data to prevent any component from fetching
 */
export interface SnapshotSupportingData {
  /**
   * Pre-computed marker locations for search visibility map pack results
   * Keyed by placeId for quick lookup
   */
  markerLocations: Record<string, MarkerLocation>;
}

/**
 * Version 1 of the Report Snapshot
 * Contains everything needed to render the full report without any network requests
 */
export interface ReportSnapshotV1 {
  /**
   * Schema version for future compatibility
   */
  version: 1;
  
  /**
   * When the snapshot was created (ISO timestamp)
   */
  createdAt: string;
  
  /**
   * Original scanId for traceability (not used for rendering)
   */
  scanId: string;
  
  /**
   * Place/business info (no user email)
   */
  place: PlaceSnapshot;
  
  /**
   * The assembled report (all scores, sections, search visibility, etc.)
   */
  report: ReportSchema;
  
  /**
   * AI analysis result (Top Priorities, collapsible panels)
   * Can be null if AI analysis was not available
   */
  aiAnalysis: AIAnalysisSnapshot | null;
  
  /**
   * Google Reviews list
   */
  reviews: ReviewSnapshot[];
  
  /**
   * Supporting data to prevent any component from fetching
   */
  supporting: SnapshotSupportingData;
}

/**
 * Type guard to check if a payload is a valid ReportSnapshotV1
 */
export function isReportSnapshotV1(payload: unknown): payload is ReportSnapshotV1 {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    p.version === 1 &&
    typeof p.createdAt === 'string' &&
    typeof p.scanId === 'string' &&
    p.place !== null && typeof p.place === 'object' &&
    p.report !== null && typeof p.report === 'object' &&
    Array.isArray(p.reviews) &&
    p.supporting !== null && typeof p.supporting === 'object'
  );
}
