"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Check, Circle } from "lucide-react";
import StageCompetitorMap from "./StageCompetitorMap";
import StageGoogleBusinessProfile from "./StageGoogleBusinessProfile";
import StageReviewSentiment from "./StageReviewSentiment";
import StagePhotoCollage from "./StagePhotoCollage";
import StageOnlinePresence from "./StageOnlinePresence";
import ScanLineOverlay from "./ScanLineOverlay";

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
  const [currentStep, setCurrentStep] = useState(0);
  const [placeDetails, setPlaceDetails] = useState<PlaceDetails | null>(null);
  const [onlinePresenceData, setOnlinePresenceData] = useState<OnlinePresenceResult | null>(null);
  const scraperTriggeredRef = useRef(false); // Prevent duplicate scraper triggers

  const websiteScreenshotTriggeredRef = useRef(false); // Prevent duplicate website screenshot triggers

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
          console.log('[SCRAPER] ✅ Result received, storing in React state:', {
            hasWebsiteScreenshot: !!result.websiteScreenshot,
            websiteUrl: result.websiteUrl,
            socialLinksCount: result.socialLinks?.length || 0,
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
    { id: 0, label: `${name} & competitors` },
    { id: 1, label: "Google business profile" },
    { id: 2, label: "Google review sentiment" },
    { id: 3, label: "Photo quality and quantity" },
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
              {currentStep === 0 ? (
                // Competitors - Real Google Map (Owner.com style - no card wrapper)
                <div className="absolute inset-0">
                  <StageCompetitorMap 
                    placeId={placeId} 
                    name={name}
                    onComplete={() => {
                      // Automatically move to next stage when competitors finish loading
                      if (currentStep === 0) {
                        handleNext();
                      }
                    }}
                  />
                </div>
              ) : currentStep === 1 ? (
                // Google Business Profile step
                <div className="absolute inset-0">
                  <ScanLineOverlay />
                  <StageGoogleBusinessProfile 
                    placeId={placeId}
                    onComplete={() => {
                      // Automatically move to next stage after 4 scans
                      if (currentStep === 1) {
                        handleNext();
                      }
                    }}
                  />
                </div>
              ) : currentStep === 2 ? (
                // Google Review Sentiment step
                <div className="absolute inset-0">
                  <ScanLineOverlay />
                  <StageReviewSentiment 
                    placeId={placeId}
                    onComplete={() => {
                      // Automatically move to next stage after 8.5 seconds
                      if (currentStep === 2) {
                        handleNext();
                      }
                    }}
                  />
                </div>
              ) : currentStep === 3 ? (
                // Photo quality and quantity step
                <div className="absolute inset-0">
                  <ScanLineOverlay />
                  <StagePhotoCollage 
                    placeId={placeId}
                    onComplete={() => {
                      // Automatically move to next stage after all photos load and 3 seconds pass
                      if (currentStep === 3) {
                        handleNext();
                      }
                    }}
                  />
                </div>
              ) : currentStep === 4 ? (
                // Step 4: Online presence analysis
                <div className="absolute inset-0">
                  <StageOnlinePresence 
                    businessName={name}
                    address={addr}
                    scanId={scanId}
                    initialData={onlinePresenceData}
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

