"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { SearchVisibility } from "@/lib/report/types";
import { getFaviconUrl } from "@/lib/seo/favicon";

interface ReportSearchVisibilityProps {
  searchVisibility: SearchVisibility;
  targetPlaceId?: string | null;
  targetDomain?: string | null;
}

export default function ReportSearchVisibility({
  searchVisibility,
  targetPlaceId,
  targetDomain,
}: ReportSearchVisibilityProps) {
  const [expandedQueries, setExpandedQueries] = useState<Set<string>>(new Set());
  
  const toggleQuery = (query: string) => {
    const newExpanded = new Set(expandedQueries);
    if (newExpanded.has(query)) {
      newExpanded.delete(query);
    } else {
      newExpanded.add(query);
    }
    setExpandedQueries(newExpanded);
  };
  
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
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
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
                className="border border-gray-200 rounded-lg overflow-hidden"
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
                        Unranked map pack
                      </span>
                    )}
                    {!isRankedOrganic && (
                      <span className="px-2 py-1 bg-pink-100 text-pink-700 text-xs rounded">
                        Unranked organic
                      </span>
                    )}
                    {isRankedMap && (
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                        Ranked #{query.mapPack.rank} map pack
                      </span>
                    )}
                    {isRankedOrganic && (
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                        Ranked #{query.organic.rank} organic
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
                    <div className="grid grid-cols-2 gap-6">
                      {/* Map Pack Results */}
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-1">Google Maps results</h4>
                        <p className="text-xs text-gray-500 mb-3">These results get the most clicks</p>
                        {query.mapPack.results.length === 0 ? (
                          <p className="text-sm text-gray-500">No map pack results available</p>
                        ) : (
                          <div className="flex gap-4">
                            {/* Map - Left side */}
                            <div className="flex-1 relative rounded-lg overflow-hidden border border-gray-200 bg-gray-100 h-[400px]">
                              {query.mapPack.results.some(r => r.placeId) ? (
                                <>
                                  <img
                                    src={`/api/places/static-map?placeIds=${query.mapPack.results.filter(r => r.placeId).map(r => r.placeId).join(',')}&zoom=14`}
                                    alt="Map showing competitor locations"
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.style.display = 'none';
                                      const parent = target.parentElement;
                                      if (parent && !parent.querySelector('.map-error')) {
                                        const errorDiv = document.createElement('div');
                                        errorDiv.className = 'map-error absolute inset-0 flex items-center justify-center text-gray-400 text-sm bg-gray-100';
                                        errorDiv.textContent = 'Map unavailable';
                                        parent.appendChild(errorDiv);
                                      }
                                    }}
                                  />
                                  <div className="absolute bottom-2 left-2 text-xs text-gray-600 bg-white/90 px-2 py-1 rounded flex items-center gap-1">
                                    <span>Google</span>
                                    <span>Map</span>
                                    <span>Data</span>
                                    <span>Terms</span>
                                  </div>
                                </>
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
                                  Map data unavailable
                                </div>
                              )}
                            </div>
                            
                            {/* Top 3 map results list - Right side */}
                            <div className="w-80 flex-shrink-0">
                              <h5 className="text-sm font-semibold text-gray-900 mb-3">Top 3 map results</h5>
                              <div className="space-y-3">
                                {query.mapPack.results.map((result, rIdx) => (
                                  <div
                                    key={rIdx}
                                    className={`p-3 rounded-lg border ${
                                      result.isTargetBusiness
                                        ? 'bg-blue-50 border-blue-200'
                                        : 'bg-white border-gray-200'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <span className="text-lg flex-shrink-0">🍴</span>
                                        <span className="font-medium text-gray-900 text-sm truncate">
                                          {result.name}
                                        </span>
                                      </div>
                                      <span className="text-xs font-semibold text-gray-700 flex-shrink-0 ml-2">
                                        {rIdx + 1 === 1 ? '1st' : rIdx + 1 === 2 ? '2nd' : '3rd'}
                                      </span>
                                    </div>
                                    {result.rating && (
                                      <div className="text-xs text-gray-600 mb-1.5 flex items-center gap-1">
                                        <span className="text-yellow-500">⭐</span>
                                        <span className="font-medium">{result.rating}</span>
                                        {result.reviews && (
                                          <span className="text-gray-500">({result.reviews} reviews)</span>
                                        )}
                                      </div>
                                    )}
                                    {result.address && (
                                      <div className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{result.address}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Organic Results */}
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
                          <p className="text-sm text-gray-500">No organic results available</p>
                        ) : (
                          <div className="space-y-3 max-h-96 overflow-y-auto">
                            {query.organic.results.map((result) => {
                              const isTarget = targetDomainNormalized
                                ? normalizeDomain(result.link) === targetDomainNormalized
                                : false;
                              
                              return (
                                <div
                                  key={result.position}
                                  className={`p-3 rounded-lg border ${
                                    isTarget
                                      ? 'bg-blue-50 border-blue-200'
                                      : 'bg-white border-gray-200'
                                  }`}
                                >
                                  <div className="flex items-start gap-2">
                                    {result.faviconUrl && (
                                      <img
                                        src={result.faviconUrl}
                                        alt=""
                                        className="w-4 h-4 mt-1 flex-shrink-0"
                                      />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <a
                                        href={result.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-blue-600 hover:underline line-clamp-1"
                                      >
                                        {result.title}
                                      </a>
                                      <div className="text-xs text-gray-500 mt-0.5">
                                        {result.displayLink}
                                      </div>
                                      {result.snippet && (
                                        <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                                          {result.snippet}
                                        </div>
                                      )}
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
