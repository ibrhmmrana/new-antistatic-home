import { NextRequest, NextResponse } from "next/server";
import { fetchInstagram, type FetchInstagramOptions } from "@/lib/net/instagramFetch";

export const runtime = "nodejs";

/**
 * Instagram API-based scraper using direct HTTP requests
 * Much faster and lighter than Playwright browser automation
 */

interface InstagramProfile {
  username: string;
  fullName: string;
  biography: string;
  profilePicUrl: string;
  profilePicUrlHd: string;
  followerCount: number;
  followingCount: number;
  postCount: number;
  isVerified: boolean;
  isBusinessAccount: boolean;
  category: string | null;
  website: string | null;
  userId: string;
}

interface InstagramPost {
  id: string;
  shortcode: string;
  mediaType: number; // 1=photo, 2=video, 8=carousel
  likeCount: number;
  commentCount: number;
  caption: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  takenAt: number | null;
  owner: {
    username: string;
    userId: string;
  };
  comments?: InstagramComment[]; // Optional comments array
}

interface InstagramComment {
  id: string;
  text: string;
  createdAt: number;
  likeCount: number;
  owner: {
    username: string;
    fullName: string;
    userId: string;
    profilePicUrl: string;
    isVerified: boolean;
  };
  replies?: InstagramComment[];
}

/**
 * Decodes URL-encoded session ID
 */
function decodeSessionId(encoded: string): string {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

/**
 * Generates a random Android device ID
 * Format: android-[16 random digits]
 * Example: android-1234567890123456
 */
function generateAndroidId(): string {
  // Generate 16 random digits (like PowerShell: Get-Random -Minimum 100000000000000 -Maximum 999999999999999)
  const digits = Array.from({ length: 16 }, () => Math.floor(Math.random() * 10)).join('');
  return `android-${digits}`;
}

/**
 * Gets Instagram-compatible headers using a consistent browser identity.
 *
 * IMPORTANT: We're hitting web endpoints (web_profile_info, etc.) so headers must look
 * like a real Chrome browser session, NOT an Android app.
 * Previously we mixed Android UA + browser Sec-Ch-Ua + random device IDs, which Instagram
 * easily detects as a bot (→ 429).
 */
function getInstagramHeaders(sessionId: string, authHeader?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    // Browser User-Agent matching the Sec-Ch-Ua below (Chrome 120 on Windows)
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

    // Instagram web app ID (NOT the Android/embed one 567067343352427)
    'X-IG-App-ID': '936619743392459',

    // Standard browser request headers
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'X-Requested-With': 'XMLHttpRequest',

    // Sec-Fetch headers (natural for a same-origin XHR from a browser)
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',

    // Client-Hints matching the User-Agent
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',

    // Origin and Referer (browser browsing instagram.com)
    'Origin': 'https://www.instagram.com',
    'Referer': 'https://www.instagram.com/',

    // Cookie: sessionid required; csrftoken and ds_user_id improve acceptance
    'Cookie': buildCookieHeader(sessionId),
  };

  const csrftoken = process.env.INSTAGRAM_CSRF_TOKEN;
  if (csrftoken) {
    headers['X-CSRFToken'] = csrftoken;
  }

  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  return headers;
}

/**
 * Builds Cookie header with sessionid; adds csrftoken and ds_user_id when set in env.
 */
function buildCookieHeader(sessionId: string): string {
  const parts = [`sessionid=${sessionId}`];
  const csrftoken = process.env.INSTAGRAM_CSRF_TOKEN;
  const dsUserId = process.env.INSTAGRAM_DS_USER_ID;
  if (csrftoken) parts.push(`csrftoken=${csrftoken}`);
  if (dsUserId) parts.push(`ds_user_id=${dsUserId}`);
  return parts.join('; ');
}

/**
 * Gets authorization header from Instagram API
 * Makes a request to the actual username endpoint to get the auth header
 * Note: In PowerShell, they use curl -i which includes headers in response body
 * In Node.js fetch, we check response.headers, but the header might not always be present
 * 
 * Returns null if header not found - this is OK, we can continue with just session cookie
 */
