import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

/**
 * Facebook page scraper using HTML parsing (Cheerio)
 * Scrapes public Facebook pages similar to Apify's approach
 */

interface FacebookPage {
  id: string;
  name: string;
  username: string;
  about?: string;
  followers?: number;
  profilePicUrl?: string;
  verified?: boolean;
  website?: string;
}

interface FacebookPost {
  id: string;
  shortcode?: string;
  content: string;
  timestamp: string;
  likeCount: number;
  commentCount: number;
  shareCount?: number;
  mediaUrls?: string[];
  comments?: FacebookComment[];
}

interface FacebookComment {
  id: string;
  username: string;
  text: string;
  timestamp: string;
  likeCount: number;
}

interface FacebookPageData {
  success: boolean;
  data: {
    page: FacebookPage;
    posts: FacebookPost[];
  };
  stats: {
    totalPosts: number;
    totalComments: number;
    scrapeTime: string;
  };
  error?: string;
  warning?: string;
}

/**
 * Gets browser-like headers to avoid Facebook blocks
 */
function getFacebookHeaders(): Record<string, string> {
  // Generate random request ID for better bot evasion
  const requestId = crypto.randomUUID();
  const lsd = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
    'Origin': 'https://www.facebook.com',
    'Referer': 'https://www.facebook.com/',
    
    // Facebook-specific headers for better bot evasion
    'x-fb-lsd': lsd,
    'x-fb-friendly-name': 'CometPagePostsGridQuery',
    'x-fb-request-id': requestId,
  };
}

/**
 * Normalizes Facebook page name/URL to just the page name
 */
