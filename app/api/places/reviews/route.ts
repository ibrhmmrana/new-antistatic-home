import { NextRequest, NextResponse } from "next/server";

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

  // Group by rating buckets
  const buckets: Record<string, NormalizedReview[]> = {
    low: [], // 1-2 stars
    three: [], // 3 stars
    four: [], // 4 stars
    five: [], // 5 stars
  };

  reviews.forEach((review) => {
    const rating = review.rating;
    if (rating >= 1 && rating < 3) buckets.low.push(review);
    else if (rating >= 3 && rating < 4) buckets.three.push(review);
    else if (rating >= 4 && rating < 5) buckets.four.push(review);
    else if (rating === 5) buckets.five.push(review);
  });

  // Sort each bucket by recency (newest first)
  // Use time if available, otherwise keep original order (Google API returns most recent first)
  const sortByRecency = (a: NormalizedReview, b: NormalizedReview) => {
    if (a.time && b.time) {
      return b.time - a.time; // Higher time = newer
    }
    // If only one has time, prioritize it
    if (a.time && !b.time) return -1;
    if (!a.time && b.time) return 1;
    // If neither has time, keep original order (Google API typically returns newest first)
    return 0;
  };

  Object.keys(buckets).forEach((key) => {
    buckets[key].sort(sortByRecency);
  });

  const selected: NormalizedReview[] = [];
  const seenIds = new Set<string>();

  // Helper to add review if not already selected
  const addIfNotSeen = (review: NormalizedReview) => {
    if (!seenIds.has(review.reviewId) && selected.length < 5) {
      selected.push(review);
      seenIds.add(review.reviewId);
    }
  };

  // Ideal mix: 1 low, 1 three, 1 four, 2 five
  if (buckets.low.length > 0) {
    addIfNotSeen(buckets.low[0]);
  }
  if (buckets.three.length > 0) {
    addIfNotSeen(buckets.three[0]);
  }
  if (buckets.four.length > 0) {
    addIfNotSeen(buckets.four[0]);
  }
  // Add up to 2 five-star reviews
  if (buckets.five.length > 0) {
    addIfNotSeen(buckets.five[0]);
    if (buckets.five.length > 1 && selected.length < 5) {
      addIfNotSeen(buckets.five[1]);
    }
  }

  // Fill remaining slots with fallback logic
  while (selected.length < 5) {
    let added = false;

    // Try to fill from nearest buckets if ideal buckets are empty
    if (selected.length < 5 && buckets.low.length > 0) {
      const next = buckets.low.find((r) => !seenIds.has(r.reviewId));
      if (next) {
        addIfNotSeen(next);
        added = true;
      }
    }
    if (selected.length < 5 && buckets.three.length > 0) {
      const next = buckets.three.find((r) => !seenIds.has(r.reviewId));
      if (next) {
        addIfNotSeen(next);
        added = true;
      }
    }
    if (selected.length < 5 && buckets.four.length > 0) {
      const next = buckets.four.find((r) => !seenIds.has(r.reviewId));
      if (next) {
        addIfNotSeen(next);
        added = true;
      }
    }
    if (selected.length < 5 && buckets.five.length > 0) {
      const next = buckets.five.find((r) => !seenIds.has(r.reviewId));
      if (next) {
        addIfNotSeen(next);
        added = true;
      }
    }

    // If we couldn't add any, break to avoid infinite loop
    if (!added) break;
  }

  // If all reviews are 5★, just pick the 5 most recent
  if (selected.length === 0 && buckets.five.length > 0) {
    return buckets.five.slice(0, 5);
  }

  return selected.slice(0, 5);
}

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
    // Request reviews field along with name
    const fields = ["name", "reviews"].join(",");
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${apiKey}`;
    
    const response = await fetch(url, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      return NextResponse.json(
        { error: data.error_message || "Failed to fetch place reviews" },
        { status: 400 }
      );
    }

    const result = data.result || {};
    const reviews = result.reviews || [];
    
    // Normalize and filter reviews (Google Places API typically returns up to 5 reviews)
    // We'll process all available reviews for variety selection
    const normalizedReviews = reviews
      .filter((review: any) => review.text && review.text.trim().length > 0) // Filter empty text
      .map((review: any, index: number) => ({
        reviewId: review.author_name + (review.time || index), // Create stable ID
        authorName: review.author_name || "Anonymous",
        profilePhotoUrl: review.profile_photo_url || null,
        relativeTime: review.relative_time_description || null,
        rating: review.rating || 0,
        text: review.text || "",
        // Check if reviewer is a Local Guide (Google sometimes includes this in author_url or we can infer from profile)
        isLocalGuide: review.author_url?.includes("maps/contrib") || false,
        time: review.time || null, // For sorting by recency
      }))
      // De-duplicate by reviewId
      .filter((review, index, self) => 
        index === self.findIndex((r) => r.reviewId === review.reviewId)
      );
    
    // Select 5 reviews with rating variety
    const selectedReviews = selectReviewVariety(normalizedReviews);

    return NextResponse.json({
      placeId,
      name: result.name || "",
      reviews: selectedReviews,
    });
  } catch (error) {
    console.error("Error fetching place reviews:", error);
    return NextResponse.json(
      { error: "Failed to fetch place reviews" },
      { status: 500 }
    );
  }
}

