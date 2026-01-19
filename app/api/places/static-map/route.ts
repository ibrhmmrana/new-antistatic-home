import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const zoom = searchParams.get("zoom") || "16";
  const placeIds = searchParams.get("placeIds"); // Comma-separated list of place IDs

  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("GOOGLE_MAPS_API_KEY or GOOGLE_PLACES_API_KEY is not set");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  try {
    let centerLat = lat;
    let centerLng = lng;
    let markers: string[] = [];

    // If placeIds are provided, fetch their locations
    if (placeIds) {
      const placeIdArray = placeIds.split(',').filter(Boolean);
      const locations: Array<{ lat: number; lng: number }> = [];

      for (const placeId of placeIdArray) {
        try {
          const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
          detailsUrl.searchParams.set('place_id', placeId.trim());
          detailsUrl.searchParams.set('fields', 'geometry');
          detailsUrl.searchParams.set('key', apiKey);

          const detailsResponse = await fetch(detailsUrl.toString());
          const detailsData = await detailsResponse.json();

          if (detailsData.status === 'OK' && detailsData.result?.geometry?.location) {
            const loc = detailsData.result.geometry.location;
            locations.push({ lat: loc.lat, lng: loc.lng });
            markers.push(`color:red|${loc.lat},${loc.lng}`);
          }
        } catch (error) {
          console.error(`Error fetching location for place ${placeId}:`, error);
        }
      }

      // Calculate center from all locations
      if (locations.length > 0) {
        const avgLat = locations.reduce((sum, loc) => sum + loc.lat, 0) / locations.length;
        const avgLng = locations.reduce((sum, loc) => sum + loc.lng, 0) / locations.length;
        centerLat = avgLat.toString();
        centerLng = avgLng.toString();
      } else {
        // If no locations found, return error
        return NextResponse.json(
          { error: "Could not fetch locations for provided place IDs" },
          { status: 400 }
        );
      }
    } else if (lat && lng) {
      // Single marker mode
      markers.push(`color:red|${lat},${lng}`);
    } else {
      return NextResponse.json(
        { error: "Either lat/lng or placeIds are required" },
        { status: 400 }
      );
    }

    // Validate we have center coordinates
    if (!centerLat || !centerLng) {
      return NextResponse.json(
        { error: "Could not determine map center" },
        { status: 400 }
      );
    }

    // Build Static Maps URL
    const url = new URL("https://maps.googleapis.com/maps/api/staticmap");
    url.searchParams.set("center", `${centerLat},${centerLng}`);
    url.searchParams.set("zoom", zoom);
    url.searchParams.set("size", "600x400"); // Larger size for better visibility
    url.searchParams.set("scale", "2");
    url.searchParams.set("maptype", "roadmap");
    url.searchParams.set("style", "feature:poi|visibility:off"); // Hide POI labels for cleaner look
    
    // Add all markers
    markers.forEach(marker => {
      url.searchParams.append("markers", marker);
    });
    
    url.searchParams.set("key", apiKey);
    
    const response = await fetch(url.toString(), {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      throw new Error(`Google Static Maps API error: ${response.status}`);
    }

    // Get the image as a blob
    const imageBlob = await response.blob();
    
    // Return the image with proper headers
    return new NextResponse(imageBlob, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error fetching static map:", error);
    return NextResponse.json(
      { error: "Failed to fetch static map" },
      { status: 500 }
    );
  }
}


