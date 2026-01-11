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

export default function ReportScanClient({
  scanId,
  placeId,
  name,
  addr,
}: ReportScanClientProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [placeDetails, setPlaceDetails] = useState<PlaceDetails | null>(null);
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
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/ReportScanClient.tsx:45',message:'Website screenshot already exists, skipping',data:{scanId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'J'})}).catch(()=>{});
        // #endregion
        return;
      }
      
      websiteScreenshotTriggeredRef.current = true; // Mark as triggered
      
      try {
        console.log(`[WEBSITE SCREENSHOT] Starting immediate capture for: ${websiteUrl}`);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/ReportScanClient.tsx:55',message:'Triggering immediate website screenshot',data:{scanId,websiteUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'J'})}).catch(()=>{});
        // #endregion
        
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
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/ReportScanClient.tsx:69',message:'Website screenshot captured',data:{scanId,hasScreenshot:!!result.screenshot},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'J'})}).catch(()=>{});
          // #endregion
          
          // Do NOT store the screenshot locally (avoids quota errors).
          // It remains available via the API cache when StageOnlinePresence fetches.
        } else {
          console.error('Failed to capture website screenshot:', await response.text());
          websiteScreenshotTriggeredRef.current = false; // Reset on failure to allow retry
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/ReportScanClient.tsx:87',message:'Website screenshot capture failed',data:{scanId,status:response.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'J'})}).catch(()=>{});
          // #endregion
        }
      } catch (error) {
        console.error('Error capturing website screenshot:', error);
        websiteScreenshotTriggeredRef.current = false; // Reset on failure to allow retry
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/ReportScanClient.tsx:91',message:'Exception in website screenshot capture',data:{scanId,error:error instanceof Error ? error.message : 'Unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'J'})}).catch(()=>{});
        // #endregion
      }
    };

    const fetchDetails = async () => {
      try {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/ReportScanClient.tsx:111',message:'Fetching place details',data:{scanId,placeId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'L'})}).catch(()=>{});
        // #endregion
        const response = await fetch(`/api/places/details?placeId=${encodeURIComponent(placeId)}`);
        if (response.ok) {
          const data = await response.json();
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/ReportScanClient.tsx:116',message:'Place details fetched',data:{scanId,hasWebsite:!!data.website,website:data.website},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'L'})}).catch(()=>{});
          // #endregion
          setPlaceDetails(data);
          
          // Immediately capture website screenshot if website URL is available
          if (data.website) {
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/ReportScanClient.tsx:121',message:'Calling captureWebsiteScreenshot',data:{scanId,website:data.website},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'L'})}).catch(()=>{});
            // #endregion
            captureWebsiteScreenshot(data.website);
          } else {
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/ReportScanClient.tsx:124',message:'No website URL in place details',data:{scanId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'L'})}).catch(()=>{});
            // #endregion
          }
        } else {
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/ReportScanClient.tsx:127',message:'Failed to fetch place details',data:{scanId,status:response.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'L'})}).catch(()=>{});
          // #endregion
        }
      } catch (error) {
        console.error("Failed to fetch place details:", error);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/ReportScanClient.tsx:131',message:'Exception fetching place details',data:{scanId,error:error instanceof Error ? error.message : 'Unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'L'})}).catch(()=>{});
        // #endregion
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
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/ReportScanClient.tsx:65',message:'API response received in ReportScanClient',data:{scanId,hasWebsiteScreenshot:!!result.websiteScreenshot,socialLinksCount:result.socialLinks?.length,socialLinksWithScreenshots:result.socialLinks?.filter((l:any)=>l.screenshot)?.length,resultKeys:Object.keys(result)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
          // #endregion
          // Store metadata + URLs to screenshots (NOT the actual base64 data - too large for localStorage)
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
            // Store actual screenshot data in a separate key to check without loading everything
            screenshotsReady: !!(result.websiteScreenshot || (result.socialLinks && result.socialLinks.some((l: any) => l.screenshot))),
          };
          
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/ReportScanClient.tsx:75',message:'Storing metadata in localStorage (screenshots only in API cache)',data:{scanId,dataToStoreKeys:Object.keys(dataToStore),socialLinksCount:dataToStore.socialLinks.length,hasWebsiteScreenshot:dataToStore.hasWebsiteScreenshot,screenshotsReady:dataToStore.screenshotsReady},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
          // #endregion
          try {
            localStorage.setItem(`onlinePresence_${scanId}`, JSON.stringify(dataToStore));
          } catch (error) {
            // If localStorage fails, log but don't block - API cache will still work
            console.warn('Failed to store in localStorage (quota exceeded?):', error);
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/ReportScanClient.tsx:83',message:'localStorage setItem failed',data:{scanId,error:error instanceof Error ? error.message : 'Unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
            // #endregion
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
                  <StagePhotoCollage placeId={placeId} />
                </div>
              ) : currentStep === 4 ? (
                // Step 4: Online presence analysis
                <div className="absolute inset-0">
                  <ScanLineOverlay />
                  <StageOnlinePresence 
                    businessName={name}
                    address={addr}
                    scanId={scanId}
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

