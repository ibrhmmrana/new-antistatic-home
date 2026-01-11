"use client";

import { useState, useEffect } from "react";
import ScanLineOverlay from "./ScanLineOverlay";

interface StageOnlinePresenceProps {
  businessName: string;
  address: string;
  scanId: string;
}

interface SocialScreenshot {
  platform: string;
  url: string;
  screenshot: string | null;
  status: 'pending' | 'loading' | 'success' | 'error';
}

interface OnlinePresenceData {
  websiteUrl: string | null;
  websiteScreenshot: string | null;
  socialLinks: SocialScreenshot[];
}

export default function StageOnlinePresence({
  businessName,
  address,
  scanId,
}: StageOnlinePresenceProps) {
  const [data, setData] = useState<OnlinePresenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch scraper results (screenshots are already captured by the API)
    const fetchData = async () => {
      try {
        // Do not read website screenshot from storage (quota issues); will fetch from API cache
        let websiteScreenshot: string | null = null;
        let websiteUrl: string | null = null;
        
        // Try to get from localStorage first (set when scraper completes)
        const storedData = localStorage.getItem(`onlinePresence_${scanId}`);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/StageOnlinePresence.tsx:38',message:'Checking localStorage',data:{scanId,hasStoredData:!!storedData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        if (storedData) {
          const parsed = JSON.parse(storedData);
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/StageOnlinePresence.tsx:42',message:'Found localStorage data',data:{scanId,hasCompleted:!!parsed.completed,screenshotsReady:!!parsed.screenshotsReady,socialLinksCount:parsed.socialLinks?.length,timestamp:parsed.timestamp},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          
          // Check if scraper has completed
          if (parsed.completed && parsed.screenshotsReady) {
            // Scraper completed - try to get screenshots from sessionStorage first
            try {
              const screenshotData = sessionStorage.getItem(`screenshots_${scanId}`);
              if (screenshotData) {
                const screenshots = JSON.parse(screenshotData);
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/StageOnlinePresence.tsx:75',message:'Found screenshots in sessionStorage',data:{scanId,hasWebsiteScreenshot:!!screenshots.websiteScreenshot,socialScreenshotsCount:screenshots.socialScreenshots?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                
                const completeData: OnlinePresenceData = {
                  websiteUrl: websiteUrl || parsed.websiteUrl,
                  websiteScreenshot: websiteScreenshot || screenshots.websiteScreenshot,
                  socialLinks: parsed.socialLinks.map((linkMeta: any) => {
                    const screenshot = screenshots.socialScreenshots?.find((s: any) => s.platform === linkMeta.platform);
                    return {
                      platform: linkMeta.platform,
                      url: linkMeta.url,
                      screenshot: screenshot?.screenshot || null,
                      status: screenshot?.screenshot ? 'success' : 'pending',
                    };
                  }),
                };
                setData(completeData);
                setLoading(false);
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/StageOnlinePresence.tsx:95',message:'Displaying screenshots from sessionStorage',data:{scanId,hasWebsiteScreenshot:!!completeData.websiteScreenshot,socialLinksCount:completeData.socialLinks.length,socialLinksWithScreenshots:completeData.socialLinks.filter((l:any)=>l.screenshot).length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                return;
              }
            } catch (e) {
              console.warn('Failed to load from sessionStorage:', e);
            }
            
            // Screenshots not in sessionStorage but scraper completed recently - try API cache
            const timeSinceCompletion = Date.now() - (parsed.timestamp || 0);
            if (timeSinceCompletion < 300000) { // Within 5 minutes
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/StageOnlinePresence.tsx:105',message:'Scraper completed recently, trying API cache',data:{scanId,timeSinceCompletion},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
              // #endregion
            }
          }
          
          // Legacy format check (old metadata-only format)
          if (parsed.cached && parsed.socialLinks && parsed.socialLinks.length > 0) {
            // New format: metadata only, screenshots in API cache - fetch from API
            // CRITICAL: Wait to ensure API cache is fully updated to "completed" status
            // The cache is set asynchronously after scraper completes
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Retry logic: try fetching from API cache with exponential backoff
            let apiResult = null;
            let lastError = null;
            for (let retry = 0; retry < 5; retry++) {
              try {
                const apiResponse = await fetch('/api/scan/socials', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    businessName,
                    address,
                    scanId,
                  }),
                });
                
                if (apiResponse.ok) {
                  apiResult = await apiResponse.json();
                  // Check if we got actual screenshots (not just metadata)
                  const hasScreenshots = apiResult.websiteScreenshot || 
                    (apiResult.socialLinks && apiResult.socialLinks.some((link: any) => link.screenshot));
                  
                  if (hasScreenshots) {
                    // #region agent log
                    fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/StageOnlinePresence.tsx:75',message:'API response received (from storedData check) with screenshots',data:{scanId,status:apiResponse.status,retry,hasWebsiteScreenshot:!!apiResult.websiteScreenshot,websiteScreenshotLength:apiResult.websiteScreenshot?.length,socialLinksCount:apiResult.socialLinks?.length,socialLinksWithScreenshots:apiResult.socialLinks?.filter((l:any)=>l.screenshot)?.length,instagramScreenshotLength:apiResult.socialLinks?.find((l:any)=>l.platform==='instagram')?.screenshot?.length,facebookScreenshotLength:apiResult.socialLinks?.find((l:any)=>l.platform==='facebook')?.screenshot?.length,apiResultKeys:Object.keys(apiResult)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'M'})}).catch(()=>{});
                    // #endregion
                    // Merge website screenshot with API result
                    const completeData: OnlinePresenceData = {
                      websiteUrl: websiteUrl || apiResult.websiteUrl,
                      websiteScreenshot: websiteScreenshot || apiResult.websiteScreenshot,
                      socialLinks: (apiResult.socialLinks || []).map((link: any) => ({
                        platform: link.platform,
                        url: link.url,
                        screenshot: link.screenshot || null,
                        status: link.screenshot ? 'success' : 'pending',
                      })),
                    };
                    setData(completeData);
                    setLoading(false);
                    // #region agent log
                    fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/StageOnlinePresence.tsx:95',message:'Using data from API cache (from storedData check)',data:{scanId,hasWebsiteScreenshot:!!completeData.websiteScreenshot,socialLinksCount:completeData.socialLinks.length,socialLinksWithScreenshots:completeData.socialLinks.filter((l:any)=>l.screenshot).length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'M'})}).catch(()=>{});
                    // #endregion
                    return;
                  } else if (retry < 4) {
                    // No screenshots yet, wait and retry with longer delays
                    const delay = 2000 * (retry + 1); // 2s, 4s, 6s, 8s
                    // #region agent log
                    fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/StageOnlinePresence.tsx:103',message:'No screenshots yet (from storedData check), waiting before retry',data:{scanId,retry,delay,hasWebsiteScreenshot:!!apiResult?.websiteScreenshot,socialLinksCount:apiResult?.socialLinks?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'M'})}).catch(()=>{});
                    // #endregion
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                  }
                }
              } catch (apiError) {
                lastError = apiError;
                if (retry < 4) {
                  const delay = 2000 * (retry + 1);
                  await new Promise(resolve => setTimeout(resolve, delay));
                }
              }
            }
            
            if (!apiResult || !(apiResult.websiteScreenshot || (apiResult.socialLinks && apiResult.socialLinks.some((link: any) => link.screenshot)))) {
              console.warn('Failed to fetch screenshots from API cache after retries:', lastError);
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/StageOnlinePresence.tsx:118',message:'API cache fetch failed after retries (from storedData check)',data:{scanId,error:lastError instanceof Error ? lastError.message : 'No screenshots in response'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'M'})}).catch(()=>{});
              // #endregion
              // Fall through to continue with other paths
            }
          } else if (parsed.cached) {
            // Has cached flag but no social links yet - wait for them
            console.log('[DEBUG] localStorage has cached flag but no social links yet, will poll');
          } else {
            // Old format: check if screenshots are present
            const hasScreenshots = parsed.websiteScreenshot || 
              (parsed.socialLinks && parsed.socialLinks.some((link: any) => link.screenshot));
            
            if (hasScreenshots) {
              // Old format with screenshots - use it (but this shouldn't happen anymore)
              setData(parsed);
              setLoading(false);
              return;
            } else {
              // Old format incomplete - fetch from API
              console.log('[DEBUG] localStorage data incomplete, polling API for complete data');
            }
          }
        }

        // CRITICAL: Do NOT poll the API with POST requests - this triggers the scraper again!
        // Instead, only read from the API cache using GET requests, or wait for localStorage updates
        // The scraper should have already run from ReportScanClient when the page loaded
        // We'll check localStorage periodically for updates instead of polling the API
        
        // Check if we already have complete data from localStorage
        if (websiteScreenshot && websiteUrl) {
          // We have website screenshot, now check if we need to wait for social media screenshots
          // Check localStorage for social media scraper completion
          const socialMediaData = localStorage.getItem(`onlinePresence_${scanId}`);
          if (socialMediaData) {
            try {
              const parsed = JSON.parse(socialMediaData);
              if (parsed.cached && parsed.socialLinks && parsed.socialLinks.length > 0) {
                // Social media scraper has completed, fetch screenshots from API cache IMMEDIATELY
                // Screenshots are already ready from the scraper that ran at the beginning
                try {
                  // #region agent log
                  fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/StageOnlinePresence.tsx:177',message:'Fetching screenshots from API cache immediately (no delay)',data:{scanId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'M'})}).catch(()=>{});
                  // #endregion
                  const apiResponse = await fetch('/api/scan/socials', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      businessName,
                      address,
                      scanId,
                    }),
                  });
                  
                  if (apiResponse.ok) {
                    const apiResult = await apiResponse.json();
                    // #region agent log
                    fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/StageOnlinePresence.tsx:195',message:'API response received immediately with screenshots',data:{scanId,status:apiResponse.status,hasWebsiteScreenshot:!!apiResult.websiteScreenshot,websiteScreenshotLength:apiResult.websiteScreenshot?.length,socialLinksCount:apiResult.socialLinks?.length,socialLinksWithScreenshots:apiResult.socialLinks?.filter((l:any)=>l.screenshot)?.length,instagramScreenshotLength:apiResult.socialLinks?.find((l:any)=>l.platform==='instagram')?.screenshot?.length,facebookScreenshotLength:apiResult.socialLinks?.find((l:any)=>l.platform==='facebook')?.screenshot?.length,apiResultKeys:Object.keys(apiResult)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'M'})}).catch(()=>{});
                    // #endregion
                    // Merge website screenshot with API result
                    const completeData: OnlinePresenceData = {
                      websiteUrl: websiteUrl || apiResult.websiteUrl,
                      websiteScreenshot: websiteScreenshot || apiResult.websiteScreenshot,
                      socialLinks: (apiResult.socialLinks || []).map((link: any) => ({
                        platform: link.platform,
                        url: link.url,
                        screenshot: link.screenshot || null,
                        status: link.screenshot ? 'success' : 'pending',
                      })),
                    };
                    setData(completeData);
                    setLoading(false);
                    // #region agent log
                    fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/StageOnlinePresence.tsx:210',message:'Displaying screenshots immediately',data:{scanId,hasWebsiteScreenshot:!!completeData.websiteScreenshot,socialLinksCount:completeData.socialLinks.length,socialLinksWithScreenshots:completeData.socialLinks.filter((l:any)=>l.screenshot).length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'M'})}).catch(()=>{});
                    // #endregion
                    return;
                  } else {
                    console.warn('Failed to fetch from API cache:', apiResponse.status);
                    // #region agent log
                    fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/StageOnlinePresence.tsx:217',message:'API cache fetch failed',data:{scanId,status:apiResponse.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'M'})}).catch(()=>{});
                    // #endregion
                  }
                } catch (apiError) {
                  console.error('Error fetching from API cache:', apiError);
                  // #region agent log
                  fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/StageOnlinePresence.tsx:222',message:'Exception fetching from API cache',data:{scanId,error:apiError instanceof Error ? apiError.message : 'Unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'M'})}).catch(()=>{});
                  // #endregion
                }
                
                // Fallback: Use metadata only if API fetch fails
                const completeData: OnlinePresenceData = {
                  websiteUrl,
                  websiteScreenshot,
                  socialLinks: parsed.socialLinks.map((link: any) => ({
                    platform: link.platform,
                    url: link.url,
                    screenshot: null,
                    status: link.hasScreenshot ? 'success' : 'pending',
                  })),
                };
                setData(completeData);
                setLoading(false);
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/StageOnlinePresence.tsx:162',message:'Using cached metadata (no screenshots)',data:{scanId,hasWebsiteScreenshot:!!websiteScreenshot,socialLinksCount:completeData.socialLinks.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'M'})}).catch(()=>{});
                // #endregion
                return;
              }
            } catch (e) {
              console.warn('Failed to parse social media data:', e);
            }
          }
        }
        
        // If we don't have complete data yet, screenshots may still be loading
        // But since scrapers run at the beginning, they should be ready by now
        // Just show what we have (partial data or error)
        
        // No polling needed - screenshots are already ready from the scraper that ran at the beginning
        // If we reach here, it means we couldn't fetch from API cache, so show error or partial data
        
        // If we still don't have data after waiting, show what we have
        if (websiteScreenshot || websiteUrl) {
          const partialData: OnlinePresenceData = {
            websiteUrl: websiteUrl || null,
            websiteScreenshot: websiteScreenshot || null,
            socialLinks: [],
          };
          setData(partialData);
          setLoading(false);
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/StageOnlinePresence.tsx:163',message:'Using partial data (social media still loading)',data:{scanId,hasWebsiteScreenshot:!!websiteScreenshot},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'K'})}).catch(()=>{});
          // #endregion
          return;
        }
        
        // Fallback: If we have nothing, show error
        throw new Error('Failed to load online presence data after waiting');
      } catch (err) {
        console.error('Error fetching online presence data:', err);
        setError('Failed to load online presence data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [scanId, businessName, address]);

  // Website Screenshot Component with browser chrome (Windows style)
  const WebsiteScreenshot = ({ screenshot, url }: { screenshot: string | null; url?: string | null }) => (
    <div className="relative">
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
        {/* Browser top bar */}
        <div className="flex items-center justify-between bg-gray-100 px-3 py-2 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-gray-400" />
            <div className="w-3 h-3 rounded-full bg-gray-400" />
            <div className="w-3 h-3 rounded-full bg-gray-400" />
          </div>
          <div className="flex-1 mx-3">
            <div className="h-6 bg-white border border-gray-300 rounded px-2 text-xs text-gray-500 flex items-center truncate">
              {screenshot ? (url || 'Loading...') : 'Loading...'}
            </div>
          </div>
          <div className="w-3 h-3" /> {/* spacer */}
        </div>
        {/* Page area */}
        <div className="bg-white">
          {screenshot ? (
            <img
              src={screenshot}
              alt="Website screenshot"
              className="w-full h-auto object-contain"
            />
          ) : (
            <div className="w-full h-64 bg-gray-100 flex items-center justify-center">
              <div className="text-gray-400 text-sm">Loading...</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Social Media Screenshot inside a refined iPhone-style mock
  const SocialScreenshot = ({ screenshot, platform }: { screenshot: string | null; platform: 'instagram' | 'facebook' }) => (
    <div className="relative">
      <div className="relative rounded-[2rem] bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#0b1220] shadow-xl border border-[#1f2937] px-1.5 pt-3 pb-1">
        {/* Side buttons (prominent) */}
        <div className="absolute -left-1 top-14 h-10 w-1.5 rounded-full bg-[#334155] shadow-sm" />
        <div className="absolute -right-1 top-16 h-7 w-1.5 rounded-full bg-[#334155] shadow-sm" />
        <div className="absolute -right-1 top-24 h-7 w-1.5 rounded-full bg-[#334155] shadow-sm" />
        {/* Notch */}
        <div className="absolute top-1 left-1/2 -translate-x-1/2 w-20 h-4 bg-[#0b0f17] rounded-b-2xl rounded-t-xl shadow-inner" />
        {/* Screen */}
        <div className="relative bg-black rounded-[1.6rem] overflow-hidden aspect-[9/19.5] border border-[#1f2937]/60">
          {screenshot ? (
            <img
              src={screenshot}
              alt={`${platform} screenshot`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gray-900 flex items-center justify-center">
              <div className="text-gray-500 text-xs">Loading...</div>
            </div>
          )}
          {/* Bottom home indicator */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-14 h-1.5 bg-white/60 rounded-full" />
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-600 text-sm mb-2">Scanning online presence...</div>
          <div className="text-gray-400 text-xs">This may take a moment</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center text-gray-600">
          <div className="text-sm">{error || 'No online presence data available'}</div>
        </div>
      </div>
    );
  }

  const instagramLink = data.socialLinks.find(link => link.platform === 'instagram');
  const facebookLink = data.socialLinks.find(link => link.platform === 'facebook');

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/report/StageOnlinePresence.tsx:189',message:'Rendering screenshots',data:{hasWebsiteScreenshot:!!data.websiteScreenshot,hasInstagram:!!instagramLink?.screenshot,hasFacebook:!!facebookLink?.screenshot,instagramScreenshotLength:instagramLink?.screenshot?.length,facebookScreenshotLength:facebookLink?.screenshot?.length,websiteScreenshotLength:data.websiteScreenshot?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion

  return (
    <div className="w-full h-full flex items-center justify-center p-8 relative">
      {/* Remove duplicate beams: overlay handled by parent */}
      <div className="max-w-7xl w-full">
        {/* Container with relative positioning for overlapping */}
        <div className="relative flex items-center justify-center" style={{ minHeight: '520px' }}>
          {/* Website Screenshot - Center, larger */}
          {data.websiteScreenshot && (
            <div className="relative z-0 max-w-4xl w-full mx-auto">
              <WebsiteScreenshot screenshot={data.websiteScreenshot} url={data.websiteUrl} />
            </div>
          )}

          {/* Instagram Screenshot - Left, smaller and rotated */}
          {instagramLink?.screenshot && (
            <div className="absolute left-[6%] top-[58%] -translate-y-1/2 z-10 w-48 md:w-56 rotate-[-8deg]">
              <SocialScreenshot screenshot={instagramLink.screenshot} platform="instagram" />
            </div>
          )}

          {/* Facebook Screenshot - Right, smaller and rotated opposite */}
          {facebookLink?.screenshot && (
            <div className="absolute right-[6%] top-[58%] -translate-y-1/2 z-10 w-48 md:w-56 rotate-[8deg]">
              <SocialScreenshot screenshot={facebookLink.screenshot} platform="facebook" />
            </div>
          )}

          {/* Show message if no screenshots available */}
          {!data.websiteScreenshot && !instagramLink?.screenshot && !facebookLink?.screenshot && (
            <div className="text-center text-gray-500">
              <p>No screenshots available yet. Please wait...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
