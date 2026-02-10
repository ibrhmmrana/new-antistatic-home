/**
 * Google Business Profile - Autocomplete API
 * Uses Google Places Autocomplete API to search for businesses
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiBudget } from '@/lib/net/apiBudget';

interface AutocompletePrediction {
  place_id: string;
  description: string;
  structured_formatting?: {
    main_text: string;
    secondary_text: string;
  };
}

interface AutocompleteResponse {
  predictions: AutocompletePrediction[];
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const input = searchParams.get('input');

  if (!input || input.trim().length < 2) {
    return NextResponse.json({ predictions: [] }, { status: 200 });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Google Places API key not configured' },
      { status: 500 }
    );
  }

  try {
    // Budget guard: prevent runaway Google Places API costs
    apiBudget.spend("google-places");

    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', input);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('types', 'establishment'); // Focus on businesses

    const response = await fetch(url.toString());
    const data: AutocompleteResponse = await response.json();

    if (data.predictions) {
      // Return minimal results
      const results = data.predictions.map(pred => ({
        place_id: pred.place_id,
        description: pred.description,
        main_text: pred.structured_formatting?.main_text || pred.description,
        secondary_text: pred.structured_formatting?.secondary_text || '',
      }));

      return NextResponse.json({ predictions: results }, { status: 200 });
    }

    return NextResponse.json({ predictions: [] }, { status: 200 });
  } catch (error) {
    console.error('[GBP-AUTOCOMPLETE] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch autocomplete results' },
      { status: 500 }
    );
  }
}
