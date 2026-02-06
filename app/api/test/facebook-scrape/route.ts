import { NextRequest, NextResponse } from "next/server";
import { chromium as pwChromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";
import chromium from "@sparticuz/chromium";

export const runtime = "nodejs";

const TIMEOUT_MS = 60000; // 60 seconds for scraping

// =============================================================================
// OUTPUT SHAPE
// =============================================================================

type FacebookComment = {
  author: string | null;
  text: string | null;
  timeAgo: string | null;
  reactionCount: number | null;
};

type FacebookPost = {
  caption: string | null;
  likeCount: number | null;
  commentCount: number | null;
  mediaType: 'image' | 'video' | 'multiple_images' | 'unknown';
  comments: FacebookComment[];
};

type FacebookProfileData = {
  name: string | null;
  description: string | null;
  category: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  hours: string | null;
  serviceOptions: string | null;
  priceRange: string | null;
  reviewsRating: string | null;
  profilePictureUrl: string | null;
  posts: FacebookPost[];
};

// =============================================================================
// HELPER FUNCTIONS (replicated from screenshot route)
// =============================================================================

/**
 * Sets up stealth properties to avoid bot detection
 */
async function setupStealth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: PermissionDescriptor) => (
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : originalQuery(parameters)
    );

    Object.defineProperty(window, 'chrome', {
      get: () => ({
        runtime: {},
        loadTimes: () => {},
        csi: () => {},
        app: { isInstalled: false },
      }),
    });

    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });

    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
      if (parameter === 37445) return 'Intel Inc.';
      if (parameter === 37446) return 'Intel Iris OpenGL Engine';
      return getParameter.call(this, parameter);
    };
  });

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  });
}

/**
 * Dismisses Facebook popups and modals
 */
async function dismissFacebookPopups(page: Page): Promise<void> {
  console.log(`[FB-SCRAPE] Checking for Facebook popups...`);
  
  const closeSelectors = [
    'div[role="button"][aria-label="Close"]',
    'div[role="button"][aria-label="Close"] span',
    'div[role="button"][data-action-id]',
    'button[aria-label="Close"]',
    'button:has-text("Close")',
    '[aria-label="Close"]',
    'button:has-text("Not Now")',
    'button:has-text("Not now")',
    'div[role="button"]:has-text("Not Now")',
    'div[role="button"]:has-text("Not now")',
    '[data-testid*="close"]',
    '[data-testid*="dismiss"]',
    '[role="dialog"] button[aria-label*="Close"]',
  ];

  for (const selector of closeSelectors) {
    try {
      const element = page.locator(selector).first();
      const isVisible = await element.isVisible({ timeout: 1000 }).catch(() => false);
      
      if (isVisible) {
        console.log(`[FB-SCRAPE] Found popup, attempting to close with selector: ${selector}`);
        await element.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(500);
        console.log(`[FB-SCRAPE] Popup closed successfully`);
        break;
      }
    } catch {
      continue;
    }
  }

  await page.waitForTimeout(1000);
  console.log(`[FB-SCRAPE] Popup dismissal complete`);
}

/**
 * Removes Facebook login/signup prompt element
 */
async function removeFacebookLoginPrompt(page: Page): Promise<void> {
  console.log(`[FB-SCRAPE] Checking for Facebook login/signup prompt...`);
  
  try {
    const removed = await page.evaluate(() => {
      let removedCount = 0;
      
      const loginLinks = Array.from(document.querySelectorAll('a[aria-label="Log in"]'));
      
      for (const loginLink of loginLinks) {
        let current = loginLink.parentElement;
        let lastMatchingContainer: HTMLElement | null = null;
        
        while (current && current !== document.body) {
          if (current.classList.contains('x78zum5') && current.classList.contains('xdt5ytf')) {
            lastMatchingContainer = current as HTMLElement;
          }
          current = current.parentElement;
        }
        
        if (lastMatchingContainer) {
          lastMatchingContainer.remove();
          removedCount++;
        }
      }
      
      const signupLinks = Array.from(document.querySelectorAll('a[aria-label="Create new account"]'));
      for (const signupLink of signupLinks) {
        let current = signupLink.parentElement;
        let lastMatchingContainer: HTMLElement | null = null;
        
        while (current && current !== document.body) {
          if (current.classList.contains('x78zum5') && current.classList.contains('xdt5ytf')) {
            lastMatchingContainer = current as HTMLElement;
          }
          current = current.parentElement;
        }
        
        if (lastMatchingContainer) {
          lastMatchingContainer.remove();
          removedCount++;
        }
      }
      
      return removedCount;
    });
    
    if (removed > 0) {
      console.log(`[FB-SCRAPE] ✅ Removed ${removed} Facebook login prompt container(s)`);
      await page.waitForTimeout(300);
    }
  } catch (error) {
    console.log(`[FB-SCRAPE] Login prompt removal failed, continuing...`);
  }
  
  console.log(`[FB-SCRAPE] Facebook login prompt removal complete`);
}

/**
 * Clicks the hours button and extracts hours and services from the popup
 */
