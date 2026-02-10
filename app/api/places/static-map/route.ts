import { NextRequest, NextResponse } from "next/server";
import { fetchWithTimeout } from "@/lib/net/fetchWithTimeout";
import { consumeBody } from "@/lib/net/consumeBody";
import { getRequestId } from "@/lib/net/requestId";
import { apiBudget } from "@/lib/net/apiBudget";

const MAX_PLACE_IDS = 20;

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const t0 = Date.now();
  const rid = getRequestId(request);
  const searchParams = request.nextUrl.searchParams;
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const zoom = searchParams.get("zoom") || "16";
  const placeIds = searchParams.get("placeIds"); // Comma-separated list of place IDs

  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { rid, error: "Server configuration error" },
      { status: 500 }
    );
  }

  try {
    let centerLat = lat;
    let centerLng = lng;
    let markers: string[] = [];

    // If placeIds are provided, fetch their locations
    if (placeIds) {
      const placeIdArray = placeIds.split(',').filter(Boolean).slice(0, MAX_PLACE_IDS);
      console.log(`[RID ${rid}] static-map processing ${placeIdArray.length} place IDs (capped at ${MAX_PLACE_IDS})`);
      const locations: Array<{ lat: number; lng: number }> = [];

      for (const placeId of placeIdArray) {
        try {
          // Budget guard per Place Details call
          apiBudget.spend("google-places");
          const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
          detailsUrl.searchParams.set('place_id', placeId.trim());
          detailsUrl.searchParams.set('fields', 'geometry');
          detailsUrl.searchParams.set('key', apiKey);

          const detailsResponse = await fetchWithTimeout(detailsUrl.toString(), {
            timeoutMs: 10000,
            retries: 2,
          });
          if (!detailsResponse.ok) {
            await consumeBody(detailsResponse);
            console.warn(`[RID ${rid}] static-map place ${placeId} status`, detailsResponse.status);
            continue;
          }
          const detailsData = await detailsResponse.json();

          if (detailsData.status === 'OK' && detailsData.result?.geometry?.location) {
            const loc = detailsData.result.geometry.location;
            locations.push({ lat: loc.lat, lng: loc.lng });
            markers.push(`color:red|${loc.lat},${loc.lng}`);
          }
        } catch (error) {
          console.error(`[RID ${rid}] static-map error for place ${placeId}:`, error);
        }
      }

      if (locations.length > 0) {
        const avgLat = locations.reduce((sum, loc) => sum + loc.lat, 0) / locations.length;
        const avgLng = locations.reduce((sum, loc) => sum + loc.lng, 0) / locations.length;
        centerLat = avgLat.toString();
        centerLng = avgLng.toString();
      } else {
        return new NextResponse(null, { status: 204 });
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

    // Budget guard for Static Maps API call
    apiBudget.spend("google-maps");
    console.log(`[RID ${rid}] static-map fetch image`);
    const response = await fetchWithTimeout(url.toString(), {
      timeoutMs: 10000,
      retries: 2,
    });

    if (!response.ok) {
      await consumeBody(response);
      console.error(`[RID ${rid}] static-map google status`, response.status);
      return NextResponse.json(
        { rid, error: "Upstream static map error", googleStatus: response.status },
        { status: 502 }
      );
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") ?? "image/png";
    console.log(`[RID ${rid}] static-map done`, { ms: Date.now() - t0 });
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === "AbortError" || /timeout|aborted/i.test(error.message));
    console.error(`[RID ${rid}] static-map error`, error);
    return NextResponse.json(
      { rid, error: isTimeout ? "Upstream timeout" : "Failed to fetch static map" },
      { status: isTimeout ? 504 : 500 }
    );
  }
}


