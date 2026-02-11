import { NextRequest, NextResponse } from "next/server";
import {
  fetchPlaceDetailsNew,
  fetchFirstPhotoUri,
} from "@/lib/places/placeDetailsNew";
import { getRequestId } from "@/lib/net/requestId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "types",
  "websiteUri",
  "internationalPhoneNumber",
  "nationalPhoneNumber",
  "regularOpeningHours",
  "editorialSummary",
  "photos",
  "googleMapsUri",
] as const;

export async function GET(request: NextRequest) {
  const t0 = Date.now();
  const rid = getRequestId(request);
  const searchParams = request.nextUrl.searchParams;
  const placeId = searchParams.get("placeId");

  console.log(`[RID ${rid}] places.details start`, { placeId });

  if (!placeId) {
    return NextResponse.json(
      { error: "placeId is required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { rid, error: "Server configuration error" },
      { status: 500 }
    );
  }

  try {
    console.log(`[RID ${rid}] places.details fetch google`);
    const result = await fetchPlaceDetailsNew(
      placeId,
      [...DETAILS_FIELD_MASK],
      apiKey
    );
    console.log(`[RID ${rid}] places.details google done`, { hasResult: !!result });

    if (!result) {
      return NextResponse.json(
        { rid, error: "Failed to fetch place details", googleStatus: "no_result" },
        { status: 502 }
      );
    }

    const types = result.types ?? [];
    const genericTypes = [
      "point_of_interest",
      "establishment",
      "premise",
      "street_address",
      "route",
      "locality",
      "political",
      "administrative_area_level_1",
      "administrative_area_level_2",
      "country",
    ];
    const primaryType =
      types.find((t: string) => !genericTypes.includes(t)) ?? types[0] ?? "";
    const categoryLabel = primaryType
      ? primaryType
          .split("_")
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ")
      : "";

    const description = result.editorial_summary?.overview ?? null;
    const firstPhotoName = result.photos?.[0]?.name;
    const photoUri =
      firstPhotoName != null
        ? await fetchFirstPhotoUri(firstPhotoName, apiKey, 900)
        : null;

    console.log(`[RID ${rid}] places.details done`, { ms: Date.now() - t0 });
    // Service-area businesses (pureServiceAreaBusiness) have no physical address; location may be null
    const address = result.formatted_address ?? "";
    const location = result.geometry?.location ?? null;
    const userRatingsTotal = result.user_ratings_total ?? 0;
    return NextResponse.json({
      placeId: result.place_id ?? placeId,
      name: result.name ?? "",
      rating: result.rating ?? null,
      userRatingsTotal,
      types,
      categoryLabel,
      description,
      address,
      location,
      // Backward-compat aliases for consumers expecting legacy keys
      formatted_address: address,
      geometry: location ? { location } : null,
      user_ratings_total: userRatingsTotal,
      photoRef: null,
      photoUri: photoUri ?? undefined,
      website: result.website ?? null,
      url: result.url ?? null,
      phoneNumber:
        result.international_phone_number ?? result.formatted_phone_number ?? null,
      openingHours: result.opening_hours ?? null,
    });
  } catch (error) {
    const ms = Date.now() - t0;
    const isTimeout =
      error instanceof Error &&
      (error.name === "AbortError" || /timeout|aborted/i.test(error.message));
    console.error(`[RID ${rid}] places.details error`, { error, ms });
    return NextResponse.json(
      {
        rid,
        error: isTimeout ? "Upstream timeout" : "Failed to fetch place details",
      },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