async function getAuthorizationHeader(
  sessionId: string,
  username: string,
  fetchOpts?: FetchInstagramOptions
): Promise<string | null> {
  const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;

  const instagramOpts: FetchInstagramOptions = {
    ...fetchOpts,
    stickyKey: fetchOpts?.stickyKey ?? username,
    logContext: "getAuthHeader",
  };

  try {
    const headers = getInstagramHeaders(sessionId);

    console.log(`[API] Making request to: ${url}`);
    console.log(`[API] Session ID length: ${sessionId.length} (decoded from encoded)`);
    console.log(`[API] Headers include Sec-Fetch-* to bypass SecFetch Policy`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response: Response;
    try {
      response = await fetchInstagram(
        url,
        {
          method: "GET",
          headers,
          redirect: "manual",
          signal: controller.signal,
        },
        instagramOpts
      );
      clearTimeout(timeoutId);

      const authHeaderVariations = [
        "ig-set-authorization",
        "Ig-Set-Authorization",
        "IG-Set-Authorization",
      ];

      for (const headerName of authHeaderVariations) {
        const authHeader = response.headers.get(headerName);
        if (authHeader) {
          console.log(`[API] ✅ Found authorization header in response: ${headerName}`);
          console.log(`[API] ✅ Auth header value: ${authHeader.substring(0, 50)}...`);
          return authHeader;
        }
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        console.log(`[API] ⚠️ Got redirect (${response.status}) to: ${location}`);

        if (location && (location.includes("/accounts/login") || location.includes("/login"))) {
          console.error(`[API] ❌ Redirected to login page - session is invalid or expired`);
          return null;
        }

        if (location && location === url) {
          console.warn(`[API] ⚠️ Redirecting to same URL - possible redirect loop`);
          console.warn(`[API] ⚠️ Auth header not found, returning null`);
          return null;
        }

        if (location) {
          console.log(`[API] Following redirect to: ${location}`);
          const redirectUrl = location.startsWith("http") ? location : `https://www.instagram.com${location}`;
          response = await fetchInstagram(
            redirectUrl,
            {
              method: "GET",
              headers,
              redirect: "manual",
              signal: controller.signal,
            },
            instagramOpts
          );

          for (const headerName of authHeaderVariations) {
            const authHeader = response.headers.get(headerName);
            if (authHeader) {
              console.log(`[API] ✅ Found authorization header after following redirect: ${headerName}`);
              return authHeader;
            }
          }
        }
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      console.error(`[API] ❌ Fetch failed with error:`, fetchError);
      console.error(`[API] ❌ Error name: ${fetchError?.name}`);
      console.error(`[API] ❌ Error message: ${fetchError?.message}`);
      console.error(`[API] ❌ Error code: ${fetchError?.code || 'N/A'}`);
      console.error(`[API] ❌ Error cause:`, fetchError?.cause);
      
      // Check for redirect count exceeded
      if (fetchError?.message?.includes('redirect count exceeded') || fetchError?.cause?.message?.includes('redirect count exceeded')) {
        console.error(`[API] ❌ Redirect count exceeded - Instagram is redirecting too many times`);
        console.error(`[API] ❌ This usually means:`);
        console.error(`[API]    1. Session is invalid and Instagram keeps redirecting to login`);
        console.error(`[API]    2. Instagram is detecting automated requests and redirecting`);
        console.error(`[API]    3. There's a redirect loop`);
        console.error(`[API] ❌ Try: Check if session ID is still valid, or Instagram may be blocking`);
        return null; // Return null instead of throwing
      }
      
      // Provide specific guidance based on error type
      if (fetchError?.name === 'AbortError') {
        console.error(`[API] ❌ Request timed out after 30 seconds`);
      } else if (fetchError?.code === 'ENOTFOUND' || fetchError?.code === 'EAI_AGAIN') {
        console.error(`[API] ❌ DNS resolution failed - check internet connection`);
      } else if (fetchError?.code === 'ECONNREFUSED') {
        console.error(`[API] ❌ Connection refused - Instagram may be blocking the request`);
      } else if (fetchError?.code === 'ETIMEDOUT') {
        console.error(`[API] ❌ Connection timed out`);
      } else if (fetchError?.message?.includes('certificate') || fetchError?.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        console.error(`[API] ❌ SSL/TLS certificate verification failed`);
      }
      
      return null; // Return null instead of throwing to allow graceful handling
    }

    // Log all response headers for debugging
    const allHeaders: string[] = [];
    response.headers.forEach((value, key) => {
      allHeaders.push(`${key}: ${value}`);
    });
    console.log(`[API] Response status: ${response.status} ${response.statusText}`);
    console.log(`[API] Available headers (${allHeaders.length} total): ${allHeaders.join(", ")}`);

    // Check if we got redirected to login (HTML response)
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      const text = await response.text().catch(() => "");
      if (text.includes("login") || text.includes("Login")) {
        console.warn(`[API] ⚠️ Got HTML login page - session may be invalid, but will try to continue`);
        // Don't throw error - return null and let caller decide
        return null;
      }
      console.warn(`[API] ⚠️ Got HTML response instead of JSON - session may be invalid, but will try to continue`);
      return null;
    }

    // Try to get the authorization header from response headers
    // Check all possible variations (case-insensitive)
    let authHeader: string | null = null;
    const headerVariations = [
      "ig-set-authorization",
      "Ig-Set-Authorization", 
      "IG-Set-Authorization",
      "ig-set-authorization",
    ];
    
    for (const headerName of headerVariations) {
      authHeader = response.headers.get(headerName);
      if (authHeader) {
        console.log(`[API] ✅ Found authorization header via: ${headerName}`);
        break;
      }
    }

    // If we got a valid JSON response, check if session is working
    if (response.ok) {
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        if (data.status === "ok") {
          if (authHeader) {
            console.log(`[API] ✅ Authorization header found: ${authHeader.substring(0, 50)}...`);
            return authHeader;
          } else {
            // Session works but no explicit auth header - this is OK, we can continue
            console.log(`[API] ℹ️ Session valid (got JSON response with status: ok)`);
            console.log(`[API] ℹ️ No explicit auth header found in response.headers - will continue with session cookie only`);
            console.log(`[API] ℹ️ This is expected - Instagram may not expose this header via fetch() API`);
            return null; // Return null gracefully - session cookie should be sufficient
          }
        } else {
          console.warn(`[API] ⚠️ Response status not OK: ${data.status}`);
          console.warn(`[API] ⚠️ Will try to continue anyway with session cookie`);
          return null;
        }
      } catch (parseError) {
        // Not JSON, likely HTML login page
        console.warn(`[API] ⚠️ Response is not JSON - likely login page`);
        console.warn(`[API] ⚠️ First 200 chars: ${text.substring(0, 200)}`);
        console.warn(`[API] ⚠️ Will try to continue anyway - may fail on actual data fetch`);
        return null;
      }
    } else {
      // Handle non-200 responses
      const text = await response.text().catch(() => "");
      console.warn(`[API] ⚠️ Response not OK: ${response.status} ${response.statusText}`);
      console.warn(`[API] ⚠️ Response body: ${text.substring(0, 500)}`);
      
      // For 400 errors, check for SecFetch Policy violation
      if (response.status === 400) {
        const isSecFetchError = text.includes('SecFetch') || text.includes('sec-fetch') || text.includes('SecFetch Policy');
        if (isSecFetchError) {
          console.error(`[API] ❌ 400 Bad Request - SecFetch Policy violation detected`);
          console.error(`[API] ❌ Instagram is blocking the request due to missing Sec-Fetch headers`);
          console.error(`[API] ❌ This should be fixed by the getInstagramHeaders() function`);
          console.error(`[API] ❌ Response: ${text}`);
        } else {
          console.error(`[API] ❌ 400 Bad Request - Request format is invalid`);
          console.error(`[API] ❌ Possible issues: missing headers, wrong cookie format, or Instagram blocking`);
          console.error(`[API] ❌ Response: ${text}`);
        }
        // Return null - caller will try to continue with data fetch anyway
      }
      
      // For other errors, log but continue
      console.warn(`[API] ⚠️ Will try to continue anyway - may fail on actual data fetch`);
      return null;
    }
  } catch (error: any) {
    // Don't throw - log and return null gracefully
    console.warn(`[API] ⚠️ Error getting authorization header:`, error);
    console.warn(`[API] ⚠️ Error type: ${error?.name || 'Unknown'}`);
    console.warn(`[API] ⚠️ Error message: ${error?.message || 'No message'}`);
    
    // If it's a network error, provide specific guidance
    if (error?.message?.includes('fetch failed') || error?.name === 'TypeError') {
      console.warn(`[API] ⚠️ Network-level error detected. Possible causes:`);
      console.warn(`[API]   1. SSL/TLS certificate verification issue`);
      console.warn(`[API]   2. DNS resolution failure`);
      console.warn(`[API]   3. Network connectivity problem`);
      console.warn(`[API]   4. Instagram blocking the connection`);
      console.warn(`[API] ⚠️ Will try to continue with profile fetch anyway`);
    }
    
    return null; // Return null instead of throwing
  }
}

