import { NextRequest, NextResponse } from "next/server";

const MAX_PHOTOS = 18;
const MEDIA_MAX_WIDTH_PX = 1600;
const PLACE_FETCH_TIMEOUT_MS = 12000;
const MEDIA_FETCH_TIMEOUT_MS = 10000;

export const maxDuration = 30;

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
    // New Places API (v1): get place with photos and displayName (with timeout so we don't hang in prod)
    const placeUrl = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
    const placeRes = await fetch(placeUrl, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "photos,displayName",
      },
      signal: AbortSignal.timeout(PLACE_FETCH_TIMEOUT_MS),
      next: { revalidate: 3600 },
    });

    if (!placeRes.ok) {
      const errText = await placeRes.text();
      console.error("[places/photos] Place details error:", placeRes.status, errText.slice(0, 300));
      return NextResponse.json(
        { error: `Places API error: ${placeRes.status}` },
        { status: placeRes.status >= 500 ? 502 : 400 }
      );
    }

    const place = (await placeRes.json()) as {
      displayName?: { text?: string };
      name?: string;
      photos?: Array<{ name: string; widthPx?: number; heightPx?: number }>;
    };

    const name =
      (place.displayName?.text ?? place.name ?? "").trim() || "";
    const photos = place.photos ?? [];

    if (photos.length === 0) {
      return NextResponse.json({
        placeId,
        name,
        photos: [],
        ...(process.env.NODE_ENV !== "production" && {
          debug: { totalPhotosReturned: 0, placeId },
        }),
      });
    }

    // Fetch photoUri for each photo (New API media endpoint); run in parallel with per-request timeout
    const slice = photos.slice(0, MAX_PHOTOS);
    const mediaFetches = slice.map(async (photo) => {
      try {
        const mediaUrl = `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=${MEDIA_MAX_WIDTH_PX}&skipHttpRedirect=true`;
        const mediaRes = await fetch(mediaUrl, {
          method: "GET",
          headers: { "X-Goog-Api-Key": apiKey },
          signal: AbortSignal.timeout(MEDIA_FETCH_TIMEOUT_MS),
          next: { revalidate: 3600 * 24 * 7 },
        });

        if (!mediaRes.ok) {
          const errText = await mediaRes.text();
          console.warn("[places/photos] Media error for", photo.name, mediaRes.status, errText.slice(0, 200));
          return { uri: "", width: null, height: null, name: photo.name };
        }

        const media = (await mediaRes.json()) as { photoUri?: string };
        const uri = (media.photoUri ?? "").trim();
        return {
          uri,
          width: photo.widthPx ?? null,
          height: photo.heightPx ?? null,
          name: photo.name,
        };
      } catch (e) {
        console.warn("[places/photos] Media fetch failed for", photo.name, e);
        return { uri: "", width: null, height: null, name: photo.name };
      }
    });

    const normalizedPhotos = await Promise.all(mediaFetches);
    const validPhotos = normalizedPhotos.filter((p) => p.uri);

    const responseData: Record<string, unknown> = {
      placeId,
      name,
      photos: validPhotos,
    };

    if (process.env.NODE_ENV !== "production") {
      responseData.debug = {
        totalPhotosReturned: validPhotos.length,
        placeId,
      };
    }

    return NextResponse.json(responseData);
  } catch (error: unknown) {
    const err = error as { name?: string; message?: string };
    const isTimeout = err?.name === "AbortError" || String(err?.message ?? "").includes("timeout");
    console.error("[places/photos] Error:", err?.message ?? error);
    return NextResponse.json(
      { error: isTimeout ? "Request timed out" : "Failed to fetch place photos" },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
