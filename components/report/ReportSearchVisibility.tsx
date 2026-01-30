"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useJsApiLoader, GoogleMap } from "@react-google-maps/api";
import type { SearchVisibility } from "@/lib/report/types";
import { getFaviconUrl } from "@/lib/seo/favicon";
import { fetchWithTimeoutClient } from "@/lib/net/clientFetchWithTimeout";

interface ReportSearchVisibilityProps {
  searchVisibility: SearchVisibility;
  targetPlaceId?: string | null;
  targetDomain?: string | null;
}

const libraries: ("places")[] = ["places"];
const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

export default function ReportSearchVisibility({
  searchVisibility,
  targetPlaceId,
  targetDomain,
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
    
    // Fetch locations for each placeId
    for (const result of mapPackResults) {
      if (!result.placeId) continue;
      
      try {
        const response = await fetchWithTimeoutClient(
          `/api/places/details?placeId=${encodeURIComponent(result.placeId)}`,
          undefined,
          20000
        );
        if (!response.ok) continue;
        
        const data = await response.json();
        if (!data.location?.lat || !data.location?.lng) continue;
        
        const position = new google.maps.LatLng(data.location.lat, data.location.lng);
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
      } catch (error) {
        console.error(`Error fetching location for ${result.placeId}:`, error);
      }
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
  }, []);
  
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
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8 shadow-md">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">
          This is how you're doing online
        </h2>
        <p className="text-sm text-gray-600">
          Where you are showing up when customers search you, next to your competitors
        </p>
      </div>
      
      {/* Queries List */}
      {searchVisibility.queries.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>Search visibility analysis not available.</p>
          <p className="text-sm mt-2">This requires a website URL.</p>
        </div>
      ) : (
        <div className="space-y-4">
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
                {/* Query Header (Collapsed) */}
                <button
                  onClick={() => toggleQuery(query.query)}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                    </div>
                    <span className="font-medium text-gray-900">{query.query}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* Badges */}
                    {topMapCompetitor && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                        #1: {topMapCompetitor.name}
                      </span>
                    )}
                    {!isRankedMap && (
                      <span className="px-2 py-1 bg-pink-100 text-pink-700 text-xs rounded">
                        Unranked on Google Maps
                      </span>
                    )}
                    {!isRankedOrganic && (
                      <span className="px-2 py-1 bg-pink-100 text-pink-700 text-xs rounded">
                        Unranked on Google Search
                      </span>
                    )}
                    {isRankedMap && (
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                        Ranked #{query.mapPack.rank} on Google Maps
                      </span>
                    )}
                    {isRankedOrganic && (
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                        Ranked #{query.organic.rank} on Google Search
                      </span>
                    )}
                    
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>
                
                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-gray-200 p-6 bg-gray-50">
                    <div className="grid grid-cols-2 gap-8">
                      {/* Map Pack Results - Left Column */}
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-1">Google Maps results</h4>
                        <p className="text-xs text-gray-500 mb-4">These results get the most clicks</p>
                        {query.mapPack.results.length === 0 ? (
                          <p className="text-sm text-gray-500">No map pack results available</p>
                        ) : (
                          <div className="flex gap-4">
                            {/* Map - Left side */}
                            <div className="w-48 flex-shrink-0 relative rounded-lg overflow-hidden border border-gray-200 bg-gray-100" style={{ minHeight: '280px', pointerEvents: 'none' }}>
                              {query.mapPack.results.some(r => r.placeId) && isLoaded ? (
                                <div style={{ pointerEvents: 'none' }}>
                                  <GoogleMap
                                    mapContainerStyle={{
                                      width: "100%",
                                      height: "100%",
                                      minHeight: "280px",
                                      pointerEvents: 'none',
                                    }}
                                    center={{ lat: -33.9249, lng: 18.4241 }} // Default center (will be adjusted by fitBounds)
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
                                <div className="flex items-center justify-center text-gray-400 text-sm h-full min-h-[280px]">
                                  Loading map...
                                </div>
                              ) : (
                                <div className="flex items-center justify-center text-gray-400 text-sm h-full min-h-[280px]">
                                  Map unavailable
                                </div>
                              )}
                            </div>
                            
                            {/* Top 3 map results list - Right side */}
                            <div className="flex-1">
                              <h5 className="text-sm font-medium text-gray-700 mb-3">Top 3 map results</h5>
                              <div className="space-y-3">
                                {query.mapPack.results.map((result, rIdx) => (
                                  <div
                                    key={rIdx}
                                    className={`p-3 rounded-xl border shadow-sm ${
                                      result.isTargetBusiness
                                        ? 'bg-blue-50 border-blue-200'
                                        : 'bg-white border-gray-200'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <span className="text-base flex-shrink-0">🍴</span>
                                        <span className="font-medium text-gray-900 text-sm truncate">
                                          {result.name}
                                        </span>
                                      </div>
                                      <span className="text-xs font-medium text-gray-600 flex-shrink-0 ml-2">
                                        {rIdx + 1 === 1 ? '1st' : rIdx + 1 === 2 ? '2nd' : '3rd'}
                                      </span>
                                    </div>
                                    {result.rating && (
                                      <div className="text-xs text-gray-600 mb-1 flex items-center gap-1">
                                        <span className="text-yellow-500">⭐</span>
                                        <span>{result.rating}</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Google Search Results - Right Column */}
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-3">Google Search results</h4>
                        {isRankedOrganic ? (
                          <div className="mb-3 text-sm text-green-600 font-medium">
                            You are Ranked #{query.organic.rank}
                          </div>
                        ) : (
                          <div className="mb-3 text-sm text-gray-600">
                            You are Unranked
                          </div>
                        )}
                        {query.organic.results.length === 0 ? (
                          <p className="text-sm text-gray-500">No Google Search results available</p>
                        ) : (
                          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-2">
                            {query.organic.results.map((result) => {
                              const isTarget = targetDomainNormalized
                                ? normalizeDomain(result.link) === targetDomainNormalized
                                : false;
                              
                              return (
                                <div
                                  key={result.position}
                                  className={`p-2.5 rounded-xl border shadow-sm ${
                                    isTarget
                                      ? 'bg-blue-50 border-blue-200'
                                      : 'bg-white border-gray-200'
                                  }`}
                                >
                                  <div className="flex items-start gap-2">
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
                                      <div className="text-xs text-gray-500 mb-0.5">
                                        {result.displayLink}
                                      </div>
                                      <a
                                        href={result.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-blue-600 hover:underline line-clamp-1 font-medium"
                                      >
                                        {result.title}
                                      </a>
                                    </div>
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