/**
 * Fetches Instagram profile information
 */
async function fetchProfile(
  username: string,
  sessionId: string,
  authHeader: string | null,
  fetchOpts?: FetchInstagramOptions
): Promise<InstagramProfile | null> {
  const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;

  const headers = getInstagramHeaders(sessionId, authHeader);
  const instagramOpts: FetchInstagramOptions = {
    ...fetchOpts,
    stickyKey: fetchOpts?.stickyKey ?? username,
    logContext: "fetchProfile",
  };

  if (authHeader) {
    console.log(`[API] Fetching profile with auth header + session cookie`);
  } else {
    console.log(`[API] Fetching profile with session cookie only`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  let response: Response;
  try {
    response = await fetchInstagram(
      url,
      {
        method: "GET",
        headers,
        redirect: "manual",
        signal: controller.signal,
      },
      instagramOpts
    );
    clearTimeout(timeoutId);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      console.log(`[API] ⚠️ Profile fetch got redirect (${response.status}) to: ${location}`);

      if (location && (location.includes("/accounts/login") || location.includes("/login"))) {
        console.error(`[API] ❌ Redirected to login page - session is invalid or expired`);
        return null;
      }

      if (location) {
        const redirectUrl = location.startsWith("http") ? location : `https://www.instagram.com${location}`;

        if (redirectUrl === url) {
          console.warn(`[API] ⚠️ Redirecting to same URL - Instagram may be setting headers/cookies`);
          console.warn(`[API] ⚠️ Will try following redirect once more...`);
        }

        const redirectResponse = await fetchInstagram(
          redirectUrl,
          {
            method: "GET",
            headers,
            redirect: "manual",
            signal: controller.signal,
          },
          instagramOpts
        );

        if (redirectResponse.status >= 300 && redirectResponse.status < 400) {
          const redirectLocation = redirectResponse.headers.get("location");
          if (redirectLocation && (redirectLocation === url || redirectLocation === redirectUrl)) {
            console.warn(`[API] ⚠️ Redirect loop detected - using redirect response as final response`);
            response = redirectResponse;
          } else {
            response = redirectResponse;
          }
        } else {
          response = redirectResponse;
        }
      }
    }
  } catch (fetchError: any) {
    clearTimeout(timeoutId);
    console.error(`[API] ❌ Profile fetch failed with error:`, fetchError);
    console.error(`[API] ❌ Error name: ${fetchError?.name}`);
    console.error(`[API] ❌ Error message: ${fetchError?.message}`);
    console.error(`[API] ❌ Error code: ${fetchError?.code || 'N/A'}`);
    
    // Check for redirect count exceeded
    if (fetchError?.message?.includes('redirect count exceeded') || fetchError?.cause?.message?.includes('redirect count exceeded')) {
      console.error(`[API] ❌ Redirect count exceeded - Instagram is redirecting too many times`);
      console.error(`[API] ❌ Session may be invalid or Instagram is blocking automated requests`);
    }
    
    // Provide specific guidance
    if (fetchError?.name === 'AbortError') {
      console.error(`[API] ❌ Request timed out after 30 seconds`);
    } else if (fetchError?.code === 'ENOTFOUND' || fetchError?.code === 'EAI_AGAIN') {
      console.error(`[API] ❌ DNS resolution failed - check internet connection`);
    } else if (fetchError?.code === 'ECONNREFUSED') {
      console.error(`[API] ❌ Connection refused - Instagram may be blocking`);
    }
    
    return null; // Return null instead of throwing to allow graceful handling
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    console.error(`[API] Profile fetch failed: ${response.status} ${response.statusText}`);
    console.error(`[API] Response body: ${responseText.substring(0, 500)}`);
    
    // For 400 errors, provide more specific guidance
    if (response.status === 400) {
      console.error(`[API] 400 Bad Request - This usually means:`);
      console.error(`[API]   1. Request format is invalid (missing headers, wrong URL)`);
      console.error(`[API]   2. Session cookie format is incorrect`);
      console.error(`[API]   3. Instagram is rejecting the request structure`);
    }
    
    return null;
  }

  const data = await response.json();
  // Instagram web_profile_info can return user at data.data.user or data.user (or nested under xdt_* keys)
  const user =
    data?.data?.user ||
    data?.user ||
    data?.data?.xdt_api__v1__fb_user__profile_home__web?.user ||
    null;

  if (!user) {
    return null;
  }

  // Biography can be user.biography or user.bio (plain-text contact info often appears here)
  const biography = user.biography ?? user.bio ?? "";

  return {
    username: user.username || username,
    fullName: user.full_name || "",
    biography: typeof biography === "string" ? biography : "",
    profilePicUrl: user.profile_pic_url || "",
    profilePicUrlHd: user.profile_pic_url_hd || "",
    followerCount: user.edge_followed_by?.count || 0,
    followingCount: user.edge_follow?.count || 0,
    postCount: user.edge_owner_to_timeline_media?.count || 0,
    isVerified: user.is_verified || false,
    isBusinessAccount: user.is_business_account || false,
    category: user.category_name || null,
    website: user.external_url || null,
    userId: user.id || "",
  };
}

/**
 * Fetches user feed (posts)
 */
async function fetchUserFeed(
  userId: string,
  sessionId: string,
  authHeader: string | null,
  count: number = 24,
  fetchOpts?: FetchInstagramOptions
): Promise<InstagramPost[]> {
  const url = `https://www.instagram.com/api/v1/feed/user/${userId}/?count=${count}`;

  const headers = getInstagramHeaders(sessionId, authHeader);
  const instagramOpts: FetchInstagramOptions = {
    ...fetchOpts,
    logContext: fetchOpts?.logContext ?? "fetchUserFeed",
    timeoutMs: fetchOpts?.timeoutMs ?? 30000,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  let response: Response;
  try {
    response = await fetchInstagram(
      url,
      { method: "GET", headers, redirect: "manual", signal: controller.signal },
      instagramOpts
    );
    clearTimeout(timeoutId);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        const redirectUrl = location.startsWith("http") ? location : `https://www.instagram.com${location}`;
        response = await fetchInstagram(
          redirectUrl,
          { method: "GET", headers, redirect: "manual", signal: controller.signal },
          instagramOpts
        );
      }
    }
  } catch (fetchError: any) {
    clearTimeout(timeoutId);
    console.error(`[API] ❌ Feed fetch network error:`, fetchError?.message || fetchError);
    if (fetchError?.message?.includes('redirect count exceeded')) {
      console.error(`[API] ❌ Redirect count exceeded - Instagram may be blocking`);
    }
    return [];
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    console.error(`[API] Feed fetch failed: ${response.status} ${response.statusText}`);
    console.error(`[API] Response body: ${responseText.substring(0, 300)}`);
    
    // Check for SecFetch error
    if (response.status === 400 && (responseText.includes('SecFetch') || responseText.includes('sec-fetch'))) {
      console.error(`[API] ❌ SecFetch Policy violation detected in feed fetch`);
    }
    
    return [];
  }

  const data = await response.json();
  const items = data?.items || [];

  return items.map((item: any) => ({
    id: item.id || item.pk?.toString() || "",
    shortcode: item.code || "",
    mediaType: item.media_type || 1,
    likeCount: item.like_count || 0,
    commentCount: item.comment_count || 0,
    caption: item.caption?.text || null,
    thumbnailUrl: item.image_versions2?.candidates?.[0]?.url || null,
    videoUrl: item.video_versions?.[0]?.url || null,
    takenAt: item.taken_at || null,
    owner: {
      username: item.user?.username || "",
      userId: item.user?.pk?.toString() || "",
    },
  }));
}

