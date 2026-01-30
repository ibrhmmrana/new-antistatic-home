"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useJsApiLoader, GoogleMap } from "@react-google-maps/api";
import { Loader2 } from "lucide-react";

interface StageCompetitorMapProps {
  placeId: string;
  name: string;
  scanId?: string;
  onComplete?: () => void;
}

interface TargetPlace {
  place_id: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
}

interface Competitor {
  place_id: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  rating?: number;
  user_rating_total?: number;
}

interface CompetitorsData {
  target: TargetPlace;
  competitors: Competitor[];
  debug?: any;
}

const libraries: ("places")[] = ["places"];
const MIN_COMPETITORS = 3;
/** Minimum time (ms) to show the stage before advancing so the user can see the map and pins. */
const MIN_STAGE_DISPLAY_MS = 4000;

export default function StageCompetitorMap({
  placeId,
  name,
  scanId,
  onComplete,
}: StageCompetitorMapProps) {
  const [data, setData] = useState<CompetitorsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [competitorsVisible, setCompetitorsVisible] = useState<Competitor[]>(
    []
  );
  const [status, setStatus] = useState<
    "loading" | "finding" | "plotting" | "complete"
  >("loading");
  const [displayedName, setDisplayedName] = useState("");
  const textMeasureRef = useRef<HTMLSpanElement>(null);
  const [textWidth, setTextWidth] = useState(0);
  const [fullDisplayText, setFullDisplayText] = useState("");
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const boundsRef = useRef<google.maps.LatLngBounds | null>(null);
  const fitBoundsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fitBoundsCounterRef = useRef(0);
  const businessMarkerRef = useRef<google.maps.Marker | null>(null);
  const competitorMarkersRef = useRef<google.maps.Marker[]>([]);
  const competitorInfoWindowsRef = useRef<google.maps.OverlayView[]>([]);
  const mapInitializedRef = useRef(false);
  const onCompleteCalledRef = useRef(false);
  /** When we first had data (so we can enforce minimum display time before advancing). */
  const stageReadyAtRef = useRef<number | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries,
  });

  // Fit bounds with padding
  const applyFitBounds = useCallback((mapInstance: google.maps.Map, bounds: google.maps.LatLngBounds, padding = 80) => {
    mapInstance.fitBounds(bounds, {
      top: padding,
      right: padding,
      bottom: padding,
      left: padding,
    });
  }, []);

  // Focus on business + a single competitor (for each new competitor appearance)
  // Uses large padding to ensure both markers are within the center ~20% of the screen
  const focusOnBusinessAndCompetitor = useCallback((mapInstance: google.maps.Map, competitorLocation: { lat: number; lng: number }) => {
    if (!data?.target?.location) return;
    
    const focusBounds = new google.maps.LatLngBounds();
    const businessLatLng = new google.maps.LatLng(data.target.location.lat, data.target.location.lng);
    const competitorLatLng = new google.maps.LatLng(competitorLocation.lat, competitorLocation.lng);
    
    focusBounds.extend(businessLatLng);
    focusBounds.extend(competitorLatLng);
    
    // Get map container dimensions to calculate percentage-based padding
    const mapDiv = mapInstance.getDiv();
    const width = mapDiv?.offsetWidth || 800;
    const height = mapDiv?.offsetHeight || 600;
    
    // To keep markers within center ~20% of screen, we need ~40% padding on each side
    // This ensures both markers are comfortably within the center viewing area
    const horizontalPadding = Math.round(width * 0.35); // 35% padding on left and right
    const verticalPadding = Math.round(height * 0.35);   // 35% padding on top and bottom
    
    mapInstance.fitBounds(focusBounds, {
      top: verticalPadding,
      right: horizontalPadding,
      bottom: verticalPadding,
      left: horizontalPadding,
    });
  }, [data?.target?.location]);

  // Initialize map
  const onMapLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
    boundsRef.current = new google.maps.LatLngBounds();
  }, []);

  // Fetch competitors data (check localStorage first if pre-loaded)
  useEffect(() => {
    if (!isLoaded) return;

    const fetchCompetitors = async () => {
      // First, check if data was pre-loaded in localStorage
      if (scanId) {
        try {
          const cachedData = localStorage.getItem(`competitors_${scanId}`);
          if (cachedData) {
            const competitorsData: CompetitorsData = JSON.parse(cachedData);
            
            // Validate cached data
            if (competitorsData.target?.location && competitorsData.competitors) {
              console.log("[competitors] Using pre-loaded data from localStorage");
              stageReadyAtRef.current = Date.now();
              setData(competitorsData);
              // Set status to "plotting" to skip loading screen and start showing competitors
              // The map initialization effect will handle the rest
              setStatus("plotting");
              return;
            }
          }
        } catch (e) {
          console.warn("[competitors] Failed to parse cached data, fetching fresh:", e);
        }
      }
      
      // If no cached data, fetch from API
      setStatus("finding");
      setError(null);
      try {
        const response = await fetch(
          `/api/places/competitors?placeId=${encodeURIComponent(placeId)}`
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Failed to fetch competitors: ${response.status}`
          );
        }

        const competitorsData: CompetitorsData = await response.json();

        // Log debug info in development
        if (competitorsData.debug && process.env.NODE_ENV !== "production") {
          console.log("[competitors] API response debug:", competitorsData.debug);
        }

        if (!competitorsData.target?.location) {
          throw new Error("Target location not found in response");
        }

        // Store in localStorage for future use
        if (scanId) {
          localStorage.setItem(`competitors_${scanId}`, JSON.stringify(competitorsData));
        }

        stageReadyAtRef.current = Date.now();
        setData(competitorsData);
      } catch (err: any) {
        console.error("Error fetching competitors:", err);
        setError(err.message || "Failed to load competitors");
        setStatus("complete");
      }
    };

    fetchCompetitors();
  }, [isLoaded, placeId, scanId]);

  // Extract suburb from address
  const extractSuburb = (address: string): string => {
    if (!address) return "";
    
    // Split by comma and get parts
    const parts = address.split(",").map((p) => p.trim());
    
    // Usually suburb is the second-to-last part (before country/state)
    // Or the first part after street address
    if (parts.length >= 2) {
      // Try second-to-last (before country/state)
      const suburb = parts[parts.length - 2];
      // If it looks like a state/province (short, uppercase), try the one before
      if (suburb.length <= 3 || suburb === suburb.toUpperCase()) {
        return parts.length >= 3 ? parts[parts.length - 3] : suburb;
      }
      return suburb;
    }
    
    // Fallback: return first part if only one part
    return parts[0] || "";
  };

  // Typing animation for business name with suburb
  useEffect(() => {
    if (!data?.target?.name) {
      setDisplayedName("");
      setFullDisplayText("");
      setIsTypingComplete(false);
      return;
    }

    const suburb = extractSuburb(data.target.address);
    const fullText = suburb 
      ? `${data.target.name} in ${suburb}`
      : data.target.name;
    
    setFullDisplayText(fullText);
    setDisplayedName("");
    let currentIndex = 0;

    const typeInterval = setInterval(() => {
      if (currentIndex < fullText.length) {
        setDisplayedName(fullText.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        clearInterval(typeInterval);
        setIsTypingComplete(true);
      }
    }, 100); // 100ms per character (slower)

    return () => clearInterval(typeInterval);
  }, [data?.target?.name, data?.target?.address]);

  // Measure text width for accurate cursor positioning
  useEffect(() => {
    if (textMeasureRef.current) {
      setTextWidth(textMeasureRef.current.offsetWidth);
    }
  }, [displayedName]);

  // Initialize map center and place target marker when data is available
  useEffect(() => {
    if (!data || !map || mapInitializedRef.current) return;

    const target = data.target;
    const targetLatLng = new google.maps.LatLng(
      target.location.lat,
      target.location.lng
    );

    // Center map on target with higher initial zoom
    map.panTo(targetLatLng);
    map.setZoom(17);

    // Create custom icon with Google Maps pin inside circle
    const iconSvg = `
      <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="14" fill="#000000" stroke="#ffffff" stroke-width="2"/>
        <path d="M16 8C12.13 8 9 11.13 9 15C9 19.5 16 24 16 24C16 24 23 19.5 23 15C23 11.13 19.87 8 16 8ZM16 17.5C14.62 17.5 13.5 16.38 13.5 15C13.5 13.62 14.62 12.5 16 12.5C17.38 12.5 18.5 13.62 18.5 15C18.5 16.38 17.38 17.5 16 17.5Z" fill="#ffffff"/>
      </svg>
    `;
    
    const iconUrl = 'data:image/svg+xml;base64,' + btoa(iconSvg);

    // Place target marker
    const marker = new google.maps.Marker({
      position: targetLatLng,
      map,
      title: target.name,
      icon: {
        url: iconUrl,
        scaledSize: new google.maps.Size(32, 32),
        anchor: new google.maps.Point(16, 16),
      },
      zIndex: 1000,
    });

    businessMarkerRef.current = marker;

    // Initialize bounds with target
    if (boundsRef.current) {
      boundsRef.current.extend(targetLatLng);
    }

    mapInitializedRef.current = true;

    // Start plotting competitors
    if (data.competitors.length > 0) {
      setStatus("plotting");
    } else {
      setStatus("complete");
    }
  }, [data, map]);

  // Sequential pin drop for competitors
  useEffect(() => {
    if (
      !data ||
      !map ||
      !mapInitializedRef.current ||
      status !== "plotting" ||
      competitorsVisible.length >= data.competitors.length
    ) {
      if (competitorsVisible.length === data?.competitors.length) {
        setStatus("complete");
        // Final fitBounds to keep all markers (business + competitors) visible
        if (boundsRef.current && map) {
          applyFitBounds(map, boundsRef.current);
        }
        // Call onComplete after minimum display time so the stage isn't a split-second flash
        if (data.competitors.length === 0 && !onCompleteCalledRef.current) {
          onCompleteCalledRef.current = true;
          const elapsed = stageReadyAtRef.current != null ? Date.now() - stageReadyAtRef.current : 0;
          const delay = Math.max(500, MIN_STAGE_DISPLAY_MS - elapsed);
          setTimeout(() => onComplete?.(), delay);
        }
      }
      return;
    }

    const currentIndex = competitorsVisible.length;
    const competitor = data.competitors[currentIndex];
    if (!competitor) return;

    // Slow down competitor appearance cadence: 1600-2400ms
    const dropDelay = 1600 + Math.random() * 800;

    const timer = setTimeout(() => {
      setCompetitorsVisible((prev) => {
        const updated = [...prev, competitor];

        // Create marker with drop animation
        const marker = new google.maps.Marker({
          position: competitor.location,
          map,
          title: competitor.name,
          // Remove drop animation; use fade-in via opacity
          animation: undefined,
          opacity: 0,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: "#ef4444",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });
        // Fade-in effect
        setTimeout(() => {
          marker.setOpacity(1);
        }, 50);

        competitorMarkersRef.current.push(marker);

        // Only show 3 badges at a time - remove oldest if we have 3
        if (competitorInfoWindowsRef.current.length >= 3) {
          const oldestOverlay = competitorInfoWindowsRef.current.shift();
          if (oldestOverlay && typeof oldestOverlay.setMap === 'function') {
            oldestOverlay.setMap(null);
          }
        }

        // Create custom "Competitor" badge with tail pointing down
        class BadgeOverlay extends google.maps.OverlayView {
          private position: google.maps.LatLng;
          private div: HTMLDivElement;

          constructor(position: google.maps.LatLng) {
            super();
            this.position = position;
            this.div = document.createElement('div');
            this.div.style.cssText = `
              position: absolute;
              pointer-events: none;
            `;
            
            // Create badge with tail pointing down and fade-in animation
            this.div.innerHTML = `
              <style>
                @keyframes badgeFadeIn {
                  from {
                    opacity: 0;
                    transform: translateX(-50%) translateY(10px) scale(0.9);
                  }
                  to {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0) scale(1);
                  }
                }
                .badge-container {
                  animation: badgeFadeIn 0.4s ease-out forwards;
                  opacity: 0;
                }
              </style>
              <div class="badge-container" style="
                position: relative;
                background: white;
                padding: 4px 10px;
                border-radius: 6px;
                font-weight: 600;
                font-size: 12px;
                color: #000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                white-space: nowrap;
                box-shadow: 0 2px 4px rgba(0,0,0,0.15);
              ">Competitor</div>
              <div style="
                position: absolute;
                bottom: -6px;
                left: 50%;
                transform: translateX(-50%);
                width: 0;
                height: 0;
                border-left: 6px solid transparent;
                border-right: 6px solid transparent;
                border-top: 6px solid white;
                filter: drop-shadow(0 2px 2px rgba(0,0,0,0.1));
              "></div>
            `;
          }

          onAdd() {
            const panes = this.getPanes();
            if (panes) {
              panes.overlayMouseTarget.appendChild(this.div);
            }
          }

          draw() {
            const overlayProjection = this.getProjection();
            const position = overlayProjection.fromLatLngToDivPixel(this.position);
            if (position) {
              // Position badge centered above the marker
              // For CIRCLE symbols with scale 10, the circle is 20px diameter
              // The marker's anchor is at the center by default
              // Position badge centered horizontally and ~35px above marker center
              this.div.style.left = position.x + 'px';
              this.div.style.top = (position.y - 35) + 'px';
              // Ensure the badge container itself is centered
              this.div.style.transform = 'translateX(-50%)';
            }
          }

          onRemove() {
            if (this.div.parentNode) {
              this.div.parentNode.removeChild(this.div);
            }
          }
        }

        const badgeOverlay = new BadgeOverlay(
          new google.maps.LatLng(competitor.location.lat, competitor.location.lng)
        );
        badgeOverlay.setMap(map);
        competitorInfoWindowsRef.current.push(badgeOverlay as any);

        // Extend the full bounds (for final view)
        if (boundsRef.current) {
          boundsRef.current.extend(competitor.location);
        }
        
        const isLast = updated.length === data.competitors.length;
        
        // Focus map on business + this new competitor (so both are visible and centered)
        if (map) {
          if (isLast) {
            // On last competitor, fit to all bounds so user sees the full picture
            if (boundsRef.current) {
              applyFitBounds(map, boundsRef.current);
            }
          } else {
            // For each new competitor, focus on just business + this competitor
            focusOnBusinessAndCompetitor(map, competitor.location);
          }
        }
        
        // If this is the last competitor, call onComplete after minimum display time
        if (isLast && !onCompleteCalledRef.current) {
          onCompleteCalledRef.current = true;
          const elapsed = stageReadyAtRef.current != null ? Date.now() - stageReadyAtRef.current : 0;
          const delay = Math.max(500, MIN_STAGE_DISPLAY_MS - elapsed);
          setTimeout(() => onComplete?.(), delay);
        }

        return updated;
      });
    }, dropDelay);

    return () => clearTimeout(timer);
  }, [data, map, status, competitorsVisible, applyFitBounds, focusOnBusinessAndCompetitor, onComplete]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (fitBoundsTimeoutRef.current) {
        clearTimeout(fitBoundsTimeoutRef.current);
      }
      if (businessMarkerRef.current) {
        businessMarkerRef.current.setMap(null);
      }
      competitorMarkersRef.current.forEach((marker) => {
        marker.setMap(null);
      });
      competitorInfoWindowsRef.current.forEach((overlay) => {
        if (overlay && typeof overlay.setMap === 'function') {
          overlay.setMap(null);
        }
      });
    };
  }, []);

  if (loadError) {
    return (
      <div className="w-full h-full bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
        <div className="text-center text-red-600">
          <p>Error loading Google Maps</p>
        </div>
      </div>
    );
  }

  // Show error if API failed
  if (error) {
    return (
      <div className="w-full h-full bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <p className="text-red-600 font-medium mb-2">Error</p>
          <p className="text-gray-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  // Show skeleton only if map is not loaded
  if (!isLoaded) {
    return (
      <div className="w-full h-full bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Loading map...</p>
        </div>
      </div>
    );
  }
  
  // If we don't have data yet and we're not already plotting (i.e., data was pre-loaded), show loading
  // If status is "plotting", it means data was pre-loaded, so skip the loading screen
  if ((!data || !data.target?.location) && status !== "plotting") {
    return (
      <div className="w-full h-full bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Finding competitors...</p>
        </div>
      </div>
    );
  }
  
  // If status is "plotting" but data isn't ready yet (shouldn't happen, but safety check)
  if (status === "plotting" && (!data || !data.target?.location)) {
    return null; // Don't show loading screen, data should be available momentarily
  }

  // Only render map once we have target coordinates
  const targetLocation = data.target.location;
  const center = { lat: targetLocation.lat, lng: targetLocation.lng };

  // Status text
  const getStatusText = () => {
    switch (status) {
      case "loading":
        return "Loading map...";
      case "finding":
        return "Finding competitors...";
      case "plotting":
        return `Plotting competitors… (${competitorsVisible.length}/${data.competitors.length})`;
      case "complete":
        if (data && data.competitors.length > 0) {
          const count = data.competitors.length;
          if (count < MIN_COMPETITORS) {
            return `Found ${count} close competitor${count !== 1 ? "s" : ""}`;
          }
          return `Found ${count} competitor${count !== 1 ? "s" : ""}`;
        }
        return "No competitors found";
      default:
        return "";
    }
  };

  return (
    <div className="w-full h-full flex flex-col relative">
      {/* Floating search bar - Owner.com style */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-full max-w-2xl px-4">
        <div className="relative bg-white rounded-full shadow-lg border border-gray-200">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <div className="relative w-full h-14 flex items-center">
            <input
              type="text"
              value={displayedName || fullDisplayText || data?.target?.name || name}
              readOnly
              className="w-full h-14 pl-12 pr-4 rounded-full bg-transparent text-gray-900 text-base focus:outline-none"
            />
            {/* Hidden span to measure text width */}
            <span
              ref={textMeasureRef}
              className="absolute invisible text-base text-gray-900 whitespace-pre"
              style={{ left: '3rem', top: '50%', transform: 'translateY(-50%)' }}
            >
              {displayedName || fullDisplayText || data?.target?.name || name}
            </span>
            {/* Cursor - constant while typing, blinking after typing completes */}
            {fullDisplayText && (
              <span 
                className={`absolute top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none font-bold ${
                  isTypingComplete ? 'animate-blink' : ''
                }`}
                style={{ 
                  left: `calc(3rem + ${textWidth}px)`,
                  fontSize: '1rem',
                  lineHeight: '1.5rem'
                }}
              >
                |
              </span>
            )}
          </div>
        </div>
      </div>


      {/* Map - only render when we have target coords */}
      <div className="flex-1 rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
        <GoogleMap
          mapContainerStyle={{
            width: "100%",
            height: "100%",
            minHeight: "500px",
          }}
          center={center}
          zoom={17}
          onLoad={onMapLoad}
          options={{
            disableDefaultUI: false,
            zoomControl: true,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: true,
            styles: [
              {
                featureType: "poi",
                elementType: "labels",
                stylers: [{ visibility: "off" }],
              },
            ],
          }}
        />
      </div>
    </div>
  );
}
