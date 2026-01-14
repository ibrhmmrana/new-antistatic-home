import { NextRequest, NextResponse } from "next/server";

const MAX_PHOTOS = 18;

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
    // Request photos field along with name
    const fields = ["name", "photos"].join(",");
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
        { error: data.error_message || "Failed to fetch place photos" },
        { status: 400 }
      );
    }

    const result = data.result || {};
    const photos = result.photos || [];
    
    // Normalize and limit photos
    const normalizedPhotos = photos
      .slice(0, MAX_PHOTOS)
      .map((photo: any) => ({
        ref: photo.photo_reference,
        width: photo.width || null,
        height: photo.height || null,
      }));

    const responseData: any = {
      placeId,
      name: result.name || "",
      photos: normalizedPhotos,
    };

    // Dev-only debug info
    if (process.env.NODE_ENV !== "production") {
      responseData.debug = {
        totalPhotosReturned: normalizedPhotos.length,
        placeId,
      };
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Error fetching place photos:", error);
    return NextResponse.json(
      { error: "Failed to fetch place photos" },
      { status: 500 }
    );
  }
}