async function extractHoursAndServices(page: Page): Promise<{ hours: string | null; serviceOptions: string | null }> {
  console.log(`[FB-SCRAPE] Attempting to extract hours and services...`);
  
  let hours: string | null = null;
  let serviceOptions: string | null = null;
  
  try {
    // First, scroll up to make sure About section is visible
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
    
    // Wait for the page content to be more fully loaded
    await page.waitForSelector('h1', { timeout: 5000 }).catch(() => {
      console.log(`[FB-SCRAPE] No h1 found, page might not be fully loaded`);
    });
    
    // Scroll down a bit to reveal the About section (usually below the cover photo)
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(1500);
    
    // Try to find the hours button using evaluate for more flexibility
    const buttonInfo = await page.evaluate(() => {
      // Look for span containing hours-related text inside a button
      const allSpans = document.querySelectorAll('span[dir="auto"]');
      const candidateTexts: string[] = [];
      let foundButton = false;
      
      for (const span of Array.from(allSpans)) {
        const text = span.textContent?.trim() || '';
        // Log spans that might be related to hours
        if (text.length > 0 && text.length < 50 && /^(Closed|Open|Hours|Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(text)) {
          candidateTexts.push(text);
        }
        // Match: "Closed now", "Open now", "Opens at", "Closes at", "Open until", "Closed until"
        if (/^(Closed|Open)/i.test(text)) {
          // Find parent button
          const button = span.closest('div[role="button"]');
          if (button) {
            foundButton = true;
          }
        }
      }
      return { found: foundButton, candidates: candidateTexts };
    });
    
    console.log(`[FB-SCRAPE] Hours button candidates found:`, buttonInfo.candidates);
    const buttonFound = buttonInfo.found;
    
    console.log(`[FB-SCRAPE] Hours button found via evaluate: ${buttonFound}`);
    
    if (buttonFound) {
      // Remove any login popup first
      await removeLoginPopup(page);
      await page.waitForTimeout(300);
      
      // Scroll the button into view and click it
      await page.evaluate(() => {
        const allSpans = document.querySelectorAll('span[dir="auto"]');
        for (const span of Array.from(allSpans)) {
          const text = span.textContent?.trim() || '';
          if (/^(Closed|Open)/i.test(text)) {
            const button = span.closest('div[role="button"]');
            if (button) {
              // Scroll into view first
              button.scrollIntoView({ behavior: 'instant', block: 'center' });
              return;
            }
          }
        }
      });
      
      await page.waitForTimeout(500);
      
      // Now click the button
      await page.evaluate(() => {
        const allSpans = document.querySelectorAll('span[dir="auto"]');
        for (const span of Array.from(allSpans)) {
          const text = span.textContent?.trim() || '';
          if (/^(Closed|Open)/i.test(text)) {
            const button = span.closest('div[role="button"]');
            if (button) {
              (button as HTMLElement).click();
              return;
            }
          }
        }
      });
      
      console.log(`[FB-SCRAPE] Clicked hours button, waiting for popup...`);
      
      // Wait for popup to appear
      await page.waitForTimeout(2500);
      
      // Extract hours and services from popup
      const popupData = await page.evaluate(() => {
        const getText = (el: Element | null): string | null => {
          const t = el?.textContent?.trim();
          return t && t.length > 0 ? t : null;
        };
        
        console.log('[FB-SCRAPE] Looking for popup...');
        
        // Find the Hours dialog - it has role="dialog" and aria-label="Hours"
        let popup: Element | null = document.querySelector('div[role="dialog"][aria-label="Hours"]');
        
        if (!popup) {
          // Fallback: try finding by x5yr21d class (inner content area of dialog)
          popup = document.querySelector('div.x5yr21d');
        }
        if (!popup) {
          // Try finding the hours section by its container class
          popup = document.querySelector('div.xyorhqc.xh8yej3');
        }
        if (!popup) {
          // Last resort: find any container that has Monday text
          const mondaySpans = document.querySelectorAll('span[dir="auto"]');
          for (const span of Array.from(mondaySpans)) {
            if (span.textContent?.trim() === 'Monday') {
              popup = span.closest('div[role="dialog"]') || span.closest('div.xyorhqc') || span.parentElement?.parentElement?.parentElement?.parentElement;
              break;
            }
          }
        }
        
        if (!popup) {
          console.log('[FB-SCRAPE] Popup not found!');
          return { hours: null, serviceOptions: null, debug: 'popup not found' };
        }
        
        console.log('[FB-SCRAPE] Popup found:', popup.getAttribute('role'), popup.getAttribute('aria-label'));
        
        console.log('[FB-SCRAPE] Popup found, extracting hours...');
        
        // Extract hours - look for day/time pairs
        const hoursData: string[] = [];
        const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        
        // Find the hours container within the popup (div.xyorhqc.xh8yej3)
        const hoursContainer = popup.querySelector('div.xyorhqc.xh8yej3') || popup;
        console.log('[FB-SCRAPE] Hours container found:', !!hoursContainer);
        
        // Method 1: Find day rows by their class structure
        // Each day row has class: x9f619 x1ja2u2z x2lah0s x1n2onr6 x1qughib xozqiw3
        let dayRows = hoursContainer.querySelectorAll('div.x9f619.x1ja2u2z.x2lah0s.x1n2onr6.x1qughib.xozqiw3');
        console.log('[FB-SCRAPE] Found', dayRows.length, 'day rows using xozqiw3 selector');
        
        // Fallback selector if none found
        if (dayRows.length === 0) {
          dayRows = hoursContainer.querySelectorAll('div.x9f619.x1ja2u2z.x2lah0s.x1n2onr6.x1qughib');
          console.log('[FB-SCRAPE] Found', dayRows.length, 'day rows using x1qughib selector');
        }
        
        // Process day rows
        for (const row of Array.from(dayRows)) {
          const spans = row.querySelectorAll('span[dir="auto"]');
          let dayName: string | null = null;
          const times: string[] = [];
          
          for (const span of Array.from(spans)) {
            const text = getText(span);
            if (!text) continue;
            
            if (daysOfWeek.includes(text)) {
              dayName = text;
            } else if (/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(text) || text === 'CLOSED') {
              times.push(text);
            }
          }
          
          if (dayName && times.length > 0) {
            hoursData.push(`${dayName}: ${times.join(', ')}`);
          }
        }
        
        // Method 2: If day rows method didn't work, use sequential span parsing
        if (hoursData.length === 0) {
          console.log('[FB-SCRAPE] Day rows method failed, trying sequential span parsing...');
          const allSpans = hoursContainer.querySelectorAll('span[dir="auto"]');
          let currentDay: string | null = null;
          const dayTimesMap: { [key: string]: string[] } = {};
          
          for (const span of Array.from(allSpans)) {
            const text = getText(span);
            if (!text) continue;
            
            if (daysOfWeek.includes(text)) {
              currentDay = text;
              if (!dayTimesMap[currentDay]) {
                dayTimesMap[currentDay] = [];
              }
            } else if (currentDay && (/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(text) || text === 'CLOSED')) {
              dayTimesMap[currentDay].push(text);
            }
          }
          
          // Build hours data from map
          for (const day of daysOfWeek) {
            if (dayTimesMap[day] && dayTimesMap[day].length > 0) {
              hoursData.push(`${day}: ${dayTimesMap[day].join(', ')}`);
            }
          }
          console.log('[FB-SCRAPE] Sequential parsing found:', hoursData.length, 'days');
        }
        
        const hours = hoursData.length > 0 ? hoursData.join('; ') : null;
        console.log('[FB-SCRAPE] Extracted hours:', hours);
        
        // Extract services - look for "Services" section in the popup dialog
        let services: string | null = null;
        
        // Look for Services heading in the popup
        const servicesHeading = Array.from(popup.querySelectorAll('span[dir="auto"]')).find(span => 
          getText(span) === 'Services'
        );
        
        if (servicesHeading) {
          console.log('[FB-SCRAPE] Found Services heading in popup');
          // Find service items - they're in div.x1y1aw1k.xwib8y2.x152qxlz span[dir="auto"]
          const servicesContainer = servicesHeading.closest('div.x9f619.x1n2onr6.x1ja2u2z');
          if (servicesContainer) {
            // Look for the parent that contains all service items
            const parent = servicesContainer.closest('div.x9f619.x1ja2u2z.x78zum5') || servicesContainer.parentElement;
            if (parent) {
              // Find service items specifically
              const serviceItems = parent.querySelectorAll('div.x1y1aw1k.xwib8y2 span[dir="auto"], div.x152qxlz span[dir="auto"]');
              const serviceList: string[] = [];
              
              for (const serviceSpan of Array.from(serviceItems)) {
                const serviceText = getText(serviceSpan);
                if (serviceText && serviceText !== 'Services') {
                  serviceList.push(serviceText);
                }
              }
              
              // If specific selector didn't work, try broader approach
              if (serviceList.length === 0) {
                const allSpans = parent.querySelectorAll('span[dir="auto"]');
                for (const span of Array.from(allSpans)) {
                  const text = getText(span);
                  if (text && 
                      text !== 'Services' && 
                      !text.includes('Updated') &&
                      !daysOfWeek.includes(text) &&
                      !/^\d{1,2}:\d{2}/.test(text) &&
                      text !== 'CLOSED' &&
                      !text.includes('Popular') &&
                      text.length < 30) {
                    serviceList.push(text);
                  }
                }
              }
              
              // Dedupe
              const uniqueServices = Array.from(new Set(serviceList));
              if (uniqueServices.length > 0) {
                services = uniqueServices.join(', ');
              }
            }
          }
        }
        
        console.log('[FB-SCRAPE] Extracted services:', services);
        
        return { hours, serviceOptions: services, debug: 'success' };
      });
      
      console.log(`[FB-SCRAPE] Popup extraction result:`, JSON.stringify(popupData));
      
      hours = popupData.hours;
      serviceOptions = popupData.serviceOptions;
      
      // Close the popup by clicking outside or pressing Escape
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(500);
    } else {
      console.log(`[FB-SCRAPE] Hours button not found, skipping hours extraction`);
    }
  } catch (error) {
    console.log(`[FB-SCRAPE] Error extracting hours/services:`, error);
  }
  
  // Fallback: try to extract services from the main page if not found in popup
  if (!serviceOptions) {
    console.log(`[FB-SCRAPE] Trying to extract services from main page...`);
    serviceOptions = await page.evaluate(() => {
      const getText = (el: Element | null): string | null => {
        const t = el?.textContent?.trim();
        return t && t.length > 0 ? t : null;
      };
      
      // Look for Services heading on the main page
      const allSpans = document.querySelectorAll('span[dir="auto"]');
      for (const span of Array.from(allSpans)) {
        const text = getText(span);
        if (text === 'Services') {
          // Find the container and look for service items
          const container = span.closest('div.x9f619.x1n2onr6.x1ja2u2z.x78zum5.xdt5ytf.x193iq5w');
          if (container) {
            // Look for service items in nearby elements
            const parent = container.parentElement;
            if (parent) {
              const serviceSpans = parent.querySelectorAll('div.x1y1aw1k span[dir="auto"]');
              const serviceList: string[] = [];
              for (const serviceSpan of Array.from(serviceSpans)) {
                const serviceText = getText(serviceSpan);
                if (serviceText && serviceText !== 'Services') {
                  serviceList.push(serviceText);
                }
              }
              if (serviceList.length > 0) {
                return serviceList.join(', ');
              }
            }
          }
        }
      }
      return null;
    }).catch(() => null);
    
    console.log(`[FB-SCRAPE] Main page services: ${serviceOptions}`);
  }
  
  console.log(`[FB-SCRAPE] Final hours: ${hours}`);
  console.log(`[FB-SCRAPE] Final serviceOptions: ${serviceOptions}`);
  
  return { hours, serviceOptions };
}

/**
 * Extracts Facebook business profile data from the page
 */
async function extractFacebookProfileData(page: Page): Promise<Omit<FacebookProfileData, 'posts'>> {
  console.log(`[FB-SCRAPE] Extracting Facebook profile data...`);
  
  const data = await page.evaluate(() => {
    const getText = (el: Element | null): string | null => {
      const t = el?.textContent?.trim();
      return t && t.length > 0 ? t : null;
    };

    // Helper to find info section by icon URL
    const findInfoByIconUrl = (iconUrlPart: string): string | null => {
      const allImgs = Array.from(document.querySelectorAll('img'));
      for (const img of allImgs) {
        const src = img.getAttribute('src') || '';
        if (src.includes(iconUrlPart)) {
          // Find the parent container and get the text from sibling
          const container = img.closest('div.x9f619');
          if (container) {
            const textSpan = container.querySelector('span[dir="auto"]');
            if (textSpan) {
              return getText(textSpan);
            }
          }
        }
      }
      return null;
    };

    // Helper to find info by looking at the structure: div with img icon followed by text
    const findInfoByIconStructure = (iconUrlPart: string): string | null => {
      // Look for the specific list structure Facebook uses
      const listItems = Array.from(document.querySelectorAll('div.x9f619.x1ja2u2z.x78zum5.x2lah0s'));
      
      for (const item of listItems) {
        const img = item.querySelector('img');
        if (img) {
          const src = img.getAttribute('src') || '';
          if (src.includes(iconUrlPart)) {
            // Find the text content in this item
            const spans = Array.from(item.querySelectorAll('span[dir="auto"]'));
            for (const span of spans) {
              const text = getText(span);
              if (text && text.length > 2) {
                return text;
              }
            }
          }
        }
      }
      return null;
    };

    // Get page name from h1 or title
    let name: string | null = null;
    const h1 = document.querySelector('h1');
    if (h1) {
      name = getText(h1);
    }

    // Get description - the long text span at the top
    // Class pattern: x193iq5w xeuugli x13faqbe x1vvkbs x1xmvt09 x1lliihq x1s928wv xhkezso x1gmr53x x1cpjm7i x1fgarty x1943h6x xudqn12 x3x7a5m x6prxxf xvq8zen xo1l8bm xzsf02u
    let description: string | null = null;
    const descSpans = Array.from(document.querySelectorAll('span.x193iq5w.xeuugli.x13faqbe.x1vvkbs.x1xmvt09.x1lliihq.x1s928wv.xhkezso.x1gmr53x.x1cpjm7i.x1fgarty.x1943h6x.xudqn12.x3x7a5m.x6prxxf.xvq8zen.xo1l8bm.xzsf02u[dir="auto"]'));
    for (const span of descSpans) {
      const text = getText(span);
      // Description is typically longer and not a number or short label
      if (text && text.length > 50 && !text.match(/^\d/) && !text.includes('recommend')) {
        description = text;
        break;
      }
    }

    // Get category (e.g., "Page · Restaurant")
    let category: string | null = null;
    const categorySpans = Array.from(document.querySelectorAll('span'));
    for (const span of categorySpans) {
      const text = getText(span);
      if (text && text.includes('Page ·')) {
        category = text;
        break;
      }
    }

    // Icon URL patterns for each field (from Facebook's static assets)
    // Address icon: yW/r/8k_Y-oVxbuU.png
    // Phone icon: yT/r/Dc7-7AgwkwS.png
    // Email icon: yE/r/2PIcyqpptfD.png
    // Website icon: y3/r/BQdeC67wT9z.png
    // Hours icon: yE/r/mp_faH0qhrY.png
    // Services icon: ym/r/arM1m3sNXPr.png
    // Price icon: yV/r/vUmfhJXfJ5R.png
    // Reviews icon: y7/r/4Lea07Woawi.png

    const address = findInfoByIconStructure('8k_Y-oVxbuU') || findInfoByIconUrl('8k_Y-oVxbuU');
    const phone = findInfoByIconStructure('Dc7-7AgwkwS') || findInfoByIconUrl('Dc7-7AgwkwS');
    const email = findInfoByIconStructure('2PIcyqpptfD') || findInfoByIconUrl('2PIcyqpptfD');
    const website = findInfoByIconStructure('BQdeC67wT9z') || findInfoByIconUrl('BQdeC67wT9z');
    // Hours and services will be extracted from popup (see below)
    const hours = findInfoByIconStructure('mp_faH0qhrY') || findInfoByIconUrl('mp_faH0qhrY');
    const serviceOptions = findInfoByIconStructure('arM1m3sNXPr') || findInfoByIconUrl('arM1m3sNXPr');
    const priceRange = findInfoByIconStructure('vUmfhJXfJ5R') || findInfoByIconUrl('vUmfhJXfJ5R');
    const reviewsRating = findInfoByIconStructure('4Lea07Woawi') || findInfoByIconUrl('4Lea07Woawi');

    // Get profile picture
    let profilePictureUrl: string | null = null;
    
    // Look for SVG image elements with xlink:href (Facebook profile pics are in SVG g>image)
    // Profile pictures are typically 168px x 168px
    const allSvgImages = Array.from(document.querySelectorAll('image'));
    let bestProfilePic: { src: string; size: number } | null = null;
    
    for (const img of allSvgImages) {
      const src = img.getAttribute('xlink:href') || img.getAttribute('href') || '';
      if (src.includes('scontent') && src.includes('fbcdn') && !src.includes('emoji')) {
        // Get size from style attribute
        const style = img.getAttribute('style') || '';
        const widthMatch = style.match(/width:\s*(\d+)/);
        const heightMatch = style.match(/height:\s*(\d+)/);
        const width = widthMatch ? parseInt(widthMatch[1], 10) : 0;
        const height = heightMatch ? parseInt(heightMatch[1], 10) : 0;
        const size = Math.max(width, height);
        
        // Profile picture is typically 168px, look for largest image
        if (size >= 100) {
          if (!bestProfilePic || size > bestProfilePic.size) {
            bestProfilePic = { src, size };
          }
        }
      }
    }
    
    if (bestProfilePic) {
      profilePictureUrl = bestProfilePic.src;
    }
    
    // Fallback: look for img elements with s200x200
    if (!profilePictureUrl) {
      const largeImgs = Array.from(document.querySelectorAll('img'));
      for (const img of largeImgs) {
        const src = (img as HTMLImageElement).src || '';
        if (src.includes('scontent') && src.includes('fbcdn') && !src.includes('emoji') && src.includes('s200x200')) {
          profilePictureUrl = src;
          break;
        }
      }
    }

    return {
      name,
      description,
      category,
      address,
      phone,
      email,
      website,
      hours,
      serviceOptions,
      priceRange,
      reviewsRating,
      profilePictureUrl,
    };
  });

  // Extract hours and services from popup (more detailed than icon-based extraction)
  const { hours: popupHours, serviceOptions: popupServices } = await extractHoursAndServices(page);
  
  // Use popup data if available, otherwise fall back to icon-based extraction
  const finalData = {
    ...data,
    hours: popupHours || data.hours,
    serviceOptions: popupServices || data.serviceOptions,
  };

  console.log(`[FB-SCRAPE] Extracted profile data:`, JSON.stringify(finalData, null, 2));
  return finalData;
}

/**
 * Removes the login popup that appears while scrolling
 * The popup has class "__fb-light-mode x1n2onr6 xzkaem6"
 */
async function removeLoginPopup(page: Page): Promise<boolean> {
  console.log(`[FB-SCRAPE] Checking for login popup...`);
  
  const removed = await page.evaluate(() => {
    // Look for the login popup by its specific class combination
    const popup = document.querySelector('div.__fb-light-mode.x1n2onr6.xzkaem6');
    if (popup) {
      popup.remove();
      return true;
    }
    return false;
  });
  
  if (removed) {
    console.log(`[FB-SCRAPE] ✅ Removed login popup`);
    await page.waitForTimeout(300);
  }
  
  return removed;
}

/**
 * Scrolls down until login popup appears, removes it, then continues scrolling to load all posts
 */
async function scrollUntilPopupAndRemove(page: Page): Promise<void> {
  console.log(`[FB-SCRAPE] Scrolling to trigger login popup and load posts...`);
  
  let popupFound = false;
  let scrollAttempts = 0;
  const maxScrollAttempts = 15; // Increased to ensure we load more posts
  
  while (!popupFound && scrollAttempts < maxScrollAttempts) {
    // Scroll down
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(1000);
    scrollAttempts++;
    
    console.log(`[FB-SCRAPE] Scroll attempt ${scrollAttempts}/${maxScrollAttempts}`);
    
    // Check if popup appeared
    const hasPopup = await page.evaluate(() => {
      return document.querySelector('div.__fb-light-mode.x1n2onr6.xzkaem6') !== null;
    });
    
    if (hasPopup) {
      popupFound = true;
      console.log(`[FB-SCRAPE] Login popup detected after ${scrollAttempts} scrolls`);
      await removeLoginPopup(page);
      // Continue scrolling a bit more after removing popup to ensure posts are loaded
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(800);
        await removeLoginPopup(page); // Check for popup again
      }
      break;
    }
  }
  
  if (!popupFound) {
    console.log(`[FB-SCRAPE] No login popup appeared after ${maxScrollAttempts} scrolls, continuing to load posts...`);
    // Even if no popup, scroll a bit more to ensure posts are loaded
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(800);
      await removeLoginPopup(page); // Check for popup anyway
    }
  }
  
  // Wait a bit for all content to load
  await page.waitForTimeout(1000);
  
  // Scroll back to top to ensure all posts are in DOM (even if not visible)
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  
  console.log(`[FB-SCRAPE] Scrolling complete, ready to extract posts`);
}

