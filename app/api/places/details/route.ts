import { NextRequest, NextResponse } from "next/server";
import {
  fetchPlaceDetailsNew,
  fetchFirstPhotoUri,
} from "@/lib/places/placeDetailsNew";

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
  const searchParams = request.nextUrl.searchParams;
  const placeId = searchParams.get("placeId");

  if (!placeId) {
    return NextResponse.json(
      { error: "placeId is required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("GOOGLE_PLACES_API_KEY is not set");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  try {
    const result = await fetchPlaceDetailsNew(
      placeId,
      [...DETAILS_FIELD_MASK],
      apiKey
    );

    if (!result) {
      return NextResponse.json(
        { error: "Failed to fetch place details" },
        { status: 400 }
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

    return NextResponse.json({
      placeId: result.place_id ?? placeId,
      name: result.name ?? "",
      rating: result.rating ?? null,
      userRatingsTotal: result.user_ratings_total ?? 0,
      types,
      categoryLabel,
      description,
      address: result.formatted_address ?? "",
      location: result.geometry?.location ?? null,
      photoRef: null,
      photoUri: photoUri ?? undefined,
      website: result.website ?? null,
      url: result.url ?? null,
      phoneNumber:
        result.international_phone_number ?? result.formatted_phone_number ?? null,
      openingHours: result.opening_hours ?? null,
    });
  } catch (error) {
    console.error("Error fetching place details:", error);
    return NextResponse.json(
      { error: "Failed to fetch place details" },
      { status: 500 }
    );
  }
}