/**
 * Fetches post details by shortcode
 */
async function fetchPostByShortcode(
  shortcode: string,
  sessionId: string,
  authHeader: string | null,
  fetchOpts?: FetchInstagramOptions
): Promise<any | null> {
  const url = `https://www.instagram.com/api/v1/media/shortcode/${shortcode}/`;

  const headers = getInstagramHeaders(sessionId, authHeader);
  const instagramOpts: FetchInstagramOptions = {
    ...fetchOpts,
    logContext: fetchOpts?.logContext ?? "fetchPostByShortcode",
    timeoutMs: fetchOpts?.timeoutMs ?? 30000,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  let response: Response;
  try {
    response = await fetchInstagram(
      url,
      { method: "GET", headers, redirect: "manual", signal: controller.signal },
      instagramOpts
    );
    clearTimeout(timeoutId);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        const redirectUrl = location.startsWith("http") ? location : `https://www.instagram.com${location}`;
        response = await fetchInstagram(
          redirectUrl,
          { method: "GET", headers, redirect: "manual", signal: controller.signal },
          instagramOpts
        );
      }
    }
  } catch (fetchError: any) {
    clearTimeout(timeoutId);
    console.error(`[API] ❌ Post fetch network error:`, fetchError?.message || fetchError);
    if (fetchError?.message?.includes('redirect count exceeded')) {
      console.error(`[API] ❌ Redirect count exceeded - Instagram may be blocking`);
    }
    return null;
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    console.error(`[API] Post fetch failed: ${response.status} ${response.statusText}`);
    console.error(`[API] Response body: ${responseText.substring(0, 300)}`);
    
    // Check for SecFetch error
    if (response.status === 400 && (responseText.includes('SecFetch') || responseText.includes('sec-fetch'))) {
      console.error(`[API] ❌ SecFetch Policy violation detected in post fetch`);
    }
    
    return null;
  }

  return await response.json();
}

