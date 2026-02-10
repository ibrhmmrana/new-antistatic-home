/**
 * AI Analysis API Endpoint
 * Analyzes social media presence, reviews, and cross-platform consistency
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  analyzeFullPresence,
  analyzeSocialProfile,
  analyzeConsistency,
  analyzeReviews,
  analyzeComments,
  FullPresenceAnalysis,
} from '@/lib/ai/analyzePresence';

import type { WebsiteSummary, GbpSummary } from '@/lib/report/aiDataSummaries';

interface AnalyzeRequest {
  type: 'full' | 'instagram' | 'facebook' | 'consistency' | 'reviews' | 'comments';
  businessName: string;
  businessCategory: string;
  data: {
    instagram?: {
      biography?: string | null;
      website?: string | null;
      category?: string | null;
      phone?: string | null;
      address?: string | null;
      followerCount?: number | null;
      postCount?: number | null;
      fullName?: string | null;
      isVerified?: boolean | null;
      isBusinessAccount?: boolean | null;
    };
    facebook?: {
      description?: string | null;
      website?: string | null;
      phone?: string | null;
      address?: string | null;
      hours?: string | null;
    };
    website?: {
      description?: string | null;
      phone?: string | null;
      address?: string | null;
      hours?: string | null;
    };
    reviews?: Array<{
      text: string;
      rating: number;
      authorName?: string;
      relativeTime?: string;
    }>;
    instagramComments?: Array<{ text: string; postContext?: string }>;
    facebookComments?: Array<{ text: string; postContext?: string }>;
    /** Recent post captions for richer Instagram analysis */
    instagramRecentCaptions?: Array<{ caption: string; date?: string }>;
    /** Curated website crawl summary (not full crawl) */
    websiteSummary?: WebsiteSummary | null;
    /** Curated GBP summary for reviews context */
    gbpSummary?: GbpSummary | null;
    /** For competitive benchmark */
    competitors?: Array<{ name: string; rating: number | null; reviewCount: number | null; rank: number; isTargetBusiness?: boolean }>;
    userRank?: number | null;
    userScores?: { searchResults: number; websiteExperience: number; localListings: number; socialPresence: number };
    /** For "Missed Connections" insight (review-first potentialImpact) */
    searchVisibilityScore?: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    // Check for API key
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const body: AnalyzeRequest = await request.json();
    const { type, businessName, businessCategory, data } = body;

    if (!businessName || !businessCategory) {
      return NextResponse.json(
        { error: 'businessName and businessCategory are required' },
        { status: 400 }
      );
    }

    // Input size limits to prevent token abuse
    const MAX_REVIEWS = 50;
    const MAX_COMMENTS = 100;
    const MAX_CAPTIONS = 30;
    const MAX_COMPETITORS = 30;

    if (data.reviews && data.reviews.length > MAX_REVIEWS) {
      data.reviews = data.reviews.slice(0, MAX_REVIEWS);
    }
    if (data.instagramComments && data.instagramComments.length > MAX_COMMENTS) {
      data.instagramComments = data.instagramComments.slice(0, MAX_COMMENTS);
    }
    if (data.facebookComments && data.facebookComments.length > MAX_COMMENTS) {
      data.facebookComments = data.facebookComments.slice(0, MAX_COMMENTS);
    }
    if (data.instagramRecentCaptions && data.instagramRecentCaptions.length > MAX_CAPTIONS) {
      data.instagramRecentCaptions = data.instagramRecentCaptions.slice(0, MAX_CAPTIONS);
    }
    if (data.competitors && data.competitors.length > MAX_COMPETITORS) {
      data.competitors = data.competitors.slice(0, MAX_COMPETITORS);
    }

    console.log(`[AI Analyze] Starting ${type} analysis for "${businessName}"`);

    let result: FullPresenceAnalysis | Record<string, unknown>;

    switch (type) {
      case 'full':
        result = await analyzeFullPresence(businessName, businessCategory, {
          instagram: data.instagram ? { ...data.instagram, platform: 'instagram' } : undefined,
          facebook: data.facebook ? { ...data.facebook, platform: 'facebook' } : undefined,
          website: data.website ? { ...data.website, platform: 'website' } : undefined,
          reviews: data.reviews,
          instagramComments: data.instagramComments,
          facebookComments: data.facebookComments,
          instagramRecentCaptions: data.instagramRecentCaptions,
          websiteSummary: data.websiteSummary ?? undefined,
          gbpSummary: data.gbpSummary ?? undefined,
          competitors: data.competitors,
          userRank: data.userRank ?? null,
          userScores: data.userScores,
          searchVisibilityScore: data.searchVisibilityScore,
        });
        break;

      case 'instagram':
        if (!data.instagram) {
          return NextResponse.json(
            { error: 'Instagram data is required for instagram analysis' },
            { status: 400 }
          );
        }
        result = await analyzeSocialProfile(businessName, businessCategory, {
          ...data.instagram,
          platform: 'instagram',
        });
        break;

      case 'facebook':
        if (!data.facebook) {
          return NextResponse.json(
            { error: 'Facebook data is required for facebook analysis' },
            { status: 400 }
          );
        }
        result = await analyzeSocialProfile(businessName, businessCategory, {
          ...data.facebook,
          platform: 'facebook',
        });
        break;

      case 'consistency':
        const profiles = [];
        if (data.instagram) profiles.push({ ...data.instagram, platform: 'instagram' as const });
        if (data.facebook) profiles.push({ ...data.facebook, platform: 'facebook' as const });
        if (data.website) profiles.push({ ...data.website, platform: 'website' as const });

        if (profiles.length < 2) {
          return NextResponse.json(
            { error: 'At least 2 profiles required for consistency analysis' },
            { status: 400 }
          );
        }
        result = await analyzeConsistency(businessName, profiles);
        break;

      case 'reviews':
        if (!data.reviews || data.reviews.length === 0) {
          return NextResponse.json(
            { error: 'Reviews data is required for reviews analysis' },
            { status: 400 }
          );
        }
        result = await analyzeReviews(businessName, businessCategory, data.reviews);
        break;

      case 'comments':
        const platform = data.instagramComments ? 'instagram' : 'facebook';
        const comments = data.instagramComments || data.facebookComments;
        if (!comments || comments.length === 0) {
          return NextResponse.json(
            { error: 'Comments data is required for comments analysis' },
            { status: 400 }
          );
        }
        result = await analyzeComments(businessName, platform, comments);
        break;

      default:
        return NextResponse.json(
          { error: `Invalid analysis type: ${type}` },
          { status: 400 }
        );
    }

    console.log(`[AI Analyze] Completed ${type} analysis for "${businessName}"`);

    return NextResponse.json({
      success: true,
      type,
      businessName,
      analysis: result,
    });
  } catch (error) {
    console.error('[AI Analyze] Error:', error);
    // Don't leak error details to client (could expose internal paths, API keys, etc.)
    const isbudgetError = error instanceof Error && error.name === 'ApiBudgetExceededError';
    return NextResponse.json(
      { error: isbudgetError ? 'Service temporarily unavailable. Please try again later.' : 'Failed to perform analysis' },
      { status: isbudgetError ? 503 : 500 }
    );
  }
}
