"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import Image from "next/image";

interface StageGoogleBusinessProfileProps {
  placeId: string;
  scanId?: string;
  onComplete?: () => void;
}

interface PlaceDetails {
  placeId: string;
  name: string;
  rating: number | null;
  userRatingsTotal: number;
  types: string[];
  categoryLabel: string;
  description: string | null;
  address: string;
  location: { lat: number; lng: number } | null;
  photoRef: string | null;
  photoUri?: string | null;
  website: string | null;
  url: string | null;
  phoneNumber: string | null;
  openingHours: {
    open_now?: boolean;
    weekday_text?: string[];
    periods?: Array<{
      open: { day: number; time: string };
      close?: { day: number; time: string };
    }>;
  } | null;
}

export default function StageGoogleBusinessProfile({
  placeId,
  scanId,
  onComplete,
}: StageGoogleBusinessProfileProps) {
  const [data, setData] = useState<PlaceDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Sequential reveal state
  const [revealedItems, setRevealedItems] = useState<number>(0);
  const revealStartedRef = useRef(false);
  const scanCountRef = useRef(0);

  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/places/details?placeId=${encodeURIComponent(placeId)}`
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Failed to fetch place details: ${response.status}`
          );
        }

        const details: PlaceDetails = await response.json();
        setData(details);
      } catch (err: any) {
        console.error("Error fetching place details:", err);
        setError(err.message || "An unknown error occurred.");
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [placeId]);

  // Sequential reveal of findings (1.5s between each)
  useEffect(() => {
    if (loading || error || !data || revealStartedRef.current) return;
    
    revealStartedRef.current = true;
    const REVEAL_DELAY = 1500; // 1.5 seconds between each item
    
    // Items to reveal: description, phone, website, openingHours
    const totalMainItems = 4;
    
    // Reveal main items one by one
    for (let i = 1; i <= totalMainItems; i++) {
      setTimeout(() => {
        setRevealedItems(i);
      }, i * REVEAL_DELAY);
    }
  }, [loading, error, data]);

  // Track scan loop and call onComplete after ~8.5 seconds
  useEffect(() => {
    if (loading || error) return;

    // Wait for approximately 8.5 seconds (about 1.7 scan loops)
    const scanTimeout = setTimeout(() => {
      onComplete?.();
    }, 8500); // 8.5 seconds

    return () => clearTimeout(scanTimeout);
  }, [loading, error, onComplete]);

  // Render star rating
  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

    return (
      <div className="flex items-center gap-1">
        {[...Array(fullStars)].map((_, i) => (
          <svg
            key={`full-${i}`}
            className="w-5 h-5 text-yellow-400 fill-current"
            viewBox="0 0 20 20"
          >
            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
          </svg>
        ))}
        {hasHalfStar && (
          <svg
            className="w-5 h-5 text-yellow-400 fill-current"
            viewBox="0 0 20 20"
          >
            <defs>
              <linearGradient id="half-fill">
                <stop offset="50%" stopColor="currentColor" />
                <stop offset="50%" stopColor="transparent" stopOpacity="1" />
              </linearGradient>
            </defs>
            <path
              fill="url(#half-fill)"
              d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"
            />
          </svg>
        )}
        {[...Array(emptyStars)].map((_, i) => (
          <svg
            key={`empty-${i}`}
            className="w-5 h-5 text-gray-300 fill-current"
            viewBox="0 0 20 20"
          >
            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
          </svg>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="max-w-[720px] w-full">
          {/* Skeleton card */}
          <div className="rounded-2xl bg-white shadow-xl border border-black/5 overflow-hidden">
            {/* Skeleton images */}
            <div className="grid grid-cols-2">
              <div className="h-[160px] md:h-[200px] bg-gray-200 animate-pulse" />
              <div className="h-[160px] md:h-[200px] bg-gray-200 animate-pulse" />
            </div>
            {/* Skeleton content */}
            <div className="p-5 md:p-6 space-y-4">
              <div className="h-8 bg-gray-200 rounded animate-pulse w-3/4" />
              <div className="h-6 bg-gray-200 rounded animate-pulse w-1/2" />
              <div className="h-4 bg-gray-200 rounded animate-pulse w-full" />
            </div>
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
          <p className="text-gray-600 text-sm">{error || "Failed to load business details"}</p>
        </div>
      </div>
    );
  }

  const photoUrl = data.photoUri
    ? data.photoUri
    : data.photoRef
      ? `/api/places/photo?ref=${encodeURIComponent(data.photoRef)}&maxwidth=900`
      : null;

  const mapUrl = data.location
    ? `/api/places/static-map?lat=${data.location.lat}&lng=${data.location.lng}&zoom=16`
    : null;

  return (
    <div className="w-full h-full flex items-center justify-center p-6">
      <div className="max-w-[720px] w-full">
        {/* GBP Card */}
        <div className="rounded-2xl bg-white shadow-xl border border-black/5 overflow-hidden opacity-0 animate-[fadeIn_0.5s_ease-in-out_forwards]">
          {/* Top row: Photo + Map */}
          <div className="grid grid-cols-2">
            {/* Left: Business Photo */}
            <div className="relative h-[160px] md:h-[200px] bg-gray-100">
              {photoUrl ? (
                <div className="relative w-full h-full">
                  <Image
                    src={photoUrl}
                    alt={data.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                  <span className="text-gray-500 text-sm">No photo</span>
                </div>
              )}
            </div>

            {/* Right: Static Map */}
            <div className="relative h-[160px] md:h-[200px] bg-gray-100">
              {mapUrl ? (
                <div className="relative w-full h-full">
                  <Image
                    src={mapUrl}
                    alt={`Map of ${data.name}`}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                  <svg
                    className="w-12 h-12 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="p-5 md:p-6">
            {/* Business Name */}
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-gray-900 mb-4">
              {data.name}
            </h2>

            {/* Rating Row */}
            <div className="flex items-center gap-4 mb-4 flex-wrap">
              {data.rating !== null && (
                <div className="flex items-center gap-2">
                  {renderStars(data.rating)}
                  <span className="text-base font-medium text-gray-900">
                    {data.rating.toFixed(1)}
                  </span>
                </div>
              )}
              {data.userRatingsTotal > 0 && (
                <span className="text-sm text-gray-600">
                  ({data.userRatingsTotal.toLocaleString()} review
                  {data.userRatingsTotal !== 1 ? "s" : ""})
                </span>
              )}
              {data.types && data.types.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap ml-auto">
                  {data.types
                    .filter((type) => {
                      // Filter out generic types
                      const genericTypes = [
                        "point_of_interest",
                        "establishment",
                        "premise",
                        "street_address",
                        "route",
                        "locality",
                        "political",
                        "administrative_area_level_1",
                        "administrative_area_level_2",
                        "country",
                      ];
                      return !genericTypes.includes(type);
                    })
                    .map((type) => {
                      // Convert snake_case to Title Case
                      const formatted = type
                        .split("_")
                        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(" ");
                      return formatted;
                    })
                    .map((category, idx) => (
                      <span
                        key={idx}
                        className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded-md"
                      >
                        {category}
                      </span>
                    ))}
                </div>
              )}
            </div>

            {/* Description - Item 1 */}
            {revealedItems >= 1 && (
              <div className="finding-reveal mb-4">
                {data.description ? (
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {data.description}
                  </p>
                ) : (
                  <div className="flex items-center gap-2 text-red-600">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm">No description found</span>
                  </div>
                )}
              </div>
            )}

            {/* Contact Information */}
            <div className="space-y-3 mb-4">
              {/* Phone Number - Item 2 */}
              {revealedItems >= 2 && (
                <div className="finding-reveal">
                  {data.phoneNumber ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">Phone:</span>
                      <a 
                        href={`tel:${data.phoneNumber.replace(/\s/g, '')}`}
                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {data.phoneNumber}
                      </a>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-red-600">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span className="text-sm">Phone number not found</span>
                    </div>
                  )}
                </div>
              )}

              {/* Website - Item 3 */}
              {revealedItems >= 3 && (
                <div className="finding-reveal">
                  {data.website ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">Website:</span>
                      <a 
                        href={data.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate max-w-md"
                      >
                        {data.website}
                      </a>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-red-600">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span className="text-sm">Website not found</span>
                    </div>
                  )}
                </div>
              )}

              {/* Opening Hours - Item 4 */}
              {revealedItems >= 4 && (
                <div className="finding-reveal">
                  {data.openingHours ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">Opening Hours:</span>
                        {data.openingHours.open_now !== undefined && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            data.openingHours.open_now 
                              ? 'bg-green-100 text-green-700' 
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {data.openingHours.open_now ? 'Open now' : 'Closed now'}
                          </span>
                        )}
                      </div>
                      {data.openingHours.weekday_text && data.openingHours.weekday_text.length > 0 && (
                        <div className="pl-0 space-y-1">
                          {data.openingHours.weekday_text.map((day, idx) => (
                            <div key={idx} className="text-sm text-gray-600">
                              {day}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-red-600">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span className="text-sm">Opening hours not found</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