/**
 * Fetches comments for a post using REST API
 */
async function fetchCommentsREST(
  postPk: string,
  sessionId: string,
  authHeader: string | null,
  count: number = 30,
  fetchOpts?: FetchInstagramOptions
): Promise<InstagramComment[]> {
  const url = `https://www.instagram.com/api/v1/media/${postPk}/comments/?can_support_threading=true&permalink_enabled=false&count=${count}`;

  const headers = getInstagramHeaders(sessionId, authHeader);
  const instagramOpts: FetchInstagramOptions = {
    ...fetchOpts,
    logContext: fetchOpts?.logContext ?? "fetchCommentsREST",
    timeoutMs: fetchOpts?.timeoutMs ?? 30000,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  let response: Response;
  try {
    response = await fetchInstagram(
      url,
      { method: "GET", headers, redirect: "manual", signal: controller.signal },
      instagramOpts
    );
    clearTimeout(timeoutId);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        const redirectUrl = location.startsWith("http") ? location : `https://www.instagram.com${location}`;
        response = await fetchInstagram(
          redirectUrl,
          { method: "GET", headers, redirect: "manual", signal: controller.signal },
          instagramOpts
        );
      }
    }
  } catch (fetchError: any) {
    clearTimeout(timeoutId);
    console.error(`[API] ❌ Comments REST fetch network error:`, fetchError?.message || fetchError);
    if (fetchError?.message?.includes('redirect count exceeded')) {
      console.error(`[API] ❌ Redirect count exceeded - Instagram may be blocking`);
    }
    return [];
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    console.error(`[API] Comments REST fetch failed: ${response.status} ${response.statusText}`);
    console.error(`[API] Response body: ${responseText.substring(0, 300)}`);
    
    // Check for SecFetch error
    if (response.status === 400 && (responseText.includes('SecFetch') || responseText.includes('sec-fetch'))) {
      console.error(`[API] ❌ SecFetch Policy violation detected in comments REST fetch`);
    }
    
    return [];
  }

  const data = await response.json();
  const comments = data?.comments || [];

  return comments.map((comment: any) => ({
    id: comment.pk || comment.id || "",
    text: comment.text || "",
    createdAt: comment.created_at_utc || comment.created_at || 0,
    likeCount: comment.comment_like_count || 0,
    owner: {
      username: comment.user?.username || "",
      fullName: comment.user?.full_name || "",
      userId: comment.user?.pk?.toString() || comment.user?.id || "",
      profilePicUrl: comment.user?.profile_pic_url || "",
      isVerified: comment.user?.is_verified || false,
    },
  }));
}

