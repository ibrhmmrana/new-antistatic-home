"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import Image from "next/image";

interface StagePhotoCollageProps {
  placeId: string;
}

interface Photo {
  ref: string;
  width: number | null;
  height: number | null;
}

interface PhotosData {
  placeId: string;
  name: string;
  photos: Photo[];
  debug?: {
    totalPhotosReturned: number;
    placeId: string;
  };
}

type Slot = {
  leftPct: number;
  topPct: number;
  widthPx: number;
  rotateDeg: number;
  z: number;
  aspect: "4/3" | "3/4" | "1/1";
};

const MAX_PHOTOS = 12;

// Hero cluster templates (first 3 photos, centered)
// These form the core of the collage
const TEMPLATE_SMALL: Slot[] = [
  // Slot 0: Hero for 1 photo (or reused as hero for 2-3 photos)
  { leftPct: 50, topPct: 50, widthPx: 480, rotateDeg: 1.5, z: 15, aspect: "4/3" },
  // Slot 1: Second photo for 2 photos (or reused for 3 photos)
  { leftPct: 45, topPct: 52, widthPx: 380, rotateDeg: 3.5, z: 14, aspect: "3/4" },
  // Slot 2: Third photo for 3 photos
  { leftPct: 58, topPct: 48, widthPx: 360, rotateDeg: -3.5, z: 13, aspect: "1/1" },
];

// Medium template (4-8 photos): hero cluster + surrounding ring
const TEMPLATE_MED: Slot[] = [
  // Hero cluster (first 4)
  { leftPct: 50, topPct: 50, widthPx: 480, rotateDeg: -1.5, z: 18, aspect: "4/3" }, // Hero
  { leftPct: 42, topPct: 48, widthPx: 360, rotateDeg: 4.5, z: 17, aspect: "3/4" }, // Left overlap
  { leftPct: 58, topPct: 52, widthPx: 340, rotateDeg: -3.8, z: 16, aspect: "1/1" }, // Right overlap
  { leftPct: 50, topPct: 58, widthPx: 320, rotateDeg: 2.2, z: 15, aspect: "4/3" }, // Bottom overlap
  // Surrounding ring (remaining slots)
  { leftPct: 25, topPct: 30, widthPx: 280, rotateDeg: -8.5, z: 10, aspect: "3/4" }, // Top-left
  { leftPct: 75, topPct: 30, widthPx: 300, rotateDeg: 7.2, z: 11, aspect: "4/3" }, // Top-right
  { leftPct: 80, topPct: 50, widthPx: 260, rotateDeg: -6.8, z: 12, aspect: "1/1" }, // Right
  { leftPct: 75, topPct: 70, widthPx: 290, rotateDeg: 9.5, z: 13, aspect: "3/4" }, // Bottom-right
  { leftPct: 25, topPct: 70, widthPx: 270, rotateDeg: -7.5, z: 12, aspect: "4/3" }, // Bottom-left
  { leftPct: 20, topPct: 50, widthPx: 250, rotateDeg: 8.2, z: 11, aspect: "1/1" }, // Left
];

// Large template (9-12 photos): expanded hero + wider ring
const TEMPLATE_LARGE: Slot[] = [
  // Hero cluster (first 4)
  { leftPct: 50, topPct: 50, widthPx: 520, rotateDeg: -1.2, z: 22, aspect: "4/3" }, // Hero
  { leftPct: 40, topPct: 47, widthPx: 380, rotateDeg: 5.5, z: 21, aspect: "3/4" }, // Left overlap
  { leftPct: 60, topPct: 53, widthPx: 360, rotateDeg: -4.2, z: 20, aspect: "1/1" }, // Right overlap
  { leftPct: 50, topPct: 60, widthPx: 340, rotateDeg: 2.8, z: 19, aspect: "4/3" }, // Bottom overlap
  // Wider surrounding ring
  { leftPct: 20, topPct: 25, widthPx: 280, rotateDeg: -9.5, z: 10, aspect: "3/4" }, // Top-left
  { leftPct: 50, topPct: 20, widthPx: 300, rotateDeg: 1.5, z: 11, aspect: "4/3" }, // Top-center
  { leftPct: 80, topPct: 25, widthPx: 260, rotateDeg: 8.2, z: 12, aspect: "1/1" }, // Top-right
  { leftPct: 85, topPct: 50, widthPx: 290, rotateDeg: -7.8, z: 13, aspect: "3/4" }, // Right
  { leftPct: 80, topPct: 75, widthPx: 270, rotateDeg: 10.5, z: 14, aspect: "4/3" }, // Bottom-right
  { leftPct: 50, topPct: 80, widthPx: 250, rotateDeg: -1.8, z: 13, aspect: "1/1" }, // Bottom-center
  { leftPct: 20, topPct: 75, widthPx: 300, rotateDeg: -8.5, z: 12, aspect: "3/4" }, // Bottom-left
  { leftPct: 15, topPct: 50, widthPx: 240, rotateDeg: 9.2, z: 11, aspect: "4/3" }, // Left
];

