"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { assembleReport } from "@/lib/report/assembleReport";
import type { ReportSchema } from "@/lib/report/types";
import ReportRenderer from "@/components/report/ReportRenderer";

export default function AnalysisPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const scanId = params?.scanId as string;
  const placeId = searchParams?.get("placeId") || "";
  const name = searchParams?.get("name") || "";
  const addr = searchParams?.get("addr") || "";

  const [byScanChecked, setByScanChecked] = useState(false);
  const [existingReportId, setExistingReportId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [persistLoading, setPersistLoading] = useState(false);
  const [persistRetry, setPersistRetry] = useState(0);
  const persistedRef = useRef(false);
  const firstReportTimeRef = useRef<number | null>(null);

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

  const [report, setReport] = useState<ReportSchema | null>(null);
  const [placesDetails, setPlacesDetails] = useState<any>(null);
  const [socialsData, setSocialsData] = useState<any>(null);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
  const aiAnalysisTriggeredRef = useRef(false);

  // Redirect if report already persisted for this scanId (avoids rerun for old URL)
  useEffect(() => {
    if (!scanId) {
      setByScanChecked(true);
      return;
    }
    fetch(`/api/public/reports/by-scan?scanId=${encodeURIComponent(scanId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setByScanChecked(true);
        if (data?.reportId) setExistingReportId(data.reportId);
      })
      .catch(() => setByScanChecked(true));
  }, [scanId]);

  useEffect(() => {
    if (!existingReportId) return;
    router.replace(`/r/${existingReportId}`);
  }, [existingReportId, router]);

  // Load cached analysis results from localStorage (skip if redirecting to existing report)
  useEffect(() => {
    if (!byScanChecked || existingReportId) return;
    console.log("[ANALYSIS PAGE] Loading cached results from localStorage...");

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
            // Map visibility and Google search analysis run for every place (no website required).
            // Website crawler runs in addition when a website URL exists.
            const cacheMissingSearchVisibility = cachedWebsite ? (() => {
              try {
                const parsed = JSON.parse(cachedWebsite);
                return !parsed.search_visibility?.queries?.length;
              } catch (_) {
                return true;
              }
            })() : true;
            if (!cachedWebsite || cacheMissingSearchVisibility) {
              const placePayload = {
                placeId,
                placeName: data.name,
                placeAddress: data.address ?? data.formatted_address,
                placeTypes: data.types,
                latlng: data.location ? { lat: data.location.lat, lng: data.location.lng } : (data.geometry?.location ? { lat: data.geometry.location.lat, lng: data.geometry.location.lng } : null),
                rating: data.rating,
                reviewCount: data.userRatingsTotal ?? data.user_ratings_total,
              };
              // 1. Always run search visibility (map pack + organic rankings) so report has rankings regardless of website
              fetch("/api/scan/search-visibility", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(placePayload),
              })
                .then(res => res.json())
                .then(analysisData => {
                  if (analysisData && !analysisData.error) {
                    const baseResult = {
                      search_visibility: analysisData.search_visibility,
                      competitors_snapshot: analysisData.competitors_snapshot,
                      business_identity: analysisData.business_identity,
                      scrape_metadata: { timestamp: new Date().toISOString() },
                    };
                    const cached = localStorage.getItem(`analysis_${scanId}_website`);
                    const merged = cached ? (() => {
                      try {
                        const parsed = JSON.parse(cached);
                        return { ...parsed, ...baseResult };
                      } catch (_) {
                        return baseResult;
                      }
                    })() : baseResult;
                    localStorage.setItem(`analysis_${scanId}_website`, JSON.stringify(merged));
                    setWebsiteResult(merged);
                  }
                })
                .catch(err => {
                  console.error('[ANALYSIS PAGE] Search visibility/competitors analysis failed:', err);
                });
              // 2. If place has a website and we had no cache, also run website crawler and merge (crawl_map, site_overview, etc.); keep search_visibility from above
              if (!cachedWebsite && data.website) {
                fetch("/api/scan/website", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ url: data.website, maxDepth: 2, maxPages: 10 }),
                })
                  .then(res => res.json())
                  .then(crawlData => {
                    if (crawlData && !crawlData.error) {
                      const cached = localStorage.getItem(`analysis_${scanId}_website`);
                      let merged = { ...crawlData };
                      if (cached) {
                        try {
                          const parsed = JSON.parse(cached);
                          merged = {
                            ...crawlData,
                            search_visibility: (crawlData.search_visibility?.queries?.length ? crawlData.search_visibility : parsed.search_visibility) ?? crawlData.search_visibility,
                            competitors_snapshot: (crawlData.competitors_snapshot?.competitors_places?.length ? crawlData.competitors_snapshot : parsed.competitors_snapshot) ?? crawlData.competitors_snapshot,
                          };
                        } catch (_) {}
                      }
                      localStorage.setItem(`analysis_${scanId}_website`, JSON.stringify(merged));
                      setWebsiteResult(merged);
                    }
                  })
                  .catch(err => {
                    console.error('[ANALYSIS PAGE] Website crawler failed:', err);
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
    if (!byScanChecked || existingReportId || !placeId) return;
    try {
      // Prefer localStorage for website so we get latest merge (search_visibility + crawl_map when website crawler completes)
      let websiteCrawlData: typeof websiteResult = null;
      if (typeof window !== "undefined") {
        try {
          const cachedWebsite = localStorage.getItem(`analysis_${scanId}_website`);
          if (cachedWebsite) websiteCrawlData = JSON.parse(cachedWebsite);
        } catch (_) {}
      }
      if (!websiteCrawlData) websiteCrawlData = websiteResult;
      // Read from localStorage when state not yet updated (same race fix as websiteCrawlData)
      let gbpForAssemble = gbpAnalysis?.analysis;
      if (!gbpForAssemble && typeof window !== "undefined") {
        try {
          const cached = localStorage.getItem(`analysis_${scanId}_gbp`);
          if (cached) {
            const parsed = JSON.parse(cached);
            gbpForAssemble = parsed?.analysis ?? parsed;
          }
        } catch (_) {}
      }
      let socialsForAssemble = socialsData;
      if (!socialsForAssemble?.socialLinks?.length && typeof window !== "undefined") {
        try {
          const cached = localStorage.getItem(`onlinePresence_${scanId}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            socialsForAssemble = {
              websiteUrl: parsed.websiteUrl ?? null,
              websiteScreenshot: null,
              socialLinks: (parsed.socialLinks ?? []).map((l: { platform?: string; url?: string }) => ({ platform: l.platform, url: l.url, screenshot: null })),
            };
          }
        } catch (_) {}
      }
      let igForAssemble = igResult;
      if (!igForAssemble && typeof window !== "undefined") {
        try {
          const cached = localStorage.getItem(`analysis_${scanId}_instagram`);
          if (cached) igForAssemble = JSON.parse(cached);
        } catch (_) {}
      }
      let fbForAssemble = fbResult;
      if (!fbForAssemble && typeof window !== "undefined") {
        try {
          const cached = localStorage.getItem(`analysis_${scanId}_facebook`);
          if (cached) fbForAssemble = JSON.parse(cached);
        } catch (_) {}
      }

      const assembled = assembleReport({
        placeId,
        placeName: placesDetails?.name || gbpForAssemble?.businessName || null,
        placeAddress: placesDetails?.address ?? placesDetails?.formatted_address ?? null,
        placesDetails: placesDetails || undefined,
        websiteCrawl: websiteCrawlData || undefined,
        gbpAnalysis: gbpForAssemble || undefined,
        socials: socialsForAssemble || undefined,
        instagram: igForAssemble || undefined,
        facebook: fbForAssemble || undefined,
      });
      setReport(assembled);
    } catch (error) {
      console.error('[ANALYSIS PAGE] Failed to assemble report:', error);
    }
  }, [byScanChecked, existingReportId, placeId, placesDetails, websiteResult, gbpAnalysis, igResult, fbResult, socialsData]);

  // Trigger AI analysis when all data is available
  useEffect(() => {
    if (!byScanChecked || existingReportId || !placeId || !placesDetails) return;
    
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
  }, [byScanChecked, existingReportId, scanId, placeId, placesDetails, gbpAnalysis, igResult, fbResult, reviews, websiteResult, socialsData]);

  // Persist report once when ready, then redirect to share URL (retry via persistRetry)
  // Only persist when we have at least gbp or socials (or after fallback delay) so we don't save a partial report.
  useEffect(() => {
    if (!byScanChecked || existingReportId || !report || !placeId) return;
    if (persistedRef.current && persistRetry === 0) return;
    if (persistRetry > 0) persistedRef.current = false;

    if (firstReportTimeRef.current == null) firstReportTimeRef.current = Date.now();
    const hasGbpOrSocials = !!(gbpAnalysis || (socialsData?.socialLinks?.length ?? 0));
    const fallbackMs = 28000;
    const waitedLongEnough = firstReportTimeRef.current && Date.now() - firstReportTimeRef.current >= fallbackMs;
    if (!hasGbpOrSocials && !waitedLongEnough) return;

    // When place has a website, wait for website crawler (crawl_map) so "Get your website to the top" and "Improve the experience" sections have content
    const hasWebsite = !!(report.meta?.websiteUrl);
    let hasCrawlMap = false;
    if (typeof window !== "undefined" && hasWebsite) {
      try {
        const cached = localStorage.getItem(`analysis_${scanId}_website`);
        if (cached) {
          const parsed = JSON.parse(cached);
          hasCrawlMap = !!(parsed?.crawl_map?.length);
        }
      } catch (_) {}
    }
    if (hasWebsite && !hasCrawlMap && !waitedLongEnough) return;

    persistedRef.current = true;
    setPersistLoading(true);
    setPersistError(null);
    // Include reviews and AI from localStorage if not in state yet (race)
    let reviewsForPersist = reviews.length > 0 ? reviews : undefined;
    if (!reviewsForPersist && typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(`analysis_${scanId}_reviews`);
        if (cached) {
          const parsed = JSON.parse(cached);
          reviewsForPersist = parsed?.reviews ?? (Array.isArray(parsed) ? parsed : undefined);
        }
      } catch (_) {}
    }
    let aiForPersist = aiAnalysis ?? undefined;
    if (!aiForPersist && typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(`analysis_${scanId}_ai`);
        if (cached) aiForPersist = JSON.parse(cached);
      } catch (_) {}
    }
    const reportWithExtras = {
      ...report,
      reviews: reviewsForPersist,
      aiAnalysis: aiForPersist,
    };
    const sources: Record<string, unknown> = {};
    try {
      const cachedGbp = typeof window !== "undefined" ? localStorage.getItem(`analysis_${scanId}_gbp`) : null;
      if (cachedGbp) sources.gbp = JSON.parse(cachedGbp);
      const cachedWebsite = typeof window !== "undefined" ? localStorage.getItem(`analysis_${scanId}_website`) : null;
      if (cachedWebsite) sources.website = JSON.parse(cachedWebsite);
      const cachedReviews = typeof window !== "undefined" ? localStorage.getItem(`analysis_${scanId}_reviews`) : null;
      if (cachedReviews) {
        const parsed = JSON.parse(cachedReviews);
        sources.reviews = parsed?.reviews ?? parsed;
      }
      const cachedIg = typeof window !== "undefined" ? localStorage.getItem(`analysis_${scanId}_instagram`) : null;
      if (cachedIg) sources.instagram = JSON.parse(cachedIg);
      const cachedFb = typeof window !== "undefined" ? localStorage.getItem(`analysis_${scanId}_facebook`) : null;
      if (cachedFb) sources.facebook = JSON.parse(cachedFb);
    } catch (_) {}
    fetch("/api/public/reports/persist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        scanId,
        placeId,
        name: name || undefined,
        addr: addr || undefined,
        report: reportWithExtras,
        sources: Object.keys(sources).length > 0 ? sources : undefined,
      }),
    })
      .then((res) => {
        return res.json().then((data) => ({ ok: res.ok, data }));
      })
      .then(({ ok, data }) => {
        setPersistLoading(false);
        if (ok && data.reportId && data.shareUrl) {
          setShareUrl(data.shareUrl);
          router.replace(`/r/${data.reportId}`);
        } else if (!ok) {
          setPersistError(data?.error || "Failed to save share link");
          persistedRef.current = false;
        }
      })
      .catch((err) => {
        setPersistLoading(false);
        setPersistError(err?.message || "Failed to save share link");
        persistedRef.current = false;
      });
  }, [byScanChecked, existingReportId, report, placeId, name, addr, scanId, reviews, aiAnalysis, persistRetry, router, gbpAnalysis, socialsData]);

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

  const reportWithReviews = { ...report, reviews };
  const business = { placeId, name: name || report.meta.businessName, addr: addr || "" };

  return (
    <>
      {persistError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 shadow-sm max-w-md">
          <span className="text-sm text-amber-800">{persistError}</span>
          <button
            type="button"
            onClick={() => {
              setPersistError(null);
              setPersistRetry((r) => r + 1);
            }}
            className="text-sm font-medium text-amber-800 hover:text-amber-900 underline"
          >
            Retry saving share link
          </button>
        </div>
      )}
      <ReportRenderer
        report={reportWithReviews}
        business={business}
        aiAnalysis={aiAnalysis}
        aiAnalysisLoading={aiAnalysisLoading}
        shareUrl={shareUrl}
      />
    </>
  );
}
