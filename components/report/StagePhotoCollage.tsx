"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Loader2 } from "lucide-react";
import Image from "next/image";

interface StagePhotoCollageProps {
  placeId: string;
  scanId?: string;
  onComplete?: () => void;
}

interface Photo {
  /** Direct image URL from New Places API (v1) media endpoint; preferred. */
  uri?: string;
  /** Legacy photo_reference; used when uri is not present (e.g. cached data). */
  ref?: string;
  width: number | null;
  height: number | null;
  name?: string;
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
  angleRad?: number; // For reveal ordering and debugging
};

const MAX_PHOTOS = 12;
const HERO_COUNT = 4; // First 4 slots are always hero cluster

// Ring configuration constants
const RING_CONFIG = {
  MED: {
    centerXPct: 48, // Slightly left of center to match hero cluster shift
    centerYPct: 50,
    radiusXPct: 40, // Horizontal radius (increased from 32)
    radiusYPct: 42, // Vertical radius (increased from 34, slightly larger for ellipse)
    minWidth: 320,
    maxWidth: 400,
    baseZ: 10,
  },
  LARGE: {
    centerXPct: 49, // Slightly left of center
    centerYPct: 50,
    radiusXPct: 45, // Larger radius for LARGE template (increased from 38)
    radiusYPct: 47, // Vertical radius (increased from 40)
    minWidth: 340,
    maxWidth: 420,
    baseZ: 10,
  },
};

// Rotation pattern for variety (deterministic based on index)
const ROTATION_PATTERNS = [-8.5, 7.2, -6.8, 9.5, -1.8, -7.5, 8.2, -1.5];
// Aspect pattern for variety
const ASPECT_PATTERNS: Array<"4/3" | "3/4" | "1/1"> = ["4/3", "3/4", "1/1", "3/4", "4/3", "3/4", "1/1", "4/3"];

// Hero cluster templates (first 3 photos, centered)
// These form the core of the collage
const TEMPLATE_SMALL: Slot[] = [
  // Slot 0: Hero for 1 photo (or reused as hero for 2-3 photos)
  { leftPct: 50, topPct: 50, widthPx: 560, rotateDeg: 1.5, z: 15, aspect: "4/3" },
  // Slot 1: Second photo for 2 photos (or reused for 3 photos)
  { leftPct: 45, topPct: 52, widthPx: 440, rotateDeg: 3.5, z: 14, aspect: "3/4" },
  // Slot 2: Third photo for 3 photos
  { leftPct: 58, topPct: 48, widthPx: 420, rotateDeg: -3.5, z: 13, aspect: "1/1" },
];

// Hero cluster templates (fixed, never change)
// Z-index values must be higher than max edge z-index (baseZ + 7 = 17)
const HERO_CLUSTER_MED: Slot[] = [
  { leftPct: 45, topPct: 45, widthPx: 560, rotateDeg: -1.5, z: 22, aspect: "4/3" }, // Hero (shifted left)
  { leftPct: 35, topPct: 43, widthPx: 420, rotateDeg: 4.5, z: 21, aspect: "3/4" }, // Left overlap
  { leftPct: 58, topPct: 48, widthPx: 400, rotateDeg: -3.8, z: 20, aspect: "1/1" }, // Right overlap
  { leftPct: 45, topPct: 55, widthPx: 380, rotateDeg: 2.2, z: 19, aspect: "4/3" }, // Bottom overlap
];

const HERO_CLUSTER_LARGE: Slot[] = [
  { leftPct: 45, topPct: 45, widthPx: 600, rotateDeg: -1.2, z: 22, aspect: "4/3" }, // Hero (shifted left)
  { leftPct: 32, topPct: 42, widthPx: 440, rotateDeg: 5.5, z: 21, aspect: "3/4" }, // Left overlap
  { leftPct: 60, topPct: 48, widthPx: 420, rotateDeg: -4.2, z: 20, aspect: "1/1" }, // Right overlap
  { leftPct: 45, topPct: 58, widthPx: 400, rotateDeg: 2.8, z: 19, aspect: "4/3" }, // Bottom overlap
];

/**
 * Generate dynamic ring slots with even angular spacing
 * @param edgeCount Number of edge photos (0-8)
 * @param variant 'MED' or 'LARGE' for size configuration
 * @returns Array of Slot objects positioned evenly around a circle
 */
