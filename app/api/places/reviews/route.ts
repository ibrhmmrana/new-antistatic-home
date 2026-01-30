import { NextRequest, NextResponse } from "next/server";
import { fetchPlaceDetailsNew } from "@/lib/places/placeDetailsNew";

interface NormalizedReview {
  reviewId: string;
  authorName: string;
  profilePhotoUrl: string | null;
  relativeTime: string | null;
  rating: number;
  text: string;
  isLocalGuide: boolean;
  time: number | null;
}

/**
 * Select 5 reviews with rating variety preference
 * Ideal mix: 1 low (1-2★), 1 3★, 1 4★, 2 5★
 */
function selectReviewVariety(reviews: NormalizedReview[]): NormalizedReview[] {
  if (reviews.length === 0) return [];
  if (reviews.length <= 5) return reviews.slice(0, 5);

  const buckets: Record<string, NormalizedReview[]> = {
    low: [],
    three: [],
    four: [],
    five: [],
  };

  reviews.forEach((review) => {
    const rating = review.rating;
    if (rating >= 1 && rating < 3) buckets.low.push(review);
    else if (rating >= 3 && rating < 4) buckets.three.push(review);
    else if (rating >= 4 && rating < 5) buckets.four.push(review);
    else if (rating === 5) buckets.five.push(review);
  });

  const sortByRecency = (a: NormalizedReview, b: NormalizedReview) => {
    if (a.time && b.time) return b.time - a.time;
    if (a.time && !b.time) return -1;
    if (!a.time && b.time) return 1;
    return 0;
  };

  Object.keys(buckets).forEach((key) => {
    buckets[key].sort(sortByRecency);
  });

  const selected: NormalizedReview[] = [];
  const seenIds = new Set<string>();

  const addIfNotSeen = (review: NormalizedReview) => {
    if (!seenIds.has(review.reviewId) && selected.length < 5) {
      selected.push(review);
      seenIds.add(review.reviewId);
    }
  };

  if (buckets.low.length > 0) addIfNotSeen(buckets.low[0]);
  if (buckets.three.length > 0) addIfNotSeen(buckets.three[0]);
  if (buckets.four.length > 0) addIfNotSeen(buckets.four[0]);
  if (buckets.five.length > 0) {
    addIfNotSeen(buckets.five[0]);
    if (buckets.five.length > 1 && selected.length < 5) addIfNotSeen(buckets.five[1]);
  }

  while (selected.length < 5) {
    let added = false;
    for (const key of ["low", "three", "four", "five"]) {
      const next = buckets[key].find((r) => !seenIds.has(r.reviewId));
      if (next) {
        addIfNotSeen(next);
        added = true;
      }
    }
    if (!added) break;
  }

  if (selected.length === 0 && buckets.five.length > 0) {
    return buckets.five.slice(0, 5);
  }
  return selected.slice(0, 5);
}

const REVIEWS_FIELD_MASK = ["id", "displayName", "reviews"] as const;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const placeId = searchParams.get("placeId");
  const returnAll = searchParams.get("all") === "true";

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
    const result = await fetchPlaceDetailsNew(
      placeId,
      [...REVIEWS_FIELD_MASK],
      apiKey
    );

    if (!result) {
      return NextResponse.json(
        { error: "Failed to fetch place reviews" },
        { status: 400 }
      );
    }

    const reviews = result.reviews ?? [];
    const normalizedReviews = reviews
      .filter((r: { text?: string }) => r.text && r.text.trim().length > 0)
      .map((review: any, index: number) => ({
        reviewId: (review.author_name ?? "anon") + (review.time ?? index),
        authorName: review.author_name ?? "Anonymous",
        profilePhotoUrl: review.profile_photo_url ?? null,
        relativeTime: review.relative_time_description ?? null,
        rating: review.rating ?? 0,
        text: review.text ?? "",
        isLocalGuide: false,
        time: review.time ?? null,
      }))
      .filter(
        (r: NormalizedReview, i: number, self: NormalizedReview[]) =>
          i === self.findIndex((x) => x.reviewId === r.reviewId)
      );

    const reviewsToReturn = returnAll
      ? normalizedReviews
      : selectReviewVariety(normalizedReviews);

    return NextResponse.json({
      placeId: result.place_id ?? placeId,
      name: result.name ?? "",
      reviews: reviewsToReturn,
    });
  } catch (error) {
    console.error("Error fetching place reviews:", error);
    return NextResponse.json(
      { error: "Failed to fetch place reviews" },
      { status: 500 }
    );
  }
}