function normalizePageName(input: string): string {
  // Remove protocol and domain
  let pageName = input.replace(/^https?:\/\//, '');
  pageName = pageName.replace(/^www\.facebook\.com\//, '');
  pageName = pageName.replace(/^facebook\.com\//, '');
  pageName = pageName.replace(/^m\.facebook\.com\//, '');
  
  // Remove trailing slash
  pageName = pageName.replace(/\/$/, '');
  
  // Remove query params
  pageName = pageName.split('?')[0];
  
  return pageName;
}

/**
 * Fetches Facebook page HTML
 * Returns both HTML and final URL (in case of redirects)
 */
async function fetchFacebookPage(url: string): Promise<{ html: string; finalUrl: string }> {
  console.log(`[Facebook] Fetching: ${url}`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: getFacebookHeaders(),
      redirect: 'follow',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    const finalUrl = response.url; // Get final URL after redirects
    
    if (finalUrl !== url) {
      console.log(`[Facebook] Redirected to: ${finalUrl}`);
    }
    
    return { html, finalUrl };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Tries to extract posts from mobile Facebook site
 * Mobile site often has simpler HTML structure
 */
async function tryMobileSite(pageId: string, maxPosts: number): Promise<FacebookPost[]> {
  const posts: FacebookPost[] = [];
  
  try {
    // Try multiple mobile URL formats
    const mobileUrls = [
      `https://m.facebook.com/${pageId}/posts/`,
      `https://m.facebook.com/profile.php?id=${pageId}`,
      `https://m.facebook.com/${pageId}?v=timeline&mibextid=ZbWKwL`,
    ];
    
    for (const mobileUrl of mobileUrls) {
      if (posts.length >= maxPosts) break;
      
      console.log(`[Facebook] Trying mobile site: ${mobileUrl}`);
      
      try {
        const { html } = await fetchFacebookPage(mobileUrl);
        
        // Mobile site has different structure - look for post containers
        const postPatterns = [
          /<article[^>]*>(.*?)<\/article>/gs,
          /<div[^>]*role="article"[^>]*>(.*?)<\/div>/gs,
          /<div[^>]*class="[^"]*story[^"]*"[^>]*>(.*?)<\/div>/gs,
        ];
        
        for (const pattern of postPatterns) {
          const matches = Array.from(html.matchAll(pattern));
          console.log(`[Facebook] Mobile: Found ${matches.length} potential posts with pattern`);
          
          for (const match of matches.slice(0, maxPosts - posts.length)) {
            const postHtml = match[1];
            
            // Extract text content
            const textPatterns = [
              /<p[^>]*>(.*?)<\/p>/gs,
              /<div[^>]*data-testid="post_message"[^>]*>(.*?)<\/div>/gs,
              /<span[^>]*>(.*?)<\/span>/gs,
            ];
            
            for (const textPattern of textPatterns) {
              const textMatches = Array.from(postHtml.matchAll(textPattern));
              for (const textMatch of textMatches) {
                const content = textMatch[1]
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();
                
                if (content.length > 20 && isValidPostContent(content) && !posts.some(p => p.content === content)) {
                  posts.push({
                    id: `post-mobile-${posts.length + 1}-${Date.now()}`,
                    content,
                    timestamp: new Date().toISOString(),
                    likeCount: 0,
                    commentCount: 0,
                  });
                  break;
                }
              }
            }
          }
          
          if (posts.length > 0) break;
        }
        
        // If we got posts from this URL, stop trying others
        if (posts.length > 0) {
          console.log(`[Facebook] Mobile site extracted ${posts.length} posts from ${mobileUrl}`);
          break;
        }
        
        // Add delay between URL attempts
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (urlError) {
        console.error(`[Facebook] Mobile URL ${mobileUrl} failed:`, urlError);
        continue; // Try next URL
      }
    }
    
    console.log(`[Facebook] Mobile site total extracted: ${posts.length} posts`);
  } catch (error) {
    console.error('[Facebook] Mobile site fetch failed:', error);
  }
  
  return posts;
}

/**
 * Tries to extract posts from desktop posts feed
 */
async function tryDesktopPostsFeed(pageId: string, maxPosts: number): Promise<FacebookPost[]> {
  const posts: FacebookPost[] = [];
  
  try {
    // Try multiple desktop URL formats
    const desktopUrls = [
      `https://www.facebook.com/${pageId}/posts/`,
      `https://www.facebook.com/profile.php?id=${pageId}`,
      `https://www.facebook.com/${pageId}?v=timeline`,
      `https://www.facebook.com/${pageId}?sk=wall`,
    ];
    
    for (const postsUrl of desktopUrls) {
      if (posts.length >= maxPosts) break;
      
      console.log(`[Facebook] Trying desktop posts feed: ${postsUrl}`);
      
      try {
        const { html } = await fetchFacebookPage(postsUrl);
        
        // Desktop posts feed has different structure
        const postPatterns = [
          /<div[^>]*role="article"[^>]*>(.*?)<\/div>/gs,
          /<article[^>]*>(.*?)<\/article>/gs,
          /<div[^>]*data-pagelet="FeedUnit"[^>]*>(.*?)<\/div>/gs,
        ];
        
        for (const pattern of postPatterns) {
          const matches = Array.from(html.matchAll(pattern));
          console.log(`[Facebook] Desktop posts: Found ${matches.length} potential posts`);
          
          for (const match of matches.slice(0, maxPosts - posts.length)) {
            const postHtml = match[1];
            
            // Look for post message
            const messagePatterns = [
              /<div[^>]*data-testid="post_message"[^>]*>(.*?)<\/div>/gs,
              /<p[^>]*>(.*?)<\/p>/gs,
              /<span[^>]*class="[^"]*userContent[^"]*"[^>]*>(.*?)<\/span>/gs,
            ];
            
            for (const msgPattern of messagePatterns) {
              const msgMatches = Array.from(postHtml.matchAll(msgPattern));
              for (const msgMatch of msgMatches) {
                const content = msgMatch[1]
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();
                
                if (content.length > 20 && isValidPostContent(content) && !posts.some(p => p.content === content)) {
                  posts.push({
                    id: `post-desktop-${posts.length + 1}-${Date.now()}`,
                    content,
                    timestamp: new Date().toISOString(),
                    likeCount: 0,
                    commentCount: 0,
                  });
                  break;
                }
              }
            }
          }
          
          if (posts.length > 0) break;
        }
        
        // If we got posts from this URL, stop trying others
        if (posts.length > 0) {
          console.log(`[Facebook] Desktop posts feed extracted ${posts.length} posts from ${postsUrl}`);
          break;
        }
        
        // Add delay between URL attempts
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (urlError) {
        console.error(`[Facebook] Desktop URL ${postsUrl} failed:`, urlError);
        continue; // Try next URL
      }
    }
    
    console.log(`[Facebook] Desktop posts feed total extracted: ${posts.length} posts`);
  } catch (error) {
    console.error('[Facebook] Desktop posts feed failed:', error);
  }
  
  return posts;
}

/**
 * Extracts Facebook Page ID from HTML
 * Critical for accessing posts feed endpoints
 */
function extractPageId(html: string, pageName: string, responseUrl?: string): string | null {
  console.log(`[Facebook] Attempting to extract page ID for ${pageName}...`);
  
  const pageIdPatterns = [
    // Meta tags
    /<meta property="al:android:url" content="fb:\/\/page\/(\d+)"/i,
    /<meta property="al:ios:url" content="fb:\/\/page\/(\d+)"/i,
    /<meta property="og:url" content="https:\/\/www\.facebook\.com\/(\d+)\/"/i,
    
    // JSON patterns
    /"pageID":"(\d+)"/i,
    /"pageID":(\d+)/i,
    /"profile_id":(\d+)/i,
    /"entity_id":(\d+)/i,
    /"target_id":(\d+)/i,
    /"page_id":(\d+)/i,
    /"fbid":(\d+)/i,
    /"id":(\d+)/i,
    
    // URL patterns in HTML
    /fb:\/\/page\/(\d+)/i,
    /\/pages\/.*?\/(\d+)\//i,
    /\/page\/(\d+)\//i,
    /pageID=(\d+)/i,
    
    // Canonical and alternate URLs
    /<link rel="canonical" href="https:\/\/www\.facebook\.com\/(\d+)\/"/i,
    /<link rel="alternate" href="https:\/\/www\.facebook\.com\/(\d+)\/"/i,
    
    // Script tag patterns
    /"pageID":"(\d+)"/i,
    /pageID["']?\s*[:=]\s*["']?(\d+)/i,
    
    // GraphQL/JSON embedded data
    /"__user":"(\d+)"/i,
    /"actorID":"(\d+)"/i,
  ];
  
  // Try all patterns
  for (let i = 0; i < pageIdPatterns.length; i++) {
    const pattern = pageIdPatterns[i];
    const match = html.match(pattern);
    if (match && match[1] && match[1].length >= 10) { // Page IDs are usually long numbers
      const pageId = match[1];
      console.log(`[Facebook] ✅ Found page ID: ${pageId} using pattern ${i + 1}`);
      return pageId;
    }
  }
  
  // Try to extract from response URL (if redirected)
  if (responseUrl) {
    const urlIdMatch = responseUrl.match(/facebook\.com\/(\d+)\//);
    if (urlIdMatch && urlIdMatch[1].length >= 10) {
      console.log(`[Facebook] ✅ Found page ID from response URL: ${urlIdMatch[1]}`);
      return urlIdMatch[1];
    }
  }
  
  // Try to find in script tags (Facebook embeds data here)
  const scriptMatches = html.matchAll(/<script[^>]*>(.*?)<\/script>/gs);
  for (const match of scriptMatches) {
    const scriptContent = match[1];
    
    // Look for page ID in script content
    const scriptPatterns = [
      /"pageID":"(\d{10,})"/,
      /pageID["']?\s*[:=]\s*["']?(\d{10,})/,
      /"profile_id":(\d{10,})/,
    ];
    
    for (const pattern of scriptPatterns) {
      const idMatch = scriptContent.match(pattern);
      if (idMatch && idMatch[1]) {
        console.log(`[Facebook] ✅ Found page ID in script tag: ${idMatch[1]}`);
        return idMatch[1];
      }
    }
  }
  
  // Last resort: Look for any long numeric ID (Facebook IDs are typically 10-20 digits)
  // This catches IDs that don't match our specific patterns
  const longNumberPatterns = [
    /"(\d{15,20})"/g,  // 15-20 digit numbers in quotes (most common)
    /"(\d{12,})"/g,    // 12+ digit numbers (some IDs might be shorter)
    /(\d{15,20})/g,    // 15-20 digit numbers anywhere
  ];
  
  for (const pattern of longNumberPatterns) {
    const matches = Array.from(html.matchAll(pattern));
    for (const match of matches) {
      const potentialId = match[1];
      // Validate it's likely a Facebook ID (not a timestamp, etc.)
      if (potentialId && potentialId.length >= 10 && potentialId.length <= 20) {
        // Check if it's not obviously something else (like a timestamp)
        const numId = parseInt(potentialId, 10);
        if (isNaN(numId)) continue;
        
        const currentYear = new Date().getFullYear();
        const yearFromId = Math.floor(numId / 1000000000000); // First few digits
        
        // Facebook IDs don't start with current year (timestamps do)
        // But accept if it's 15+ digits (very likely a Facebook ID)
        if (potentialId.length >= 15 || (yearFromId !== currentYear && yearFromId !== currentYear - 1)) {
          console.log(`[Facebook] ✅ Found long numeric ID (likely page ID): ${potentialId} (${potentialId.length} digits)`);
          return potentialId;
        }
      }
    }
  }
  
  // Parse script tags more aggressively for GraphQL data
  console.log(`[Facebook] Parsing script tags for embedded data...`);
  const scriptTags = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi);
  const scripts = Array.from(scriptTags);
  console.log(`[Facebook] Found ${scripts.length} script tags`);
  
  // Log first few script tags for debugging and extract IDs
  if (scripts.length > 0) {
    console.log(`[Facebook] Sample script tags (first 3):`);
    for (let i = 0; i < Math.min(3, scripts.length); i++) {
      const script = scripts[i];
      const content = script[1];
      const preview = content.substring(0, 200).replace(/\s+/g, ' ');
      console.log(`[Facebook]   Script ${i+1} (${content.length} chars): ${preview}...`);
      
      // Look for GraphQL patterns in script content
      const graphqlPatterns = [
        /"pageID":"(\d{10,})"/,
        /"profile_id":(\d{10,})/,
        /"entity_id":(\d{10,})/,
        /"target_id":(\d{10,})/,
        /"id":"(\d{15,20})"/,
        /__d\(.*?,.*?,.*?,(\{.*?\})\)/s, // Facebook's data format
      ];
      
      for (const pattern of graphqlPatterns) {
        const idMatch = content.match(pattern);
        if (idMatch && idMatch[1]) {
          const foundId = idMatch[1];
          if (foundId.length >= 10 && foundId.length <= 20) {
            console.log(`[Facebook] ✅ Found page ID in script tag ${i+1} using GraphQL pattern: ${foundId}`);
            return foundId;
          }
        }
      }
    }
    
    // Also search all script tags (not just first 3)
    for (const script of scripts) {
      const content = script[1];
      const graphqlPatterns = [
        /"pageID":"(\d{10,})"/,
        /"profile_id":(\d{10,})/,
        /"entity_id":(\d{10,})/,
        /"target_id":(\d{10,})/,
        /"id":"(\d{15,20})"/,
      ];
      
      for (const pattern of graphqlPatterns) {
        const idMatch = content.match(pattern);
        if (idMatch && idMatch[1]) {
          const foundId = idMatch[1];
          if (foundId.length >= 10 && foundId.length <= 20) {
            console.log(`[Facebook] ✅ Found page ID in script tag using pattern: ${foundId}`);
            return foundId;
          }
        }
      }
    }
  }
  
  // Diagnostic: Log what we found
  console.log(`[Facebook] ⚠️ Could not extract page ID. Diagnostic info:`);
  console.log(`[Facebook]    - HTML length: ${html.length}`);
  console.log(`[Facebook]    - Contains 'pageID': ${html.includes('pageID')}`);
  console.log(`[Facebook]    - Contains 'profile_id': ${html.includes('profile_id')}`);
  console.log(`[Facebook]    - Contains 'fb://page': ${html.includes('fb://page')}`);
  console.log(`[Facebook]    - Contains '__m': ${html.includes('__m')}`);
  console.log(`[Facebook]    - Contains 'require': ${html.includes('require')}`);
  
  // Try one more time with a broader pattern - accept ANY 15-20 digit number
  const anyLongNumber = html.match(/"(\d{15,20})"/);
  if (anyLongNumber) {
    const foundId = anyLongNumber[1];
    console.log(`[Facebook] ⚠️ Found long numeric ID in quotes: ${foundId} (${foundId.length} digits)`);
    // Accept it if it's in a reasonable range (15-20 digits is almost certainly a Facebook ID)
    if (foundId.length >= 15 && foundId.length <= 20) {
      console.log(`[Facebook] ✅ Accepting as page ID: ${foundId}`);
      return foundId;
    }
  }
  
  return null;
}

/**
 * Parses Facebook page HTML to extract page info
 * Facebook embeds data in JSON-LD and script tags
 */
function parsePageInfo(html: string, pageName: string, pageId: string | null = null): FacebookPage {
  const page: FacebookPage = {
    id: pageId || '',
    name: pageName,
    username: pageName,
  };
  
  try {
    // Try to extract from JSON-LD
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    if (jsonLdMatch) {
      try {
        const jsonLd = JSON.parse(jsonLdMatch[1]);
        if (jsonLd['@type'] === 'Organization' || jsonLd['@type'] === 'Person') {
          page.name = jsonLd.name || pageName;
          page.about = jsonLd.description;
          if (jsonLd.url) {
            page.website = jsonLd.url;
          }
        }
      } catch (e) {
        // JSON parse failed, continue
      }
    }
    
    // Try to extract from meta tags
    const metaNameMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    if (metaNameMatch) {
      page.name = metaNameMatch[1];
    }
    
    const metaDescMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    if (metaDescMatch) {
      page.about = metaDescMatch[1];
    }
    
    const metaImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
    if (metaImageMatch) {
      page.profilePicUrl = metaImageMatch[1];
    }
    
    // Try to extract followers count
    const followersMatch = html.match(/(\d+(?:,\d+)*(?:\.\d+)?[KMB]?)\s*(?:people\s*)?like this/i);
    if (followersMatch) {
      const countStr = followersMatch[1].replace(/,/g, '');
      if (countStr.includes('K')) {
        page.followers = Math.floor(parseFloat(countStr) * 1000);
      } else if (countStr.includes('M')) {
        page.followers = Math.floor(parseFloat(countStr) * 1000000);
      } else if (countStr.includes('B')) {
        page.followers = Math.floor(parseFloat(countStr) * 1000000000);
      } else {
        page.followers = parseInt(countStr, 10);
      }
    }
    
  } catch (error) {
    console.error('[Facebook] Error parsing page info:', error);
  }
  
  return page;
}

/**
 * Validates if a string is likely actual post content (not technical data)
 */
function isValidPostContent(content: string): boolean {
  if (!content || content.length < 20) return false;
  
  // Filter out technical strings
  const invalidPatterns = [
    /^Mozilla\/5\.0/, // User agent strings
    /^[a-f0-9]{32,}$/i, // Hex IDs
    /^[a-f0-9]{40,}$/i, // SHA hashes
    /^invert\(/, // CSS filters
    /^adp_/, // Technical identifiers
    /^[A-Z_]+$/, // ALL_CAPS_TECHNICAL_NAMES
    /^[a-z]+_[a-z]+_[a-z]+/, // snake_case_technical_names
    /^https?:\/\//, // URLs only
    /^[0-9]+$/, // Numbers only
    /^[^a-zA-Z]{10,}$/, // Mostly non-letters
    /AppleWebKit|Chrome|Safari|Firefox/i, // Browser strings
    /\.(js|css|json|html|xml)$/i, // File extensions
  ];
  
  for (const pattern of invalidPatterns) {
    if (pattern.test(content)) {
      return false;
    }
  }
  
  // Must contain at least some letters (not just symbols/numbers)
  const letterCount = (content.match(/[a-zA-Z]/g) || []).length;
  if (letterCount < content.length * 0.3) {
    return false; // Less than 30% letters
  }
  
  // Must have some spaces (actual posts usually have multiple words)
  const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
  if (wordCount < 3) {
    return false; // Too few words
  }
  
  return true;
}

/**
 * Extracts Facebook GraphQL data from script content
 */
function extractFacebookData(scriptContent: string): any {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-api/route.ts:641',message:'extractFacebookData entry',data:{contentLength:scriptContent.length,hasRequire:scriptContent.includes('"require"'),hasTypename:scriptContent.includes('__typename'),hasStory:scriptContent.includes('"Story"'),hasMessage:scriptContent.includes('"message"')},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  // Pattern 1: Facebook's actual format: {"require":[[...]]} (JSON object)
  // The actual format is a JSON object, not a function call
  // Try to find and parse the entire JSON object containing "require"
  let requireObjectMatch: RegExpMatchArray | null = null;
  
  // First, try to find the JSON object boundary
  const requireStart = scriptContent.indexOf('{"require":');
  if (requireStart !== -1) {
    // Find the matching closing brace by counting brackets
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;
    let endPos = requireStart;
    
    for (let i = requireStart; i < scriptContent.length; i++) {
      const char = scriptContent[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (inString) continue;
      
      if (char === '{') braceCount++;
      if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          endPos = i + 1;
          break;
        }
      }
    }
    
    if (endPos > requireStart) {
      const jsonStr = scriptContent.substring(requireStart, endPos);
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-api/route.ts:692',message:'found require JSON object',data:{jsonLength:jsonStr.length,jsonPreview:jsonStr.substring(0,300)},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      try {
        const parsed = JSON.parse(jsonStr);
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-api/route.ts:697',message:'require JSON parse success',data:{hasRequire:!!parsed.require,isArray:Array.isArray(parsed.require),arrayLength:parsed.require?parsed.require.length:0,firstItemType:parsed.require&&parsed.require.length>0?typeof parsed.require[0]:null},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        if (parsed.require && Array.isArray(parsed.require)) {
          console.log(`[Facebook] Found require() data array with ${parsed.require.length} items`);
          return parsed.require;
        }
      } catch (e) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-api/route.ts:705',message:'require JSON parse error',data:{error: e instanceof Error ? e.message : String(e),jsonPreview:jsonStr.substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
      }
    }
  }
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-api/route.ts:710',message:'require object not found',data:{requireStart:requireStart},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  // Pattern 1b: Also try the old pattern for backward compatibility
  const requirePattern = /"require",\s*(\[.*?\])(?=,\s*\d|$)/s;
  const requireMatch = scriptContent.match(requirePattern);
  
  if (requireMatch) {
    try {
      const requireData = JSON.parse(requireMatch[1]);
      if (Array.isArray(requireData) && requireData.length > 0) {
        console.log(`[Facebook] Found require() data array (old format) with ${requireData.length} items`);
        return requireData;
      }
    } catch (e) {
      // Continue
    }
  }
  
  // Pattern 2: Direct GraphQL Story/FeedUnit objects
  const storyPattern = /\{"__typename":"Story"[^}]*"message"[^}]*\}/g;
  const storyMatches = scriptContent.match(storyPattern);
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-api/route.ts:665',message:'story pattern match result',data:{matched:!!storyMatches,matchCount:storyMatches?storyMatches.length:0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  
  if (storyMatches && storyMatches.length > 0) {
    console.log(`[Facebook] Found ${storyMatches.length} Story objects`);
    return storyMatches.map(match => {
      try {
        return JSON.parse(match);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
  }
  
  // Pattern 3: Look for objects with __typename
  const typenamePattern = /\{"__typename":"(Story|FeedUnit|Post)"[^}]*\}/g;
  const typenameMatches = scriptContent.match(typenamePattern);
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-api/route.ts:680',message:'typename pattern match result',data:{matched:!!typenameMatches,matchCount:typenameMatches?typenameMatches.length:0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  
  if (typenameMatches && typenameMatches.length > 0) {
    console.log(`[Facebook] Found ${typenameMatches.length} objects with __typename`);
    return typenameMatches.map(match => {
      try {
        return JSON.parse(match);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
  }
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-api/route.ts:690',message:'extractFacebookData returning null',data:{reason:'no patterns matched'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  return null;
}

/**
 * Traverses an object recursively to find posts
 */
function traverseObject(obj: any, callback: (obj: any) => void): void {
  if (!obj || typeof obj !== 'object') return;
  
  callback(obj);
  
  if (Array.isArray(obj)) {
    obj.forEach(item => traverseObject(item, callback));
  } else {
    Object.values(obj).forEach(value => {
      if (value && typeof value === 'object') {
        traverseObject(value, callback);
      }
    });
  }
}

function normalizeFacebookTimestamp(ts: any): string {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'string') {
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof ts === 'number') {
    // Heuristic: seconds vs milliseconds
    const ms = ts < 10_000_000_000 ? ts * 1000 : ts;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

function getLikeCount(obj: any): number {
  const candidates = [
    obj?.feedback?.reaction_count,
    obj?.feedback?.reaction_count?.count,
    obj?.feedback?.reactors?.count,
    obj?.feedback?.comet_ufi_summary_and_actions_renderer?.feedback?.reaction_count,
    obj?.feedback?.comet_ufi_summary_and_actions_renderer?.feedback?.reactors?.count,
    obj?.feedback?.count,
    obj?.like_count,
    obj?.reaction_count,
    obj?.attached_story?.feedback?.reaction_count,
    obj?.attached_story?.feedback?.count,
    obj?.comet_sections?.feedback?.story?.feedback_context?.feedback_target_with_context?.comet_ufi_summary_and_actions_renderer?.feedback?.reaction_count,
  ];
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return 0;
}

function getCommentCount(obj: any): number {
  const candidates = [
    obj?.feedback?.comment_count,
    obj?.feedback?.comments_count,
    obj?.comments?.count,
    obj?.comment_count,
    obj?.comments_count,
    obj?.attached_story?.feedback?.comment_count,
    obj?.attached_story?.comments?.count,
    obj?.comet_sections?.feedback?.story?.feedback_context?.feedback_target_with_context?.comet_ufi_summary_and_actions_renderer?.feedback?.comment_count,
  ];
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return 0;
}

function getShareCount(obj: any): number {
  const candidates = [
    obj?.feedback?.share_count,
    obj?.shares?.count,
    obj?.share_count,
    obj?.shares_count,
    obj?.attached_story?.feedback?.share_count,
    obj?.attached_story?.shares?.count,
    obj?.comet_sections?.feedback?.story?.feedback_context?.feedback_target_with_context?.comet_ufi_summary_and_actions_renderer?.feedback?.share_count,
  ];
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return 0;
}

function extractMediaFromObject(obj: any): string[] {
  const urls: string[] = [];
  const add = (u: any) => {
    if (typeof u !== 'string') return;
    const s = u.trim();
    if (!s) return;
    if (!urls.includes(s)) urls.push(s);
  };

  const tryAttachments = (attachments: any) => {
    const edges = attachments?.edges ?? attachments;
    if (!edges) return;
    if (Array.isArray(edges)) {
      for (const edge of edges) {
        const node = edge?.node ?? edge;
        add(node?.media?.image?.uri);
        add(node?.media?.image?.url);
        add(node?.story_attachment?.media?.image?.uri);
        add(node?.story_attachment?.media?.image?.url);
        add(node?.photo_image?.uri);
        add(node?.photo_image?.url);
        add(node?.image?.uri);
        add(node?.image?.url);
        add(node?.thumbnailImage?.uri);
        add(node?.thumbnailImage?.url);
      }
    }
  };

  tryAttachments(obj?.attachments);
  tryAttachments(obj?.attached_story?.attachments);
  tryAttachments(obj?.comet_sections?.content?.story?.attachments);

  return urls;
}

function findMessageInObject(obj: any, depth = 0, maxDepth = 6): string | null {
  if (!obj || typeof obj !== 'object') return null;
  if (depth > maxDepth) return null;

  const directCandidates = [
    obj?.message?.text,
    obj?.message?.text_with_entities?.text,
    obj?.text,
    obj?.body?.text,
    obj?.description?.text,
    obj?.title_with_entities?.text,
    obj?.story?.message?.text,
    obj?.attached_story?.message?.text,
    obj?.attached_story?.story?.message?.text,
    obj?.comet_sections?.content?.story?.message?.text,
    obj?.comet_sections?.content?.story?.attached_story?.message?.text,
    obj?.comet_sections?.content?.story?.story?.message?.text,
  ];

  for (const c of directCandidates) {
    if (typeof c === 'string') {
      const t = c.replace(/\s+/g, ' ').trim();
      if (t) return t;
    }
  }

  // Attachments: descriptions/titles often carry the post text for link/media stories
  const edges = obj?.attachments?.edges;
  if (Array.isArray(edges)) {
    for (const edge of edges) {
      const node = edge?.node;
      const attachmentCandidates = [
        node?.story_attachment?.description?.text,
        node?.story_attachment?.title_with_entities?.text,
        node?.media?.title?.text,
        node?.title,
      ];
      for (const c of attachmentCandidates) {
        if (typeof c === 'string') {
          const t = c.replace(/\s+/g, ' ').trim();
          if (t) return t;
        }
      }
    }
  }

  // Recursive search (bounded)
  for (const key of Object.keys(obj)) {
    const v = (obj as any)[key];
    if (!v || typeof v !== 'object') continue;
    const found = findMessageInObject(v, depth + 1, maxDepth);
    if (found) return found;
  }

  return null;
}

/**
 * Extracts a post from a Facebook GraphQL object
 */
function extractPostFromObject(obj: any): FacebookPost | null {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-api/route.ts:711',message:'extractPostFromObject entry',data:{hasId:!!(obj.id||obj.postID||obj.fbid||obj.legacy_fbid),hasDirectMessage:!!obj.message?.text,hasAttachedStory:!!obj.attached_story,hasAttachedStoryMessage:!!obj.attached_story?.message?.text,hasCometSections:!!obj.comet_sections,hasAttachments:!!(obj.attachments?.edges||obj.attachments?.length),typename:obj.__typename,objKeys:Object.keys(obj).slice(0,15),attachedStoryKeys:obj.attached_story?Object.keys(obj.attached_story).slice(0,10):null,attachmentsLength:obj.attachments?.edges?.length||obj.attachments?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  
  // Look for post structure
  const postId = obj.id || obj.postID || obj.fbid || obj.legacy_fbid || obj.post_id || obj.storyId;
  const message = findMessageInObject(obj);
  
  const timestamp =
    obj.creation_time ||
    obj.timestamp ||
    obj.time ||
    obj.created_time ||
    obj.attached_story?.creation_time ||
    obj.comet_sections?.content?.story?.creation_time;
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-api/route.ts:842',message:'extractPostFromObject validation',data:{postId:postId?String(postId).substring(0,50):null,message:message?String(message).substring(0,100):null,messageLength:message?String(message).length:0,messageType:typeof message,hasTimestamp:!!timestamp,messageSource:obj.message?.text?'direct':obj.attached_story?.message?.text?'attached_story':obj.comet_sections?.content?.story?.message?.text?'comet_sections':obj.attachments?.edges?.[0]?.node?.title?'attachment_title':'unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'G'})}).catch(()=>{});
  // #endregion
  
  if (!postId || !message || typeof message !== 'string' || message.length < 10) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-api/route.ts:732',message:'extractPostFromObject rejected - missing fields',data:{reason:!postId?'no postId':!message?'no message':typeof message!=='string'?'message not string':'message too short'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    return null;
  }
  
  // Filter out technical strings
  if (!isValidPostContent(message)) {
    return null;
  }
  
  const likeCount = getLikeCount(obj);
  const commentCount = getCommentCount(obj);
  const shareCount = getShareCount(obj);
  const mediaUrls = extractMediaFromObject(obj);
  
  return {
    id: postId.toString(),
    content: message,
    timestamp: normalizeFacebookTimestamp(timestamp),
    likeCount,
    commentCount,
    shareCount,
    mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
  };
}

/**
 * Parses Facebook GraphQL data structure
 */
function parseFacebookGraphQL(data: any): FacebookPost[] {
  const posts: FacebookPost[] = [];
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-api/route.ts:885',message:'parseFacebookGraphQL entry',data:{dataType:typeof data,isArray:Array.isArray(data),arrayLength:Array.isArray(data)?data.length:0,firstItemType:Array.isArray(data)&&data.length>0?typeof data[0]:null,firstItemIsArray:Array.isArray(data)&&data.length>0?Array.isArray(data[0]):null},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  
  if (Array.isArray(data)) {
    data.forEach((item, index) => {
      // #region agent log
      if (index < 3) {
        fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-api/route.ts:893',message:'processing array item',data:{index,itemType:typeof item,isArray:Array.isArray(item),itemLength:Array.isArray(item)?item.length:0,hasTypename:item&&typeof item==='object'&&!Array.isArray(item)?!!item.__typename:false,itemKeys:item&&typeof item==='object'&&!Array.isArray(item)?Object.keys(item).slice(0,10):null},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'E'})}).catch(()=>{});
      }
      // #endregion
      
      if (item && typeof item === 'object') {
        // Check if it's a post object
        if (item.__typename === 'Story' || item.__typename === 'FeedUnit' || item.__typename === 'Post') {
          const post = extractPostFromObject(item);
          if (post) posts.push(post);
        } else if (Array.isArray(item)) {
          // Item is a nested array (like ["HasteSupportData","handle",null,[{...}]])
          // Recursively process nested arrays
          const nestedPosts = parseFacebookGraphQL(item);
          nestedPosts.forEach(post => {
            if (!posts.some(p => p.id === post.id)) {
              posts.push(post);
            }
          });
        } else {
          // Traverse the object to find nested posts
          traverseObject(item, (obj) => {
            if (obj.__typename === 'Story' || obj.__typename === 'FeedUnit' || obj.__typename === 'Post') {
              const post = extractPostFromObject(obj);
              if (post && !posts.some(p => p.id === post.id)) {
                posts.push(post);
              }
            }
          });
        }
      } else if (Array.isArray(item)) {
        // Item is directly an array, recursively process
        const nestedPosts = parseFacebookGraphQL(item);
        nestedPosts.forEach(post => {
          if (!posts.some(p => p.id === post.id)) {
            posts.push(post);
          }
        });
      }
    });
  } else if (data && typeof data === 'object') {
    // Data is an object, traverse it
    traverseObject(data, (obj) => {
      if (obj.__typename === 'Story' || obj.__typename === 'FeedUnit' || obj.__typename === 'Post') {
        const post = extractPostFromObject(obj);
        if (post && !posts.some(p => p.id === post.id)) {
          posts.push(post);
        }
      }
    });
  }
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-api/route.ts:940',message:'parseFacebookGraphQL exit',data:{postsFound:posts.length},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  
  return posts;
}

/**
 * Searches a script tag for actual Facebook post data
 * Looks for Story, FeedUnit, and post patterns (not module loading data)
 */
function searchForPostsInScript(scriptContent: string, scriptIndex: number, maxPosts: number): FacebookPost[] {
  const posts: FacebookPost[] = [];
  
  if (scriptContent.length < 100) return posts; // Skip tiny scripts
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-api/route.ts:958',message:'searchForPostsInScript entry',data:{scriptIndex,contentLength:scriptContent.length,hasStory:scriptContent.includes('"__typename":"Story"'),hasFeedUnit:scriptContent.includes('"__typename":"FeedUnit"'),hasMessageText:scriptContent.includes('"message":{"text"'),hasAttachedStoryMessage:scriptContent.includes('attached_story')&&scriptContent.includes('message'),sampleAt1000:scriptContent.substring(1000,1500)},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'G'})}).catch(()=>{});
  // #endregion
  
  // Pattern 1: Story objects - DON'T require message in pattern, message may be nested
  // We use a lightweight anchor then extract full JSON by brace counting.
  const storyPattern = /\{"__typename":"Story"/gs;
  let storyMatch;
  let storyCount = 0;
  
  while ((storyMatch = storyPattern.exec(scriptContent)) !== null && storyCount < 20) {
    try {
      // Try to parse the matched JSON
      const storyJson = storyMatch[0];
      const story = JSON.parse(storyJson);
      const post = extractPostFromObject(story);
      if (post && !posts.some(p => p.id === post.id) && posts.length < maxPosts) {
        posts.push(post);
        storyCount++;
      }
    } catch (e) {
      // Try to find a more complete JSON object
      // Look for the full object by finding matching braces
      const startPos = storyMatch.index;
      let braceCount = 0;
      let inString = false;
      let escapeNext = false;
      let endPos = startPos;
      
      for (let i = startPos; i < scriptContent.length; i++) {
        const char = scriptContent[i];
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;
        if (char === '{') braceCount++;
        if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            endPos = i + 1;
            break;
          }
        }
      }
      
      if (endPos > startPos) {
        try {
          const fullJson = scriptContent.substring(startPos, endPos);
          const story = JSON.parse(fullJson);
          
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-api/route.ts:1016',message:'parsed full Story object',data:{jsonLength:fullJson.length,typename:story.__typename,hasAttachedStory:!!story.attached_story,attachedStoryKeys:story.attached_story?Object.keys(story.attached_story).slice(0,10):null,attachedStoryMessageText:story.attached_story?.message?.text?.substring?.(0,100),hasMessage:!!story.message,messageText:story.message?.text?.substring?.(0,100),allKeys:Object.keys(story),feedbackOwner:story.feedback?.owning_profile?.name},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H'})}).catch(()=>{});
          // #endregion
          
          if (story.__typename === 'Story' || story.__typename === 'FeedUnit') {
            const post = extractPostFromObject(story);
            if (post && !posts.some(p => p.id === post.id) && posts.length < maxPosts) {
              posts.push(post);
              storyCount++;
            }
          }
        } catch (e2) {
          // Skip this match
        }
      }
    }
  }
  
  if (storyCount > 0) {
    console.log(`[Facebook] Script ${scriptIndex}: Found ${storyCount} Story objects`);
  }
  
  // Pattern 2: FeedUnit objects - message may be nested
  const feedUnitPattern = /\{"__typename":"FeedUnit"/gs;
  let feedUnitMatch;
  let feedUnitCount = 0;
  
  while ((feedUnitMatch = feedUnitPattern.exec(scriptContent)) !== null && feedUnitCount < 20) {
    try {
      const feedUnitJson = feedUnitMatch[0];
      const feedUnit = JSON.parse(feedUnitJson);
      const post = extractPostFromObject(feedUnit);
      if (post && !posts.some(p => p.id === post.id) && posts.length < maxPosts) {
        posts.push(post);
        feedUnitCount++;
      }
    } catch (e) {
      // Try full object extraction (similar to Story)
      const startPos = feedUnitMatch.index;
      let braceCount = 0;
      let inString = false;
      let escapeNext = false;
      let endPos = startPos;
      
      for (let i = startPos; i < scriptContent.length; i++) {
        const char = scriptContent[i];
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;
        if (char === '{') braceCount++;
        if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            endPos = i + 1;
            break;
          }
        }
      }
      
      if (endPos > startPos) {
        try {
          const fullJson = scriptContent.substring(startPos, endPos);
          const feedUnit = JSON.parse(fullJson);
          if (feedUnit.__typename === 'FeedUnit') {
            const post = extractPostFromObject(feedUnit);
            if (post && !posts.some(p => p.id === post.id) && posts.length < maxPosts) {
              posts.push(post);
              feedUnitCount++;
            }
          }
        } catch (e2) {
          // Skip
        }
      }
    }
  }
  
  if (feedUnitCount > 0) {
    console.log(`[Facebook] Script ${scriptIndex}: Found ${feedUnitCount} FeedUnit objects`);
  }
  
  // Pattern 3: Look for posts with edges structure
  const postsEdgesPattern = /"posts":\{"edges":\[(.*?)\]\}/gs;
  const postsEdgesMatch = scriptContent.match(postsEdgesPattern);
  
  if (postsEdgesMatch) {
    console.log(`[Facebook] Script ${scriptIndex}: Found posts edges structure`);
    // This is more complex, would need to parse the edges array
    // For now, skip this pattern as it's harder to extract
  }
  
  // Pattern 4: Look for timeline_feed_units
  const timelinePattern = /"timeline_feed_units":\{"edges":\[(.*?)\]\}/gs;
  const timelineMatch = scriptContent.match(timelinePattern);
  
  if (timelineMatch) {
    console.log(`[Facebook] Script ${scriptIndex}: Found timeline_feed_units`);
    // Similar complexity, skip for now
  }
  
  return posts;
}

/**
 * Parses posts from Facebook page HTML
 * Facebook embeds posts in script tags with JSON data
 */
function parsePosts(html: string, maxPosts: number = 10): FacebookPost[] {
  const posts: FacebookPost[] = [];
  
  try {
    console.log(`[Facebook] Parsing posts from HTML (length: ${html.length})`);
    
    // Method 1: Search ALL script tags for actual post data (Story/FeedUnit objects)
    const scriptMatches = Array.from(html.matchAll(/<script[^>]*>(.*?)<\/script>/gs));
    console.log(`[Facebook] Found ${scriptMatches.length} script tags - searching ALL for posts...`);
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-api/route.ts:1020',message:'parsePosts - searching all script tags',data:{totalScripts:scriptMatches.length},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    
    // Search ALL script tags for post patterns
    for (let i = 0; i < scriptMatches.length && posts.length < maxPosts; i++) {
      const scriptContent = scriptMatches[i][1];
      
      // Check if this script might contain posts
      const hasStory = scriptContent.includes('"__typename":"Story"');
      const hasFeedUnit = scriptContent.includes('"__typename":"FeedUnit"');
      const hasMessage = scriptContent.includes('"message"');
      const hasCreationTime = scriptContent.includes('"creation_time"');
      
      if (hasStory || hasFeedUnit || (hasMessage && hasCreationTime)) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-api/route.ts:1035',message:'script tag with post markers',data:{scriptIndex:i+1,contentLength:scriptContent.length,hasStory,hasFeedUnit,hasMessage,hasCreationTime},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        
        const foundPosts = searchForPostsInScript(scriptContent, i + 1, maxPosts - posts.length);
        
        // #region agent log
        if (foundPosts.length > 0) {
          fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-api/route.ts:1042',message:'found posts in script',data:{scriptIndex:i+1,postsFound:foundPosts.length,postIds:foundPosts.map(p=>p.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'F'})}).catch(()=>{});
        }
        // #endregion
        
        foundPosts.forEach(post => {
          if (!posts.some(p => p.id === post.id)) {
            posts.push(post);
          }
        });
      }
    }
    
    console.log(`[Facebook] Extracted ${posts.length} posts from script tags`);
    
    // Method 2: Fallback - Look for JSON patterns in large script tags
    // IMPORTANT: Only run fallback if we found *no* Story/FeedUnit markers at all,
    // otherwise it can easily pick up page metadata / boilerplate and look like "posts".
    const hasAnyPostMarkers = scriptMatches.some((m) => {
      const s = m?.[1] ?? '';
      return s.includes('"__typename":"Story"') || s.includes('"__typename":"FeedUnit"');
    });

    if (!hasAnyPostMarkers && posts.length < maxPosts) {
      console.log(`[Facebook] Trying fallback JSON pattern extraction...`);
      
      for (let i = 0; i < scriptMatches.length && posts.length < maxPosts; i++) {
        const scriptContent = scriptMatches[i][1];
        
        if (scriptContent.length > 1000) {
          try {
            const jsonPatterns = [
              /"message":"([^"]{20,})"/g,
              /"text":"([^"]{20,})"/g,
              /"story":"([^"]{20,})"/g,
              /"post_text":"([^"]{20,})"/g,
            ];
            
            for (const pattern of jsonPatterns) {
              const matches = Array.from(scriptContent.matchAll(pattern));
              for (const match of matches.slice(0, maxPosts - posts.length)) {
                const content = match[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim();
                
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/e3df070f-faca-4b3e-b1d2-b9a4f782fea3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-api/route.ts:1196',message:'fallback pattern match',data:{patternSource:String(pattern).substring(0,30),contentLength:content.length,contentPreview:content.substring(0,100),isValid:isValidPostContent(content),isDuplicate:posts.some(p=>p.content===content)},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'I'})}).catch(()=>{});
                // #endregion
                
                // Filter obvious non-post boilerplate from fallback extraction
                const lower = content.toLowerCase();
                const looksLikeBoilerplate =
                  lower.includes('see more about') ||
                  lower.includes('page ·') ||
                  lower.includes('commenting has been turned off') ||
                  lower.includes('a server error') ||
                  lower.includes('field_exception');

                if (!looksLikeBoilerplate && isValidPostContent(content) && !posts.some(p => p.content === content)) {
                  posts.push({
                    id: `post-${posts.length + 1}-${Date.now()}`,
                    content,
                    timestamp: new Date().toISOString(),
                    likeCount: 0,
                    commentCount: 0,
                  });
                }
              }
            }
          } catch (e) {
            // Continue
          }
        }
      }
    }
    
    // Method 3: Parse from HTML structure - look for post containers
    if (posts.length < maxPosts) {
      console.log(`[Facebook] Trying HTML structure parsing...`);
      
      // Look for various Facebook post container patterns
      const postPatterns = [
        /<div[^>]*data-pagelet="FeedUnit"[^>]*>(.*?)<\/div>/gs,
        /<div[^>]*role="article"[^>]*>(.*?)<\/div>/gs,
        /<article[^>]*>(.*?)<\/article>/gs,
        /<div[^>]*class="[^"]*userContent[^"]*"[^>]*>(.*?)<\/div>/gs,
      ];
      
      for (const pattern of postPatterns) {
        const matches = Array.from(html.matchAll(pattern));
        console.log(`[Facebook] Found ${matches.length} potential post containers with pattern`);
        
        for (const match of matches.slice(0, maxPosts)) {
          const postHtml = match[1];
          
          // Extract text content - look for paragraphs, divs with text
          const textPatterns = [
            /<p[^>]*>(.*?)<\/p>/gs,
            /<div[^>]*data-testid="post_message"[^>]*>(.*?)<\/div>/gs,
            /<span[^>]*data-testid="post_message"[^>]*>(.*?)<\/span>/gs,
            /<div[^>]*class="[^"]*userContent[^"]*"[^>]*>(.*?)<\/div>/gs,
          ];
          
          for (const textPattern of textPatterns) {
            const textMatches = Array.from(postHtml.matchAll(textPattern));
            for (const textMatch of textMatches) {
              const content = textMatch[1]
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
              
              if (content.length > 20 && isValidPostContent(content) && !posts.some(p => p.content === content)) {
                posts.push({
                  id: `post-${posts.length + 1}-${Date.now()}`,
                  content,
                  timestamp: new Date().toISOString(),
                  likeCount: 0,
                  commentCount: 0,
                });
                break; // Found content for this post, move to next
              }
            }
          }
        }
        
        if (posts.length > 0) break; // Found posts, stop trying other patterns
      }
    }
    
    // Method 3: Look for meta tags or structured data
    if (posts.length === 0) {
      console.log(`[Facebook] Trying meta tag extraction...`);
      
      // Sometimes Facebook embeds post previews in meta tags
      const metaDescription = html.match(/<meta property="og:description" content="([^"]+)"/);
      if (metaDescription && metaDescription[1].length > 20) {
        posts.push({
          id: `post-meta-${Date.now()}`,
          content: metaDescription[1],
          timestamp: new Date().toISOString(),
          likeCount: 0,
          commentCount: 0,
        });
      }
    }
    
    // Debug: Log sample of extracted posts
    if (posts.length > 0) {
      console.log(`[Facebook] DEBUG: Sample extracted posts:`);
      posts.slice(0, Math.min(3, posts.length)).forEach((post, i) => {
        console.log(`[Facebook]   Post ${i + 1}:`);
        console.log(`[Facebook]     ID: ${post.id}`);
        console.log(`[Facebook]     Content (first 100 chars): ${post.content.substring(0, 100)}...`);
        console.log(`[Facebook]     Content length: ${post.content.length} chars`);
        console.log(`[Facebook]     Timestamp: ${post.timestamp}`);
        console.log(`[Facebook]     Likes: ${post.likeCount}, Comments: ${post.commentCount}`);
        if (post.mediaUrls && post.mediaUrls.length > 0) {
          console.log(`[Facebook]     Media URLs: ${post.mediaUrls.length} (first: ${post.mediaUrls[0].substring(0, 80)}...)`);
        }
      });
    } else {
      console.log(`[Facebook] DEBUG: No posts extracted`);
    }
    
    console.log(`[Facebook] Extracted ${posts.length} posts total`);
    
  } catch (error) {
    console.error('[Facebook] Error parsing posts:', error);
  }
  
  return posts.slice(0, maxPosts);
}

