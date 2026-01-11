import { NextRequest, NextResponse } from "next/server";

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
    // Request all fields needed for GBP card
    const fields = [
      "name",
      "rating",
      "user_ratings_total",
      "types",
      "photos",
      "geometry/location",
      "editorial_summary",
      "formatted_address",
      "website", // CRITICAL: Add website field to get business website URL
      "url",
    ].join(",");

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${apiKey}`;
    
    const response = await fetch(url, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      return NextResponse.json(
        { error: data.error_message || "Failed to fetch place details" },
        { status: 400 }
      );
    }

    const result = data.result || {};
    
    // Extract primary category from types (exclude generic types)
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
    
    const types = result.types || [];
    const primaryType = types.find((t: string) => !genericTypes.includes(t)) || types[0] || "";
    
    // Convert type to human-readable category label
    const categoryLabel = primaryType
      ? primaryType
          .split("_")
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ")
      : "";
    
    // Extract photo reference
    const photoRef = result.photos?.[0]?.photo_reference || null;
    
    // Extract description from editorial_summary
    const description = result.editorial_summary?.overview || null;
    
    return NextResponse.json({
      placeId,
      name: result.name || "",
      rating: result.rating || null,
      userRatingsTotal: result.user_ratings_total || 0,
      types: types,
      categoryLabel,
      description,
      address: result.formatted_address || "",
      location: result.geometry?.location || null,
      photoRef,
      website: result.website || null,
      url: result.url || null,
    });
  } catch (error) {
    console.error("Error fetching place details:", error);
    return NextResponse.json(
      { error: "Failed to fetch place details" },
      { status: 500 }
    );
  }
}