/**
 * Get the appropriate template for a given photo count
 */
function getTemplate(count: number): Slot[] {
  if (count <= 0) return [];
  if (count <= 3) return TEMPLATE_SMALL.slice(0, count);
  if (count <= 8) return TEMPLATE_MED.slice(0, count);
  return TEMPLATE_LARGE.slice(0, Math.min(count, MAX_PHOTOS));
}

/**
 * Calculate bounding box of all slots and return centering translation
 */
function calculateCenteringOffset(
  slots: Slot[],
  containerWidth: number,
  containerHeight: number
): { deltaX: number; deltaY: number } {
  if (slots.length === 0) return { deltaX: 0, deltaY: 0 };

  // Get aspect ratio multipliers for calculating frame dimensions
  const aspectMultipliers: Record<string, number> = {
    "4/3": 3 / 4,
    "3/4": 4 / 3,
    "1/1": 1,
  };

  // Calculate bounding box in pixel space
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  slots.forEach((slot) => {
    const leftPx = (slot.leftPct / 100) * containerWidth;
    const topPx = (slot.topPct / 100) * containerHeight;
    const widthPx = slot.widthPx;
    const heightPx = widthPx * aspectMultipliers[slot.aspect];

    // Account for rotation - use bounding box of rotated rectangle
    // For simplicity, we'll use a conservative estimate: diagonal
    const diagonal = Math.sqrt(widthPx * widthPx + heightPx * heightPx);
    const halfDiagonal = diagonal / 2;

    const left = leftPx - halfDiagonal;
    const right = leftPx + halfDiagonal;
    const top = topPx - halfDiagonal;
    const bottom = topPx + halfDiagonal;

    minX = Math.min(minX, left);
    maxX = Math.max(maxX, right);
    minY = Math.min(minY, top);
    maxY = Math.max(maxY, bottom);
  });

  // Calculate center of bounding box
  const bboxCenterX = (minX + maxX) / 2;
  const bboxCenterY = (minY + maxY) / 2;

  // Calculate container center
  const containerCenterX = containerWidth / 2;
  const containerCenterY = containerHeight / 2;

  // Calculate offset needed to center
  const deltaX = containerCenterX - bboxCenterX;
  const deltaY = containerCenterY - bboxCenterY;

  return { deltaX, deltaY };
}

