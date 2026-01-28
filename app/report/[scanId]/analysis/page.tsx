"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { assembleReport } from "@/lib/report/assembleReport";
import type { ReportSchema } from "@/lib/report/types";
import ReportLeftRail from "@/components/report/ReportLeftRail";
import ReportTopCards from "@/components/report/ReportTopCards";
import ReportSearchVisibility from "@/components/report/ReportSearchVisibility";
import ReportChecklistSection from "@/components/report/ReportChecklistSection";
import ReportAIAnalysis from "@/components/report/ReportAIAnalysis";

// Helper function to extract username from URL
function extractUsernameFromUrl(url: string, platform: 'instagram' | 'facebook'): string | null {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    
    if (platform === 'instagram') {
      // Instagram: instagram.com/username or instagram.com/username/
      return pathParts[0] || null;
    } else if (platform === 'facebook') {
      // Facebook: facebook.com/username or facebook.com/username/
      return pathParts[0] || null;
    }
    
    return null;
  } catch {
    return null;
  }
}

export default function AnalysisPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const scanId = params?.scanId as string;
  const placeId = searchParams?.get('placeId') || '';

  // State for all analyzers
  const [websiteResult, setWebsiteResult] = useState<any>(null);
  const [gbpAnalysis, setGbpAnalysis] = useState<any>(null);
  const [igResult, setIgResult] = useState<any>(null);
  const [fbResult, setFbResult] = useState<any>(null);
  const [reviews, setReviews] = useState<Array<{
    reviewId: string;
    authorName: string;
    profilePhotoUrl: string | null;
    relativeTime: string | null;
    rating: number;
    text: string;
    isLocalGuide: boolean;
  }>>([]);
  
  // Standardized report state
  const [report, setReport] = useState<ReportSchema | null>(null);
  const [placesDetails, setPlacesDetails] = useState<any>(null);
  const [socialsData, setSocialsData] = useState<any>(null);
  
  // AI Analysis state
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
  const aiAnalysisTriggeredRef = useRef(false); // Prevent duplicate AI analysis API calls

  // Load cached analysis results from localStorage
  useEffect(() => {
    console.log('[ANALYSIS PAGE] Loading cached results from localStorage...');
    
    // Load website analysis
    const cachedWebsite = localStorage.getItem(`analysis_${scanId}_website`);
    if (cachedWebsite) {
      try {
        const data = JSON.parse(cachedWebsite);
        setWebsiteResult(data);
      } catch (error) {
        console.error('[ANALYSIS PAGE] Failed to parse website cache:', error);
      }
    } else {
      // FIX: Trigger website crawler if cache doesn't exist and we have a website URL
      // This handles cases where analysis page is accessed directly or onboarding didn't complete
      // We'll check for website URL after placesDetails is loaded (see useEffect below)
    }
    
    // Load GBP analysis
    const cachedGbp = localStorage.getItem(`analysis_${scanId}_gbp`);
    if (cachedGbp) {
      try {
        const data = JSON.parse(cachedGbp);
        setGbpAnalysis(data);
      } catch (error) {
        console.error('[ANALYSIS PAGE] Failed to parse GBP cache:', error);
      }
    }
    
    // Load Instagram analysis
    const cachedIg = localStorage.getItem(`analysis_${scanId}_instagram`);
    if (cachedIg) {
      try {
        const data = JSON.parse(cachedIg);
        setIgResult(data);
      } catch (error) {
        console.error('[ANALYSIS PAGE] Failed to parse Instagram cache:', error);
      }
    }
    
    // Load Facebook analysis
    const cachedFb = localStorage.getItem(`analysis_${scanId}_facebook`);
    if (cachedFb) {
      try {
        const data = JSON.parse(cachedFb);
        setFbResult(data);
      } catch (error) {
        console.error('[ANALYSIS PAGE] Failed to parse Facebook cache:', error);
      }
    }
    
    // Load reviews
    const cachedReviews = localStorage.getItem(`analysis_${scanId}_reviews`);
    if (cachedReviews) {
      try {
        const data = JSON.parse(cachedReviews);
        setReviews(data.reviews || []);
      } catch (error) {
        console.error('[ANALYSIS PAGE] Failed to parse reviews cache:', error);
      }
    }
    
    // Load socials data
    const onlinePresenceMetadata = localStorage.getItem(`onlinePresence_${scanId}`);
    if (onlinePresenceMetadata) {
      try {
        const parsed = JSON.parse(onlinePresenceMetadata);
        setSocialsData({
          websiteUrl: parsed.websiteUrl || null,
          websiteScreenshot: null, // Don't store base64 in state
          socialLinks: (parsed.socialLinks || []).map((link: any) => ({
            platform: link.platform,
            url: link.url,
            screenshot: null,
          })),
        });
      } catch (e) {
        console.error('Failed to parse socials data:', e);
      }
    }
    
    // Fetch places details
    if (placeId) {
      fetch(`/api/places/details?placeId=${encodeURIComponent(placeId)}`)
        .then(res => res.json())
        .then(data => {
          if (!data.error) {
            setPlacesDetails(data);
            
            // FIX: Trigger analyses - website crawler if website exists, search visibility/competitors always
            if (!cachedWebsite) {
              if (data.website) {
                // Trigger website crawler (includes search visibility and competitors)
                fetch("/api/scan/website", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ 
                    url: data.website, 
                    maxDepth: 2,
                    maxPages: 10 
                  }),
                })
                  .then(res => res.json())
                  .then(crawlData => {
                    if (crawlData && !crawlData.error) {
                      // Store in cache and update state
                      localStorage.setItem(`analysis_${scanId}_website`, JSON.stringify(crawlData));
                      setWebsiteResult(crawlData);
                    }
                  })
                  .catch(err => {
                    console.error('[ANALYSIS PAGE] Website crawler failed:', err);
                  });
              } else {
                // No website - trigger search visibility and competitor analysis independently
                fetch("/api/scan/search-visibility", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    placeId,
                    placeName: data.name,
                    placeAddress: data.formatted_address,
                    placeTypes: data.types,
                    latlng: data.geometry?.location ? { lat: data.geometry.location.lat, lng: data.geometry.location.lng } : null,
                    rating: data.rating,
                    reviewCount: data.user_ratings_total,
                  }),
                })
                  .then(res => res.json())
                  .then(analysisData => {
                    if (analysisData && !analysisData.error) {
                      // Store as website result (even though there's no website) so assembleReport can use it
                      const websiteResultData = {
                        search_visibility: analysisData.search_visibility,
                        competitors_snapshot: analysisData.competitors_snapshot,
                        business_identity: analysisData.business_identity,
                        scrape_metadata: {
                          timestamp: new Date().toISOString(),
                        },
                      };
                      localStorage.setItem(`analysis_${scanId}_website`, JSON.stringify(websiteResultData));
                      setWebsiteResult(websiteResultData);
                    }
                  })
                  .catch(err => {
                    console.error('[ANALYSIS PAGE] Search visibility/competitors analysis failed:', err);
                  });
              }
            }
          }
        })
        .catch(() => {});
      
      // Fetch reviews if not cached
      if (!cachedReviews) {
        fetch(`/api/places/reviews?placeId=${encodeURIComponent(placeId)}&all=true`)
          .then(res => res.json())
          .then(data => {
            if (!data.error) {
              setReviews(data.reviews || []);
              localStorage.setItem(`analysis_${scanId}_reviews`, JSON.stringify(data));
            }
          })
          .catch(() => {});
      }
    }
  }, [scanId, placeId]);

  // Assemble standardized report whenever data changes
  useEffect(() => {
    if (!placeId) {
      return;
    }
    
    try {
      // FIX: Read websiteResult from localStorage directly to avoid race condition
      // State updates are async, so we read from cache synchronously here
      let websiteCrawlData = websiteResult;
      if (!websiteCrawlData) {
        const cachedWebsite = localStorage.getItem(`analysis_${scanId}_website`);
        if (cachedWebsite) {
          try {
            websiteCrawlData = JSON.parse(cachedWebsite);
          } catch (e) {
            // Ignore parse errors, will use undefined
          }
        }
      }
      
      const assembled = assembleReport({
        placeId,
        placeName: placesDetails?.name || gbpAnalysis?.analysis?.businessName || null,
        placeAddress: placesDetails?.formatted_address || null,
        placesDetails: placesDetails || undefined,
        websiteCrawl: websiteCrawlData || undefined,
        gbpAnalysis: gbpAnalysis?.analysis || undefined,
        socials: socialsData || undefined,
        instagram: igResult || undefined,
        facebook: fbResult || undefined,
      });
      
      setReport(assembled);
    } catch (error) {
      console.error('[ANALYSIS PAGE] Failed to assemble report:', error);
    }
  }, [placeId, placesDetails, websiteResult, gbpAnalysis, igResult, fbResult, socialsData]);

  // Trigger AI analysis when all data is available
  useEffect(() => {
    if (!placeId || !placesDetails) {
      return;
    }
    
    // Check if we have enough data for AI analysis
    const hasEnoughData = (igResult || fbResult || reviews.length > 0);
    if (!hasEnoughData) {
      return;
    }

    // Check if already cached
    const cachedAiAnalysis = localStorage.getItem(`analysis_${scanId}_ai`);
    if (cachedAiAnalysis) {
      try {
        setAiAnalysis(JSON.parse(cachedAiAnalysis));
        return;
      } catch (e) {
        console.error('[ANALYSIS PAGE] Failed to parse cached AI analysis:', e);
      }
    }

    // Prevent duplicate API calls
    if (aiAnalysisTriggeredRef.current) {
      return;
    }

    // Mark as triggered to prevent duplicates
    aiAnalysisTriggeredRef.current = true;

    // Trigger AI analysis
    setAiAnalysisLoading(true);
    
    const businessName = placesDetails?.name || gbpAnalysis?.analysis?.businessName || 'Business';
    const businessCategory = gbpAnalysis?.analysis?.category || websiteResult?.business_identity?.category_label || 'Business';

    // Prepare data for AI analysis
    const aiData: any = {
      instagram: igResult?.profile ? {
        biography: igResult.profile.biography,
        website: igResult.profile.website,
        category: igResult.profile.category,
        followerCount: igResult.profile.followerCount,
        postCount: igResult.posts?.length || 0,
      } : undefined,
      facebook: fbResult?.profile ? {
        description: fbResult.profile.description,
        website: fbResult.profile.website,
        phone: fbResult.profile.phone,
        address: fbResult.profile.address,
        hours: fbResult.profile.hours,
      } : undefined,
      website: socialsData?.websiteUrl ? {
        description: null, // Could extract from website crawl
        phone: null,
        address: null,
        hours: null,
      } : undefined,
      reviews: reviews.length > 0 ? reviews.map((r: any) => ({
        text: r.text,
        rating: r.rating,
        authorName: r.authorName,
        relativeTime: r.relativeTime,
      })) : undefined,
    };

    // Call AI analysis API
    fetch('/api/ai/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'full',
        businessName,
        businessCategory,
        data: aiData,
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.analysis) {
          setAiAnalysis(data.analysis);
          localStorage.setItem(`analysis_${scanId}_ai`, JSON.stringify(data.analysis));
          // Mark AI analysis as complete for onboarding flow
          console.log('[ANALYSIS PAGE] ✅ AI analysis complete and cached');
        } else {
          console.error('[ANALYSIS PAGE] AI analysis failed:', data.error);
          // Mark as complete anyway to not block navigation
          localStorage.setItem(`analysis_${scanId}_ai`, JSON.stringify({ complete: true }));
        }
      })
      .catch(error => {
        console.error('[ANALYSIS PAGE] AI analysis error:', error);
      })
      .finally(() => {
        setAiAnalysisLoading(false);
      });
  }, [scanId, placeId, placesDetails, gbpAnalysis, igResult, fbResult, reviews, websiteResult, socialsData]);


  // Show loading state only while assembling report (not waiting for AI)
  // AI analysis will load in the background and display when ready
  if (!report) {
    return (
      <div className="min-h-screen bg-[#f6f7f8] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Assembling your report...</p>
        </div>
      </div>
    );
  }

  // Calculate total checks and need work count
  const totalChecks = report.sections.reduce((sum, section) => sum + section.checks.length, 0);
  const needWork = report.sections.reduce(
    (sum, section) => sum + section.checks.filter(c => c.status === 'bad' || c.status === 'warn').length,
    0
  );

  return (
    <div className="min-h-screen bg-[#f6f7f8] flex">
      {/* Left Rail */}
      <ReportLeftRail scores={report.scores} />
      
      {/* Main Content */}
      <div className="flex-1 p-8">
        <div className="max-w-6xl mx-auto">
          {/* Top Cards */}
          <ReportTopCards
            impact={report.summaryCards.impact}
            competitors={report.summaryCards.competitors}
            businessName={report.meta.businessName}
            websiteUrl={report.meta.websiteUrl}
            businessAvatar={report.summaryCards.impact.businessAvatar}
            placeId={report.meta.placeId}
            sections={report.sections}
          />
          
          {/* Search Visibility Table */}
          <ReportSearchVisibility
            searchVisibility={report.searchVisibility}
            targetPlaceId={report.meta.placeId}
            targetDomain={report.meta.websiteUrl || null}
          />
          
          {/* AI Analysis */}
          <ReportAIAnalysis analysis={aiAnalysis} isLoading={aiAnalysisLoading} />
          
          {/* Summary Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-1">
              {totalChecks} things reviewed, {needWork} need work
            </h2>
            <p className="text-sm text-gray-600">See what's wrong and how to improve</p>
          </div>
          
          {/* Checklist Sections */}
          {report.sections.map((section) => (
            <ReportChecklistSection key={section.id} section={section} />
          ))}
          
          {/* Google Reviews Section */}
          {placeId && reviews.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">📝 Google Reviews</h2>
              <div className="space-y-4">
                {reviews.map((review) => {
                  const getInitials = (name: string) => {
                    const parts = name.trim().split(" ");
                    if (parts.length >= 2) {
                      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                    }
                    return name.substring(0, 2).toUpperCase();
                  };

                  const renderStars = (rating: number) => {
                    const fullStars = Math.floor(rating);
                    const hasHalfStar = rating % 1 >= 0.5;
                    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

                    return (
                      <div className="flex items-center gap-0.5">
                        {[...Array(fullStars)].map((_, i) => (
                          <svg
                            key={`full-${i}`}
                            className="w-4 h-4 text-yellow-400 fill-current"
                            viewBox="0 0 20 20"
                          >
                            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                          </svg>
                        ))}
                        {hasHalfStar && (
                          <svg
                            className="w-4 h-4 text-yellow-400 fill-current"
                            viewBox="0 0 20 20"
                          >
                            <defs>
                              <linearGradient id={`half-fill-${review.reviewId}`}>
                                <stop offset="50%" stopColor="currentColor" />
                                <stop offset="50%" stopColor="transparent" stopOpacity="1" />
                              </linearGradient>
                            </defs>
                            <path
                              fill={`url(#half-fill-${review.reviewId})`}
                              d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"
                            />
                          </svg>
                        )}
                        {[...Array(emptyStars)].map((_, i) => (
                          <svg
                            key={`empty-${i}`}
                            className="w-4 h-4 text-gray-300 fill-current"
                            viewBox="0 0 20 20"
                          >
                            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                          </svg>
                        ))}
                      </div>
                    );
                  };

                  return (
                    <div
                      key={review.reviewId}
                      className="border border-gray-200 rounded-lg p-6 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-start gap-4">
                        {/* Profile Photo */}
                        <div className="flex-shrink-0 relative">
                          {review.profilePhotoUrl ? (
                            <div className="relative w-12 h-12 rounded-full overflow-hidden">
                              <img
                                src={review.profilePhotoUrl}
                                alt={review.authorName}
                                className="w-full h-full object-cover"
                                onError={(e) => {
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
                          {/* Local Guide Badge */}
                          {review.isLocalGuide && (
                            <div
                              className="absolute w-4 h-4 bg-yellow-400 rounded-full ring-2 ring-white shadow-sm flex items-center justify-center"
                              style={{
                                bottom: '-2px',
                                right: '-2px',
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
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-lg font-semibold text-gray-900 mb-1">
                                {review.authorName}
                              </div>
                              {review.relativeTime && (
                                <div className="text-sm text-gray-500">
                                  {review.relativeTime}
                                </div>
                              )}
                            </div>
                            <div className="flex-shrink-0">
                              {renderStars(review.rating)}
                            </div>
                          </div>

                          <div className="text-gray-700 leading-relaxed">
                            {review.text}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
