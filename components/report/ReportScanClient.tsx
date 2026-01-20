"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Circle } from "lucide-react";
import StageCompetitorMap from "./StageCompetitorMap";
import StageGoogleBusinessProfile from "./StageGoogleBusinessProfile";
import StageReviewSentiment from "./StageReviewSentiment";
import StagePhotoCollage from "./StagePhotoCollage";
import StageOnlinePresence from "./StageOnlinePresence";
import ScanLineOverlay from "./ScanLineOverlay";
import AIAgentLoadingScreen from "./AIAgentLoadingScreen";
import AIAgentModal from "./AIAgentModal";

interface ReportScanClientProps {
  scanId: string;
  placeId: string;
  name: string;
  addr: string;
}

interface PlaceDetails {
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
  const [showInitialLoading, setShowInitialLoading] = useState(true);
  const [allAgentsDeployed, setAllAgentsDeployed] = useState(false);
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

  // Fetch place details on mount and trigger website screenshot immediately
  useEffect(() => {
    // Function to capture website screenshot immediately
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
        
        const response = await fetch('/api/scan/socials/screenshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: 'website',
            url: websiteUrl,
            viewport: 'desktop',
          }),
        });

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

    const fetchDetails = async () => {
      try {
        const response = await fetch(`/api/places/details?placeId=${encodeURIComponent(placeId)}`);
        if (response.ok) {
          const data = await response.json();
          setPlaceDetails(data);
          
          // Immediately capture website screenshot if website URL is available
          if (data.website) {
            captureWebsiteScreenshot(data.website);
          }
        } else {
        }
      } catch (error) {
        console.error("Failed to fetch place details:", error);
      }
    };

    fetchDetails();

    // Trigger scraper API call immediately when report page loads
    // This runs in the background: extracts links, then captures all screenshots in parallel
    // Results are stored and available when user reaches stage 4
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
        const response = await fetch('/api/scan/socials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessName: name,
            address: addr,
            scanId,
            websiteUrl, // Pass website URL from GBP API
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
  }, [placeId, name, addr, scanId]);

  // Trigger all analyzers during onboarding (runs in background, stores results in localStorage)
  useEffect(() => {
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
              const response = await fetch(`/api/gbp/place-details?place_id=${encodeURIComponent(placeId)}`);
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
      
      // 2. Website Crawler - trigger when website URL is found
      const checkWebsiteUrl = async () => {
        let websiteUrl: string | null = null;
        
        // Try to get from placeDetails
        if (placeDetails?.website) {
          websiteUrl = placeDetails.website;
        } else {
          // Fetch place details if not available
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
        
        // Also check onlinePresenceData
        if (!websiteUrl && onlinePresenceData?.websiteUrl) {
          websiteUrl = onlinePresenceData.websiteUrl;
        }
        
        // Also check localStorage
        if (!websiteUrl) {
          const onlinePresenceMetadata = localStorage.getItem(`onlinePresence_${scanId}`);
          if (onlinePresenceMetadata) {
            const parsed = JSON.parse(onlinePresenceMetadata);
            websiteUrl = parsed.websiteUrl || null;
          }
        }
        
        if (websiteUrl) {
          const websiteCacheKey = `analysis_${scanId}_website`;
          const existingWebsite = localStorage.getItem(websiteCacheKey);
          if (existingWebsite) {
            setAnalyzersComplete(prev => ({ ...prev, website: true }));
          } else {
            try {
              console.log('[ANALYZERS] Triggering website crawler...');
              const response = await fetch("/api/scan/website", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                  url: websiteUrl, 
                  maxDepth: 2,
                  maxPages: 10 
                }),
              });
              if (response.ok) {
                const data = await response.json();
                localStorage.setItem(websiteCacheKey, JSON.stringify(data));
                console.log('[ANALYZERS] ✅ Website crawler complete');
              }
            } catch (error) {
              console.error('[ANALYZERS] ❌ Website crawler failed:', error);
            } finally {
              setAnalyzersComplete(prev => ({ ...prev, website: true }));
            }
          }
        } else {
          setAnalyzersComplete(prev => ({ ...prev, website: true })); // No website to analyze
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
  }, [placeId, scanId, placeDetails, onlinePresenceData]);
  
  // Watch for onlinePresenceData changes and trigger social scrapers IMMEDIATELY (in parallel)
  // This runs independently of the main analyzer effect to ensure scrapers start ASAP
  useEffect(() => {
    if (!onlinePresenceData?.socialLinks || onlinePresenceData.socialLinks.length === 0) {
      return;
    }
    
    console.log('[SCRAPERS] onlinePresenceData has social links, triggering scrapers in parallel...');
    
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
          console.log('[SCRAPERS] 🚀 Starting Instagram scraper NOW for:', username);
          (async () => {
            try {
              const response = await fetch("/api/test/instagram-scrape", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username }),
              });
              if (response.ok) {
                const data = await response.json();
                localStorage.setItem(igCacheKey, JSON.stringify(data));
                console.log('[SCRAPERS] ✅ Instagram scraper complete');
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
  
  // Check if all analyzers are complete (including AI analysis)
  useEffect(() => {
    const { gbp, website, instagram, facebook, aiAnalysis } = analyzersComplete;
    const allComplete = gbp && website && instagram && facebook && aiAnalysis;
    if (allComplete && !allAnalyzersComplete) {
      console.log('[ANALYZERS] ✅ All analyzers complete (including AI analysis)!');
      setAllAnalyzersComplete(true);
      
      // Navigate to analysis page when everything is complete
      if (currentStep === 4 && !stage4AutoProgressRef.current) {
        stage4AutoProgressRef.current = true;
        console.log('[NAVIGATION] All analyzers including AI complete, navigating to analysis page...');
        router.push(`/report/${scanId}/analysis?placeId=${encodeURIComponent(placeId)}&name=${encodeURIComponent(name)}&addr=${encodeURIComponent(addr)}`);
      }
    }
  }, [analyzersComplete, allAnalyzersComplete, currentStep, scanId, placeId, name, addr, router]);

  // Check for AI analysis completion
  useEffect(() => {
    if (!allAnalyzersComplete && analyzersComplete.gbp && analyzersComplete.website) {
      // Check if AI analysis is already cached
      const aiCacheKey = `analysis_${scanId}_ai`;
      const cachedAi = localStorage.getItem(aiCacheKey);
      if (cachedAi) {
        try {
          const parsed = JSON.parse(cachedAi);
          if (parsed && Object.keys(parsed).length > 0) {
            console.log('[ANALYZERS] ✅ AI analysis already cached');
            setAnalyzersComplete(prev => ({ ...prev, aiAnalysis: true }));
            return;
          }
        } catch (e) {
          console.error('[ANALYZERS] Failed to parse cached AI analysis:', e);
        }
      }

      // Poll for AI analysis completion (it's triggered from analysis page)
      const checkInterval = setInterval(() => {
        const cached = localStorage.getItem(aiCacheKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed && Object.keys(parsed).length > 0) {
              console.log('[ANALYZERS] ✅ AI analysis complete (polling)');
              setAnalyzersComplete(prev => ({ ...prev, aiAnalysis: true }));
              clearInterval(checkInterval);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }, 2000); // Check every 2 seconds

      // Fallback: mark as complete after 60 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!analyzersComplete.aiAnalysis) {
          console.log('[ANALYZERS] Fallback timeout - marking AI analysis as complete');
          setAnalyzersComplete(prev => ({ ...prev, aiAnalysis: true }));
        }
      }, 60000);

      return () => clearInterval(checkInterval);
    }
  }, [scanId, allAnalyzersComplete, analyzersComplete.gbp, analyzersComplete.website, analyzersComplete.aiAnalysis]);

  // Handle when all agents are deployed
  useEffect(() => {
    if (allAgentsDeployed) {
      // Wait 2 seconds after all agents are deployed before showing first stage
      const timeout = setTimeout(() => {
        setShowInitialLoading(false);
      }, 2000);
      
      return () => clearTimeout(timeout);
    }
  }, [allAgentsDeployed]);
  
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
        const response = await fetch(
          `/api/places/reviews?placeId=${encodeURIComponent(placeId)}`
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
  function extractUsernameFromUrl(url: string, platform: 'instagram' | 'facebook'): string | null {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const parts = pathname.replace(/^\/|\/$/g, '').split('/');
      
      if (platform === 'instagram') {
        if (parts[0] && parts[0] !== 'p' && parts[0] !== 'reel' && parts[0] !== 'stories') {
          return parts[0];
        }
      } else if (platform === 'facebook') {
        if (parts[0] && parts[0] !== 'pages' && parts[0] !== 'profile' && parts[0] !== 'people') {
          return parts[0];
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  // Manual navigation handlers - NO automatic progression
  // Steps only change when user clicks Previous/Next buttons or clicks on a step item
  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep((prev) => prev + 1);
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
    { id: 0, label: "Your online profile review" },
    { id: 1, label: `${name} competitors` },
    { id: 2, label: "Review sentiment scoring" },
    { id: 3, label: "Image quality and quantity" },
    { id: 4, label: "Online presence analysis" },
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
      {/* Left Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
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

        {/* Navigation controls */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handlePrevious}
              disabled={currentStep === 0}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentStep === 0
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Previous
            </button>
            <span className="text-xs text-gray-500">
              Step {currentStep + 1} of 5
            </span>
            <button
              onClick={handleNext}
              disabled={currentStep === 4}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentStep === 4
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
            {/* Preview Area */}
            <div className="flex-1 relative overflow-hidden min-h-[600px]">
              {/* Initial AI Agents Loading Screen */}
              {showInitialLoading ? (
                <AIAgentLoadingScreen 
                  businessName={name}
                  onAllAgentsDeployed={() => setAllAgentsDeployed(true)}
                />
              ) : currentStep === 0 ? (
                // Google Business Profile step
                <div className="absolute inset-0">
                  <AIAgentModal stage={0} stageName="Your online profile review" />
                  <ScanLineOverlay />
                  <StageGoogleBusinessProfile 
                    placeId={placeId}
                    scanId={scanId}
                    onComplete={() => {
                      // Automatically move to next stage after 4 scans
                      if (AUTO_ADVANCE_STAGES && currentStep === 0) {
                        handleNext();
                      }
                    }}
                  />
                </div>
              ) : currentStep === 1 ? (
                // Competitors - Real Google Map (Owner.com style - no card wrapper)
                <div className="absolute inset-0">
                  <AIAgentModal stage={1} stageName={`${name} competitors`} />
                  <StageCompetitorMap 
                    placeId={placeId} 
                    name={name}
                    scanId={scanId}
                    onComplete={() => {
                      // Automatically move to next stage when competitors finish loading
                      if (AUTO_ADVANCE_STAGES && currentStep === 1) {
                        handleNext();
                      }
                    }}
                  />
                </div>
              ) : currentStep === 2 ? (
                // Google Review Sentiment step
                <div className="absolute inset-0">
                  <AIAgentModal stage={2} stageName="Review sentiment scoring" />
                  <ScanLineOverlay />
                  <StageReviewSentiment 
                    placeId={placeId}
                    scanId={scanId}
                    onComplete={() => {
                      // Automatically move to next stage after 8.5 seconds
                      if (AUTO_ADVANCE_STAGES && currentStep === 2) {
                        handleNext();
                      }
                    }}
                  />
                </div>
              ) : currentStep === 3 ? (
                // Photo quality and quantity step
                <div className="absolute inset-0">
                  <AIAgentModal stage={3} stageName="Image quality and quantity" />
                  <ScanLineOverlay />
                  <StagePhotoCollage 
                    placeId={placeId}
                    scanId={scanId}
                    onComplete={() => {
                      // Automatically move to next stage after all photos load and 3 seconds pass
                      if (AUTO_ADVANCE_STAGES && currentStep === 3) {
                        handleNext();
                      }
                    }}
                  />
                </div>
              ) : currentStep === 4 ? (
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
    </div>
  );
}