/**
 * Clicks all "See more" buttons in posts to expand captions
 */
async function expandPostCaptions(page: Page): Promise<void> {
  console.log(`[FB-SCRAPE] Expanding post captions...`);
  
  // First, remove any login popup that might be blocking
  await removeLoginPopup(page);
  
  // Dynamically find all post containers
  const allPostContainers = await page.locator('div[data-pagelet^="TimelineFeedUnit_"]').all();
  console.log(`[FB-SCRAPE] Found ${allPostContainers.length} post containers`);
  
  // Process each post individually
  for (let postIndex = 0; postIndex < allPostContainers.length; postIndex++) {
    try {
      const postContainer = allPostContainers[postIndex];
      
      // Check if post container is visible
      const isVisible = await postContainer.isVisible({ timeout: 1000 }).catch(() => false);
      if (!isVisible) {
        console.log(`[FB-SCRAPE] Post ${postIndex} not visible, skipping`);
        continue;
      }
      
      // Find "See more" button within this post's caption area
      // The button is inside the message/caption container
      const seeMoreButton = postContainer.locator('div[role="button"]').filter({ hasText: /^See more$/ }).first();
      const buttonVisible = await seeMoreButton.isVisible({ timeout: 1000 }).catch(() => false);
      
      if (buttonVisible) {
        console.log(`[FB-SCRAPE] Clicking "See more" button in post ${postIndex}`);
        
        // Scroll the button into view first
        await seeMoreButton.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(200);
        
        // Check again if popup appeared and remove it
        await removeLoginPopup(page);
        
        // Click the button
        await seeMoreButton.click({ timeout: 3000 }).catch((err) => {
          console.log(`[FB-SCRAPE] Click failed for post ${postIndex}:`, err);
        });
        await page.waitForTimeout(500);
        
        // Check and remove popup again after click
        await removeLoginPopup(page);
      } else {
        console.log(`[FB-SCRAPE] No "See more" button found in post ${postIndex}`);
      }
    } catch (error) {
      console.log(`[FB-SCRAPE] Error processing post ${postIndex}:`, error);
    }
  }
  
  console.log(`[FB-SCRAPE] Finished expanding captions`);
}