/**
 * Fetches comments for a post using GraphQL
 */
async function fetchCommentsGraphQL(
  shortcode: string,
  sessionId: string,
  authHeader: string | null,
  first: number = 30,
  fetchOpts?: FetchInstagramOptions
): Promise<InstagramComment[]> {
  const queryHash = "bc3296d1ce80a24b1b6e40b1e72903f5";
  const variables = { shortcode, first };
  const url = `https://www.instagram.com/graphql/query/?query_hash=${queryHash}&variables=${encodeURIComponent(JSON.stringify(variables))}`;

  const headers = getInstagramHeaders(sessionId, authHeader);
  const instagramOpts: FetchInstagramOptions = {
    ...fetchOpts,
    logContext: fetchOpts?.logContext ?? "fetchCommentsGraphQL",
    timeoutMs: fetchOpts?.timeoutMs ?? 30000,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  let response: Response;
  try {
    response = await fetchInstagram(
      url,
      { method: "GET", headers, redirect: "manual", signal: controller.signal },
      instagramOpts
    );
    clearTimeout(timeoutId);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        const redirectUrl = location.startsWith("http") ? location : `https://www.instagram.com${location}`;
        response = await fetchInstagram(
          redirectUrl,
          { method: "GET", headers, redirect: "manual", signal: controller.signal },
          instagramOpts
        );
      }
    }
  } catch (fetchError: any) {
    clearTimeout(timeoutId);
    console.error(`[API] ❌ Comments GraphQL fetch network error:`, fetchError?.message || fetchError);
    if (fetchError?.message?.includes('redirect count exceeded')) {
      console.error(`[API] ❌ Redirect count exceeded - Instagram may be blocking`);
    }
    return [];
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    console.error(`[API] Comments GraphQL fetch failed: ${response.status} ${response.statusText}`);
    console.error(`[API] Response body: ${responseText.substring(0, 300)}`);
    
    // Check for SecFetch error
    if (response.status === 400 && (responseText.includes('SecFetch') || responseText.includes('sec-fetch'))) {
      console.error(`[API] ❌ SecFetch Policy violation detected in comments GraphQL fetch`);
    }
    
    return [];
  }

  const data = await response.json();
  const edges = data?.data?.shortcode_media?.edge_media_to_parent_comment?.edges || [];

  return edges.map((edge: any) => {
    const node = edge.node;
    return {
      id: node.id || "",
      text: node.text || "",
      createdAt: node.created_at || 0,
      likeCount: node.edge_liked_by?.count || 0,
      owner: {
        username: node.owner?.username || "",
        fullName: node.owner?.full_name || "",
        userId: node.owner?.id || "",
        profilePicUrl: node.owner?.profile_pic_url || "",
        isVerified: node.owner?.is_verified || false,
      },
      replies: (node.edge_threaded_comments?.edges || []).map((replyEdge: any) => {
        const replyNode = replyEdge.node;
        return {
          id: replyNode.id || "",
          text: replyNode.text || "",
          createdAt: replyNode.created_at || 0,
          likeCount: replyNode.edge_liked_by?.count || 0,
          owner: {
            username: replyNode.owner?.username || "",
            fullName: replyNode.owner?.full_name || "",
            userId: replyNode.owner?.id || "",
            profilePicUrl: replyNode.owner?.profile_pic_url || "",
            isVerified: replyNode.owner?.is_verified || false,
          },
        };
      }),
    };
  });
}

/**
 * Main scraper function
 */