export default function StagePhotoCollage({
  placeId,
}: StagePhotoCollageProps) {
  const [data, setData] = useState<PhotosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [centeringOffset, setCenteringOffset] = useState({ deltaX: 0, deltaY: 0 });
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchPhotos = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/places/photos?placeId=${encodeURIComponent(placeId)}`
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Failed to fetch photos: ${response.status}`
          );
        }

        const photosData: PhotosData = await response.json();
        setData(photosData);
      } catch (err: any) {
        console.error("Error fetching photos:", err);
        setError(err.message || "An unknown error occurred.");
      } finally {
        setLoading(false);
      }
    };

    fetchPhotos();
  }, [placeId]);

  // Calculate centering offset when data or container size changes
  useEffect(() => {
    if (!data || !containerRef.current || data.photos.length === 0) return;

    const photosToShow = data.photos.slice(0, MAX_PHOTOS);
    const slots = getTemplate(photosToShow.length);
    
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    if (containerWidth > 0 && containerHeight > 0) {
      const offset = calculateCenteringOffset(slots, containerWidth, containerHeight);
      setCenteringOffset(offset);
    }
  }, [data]);

  // Handle window resize for centering recalculation
  useEffect(() => {
    if (!data || !containerRef.current) return;

    const handleResize = () => {
      const photosToShow = data.photos.slice(0, MAX_PHOTOS);
      const slots = getTemplate(photosToShow.length);
      
      const containerWidth = containerRef.current?.clientWidth || 0;
      const containerHeight = containerRef.current?.clientHeight || 0;

      if (containerWidth > 0 && containerHeight > 0) {
        const offset = calculateCenteringOffset(slots, containerWidth, containerHeight);
        setCenteringOffset(offset);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [data]);

  // Progressive reveal: show photos one by one, waiting for each image to load
  useEffect(() => {
    if (loading || error || !data || data.photos.length === 0) {
      // Reset visible count and loaded images when loading or no data
      setVisibleCount(0);
      setLoadedImages(new Set());
      return;
    }

    // Reset visible count and loaded images when new data arrives
    setVisibleCount(0);
    setLoadedImages(new Set());

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion) {
      // Show all instantly
      const photosToShow = data.photos.slice(0, MAX_PHOTOS);
      setVisibleCount(photosToShow.length);
      return;
    }

    // Start with first image visible (it will load and trigger the next)
    setVisibleCount(1);
  }, [loading, error, data]);

  // Handle progressive reveal based on image loads
  useEffect(() => {
    if (loading || error || !data || data.photos.length === 0) return;
    if (visibleCount === 0) return;

    const photosToShow = data.photos.slice(0, MAX_PHOTOS);
    
    // If current visible image has loaded and there are more images, show the next one
    if (loadedImages.has(visibleCount - 1) && visibleCount < photosToShow.length) {
      // Wait a bit before showing next (250ms delay for smooth animation)
      const timer = setTimeout(() => {
        setVisibleCount(prev => prev + 1);
      }, 250);
      
      return () => clearTimeout(timer);
    }
  }, [loadedImages, visibleCount, loading, error, data]);

  if (loading) {
    return (
      <div className="relative w-full h-full min-h-[600px] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 text-sm">Scanning photos…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="relative w-full h-full min-h-[600px] flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <p className="text-red-600 font-medium mb-2">Error</p>
          <p className="text-gray-600 text-sm">
            {error || "Failed to load photos"}
          </p>
        </div>
      </div>
    );
  }

  if (data.photos.length === 0) {
    return (
      <div className="relative w-full h-full min-h-[600px] flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <p className="text-gray-600 text-sm">No photos found for this business</p>
        </div>
      </div>
    );
  }

  // Cap at MAX_PHOTOS
  const photosToShow = data.photos.slice(0, MAX_PHOTOS);
  const slots = getTemplate(photosToShow.length);

  // Create an array of indices sorted by z-index (ascending - back to front)
  const sortedIndices = slots
    .map((slot, index) => ({ index, z: slot.z }))
    .sort((a, b) => a.z - b.z)
    .map(item => item.index);

  // Create a reverse mapping: for each original index, find its position in the sorted order
  const revealOrder = new Map<number, number>();
  sortedIndices.forEach((originalIndex, revealIndex) => {
    revealOrder.set(originalIndex, revealIndex);
  });

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full min-h-[600px] overflow-hidden isolate"
    >
      {/* Full-size canvas for absolute positioning with centering transform */}
      <div 
        className="absolute inset-0 min-h-[600px]"
      style={{
        transform: `translate(${centeringOffset.deltaX}px, ${centeringOffset.deltaY}px)`,
      }}
      >
        {photosToShow.map((photo, index) => {
          const slot = slots[index];
          if (!slot) return null;

          // Get the reveal order position for this image (back to front)
          const revealPosition = revealOrder.get(index) ?? index;
          const isVisible = revealPosition < visibleCount;
          const photoUrl = `/api/places/photo?ref=${encodeURIComponent(photo.ref)}&maxw=1400`;

          return (
            <div
              key={photo.ref}
              className="absolute transition-all duration-500 ease-out"
              style={{
                left: `${slot.leftPct}%`,
                top: `${slot.topPct}%`,
                transform: `translate(-50%, calc(-50% + ${isVisible ? '0px' : '10px'})) rotate(${slot.rotateDeg}deg) scale(${isVisible ? 1 : 0.98})`,
                zIndex: slot.z,
                width: `${slot.widthPx}px`,
                opacity: isVisible ? 1 : 0,
                transformOrigin: 'center center',
              }}
            >
              {/* Polaroid frame */}
              <div className="w-full bg-white rounded-lg shadow-lg border border-black/5 overflow-hidden">
                {/* Image container with padding (mat effect) */}
                <div 
                  className="relative bg-gray-50"
                  style={{
                    paddingTop: '8px',
                    paddingLeft: '8px',
                    paddingRight: '8px',
                    paddingBottom: '12px', // Thicker bottom padding for polaroid look
                  }}
                >
                  <div 
                    className="relative w-full rounded overflow-hidden" 
                    style={{ aspectRatio: slot.aspect }}
                  >
                    <Image
                      src={photoUrl}
                      alt={`Photo ${index + 1} of ${data.name}`}
                      fill
                      className="object-cover"
                      unoptimized
                      onError={(e) => {
                        // Hide broken images
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