function generateRingSlots(edgeCount: number, variant: 'MED' | 'LARGE'): Slot[] {
  if (edgeCount <= 0) return [];
  
  const config = RING_CONFIG[variant];
  const slots: Slot[] = [];
  
  // Start angle: -π/2 (12 o'clock / top)
  const startAngle = -Math.PI / 2;
  // Step angle: evenly distribute around full circle
  const stepAngle = (2 * Math.PI) / edgeCount;
  
  for (let i = 0; i < edgeCount; i++) {
    // Calculate angle for this slot (clockwise from top)
    const theta = startAngle + i * stepAngle;
    
    // Calculate position using ellipse (slight vertical stretch)
    const leftPct = config.centerXPct + config.radiusXPct * Math.cos(theta);
    let topPct = config.centerYPct + config.radiusYPct * Math.sin(theta);
    
    // Shift the 6 o'clock position (bottom) up a bit
    // 6 o'clock is at angle π/2 (90 degrees)
    const sixOClockAngle = Math.PI / 2;
    if (Math.abs(theta - sixOClockAngle) < 0.1 || Math.abs(theta - sixOClockAngle + 2 * Math.PI) < 0.1) {
      topPct -= 22; // Shift up by 22 percentage points
    }
    
    // Shift the 12 o'clock position (top) down a bit
    // 12 o'clock is at angle -π/2 (270 degrees or -90 degrees)
    const twelveOClockAngle = -Math.PI / 2;
    if (Math.abs(theta - twelveOClockAngle) < 0.1 || Math.abs(theta - twelveOClockAngle + 2 * Math.PI) < 0.1) {
      topPct += 8; // Shift down by 8 percentage points
    }
    
    // Vary width slightly for visual interest (deterministic)
    const widthVariation = (i % 3) * 20; // 0, 20, 40
    const widthPx = config.minWidth + widthVariation;
    
    // Use rotation pattern (cycle through)
    const rotateDeg = ROTATION_PATTERNS[i % ROTATION_PATTERNS.length];
    
    // Z-index increases slightly for layering
    const z = config.baseZ + i;
    
    // Use aspect pattern (cycle through)
    const aspect = ASPECT_PATTERNS[i % ASPECT_PATTERNS.length];
    
    slots.push({
      leftPct,
      topPct,
      widthPx,
      rotateDeg,
      z,
      aspect,
      angleRad: theta, // Store for reveal ordering
    });
  }
  
  return slots;
}

/**
 * Get the appropriate template for a given photo count
 * For 1-3 photos: use TEMPLATE_SMALL (centered cluster)
 * For 4+ photos: use fixed hero cluster + dynamic ring
 */
