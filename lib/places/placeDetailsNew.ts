/**
 * Places API (New) v1 – Place Details helper
 * Fetches place details and returns a legacy-shaped result so routes can keep existing response logic.
 * Uses fetchWithTimeout for hard timeout and retries.
 */

import { fetchWithTimeout } from "@/lib/net/fetchWithTimeout";
import { consumeBody } from "@/lib/net/consumeBody";
import { ApiCache } from "@/lib/net/apiCache";

const PLACE_DETAILS_TIMEOUT_MS = 10000;
const PLACE_DETAILS_RETRIES = 2;

/** Cache place details for 5 min / max 500 entries to avoid redundant Google API calls. */
const placeDetailsCache = new ApiCache<LegacyShapedPlace>(500, 5 * 60 * 1000);
/** Cache photo URIs for 10 min (they rarely change). */
const photoUriCache = new ApiCache<string | null>(300, 10 * 60 * 1000);

export type PlaceDetailsFieldMask =
  | "id"
  | "name"
  | "displayName"
  | "formattedAddress"
  | "location"
  | "rating"
  | "userRatingCount"
  | "types"
  | "websiteUri"
  | "internationalPhoneNumber"
  | "nationalPhoneNumber"
  | "regularOpeningHours"
  | "editorialSummary"
  | "photos"
  | "reviews"
  | "googleMapsUri"
  | "businessStatus"
  | "priceLevel";

/** New API Place (partial – we only use what we request via FieldMask) */
interface PlaceNew {
  name?: string;
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  websiteUri?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  regularOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
  editorialSummary?: { overview?: string };
  photos?: Array<{ name: string }>;
  reviews?: Array<{
    name?: string;
    relativePublishTimeDescription?: string;
    text?: string | { text?: string };
    rating?: number;
    authorAttribution?: { displayName?: string };
  }>;
  googleMapsUri?: string;
  businessStatus?: string;
  priceLevel?: string;
}

/** Legacy-shaped result (snake_case) for drop-in replacement in routes */
export interface LegacyShapedPlace {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  geometry?: { location?: { lat: number; lng: number } };
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
  website?: string;
  international_phone_number?: string;
  formatted_phone_number?: string;
  opening_hours?: {
    open_now?: boolean;
    weekday_text?: string[];
  };
  editorial_summary?: { overview?: string };
  photos?: Array<{ photo_reference?: string; name?: string }>;
  reviews?: Array<{
    author_name?: string;
    relative_time_description?: string;
    text?: string;
    rating?: number;
    profile_photo_url?: string | null;
    time?: number | null;
  }>;
  url?: string;
  business_status?: string;
  price_level?: number;
}

/**
 * Fetch place details from Places API (New) v1 and return legacy-shaped object.
 */
export async function fetchPlaceDetailsNew(
  placeId: string,
  fieldMask: PlaceDetailsFieldMask[],
  apiKey: string
): Promise<LegacyShapedPlace | null> {
  const mask = fieldMask.join(",");
  const cacheKey = `${placeId}:${mask}`;

  // Return cached result if available (avoids redundant Google API calls)
  const cached = placeDetailsCache.get(cacheKey);
  if (cached) return cached;

  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;

  try {
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": mask,
      },
      timeoutMs: PLACE_DETAILS_TIMEOUT_MS,
      retries: PLACE_DETAILS_RETRIES,
    });

    if (!response.ok) {
      await consumeBody(response);
      console.error("[places/placeDetailsNew] API error:", response.status);
      return null;
    }

    const place: PlaceNew = await response.json();
    const result = mapPlaceNewToLegacy(place, placeId);
    if (result) placeDetailsCache.set(cacheKey, result);
    return result;
  } catch (e) {
    console.error("[places/placeDetailsNew] fetch error:", e);
    return null;
  }
}

function mapPlaceNewToLegacy(place: PlaceNew, placeId: string): LegacyShapedPlace {
  const loc = place.location;
  const lat = loc?.latitude;
  const lng = loc?.longitude;

  const result: LegacyShapedPlace = {
    place_id: place.id ?? placeId,
    name: place.displayName?.text ?? place.name ?? "",
    formatted_address: place.formattedAddress,
    geometry:
      lat != null && lng != null ? { location: { lat, lng } } : undefined,
    rating: place.rating,
    user_ratings_total: place.userRatingCount ?? 0,
    types: place.types,
    website: place.websiteUri ?? undefined,
    international_phone_number: place.internationalPhoneNumber,
    formatted_phone_number: place.nationalPhoneNumber ?? place.internationalPhoneNumber,
    opening_hours: place.regularOpeningHours
      ? {
          open_now: place.regularOpeningHours.openNow,
          weekday_text: place.regularOpeningHours.weekdayDescriptions,
        }
      : undefined,
    editorial_summary: place.editorialSummary
      ? { overview: place.editorialSummary.overview }
      : undefined,
    photos: place.photos?.map((p) => ({ name: p.name })),
    url: place.googleMapsUri,
    business_status: place.businessStatus,
    price_level:
      place.priceLevel === "PRICE_LEVEL_FREE"
        ? 0
        : place.priceLevel === "PRICE_LEVEL_INEXPENSIVE"
          ? 1
          : place.priceLevel === "PRICE_LEVEL_MODERATE"
            ? 2
            : place.priceLevel === "PRICE_LEVEL_EXPENSIVE"
              ? 3
              : undefined,
  };

  if (place.reviews?.length) {
    result.reviews = place.reviews.map((r) => ({
      author_name: r.authorAttribution?.displayName ?? "Anonymous",
      relative_time_description: r.relativePublishTimeDescription ?? null,
      text:
        typeof r.text === "string"
          ? r.text
          : (r.text && typeof r.text === "object" && "text" in r.text
              ? (r.text as { text?: string }).text
              : "") ?? "",
      rating: r.rating ?? 0,
      profile_photo_url: null,
      time: null,
    }));
  }

  return result;
}

const MEDIA_TIMEOUT_MS = 10000;
const MEDIA_RETRIES = 2;

/**
 * Fetch first photo's media URL (photoUri) from Places API (New) for a place that has photos.
 */
export async function fetchFirstPhotoUri(
  photoName: string,
  apiKey: string,
  maxWidthPx: number = 900
): Promise<string | null> {
  const cacheKey = `${photoName}:${maxWidthPx}`;
  const cached = photoUriCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`;
  try {
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: { "X-Goog-Api-Key": apiKey },
      timeoutMs: MEDIA_TIMEOUT_MS,
      retries: MEDIA_RETRIES,
    });
    if (!response.ok) {
      await consumeBody(response);
      return null;
    }
    const data = (await response.json()) as { photoUri?: string };
    const uri = (data.photoUri ?? "").trim() || null;
    photoUriCache.set(cacheKey, uri);
    return uri;
  } catch {
    return null;
  }
}
