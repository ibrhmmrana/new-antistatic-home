import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const ref = searchParams.get("ref") || searchParams.get("photo_reference");
  const maxw = searchParams.get("maxw") || searchParams.get("maxwidth") || "1400";

  if (!ref) {
    return NextResponse.json(
      { error: "ref (photo_reference) is required" },
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
    const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxw}&photo_reference=${encodeURIComponent(ref)}&key=${apiKey}`;
    
    const response = await fetch(url, {
      next: { revalidate: 3600 * 24 * 7 }, // Cache for 1 week
    });

    if (!response.ok) {
      throw new Error(`Google Places Photo API error: ${response.status}`);
    }

    // Get the image as a blob
    const imageBlob = await response.blob();
    
    // Return the image with proper headers for CDN friendliness
    return new NextResponse(imageBlob, {
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    console.error("Error fetching place photo:", error);
    return NextResponse.json(
      { error: "Failed to fetch place photo" },
      { status: 500 }
    );
  }
}