async function scrapeInstagramAPI(username: string): Promise<{
  profile: InstagramProfile | null;
  posts: InstagramPost[];
  error?: string;
}> {
  // Get session ID from environment
  const encodedSession = process.env.INSTAGRAM_SESSION_ID;
  if (!encodedSession) {
    throw new Error("INSTAGRAM_SESSION_ID environment variable not set");
  }

  const sessionId = decodeSessionId(encodedSession);
  
  // Optional: Validate session before scraping (can be disabled for performance)
  // Uncomment to enable automatic session validation
  /*
  try {
    const { InstagramSessionService } = await import('@/lib/services/instagram-session');
    const sessionService = InstagramSessionService.getInstance();
    const isValid = await sessionService.validateSession(sessionId);
    if (!isValid) {
      console.warn('[API] ⚠️ Session appears invalid - scraping may fail');
      console.warn('[API] 💡 Tip: Call /api/instagram/session/refresh to refresh session');
    }
  } catch (error) {
    console.warn('[API] ⚠️ Session validation skipped:', error);
  }
  */
  
  // Validate session ID format
  console.log(`[API] Session ID decoded: ${sessionId.substring(0, 20)}... (length: ${sessionId.length})`);
  if (!sessionId || sessionId.length < 10) {
    throw new Error("Session ID appears to be invalid or incorrectly decoded");
  }
  
  // Check if session ID looks like the expected format (should contain colons)
  if (!sessionId.includes(":")) {
    console.warn(`[API] ⚠️ Session ID doesn't contain ':' - may be incorrectly formatted`);
    console.warn(`[API] ⚠️ Expected format: userId:token:version:signature`);
  }

  // Diagnostic disabled in production — each test burns 1-2 requests against the session rate limit.
  // Set INSTAGRAM_DIAG=true to re-enable for debugging.
  if (process.env.INSTAGRAM_DIAG === "true") {
    try {
      const diagUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
      const diagHeaders = getInstagramHeaders(sessionId);
      console.log(`[DIAG] Node.js native fetch (no proxy)...`);
      const diagRes = await fetch(diagUrl, { method: "GET", headers: diagHeaders, redirect: "manual", signal: AbortSignal.timeout(15000) });
      console.log(`[DIAG] Node.js fetch: ${diagRes.status}`);
    } catch (e) { console.log(`[DIAG] error: ${e instanceof Error ? e.message : e}`); }
  }

  // Always use profile mode for this flow so auth + profile + feed use the same proxy endpoint (reduces 429)
  const defaultFetchOpts: FetchInstagramOptions = {
    stickyKey: username,
    rotationMode: "profile",
    timeoutMs: 30000,
    maxRetries: 4,           // More retries since Instagram 429s are transient via proxy
    retryDelayBaseMs: 3000,  // Longer backoff to let rate limit reset
  };

  // ── COMBINED FETCH: one request for auth header + profile data ──
  // Previously we called getAuthorizationHeader() then fetchProfile(), both hitting
  // the SAME endpoint (web_profile_info). The first call would burn rate-limit budget
  // and the second would get 429'd. Now we make ONE call and extract both.
  console.log(`[API] Fetching profile + auth header in single request for @${username}...`);
  let authHeader: string | null = null;
  let profile: InstagramProfile | null = null;

  const profileUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
  const profileHeaders = getInstagramHeaders(sessionId);
  const profileOpts: FetchInstagramOptions = {
    ...defaultFetchOpts,
    logContext: "fetchProfileCombined",
  };

  try {
    const response = await fetchInstagram(
      profileUrl,
      { method: "GET", headers: profileHeaders, redirect: "manual" },
      profileOpts
    );

    // Check for auth header in response (rarely exposed via fetch, but try)
    for (const name of ["ig-set-authorization", "Ig-Set-Authorization", "IG-Set-Authorization"]) {
      const val = response.headers.get(name);
      if (val) {
        authHeader = val;
        console.log(`[API] ✅ Found auth header: ${name}`);
        break;
      }
    }
    if (!authHeader) {
      console.log(`[API] ℹ️ No auth header in response (expected) - proceeding with session cookie only`);
    }

    // Parse profile from the same response
    if (response.ok) {
      const data = await response.json();
      const user =
        data?.data?.user ||
        data?.user ||
        data?.data?.xdt_api__v1__fb_user__profile_home__web?.user ||
        null;

      if (user) {
        const biography = user.biography ?? user.bio ?? "";
        profile = {
          username: user.username || username,
          fullName: user.full_name || "",
          biography: typeof biography === "string" ? biography : "",
          profilePicUrl: user.profile_pic_url || "",
          profilePicUrlHd: user.profile_pic_url_hd || "",
          followerCount: user.edge_followed_by?.count || 0,
          followingCount: user.edge_follow?.count || 0,
          postCount: user.edge_owner_to_timeline_media?.count || 0,
          isVerified: user.is_verified || false,
          isBusinessAccount: user.is_business_account || false,
          category: user.category_name || null,
          website: user.external_url || null,
          userId: user.id || "",
        };
        console.log(`[API] ✅ Profile parsed from combined response: ${profile.fullName} (${profile.followerCount} followers)`);
      } else {
        console.warn(`[API] ⚠️ Got 200 but no user data in response`);
      }
    } else {
      console.warn(`[API] ⚠️ Combined fetch returned ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    console.warn(`[API] ⚠️ Combined fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Fallback: if combined fetch didn't get profile, try dedicated fetchProfile with a delay
  if (!profile) {
    console.log(`[API] Fallback: trying dedicated fetchProfile after 5s delay...`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    profile = await fetchProfile(username, sessionId, authHeader, defaultFetchOpts);
  }

  if (!profile) {
    throw new Error(
      `Failed to fetch profile for @${username}. ` +
      `This could mean: (1) Session expired/invalid, (2) Username doesn't exist, ` +
      `(3) Profile is private, or (4) Instagram is blocking the request. ` +
      `Check console logs for more details.`
    );
  }
  console.log(`[API] ✅ Profile fetched: ${profile.fullName} (${profile.followerCount} followers)`);

  // Pace: wait 3s between profile and feed to let rate limit recover
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log(`[API] Fetching posts for user ${profile.userId}...`);
  const posts = await fetchUserFeed(profile.userId, sessionId, authHeader, 24, defaultFetchOpts);
  console.log(`[API] Fetched ${posts.length} posts`);

  return { profile, posts };
}

export async function POST(request: NextRequest) {
  try {
    const { username, includeComments } = await request.json();

    if (!username || typeof username !== "string") {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    const cleanUsername = username.replace(/^@/, "").trim();
    if (!cleanUsername) {
      return NextResponse.json({ error: "Invalid username" }, { status: 400 });
    }

    console.log(`[API] Starting Instagram API scrape for: @${cleanUsername}`);

    const { profile, posts } = await scrapeInstagramAPI(cleanUsername);

    // Fetch comments for all posts
    // Note: We'll try even without auth header - session cookie might be sufficient
    let postsWithComments = posts;
    if (includeComments && profile) {
      const encodedSession = process.env.INSTAGRAM_SESSION_ID;
      if (encodedSession) {
        const sessionId = decodeSessionId(encodedSession);

        const commentsFetchOpts: FetchInstagramOptions = {
          stickyKey: cleanUsername,
          rotationMode: "profile",
          timeoutMs: 30000,
          maxRetries: 3,
          retryDelayBaseMs: 3000,
        };

        // Skip getAuthorizationHeader for comments — it hits the same web_profile_info endpoint
        // and never actually returns an auth header (Instagram doesn't expose it via fetch).
        // This saves 1-4 requests worth of rate-limit budget.
        const commentsAuthHeader: string | null = null;
        console.log(`[API] ℹ️ Using session cookie only for comments (auth header skipped to save rate limit)`);

        // Wait before fetching comments to let rate limit recover
        console.log(`[API] Waiting 5s before comments to let rate limit recover...`);
        await new Promise((resolve) => setTimeout(resolve, 5000));

        console.log(`[API] Fetching comments for all ${posts.length} posts...`);
        for (let i = 0; i < posts.length; i++) {
          const post = posts[i];
          if (post.shortcode) {
            try {
              const postDetails = await fetchPostByShortcode(post.shortcode, sessionId, commentsAuthHeader, commentsFetchOpts);
              const postPk = postDetails?.pk?.toString() || post.id;

              let comments: InstagramComment[] = [];
              if (postPk) {
                try {
                  comments = await fetchCommentsREST(postPk, sessionId, commentsAuthHeader, 30, commentsFetchOpts);
                  console.log(`[API] ✅ Fetched ${comments.length} comments via REST for post ${post.shortcode}`);
                } catch (restError) {
                  console.log(`[API] ⚠️ REST comments failed, trying GraphQL...`);
                  comments = await fetchCommentsGraphQL(post.shortcode, sessionId, commentsAuthHeader, 30, commentsFetchOpts);
                  console.log(`[API] ✅ Fetched ${comments.length} comments via GraphQL for post ${post.shortcode}`);
                }
              } else {
                comments = await fetchCommentsGraphQL(post.shortcode, sessionId, commentsAuthHeader, 30, commentsFetchOpts);
                console.log(`[API] ✅ Fetched ${comments.length} comments via GraphQL for post ${post.shortcode}`);
              }

              postsWithComments[i] = { ...post, comments };
            } catch (error) {
              console.error(`[API] ❌ Failed to fetch comments for ${post.shortcode}:`, error);
            }
          }
        }
      }
    }

    return NextResponse.json({
      profile,
      posts: postsWithComments,
      scrapedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error(`[API] Scraping failed:`, error);
    const message = error instanceof Error ? error.message : "Scraping failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
