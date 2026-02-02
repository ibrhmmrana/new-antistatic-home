"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { assembleReport } from "@/lib/report/assembleReport";
import { buildWebsiteSummary, buildGbpSummary } from "@/lib/report/aiDataSummaries";
import { diagnoseSnapshot } from "@/lib/diagnosis/diagnoseReport";
import type { ReportSchema } from "@/lib/report/types";
import type { Competitor } from "@/lib/report/types";
import type { ReportSnapshotV1, Prescription, MarkerLocation } from "@/lib/report/snapshotTypes";
import ReportLeftRail from "@/components/report/ReportLeftRail";
import ReportAntistaticIntro from "@/components/report/ReportAntistaticIntro";
import ReportTopCards from "@/components/report/ReportTopCards";
import ReportVisualInsights from "@/components/report/ReportVisualInsights";
import ReportSearchVisibility from "@/components/report/ReportSearchVisibility";
import ReportChecklistSection from "@/components/report/ReportChecklistSection";
import ReportAIAnalysis from "@/components/report/ReportAIAnalysis";
import ReportGoogleReviews from "@/components/report/ReportGoogleReviews";
import ReportInstagramComments from "@/components/report/ReportInstagramComments";
import PrescriptionDrawer from "@/components/report/PrescriptionDrawer";
import RecommendedFixStrip from "@/components/report/RecommendedFixStrip";
import AllModulesShowcase from "@/components/report/AllModulesShowcase";
import {
  TOP_CARDS_MODULES,
  VISUAL_INSIGHTS_MODULES,
  AI_ANALYSIS_MODULES,
  CHECKLIST_SECTION_MODULES,
} from "@/lib/diagnosis/sectionModuleMappings";

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
  const router = useRouter();
  const scanId = params?.scanId as string;
  const placeId = searchParams?.get('placeId') || '';
  const placeName = searchParams?.get('name') || '';
  const placeAddr = searchParams?.get('addr') || '';

  // Snapshot persistence state
  const [reportId, setReportId] = useState<string | null>(null);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [isPersisting, setIsPersisting] = useState(false);
  const [snapshotWaitTick, setSnapshotWaitTick] = useState(0); // Triggers re-evaluation during AI wait
  const persistedRef = useRef(false); // Prevent double-persist
  const markerLocationsRef = useRef<Record<string, MarkerLocation>>({}); // Collect marker locations for snapshot

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

  // Smart Diagnosis: drawer state (must be before any conditional return to satisfy Rules of Hooks)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activePrescription, setActivePrescription] = useState<Prescription | undefined>(undefined);
  const handleOpenPrescription = (prescription: Prescription) => {
    setActivePrescription(prescription);
    setDrawerOpen(true);
  };

  // Smart Diagnosis: compute prescriptions from report + aiAnalysis (for chips; also computed again at persist)
  const diagnosis = useMemo(() => {
    if (!report) return { version: 1 as const, generatedAt: new Date().toISOString(), prescriptions: {} };
    return diagnoseSnapshot({
      report,
      aiAnalysis: aiAnalysis ?? null,
      competitiveBenchmark: aiAnalysis?.competitiveBenchmark ?? null,
    });
  }, [report, aiAnalysis]);

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
        placeAddress: placesDetails?.address ?? placesDetails?.formatted_address ?? null,
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

    // Curated summaries for AI (not full crawler/GBP payloads)
    let websiteSummary = null;
    try {
      const websiteCrawlForSummary = websiteResult ?? (() => {
        const cached = localStorage.getItem(`analysis_${scanId}_website`);
        if (!cached) return null;
        try {
          return JSON.parse(cached);
        } catch {
          return null;
        }
      })();
      websiteSummary = websiteCrawlForSummary ? buildWebsiteSummary(websiteCrawlForSummary) : null;
    } catch (_) {}
    const gbpSummary = (placesDetails || gbpAnalysis?.analysis)
      ? buildGbpSummary(placesDetails ?? {}, gbpAnalysis?.analysis)
      : null;

    // Prepare data for AI analysis
    const aiData: any = {
      instagram: igResult?.profile ? {
        biography: igResult.profile.biography,
        website: igResult.profile.website,
        category: igResult.profile.category,
        followerCount: igResult.profile.followerCount,
        postCount: igResult.profile.postCount ?? igResult.posts?.length ?? 0,
        fullName: igResult.profile.fullName ?? undefined,
        isVerified: igResult.profile.isVerified ?? undefined,
        isBusinessAccount: igResult.profile.isBusinessAccount ?? undefined,
      } : undefined,
      facebook: fbResult?.profile ? {
        description: fbResult.profile.description,
        website: fbResult.profile.website,
        phone: fbResult.profile.phone,
        address: fbResult.profile.address,
        hours: fbResult.profile.hours,
      } : undefined,
      website: socialsData?.websiteUrl && !websiteSummary ? {
        description: null,
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
      instagramComments: (igResult?.comments?.length ?? 0) > 0
        ? igResult.comments.map((c: { text: string; postContext?: string }) => ({
            text: c.text,
            postContext: c.postContext,
          }))
        : undefined,
      instagramRecentCaptions: (igResult?.recentCaptions?.length ?? 0) > 0
        ? igResult.recentCaptions.map((cap: { caption: string; date?: string }) => ({
            caption: cap.caption,
            date: cap.date,
          }))
        : undefined,
      websiteSummary: websiteSummary ?? undefined,
      gbpSummary: gbpSummary ?? undefined,
    };

    // Add competitive context (competitors + user rank + user scores) from assembled report
    try {
      let websiteCrawlForAi = websiteResult;
      if (!websiteCrawlForAi) {
        const cached = localStorage.getItem(`analysis_${scanId}_website`);
        if (cached) {
          try {
            websiteCrawlForAi = JSON.parse(cached);
          } catch {}
        }
      }
      const assembledForAi = assembleReport({
        placeId,
        placeName: placesDetails?.name || undefined,
        placeAddress: placesDetails?.address ?? placesDetails?.formatted_address ?? undefined,
        placesDetails: placesDetails || undefined,
        websiteCrawl: websiteCrawlForAi || undefined,
        gbpAnalysis: gbpAnalysis?.analysis || undefined,
        socials: socialsData || undefined,
        instagram: igResult || undefined,
        facebook: fbResult || undefined,
      });
      const pct = (s: { score: number; maxScore: number }) =>
        s.maxScore > 0 ? Math.round((s.score / s.maxScore) * 100) : 0;
      aiData.competitors = assembledForAi.summaryCards.competitors.list.map((c: Competitor) => ({
        name: c.name,
        rating: c.rating,
        reviewCount: c.reviewCount,
        rank: c.rank,
        isTargetBusiness: c.isTargetBusiness,
      }));
      aiData.userRank = assembledForAi.summaryCards.competitors.userRank ?? null;
      aiData.userScores = {
        searchResults: pct(assembledForAi.scores.searchResults),
        websiteExperience: pct(assembledForAi.scores.websiteExperience),
        localListings: pct(assembledForAi.scores.localListings),
        socialPresence: pct(assembledForAi.scores.socialPresence),
      };
      aiData.searchVisibilityScore =
        typeof assembledForAi.searchVisibility?.visibilityScore === 'number'
          ? assembledForAi.searchVisibility.visibilityScore
          : undefined;
    } catch (_) {
      // Optional: skip competitive context if assembly fails
    }

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

  // === SNAPSHOT PERSISTENCE ===
  // Persist snapshot and redirect to shareable URL once AI analysis is ready
  // Track if we've started waiting for AI analysis
  const aiWaitStartedRef = useRef<number | null>(null);
  const AI_WAIT_TIMEOUT_MS = 60000; // Wait up to 60 seconds for AI analysis
  
  // Timer to trigger re-evaluation while waiting for AI
  useEffect(() => {
    // Only run timer if we're waiting for AI and haven't persisted yet
    if (persistedRef.current || isPersisting || reportId) return;
    if (!report || !placeId) return;
    
    const hasAiAnalysis = aiAnalysis && typeof aiAnalysis === 'object' && Object.keys(aiAnalysis).length > 0;
    if (hasAiAnalysis) return; // AI is ready, no need to poll
    
    // Poll every 2 seconds while waiting for AI
    const timer = setInterval(() => {
      setSnapshotWaitTick(t => t + 1);
    }, 2000);
    
    return () => clearInterval(timer);
  }, [report, placeId, aiAnalysis, isPersisting, reportId]);
  
  useEffect(() => {
    // Skip if already persisted or persisting
    if (persistedRef.current || isPersisting || reportId) return;
    
    // Need report to be assembled
    if (!report) return;
    
    // Need placeId
    if (!placeId) return;
    
    // Wait for AI analysis to be present (not just loading to finish)
    // This ensures the AI analysis block is visible before redirect
    const hasAiAnalysis = aiAnalysis && typeof aiAnalysis === 'object' && Object.keys(aiAnalysis).length > 0;
    
    if (!hasAiAnalysis) {
      // Start tracking wait time
      if (!aiWaitStartedRef.current) {
        aiWaitStartedRef.current = Date.now();
        console.log('[SNAPSHOT] Waiting for AI analysis to complete...');
        return;
      }
      
      // Check if still loading or within timeout
      const waited = Date.now() - aiWaitStartedRef.current;
      
      if (aiAnalysisLoading) {
        console.log(`[SNAPSHOT] AI analysis still loading (${Math.round(waited/1000)}s)...`);
        return;
      }
      
      if (waited < AI_WAIT_TIMEOUT_MS) {
        // Still within timeout, keep waiting
        console.log(`[SNAPSHOT] AI analysis not ready yet, waited ${Math.round(waited/1000)}s...`);
        return;
      }
      
      // Timeout reached, proceed without AI analysis
      console.log('[SNAPSHOT] AI analysis timeout after 60s, proceeding without it');
    } else {
      console.log('[SNAPSHOT] ✅ AI analysis ready, proceeding with persistence');
    }

    // Build the snapshot
    const buildAndPersistSnapshot = async () => {
      persistedRef.current = true;
      setIsPersisting(true);
      setPersistError(null);
      
      console.log('[SNAPSHOT] Building snapshot for persistence...');
      
      try {
        // Collect marker locations from search visibility results
        // This ensures maps work without API fetches in snapshot mode
        const markerLocations: Record<string, MarkerLocation> = {};
        
        // Collect placeIds from all map pack results
        const placeIdsToFetch: string[] = [];
        for (const query of report.searchVisibility.queries) {
          for (const result of query.mapPack.results) {
            if (result.placeId && !markerLocations[result.placeId]) {
              placeIdsToFetch.push(result.placeId);
            }
          }
        }
        
        // Fetch location data for each placeId (in parallel, with timeout)
        if (placeIdsToFetch.length > 0) {
          console.log(`[SNAPSHOT] Fetching locations for ${placeIdsToFetch.length} places...`);
          const locationPromises = placeIdsToFetch.map(async (pid) => {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 5000);
              const res = await fetch(`/api/places/details?placeId=${encodeURIComponent(pid)}`, {
                signal: controller.signal,
              });
              clearTimeout(timeoutId);
              if (res.ok) {
                const data = await res.json();
                if (data.location?.lat && data.location?.lng) {
                  markerLocations[pid] = {
                    placeId: pid,
                    lat: data.location.lat,
                    lng: data.location.lng,
                    name: data.name || '',
                  };
                }
              }
            } catch (e) {
              // Ignore - marker data is optional
            }
          });
          await Promise.allSettled(locationPromises);
        }
        
        // Get business photo URL from placesDetails
        let businessPhotoUrl: string | null = null;
        if (placesDetails?.photoUri) {
          businessPhotoUrl = placesDetails.photoUri;
        }
        
        // Smart Diagnosis: compute prescriptions before persist
        const diagnosisSnapshot = diagnoseSnapshot({
          report,
          aiAnalysis: aiAnalysis ?? null,
          competitiveBenchmark: aiAnalysis?.competitiveBenchmark ?? null,
        });

        // Build the snapshot
        const snapshot: ReportSnapshotV1 = {
          version: 1,
          createdAt: new Date().toISOString(),
          scanId,
          place: {
            placeId,
            name: placeName || report.meta.businessName,
            addr: placeAddr || report.meta.locationLabel,
            website: report.meta.websiteUrl,
            rating: report.meta.googleRating,
            reviewCount: report.meta.googleReviewCount,
            businessPhotoUrl,
          },
          report,
          aiAnalysis: aiAnalysis || null,
          reviews: reviews.map(r => ({
            reviewId: r.reviewId,
            authorName: r.authorName,
            profilePhotoUrl: r.profilePhotoUrl,
            relativeTime: r.relativeTime,
            rating: r.rating,
            text: r.text,
            isLocalGuide: r.isLocalGuide,
          })),
          supporting: {
            markerLocations,
          },
          instagramComments: (igResult?.comments?.length ?? 0) > 0
            ? igResult.comments.map((c: { text: string; postContext?: string; authorUsername?: string }) => ({
                text: c.text,
                postContext: c.postContext,
                authorUsername: c.authorUsername,
              }))
            : undefined,
          sentimentAnalysis: aiAnalysis?.sentimentAnalysis ?? undefined,
          thematicSentiment: aiAnalysis?.thematicSentiment ?? undefined,
          competitiveBenchmark: aiAnalysis?.competitiveBenchmark ?? undefined,
          diagnosis: diagnosisSnapshot,
        };
        
        console.log('[SNAPSHOT] Persisting snapshot...');
        
        // Persist to database
        const response = await fetch('/api/public/reports/persist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include', // Include email proof cookie
          body: JSON.stringify({ snapshot }),
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        
        const { reportId: newReportId, shareUrl } = await response.json();
        console.log('[SNAPSHOT] ✅ Persisted successfully:', { reportId: newReportId, shareUrl });
        
        setReportId(newReportId);
        
        // Redirect to shareable URL
        router.replace(shareUrl || `/r/${newReportId}`);
        
      } catch (error) {
        console.error('[SNAPSHOT] Persist failed:', error);
        setPersistError(error instanceof Error ? error.message : 'Failed to create shareable link');
        persistedRef.current = false; // Allow retry
      } finally {
        setIsPersisting(false);
      }
    };
    
    buildAndPersistSnapshot();
  }, [report, aiAnalysis, aiAnalysisLoading, reviews, igResult, placeId, placeName, placeAddr, scanId, placesDetails, router, isPersisting, reportId, snapshotWaitTick]);

  // Retry persist function (for error state)
  const retryPersist = () => {
    persistedRef.current = false;
    setPersistError(null);
  };

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

  // Fault flags for fix strips (outside blocks)
  const hasTopCardsFault =
    (report.summaryCards.impact.topProblems?.length ?? 0) > 0 ||
    report.sections.some((s) => s.checks.some((c) => c.status === "bad" || c.status === "warn")) ||
    (report.summaryCards.competitors.list.some((c) => c.isTargetBusiness) &&
      (report.summaryCards.competitors.list.find((c) => c.isTargetBusiness)?.rank ?? 1) > 1);
  const competitiveBenchmark = aiAnalysis?.competitiveBenchmark;
  const hasVisualFault =
    !!competitiveBenchmark && !!(competitiveBenchmark.potentialImpact || competitiveBenchmark.urgentGap);
  const hasAIFault =
    (aiAnalysis?.topPriorities?.length ?? 0) > 0 ||
    (aiAnalysis?.reviews?.painPoints?.length ?? 0) > 0 ||
    (aiAnalysis?.consistency?.inconsistencies?.length ?? 0) > 0 ||
    (aiAnalysis?.instagram?.issues?.length ?? 0) > 0 ||
    (aiAnalysis?.facebook?.issues?.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-white md:bg-[#f6f7f8] flex overflow-x-hidden">
      {/* Left Rail - hidden on mobile; score content shown in main flow via ReportTopCards etc. */}
      <ReportLeftRail scores={report.scores} reportId={reportId} />
      
      {/* Main Content - left margin on desktop so content doesn't sit under fixed sidebar */}
      <div className="flex-1 min-w-0 p-4 sm:p-6 md:p-8 pb-24 md:pb-8 md:ml-[21rem]">
        <div className="max-w-6xl mx-auto w-full max-w-full">
          {/* Persist Status Bar (Share button moved to left rail) */}
          <div className="flex justify-between items-center mb-4">
            <div>
              {isPersisting && (
                <span className="text-sm text-gray-500 flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  Creating shareable link...
                </span>
              )}
              {persistError && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-600">{persistError}</span>
                  <button
                    onClick={retryPersist}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Antistatic intro - top of report */}
          <ReportAntistaticIntro />

          {/* Competitive Edge - above Top Cards */}
          <ReportVisualInsights
            scores={report.scores}
            businessName={report.meta.businessName}
            thematicSentiment={aiAnalysis?.thematicSentiment}
            competitiveBenchmark={aiAnalysis?.competitiveBenchmark}
            aiAnalysis={aiAnalysis ?? null}
            isLoading={aiAnalysisLoading}
          />
          {competitiveBenchmark && (
            <RecommendedFixStrip
              modules={VISUAL_INSIGHTS_MODULES}
              hasAnyFault={hasVisualFault}
              onOpenPrescription={handleOpenPrescription}
            />
          )}

          {/* AI-Powered Analysis - above Top Cards */}
          <ReportAIAnalysis analysis={aiAnalysis} isLoading={aiAnalysisLoading} onlyTopPriorities />
          {aiAnalysis && (
            <RecommendedFixStrip
              modules={AI_ANALYSIS_MODULES}
              hasAnyFault={hasAIFault}
              onOpenPrescription={handleOpenPrescription}
            />
          )}

          {/* Top Cards - "We found N issues affecting your visibility" */}
          <ReportTopCards
            impact={report.summaryCards.impact}
            competitors={report.summaryCards.competitors}
            businessName={report.meta.businessName}
            websiteUrl={report.meta.websiteUrl}
            businessAvatar={report.summaryCards.impact.businessAvatar}
            placeId={report.meta.placeId}
            sections={report.sections}
            overallGrade={report.scores.overall.label}
            aiAnalysis={aiAnalysis}
          />
          <RecommendedFixStrip
            modules={TOP_CARDS_MODULES}
            hasAnyFault={hasTopCardsFault}
            onOpenPrescription={handleOpenPrescription}
          />

          {/* Search Visibility Table */}
          <ReportSearchVisibility
            searchVisibility={report.searchVisibility}
            targetPlaceId={report.meta.placeId}
            targetDomain={report.meta.websiteUrl || null}
          />
          
          {/* Summary Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-1">
              {totalChecks} things reviewed, {needWork} need work
            </h2>
            <p className="text-sm text-gray-600">See what's wrong and how to improve</p>
          </div>
          
          {/* Checklist Sections */}
          {report.sections.map((section) => {
            const sectionModules = CHECKLIST_SECTION_MODULES[section.id];
            const sectionNeedWork = section.checks.filter((c) => c.status === "bad" || c.status === "warn").length > 0;
            return (
              <div key={section.id}>
                <ReportChecklistSection section={section} />
                {sectionModules && (
                  <RecommendedFixStrip
                    modules={sectionModules}
                    hasAnyFault={sectionNeedWork}
                    onOpenPrescription={handleOpenPrescription}
                  />
                )}
              </div>
            );
          })}

          {/* How Antistatic can help - all 4 modules (pushes Creator Hub) */}
          <AllModulesShowcase />

          {/* Google Reviews Section - hidden */}
          {/* <ReportGoogleReviews reviews={reviews} /> */}

          {/* Instagram Comments (extracted from scraped posts) - hidden */}
          {/* <ReportInstagramComments comments={igResult?.comments ?? []} /> */}
        </div>
      </div>

      {/* Smart Diagnosis: prescription drawer */}
      <PrescriptionDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        prescription={activePrescription}
      />
    </div>
  );
}