function getTemplate(count: number): Slot[] {
  if (count <= 0) return [];
  if (count <= 3) return TEMPLATE_SMALL.slice(0, count);
  
  // For 4+ photos: hero cluster + dynamic ring
  const edgeCount = Math.min(count - HERO_COUNT, 8); // Max 8 edge slots
  
  // Choose variant based on count (MED for 4-10, LARGE for 9-12)
  const variant: 'MED' | 'LARGE' = count <= 10 ? 'MED' : 'LARGE';
  const heroCluster = variant === 'MED' ? HERO_CLUSTER_MED : HERO_CLUSTER_LARGE;
  const ringSlots = generateRingSlots(edgeCount, variant);
  
  // Combine: hero cluster first, then ring slots
  return [...heroCluster, ...ringSlots];
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
  scanId,
  onComplete,
}: StagePhotoCollageProps) {
  const [data, setData] = useState<PhotosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [centeringOffset, setCenteringOffset] = useState({ deltaX: 0, deltaY: 0 });
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  // Displayable photos only (uri from New API or ref for legacy/cache); used for layout and effects
  const photosToShow = useMemo(
    () =>
      data
        ? data.photos
            .filter((p) => p.uri || p.ref)
            .slice(0, MAX_PHOTOS)
        : [],
    [data]
  );

  useEffect(() => {
    const fetchPhotos = async () => {
      setLoading(true);
      setError(null);
      
      // First, check if data was pre-loaded in localStorage
      if (scanId) {
        try {
          const cachedData = localStorage.getItem(`photos_${scanId}`);
          if (cachedData) {
            const photosData: PhotosData = JSON.parse(cachedData);
            
            // Validate cached data
            if (photosData.photos && Array.isArray(photosData.photos)) {
              console.log("[photos] Using pre-loaded data from localStorage");
              setData(photosData);
              setLoading(false);
              return;
            }
          }
        } catch (e) {
          console.warn("[photos] Failed to parse cached data, fetching fresh:", e);
        }
      }
      
      // If no cached data, fetch from API
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
        
        // Store in localStorage for future use
        if (scanId) {
          localStorage.setItem(`photos_${scanId}`, JSON.stringify(photosData));
        }
      } catch (err: any) {
        console.error("Error fetching photos:", err);
        setError(err.message || "An unknown error occurred.");
      } finally {
        setLoading(false);
      }
    };

    fetchPhotos();
  }, [placeId, scanId]);

  // Calculate centering offset when data or container size changes
  useEffect(() => {
    if (!data || !containerRef.current || photosToShow.length === 0) return;

    const slots = getTemplate(photosToShow.length);
    
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    if (containerWidth > 0 && containerHeight > 0) {
      const offset = calculateCenteringOffset(slots, containerWidth, containerHeight);
      // Shift the entire canvas vertically
      const verticalShift = -40; // Negative value shifts down
      setCenteringOffset({
        deltaX: offset.deltaX,
        deltaY: offset.deltaY - verticalShift,
      });
    }
  }, [data]);

  // Handle window resize for centering recalculation
  useEffect(() => {
    if (!data || !containerRef.current) return;

    const handleResize = () => {
      const slots = getTemplate(photosToShow.length);
      
      const containerWidth = containerRef.current?.clientWidth || 0;
      const containerHeight = containerRef.current?.clientHeight || 0;

      if (containerWidth > 0 && containerHeight > 0) {
        const offset = calculateCenteringOffset(slots, containerWidth, containerHeight);
        // Shift the entire canvas vertically
        const verticalShift = -40; // Negative value shifts down
        setCenteringOffset({
          deltaX: offset.deltaX,
          deltaY: offset.deltaY - verticalShift,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [data, photosToShow]);

  // Progressive reveal: show photos one by one, waiting for each image to load
  useEffect(() => {
    if (loading || error || !data || photosToShow.length === 0) {
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
      setVisibleCount(photosToShow.length);
      return;
    }

    // Start with first image visible (it will load and trigger the next)
    setVisibleCount(1);
  }, [loading, error, data, photosToShow]);

  // Handle progressive reveal based on image loads
  useEffect(() => {
    if (loading || error || !data || photosToShow.length === 0) return;
    if (visibleCount === 0) return;

    // If current visible image has loaded and there are more images, show the next one
    if (loadedImages.has(visibleCount - 1) && visibleCount < photosToShow.length) {
      // Wait 2 seconds before showing next image
      const timer = setTimeout(() => {
        setVisibleCount(prev => prev + 1);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [loadedImages, visibleCount, loading, error, data, photosToShow]);

  // Auto-advance to next stage after all images have loaded and 3 seconds have passed
  useEffect(() => {
    if (loading || error || !data || photosToShow.length === 0 || !onComplete) return;
    
    const totalPhotos = photosToShow.length;
    
    // Check if all images are visible and the last one has loaded
    const allVisible = visibleCount === totalPhotos;
    const lastImageLoaded = totalPhotos > 0 && loadedImages.has(totalPhotos - 1);
    
    if (allVisible && lastImageLoaded) {
      // Wait 3 seconds after the last image loads, then auto-advance
      const timer = setTimeout(() => {
        onComplete();
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [visibleCount, loadedImages, loading, error, data, photosToShow, onComplete]);

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

  if (photosToShow.length === 0) {
    return (
      <div className="relative w-full h-full min-h-[600px] flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <p className="text-gray-600 text-sm">No photos found for this business</p>
        </div>
      </div>
    );
  }

  const slots = getTemplate(photosToShow.length);
  
  // Determine variant for debug overlay
  const variant: 'MED' | 'LARGE' = photosToShow.length <= 10 ? 'MED' : 'LARGE';
  const edgeCount = Math.min(photosToShow.length - HERO_COUNT, 8);

  // Separate slots into edge (surrounding ring) and center (hero cluster)
  // Hero cluster is always the first HERO_COUNT slots (indices 0-3)
  // Edge slots are the remaining slots (indices HERO_COUNT+)
  const edgeSlots: Array<{ index: number; slot: Slot; angle: number }> = [];
  const centerSlots: Array<{ index: number; slot: Slot }> = [];

  slots.forEach((slot, index) => {
    // First HERO_COUNT slots are center (hero cluster), rest are edge (surrounding ring)
    if (index < HERO_COUNT) {
      centerSlots.push({ index, slot });
    } else {
      // Use stored angleRad if available (from dynamic generation), otherwise calculate
      const angle = slot.angleRad !== undefined 
        ? slot.angleRad < 0 ? slot.angleRad + 2 * Math.PI : slot.angleRad
        : (() => {
            // Fallback: calculate angle from position
            const centerX = 50;
            const centerY = 50;
            const dx = slot.leftPct - centerX;
            const dy = slot.topPct - centerY;
            let angle = Math.atan2(dx, -dy);
            if (angle < 0) angle += 2 * Math.PI;
            return angle;
          })();
      edgeSlots.push({ index, slot, angle });
    }
  });

  // Sort edge slots by angle to ensure they're in circular order
  edgeSlots.sort((a, b) => a.angle - b.angle);
  
  // Create circular reveal order: start at random point, proceed around circle
  const revealOrder = new Map<number, number>();
  const zIndexMap = new Map<number, number>();
  const baseZ = 10; // Starting z-index
  let revealIndex = 0;
  
  // Random starting point and direction for circular pattern (deterministic based on photo count)
  const seed = photosToShow.length;
  const startOffset = (seed * 7 + 13) % edgeSlots.length; // Random starting edge slot
  const clockwise = (seed * 3) % 2 === 0; // Random direction (clockwise or counterclockwise)
  
  // Reveal edge slots in circular order (starting from random point)
  const edgeOrder: Array<{ index: number; slot: Slot }> = [];
  for (let i = 0; i < edgeSlots.length; i++) {
    const actualIndex = clockwise 
      ? (startOffset + i) % edgeSlots.length
      : (startOffset - i + edgeSlots.length) % edgeSlots.length;
    edgeOrder.push(edgeSlots[actualIndex]);
  }
  
  // Reveal edge slots in circular order
  edgeOrder.forEach(({ index }) => {
    revealOrder.set(index, revealIndex);
    zIndexMap.set(index, baseZ + revealIndex);
    revealIndex++;
  });
  
  // Randomly order center slots (deterministic shuffle)
  const centerIndices = centerSlots.map(({ index }) => index);
  for (let i = centerIndices.length - 1; i > 0; i--) {
    const j = (seed * (i + 1) * 19 + i * 31) % (i + 1);
    [centerIndices[i], centerIndices[j]] = [centerIndices[j], centerIndices[i]];
  }
  
  // Reveal center slots in random order
  centerIndices.forEach((index) => {
    revealOrder.set(index, revealIndex);
    zIndexMap.set(index, baseZ + revealIndex);
    revealIndex++;
  });

  // Update slot z-index values based on reveal order
  slots.forEach((slot, index) => {
    if (zIndexMap.has(index)) {
      slot.z = zIndexMap.get(index)!;
    }
  });

  // Debug overlay disabled
  const showDebugOverlay = false;
  const ringConfig = RING_CONFIG[variant];

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full min-h-[600px] overflow-hidden isolate"
    >
      {/* Debug overlay (dev only) */}
      {showDebugOverlay && containerRef.current && (
        <div 
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            transform: `translate(${centeringOffset.deltaX}px, ${centeringOffset.deltaY}px)`,
          }}
        >
          {/* Container center */}
          <div
            className="absolute w-2 h-2 bg-red-500 rounded-full"
            style={{
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
            }}
            title="Container Center"
          />
          {/* Ring ellipse */}
          <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.2 }}>
            <ellipse
              cx={`${ringConfig.centerXPct}%`}
              cy={`${ringConfig.centerYPct}%`}
              rx={`${ringConfig.radiusXPct}%`}
              ry={`${ringConfig.radiusYPct}%`}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeDasharray="5,5"
            />
          </svg>
          {/* Slot anchor points */}
          {edgeSlots.map(({ index, slot }, i) => (
            <div
              key={`debug-${index}`}
              className="absolute w-3 h-3 bg-blue-500 rounded-full border-2 border-white"
              style={{
                left: `${slot.leftPct}%`,
                top: `${slot.topPct}%`,
                transform: 'translate(-50%, -50%)',
              }}
              title={`Edge ${i + 1}: ${((slot.angleRad || 0) * 180 / Math.PI).toFixed(1)}°`}
            />
          ))}
        </div>
      )}
      
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
          // Prefer direct URI from New API (1 request per image); fallback to legacy proxy for cached ref-only data
          const photoUrl = photo.uri
            ? photo.uri
            : typeof window !== "undefined" && window.location.hostname === "localhost"
              ? `${window.location.origin}/api/places/photo?ref=${encodeURIComponent(photo.ref ?? "")}&maxw=1400`
              : `/api/places/photo?ref=${encodeURIComponent(photo.ref ?? "")}&maxw=1400`;

          return (
            <div
              key={photo.uri ?? photo.ref ?? index}
              className="absolute transition-[opacity,transform] duration-[600ms] ease-out will-change-[opacity,transform]"
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
                      priority={index < 3} // Prioritize first 3 images
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      onLoad={() => {
                        // Mark this image as loaded - use revealPosition to track by reveal order
                        const revealPosition = revealOrder.get(index) ?? index;
                        setLoadedImages(prev => new Set(prev).add(revealPosition));
                      }}
                      onError={(e) => {
                        console.error(`Failed to load photo ${index + 1}:`, photoUrl);
                        // Hide broken images, but still mark as "loaded" so animation continues
                        const target = e.target as HTMLImageElement;
                        if (target) {
                          target.style.display = 'none';
                        }
                        const revealPosition = revealOrder.get(index) ?? index;
                        setLoadedImages(prev => new Set(prev).add(revealPosition));
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
