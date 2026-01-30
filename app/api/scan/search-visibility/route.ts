import { NextRequest, NextResponse } from "next/server";
import { getSearchVisibility } from "@/lib/seo/searchVisibility";
import { getCompetitorSnapshot } from "@/lib/seo/competitors";
import { buildBusinessIdentityFromPlaceId } from "@/lib/business/resolveBusinessIdentity";
import type { SearchVisibilityResult } from "@/lib/seo/searchVisibility";
import type { CompetitorsSnapshot } from "@/lib/seo/competitors";
import { getRequestId } from "@/lib/net/requestId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Total route timeout (must be under maxDuration 60). Search visibility is returned even if competitors timeout.
const SEARCH_VISIBILITY_HARD_TIMEOUT_MS = 55000;
const COMPETITORS_TIMEOUT_MS = 20000;

const emptyCompetitorsSnapshot = (placeId: string | null): CompetitorsSnapshot => ({
  competitors_places: [],
  reputation_gap: null,
  competitors_with_website: 0,
  competitors_without_website: 0,
  search_method: "none",
  search_radius_meters: null,
  search_queries_used: [],
  location_used: null,
  your_place_id: placeId ?? null,
  error: "Timeout",
  debug_info: [],
});

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  const rid = getRequestId(request);

  try {
    console.log(`[RID ${rid}] search.visibility start`);
    const body = await request.json();
    const { placeId, placeName, placeAddress, placeTypes, latlng, rating, reviewCount, stage1Competitors } = body;

    if (!placeId) {
      return NextResponse.json(
        { error: "placeId is required" },
        { status: 400 }
      );
    }

    const timeoutPromise = new Promise<{ timeout: true }>((resolve) => {
      setTimeout(() => resolve({ timeout: true }), SEARCH_VISIBILITY_HARD_TIMEOUT_MS);
    });

    const run = async () => {
      console.log(`[RID ${rid}] search.visibility fetch identity`);
      const businessIdentity = await buildBusinessIdentityFromPlaceId({
        placeId,
        placeName,
        placeAddress,
        placeTypes,
        latlng,
        rating,
        reviewCount,
      });

      console.log(`[RID ${rid}] search.visibility fetch search visibility`);
      let searchVisibility: SearchVisibilityResult;
      try {
        searchVisibility = await getSearchVisibility({
          identity: businessIdentity,
          maxQueries: 10,
          hasMenuPage: false,
          hasPricingPage: false,
        });
      } catch (svError) {
        console.error(`[RID ${rid}] search.visibility search visibility error`, svError);
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
          error: svError instanceof Error ? svError.message : "Unknown error",
        };
      }

      // Competitors with its own timeout so slow competitor fetch doesn't block returning search visibility
      console.log(`[RID ${rid}] search.visibility fetch competitors`);
      let competitorsSnapshot: CompetitorsSnapshot;
      try {
        const competitorsPromise = getCompetitorSnapshot({
          identity: businessIdentity,
          radiusMeters: 3000,
          maxCompetitors: 8,
          stage1Competitors: stage1Competitors || [],
        });
        const competitorsTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Competitors timeout")), COMPETITORS_TIMEOUT_MS)
        );
        competitorsSnapshot = await Promise.race([competitorsPromise, competitorsTimeout]);
      } catch (compError) {
        console.error(`[RID ${rid}] search.visibility competitor snapshot error`, compError);
        competitorsSnapshot = emptyCompetitorsSnapshot(businessIdentity.place_id);
      }

      return { businessIdentity, searchVisibility, competitorsSnapshot };
    };

    const result = await Promise.race([run(), timeoutPromise]);

    if (result && "timeout" in result && result.timeout) {
      console.error(`[RID ${rid}] search.visibility timeout after ${SEARCH_VISIBILITY_HARD_TIMEOUT_MS}ms`);
      return NextResponse.json(
        { rid, error: "Upstream timeout" },
        { status: 504 }
      );
    }

    if (!result || "timeout" in result) {
      return NextResponse.json(
        { rid, error: "Upstream error" },
        { status: 502 }
      );
    }

    const { businessIdentity, searchVisibility, competitorsSnapshot } = result;
    console.log(`[RID ${rid}] search.visibility done`, { ms: Date.now() - t0 });

    return NextResponse.json({
      success: true,
      search_visibility: searchVisibility,
      competitors_snapshot: competitorsSnapshot,
      business_identity: businessIdentity,
    });
  } catch (error) {
    const ms = Date.now() - t0;
    const isTimeout =
      error instanceof Error &&
      (error.name === "AbortError" || /timeout|aborted/i.test(error.message));
    console.error(`[RID ${rid}] search.visibility error`, { error, ms });
    return NextResponse.json(
      {
        rid,
        error: isTimeout ? "Upstream timeout" : (error instanceof Error ? error.message : "Unknown error"),
      },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
