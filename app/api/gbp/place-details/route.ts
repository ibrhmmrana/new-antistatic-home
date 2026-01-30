/**
 * Google Business Profile - Place Details API (New)
 * Fetches place details via Places API (New) v1 and runs analysis
 */

import { NextRequest, NextResponse } from "next/server";
import { analyzeGbp } from "@/lib/gbp/analyzeGbp";
import {
  fetchPlaceDetailsNew,
  fetchFirstPhotoUri,
} from "@/lib/places/placeDetailsNew";
import { getRequestId } from "@/lib/net/requestId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GBP_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "websiteUri",
  "internationalPhoneNumber",
  "nationalPhoneNumber",
  "businessStatus",
  "rating",
  "userRatingCount",
  "types",
  "regularOpeningHours",
  "priceLevel",
  "editorialSummary",
  "photos",
  "googleMapsUri",
] as const;

export async function GET(request: NextRequest) {
  const t0 = Date.now();
  const rid = getRequestId(request);
  const searchParams = request.nextUrl.searchParams;
  const placeId = searchParams.get("place_id");

  console.log(`[RID ${rid}] gbp.place-details start`, { placeId });

  if (!placeId) {
    return NextResponse.json(
      { error: "place_id is required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { rid, error: "Google Places API key not configured" },
      { status: 500 }
    );
  }

  try {
    console.log(`[RID ${rid}] gbp.place-details fetch google`);
    const result = await fetchPlaceDetailsNew(
      placeId,
      [...GBP_FIELD_MASK],
      apiKey
    );
    console.log(`[RID ${rid}] gbp.place-details google done`, { hasResult: !!result });

    if (!result) {
      return NextResponse.json(
        { rid, error: "Failed to fetch place details", googleStatus: "no_result" },
        { status: 502 }
      );
    }

    const description = result.editorial_summary?.overview ?? null;
    const firstPhotoName = result.photos?.[0]?.name;
    const photoUri =
      firstPhotoName != null
        ? await fetchFirstPhotoUri(firstPhotoName, apiKey, 900)
        : null;

    if (description) {
      console.log(
        `[GBP-PLACE-DETAILS] Found general description: "${description.substring(0, 80)}..."`
      );
    } else {
      console.log(
        "[GBP-PLACE-DETAILS] No editorialSummary.overview found - description may not be available for this business"
      );
    }

    const placeDetails = {
      name: result.name ?? "",
      address: result.formatted_address ?? "",
      lat: result.geometry?.location?.lat ?? null,
      lng: result.geometry?.location?.lng ?? null,
      website: result.website ?? null,
      phone:
        result.formatted_phone_number ??
        result.international_phone_number ??
        null,
      rating: result.rating ?? null,
      reviews: result.user_ratings_total ?? 0,
      openingHours: result.opening_hours ?? null,
      priceLevel:
        result.price_level != null ? Number(result.price_level) : null,
      types: result.types ?? [],
      businessStatus: result.business_status ?? null,
      description,
      photoRef: null,
      photoUri: photoUri ?? null,
      url: result.url ?? null,
    };

    const analysis = await analyzeGbp(placeDetails);

    console.log(`[RID ${rid}] gbp.place-details done`, { ms: Date.now() - t0 });
    return NextResponse.json(
      {
        placeDetails,
        analysis,
      },
      { status: 200 }
    );
  } catch (error) {
    const ms = Date.now() - t0;
    const isTimeout =
      error instanceof Error &&
      (error.name === "AbortError" || /timeout|aborted/i.test(error.message));
    console.error(`[RID ${rid}] gbp.place-details error`, { error, ms });
    return NextResponse.json(
      {
        rid,
        error: isTimeout ? "Upstream timeout" : "Failed to fetch place details",
      },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