/**
 * Clicks the "View more comments" button for a post to load comments
 */
async function clickViewMoreCommentsButton(page: Page, postContainer: any): Promise<boolean> {
  try {
    console.log(`[FB-SCRAPE] Looking for "View more comments" button...`);
    
    // First, try using Playwright locator to find the span with "View more comments" text
    const viewMoreButton = postContainer.locator('span:has-text("View more comments")').first();
    
    let buttonFound = false;
    try {
      const count = await viewMoreButton.count();
      if (count > 0) {
        const isVisible = await viewMoreButton.isVisible({ timeout: 2000 });
        if (isVisible) {
          console.log(`[FB-SCRAPE] Found "View more comments" button using locator`);
          // Scroll into view
          await viewMoreButton.scrollIntoViewIfNeeded({ timeout: 2000 });
          await page.waitForTimeout(300);
          // Remove any popup
          await removeLoginPopup(page);
          // Click
          await viewMoreButton.click({ timeout: 3000 });
          buttonFound = true;
        }
      }
    } catch (error) {
      console.log(`[FB-SCRAPE] Locator method failed, trying evaluate method...`);
    }
    
    // If locator method failed, use evaluate to find and click
    if (!buttonFound) {
      const clicked = await postContainer.evaluate((container: HTMLElement) => {
        // Look for span with "View more comments" text
        const allSpans = Array.from(container.querySelectorAll('span'));
        
        for (const span of allSpans) {
          const text = span.textContent?.trim() || '';
          if (text === 'View more comments') {
            // Found the button! Find the clickable parent element
            let clickableElement: HTMLElement | null = span as HTMLElement;
            
            // Check if span itself is clickable
            const spanParent = span.parentElement;
            if (spanParent) {
              // Check if parent has role="button" or is clickable
              if (spanParent.getAttribute('role') === 'button' || 
                  spanParent.classList.contains('x1i10hfl') || // Common clickable class
                  spanParent.onclick !== null) {
                clickableElement = spanParent as HTMLElement;
              } else {
                // Look for a button or clickable div ancestor
                let current: HTMLElement | null = spanParent;
                while (current && current !== container) {
                  if (current.getAttribute('role') === 'button' ||
                      current.classList.contains('x1i10hfl') ||
                      current.onclick !== null) {
                    clickableElement = current;
                    break;
                  }
                  current = current.parentElement;
                }
              }
            }
            
            if (clickableElement) {
              console.log(`Found "View more comments" button`);
              clickableElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              clickableElement.click();
              return true;
            }
          }
        }
        
        return false;
      }).catch(() => false);
      
      buttonFound = clicked;
    }
    
    if (!buttonFound) {
      console.log(`[FB-SCRAPE] "View more comments" button not found for this post`);
      return false;
    }
    
    console.log(`[FB-SCRAPE] "View more comments" button clicked, waiting for comments to load...`);
    
    // Wait for comments to load
    await page.waitForTimeout(3000);
    
    // Check for popup and remove it
    await removeLoginPopup(page);
    
    return true;
  } catch (error) {
    console.log(`[FB-SCRAPE] Error clicking "View more comments" button:`, error);
    return false;
  }
}