/**
 * Main scraper function
 * Implements multi-request strategy like Apify
 */
async function scrapeFacebookPage(
  pageName: string,
  maxPosts: number = 10
): Promise<FacebookPageData> {
  const startTime = Date.now();
  
  try {
    const normalizedName = normalizePageName(pageName);
    const mainPageUrl = `https://www.facebook.com/${normalizedName}/`;
    
    // Step 1: Fetch main page to get page ID
    console.log(`[Facebook] Step 1: Fetching main page to get page ID...`);
    const { html: mainPageHtml, finalUrl: mainPageFinalUrl } = await fetchFacebookPage(mainPageUrl);
    
    // Check if we got a login page or error page
    if (mainPageHtml.includes('id="login_form"') || mainPageHtml.includes('Log In to Facebook') || mainPageHtml.includes('You must log in')) {
      console.error('[Facebook] Got login page - page may require authentication');
      return {
        success: false,
        data: {
          page: {
            id: '',
            name: pageName,
            username: pageName,
          },
          posts: [],
        },
        stats: {
          totalPosts: 0,
          totalComments: 0,
          scrapeTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
        },
        error: 'Facebook requires login or page is not accessible',
      };
    }
    
    // Step 2: Extract page ID (critical for accessing posts)
    const pageId = extractPageId(mainPageHtml, normalizedName, mainPageFinalUrl);
    
    // If page ID not found, try to extract from final URL (redirect might have page ID)
    let finalPageId = pageId;
    if (!finalPageId && mainPageFinalUrl) {
      const urlIdMatch = mainPageFinalUrl.match(/facebook\.com\/(\d{10,})\//);
      if (urlIdMatch) {
        finalPageId = urlIdMatch[1];
        console.log(`[Facebook] ✅ Extracted page ID from redirect URL: ${finalPageId}`);
      }
    }
    
    // Parse page info
    const page = parsePageInfo(mainPageHtml, normalizedName, finalPageId);
    console.log(`[Facebook] Parsed page info: ${page.name} (ID: ${page.id || 'not found'})`);
    
    // Step 3: Try multiple strategies to get posts (like Apify does)
    let posts: FacebookPost[] = [];
    
    // Strategy 1: Try mobile site first (often simpler HTML)
    if (finalPageId) {
      console.log(`[Facebook] Step 2: Trying mobile site with page ID ${finalPageId}...`);
      const mobilePosts = await tryMobileSite(finalPageId, maxPosts);
      posts.push(...mobilePosts);
      
      // Add delay between requests (like Apify)
      if (posts.length < maxPosts) {
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
      }
    } else {
      console.warn(`[Facebook] ⚠️ Page ID not found, trying with username as fallback...`);
      // Fallback: Try with username (sometimes works)
      const mobilePosts = await tryMobileSite(normalizedName, maxPosts);
      posts.push(...mobilePosts);
      
      if (posts.length < maxPosts) {
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
      }
    }
    
    // Strategy 2: Try desktop posts feed
    if (posts.length < maxPosts) {
      const pageIdToUse = finalPageId || normalizedName;
      console.log(`[Facebook] Step 3: Trying desktop posts feed with ${finalPageId ? 'page ID' : 'username'}...`);
      const desktopPosts = await tryDesktopPostsFeed(pageIdToUse, maxPosts - posts.length);
      posts.push(...desktopPosts);
      
      if (posts.length < maxPosts) {
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
      }
    }
    
    // Strategy 3: Parse from main page HTML (fallback)
    if (posts.length < maxPosts) {
      console.log(`[Facebook] Step 4: Parsing from main page HTML...`);
      const mainPagePosts = parsePosts(mainPageHtml, maxPosts - posts.length);
      posts.push(...mainPagePosts);
    }
    
    // Remove duplicates
    const uniquePosts = posts.filter((post, index, self) => 
      index === self.findIndex(p => p.content === post.content)
    );
    
    console.log(`[Facebook] Total extracted: ${uniquePosts.length} posts (${posts.length - uniquePosts.length} duplicates removed)`);
    
    const totalComments = uniquePosts.reduce((sum, post) => sum + (post.comments?.length || 0), 0);
    const scrapeTime = `${((Date.now() - startTime) / 1000).toFixed(2)}s`;
    
    // If no posts found, log a warning
    if (uniquePosts.length === 0) {
      console.warn(`[Facebook] ⚠️ No posts extracted after trying all strategies.`);
      if (!pageId) {
        console.warn(`[Facebook] ⚠️ Could not extract page ID - this is critical for accessing posts feed.`);
      }
    }
    
    return {
      success: true,
      data: {
        page,
        posts: uniquePosts.slice(0, maxPosts),
      },
      stats: {
        totalPosts: uniquePosts.length,
        totalComments,
        scrapeTime,
      },
      ...(uniquePosts.length === 0 ? {
        warning: pageId 
          ? "No posts found. Facebook's feed may be JavaScript-rendered or require authentication."
          : "Could not extract page ID. Posts feed requires page ID to access."
      } : {}),
    };
  } catch (error) {
    console.error('[Facebook] Scraping failed:', error);
    return {
      success: false,
      data: {
        page: {
          id: '',
          name: pageName,
          username: pageName,
        },
        posts: [],
      },
      stats: {
        totalPosts: 0,
        totalComments: 0,
        scrapeTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_TEST_API !== "true") {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }
  try {
    const { pageName, maxPosts = 10 } = await request.json();
    
    if (!pageName || typeof pageName !== 'string') {
      return NextResponse.json(
        { error: 'pageName is required' },
        { status: 400 }
      );
    }
    
    const cleanPageName = pageName.trim();
    if (!cleanPageName) {
      return NextResponse.json(
        { error: 'Invalid page name' },
        { status: 400 }
      );
    }
    
    console.log(`[Facebook] Starting scrape for: ${cleanPageName}`);
    
    const result = await scrapeFacebookPage(cleanPageName, maxPosts);
    
    if (!result.success) {
      return NextResponse.json(result, { status: 500 });
    }
    
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[Facebook] API error:', error);
    const message = error instanceof Error ? error.message : 'Scraping failed';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
