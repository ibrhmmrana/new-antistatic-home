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

  // Retry logic for fetch failures
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxw}&photo_reference=${encodeURIComponent(ref)}&key=${apiKey}`;
      
      // Add delay between retries (exponential backoff)
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
      }
      
      const response = await fetch(url, {
        next: { revalidate: 3600 * 24 * 7 }, // Cache for 1 week
        signal: AbortSignal.timeout(10000), // 10 second timeout per attempt
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
    } catch (error: any) {
      const isLastAttempt = attempt === MAX_RETRIES - 1;
      const isNetworkError = error?.message?.includes('fetch failed') || 
                            error?.message?.includes('timeout') ||
                            error?.code === 'ETIMEDOUT' ||
                            error?.name === 'AbortError';
      
      if (isLastAttempt) {
        console.error(`[PLACES PHOTO] Failed after ${MAX_RETRIES} attempts:`, error?.message || error);
        return NextResponse.json(
          { error: "Failed to fetch place photo after retries" },
          { status: 500 }
        );
      }
      
      if (isNetworkError) {
        console.warn(`[PLACES PHOTO] Attempt ${attempt + 1}/${MAX_RETRIES} failed (network error), retrying...`);
        continue;
      }
      
      // If it's not a network error, don't retry
      console.error("[PLACES PHOTO] Non-retryable error:", error);
      return NextResponse.json(
        { error: "Failed to fetch place photo" },
        { status: 500 }
      );
    }
  }
  
  // Should never reach here, but TypeScript needs it
  return NextResponse.json(
    { error: "Failed to fetch place photo" },
    { status: 500 }
  );
}

