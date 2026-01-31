"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Circle } from "lucide-react";
import { fetchWithTimeoutClient } from "@/lib/net/clientFetchWithTimeout";
import StageCompetitorMap from "./StageCompetitorMap";
import StageGoogleBusinessProfile from "./StageGoogleBusinessProfile";
import StageReviewSentiment from "./StageReviewSentiment";
import StagePhotoCollage from "./StagePhotoCollage";
import StageOnlinePresence from "./StageOnlinePresence";
import ScanLineOverlay from "./ScanLineOverlay";
import AIAgentLoadingScreen from "./AIAgentLoadingScreen";
import AIAgentModal from "./AIAgentModal";
import EmailVerificationModal from "./EmailVerificationModal";

interface ReportScanClientProps {
  scanId: string;
  placeId: string;
  name: string;
  addr: string;
}

interface PlaceDetails {
  website?: string | null;
}

// Shape from /api/places/details (used for search-visibility payload)
interface PlaceDetailsForSearch {
  name?: string;
  address?: string;
  formatted_address?: string;
  types?: string[];
  location?: { lat: number; lng: number };
  geometry?: { location?: { lat: number; lng: number } };
  rating?: number | null;
  userRatingsTotal?: number;
  user_ratings_total?: number;
  website?: string | null;
}

// Interface for online presence data to pass to StageOnlinePresence
interface OnlinePresenceResult {
  websiteUrl: string | null;
  websiteScreenshot: string | null;
  socialLinks: Array<{
    platform: string;
    url: string;
    screenshot: string | null;
  }>;
}

