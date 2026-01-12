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
  const [screenshotError, setScreenshotError] = useState(false);

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
              if (screenshotData.success && screenshotData.screenshot) {
                websiteScreenshot = screenshotData.screenshot;
                console.log('[StageOnlinePresence] Direct screenshot capture:', !!websiteScreenshot);
              } else {
                // Screenshot capture failed
                console.warn('[StageOnlinePresence] Screenshot capture returned failure:', screenshotData.error);
                setScreenshotError(true);
              }
            } else {
              // HTTP error
              console.warn('[StageOnlinePresence] Screenshot capture HTTP error:', screenshotResponse.status);
              setScreenshotError(true);
            }
          } catch (screenshotErr) {
            console.error('[StageOnlinePresence] Direct screenshot capture failed:', screenshotErr);
            setScreenshotError(true);
          }
        } else if (websiteUrl && !websiteScreenshot && !parsed.hasWebsiteScreenshot) {
          // No screenshot was ever captured, mark as error
          setScreenshotError(true);
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
  const WebsiteScreenshot = ({ 
    screenshot, 
    url, 
    hasError 
  }: { 
    screenshot: string | null; 
    url?: string | null;
    hasError?: boolean;
  }) => {
    const [isVisible, setIsVisible] = useState(false);
    
    // Trigger animation when screenshot is available or error state is set
    useEffect(() => {
      if (screenshot || hasError) {
        // Small delay to ensure smooth animation
        const timer = setTimeout(() => setIsVisible(true), 100);
        return () => clearTimeout(timer);
      }
    }, [screenshot, hasError]);
    
    return (
      <div className={`relative ${isVisible ? 'browser-in' : 'opacity-0'}`}>
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
          {/* Page area - maintains 16:10 aspect ratio (1440:900 viewport) */}
          <div className="bg-white overflow-hidden" style={{ aspectRatio: '16 / 10' }}>
            {screenshot ? (
              <img
                src={screenshot}
                alt="Website screenshot"
                className="w-full h-full object-cover object-top"
              />
            ) : hasError ? (
              <div className="w-full h-full bg-gray-50 flex flex-col items-center justify-center">
                <div className="text-gray-400 text-sm mb-2">Unable to capture screenshot</div>
                {url && (
                  <a 
                    href={url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 text-xs underline"
                  >
                    Visit website →
                  </a>
                )}
              </div>
            ) : (
              <div className="w-full h-full bg-gray-50 flex items-center justify-center">
                <div className="text-gray-400 text-sm">Loading website...</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Social Media Screenshot inside a refined iPhone-style mock (White version)
  const SocialScreenshot = ({ screenshot, platform, url, hasError }: { screenshot: string | null; platform: 'instagram' | 'facebook'; url?: string; hasError?: boolean }) => {
    const [isVisible, setIsVisible] = useState(false);
    
    // Trigger animation when screenshot is available or error state
    useEffect(() => {
      if (screenshot || hasError) {
        // Small delay to ensure smooth animation
        const timer = setTimeout(() => setIsVisible(true), 100);
        return () => clearTimeout(timer);
      }
    }, [screenshot, hasError]);
    
    const platformColors = {
      instagram: 'from-pink-500 via-purple-500 to-indigo-500',
      facebook: 'from-blue-600 to-blue-700',
    };
    
    return (
      <div className={`relative ${isVisible ? 'browser-in' : 'opacity-0'}`}>
        <div className="relative rounded-[2.2rem] bg-gradient-to-br from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0] shadow-xl border border-gray-200/80 px-1 pt-2 pb-0.5">
          {/* Side buttons - positioned inside the border, not protruding */}
          <div className="absolute left-0 top-16 h-6 w-[1px] bg-gray-300" />
          <div className="absolute left-0 top-26 h-10 w-[1px] bg-gray-300" />
          <div className="absolute left-0 top-40 h-10 w-[1px] bg-gray-300" />
          <div className="absolute right-0 top-28 h-12 w-[1px] bg-gray-300" />
          
          {/* Dynamic Island / Notch */}
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-14 h-3 bg-gray-400 rounded-full z-20" />
          
          {/* Screen */}
          <div className="relative bg-white rounded-[1.8rem] overflow-hidden aspect-[9/19.5] border border-gray-200/60">
            {screenshot ? (
              <img
                src={screenshot}
                alt={`${platform} screenshot`}
                className="w-full h-full object-cover"
              />
            ) : hasError ? (
              <div className="w-full h-full bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col items-center justify-center p-4">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${platformColors[platform]} flex items-center justify-center mb-3`}>
                  {platform === 'instagram' ? (
                    <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                  ) : (
                    <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  )}
                </div>
                <div className="text-gray-500 text-xs text-center mb-2">Preview unavailable</div>
                {url && (
                  <a 
                    href={url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className={`text-xs bg-gradient-to-r ${platformColors[platform]} text-white px-3 py-1.5 rounded-full hover:opacity-90 transition-opacity`}
                  >
                    View on {platform.charAt(0).toUpperCase() + platform.slice(1)}
                  </a>
                )}
              </div>
            ) : (
              <div className="w-full h-full bg-gray-50 flex items-center justify-center">
                <div className="text-gray-400 text-xs">Loading {platform}...</div>
              </div>
            )}
            {/* Bottom home indicator */}
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-16 h-1 bg-black/20 rounded-full" />
          </div>
        </div>
      </div>
    );
  };

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
  
  // Determine which social links we have (show if URL exists, even without screenshot)
  const hasWebsite = !!(data?.websiteScreenshot || data?.websiteUrl);
  const hasInstagram = !!(instagramLink?.url); // Changed: show if URL exists
  const hasFacebook = !!(facebookLink?.url); // Changed: show if URL exists
  
  // Track if screenshots failed (URL exists but no screenshot)
  const instagramScreenshotFailed = !!(instagramLink?.url && !instagramLink?.screenshot);
  const facebookScreenshotFailed = !!(facebookLink?.url && !facebookLink?.screenshot);
  
  // Count available items (website or social links with URL)
  const screenshotCount = [hasWebsite, hasInstagram, hasFacebook].filter(Boolean).length;
  
  // Layout configurations based on available screenshots
  const renderLayout = () => {
    // No screenshots at all
    if (screenshotCount === 0 && !loading) {
      return (
        <div className="flex items-center justify-center h-full text-gray-500 text-sm">
          No online presence data found for this business.
        </div>
      );
    }
    
    // ALL THREE SCREENSHOTS
    if (hasWebsite && hasInstagram && hasFacebook) {
      return (
        <div className="relative flex items-center justify-center" style={{ minHeight: '520px' }}>
          {/* Website - Center */}
          <div className="relative z-0 w-full max-w-3xl mx-auto">
            <WebsiteScreenshot 
              screenshot={data?.websiteScreenshot || null} 
              url={data?.websiteUrl} 
              hasError={screenshotError && !data?.websiteScreenshot}
            />
          </div>
          {/* Instagram - Left */}
          <div className="absolute left-0 top-[75%] -translate-y-1/2 z-10 w-52 md:w-64 transform -rotate-6 transition-all duration-500 hover:rotate-0 hover:scale-105 cursor-pointer">
            <SocialScreenshot screenshot={instagramLink!.screenshot} platform="instagram" url={instagramLink!.url} hasError={instagramScreenshotFailed} />
          </div>
          {/* Facebook - Right */}
          <div className="absolute right-0 top-[75%] -translate-y-1/2 z-10 w-52 md:w-64 transform rotate-6 transition-all duration-500 hover:rotate-0 hover:scale-105 cursor-pointer">
            <SocialScreenshot screenshot={facebookLink!.screenshot} platform="facebook" url={facebookLink!.url} hasError={facebookScreenshotFailed} />
          </div>
        </div>
      );
    }
    
    // WEBSITE + ONE SOCIAL (Instagram or Facebook)
    if (hasWebsite && (hasInstagram || hasFacebook) && !(hasInstagram && hasFacebook)) {
      const socialLink = hasInstagram ? instagramLink : facebookLink;
      const platform = hasInstagram ? 'instagram' : 'facebook';
      const isInstagram = hasInstagram;
      const socialScreenshotFailed = isInstagram ? instagramScreenshotFailed : facebookScreenshotFailed;
      
      return (
        <div className="flex items-center justify-center gap-8 md:gap-12" style={{ minHeight: '520px' }}>
          {/* Social on left if Instagram, right if Facebook */}
          {isInstagram && (
            <div className="w-56 md:w-72 transform -rotate-3 transition-all duration-500 hover:rotate-0 hover:scale-105 cursor-pointer flex-shrink-0">
              <SocialScreenshot screenshot={socialLink!.screenshot} platform={platform as 'instagram' | 'facebook'} url={socialLink!.url} hasError={socialScreenshotFailed} />
            </div>
          )}
          {/* Website - Center */}
          <div className="relative z-0 w-full max-w-2xl">
            <WebsiteScreenshot 
              screenshot={data?.websiteScreenshot || null} 
              url={data?.websiteUrl} 
              hasError={screenshotError && !data?.websiteScreenshot}
            />
          </div>
          {/* Facebook on right */}
          {!isInstagram && (
            <div className="w-56 md:w-72 transform rotate-3 transition-all duration-500 hover:rotate-0 hover:scale-105 cursor-pointer flex-shrink-0">
              <SocialScreenshot screenshot={socialLink!.screenshot} platform={platform as 'instagram' | 'facebook'} url={socialLink!.url} hasError={socialScreenshotFailed} />
            </div>
          )}
        </div>
      );
    }
    
    // TWO SOCIALS ONLY (Instagram + Facebook, no website)
    if (!hasWebsite && hasInstagram && hasFacebook) {
      return (
        <div className="flex items-center justify-center gap-6 md:gap-12" style={{ minHeight: '520px' }}>
          {/* Instagram - Left */}
          <div className="w-56 md:w-72 transform -rotate-6 transition-all duration-500 hover:rotate-0 hover:scale-105 cursor-pointer">
            <SocialScreenshot screenshot={instagramLink!.screenshot} platform="instagram" url={instagramLink!.url} hasError={instagramScreenshotFailed} />
          </div>
          {/* Facebook - Right */}
          <div className="w-56 md:w-72 transform rotate-6 transition-all duration-500 hover:rotate-0 hover:scale-105 cursor-pointer">
            <SocialScreenshot screenshot={facebookLink!.screenshot} platform="facebook" url={facebookLink!.url} hasError={facebookScreenshotFailed} />
          </div>
        </div>
      );
    }
    
    // WEBSITE ONLY
    if (hasWebsite && !hasInstagram && !hasFacebook) {
      return (
        <div className="flex items-center justify-center" style={{ minHeight: '520px' }}>
          <div className="relative z-0 w-full max-w-4xl mx-auto">
            <WebsiteScreenshot 
              screenshot={data?.websiteScreenshot || null} 
              url={data?.websiteUrl} 
              hasError={screenshotError && !data?.websiteScreenshot}
            />
          </div>
        </div>
      );
    }
    
    // SINGLE SOCIAL ONLY (Instagram or Facebook)
    if (!hasWebsite && ((hasInstagram && !hasFacebook) || (!hasInstagram && hasFacebook))) {
      const socialLink = hasInstagram ? instagramLink : facebookLink;
      const platform = hasInstagram ? 'instagram' : 'facebook';
      const socialScreenshotFailed = hasInstagram ? instagramScreenshotFailed : facebookScreenshotFailed;
      
      return (
        <div className="flex items-center justify-center" style={{ minHeight: '520px' }}>
          <div className="w-64 md:w-80 transition-all duration-500 hover:scale-105 cursor-pointer">
            <SocialScreenshot screenshot={socialLink!.screenshot} platform={platform as 'instagram' | 'facebook'} url={socialLink!.url} hasError={socialScreenshotFailed} />
          </div>
        </div>
      );
    }
    
    // Fallback - loading state
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400 text-sm">Loading screenshots...</div>
      </div>
    );
  };

  return (
    <div className="w-full h-full flex items-center justify-center p-8 relative overflow-hidden">
      <ScanLineOverlay />
      <div className="max-w-6xl w-full h-full">
        {renderLayout()}
      </div>
    </div>
  );
}
