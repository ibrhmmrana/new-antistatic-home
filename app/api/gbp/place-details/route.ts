/**
 * Google Business Profile - Place Details API
 * Fetches detailed information about a place and runs analysis
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeGbp } from '@/lib/gbp/analyzeGbp';

interface PlaceDetailsResponse {
  status?: string;
  error_message?: string;
  result?: {
    name?: string;
    formatted_address?: string;
    geometry?: {
      location: {
        lat: number;
        lng: number;
      };
    };
    website?: string;
    formatted_phone_number?: string;
    international_phone_number?: string;
    business_status?: string;
    rating?: number;
    user_ratings_total?: number;
    types?: string[];
    opening_hours?: {
      weekday_text?: string[];
      open_now?: boolean;
    };
    price_level?: number;
    editorial_summary?: {
      overview?: string;
    };
    photos?: Array<{
      photo_reference?: string;
    }>;
    url?: string;
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const placeId = searchParams.get('place_id');

  if (!placeId) {
    return NextResponse.json(
      { error: 'place_id is required' },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Google Places API key not configured' },
      { status: 500 }
    );
  }

  try {
    // Fetch place details - using same fields as onboarding stage
    const fields = [
      'name',
      'formatted_address',
      'geometry',
      'website',
      'formatted_phone_number',
      'international_phone_number',
      'business_status',
      'rating',
      'user_ratings_total',
      'types',
      'opening_hours',
      'price_level',
      'editorial_summary', // CRITICAL: This gives us the description
      'photos', // For photo reference
      'url', // Google Maps URL
    ].join(',');

    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields', fields);
    url.searchParams.set('key', apiKey);

    const response = await fetch(url.toString(), {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });
    
    const data: PlaceDetailsResponse = await response.json();

    if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return NextResponse.json(
        { error: (data as any).error_message || 'Failed to fetch place details' },
        { status: 400 }
      );
    }

    if (!data.result) {
      return NextResponse.json(
        { error: 'Place not found' },
        { status: 404 }
      );
    }

    const result = data.result;

    // Extract description from editorial_summary
    // This is the general Google-generated description (e.g., "Relaxed, split-level, all-day cafe facing beach...")
    // Note: The "From [business]" text is the business owner's description and requires GBP API (not available via Places API)
    const description = result.editorial_summary?.overview || null;
    
    // Debug logging
    if (description) {
      console.log(`[GBP-PLACE-DETAILS] Found general description: "${description.substring(0, 80)}..."`);
    } else {
      console.log('[GBP-PLACE-DETAILS] No editorial_summary.overview found - description may not be available for this business');
    }

    // Normalize place details
    const placeDetails = {
      name: result.name || '',
      address: result.formatted_address || '',
      lat: result.geometry?.location?.lat || null,
      lng: result.geometry?.location?.lng || null,
      website: result.website || null,
      phone: result.formatted_phone_number || result.international_phone_number || null,
      rating: result.rating || null,
      reviews: result.user_ratings_total || 0,
      openingHours: result.opening_hours || null,
      priceLevel: result.price_level || null,
      types: result.types || [],
      businessStatus: result.business_status || null,
      description: description, // Add description from editorial_summary
      photoRef: result.photos?.[0]?.photo_reference || null,
      url: result.url || null,
    };

    // Run analysis
    const analysis = await analyzeGbp(placeDetails);

    return NextResponse.json({
      placeDetails,
      analysis,
    }, { status: 200 });
  } catch (error) {
    console.error('[GBP-PLACE-DETAILS] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch place details' },
      { status: 500 }
    );
  }
}