export default function ReportScanClient({
  scanId,
  placeId,
  name,
  addr,
}: ReportScanClientProps) {
  // Toggle for automatic stage progression
  // Set to true to enable automatic progression, false for manual only
  const AUTO_ADVANCE_STAGES = true;

  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [placeDetails, setPlaceDetails] = useState<PlaceDetails | null>(null);
  const [onlinePresenceData, setOnlinePresenceData] = useState<OnlinePresenceResult | null>(null);
  const [allAgentsDeployed, setAllAgentsDeployed] = useState(false);
  const [showEmailVerification, setShowEmailVerification] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [userProvidedUsernames, setUserProvidedUsernames] = useState<{ instagram?: string; facebook?: string } | null>(null);
  const [appInviteLoading, setAppInviteLoading] = useState(false);
  const [appInviteSent, setAppInviteSent] = useState(false);
  const [appInviteError, setAppInviteError] = useState<string | null>(null);
  const [gbpExtractedUsernames, setGbpExtractedUsernames] = useState<{ instagram?: string; facebook?: string } | null>(null);
  const scraperTriggeredRef = useRef(false); // Prevent duplicate scraper triggers
  const websiteScreenshotTriggeredRef = useRef(false); // Prevent duplicate website screenshot triggers
  const stage4AutoProgressRef = useRef(false); // Track if we've already auto-progressed from stage 4
  const analyzersTriggeredRef = useRef(false); // Prevent duplicate analyzer triggers
  const igScraperStartedRef = useRef(false); // Prevent duplicate Instagram scraper starts
  const fbScraperStartedRef = useRef(false); // Prevent duplicate Facebook scraper starts
  const competitorsPreloadedRef = useRef(false); // Track if competitors have been pre-loaded
  const reviewsPreloadedRef = useRef(false); // Track if reviews have been pre-loaded
  const photosPreloadedRef = useRef(false); // Track if photos have been pre-loaded
  
  // Track analyzer completion status
  const [analyzersComplete, setAnalyzersComplete] = useState({
    gbp: false,
    website: false,
    instagram: false,
    facebook: false,
    aiAnalysis: false, // Track AI analysis completion
  });
  const [allAnalyzersComplete, setAllAnalyzersComplete] = useState(false);

  // Start analysis function - called after email verification
  const startAnalysis = async () => {
    try {
      // Call the protected analysis start endpoint
      const response = await fetch("/api/public/analysis/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Include cookies
        body: JSON.stringify({
          scanId,
          placeId,
          placeName: name,
          address: addr,
        }),
      });

      if (!response.ok) {
        console.error("Failed to start analysis:", await response.text());
        return;
      }

      const data = await response.json();
      console.log("[ANALYSIS] Started:", data.jobId);
    } catch (error) {
      console.error("Error starting analysis:", error);
    }
  };

  // Show email verification modal when agents are deployed (stage 0)
  // Always show verification modal on every run, regardless of previous verification
  useEffect(() => {
    if (currentStep === 0 && allAgentsDeployed && !showEmailVerification) {
      // Wait a moment after agents deploy, then show modal
      const timer = setTimeout(() => {
        setShowEmailVerification(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [currentStep, allAgentsDeployed, showEmailVerification]);

  // Fetch place details and extract social links using ALL strategies on mount
  useEffect(() => {
    const fetchDetailsAndExtractSocials = async () => {
      let fetchedPlaceDetails: PlaceDetails | null = null;
      
      try {
        // Fetch place details first
        const response = await fetch(`/api/places/details?placeId=${encodeURIComponent(placeId)}`);
        if (response.ok) {
          const data = await response.json();
          fetchedPlaceDetails = data;
          setPlaceDetails(data);
        }
      } catch (error) {
        console.error("Failed to fetch place details:", error);
      }

      // Extract social links using ALL strategies (website, GBP, Google CSE)
      // This runs immediately on page load to prefilled usernames in the modal
      // The extraction was also triggered from the landing page button, but we check here too
      try {
        // Use the full social extraction API (all strategies: website, GBP, Google CSE)
        // This extracts usernames but does NOT trigger full analysis
        const socialResponse = await fetch('/api/scan/socials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessName: name,
            address: addr,
            scanId: `${scanId}_social_extract`, // Use different scanId to avoid conflicts
            websiteUrl: fetchedPlaceDetails?.website || null, // Use website from place details if available
          }),
        });

        if (socialResponse.ok) {
          const socialData = await socialResponse.json();
          console.log('[SOCIAL EXTRACTION] API response:', {
            hasSocialLinks: !!socialData.socialLinks,
            socialLinksCount: socialData.socialLinks?.length || 0,
            socialLinks: socialData.socialLinks?.map((l: any) => ({ platform: l.platform, url: l.url })) || [],
          });
          
          if (socialData.socialLinks && socialData.socialLinks.length > 0) {
            // Extract usernames from URLs using the same method as the scraper
            const extracted: { instagram?: string; facebook?: string } = {};
            
            const igLink = socialData.socialLinks.find((l: any) => l.platform === 'instagram');
            if (igLink && igLink.url) {
              console.log('[SOCIAL EXTRACTION] Processing Instagram URL:', igLink.url);
              const username = extractUsernameFromUrl(igLink.url, 'instagram');
              if (username) {
                extracted.instagram = username;
                console.log('[SOCIAL EXTRACTION] ✅ Found Instagram username:', username, 'from URL:', igLink.url);
              } else {
                console.log('[SOCIAL EXTRACTION] ⚠️ Failed to extract Instagram username from URL:', igLink.url);
              }
            } else {
              console.log('[SOCIAL EXTRACTION] ⚠️ No Instagram link found in socialLinks');
            }
            
            const fbLink = socialData.socialLinks.find((l: any) => l.platform === 'facebook');
            if (fbLink && fbLink.url) {
              console.log('[SOCIAL EXTRACTION] Processing Facebook URL:', fbLink.url);
              const username = extractUsernameFromUrl(fbLink.url, 'facebook');
              if (username) {
                extracted.facebook = username;
                console.log('[SOCIAL EXTRACTION] ✅ Found Facebook username:', username, 'from URL:', fbLink.url);
              } else {
                console.log('[SOCIAL EXTRACTION] ⚠️ Failed to extract Facebook username from URL:', fbLink.url);
              }
            } else {
              console.log('[SOCIAL EXTRACTION] ⚠️ No Facebook link found in socialLinks');
            }
            
            if (Object.keys(extracted).length > 0) {
              setGbpExtractedUsernames(extracted);
              console.log('[SOCIAL EXTRACTION] ✅ Successfully extracted usernames:', extracted);
            } else {
              console.log('[SOCIAL EXTRACTION] ⚠️ No usernames extracted from social links (extraction failed)');
            }
          } else {
            console.log('[SOCIAL EXTRACTION] ⚠️ No social links found in API response');
          }
        } else {
          const errorText = await socialResponse.text();
          console.error('[SOCIAL EXTRACTION] API returned error:', socialResponse.status, errorText);
        }
      } catch (socialError) {
        console.error('[SOCIAL EXTRACTION] Failed to extract social links:', socialError);
        // Don't block - this is just for prefilling
      }
    };

    fetchDetailsAndExtractSocials();
  }, [placeId, name, addr, scanId]);

  // Trigger website screenshot and scraper when user reaches stage 1 AND email is verified
  useEffect(() => {
    if (currentStep < 1) return; // Don't trigger until stage 1
    if (!emailVerified) return; // Don't trigger until email is verified
    
    // Function to capture website screenshot
    const captureWebsiteScreenshot = async (websiteUrl: string) => {
      // Prevent duplicate execution
      if (websiteScreenshotTriggeredRef.current) {
        console.log('[WEBSITE SCREENSHOT] Already triggered, skipping...');
        return;
      }
      
      // Check if already captured
      const existingScreenshot = localStorage.getItem(`websiteScreenshot_${scanId}`);
      if (existingScreenshot) {
        console.log('[WEBSITE SCREENSHOT] Already exists in localStorage, skipping...');
        return;
      }
      
      websiteScreenshotTriggeredRef.current = true; // Mark as triggered
      
      try {
        console.log(`[WEBSITE SCREENSHOT] Starting immediate capture for: ${websiteUrl}`);
        
        const response = await fetchWithTimeoutClient(
          '/api/scan/socials/screenshot',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              platform: 'website',
              url: websiteUrl,
              viewport: 'desktop',
            }),
          },
          20000
        );

        if (response.ok) {
          const result = await response.json();
          
          // Store the screenshot in React state so it can be passed to StageOnlinePresence
          // This avoids relying on the volatile serverless API cache
          if (result.success && result.screenshot) {
            console.log('[WEBSITE SCREENSHOT] ✅ Captured, storing in React state');
            setOnlinePresenceData(prev => ({
              websiteUrl: websiteUrl,
              websiteScreenshot: result.screenshot,
              socialLinks: prev?.socialLinks || [],
            }));
          } else {
            // Screenshot capture failed, but still store URL for fallback UI
            console.warn('[WEBSITE SCREENSHOT] ❌ Capture failed:', result.error || 'Unknown error');
            setOnlinePresenceData(prev => ({
              websiteUrl: websiteUrl,
              websiteScreenshot: null, // Explicitly null to trigger fallback UI
              socialLinks: prev?.socialLinks || [],
            }));
          }
        } else {
          console.error('Failed to capture website screenshot:', await response.text());
          // Still store URL for fallback UI
          setOnlinePresenceData(prev => ({
            websiteUrl: websiteUrl,
            websiteScreenshot: null,
            socialLinks: prev?.socialLinks || [],
          }));
          websiteScreenshotTriggeredRef.current = false; // Reset on failure to allow retry
        }
      } catch (error) {
        console.error('Error capturing website screenshot:', error);
        // Still store URL for fallback UI
        setOnlinePresenceData(prev => ({
          websiteUrl: websiteUrl,
          websiteScreenshot: null,
          socialLinks: prev?.socialLinks || [],
        }));
        websiteScreenshotTriggeredRef.current = false; // Reset on failure to allow retry
      }
    };


    // Trigger scraper API call when user reaches stage 1
    // This runs in the background: extracts links, then captures all screenshots in parallel
    // Results are stored and available when user reaches stage 5 (Online presence analysis)
    const triggerScraper = async () => {
      // Wait for placeDetails to be fetched so we can pass the website URL
      // If placeDetails is not yet available, we'll fetch it here
      let websiteUrl: string | null = null;
      if (placeDetails?.website) {
        websiteUrl = placeDetails.website;
      } else {
        // Fetch place details if not already available
        try {
          const detailsResponse = await fetch(`/api/places/details?placeId=${encodeURIComponent(placeId)}`);
          if (detailsResponse.ok) {
            const detailsData = await detailsResponse.json();
            websiteUrl = detailsData.website || null;
          }
        } catch (error) {
          console.warn('Failed to fetch website URL from GBP API:', error);
        }
      }

      try {
        // Use user-provided usernames if available (from modal confirmation)
        // Otherwise, let the API extract from URLs
        const initialSocialLinks = [];
        if (userProvidedUsernames?.instagram) {
          initialSocialLinks.push({ platform: 'instagram', url: `https://www.instagram.com/${userProvidedUsernames.instagram}/` });
        }
        if (userProvidedUsernames?.facebook) {
          initialSocialLinks.push({ platform: 'facebook', url: `https://www.facebook.com/${userProvidedUsernames.facebook}/` });
        }

        const response = await fetch('/api/scan/socials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessName: name,
            address: addr,
            scanId,
            websiteUrl, // Pass website URL from GBP API
            initialSocialLinks: initialSocialLinks.length > 0 ? initialSocialLinks : undefined, // Use approved usernames
          }),
        });

        if (response.ok) {
          const result = await response.json();
          
          // Store the FULL result in React state for immediate access by StageOnlinePresence
          // This is the key fix: serverless API cache is volatile, so we keep data in React state
          const socialLinksDebug = (result.socialLinks || []).map((link: any) => ({
            platform: link.platform,
            hasScreenshot: !!link.screenshot,
            screenshotLength: link.screenshot?.length || 0,
            url: link.url,
          }));
          console.log('[SCRAPER] ✅ Result received, storing in React state:', {
            hasWebsiteScreenshot: !!result.websiteScreenshot,
            websiteUrl: result.websiteUrl,
            socialLinksCount: result.socialLinks?.length || 0,
            socialLinksDetail: socialLinksDebug,
          });
          
          setOnlinePresenceData(prev => ({
            websiteUrl: result.websiteUrl || prev?.websiteUrl || null,
            // Use result screenshot, or keep existing from immediate capture
            websiteScreenshot: result.websiteScreenshot || prev?.websiteScreenshot || null,
            socialLinks: (result.socialLinks || []).map((link: any) => ({
              platform: link.platform,
              url: link.url,
              screenshot: link.screenshot || null,
            })),
          }));
          
          // Store metadata to localStorage (NOT the actual base64 data - too large)
          const dataToStore = {
            websiteUrl: result.websiteUrl,
            hasWebsiteScreenshot: !!result.websiteScreenshot,
            socialLinks: (result.socialLinks || []).map((link: any) => ({
              platform: link.platform,
              url: link.url,
              hasScreenshot: !!link.screenshot,
            })),
            timestamp: Date.now(),
            completed: true, // Flag to indicate scraper has completed
            screenshotsReady: !!(result.websiteScreenshot || (result.socialLinks && result.socialLinks.some((l: any) => l.screenshot))),
          };
          
          try {
            localStorage.setItem(`onlinePresence_${scanId}`, JSON.stringify(dataToStore));
          } catch (error) {
            console.warn('Failed to store in localStorage (quota exceeded?):', error);
          }
        }
      } catch (err) {
        console.error('Error triggering scraper:', err);
        // Don't block UI if scraper fails
      }
    };

    // Only trigger if we don't already have results AND haven't triggered yet
    const existingData = localStorage.getItem(`onlinePresence_${scanId}`);
    if (!existingData && !scraperTriggeredRef.current) {
      scraperTriggeredRef.current = true; // Mark as triggered
      triggerScraper();
    }
    
    // Capture website screenshot if website URL is available
    if (placeDetails?.website) {
      captureWebsiteScreenshot(placeDetails.website);
    }
  }, [currentStep, emailVerified, placeId, name, addr, scanId, placeDetails, userProvidedUsernames]);

  // Trigger all analyzers during onboarding (runs in background, stores results in localStorage)
  // Only trigger when user reaches stage 1 (Your online profile review) AND email is verified
  useEffect(() => {
    if (currentStep < 1) return; // Don't trigger until stage 1
    if (!emailVerified) return; // Don't trigger until email is verified
    if (analyzersTriggeredRef.current) return; // Already triggered
    
    const triggerAnalyzers = async () => {
      analyzersTriggeredRef.current = true;
      console.log('[ANALYZERS] Starting background analysis during onboarding...');
      
      const promises: Promise<void>[] = [];
      
      // 1. GBP Analyzer - trigger immediately when placeId is available
      if (placeId) {
        const gbpCacheKey = `analysis_${scanId}_gbp`;
        const existingGbp = localStorage.getItem(gbpCacheKey);
        if (existingGbp) {
          setAnalyzersComplete(prev => ({ ...prev, gbp: true }));
        } else {
          promises.push((async () => {
            try {
              console.log('[ANALYZERS] Triggering GBP analyzer...');
              const response = await fetchWithTimeoutClient(
                `/api/gbp/place-details?place_id=${encodeURIComponent(placeId)}`,
                undefined,
                20000
              );
              if (response.ok) {
                const data = await response.json();
                localStorage.setItem(gbpCacheKey, JSON.stringify(data));
                console.log('[ANALYZERS] ✅ GBP analyzer complete');
              }
            } catch (error) {
              console.error('[ANALYZERS] ❌ GBP analyzer failed:', error);
            } finally {
              setAnalyzersComplete(prev => ({ ...prev, gbp: true }));
            }
          })());
        }
      } else {
        setAnalyzersComplete(prev => ({ ...prev, gbp: true })); // No GBP to analyze
      }
      
      // 2. Search visibility (map + organic rankings) always; website crawler when website URL exists
      const websiteCacheKey = `analysis_${scanId}_website`;
      const checkWebsiteUrl = async () => {
        let websiteUrl: string | null = null;
        if (placeDetails?.website) {
          websiteUrl = placeDetails.website;
        } else {
          try {
            const response = await fetch(`/api/places/details?placeId=${encodeURIComponent(placeId)}`);
            if (response.ok) {
              const data = await response.json();
              websiteUrl = data.website || null;
            }
          } catch (error) {
            console.warn('[ANALYZERS] Failed to fetch website URL:', error);
          }
        }
        if (!websiteUrl && onlinePresenceData?.websiteUrl) websiteUrl = onlinePresenceData.websiteUrl;
        if (!websiteUrl) {
          const onlinePresenceMetadata = localStorage.getItem(`onlinePresence_${scanId}`);
          if (onlinePresenceMetadata) {
            try {
              const parsed = JSON.parse(onlinePresenceMetadata);
              websiteUrl = parsed.websiteUrl || null;
            } catch (_) {}
          }
        }

        let details: PlaceDetailsForSearch | null = placeDetails ? { ...placeDetails } : null;
        if (!details && placeId) {
          try {
            const res = await fetch(`/api/places/details?placeId=${encodeURIComponent(placeId)}`);
            details = res.ok ? (await res.json()) as PlaceDetailsForSearch : null;
          } catch (_) {
            details = null;
          }
        }

        // Always run search visibility so report has map/organic rankings regardless of website
        const existingWebsite = localStorage.getItem(websiteCacheKey);
        const cacheMissingSearchVisibility = existingWebsite ? (() => {
          try {
            const parsed = JSON.parse(existingWebsite);
            return !parsed.search_visibility?.queries?.length;
          } catch (_) {
            return true;
          }
        })() : true;
        if (placeId && details && (!existingWebsite || cacheMissingSearchVisibility)) {
          fetch("/api/scan/search-visibility", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              placeId,
              placeName: details.name,
              placeAddress: details.address ?? details.formatted_address,
              placeTypes: details.types,
              latlng: details.location ? { lat: details.location.lat, lng: details.location.lng } : (details.geometry?.location ? { lat: details.geometry.location.lat, lng: details.geometry.location.lng } : null),
              rating: details.rating,
              reviewCount: details.userRatingsTotal ?? details.user_ratings_total,
            }),
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
                const cached = localStorage.getItem(websiteCacheKey);
                const merged = cached ? (() => {
                  try {
                    const parsed = JSON.parse(cached);
                    return { ...parsed, ...baseResult };
                  } catch (_) {
                    return baseResult;
                  }
                })() : baseResult;
                localStorage.setItem(websiteCacheKey, JSON.stringify(merged));
              }
            })
            .catch(err => console.error('[ANALYZERS] Search visibility failed:', err));
        }

        if (websiteUrl) {
          if (existingWebsite) {
            setAnalyzersComplete(prev => ({ ...prev, website: true }));
          } else {
            try {
              console.log('[ANALYZERS] Triggering website crawler...');
              const response = await fetch("/api/scan/website", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: websiteUrl, maxDepth: 2, maxPages: 10 }),
              });
              if (response.ok) {
                const data = await response.json();
                const cached = localStorage.getItem(websiteCacheKey);
                const merged = cached ? (() => {
                  try {
                    const parsed = JSON.parse(cached);
                    return {
                      ...data,
                      search_visibility: (data.search_visibility?.queries?.length ? data.search_visibility : parsed.search_visibility) ?? data.search_visibility,
                      competitors_snapshot: (data.competitors_snapshot?.competitors_places?.length ? data.competitors_snapshot : parsed.competitors_snapshot) ?? data.competitors_snapshot,
                    };
                  } catch (_) {
                    return data;
                  }
                })() : data;
                localStorage.setItem(websiteCacheKey, JSON.stringify(merged));
                console.log('[ANALYZERS] ✅ Website crawler complete');
              }
            } catch (error) {
              console.error('[ANALYZERS] ❌ Website crawler failed:', error);
            }
            setAnalyzersComplete(prev => ({ ...prev, website: true }));
          }
        } else {
          setAnalyzersComplete(prev => ({ ...prev, website: true }));
        }
      };
      
      // 3. Social Scrapers - check and trigger only if not already started by the dedicated effect
      const checkSocialLinks = (socialLinks?: Array<{ platform: string; url: string }>) => {
        // Use provided socialLinks or get from localStorage
        let linksToCheck = socialLinks;
        if (!linksToCheck) {
          const onlinePresenceMetadata = localStorage.getItem(`onlinePresence_${scanId}`);
          if (onlinePresenceMetadata) {
            const parsed = JSON.parse(onlinePresenceMetadata);
            linksToCheck = parsed.socialLinks;
          }
        }
        
        if (!linksToCheck || linksToCheck.length === 0) {
          // No social links, mark both as complete
          setAnalyzersComplete(prev => ({ ...prev, instagram: true, facebook: true }));
          return;
        }
        
        // Check if we have Instagram/Facebook links
        const hasInstagram = linksToCheck.some((l: any) => l.platform === 'instagram');
        const hasFacebook = linksToCheck.some((l: any) => l.platform === 'facebook');
        
        // Mark as complete if no links exist
        if (!hasInstagram) setAnalyzersComplete(prev => ({ ...prev, instagram: true }));
        if (!hasFacebook) setAnalyzersComplete(prev => ({ ...prev, facebook: true }));
        
        // NOTE: Actual scraper triggering is handled by the dedicated useEffect that watches
        // onlinePresenceData - this function just marks complete when there are no links
        // The refs (igScraperStartedRef, fbScraperStartedRef) prevent duplicate triggers
        console.log('[ANALYZERS] checkSocialLinks called, scrapers managed by dedicated effect');
      };
      
      // Check website URL immediately, then check for social links
      checkWebsiteUrl();
      
      // Check social links immediately from onlinePresenceData (React state)
      if (onlinePresenceData?.socialLinks && onlinePresenceData.socialLinks.length > 0) {
        console.log('[ANALYZERS] Social links found in React state, triggering scrapers immediately...');
        checkSocialLinks(onlinePresenceData.socialLinks.map(l => ({ platform: l.platform, url: l.url })));
      } else {
        // Poll for social links (they become available after scraper completes)
        const socialLinksInterval = setInterval(() => {
          // Check React state first (fastest)
          if (onlinePresenceData?.socialLinks && onlinePresenceData.socialLinks.length > 0) {
            clearInterval(socialLinksInterval);
            console.log('[ANALYZERS] Social links found in React state (polling), triggering scrapers...');
            checkSocialLinks(onlinePresenceData.socialLinks.map(l => ({ platform: l.platform, url: l.url })));
            return;
          }
          
          // Fallback to localStorage
          const onlinePresenceMetadata = localStorage.getItem(`onlinePresence_${scanId}`);
          if (onlinePresenceMetadata) {
            const parsed = JSON.parse(onlinePresenceMetadata);
            if (parsed.completed && parsed.socialLinks) {
              clearInterval(socialLinksInterval);
              console.log('[ANALYZERS] Social links found in localStorage (polling), triggering scrapers...');
              checkSocialLinks();
            }
          }
        }, 1000); // Check every 1 second for faster response
        
        // Fallback: Mark social analyzers as complete after 60 seconds if not already done
        setTimeout(() => {
          clearInterval(socialLinksInterval);
          setAnalyzersComplete(prev => {
            if (!prev.instagram || !prev.facebook) {
              console.log('[ANALYZERS] Fallback timeout - marking social analyzers as complete');
            }
            return { ...prev, instagram: true, facebook: true };
          });
        }, 60000);
      }
      
      // Run GBP analyzer immediately (doesn't depend on other data)
      await Promise.allSettled(promises);
      console.log('[ANALYZERS] All analyzers triggered');
    };
    
    // Trigger analyzers after a short delay to allow placeDetails to load
    const timeout = setTimeout(() => {
      triggerAnalyzers();
    }, 1000);
    
    return () => clearTimeout(timeout);
  }, [currentStep, emailVerified, placeId, scanId, placeDetails, onlinePresenceData]);
  
  // Trigger scrapers using user-provided usernames (if available) or extracted from URLs
  useEffect(() => {
    // Priority 1: Use user-provided usernames if available
    if (userProvidedUsernames) {
      // Trigger Instagram scraper with user-provided username
      if (userProvidedUsernames.instagram && !igScraperStartedRef.current) {
        const username = userProvidedUsernames.instagram;
        const igCacheKey = `analysis_${scanId}_instagram`;
        const existingIg = localStorage.getItem(igCacheKey);
        if (!existingIg) {
          igScraperStartedRef.current = true;
          console.log('[SCRAPERS] 🚀 Starting Instagram API scraper with USER-PROVIDED username:', username);
          (async () => {
            try {
              const response = await fetch("/api/test/instagram-api", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                  username,
                  includeComments: false // Don't need comments for analysis
                }),
              });
              if (response.ok) {
                const data = await response.json();
                // Transform new API response to expected format
                const transformed = transformInstagramApiResponse(data);
                localStorage.setItem(igCacheKey, JSON.stringify(transformed));
                console.log('[SCRAPERS] ✅ Instagram API scraper complete');
              }
            } catch (error) {
              console.error('[SCRAPERS] ❌ Instagram scraper failed:', error);
            } finally {
              setAnalyzersComplete(prev => ({ ...prev, instagram: true }));
            }
          })();
        } else {
          console.log('[SCRAPERS] Instagram already cached');
          setAnalyzersComplete(prev => ({ ...prev, instagram: true }));
        }
      }
      
      // Trigger Facebook scraper with user-provided username
      if (userProvidedUsernames.facebook && !fbScraperStartedRef.current) {
        const username = userProvidedUsernames.facebook;
        const fbCacheKey = `analysis_${scanId}_facebook`;
        const existingFb = localStorage.getItem(fbCacheKey);
        if (!existingFb) {
          fbScraperStartedRef.current = true;
          console.log('[SCRAPERS] 🚀 Starting Facebook scraper with USER-PROVIDED username:', username);
          (async () => {
            try {
              const response = await fetch("/api/test/facebook-scrape", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username }),
              });
              if (response.ok) {
                const data = await response.json();
                localStorage.setItem(fbCacheKey, JSON.stringify(data));
                console.log('[SCRAPERS] ✅ Facebook scraper complete');
              }
            } catch (error) {
              console.error('[SCRAPERS] ❌ Facebook scraper failed:', error);
            } finally {
              setAnalyzersComplete(prev => ({ ...prev, facebook: true }));
            }
          })();
        } else {
          console.log('[SCRAPERS] Facebook already cached');
          setAnalyzersComplete(prev => ({ ...prev, facebook: true }));
        }
      }
      
      // Mark as complete if username not provided
      if (!userProvidedUsernames.instagram) {
        setAnalyzersComplete(prev => ({ ...prev, instagram: true }));
      }
      if (!userProvidedUsernames.facebook) {
        setAnalyzersComplete(prev => ({ ...prev, facebook: true }));
      }
      
      return; // Don't proceed with URL extraction if user provided usernames
    }
    
    // Priority 2: Fall back to extracting from URLs if no user-provided usernames
    if (!onlinePresenceData?.socialLinks || onlinePresenceData.socialLinks.length === 0) {
      return;
    }
    
    console.log('[SCRAPERS] No user-provided usernames, extracting from URLs...');
    
    // Check if we have Instagram/Facebook links
    const igLink = onlinePresenceData.socialLinks.find(l => l.platform === 'instagram');
    const fbLink = onlinePresenceData.socialLinks.find(l => l.platform === 'facebook');
    
    // Trigger Instagram scraper (if not already started)
    if (igLink && !igScraperStartedRef.current) {
      const username = extractUsernameFromUrl(igLink.url, 'instagram');
      if (username) {
        const igCacheKey = `analysis_${scanId}_instagram`;
        const existingIg = localStorage.getItem(igCacheKey);
        if (!existingIg) {
          igScraperStartedRef.current = true; // Mark as started BEFORE async call
          console.log('[SCRAPERS] 🚀 Starting Instagram API scraper NOW for:', username);
          (async () => {
            try {
              const response = await fetch("/api/test/instagram-api", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                  username,
                  includeComments: false // Don't need comments for analysis
                }),
              });
              if (response.ok) {
                const data = await response.json();
                // Transform new API response to expected format
                const transformed = transformInstagramApiResponse(data);
                localStorage.setItem(igCacheKey, JSON.stringify(transformed));
                console.log('[SCRAPERS] ✅ Instagram API scraper complete');
              }
            } catch (error) {
              console.error('[SCRAPERS] ❌ Instagram API scraper failed:', error);
            } finally {
              setAnalyzersComplete(prev => ({ ...prev, instagram: true }));
            }
          })();
        } else {
          console.log('[SCRAPERS] Instagram already cached');
          setAnalyzersComplete(prev => ({ ...prev, instagram: true }));
        }
      } else {
        setAnalyzersComplete(prev => ({ ...prev, instagram: true }));
      }
    }
    
    // Trigger Facebook scraper (if not already started) - IN PARALLEL with Instagram
    if (fbLink && !fbScraperStartedRef.current) {
      const username = extractUsernameFromUrl(fbLink.url, 'facebook');
      if (username) {
        const fbCacheKey = `analysis_${scanId}_facebook`;
        const existingFb = localStorage.getItem(fbCacheKey);
        if (!existingFb) {
          fbScraperStartedRef.current = true; // Mark as started BEFORE async call
          console.log('[SCRAPERS] 🚀 Starting Facebook scraper NOW for:', username);
          (async () => {
            try {
              const response = await fetch("/api/test/facebook-scrape", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username }),
              });
              if (response.ok) {
                const data = await response.json();
                localStorage.setItem(fbCacheKey, JSON.stringify(data));
                console.log('[SCRAPERS] ✅ Facebook scraper complete');
              }
            } catch (error) {
              console.error('[SCRAPERS] ❌ Facebook scraper failed:', error);
            } finally {
              setAnalyzersComplete(prev => ({ ...prev, facebook: true }));
            }
          })();
        } else {
          console.log('[SCRAPERS] Facebook already cached');
          setAnalyzersComplete(prev => ({ ...prev, facebook: true }));
        }
      } else {
        setAnalyzersComplete(prev => ({ ...prev, facebook: true }));
      }
    }
    
    // Mark complete if no links found
    if (!igLink) setAnalyzersComplete(prev => ({ ...prev, instagram: true }));
    if (!fbLink) setAnalyzersComplete(prev => ({ ...prev, facebook: true }));
    
  }, [onlinePresenceData, scanId]);
  
  // Mark analyzers as complete when they finish (for UI state, but don't wait for navigation)
  useEffect(() => {
    const { gbp, website, instagram, facebook } = analyzersComplete;
    const allComplete = gbp && website && instagram && facebook;
    
    if (allComplete && !allAnalyzersComplete) {
      console.log('[ANALYZERS] ✅ All core analyzers complete (GBP, website, Instagram, Facebook)!');
      console.log('[ANALYZERS] ℹ️ AI analysis will load in background on analysis page');
      
      setAllAnalyzersComplete(true);
      // Note: Navigation now happens immediately when Stage 5 appears, not when analyzers complete
    }
  }, [analyzersComplete, allAnalyzersComplete]);

  // AI analysis is no longer required for navigation - it loads in background on analysis page
  // Removed polling logic to eliminate 60-second delay

  // Navigate when Stage 5 appears AND analyzers complete (with minimum delay to show Stage 5)
  // This ensures users see Stage 5 AND the report has data when it loads
  const stage5NavigationRef = useRef(false);
  const stage5AppearedTimeRef = useRef<number | null>(null);
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track when Stage 5 appears
  useEffect(() => {
    if (currentStep === 5 && !stage5NavigationRef.current) {
      stage5NavigationRef.current = true;
      const stage5AppearedTime = Date.now();
      stage5AppearedTimeRef.current = stage5AppearedTime;
      
      console.log('[NAVIGATION] Stage 5 appeared, waiting for analyzers to complete (min 4.5s delay)...');
    }
  }, [currentStep, scanId, placeId]);
  
  // Navigate when analyzers complete AND minimum delay has passed
  useEffect(() => {
    // Cleanup any existing timeout
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }
    
    if (currentStep === 5 && allAnalyzersComplete && stage5AppearedTimeRef.current) {
      const elapsed = Date.now() - stage5AppearedTimeRef.current;
      const minDelay = 4500; // Minimum 4.5 seconds to show Stage 5
      const remainingDelay = Math.max(0, minDelay - elapsed);
      
      navigationTimeoutRef.current = setTimeout(() => {
        console.log('[NAVIGATION] Analyzers complete, navigating to report page...');
        
        router.push(`/report/${scanId}/analysis?placeId=${encodeURIComponent(placeId)}&name=${encodeURIComponent(name)}&addr=${encodeURIComponent(addr)}`);
        
        // Reset refs to prevent duplicate navigation
        stage5AppearedTimeRef.current = null;
        navigationTimeoutRef.current = null;
      }, remainingDelay);
    }
    
    // Cleanup timeout on unmount
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
        navigationTimeoutRef.current = null;
      }
    };
  }, [currentStep, allAnalyzersComplete, scanId, placeId, name, addr, router]);

  // Track timing: log when last stage (stage 5) appears and every 3 seconds after
  const lastStageTimingRef = useRef<{ logged: boolean; intervalId: NodeJS.Timeout | null }>({
    logged: false,
    intervalId: null,
  });

  useEffect(() => {
    if (currentStep === 5 && !lastStageTimingRef.current.logged) {
      // First time stage 5 appears
      lastStageTimingRef.current.logged = true;
      const stage5StartTime = Date.now();
      
      console.log('[TIMING] ⏱️ Last stage (Stage 5) appeared at:', new Date(stage5StartTime).toISOString());
      
      // Set up interval to log every 3 seconds
      lastStageTimingRef.current.intervalId = setInterval(() => {
        const elapsed = Date.now() - stage5StartTime;
        const elapsedSeconds = Math.floor(elapsed / 1000);
        
        console.log(`[TIMING] ⏱️ ${elapsedSeconds}s elapsed since last stage appeared`);
      }, 3000);
    }
    
    // Cleanup interval when component unmounts or stage changes
    return () => {
      if (lastStageTimingRef.current.intervalId) {
        clearInterval(lastStageTimingRef.current.intervalId);
        lastStageTimingRef.current.intervalId = null;
      }
    };
  }, [currentStep]);

  // Note: allAgentsDeployed callback is kept for potential future use
  // but deployment screen is now controlled by currentStep === 0
  
  // Pre-load competitors data while user is on stage 0 (Your online profile review)
  useEffect(() => {
    // Only pre-load if we haven't already and we're on stage 0 or initial loading
    if (competitorsPreloadedRef.current) return;
    
    // Check if we already have cached data
    const cachedData = localStorage.getItem(`competitors_${scanId}`);
    if (cachedData) {
      competitorsPreloadedRef.current = true;
      return;
    }
    
    // Pre-fetch competitors data in the background
    const preloadCompetitors = async () => {
      try {
        const response = await fetch(
          `/api/places/competitors?placeId=${encodeURIComponent(placeId)}`
        );
        
        if (response.ok) {
          const data = await response.json();
          // Store in localStorage for StageCompetitorMap to use
          localStorage.setItem(`competitors_${scanId}`, JSON.stringify(data));
          competitorsPreloadedRef.current = true;
          console.log('[PRELOAD] Competitors data pre-loaded successfully');
        }
      } catch (error) {
        console.error('[PRELOAD] Failed to pre-load competitors:', error);
        // Don't block UI if pre-load fails
      }
    };
    
    preloadCompetitors();
  }, [placeId, scanId]);
  
  // Pre-load reviews data while user is on stage 1 (competitors)
  useEffect(() => {
    // Only pre-load if we haven't already and we're on stage 1
    if (reviewsPreloadedRef.current) return;
    
    // Check if we already have cached data
    const cachedData = localStorage.getItem(`reviews_${scanId}`);
    if (cachedData) {
      reviewsPreloadedRef.current = true;
      return;
    }
    
    // Pre-fetch reviews data in the background
    const preloadReviews = async () => {
      try {
        const response = await fetchWithTimeoutClient(
          `/api/places/reviews?placeId=${encodeURIComponent(placeId)}`,
          undefined,
          20000
        );
        
        if (response.ok) {
          const data = await response.json();
          // Store in localStorage for StageReviewSentiment to use
          localStorage.setItem(`reviews_${scanId}`, JSON.stringify(data));
          reviewsPreloadedRef.current = true;
          console.log('[PRELOAD] Reviews data pre-loaded successfully');
        }
      } catch (error) {
        console.error('[PRELOAD] Failed to pre-load reviews:', error);
        // Don't block UI if pre-load fails
      }
    };
    
    // Only preload when user is on competitors stage (stage 1)
    if (currentStep === 1) {
      preloadReviews();
    }
  }, [placeId, scanId, currentStep]);
  
  // Helper function to extract username from social URL
  /**
   * Transforms the new Instagram API response to the format expected by the report analysis
   * New API returns: { profile: InstagramProfile, posts: InstagramPost[], scrapedAt: string }
   * Expected format: { profile: { biography, website, category, followerCount }, posts: [{ date, likeCount, commentCount }] }
   */
  function transformInstagramApiResponse(apiResponse: any): any {
    return {
      profile: {
        biography: apiResponse.profile?.biography || null,
        website: apiResponse.profile?.website || null,
        category: apiResponse.profile?.category || null,
        followerCount: apiResponse.profile?.followerCount || null,
      },
      posts: (apiResponse.posts || []).map((post: any) => ({
        date: post.takenAt ? new Date(post.takenAt * 1000).toISOString() : null, // Convert Unix timestamp to ISO string
        likeCount: post.likeCount || null,
        commentCount: post.commentCount || null,
      })),
    };
  }

  function extractUsernameFromUrl(url: string, platform: 'instagram' | 'facebook'): string | null {
    try {
      const urlObj = new URL(url);
      
      if (platform === 'instagram') {
        // Ensure it's an Instagram URL
        if (!urlObj.hostname.includes('instagram.com')) {
          return null;
        }
        
        const pathname = urlObj.pathname.toLowerCase();
        
        // Reject non-profile URLs
        const rejectedPatterns = ['/p/', '/reel/', '/tv/', '/explore/', '/accounts/', '/stories/', '/direct/'];
        for (const pattern of rejectedPatterns) {
          if (pathname.includes(pattern)) {
            return null;
          }
        }
        
        // Extract username from pathname (first path segment)
        const pathParts = pathname.replace(/^\/|\/$/g, '').split('/').filter(p => p.length > 0);
        if (pathParts[0] && pathParts[0].length > 0) {
          return pathParts[0];
        }
      } else if (platform === 'facebook') {
        // CRITICAL: Only accept facebook.com domains
        const hostname = urlObj.hostname.toLowerCase();
        if (!hostname.includes('facebook.com')) {
          return null;
        }
        
        const pathname = urlObj.pathname.toLowerCase();
        const pathParts = pathname.replace(/^\/|\/$/g, '').split('/').filter(p => p.length > 0);
        
        // Reject non-profile URLs
        const rejectedPatterns = ['/groups/', '/photo.php', '/photos/', '/posts/', '/reel/', '/watch/', '/events/', '/marketplace/', '/share/', '/sharer/', '/sharer.php', '/story.php', '/hashtag/', '/help/', '/policies/', '/login', '/recover/'];
        for (const pattern of rejectedPatterns) {
          if (pathname.includes(pattern)) {
            return null;
          }
        }
        
        // Reject if it has fbid in query (photo/post links)
        if (url.toLowerCase().includes('fbid=')) {
          return null;
        }
        
        // Reject root facebook.com with no page
        if (pathParts.length === 0) {
          return null;
        }
        
        // Handle /pages/ URLs: /pages/PageName/ID -> extract PageName
        if (pathParts[0] === 'pages' && pathParts[1]) {
          return pathParts[1];
        }
        
        // Reject special paths
        const rejectedPaths = ['profile', 'people', 'login', 'signup', 'home', 'watch', 'marketplace'];
        if (pathParts[0] && rejectedPaths.includes(pathParts[0])) {
          return null;
        }
        
        // Extract username (first path segment)
        if (pathParts[0] && pathParts[0].length > 0) {
          return pathParts[0];
        }
      }
      return null;
    } catch (error) {
      console.error('[USERNAME EXTRACTION] Error extracting username:', error);
      return null;
    }
  }

  // Manual navigation handlers - NO automatic progression
  // Steps only change when user clicks Previous/Next buttons or clicks on a step item
  const handleNext = () => {
    if (currentStep < 5) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  // "Start fixing" sends app sign-in link email (works on any stage). Does not advance stage.
  const handleStartFixing = async () => {
    if (!verifiedEmail) {
      setAppInviteError("Please verify your email first.");
      return;
    }
    setAppInviteLoading(true);
    setAppInviteError(null);
    try {
      const res = await fetch("/api/app-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: verifiedEmail,
          placeId,
          scanId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          data.error ||
          (res.status === 403
            ? "Verification expired. Please verify your email again."
            : "Failed to send sign-in link. Please try again.");
        setAppInviteError(msg);
        return;
      }
      setAppInviteSent(true);
      setAppInviteError(null);
    } catch (_) {
      setAppInviteError("Something went wrong. Please try again.");
    } finally {
      setAppInviteLoading(false);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleStepClick = (stepId: number) => {
    setCurrentStep(stepId);
  };


  // Build step list
  const steps = [
    { id: 0, label: "Deploying agents" },
    { id: 1, label: "Your online profile review" },
    { id: 2, label: `${name} competitors` },
    { id: 3, label: "Review sentiment scoring" },
    { id: 4, label: "Image quality and quantity" },
    { id: 5, label: "Online presence analysis" },
  ];

  const getStepIcon = (stepId: number) => {
    if (stepId < currentStep) {
      // Completed
      return <Check className="w-5 h-5 text-green-600" />;
    } else if (stepId === currentStep) {
      // Current - spinner
      return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
    } else {
      // Upcoming
      return <Circle className="w-5 h-5 text-gray-300" strokeWidth={1.5} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f7f8] flex">
      {/* Left Sidebar - hidden on mobile during onboarding */}
      <div className="hidden md:flex w-80 flex-shrink-0 bg-white border-r border-gray-200 flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-semibold text-gray-900">Scanning…</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <ul className="space-y-2">
            {steps.map((step) => (
              <li
                key={step.id}
                onClick={() => handleStepClick(step.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
                  step.id === currentStep
                    ? "bg-blue-50"
                    : "hover:bg-gray-50"
                }`}
              >
                <div className="flex-shrink-0">{getStepIcon(step.id)}</div>
                <span
                  className={`text-sm ${
                    step.id === currentStep
                      ? "text-gray-900 font-medium"
                      : step.id < currentStep
                      ? "text-gray-700"
                      : "text-gray-600"
                  }`}
                >
                  {step.label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Navigation: single "Start fixing" button */}
        <div className="p-4 border-t border-gray-200">
          {appInviteError && (
            <p className="text-sm text-red-600 mb-2">{appInviteError}</p>
          )}
          {appInviteSent && (
            <p className="text-sm text-green-600 mb-2">
              Check your email for a sign-in link
            </p>
          )}
          <button
            onClick={handleStartFixing}
            disabled={appInviteLoading}
            className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              appInviteLoading
                ? "bg-gray-100 text-gray-400 cursor-wait"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {appInviteLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending…
              </>
            ) : (
              "Start fixing"
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
            {/* Preview Area */}
            <div className="flex-1 relative overflow-hidden min-h-[600px]">
              {/* Stage 0: Deploying agents */}
              {currentStep === 0 ? (
                <AIAgentLoadingScreen 
                  businessName={name}
                  onAllAgentsDeployed={() => setAllAgentsDeployed(true)}
                />
              ) : currentStep === 1 ? (
                // Google Business Profile step
                <div className="absolute inset-0">
                  <AIAgentModal stage={0} stageName="Your online profile review" />
                  <ScanLineOverlay />
                  <StageGoogleBusinessProfile 
                    placeId={placeId}
                    scanId={scanId}
                    onComplete={() => {
                      // Automatically move to next stage after 4 scans
                      if (AUTO_ADVANCE_STAGES && currentStep === 1) {
                        handleNext();
                      }
                    }}
                  />
                </div>
              ) : currentStep === 2 ? (
                // Competitors - Real Google Map (Owner.com style - no card wrapper)
                <div className="absolute inset-0">
                  <AIAgentModal stage={1} stageName={`${name} competitors`} moveDownOnMobile />
                  <StageCompetitorMap 
                    placeId={placeId} 
                    name={name}
                    scanId={scanId}
                    onComplete={() => {
                      // Automatically move to next stage when competitors finish loading
                      if (AUTO_ADVANCE_STAGES && currentStep === 2) {
                        handleNext();
                      }
                    }}
                  />
                </div>
              ) : currentStep === 3 ? (
                // Google Review Sentiment step
                <div className="absolute inset-0">
                  <AIAgentModal stage={2} stageName="Review sentiment scoring" />
                  <ScanLineOverlay />
                  <StageReviewSentiment 
                    placeId={placeId}
                    scanId={scanId}
                    onComplete={() => {
                      // Automatically move to next stage after 8.5 seconds
                      if (AUTO_ADVANCE_STAGES && currentStep === 3) {
                        handleNext();
                      }
                    }}
                  />
                </div>
              ) : currentStep === 4 ? (
                // Photo quality and quantity step
                <div className="absolute inset-0">
                  <AIAgentModal stage={3} stageName="Image quality and quantity" />
                  <ScanLineOverlay />
                  <StagePhotoCollage 
                    placeId={placeId}
                    scanId={scanId}
                    onComplete={() => {
                      // Automatically move to next stage after all photos load and 3 seconds pass
                      if (AUTO_ADVANCE_STAGES && currentStep === 4) {
                        handleNext();
                      }
                    }}
                  />
                </div>
              ) : currentStep === 5 ? (
                // Step 4: Online presence analysis
                <div className="absolute inset-0">
                  <AIAgentModal stage={4} stageName="Online presence analysis" />
                  <StageOnlinePresence 
                    businessName={name}
                    address={addr}
                    scanId={scanId}
                    initialData={onlinePresenceData}
                    allAnalyzersComplete={allAnalyzersComplete}
                    onComplete={() => {
                      // Don't navigate yet - wait for AI analysis
                      console.log('[NAVIGATION] Stage 4 complete, waiting for AI analysis...');
                    }}
                  />
                </div>
              ) : (
                <div className="p-6 h-full">
                  <div className="max-w-4xl mx-auto h-full">
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 h-full flex items-center justify-center">
                      <div className="text-center">
                        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
                        <p className="text-gray-600 text-sm">{steps[currentStep]?.label}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
        </div>
      </div>

      {/* Mobile: floating footer with current stage and "Start fixing" */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-20 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/80 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium text-gray-900 truncate">
              {steps[currentStep]?.label}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Step {currentStep + 1} of 6
            </p>
            {appInviteError && (
              <p className="text-xs text-red-600 mt-1">{appInviteError}</p>
            )}
            {appInviteSent && (
              <p className="text-xs text-green-600 mt-1">
                Check your email for a sign-in link
              </p>
            )}
          </div>
          <button
            onClick={handleStartFixing}
            disabled={appInviteLoading}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
              appInviteLoading
                ? "bg-gray-100 text-gray-400 cursor-wait"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {appInviteLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending…
              </>
            ) : (
              "Start fixing"
            )}
          </button>
        </div>
      </div>

      {/* Email Verification Modal */}
      <EmailVerificationModal
        isOpen={showEmailVerification}
        onClose={() => {
          // Don't allow closing - user must verify to continue
          // setShowEmailVerification(false);
        }}
        prefilledUsernames={gbpExtractedUsernames || undefined}
        onVerified={(socialUsernames, email) => {
          setEmailVerified(true);
          if (email) setVerifiedEmail(email);
          setShowEmailVerification(false);
          // Store user-provided usernames (use confirmed prefilled ones or newly entered ones)
          // These are the FINAL approved usernames that will be used for analysis
          if (socialUsernames) {
            setUserProvidedUsernames(socialUsernames);
            console.log('[MODAL] User approved usernames:', socialUsernames);
          } else if (gbpExtractedUsernames) {
            // If user confirmed prefilled usernames, use them
            setUserProvidedUsernames(gbpExtractedUsernames);
            console.log('[MODAL] User confirmed prefilled usernames:', gbpExtractedUsernames);
          }
          // Move to stage 1 first, then start analysis
          // The analysis will trigger automatically via useEffect when currentStep === 1 && emailVerified === true
          setCurrentStep(1);
          // Start analysis after a brief delay to ensure state is updated
          setTimeout(() => {
            startAnalysis();
          }, 100);
        }}
        placeId={placeId}
        placeName={name}
      />
    </div>
  );
}