/**
 * Extracts comments from a post (max 20)
 * Comments are in virtualized containers: div[data-virtualized="false"] containing div[role="article"][aria-label^="Comment by"]
 * IMPORTANT: Comments are NOT inside the post container - they're in sibling/adjacent elements
 */
async function extractCommentsFromPost(page: Page, postContainer: any): Promise<FacebookComment[]> {
  const comments: FacebookComment[] = [];
  
  try {
    // Comments are NOT inside the post container (div[data-pagelet^="TimelineFeedUnit_"])
    // They're in adjacent div[data-virtualized="false"] elements
    // We need to find the parent that contains both the post and its comments
    
    const extractedComments = await postContainer.evaluate((container: HTMLElement) => {
      const results: Array<{
        author: string | null;
        text: string | null;
        timeAgo: string | null;
        reactionCount: number | null;
      }> = [];
      
      // Strategy: Find the common parent that contains both the post and comments
      // The comments are in div[data-virtualized="false"] elements which are siblings
      // of or adjacent to the post container
      
      // First, try to find comments within the post container itself
      let commentElements = Array.from(container.querySelectorAll('div[role="article"][aria-label^="Comment by"]'));
      
      // If not found inside, look in the parent element
      if (commentElements.length === 0 && container.parentElement) {
        commentElements = Array.from(container.parentElement.querySelectorAll('div[role="article"][aria-label^="Comment by"]'));
      }
      
      // If still not found, go up another level
      if (commentElements.length === 0 && container.parentElement?.parentElement) {
        commentElements = Array.from(container.parentElement.parentElement.querySelectorAll('div[role="article"][aria-label^="Comment by"]'));
      }
      
      // If still not found, look for nearby virtualized containers
      if (commentElements.length === 0) {
        // Find all virtualized containers near the post
        let current: HTMLElement | null = container;
        let searchDepth = 0;
        while (current && searchDepth < 5) {
          const virtualizedContainers = current.querySelectorAll('div[data-virtualized="false"]');
          for (const vc of Array.from(virtualizedContainers)) {
            const comments = vc.querySelectorAll('div[role="article"][aria-label^="Comment by"]');
            for (const c of Array.from(comments)) {
              commentElements.push(c);
            }
          }
          if (commentElements.length > 0) break;
          current = current.parentElement;
          searchDepth++;
        }
      }
      
      // Limit to 20 comments
      const maxComments = Math.min(commentElements.length, 20);
      
      for (let i = 0; i < maxComments; i++) {
        const el = commentElements[i] as HTMLElement;
        
        // Extract author name from aria-label
        let author: string | null = null;
        const ariaLabel = el.getAttribute('aria-label') || '';
        
        // Match "Comment by [Name] [time]" - name is everything before the time
        const authorMatch = ariaLabel.match(/Comment by\s+(.+?)\s+(?:\d+\s*(?:hours?|minutes?|h|m|d|w|y)|about|an?\s+)/i);
        if (authorMatch) {
          author = authorMatch[1].trim();
        } else {
          // Fallback: find the author link
          const authorSpan = el.querySelector('span.x193iq5w.xeuugli.x13faqbe.x1vvkbs');
          if (authorSpan) {
            const linkText = authorSpan.textContent?.trim();
            if (linkText && linkText.length > 0 && linkText.length < 100) {
              author = linkText;
            }
          }
        }
        
        // Extract time ago from aria-label or from link
        let timeAgo: string | null = null;
        const timeMatch = ariaLabel.match(/(\d+\s*(?:h|m|min|hour|hours?|day|days?|week|weeks?|month|months?|year|years?)\s*(?:ago)?|about an? (?:hour|minute|day|week|month|year)\s*(?:ago)?)/i);
        if (timeMatch) {
          timeAgo = timeMatch[1];
        } else {
          // Fallback: look for time link (like "3h", "1h")
          const timeLinks = el.querySelectorAll('a[href*="/posts/"], a[href*="comment_id"]');
          for (const link of Array.from(timeLinks)) {
            const timeText = link.textContent?.trim();
            if (timeText && /^\d+[hmdwy]/.test(timeText)) {
              timeAgo = timeText;
              break;
            }
          }
        }
        
        // Extract comment text - look for all div[dir="auto"][style*="text-align: start"]
        let text: string | null = null;
        const textContainers = el.querySelectorAll('div[dir="auto"][style*="text-align: start"]');
        if (textContainers.length > 0) {
          // Combine all text from text containers
          const textParts: string[] = [];
          for (const tc of Array.from(textContainers)) {
            const t = tc.textContent?.trim();
            if (t) textParts.push(t);
          }
          text = textParts.join(' ') || null;
        }
        
        if (!text) {
          // Fallback: look for text in specific span class
          const textSpan = el.querySelector('span.x193iq5w.xeuugli.x13faqbe.x1vvkbs.x1xmvt09.x1lliihq.x1s928wv.xhkezso');
          if (textSpan) {
            const textDivs = textSpan.querySelectorAll('div[dir="auto"]');
            const textParts: string[] = [];
            for (const td of Array.from(textDivs)) {
              const t = td.textContent?.trim();
              if (t) textParts.push(t);
            }
            text = textParts.join(' ') || null;
          }
        }
        
        // Extract reaction count from aria-label containing "reactions"
        let reactionCount: number | null = null;
        const reactionButton = el.querySelector('[aria-label*="reactions"]');
        if (reactionButton) {
          const reactionLabel = reactionButton.getAttribute('aria-label') || '';
          const reactionMatch = reactionLabel.match(/(\d+)\s*reactions?/i);
          if (reactionMatch) {
            reactionCount = parseInt(reactionMatch[1], 10);
          }
        }
        
        results.push({ author, text, timeAgo, reactionCount });
      }
      
      return results;
    }).catch((err: Error) => {
      console.error(`[FB-SCRAPE] Error extracting comments: ${err}`);
      return [];
    });
    
    comments.push(...extractedComments);
    console.log(`[FB-SCRAPE] Extracted ${comments.length} comments from post`);
    
  } catch (error) {
    console.log(`[FB-SCRAPE] Error extracting comments:`, error);
  }
  
  return comments;
}

