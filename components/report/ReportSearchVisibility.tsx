"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useJsApiLoader, GoogleMap } from "@react-google-maps/api";
import type { SearchVisibility } from "@/lib/report/types";
import { getFaviconUrl } from "@/lib/seo/favicon";
import { fetchWithTimeoutClient } from "@/lib/net/clientFetchWithTimeout";
import type { MarkerLocation } from "@/lib/report/snapshotTypes";

interface ReportSearchVisibilityProps {
  searchVisibility: SearchVisibility;
  targetPlaceId?: string | null;
  targetDomain?: string | null;
  /** Snapshot mode: when true, skip all API fetches for markers */
  snapshotMode?: boolean;
  /** Pre-computed marker locations for snapshot mode (keyed by placeId) */
  snapshotMarkerLocations?: Record<string, MarkerLocation>;
}

const libraries: ("places")[] = ["places"];
const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

export default function ReportSearchVisibility({
  searchVisibility,
  targetPlaceId,
  targetDomain,
  snapshotMode = false,
  snapshotMarkerLocations,
}: ReportSearchVisibilityProps) {
  const [expandedQueries, setExpandedQueries] = useState<Set<string>>(new Set());
  const markersRef = useRef<Map<string, google.maps.Marker[]>>(new Map());
  
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries,
  });
  
  const toggleQuery = (query: string) => {
    const newExpanded = new Set(expandedQueries);
    if (newExpanded.has(query)) {
      newExpanded.delete(query);
    } else {
      newExpanded.add(query);
    }
    setExpandedQueries(newExpanded);
  };
  
  // Fetch locations for mapPack results and create markers
  // In snapshot mode, use precomputed locations instead of fetching
  const initializeMapMarkers = useCallback(async (
    mapInstance: google.maps.Map,
    mapPackResults: Array<{ placeId: string | null; name: string; isTargetBusiness?: boolean }>,
    queryKey: string
  ) => {
    if (!mapInstance || mapPackResults.length === 0) return;
    
    // Clear existing markers for this query
    const existingMarkers = markersRef.current.get(queryKey) || [];
    existingMarkers.forEach(marker => marker.setMap(null));
    markersRef.current.set(queryKey, []);
    
    const bounds = new google.maps.LatLngBounds();
    const newMarkers: google.maps.Marker[] = [];
    let firstPosition: google.maps.LatLng | null = null;
    
    // Process each result
    for (const result of mapPackResults) {
      if (!result.placeId) continue;
      
      let lat: number | undefined;
      let lng: number | undefined;
      
      // In snapshot mode, use precomputed locations
      if (snapshotMode && snapshotMarkerLocations) {
        const cached = snapshotMarkerLocations[result.placeId];
        if (cached) {
          lat = cached.lat;
          lng = cached.lng;
        }
      } else {
        // Normal mode: fetch from API
        try {
          const response = await fetchWithTimeoutClient(
            `/api/places/details?placeId=${encodeURIComponent(result.placeId)}`,
            undefined,
            20000
          );
          if (response.ok) {
            const data = await response.json();
            lat = data.location?.lat;
            lng = data.location?.lng;
          }
        } catch (error) {
          console.error(`Error fetching location for ${result.placeId}:`, error);
        }
      }
      
      if (lat === undefined || lng === undefined) continue;
      
      const position = new google.maps.LatLng(lat, lng);
      if (!firstPosition) firstPosition = position;
      bounds.extend(position);
      
      // Create marker - different style for target business
      const marker = new google.maps.Marker({
        position,
        map: mapInstance,
        title: result.name,
        icon: result.isTargetBusiness ? {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: "#000000",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        } : {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#ef4444",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      
      newMarkers.push(marker);
    }
    
    // Store markers
    markersRef.current.set(queryKey, newMarkers);
    
    // Fit bounds to show all markers, or center on first if only one
    if (newMarkers.length > 0) {
      if (newMarkers.length === 1 && firstPosition) {
        mapInstance.setCenter(firstPosition);
        mapInstance.setZoom(15);
      } else if (newMarkers.length > 1) {
        mapInstance.fitBounds(bounds, {
          top: 20,
          right: 20,
          bottom: 20,
          left: 20,
        });
      }
    }
  }, [snapshotMode, snapshotMarkerLocations]);
  
  const onMapLoad = useCallback((mapInstance: google.maps.Map, queryKey: string, mapPackResults: Array<{ placeId: string | null; name: string; isTargetBusiness?: boolean }>) => {
    // Initialize markers after a short delay to ensure map is fully loaded
    setTimeout(() => {
      initializeMapMarkers(mapInstance, mapPackResults, queryKey);
    }, 100);
  }, [initializeMapMarkers]);
  
  // Cleanup markers when query is collapsed
  useEffect(() => {
    return () => {
      // Cleanup all markers on unmount
      markersRef.current.forEach((markers) => {
        markers.forEach(marker => marker.setMap(null));
      });
      markersRef.current.clear();
    };
  }, []);
  
  // Cleanup markers when query is collapsed
  useEffect(() => {
    searchVisibility.queries.forEach((query) => {
      if (!expandedQueries.has(query.query)) {
        const markers = markersRef.current.get(query.query);
        if (markers) {
          markers.forEach(marker => marker.setMap(null));
          markersRef.current.delete(query.query);
        }
      }
    });
  }, [expandedQueries, searchVisibility.queries]);
  
  // Normalize domain for comparison
  const normalizeDomain = (url: string): string => {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      return parsed.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return url.toLowerCase().replace(/^www\./, '').replace(/^https?:\/\//, '');
    }
  };
  
  const targetDomainNormalized = targetDomain ? normalizeDomain(targetDomain) : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 mb-6 md:mb-8 shadow-md">
      {/* Header - smaller on mobile */}
      <div className="mb-4 md:mb-6">
        <h2 className="text-base md:text-xl font-semibold text-gray-900 mb-0.5 md:mb-1">
          This is how you're doing online
        </h2>
        <p className="text-xs md:text-sm text-gray-600">
          Where you are showing up when customers search you, next to your competitors
        </p>
      </div>
      
      {/* Queries List */}
      {searchVisibility.queries.length === 0 ? (
        <div className="text-center py-8 md:py-12 text-gray-500 text-sm md:text-base">
          <p>Search visibility analysis not available.</p>
          <p className="text-xs md:text-sm mt-2">Map and Google Search rankings are based on your Google Business Profile and do not require a website. Data may still be loading.</p>
        </div>
      ) : (
        <div className="space-y-2 md:space-y-4">
          {searchVisibility.queries.map((query, idx) => {
            const isExpanded = expandedQueries.has(query.query);
            const topMapCompetitor = query.mapPack.results[0];
            const isRankedMap = query.mapPack.rank !== null;
            const isRankedOrganic = query.organic.rank !== null;
            
            return (
              <div
                key={idx}
                className="border-b border-gray-200 last:border-b-0"
              >
                {/* Query Header (Collapsed) - mobile: two rows (query+chevron / badges); desktop: single row */}
                <button
                  onClick={() => toggleQuery(query.query)}
                  className="w-full p-3 md:p-4 grid grid-cols-[auto_1fr_auto] md:flex md:items-center md:justify-between gap-x-2 gap-y-2 hover:bg-gray-50 transition-colors text-left"
                >
                  {/* Row 1 col 1: Google icon */}
                  <div className="w-5 h-5 md:w-6 md:h-6 flex items-center justify-center flex-shrink-0 md:order-1">
                    <svg className="w-[14px] h-[14px] md:w-[18px] md:h-[18px]" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  </div>
                  {/* Row 1 col 2: Search query */}
                  <span className="font-medium text-gray-900 text-sm md:text-base truncate min-w-0 md:order-2 md:flex-1 md:mr-2">{query.query}</span>
                  {/* Row 1 col 3: Chevron */}
                  <div className="flex-shrink-0 md:order-4">
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 md:w-5 md:h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 md:w-5 md:h-5 text-gray-400" />
                    )}
                  </div>
                  {/* Row 2 (mobile) / inline (desktop): Badges */}
                  <div className="col-span-3 md:col-span-1 flex flex-wrap items-center gap-1.5 md:gap-2 md:order-3">
                    {topMapCompetitor && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 md:px-2 md:py-1 bg-gray-100 text-black text-[10px] md:text-xs rounded">
                        <span className="text-[10px] md:text-xs">🏆</span>
                        #1: {topMapCompetitor.name}
                      </span>
                    )}
                    {/* Mobile: one "Unranked" when both unranked; when one unranked show which (Maps/Search); desktop: separate stickers */}
                    {(() => {
                      const mapsUnranked = !isRankedMap;
                      const searchUnranked = !isRankedOrganic;
                      const unrankedStyle = "px-1.5 py-0.5 md:px-2 md:py-1 text-black text-[10px] md:text-xs rounded whitespace-nowrap";
                      const unrankedBg = { backgroundColor: '#ffb4b4' };
                      const bothUnranked = mapsUnranked && searchUnranked;
                      return (
                        <>
                          {/* Mobile: one sticker — "Unranked" when both, else "Unranked Maps" or "Unranked Search" so user knows which */}
                          {(mapsUnranked || searchUnranked) && (
                            <span className={`${unrankedStyle} md:hidden`} style={unrankedBg}>
                              {bothUnranked ? "Unranked" : mapsUnranked ? "Unranked Maps" : "Unranked Search"}
                            </span>
                          )}
                          {/* Desktop: separate Maps and Search stickers */}
                          {mapsUnranked && (
                            <span className={`${unrankedStyle} hidden md:inline-block`} style={unrankedBg}>
                              Unranked on Google Maps
                            </span>
                          )}
                          {searchUnranked && (
                            <span className={`${unrankedStyle} hidden md:inline-block`} style={unrankedBg}>
                              Unranked on Google Search
                            </span>
                          )}
                        </>
                      );
                    })()}
                    {isRankedMap && (
                      <span className="px-1.5 py-0.5 md:px-2 md:py-1 bg-green-100 text-black text-[10px] md:text-xs rounded whitespace-nowrap">
                        <span className="md:hidden">Ranked #{query.mapPack.rank} Maps</span>
                        <span className="hidden md:inline">Ranked #{query.mapPack.rank} on Google Maps</span>
                      </span>
                    )}
                    {isRankedOrganic && (
                      <span className="px-1.5 py-0.5 md:px-2 md:py-1 bg-green-100 text-black text-[10px] md:text-xs rounded whitespace-nowrap">
                        <span className="md:hidden">Ranked #{query.organic.rank} Search</span>
                        <span className="hidden md:inline">Ranked #{query.organic.rank} on Google Search</span>
                      </span>
                    )}
                  </div>
                </button>
                
                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-gray-200 p-4 md:p-6 bg-white">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                      {/* Map Pack Results - Single card: map + results together */}
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-3 md:p-4">
                          <h4 className="text-sm md:text-base font-semibold text-gray-900 mb-0.5 md:mb-1">Google Maps results</h4>
                          <p className="text-[10px] md:text-xs text-gray-500">These results get the most clicks</p>
                        </div>
                        {query.mapPack.results.length === 0 ? (
                          <div className="p-6">
                            <p className="text-sm text-gray-500">No map pack results available</p>
                          </div>
                        ) : (
                          <div className="flex pb-3 md:pl-3">
                            {/* Map - Left side; hidden on mobile (list only) */}
                            <div className="hidden md:block w-48 flex-shrink-0 relative overflow-hidden rounded-lg bg-gray-100" style={{ minHeight: '220px', pointerEvents: 'none' }}>
                              {query.mapPack.results.some(r => r.placeId) && isLoaded ? (
                                <div className="rounded-lg overflow-hidden" style={{ pointerEvents: 'none' }}>
                                  <GoogleMap
                                    mapContainerStyle={{
                                      width: "100%",
                                      height: "100%",
                                      minHeight: "220px",
                                      pointerEvents: 'none',
                                    }}
                                    center={{ lat: -33.9249, lng: 18.4241 }}
                                    zoom={14}
                                    onLoad={(map) => onMapLoad(map, query.query, query.mapPack.results)}
                                    options={{
                                      disableDefaultUI: true,
                                      zoomControl: false,
                                      streetViewControl: false,
                                      mapTypeControl: false,
                                      fullscreenControl: false,
                                      draggable: false,
                                      scrollwheel: false,
                                      disableDoubleClickZoom: true,
                                      gestureHandling: 'none',
                                      keyboardShortcuts: false,
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
                              ) : query.mapPack.results.some(r => r.placeId) ? (
                                <div className="flex items-center justify-center text-gray-400 text-sm h-full min-h-[220px]">
                                  Loading map...
                                </div>
                              ) : (
                                <div className="flex items-center justify-center text-gray-400 text-sm h-full min-h-[220px]">
                                  Map unavailable
                                </div>
                              )}
                            </div>
                            {/* Top 3 map results list - full width on mobile (no map), right side on desktop */}
                            <div className="flex-1 pt-3 md:pt-4 pr-3 md:pr-4 pb-2 pl-3 md:pl-4 min-w-0 w-full">
                              <h5 className="text-xs md:text-sm font-medium text-gray-700 mb-2 md:mb-3">Top 3 map results</h5>
                              <div className="space-y-0">
                                {query.mapPack.results.map((result, rIdx) => (
                                  <div
                                    key={rIdx}
                                    className={`flex items-center justify-between gap-2 py-2.5 ${
                                      rIdx < query.mapPack.results.length - 1 ? 'border-b border-gray-100' : ''
                                    } ${result.isTargetBusiness ? 'bg-blue-50/50 -mx-2 px-2 rounded' : ''}`}
                                  >
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <span className="text-base flex-shrink-0">🍴</span>
                                      <div className="min-w-0">
                                        <span className="font-medium text-gray-900 text-xs md:text-sm truncate block">
                                          {result.name}
                                        </span>
                                        {result.rating && (
                                          <span className="text-[10px] md:text-xs text-gray-600 flex items-center gap-1">
                                            <span className="text-yellow-500">⭐</span>
                                            {result.rating}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <span className="text-[10px] md:text-xs font-medium text-gray-500 flex-shrink-0">
                                      {rIdx + 1 === 1 ? '1st' : rIdx + 1 === 2 ? '2nd' : '3rd'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Google Search Results - Single block: header + list rows */}
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-3 md:p-4">
                          <h4 className="text-sm md:text-base font-semibold text-gray-900 mb-0.5 md:mb-1">Google Search results</h4>
                          {isRankedOrganic ? (
                            <p className="text-xs md:text-sm text-green-600 font-medium">
                              You are Ranked #{query.organic.rank}
                            </p>
                          ) : (
                            <p className="text-xs md:text-sm text-black">
                              You are Unranked
                            </p>
                          )}
                        </div>
                        {query.organic.results.length === 0 ? (
                          <div className="px-3 md:px-4 pb-3 md:pb-4">
                            <p className="text-xs md:text-sm text-gray-500">No Google Search results available</p>
                          </div>
                        ) : (
                          <div className="max-h-[220px] overflow-y-auto">
                            {query.organic.results.map((result, idx) => {
                              const isTarget = targetDomainNormalized
                                ? normalizeDomain(result.link) === targetDomainNormalized
                                : false;
                              
                              return (
                                <div
                                  key={result.position}
                                  className={`flex items-start gap-1.5 md:gap-2 py-2 md:py-2.5 px-3 md:px-4 ${
                                    idx < query.organic.results.length - 1 ? 'border-b border-gray-100' : ''
                                  } ${isTarget ? 'bg-blue-50/50' : ''}`}
                                >
                                  <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    {result.faviconUrl ? (
                                      <img
                                        src={result.faviconUrl}
                                        alt=""
                                        className="w-3.5 h-3.5"
                                        onError={(e) => {
                                          const target = e.target as HTMLImageElement;
                                          target.style.display = 'none';
                                        }}
                                      />
                                    ) : (
                                      <span className="text-[10px] text-gray-400">🌐</span>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[10px] md:text-xs text-gray-500 mb-0.5">
                                        {result.displayLink}
                                      </div>
                                      <a
                                        href={result.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs md:text-sm text-blue-600 hover:underline line-clamp-1 font-medium"
                                      >
                                      {result.title}
                                    </a>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
