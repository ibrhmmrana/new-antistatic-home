'use client';

import { useState } from 'react';

interface SocialLink {
  platform: string;
  url: string;
  screenshots?: {
    mobile?: string;
  };
  screenshotStatus?: {
    mobile?: 'pending' | 'loading' | 'success' | 'error';
  };
}

interface ExtractionResult {
  success: boolean;
  businessName: string;
  address: string;
  socialLinks: SocialLink[];
  websiteUrl: string | null;
  websiteScreenshot?: string | null;
  count: number;
  rawCount?: number;
}

export default function TestSocialScraper() {
  const [businessName, setBusinessName] = useState('Café Caprice');
  const [address, setAddress] = useState('37 Victoria Rd, Camps Bay, Cape Town, 8005');
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const captureScreenshot = async (
    platform: string,
    url: string,
    viewport: 'desktop' | 'mobile'
  ): Promise<string | null> => {
    try {
      const response = await fetch('/api/scan/socials/screenshot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ platform, url, viewport }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Screenshot capture failed');
      }

      return data.screenshot || null;
    } catch (err) {
      console.error(`Error capturing ${viewport} screenshot:`, err);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setCurrentStep('Extracting social links from Google Business Profile...');

    try {
      // Step 1: Extract social links
      const response = await fetch('/api/scan/socials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ businessName, address }),
      });

      const extractionData: ExtractionResult = await response.json();

      if (!response.ok) {
        throw new Error(extractionData.error || 'Request failed');
      }

      if (!extractionData.socialLinks || extractionData.socialLinks.length === 0) {
        setResult(extractionData);
        setLoading(false);
        return;
      }

      // Initialize links with screenshot status (mobile only)
      const linksWithScreenshots: SocialLink[] = extractionData.socialLinks.map((link) => ({
        ...link,
        screenshots: {},
        screenshotStatus: {
          mobile: 'pending',
        },
      }));

      setResult({
        ...extractionData,
        socialLinks: linksWithScreenshots,
      });

      // Step 2: Capture screenshots for each social media link
      for (let i = 0; i < linksWithScreenshots.length; i++) {
        const link = linksWithScreenshots[i];
        setCurrentStep(
          `Capturing screenshots for ${link.platform} (${i + 1}/${linksWithScreenshots.length})...`
        );

        // Update status to loading
        link.screenshotStatus = {
          mobile: 'loading',
        };
        setResult({
          ...extractionData,
          socialLinks: [...linksWithScreenshots],
        });

        // Capture mobile screenshot only
        setCurrentStep(
          `Capturing mobile screenshot for ${link.platform}...`
        );
        const mobileScreenshot = await captureScreenshot(link.platform, link.url, 'mobile');
        
        if (mobileScreenshot) {
          link.screenshots = {
            mobile: mobileScreenshot,
          };
          link.screenshotStatus = {
            mobile: 'success',
          };
        } else {
          link.screenshotStatus = {
            mobile: 'error',
          };
        }

        setResult({
          ...extractionData,
          socialLinks: [...linksWithScreenshots],
        });
      }

      // Step 3: Capture website screenshot (desktop, full-page)
      let websiteScreenshot: string | null = null;
      if (extractionData.websiteUrl) {
        setCurrentStep('Capturing website screenshot (desktop, full-page)...');
        websiteScreenshot = await captureScreenshot('website', extractionData.websiteUrl, 'desktop');
        setResult({
          ...extractionData,
          socialLinks: linksWithScreenshots,
          websiteScreenshot,
        });
      }

      setCurrentStep('Complete!');
      setResult({
        ...extractionData,
        socialLinks: linksWithScreenshots,
        websiteScreenshot,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setCurrentStep('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '50px auto', padding: '20px' }}>
      <div style={{ background: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h1 style={{ color: '#333', marginBottom: '20px' }}>🧪 Test Social Media Scraper</h1>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#555' }}>
              Business Name:
            </label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g., Café Caprice"
              required
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#555' }}>
              Full Address:
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g., 37 Victoria Rd, Camps Bay, Cape Town, 8005"
              required
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? '#ccc' : '#0070f3',
              color: 'white',
              padding: '12px 24px',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
            }}
          >
            {loading ? 'Testing...' : 'Test Scraper'}
          </button>
        </form>

        {loading && (
          <div style={{ marginTop: '30px', padding: '20px', background: '#f9f9f9', borderRadius: '4px' }}>
            <h2 style={{ marginTop: 0, color: '#666' }}>⏳ Processing...</h2>
            {currentStep && (
              <p style={{ color: '#666', fontStyle: 'italic', marginTop: '10px' }}>
                {currentStep}
              </p>
            )}
            <p style={{ color: '#666', fontStyle: 'italic', marginTop: '10px', fontSize: '12px' }}>
              This may take 30-60 seconds depending on the number of profiles found...
            </p>
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: '30px',
              padding: '20px',
              background: '#fee',
              borderRadius: '4px',
              borderLeft: '4px solid #e74c3c',
            }}
          >
            <h2 style={{ marginTop: 0, color: '#333' }}>❌ Error</h2>
            <p>
              <strong>Error:</strong> {error}
            </p>
          </div>
        )}

        {result && (
          <div
            style={{
              marginTop: '30px',
              padding: '20px',
              background: result.socialLinks.length > 0 ? '#efe' : '#f9f9f9',
              borderRadius: '4px',
              borderLeft: `4px solid ${result.socialLinks.length > 0 ? '#27ae60' : '#0070f3'}`,
            }}
          >
            <h2 style={{ marginTop: 0, color: '#333' }}>
              {result.socialLinks.length > 0 ? '✅ Success!' : '⚠️ No Links Found'}
            </h2>
            <p>
              <strong>Business:</strong> {result.businessName}
            </p>
            <p>
              <strong>Address:</strong> {result.address}
            </p>
            <p>
              <strong>Found {result.count} social media link(s):</strong>
            </p>

            {result.socialLinks && result.socialLinks.length > 0 ? (
              <div style={{ marginTop: '15px' }}>
                {result.socialLinks.map((link: SocialLink, index: number) => (
                  <div
                    key={index}
                    style={{
                      margin: '20px 0',
                      padding: '15px',
                      background: 'white',
                      borderRadius: '4px',
                      border: '1px solid #ddd',
                    }}
                  >
                    <div style={{ marginBottom: '10px' }}>
                      <strong style={{ color: '#0070f3', textTransform: 'capitalize', fontSize: '16px' }}>
                        {link.platform}:
                      </strong>{' '}
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#0066cc', textDecoration: 'none' }}
                      >
                        {link.url}
                      </a>
                    </div>

                    {/* Screenshot Status */}
                    {link.screenshotStatus && (
                      <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                        Mobile Screenshot:{' '}
                        {link.screenshotStatus.mobile === 'loading' && '⏳ Capturing...'}
                        {link.screenshotStatus.mobile === 'success' && '✅ Captured'}
                        {link.screenshotStatus.mobile === 'error' && '❌ Failed'}
                        {link.screenshotStatus.mobile === 'pending' && '⏸️ Pending'}
                      </div>
                    )}

                    {/* Screenshots */}
                    {link.screenshots && link.screenshots.mobile && (
                      <div style={{ marginTop: '15px' }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#555' }}>
                          Mobile Screenshot
                        </h4>
                        <img
                          src={link.screenshots.mobile}
                          alt={`${link.platform} mobile screenshot`}
                          style={{
                            width: '100%',
                            maxWidth: '375px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            maxHeight: '812px',
                            objectFit: 'contain',
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#666', fontStyle: 'italic' }}>No social media links found.</p>
            )}

            {/* Website Screenshot */}
            {result.websiteUrl && (
              <div
                style={{
                  marginTop: '30px',
                  padding: '15px',
                  background: 'white',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                }}
              >
                <div style={{ marginBottom: '10px' }}>
                  <strong style={{ color: '#0070f3', fontSize: '16px' }}>
                    Website:
                  </strong>{' '}
                  <a
                    href={result.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#0066cc', textDecoration: 'none' }}
                  >
                    {result.websiteUrl}
                  </a>
                </div>

                {result.websiteScreenshot ? (
                  <div style={{ marginTop: '15px' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#555' }}>
                      Website Screenshot (Desktop, Full-Page)
                    </h4>
                    <img
                      src={result.websiteScreenshot}
                      alt="Website screenshot"
                      style={{
                        width: '100%',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        maxHeight: '600px',
                        objectFit: 'contain',
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                    ⏳ Capturing website screenshot...
                  </div>
                )}
              </div>
            )}

            <details style={{ marginTop: '20px' }}>
              <summary style={{ cursor: 'pointer', color: '#666' }}>View Raw JSON</summary>
              <pre
                style={{
                  background: '#2d2d2d',
                  color: '#f8f8f2',
                  padding: '15px',
                  borderRadius: '4px',
                  overflowX: 'auto',
                  fontSize: '12px',
                  marginTop: '10px',
                }}
              >
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

