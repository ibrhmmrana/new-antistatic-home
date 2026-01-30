"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import { fetchWithTimeoutClient } from "@/lib/net/clientFetchWithTimeout";

interface StageReviewSentimentProps {
  placeId: string;
  scanId?: string;
  onComplete?: () => void;
}

interface Review {
  reviewId?: string;
  authorName: string;
  profilePhotoUrl: string | null;
  relativeTime: string | null;
  rating: number;
  text: string;
  isLocalGuide?: boolean;
}

interface ReviewsData {
  placeId: string;
  name: string;
  reviews: Review[];
}

/**
 * Fixed rotations and offsets for each card position
 * Ensures variety: each card has a different rotation and offset
 */
const CARD_TRANSFORMS = [
  { rotate: "-1.5deg", x: -8 },
  { rotate: "1.2deg", x: 10 },
  { rotate: "-0.8deg", x: -6 },
  { rotate: "1.8deg", x: 8 },
  { rotate: "-1.0deg", x: -4 },
];

function getStickerTransform(index: number) {
  // Use fixed transforms based on position, cycling if more than 5 cards
  const transform = CARD_TRANSFORMS[index % CARD_TRANSFORMS.length];
  return {
    rotate: transform.rotate,
    x: transform.x,
  };
}

export default function StageReviewSentiment({
  placeId,
  scanId,
  onComplete,
}: StageReviewSentimentProps) {
  const [data, setData] = useState<ReviewsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fetchReviews = async () => {
      setLoading(true);
      setError(null);
      
      // First, check if data was pre-loaded in localStorage
      if (scanId) {
        try {
          const cachedData = localStorage.getItem(`reviews_${scanId}`);
          if (cachedData) {
            const reviewsData: ReviewsData = JSON.parse(cachedData);
            
            // Validate cached data
            if (reviewsData.reviews && Array.isArray(reviewsData.reviews)) {
              console.log("[reviews] Using pre-loaded data from localStorage");
              setData(reviewsData);
              setLoading(false);
              return;
            }
          }
        } catch (e) {
          console.warn("[reviews] Failed to parse cached data, fetching fresh:", e);
        }
      }
      
      // If no cached data, fetch from API
      try {
        const response = await fetchWithTimeoutClient(
          `/api/places/reviews?placeId=${encodeURIComponent(placeId)}`,
          undefined,
          20000
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Failed to fetch reviews: ${response.status}`
          );
        }

        const reviewsData: ReviewsData = await response.json();
        setData(reviewsData);
        
        // Store in localStorage for future use
        if (scanId) {
          localStorage.setItem(`reviews_${scanId}`, JSON.stringify(reviewsData));
        }
      } catch (err: any) {
        console.error("Error fetching reviews:", err);
        setError(err.message || "An unknown error occurred.");
      } finally {
        setLoading(false);
      }
    };

    fetchReviews();
  }, [placeId, scanId]);

  // Calculate scale to fit cards on screen without scrollbar
  useEffect(() => {
    const calculateScale = () => {
      // Estimate card height: padding (40px) + avatar (44px) + content (~100px) = ~184px
      // With 5 cards overlapping by 50px each, total height ≈ first card + 4 * (card height - 50px)
      const estimatedCardHeight = 184;
      const estimatedTotalHeight = estimatedCardHeight + (4 * (estimatedCardHeight - 50)); // ~680px
      const containerHeight = window.innerHeight - 200; // Account for padding and nav
      const calculatedScale = Math.min(1, containerHeight / estimatedTotalHeight);
      setScale(Math.max(0.65, calculatedScale)); // Minimum scale of 0.65 to ensure readability
    };

    calculateScale();
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, [data]);

  // Auto-advance to next stage after all reviews have appeared + 2 seconds
  useEffect(() => {
    if (loading || error || !data || !data.reviews || data.reviews.length === 0) return;

    const reviews = data.reviews.slice(0, 5); // Max 5 reviews shown
    const lastReviewIndex = reviews.length - 1;
    // Last review animation starts at: lastReviewIndex * 3000ms
    // Animation duration is 0.5s (500ms), so review is fully visible at: (lastReviewIndex * 3000) + 500
    // Wait 0.5 seconds after last review is fully visible (reduced from 2 seconds)
    const animationDuration = 500; // fadeInUp animation duration
    const delayAfterLastReview = 500; // Reduced from 2000ms to 500ms
    const totalDelay = (lastReviewIndex * 3000) + animationDuration + delayAfterLastReview;

    const timeout = setTimeout(() => {
      onComplete?.();
    }, totalDelay);

    return () => clearTimeout(timeout);
  }, [loading, error, data, onComplete]);

  // Calculate scale to fit cards on screen
  useEffect(() => {
    const calculateScale = () => {
      // Estimate card height: padding (40px) + avatar (44px) + content (~80-100px) + overlap
      // With 5 cards overlapping by 50px each, total height ≈ first card + 4 * (card height - 50px)
      const estimatedCardHeight = 180; // Approximate height of one card
      const estimatedTotalHeight = estimatedCardHeight + (4 * (estimatedCardHeight - 50)); // ~680px
      const containerHeight = window.innerHeight - 200; // Account for padding and nav
      const calculatedScale = Math.min(1, containerHeight / estimatedTotalHeight);
      setScale(Math.max(0.7, calculatedScale)); // Minimum scale of 0.7
    };

    calculateScale();
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, [data]);

  // Render star rating (top-right aligned)
  const renderStars = (rating: number) => {
    // Show actual rating, or empty stars if rating is missing/invalid
    if (!rating || rating <= 0) {
      return (
        <div className="flex items-center gap-0.5">
          {[...Array(5)].map((_, i) => (
            <svg
              key={`empty-${i}`}
              className="w-[18px] h-[18px] text-gray-300 fill-current flex-shrink-0"
              viewBox="0 0 20 20"
              width="18"
              height="18"
            >
              <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
            </svg>
          ))}
        </div>
      );
    }
    
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

    return (
      <div className="flex items-center gap-0.5">
        {[...Array(fullStars)].map((_, i) => (
          <svg
            key={`full-${i}`}
            className="w-[18px] h-[18px] text-yellow-400 fill-current flex-shrink-0"
            viewBox="0 0 20 20"
            width="18"
            height="18"
          >
            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
          </svg>
        ))}
        {hasHalfStar && (
          <svg
            className="w-[18px] h-[18px] text-yellow-400 fill-current flex-shrink-0"
            viewBox="0 0 20 20"
            width="18"
            height="18"
          >
            <defs>
              <linearGradient id={`half-fill-${rating}`}>
                <stop offset="50%" stopColor="currentColor" />
                <stop offset="50%" stopColor="transparent" stopOpacity="1" />
              </linearGradient>
            </defs>
            <path
              fill={`url(#half-fill-${rating})`}
              d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"
            />
          </svg>
        )}
        {[...Array(emptyStars)].map((_, i) => (
          <svg
            key={`empty-${i}`}
            className="w-[18px] h-[18px] text-gray-300 fill-current flex-shrink-0"
            viewBox="0 0 20 20"
            width="18"
            height="18"
          >
            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
          </svg>
        ))}
      </div>
    );
  };

  // Get initials for avatar fallback
  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Truncate text with "More" link
  const truncateText = (text: string, maxLength: number = 180) => {
    if (text.length <= maxLength) return { text, hasMore: false };
    return {
      text: text.substring(0, maxLength),
      hasMore: true,
    };
  };

  if (loading) {
    // Skeleton loading state
    return (
      <div className="w-full h-full flex items-center justify-center p-6 overflow-hidden">
        <div className="max-w-[560px] w-full flex items-center justify-center" style={{ overflow: 'visible' }}>
          <div 
            className="space-y-0 w-full" 
            style={{ 
              overflow: 'visible', 
              transform: `scale(${scale})`, 
              transformOrigin: 'center' 
            }}
          >
            {[0, 1, 2, 3, 4].map((idx) => {
              const transform = getStickerTransform(idx);
              return (
                <div
                  key={idx}
                  className={`rounded-2xl bg-white shadow-md border border-slate-100 p-6 animate-pulse ${
                    idx > 0 ? "-mt-[55px]" : ""
                  }`}
                  style={{
                    transform: `rotate(${transform.rotate}) translateX(${transform.x}px)`,
                    zIndex: 10 + idx,
                    overflow: 'visible',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-[14px] bg-gray-200 rounded w-1/3" />
                      <div className="h-3 bg-gray-200 rounded w-1/4" />
                      <div className="space-y-1">
                        <div className="h-3 bg-gray-200 rounded w-full" />
                        <div className="h-3 bg-gray-200 rounded w-5/6" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <p className="text-red-600 font-medium mb-2">Error</p>
          <p className="text-gray-600 text-sm">
            {error || "Failed to load reviews"}
          </p>
        </div>
      </div>
    );
  }

  const reviews = data.reviews.slice(0, 5); // Ensure max 5

  return (
    <div className="w-full h-full flex items-center justify-center p-6 overflow-hidden">
      <div className="max-w-[560px] w-full flex items-center justify-center" style={{ overflow: 'visible' }}>
        <div 
          className="space-y-0 w-full" 
          style={{ 
            overflow: 'visible', 
            transform: `scale(${scale})`, 
            transformOrigin: 'center' 
          }}
        >
          {reviews.map((review, idx) => {
            const { text, hasMore } = truncateText(review.text);
            // Get fixed transform based on card position
            const transform = getStickerTransform(idx);
            
            return (
              <div
                key={review.reviewId || idx}
                className={`rounded-2xl bg-white shadow-md border border-slate-100 p-6 transition-all duration-300 relative ${
                  idx > 0 ? "-mt-[55px]" : ""
                }`}
                style={{
                  zIndex: 10 + idx, // Later cards on top (sticker effect)
                  transform: `rotate(${transform.rotate}) translateX(${transform.x}px)`,
                  animation: `fadeInUp 0.5s ease-out ${idx * 3000}ms forwards`,
                  overflow: 'visible',
                  opacity: 0, // Start hidden, animation will make it visible
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Profile Photo with Local Guide Badge */}
                  <div className="flex-shrink-0 relative" style={{ overflow: 'visible' }}>
                    {review.profilePhotoUrl ? (
                      <div className="relative w-12 h-12 rounded-full overflow-hidden">
                        <Image
                          src={review.profilePhotoUrl}
                          alt={review.authorName}
                          width={48}
                          height={48}
                          className="object-cover"
                          unoptimized
                          onError={(e) => {
                            // Fallback to initials on error
                            const target = e.target as HTMLImageElement;
                            target.style.display = "none";
                            if (target.parentElement) {
                              target.parentElement.innerHTML = `
                                <div class="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-sm">
                                  ${getInitials(review.authorName)}
                                </div>
                              `;
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-sm">
                        {getInitials(review.authorName)}
                      </div>
                    )}
                    {/* Local Guide Badge - Outside avatar, bottom-right with white ring */}
                    {review.isLocalGuide && (
                      <div
                        className="absolute w-4 h-4 bg-yellow-400 rounded-full ring-2 ring-white shadow-sm flex items-center justify-center"
                        style={{ 
                          bottom: '-2px',
                          right: '-2px',
                          overflow: 'visible'
                        }}
                      >
                        <svg
                          className="w-2.5 h-2.5 text-white fill-current"
                          viewBox="0 0 20 20"
                        >
                          <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Review Content */}
                  <div className="flex-1 min-w-0">
                    {/* Header: Name, Time, Stars (top-right) */}
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-[16px] font-semibold text-slate-900 mb-0.5">
                          {review.authorName}
                        </div>
                        {review.relativeTime && (
                          <div className="text-[14px] text-slate-400">
                            {review.relativeTime}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 mt-0.5">
                        {renderStars(review.rating)}
                      </div>
                    </div>

                    {/* Review Text with truncation */}
                    <div className="text-[15px] leading-[1.5] text-slate-700">
                      {text}
                      {hasMore && (
                        <span className="text-[15px] text-slate-500 ml-1">More</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

