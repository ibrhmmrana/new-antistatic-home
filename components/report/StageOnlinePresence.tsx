"use client";

import { useState, useEffect } from "react";
import ScanLineOverlay from "./ScanLineOverlay";

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

// Initial data passed from parent to avoid serverless cache issues
interface InitialOnlinePresenceData {
  websiteUrl: string | null;
  websiteScreenshot: string | null;
  socialLinks: Array<{
    platform: string;
    url: string;
    screenshot: string | null;
  }>;
}

interface StageOnlinePresenceProps {
  businessName: string;
  address: string;
  scanId: string;
  initialData?: InitialOnlinePresenceData | null;
}

export default function StageOnlinePresence({
  businessName,
  address,
  scanId,
  initialData,
}: StageOnlinePresenceProps) {
  const [data, setData] = useState<OnlinePresenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use initialData from parent if available (primary source - avoids serverless cache issues)
  useEffect(() => {
    if (initialData) {
      console.log('[StageOnlinePresence] Using initialData from parent:', {
        hasWebsiteScreenshot: !!initialData.websiteScreenshot,
        websiteUrl: initialData.websiteUrl,
        socialLinksCount: initialData.socialLinks?.length || 0,
      });
      
      const completeData: OnlinePresenceData = {
        websiteUrl: initialData.websiteUrl,
        websiteScreenshot: initialData.websiteScreenshot,
        socialLinks: (initialData.socialLinks || []).map((link) => ({
          platform: link.platform,
          url: link.url,
          screenshot: link.screenshot,
          status: link.screenshot ? 'success' : 'pending',
        })),
      };
      
      setData(completeData);
      setLoading(false);
      return; // Don't fetch from API if we have data
    }
  }, [initialData]);

  // Fallback: fetch from API if no initialData (e.g., page refresh)
  useEffect(() => {
    // Skip if we already have data from initialData
    if (data || initialData) {
      return;
    }
    
    const fetchData = async () => {
      try {
        // 1. Check localStorage for completion flag
        const storedMetadata = localStorage.getItem(`onlinePresence_${scanId}`);
        if (!storedMetadata) {
          // If no metadata yet, we might need to wait or show a loading state
          // but ReportScanClient should have triggered it
          throw new Error('Waiting for scan results...');
        }

        const parsed = JSON.parse(storedMetadata);
        
        // 2. If completed, pull full data from API cache
        // We call the POST endpoint which returns the cached result immediately if it exists
        // IMPORTANT: Pass websiteUrl from localStorage so screenshot can be captured
        // even if serverless cache was cleared (cold start)
        const response = await fetch('/api/scan/socials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessName,
            address,
            scanId,
            websiteUrl: parsed.websiteUrl || null, // Pass stored URL for fallback
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch from API: ${response.status}`);
        }

        const result = await response.json();
        console.log('[StageOnlinePresence] API result:', { 
          hasWebsiteScreenshot: !!result.websiteScreenshot, 
          websiteUrl: result.websiteUrl,
          socialLinksCount: result.socialLinks?.length || 0 
        });

        // Determine the website URL (from result or localStorage)
        const websiteUrl = result.websiteUrl || parsed.websiteUrl || null;
        let websiteScreenshot = result.websiteScreenshot || null;

        // FALLBACK: If we have URL but no screenshot (cache cleared), capture it directly
        if (websiteUrl && !websiteScreenshot && parsed.hasWebsiteScreenshot) {
          console.log('[StageOnlinePresence] Cache miss - capturing website screenshot directly...');
          try {
            const screenshotResponse = await fetch('/api/scan/socials/screenshot', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                platform: 'website',
                url: websiteUrl,
                viewport: 'desktop',
              }),
            });
            if (screenshotResponse.ok) {
              const screenshotData = await screenshotResponse.json();
              websiteScreenshot = screenshotData.screenshot || null;
              console.log('[StageOnlinePresence] Direct screenshot capture:', !!websiteScreenshot);
            }
          } catch (screenshotErr) {
            console.error('[StageOnlinePresence] Direct screenshot capture failed:', screenshotErr);
          }
        }

        // 3. Format and set data
        const completeData: OnlinePresenceData = {
          websiteUrl,
          websiteScreenshot,
          socialLinks: (result.socialLinks || []).map((link: any) => ({
            platform: link.platform,
            url: link.url,
            screenshot: link.screenshot || null,
            status: link.screenshot ? 'success' : 'pending',
          })),
        };

        setData(completeData);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching online presence data:', err);
        // If it's just waiting, don't show a hard error yet
        if (err instanceof Error && err.message === 'Waiting for scan results...') {
          // Keep loading
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to load online presence data');
        setLoading(false);
      }
    };

    fetchData();
    
    // Optional: poll if not complete
    const interval = setInterval(() => {
      if (loading && !data && !initialData) {
        fetchData();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [scanId, businessName, address, loading, data, initialData]);

  // Website Screenshot Component with browser chrome (Windows style)
  const WebsiteScreenshot = ({ screenshot, url }: { screenshot: string | null; url?: string | null }) => (
    <div className="relative">
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
        {/* Browser top bar */}
        <div className="flex items-center justify-between bg-gray-100 px-3 py-2 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>
          <div className="flex-1 mx-3">
            <div className="h-6 bg-white border border-gray-300 rounded px-2 text-[10px] text-gray-500 flex items-center truncate">
              {url || 'Loading...'}
            </div>
          </div>
          <div className="w-8" />
        </div>
        {/* Page area */}
        <div className="bg-white overflow-hidden" style={{ maxHeight: '400px' }}>
          {screenshot ? (
            <img
              src={screenshot}
              alt="Website screenshot"
              className="w-full h-auto object-top"
            />
          ) : (
            <div className="w-full h-64 bg-gray-50 flex items-center justify-center">
              <div className="text-gray-400 text-sm">Loading website...</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Social Media Screenshot inside a refined iPhone-style mock
  const SocialScreenshot = ({ screenshot, platform }: { screenshot: string | null; platform: 'instagram' | 'facebook' }) => (
    <div className="relative">
      <div className="relative rounded-[2.5rem] bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#0b1220] shadow-2xl border border-[#1f2937] px-1.5 pt-3 pb-1">
        {/* Side buttons */}
        <div className="absolute -left-[2px] top-16 h-8 w-[2px] rounded-l-sm bg-[#334155]" />
        <div className="absolute -left-[2px] top-28 h-12 w-[2px] rounded-l-sm bg-[#334155]" />
        <div className="absolute -left-[2px] top-44 h-12 w-[2px] rounded-l-sm bg-[#334155]" />
        <div className="absolute -right-[2px] top-32 h-16 w-[2px] rounded-r-sm bg-[#334155]" />
        
        {/* Notch */}
        <div className="absolute top-1 left-1/2 -translate-x-1/2 w-24 h-5 bg-[#0b0f17] rounded-b-2xl z-20" />
        
        {/* Screen */}
        <div className="relative bg-black rounded-[2.2rem] overflow-hidden aspect-[9/19.5] border border-[#1f2937]/60">
          {screenshot ? (
            <img
              src={screenshot}
              alt={`${platform} screenshot`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gray-900 flex items-center justify-center">
              <div className="text-gray-500 text-xs">Loading {platform}...</div>
            </div>
          )}
          {/* Bottom home indicator */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-20 h-1 bg-white/30 rounded-full" />
        </div>
      </div>
    </div>
  );

  if (loading && !data) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center">
          <ScanLineOverlay />
          <div className="text-gray-600 text-sm mb-2 mt-4">Analyzing online presence...</div>
          <div className="text-gray-400 text-xs">Fetching screenshots and links</div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center text-gray-600">
          <div className="text-sm">{error}</div>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md text-xs hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const instagramLink = data?.socialLinks.find(link => link.platform === 'instagram');
  const facebookLink = data?.socialLinks.find(link => link.platform === 'facebook');

  return (
    <div className="w-full h-full flex items-center justify-center p-8 relative overflow-hidden">
      <ScanLineOverlay />
      <div className="max-w-6xl w-full">
        <div className="relative flex items-center justify-center" style={{ minHeight: '520px' }}>
          {/* Website Screenshot - Center */}
          <div className="relative z-0 w-full max-w-4xl mx-auto transition-all duration-700 transform">
            <WebsiteScreenshot screenshot={data?.websiteScreenshot || null} url={data?.websiteUrl} />
          </div>

          {/* Instagram Screenshot - Left */}
          {instagramLink && (
            <div className="absolute left-[-20px] top-[55%] -translate-y-1/2 z-10 w-44 md:w-52 transform -rotate-6 transition-all duration-700 hover:rotate-0 hover:scale-105 cursor-pointer">
              <SocialScreenshot screenshot={instagramLink.screenshot} platform="instagram" />
            </div>
          )}

          {/* Facebook Screenshot - Right */}
          {facebookLink && (
            <div className="absolute right-[-20px] top-[55%] -translate-y-1/2 z-10 w-44 md:w-52 transform rotate-6 transition-all duration-700 hover:rotate-0 hover:scale-105 cursor-pointer">
              <SocialScreenshot screenshot={facebookLink.screenshot} platform="facebook" />
            </div>
          )}

          {/* Fallback if no screenshots found at all */}
          {!data?.websiteScreenshot && !instagramLink?.screenshot && !facebookLink?.screenshot && !loading && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
              No presence data found for this business.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