/**
 * Extracts posts from Facebook page
 */
async function extractFacebookPosts(page: Page): Promise<FacebookPost[]> {
  console.log(`[FB-SCRAPE] Extracting Facebook posts...`);
  
  // First expand all captions
  await expandPostCaptions(page);
  await page.waitForTimeout(500);
  
  // First, get basic post data
  const basicPosts = await page.evaluate(() => {
    const results: Array<{
      caption: string | null;
      likeCount: number | null;
      commentCount: number | null;
      mediaType: 'image' | 'video' | 'multiple_images' | 'unknown';
    }> = [];
    
    // Dynamically find ALL post containers using the data-pagelet attribute pattern
    const allPostContainers = Array.from(document.querySelectorAll('div[data-pagelet^="TimelineFeedUnit_"]'));
    console.log(`Found ${allPostContainers.length} post containers in DOM`);
    
    // Process each found post container
    for (const postContainer of allPostContainers) {
      
      // Extract caption
      // Caption is in div[data-ad-preview="message"] or div[data-ad-comet-preview="message"]
      let caption: string | null = null;
      const captionContainer = postContainer.querySelector('div[data-ad-preview="message"], div[data-ad-comet-preview="message"]');
      if (captionContainer) {
        // Get all text content, excluding "See more" button text
        const textContent = captionContainer.textContent || '';
        caption = textContent.replace(/See more$/i, '').trim() || null;
      }
      
      // Helper function to parse numbers with K/M suffix
      const parseCount = (str: string): number | null => {
        if (!str) return null;
        str = str.replace(/,/g, '').trim();
        const match = str.match(/([\d.]+)\s*([KMkm])?/);
        if (!match) return null;
        let num = parseFloat(match[1]);
        const suffix = match[2]?.toUpperCase();
        if (suffix === 'K') num *= 1000;
        if (suffix === 'M') num *= 1000000;
        return Math.round(num);
      };
      
      // Extract like count
      // Look for aria-label like "Like: 15K people" or "Like: 2 people"
      let likeCount: number | null = null;
      const likeLabels = Array.from(postContainer.querySelectorAll('[aria-label*="Like:"]'));
      for (const label of likeLabels) {
        const ariaLabel = label.getAttribute('aria-label') || '';
        const match = ariaLabel.match(/Like:\s*([\d.,]+[KMkm]?)/i);
        if (match) {
          likeCount = parseCount(match[1]);
          break;
        }
      }
      
      // Also check for "Love:" labels and add them to the count
      if (likeCount !== null) {
        const loveLabels = Array.from(postContainer.querySelectorAll('[aria-label*="Love:"]'));
        for (const label of loveLabels) {
          const ariaLabel = label.getAttribute('aria-label') || '';
          const match = ariaLabel.match(/Love:\s*([\d.,]+[KMkm]?)/i);
          if (match) {
            const loveCount = parseCount(match[1]);
            if (loveCount) likeCount += loveCount;
            break;
          }
        }
      }
      
      // Fallback: look for total reactions (like "18K" in "All reactions:")
      if (likeCount === null) {
        // Look for the reactions summary span that shows total
        const allSpans = Array.from(postContainer.querySelectorAll('span.x135b78x'));
        for (const span of allSpans) {
          const text = span.textContent?.trim() || '';
          if (/^[\d.,]+[KMkm]?$/.test(text)) {
            const count = parseCount(text);
            if (count && count > 0) {
              likeCount = count;
              break;
            }
          }
        }
      }
      
      // Another fallback: look for reaction count near reaction icons
      if (likeCount === null) {
        const reactionArea = postContainer.querySelector('span[aria-label*="reactions"]');
        if (reactionArea) {
          const ariaLabel = reactionArea.getAttribute('aria-label') || '';
          const match = ariaLabel.match(/([\d.,]+[KMkm]?)/);
          if (match) {
            likeCount = parseCount(match[1]);
          }
        }
      }
      
      // Extract comment count
      // Look for text like "X comments" or aria-labels
      let commentCount: number | null = null;
      const allText = postContainer.textContent || '';
      const commentMatch = allText.match(/([\d,]+)\s*comments?/i);
      if (commentMatch) {
        commentCount = parseInt(commentMatch[1].replace(/,/g, ''), 10);
      }
      
      // Determine media type
      let mediaType: 'image' | 'video' | 'multiple_images' | 'unknown' = 'unknown';
      
      // Check for video
      const hasVideo = postContainer.querySelector('video') !== null;
      if (hasVideo) {
        mediaType = 'video';
      } else {
        // Check for images
        const mediaLinks = postContainer.querySelectorAll('a[href*="/photo/"]');
        if (mediaLinks.length > 1) {
          mediaType = 'multiple_images';
        } else if (mediaLinks.length === 1) {
          mediaType = 'image';
        } else {
          // Check aria-labels for clues
          const ariaLabels = Array.from(postContainer.querySelectorAll('[aria-label]'))
            .map(el => el.getAttribute('aria-label') || '')
            .join(' ');
          
          if (ariaLabels.toLowerCase().includes('remaining items')) {
            mediaType = 'multiple_images';
          } else if (ariaLabels.toLowerCase().includes('image') || ariaLabels.toLowerCase().includes('photo')) {
            // Check if there are multiple image-related aria labels
            const imageLabels = ariaLabels.toLowerCase().match(/may be an? (image|photo)/gi);
            if (imageLabels && imageLabels.length > 1) {
              mediaType = 'multiple_images';
            } else {
              mediaType = 'image';
            }
          }
        }
      }
      
      results.push({
        caption,
        likeCount,
        commentCount,
        mediaType,
      });
    }
    
    console.log(`Extracted ${results.length} posts total`);
    return results;
  });
  
  console.log(`[FB-SCRAPE] Extracted ${basicPosts.length} posts with basic data`);
  
  // Now extract comments for each post
  const allPostContainers = await page.locator('div[data-pagelet^="TimelineFeedUnit_"]').all();
  const postsWithComments: FacebookPost[] = [];
  
  for (let i = 0; i < basicPosts.length && i < allPostContainers.length; i++) {
    const basicPost = basicPosts[i];
    const postContainer = allPostContainers[i];
    
    console.log(`[FB-SCRAPE] Processing comments for post ${i + 1}/${basicPosts.length} (commentCount: ${basicPost.commentCount})`);
    
    // Scroll the post container into view first
    try {
      await postContainer.scrollIntoViewIfNeeded({ timeout: 2000 });
      await page.waitForTimeout(500);
    } catch (error) {
      console.log(`[FB-SCRAPE] Could not scroll post ${i + 1} into view`);
    }
    
    // Click "View more comments" button for every post
    let comments: FacebookComment[] = [];
    console.log(`[FB-SCRAPE] Attempting to click "View more comments" button for post ${i + 1}...`);
    const clicked = await clickViewMoreCommentsButton(page, postContainer);
    if (clicked) {
      console.log(`[FB-SCRAPE] "View more comments" button clicked for post ${i + 1}, waiting for comments to load...`);
      // Wait for comments section to appear
      try {
        await postContainer.locator('div[role="article"][aria-label^="Comment by"]').first().waitFor({ timeout: 5000 });
        console.log(`[FB-SCRAPE] Comments section appeared for post ${i + 1}`);
      } catch (error) {
        console.log(`[FB-SCRAPE] Comments section did not appear for post ${i + 1}, but continuing...`);
      }
      
      // Wait for comments to load
      await page.waitForTimeout(1500);
      
      // Check for and remove login popup
      await removeLoginPopup(page);
      
      // Scroll down within the comments area to load all comments
      console.log(`[FB-SCRAPE] Scrolling within comments section to load all comments...`);
      await page.evaluate(() => {
        // Scroll down multiple times to load virtualized comments
        window.scrollBy(0, window.innerHeight * 2);
      });
      await page.waitForTimeout(1500);
      await removeLoginPopup(page);
      
      comments = await extractCommentsFromPost(page, postContainer);
      console.log(`[FB-SCRAPE] Extracted ${comments.length} comments for post ${i + 1}`);
    } else {
      console.log(`[FB-SCRAPE] "View more comments" button not found or failed to click for post ${i + 1} (may not have comments)`);
    }
    
    postsWithComments.push({
      ...basicPost,
      comments,
    });
  }
  
  console.log(`[FB-SCRAPE] Extracted ${postsWithComments.length} posts with comments`);
  return postsWithComments;
}

