import { NextRequest, NextResponse } from "next/server";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

interface GooglePrediction {
  place_id: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface GoogleResponse {
  predictions: GooglePrediction[];
  status: string;
  error_message?: string;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const input = searchParams.get("input");
  const country = searchParams.get("country") || "za";

  // Validate input
  if (!input || input.length < 2) {
    return NextResponse.json({ predictions: [] });
  }

  if (input.length > 120) {
    return NextResponse.json({ predictions: [] });
  }

  if (!GOOGLE_PLACES_API_KEY) {
    console.error("GOOGLE_PLACES_API_KEY is not set");
    return NextResponse.json({ predictions: [] });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    url.searchParams.set("input", input);
    url.searchParams.set("key", GOOGLE_PLACES_API_KEY);
    url.searchParams.set("components", `country:${country}`);

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.status}`);
    }

    const data: GoogleResponse = await response.json();

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.error("Google Places API error:", data.status, data.error_message);
      return NextResponse.json({ predictions: [] });
    }

    // Normalize response
    const predictions = (data.predictions || []).map((pred) => ({
      place_id: pred.place_id,
      primary_text: pred.structured_formatting.main_text,
      secondary_text: pred.structured_formatting.secondary_text,
    }));

    return NextResponse.json({ predictions });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("Google Places API request timeout");
    } else {
      console.error("Error calling Google Places API:", error);
    }
    return NextResponse.json({ predictions: [] });
  }
}

