import { NextRequest, NextResponse } from "next/server";
import { getSearchVisibility } from "@/lib/seo/searchVisibility";
import { getCompetitorSnapshot } from "@/lib/seo/competitors";
import { buildBusinessIdentityFromPlaceId } from "@/lib/business/resolveBusinessIdentity";
import type { SearchVisibilityResult } from "@/lib/seo/searchVisibility";
import type { CompetitorsSnapshot } from "@/lib/seo/competitors";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { placeId, placeName, placeAddress, placeTypes, latlng, rating, reviewCount, stage1Competitors } = body;

    if (!placeId) {
      return NextResponse.json(
        { error: "placeId is required" },
        { status: 400 }
      );
    }

    // Build business identity from placeId (no website required)
    const businessIdentity = await buildBusinessIdentityFromPlaceId({
      placeId,
      placeName,
      placeAddress,
      placeTypes,
      latlng,
      rating,
      reviewCount,
    });

    // Run search visibility analysis
    let searchVisibility: SearchVisibilityResult;
    try {
      searchVisibility = await getSearchVisibility({
        identity: businessIdentity,
        maxQueries: 10,
        hasMenuPage: false,
        hasPricingPage: false,
      });
    } catch (svError) {
      console.error('[SEARCH-VISIBILITY] Search visibility error:', svError);
      searchVisibility = {
        queries: [],
        visibility_score: 0,
        share_of_voice: 0,
        branded_visibility: 0,
        non_branded_visibility: 0,
        top_competitor_domains: [],
        directory_domains: [],
        business_domains: [],
        identity_used: {
          business_name: businessIdentity.business_name,
          location_label: businessIdentity.location_label,
          service_keywords: businessIdentity.service_keywords,
        },
        error: svError instanceof Error ? svError.message : 'Unknown error',
      };
    }

    // Run competitor analysis
    let competitorsSnapshot: CompetitorsSnapshot;
    try {
      competitorsSnapshot = await getCompetitorSnapshot({
        identity: businessIdentity,
        radiusMeters: 3000,
        maxCompetitors: 8,
        stage1Competitors: stage1Competitors || [],
      });
    } catch (compError) {
      console.error('[SEARCH-VISIBILITY] Competitor snapshot error:', compError);
      competitorsSnapshot = {
        competitors_places: [],
        reputation_gap: null,
        competitors_with_website: 0,
        competitors_without_website: 0,
        search_method: 'none',
        search_radius_meters: null,
        search_queries_used: [],
        location_used: null,
        your_place_id: businessIdentity.place_id,
        error: compError instanceof Error ? compError.message : 'Unknown error',
        debug_info: [],
      };
    }

    return NextResponse.json({
      success: true,
      search_visibility: searchVisibility,
      competitors_snapshot: competitorsSnapshot,
      business_identity: businessIdentity,
    });
  } catch (error) {
    console.error('[SEARCH-VISIBILITY] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