// =============================================================================
// MAIN SCRAPER (replicates Facebook screenshotter navigation exactly)
// =============================================================================

async function scrapeFacebookProfile(username: string): Promise<FacebookProfileData> {
  let browser: Browser | null = null;
  let page: Page | null = null;
  
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const localExecutablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
  
  try {
    const executablePath = isServerless
      ? await chromium.executablePath()
      : (localExecutablePath || undefined);

    // Run headless for production
    const useHeadless = true;
    console.log(`[FB-SCRAPE] Launching browser - headless: ${useHeadless}, isServerless: ${isServerless}`);

    browser = await pwChromium.launch({
      headless: useHeadless,
      args: [
        ...(isServerless ? chromium.args : []),
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--incognito',
      ],
      executablePath,
      timeout: TIMEOUT_MS,
    });

    console.log(`[FB-SCRAPE] Browser launched successfully`);

    // EXACTLY like Facebook screenshotter: desktop viewport with desktop UA
    const viewportConfig = { width: 1920, height: 1080 };
    const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    const context = await browser.newContext({
      viewport: viewportConfig,
      userAgent: desktopUA,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      javaScriptEnabled: true,
      permissions: ['geolocation'],
      locale: 'en-US',
    });

    console.log(`[FB-SCRAPE] Context created: ${viewportConfig.width}x${viewportConfig.height}`);

    context.setDefaultNavigationTimeout(TIMEOUT_MS);
    context.setDefaultTimeout(TIMEOUT_MS);

    page = await context.newPage();
    page.setDefaultNavigationTimeout(TIMEOUT_MS);
    page.setDefaultTimeout(TIMEOUT_MS);

    // Apply stealth techniques
    await setupStealth(page);
    console.log(`[FB-SCRAPE] Stealth setup complete`);

    // Build Facebook URL
    const normalizedUrl = `https://www.facebook.com/${username}`;
    console.log(`[FB-SCRAPE] Navigating to ${normalizedUrl}...`);
    
    const startTime = Date.now();

    // EXACTLY like Facebook screenshotter: Direct navigation
    const response = await page.goto(normalizedUrl, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT_MS,
    });

    const navigationTime = Date.now() - startTime;
    console.log(`[FB-SCRAPE] Navigation completed in ${navigationTime}ms`);

    // Check response status
    if (response) {
      const status = response.status();
      console.log(`[FB-SCRAPE] Response status: ${status}`);
      
      if (status >= 400) {
        throw new Error(`HTTP ${status}: Failed to load page`);
      }
    }

    // Check if page loaded correctly
    const currentUrl = page.url();
    console.log(`[FB-SCRAPE] Current URL after navigation: ${currentUrl}`);
    
    if (!currentUrl || currentUrl === 'about:blank' || currentUrl.startsWith('chrome-error://')) {
      throw new Error(`Page navigation failed - invalid URL after navigation: ${currentUrl}`);
    }

    // Wait for page to be fully loaded
    console.log(`[FB-SCRAPE] Waiting for page to load...`);
    await page.waitForLoadState('domcontentloaded', { timeout: TIMEOUT_MS });
    
    // Wait for network to be idle (but with shorter timeout)
    try {
      await page.waitForLoadState('networkidle', { timeout: 15000 });
    } catch {
      console.log(`[FB-SCRAPE] Network idle timeout, proceeding anyway`);
    }
    
    // Additional wait for dynamic content
    await page.waitForTimeout(3000);
    console.log(`[FB-SCRAPE] Page load complete`);

    // EXACTLY like Facebook screenshotter: Dismiss popups
    console.log(`[FB-SCRAPE] Facebook detected, dismissing popups...`);
    await dismissFacebookPopups(page);
    
    // EXACTLY like Facebook screenshotter: Remove login prompt
    await removeFacebookLoginPrompt(page);

    // Extract the profile data first (before scrolling triggers popup)
    const profileData = await extractFacebookProfileData(page);

    // Scroll down to load posts and trigger/remove login popup
    console.log(`[FB-SCRAPE] Scrolling to load posts and handle login popup...`);
    await scrollUntilPopupAndRemove(page);

    // Extract posts (profile data already extracted above)
    const posts = await extractFacebookPosts(page);

    return {
      ...profileData,
      posts,
    };

  } catch (error) {
    console.error(`[FB-SCRAPE] Error:`, error);
    throw error;
  } finally {
    await page?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

// =============================================================================
// API ROUTE HANDLER
// =============================================================================

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_TEST_API !== "true") {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }
  try {
    const { username } = await request.json();

    if (!username || typeof username !== 'string') {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Clean username (remove @ if present, extract from URL if full URL provided)
    let cleanUsername = username.trim();
    
    // Handle full Facebook URLs
    const urlMatch = cleanUsername.match(/facebook\.com\/([^\/\?]+)/);
    if (urlMatch) {
      cleanUsername = urlMatch[1];
    }
    
    cleanUsername = cleanUsername.replace(/^@/, '').trim();

    if (!cleanUsername) {
      return NextResponse.json(
        { error: 'Invalid username' },
        { status: 400 }
      );
    }

    console.log(`[FB-SCRAPE] Starting Facebook scrape for: ${cleanUsername}`);

    const result = await scrapeFacebookProfile(cleanUsername);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error(`[FB-SCRAPE] Scraping failed:`, error);
    const message = error instanceof Error ? error.message : 'Scraping failed';
    const stack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json(
      {
        error: message,
        details: stack,
      },
      { status: 500 }
    );
  }
}
