# Instagram API Scraping Implementation Guide

**Location:** `/new-test` page and `/api/test/instagram-api` endpoint  
**Date:** 2025-01-11  
**Status:** ✅ Fully Implemented and Working

---

## 📋 Overview

This implementation uses **direct HTTP requests to Instagram's internal API endpoints** instead of browser automation (Playwright). This approach is:
- **Much faster** (no browser overhead)
- **Lighter weight** (no Chromium needed)
- **More reliable** (direct API access)
- **Easier to maintain** (simple HTTP requests)

The scraper authenticates using an Instagram session cookie and extracts profile data, posts, and comments using Instagram's official API endpoints.

---

## 🔑 Authentication Method

### Session ID Based Authentication

**Environment Variable Required:**
- `INSTAGRAM_SESSION_ID` - URL-encoded session cookie value

**How to Obtain Session ID:**
1. Log into Instagram in a browser
2. Open browser DevTools → Application/Storage → Cookies
3. Find the `sessionid` cookie from `instagram.com`
4. Copy the cookie value
5. URL-encode it and store in environment variable

**Session ID Format:**
- Expected format: `userId:token:version:signature` (contains colons)
- Example: `1234567890:abc123def456:1:xyz789`

**Code Location:** `app/api/test/instagram-api/route.ts` lines 61-67, 854-872

```typescript
function decodeSessionId(encoded: string): string {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}
```

---

## 🛠️ Header Construction

### Critical Headers for Bypassing Instagram Security

The scraper uses a sophisticated header construction function (`getInstagramHeaders`) that mimics an Android Instagram app to bypass security checks.

**Key Headers:**

1. **User-Agent:** `Instagram 267.0.0.19.301 Android`
2. **X-IG-App-ID:** `567067343352427` (Instagram's Android app ID)
3. **Sec-Fetch Headers** (Critical for bypassing SecFetch Policy):
   - `Sec-Fetch-Dest: empty`
   - `Sec-Fetch-Mode: cors`
   - `Sec-Fetch-Site: same-origin`
4. **Device Headers:**
   - `X-IG-Device-ID: android-[16 random digits]`
   - `X-IG-Android-ID: android-[16 random digits]`
   - `X-IG-Device-Locale: en_US`
   - `X-IG-Mapped-Locale: en_US`
   - `X-IG-Connection-Type: WIFI`
   - `X-IG-Capabilities: 3brTvw==`
5. **Cookie:** `sessionid=${sessionId}` (format: `sessionid=VALUE`, not `sessionid: VALUE`)
6. **Origin/Referer:** `https://www.instagram.com`
7. **Authorization Header** (optional, obtained dynamically)

**Code Location:** `app/api/test/instagram-api/route.ts` lines 74-133

**Why These Headers Matter:**
- Instagram checks for `Sec-Fetch-*` headers to detect automated requests
- Missing these headers results in `400 Bad Request - SecFetch Policy violation`
- Device IDs make requests look like they come from the official Instagram Android app
- The exact User-Agent string matches Instagram's Android app version

---

## 📡 API Endpoints Used

### 1. Profile Information Endpoint

**URL:** `https://www.instagram.com/api/v1/users/web_profile_info/?username={username}`

**Method:** GET

**Headers:** All headers from `getInstagramHeaders()` + optional Authorization header

**Response Structure:**
```json
{
  "status": "ok",
  "data": {
    "user": {
      "id": "userId",
      "username": "username",
      "full_name": "Full Name",
      "biography": "Bio text",
      "profile_pic_url": "https://...",
      "profile_pic_url_hd": "https://...",
      "edge_followed_by": { "count": 12345 },
      "edge_follow": { "count": 678 },
      "edge_owner_to_timeline_media": { "count": 100 },
      "is_verified": true/false,
      "is_business_account": true/false,
      "category_name": "Category",
      "external_url": "https://..."
    }
  }
}
```

**Extracted Profile Data:**
- Username
- Full name
- Biography
- Profile picture URL (standard and HD)
- Follower count
- Following count
- Post count
- Verification status
- Business account status
- Category (for business accounts)
- Website URL

**Code Location:** `app/api/test/instagram-api/route.ts` lines 376-512

---

### 2. User Feed Endpoint

**URL:** `https://www.instagram.com/api/v1/feed/user/{userId}/?count={count}`

**Method:** GET

**Parameters:**
- `userId` - The user's numeric ID (obtained from profile)
- `count` - Number of posts to fetch (default: 12)

**Response Structure:**
```json
{
  "items": [
    {
      "id": "postId",
      "pk": "postPk",
      "code": "shortcode",
      "media_type": 1, // 1=photo, 2=video, 8=carousel
      "like_count": 123,
      "comment_count": 45,
      "caption": { "text": "Caption text" },
      "image_versions2": {
        "candidates": [{ "url": "https://..." }]
      },
      "video_versions": [{ "url": "https://..." }],
      "taken_at": 1234567890,
      "user": {
        "username": "username",
        "pk": "userId"
      }
    }
  ]
}
```

**Extracted Post Data:**
- Post ID and shortcode
- Media type (photo/video/carousel)
- Like count
- Comment count
- Caption text
- Thumbnail URL (for photos)
- Video URL (for videos)
- Timestamp (taken_at)

**Code Location:** `app/api/test/instagram-api/route.ts` lines 517-594

---

### 3. Post Details by Shortcode

**URL:** `https://www.instagram.com/api/v1/media/shortcode/{shortcode}/`

**Method:** GET

**Purpose:** Get post PK (primary key) needed for REST API comment fetching

**Response:** Full post object with `pk` field

**Code Location:** `app/api/test/instagram-api/route.ts` lines 599-658

---

### 4. Comments - REST API Endpoint

**URL:** `https://www.instagram.com/api/v1/media/{postPk}/comments/?can_support_threading=true&permalink_enabled=false&count={count}`

**Method:** GET

**Parameters:**
- `postPk` - Post primary key (numeric ID)
- `count` - Number of comments to fetch (default: 30)
- `can_support_threading=true` - Enable threaded comments
- `permalink_enabled=false` - Disable permalink generation

**Response Structure:**
```json
{
  "comments": [
    {
      "pk": "commentId",
      "text": "Comment text",
      "created_at_utc": 1234567890,
      "comment_like_count": 5,
      "user": {
        "username": "commenter",
        "full_name": "Commenter Name",
        "pk": "userId",
        "profile_pic_url": "https://...",
        "is_verified": false
      }
    }
  ]
}
```

**Extracted Comment Data:**
- Comment ID
- Comment text
- Creation timestamp
- Like count
- Commenter username, full name, user ID
- Commenter profile picture
- Commenter verification status

**Note:** REST API does NOT include nested replies. Use GraphQL for replies.

**Code Location:** `app/api/test/instagram-api/route.ts` lines 663-738

---

### 5. Comments - GraphQL Endpoint (Fallback)

**URL:** `https://www.instagram.com/graphql/query/?query_hash={hash}&variables={variables}`

**Method:** GET

**Query Hash:** `bc3296d1ce80a24b1b6e40b1e72903f5` (hardcoded)

**Variables:**
```json
{
  "shortcode": "postShortcode",
  "first": 30
}
```

**Response Structure:**
```json
{
  "data": {
    "shortcode_media": {
      "edge_media_to_parent_comment": {
        "edges": [
          {
            "node": {
              "id": "commentId",
              "text": "Comment text",
              "created_at": 1234567890,
              "edge_liked_by": { "count": 5 },
              "owner": {
                "username": "commenter",
                "full_name": "Commenter Name",
                "id": "userId",
                "profile_pic_url": "https://...",
                "is_verified": false
              },
              "edge_threaded_comments": {
                "edges": [
                  {
                    "node": {
                      // Reply structure (same as parent comment)
                    }
                  }
                ]
              }
            }
          }
        ]
      }
    }
  }
}
```

**Advantages of GraphQL:**
- Includes nested replies (`edge_threaded_comments`)
- Can fetch replies in a single request
- More structured response

**Code Location:** `app/api/test/instagram-api/route.ts` lines 743-844

---

## 🔄 Scraping Flow

### Main Scraping Function: `scrapeInstagramAPI()`

**Step-by-Step Process:**

1. **Session ID Validation**
   - Decode URL-encoded session ID from environment variable
   - Validate format (should contain colons, minimum length)
   - Log session ID info for debugging

2. **Authorization Header Extraction (Optional)**
   - Attempt to get `ig-set-authorization` header from initial request
   - This header is sometimes present in redirect responses
   - If not found, continue with session cookie only (this is OK)
   - Function: `getAuthorizationHeader()`

3. **Profile Fetching**
   - Call `fetchProfile(username, sessionId, authHeader)`
   - Extract all profile information
   - Get `userId` for subsequent requests
   - Function: `fetchProfile()`

4. **Posts Fetching**
   - Call `fetchUserFeed(userId, sessionId, authHeader, 12)`
   - Fetch 12 most recent posts
   - Extract post metadata (likes, comments, captions, media URLs)
   - Function: `fetchUserFeed()`

5. **Comments Fetching (Optional)**
   - If `includeComments=true`:
     - For each post:
       - Get post PK via `fetchPostByShortcode()`
       - Try REST API first: `fetchCommentsREST()`
       - If REST fails, fallback to GraphQL: `fetchCommentsGraphQL()`
       - Attach comments to post object

**Code Location:** `app/api/test/instagram-api/route.ts` lines 849-918

---

## 📊 Data Structures

### InstagramProfile Interface

```typescript
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
```

### InstagramPost Interface

```typescript
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
  comments?: InstagramComment[]; // Optional
}
```

### InstagramComment Interface

```typescript
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
  replies?: InstagramComment[]; // Nested replies (GraphQL only)
}
```

---

## 🛡️ Error Handling & Security Bypasses

### Redirect Handling

Instagram often returns `302` redirects. The scraper:
- Uses `redirect: "manual"` to handle redirects manually
- Follows redirects only once to avoid loops
- Checks if redirect goes to login page (session invalid)
- Checks for redirect loops (same URL)

### SecFetch Policy Bypass

**Problem:** Instagram blocks requests missing `Sec-Fetch-*` headers

**Solution:** Include all required Sec-Fetch headers:
- `Sec-Fetch-Dest: empty`
- `Sec-Fetch-Mode: cors`
- `Sec-Fetch-Site: same-origin`
- `Sec-Ch-Ua: ...` (browser identification)
- `Sec-Ch-Ua-Mobile: ?0`
- `Sec-Ch-Ua-Platform: "Windows"`

### Timeout Handling

- All requests have 30-second timeout
- Uses `AbortController` for cancellation
- Graceful error handling (returns null/empty arrays instead of throwing)

### Session Validation

- Checks for redirects to `/accounts/login` (invalid session)
- Validates response is JSON (not HTML login page)
- Checks response status (`status: "ok"`)

---

## 🔧 Helper Functions

### 1. `generateAndroidId()`

Generates random Android device ID: `android-[16 random digits]`

**Purpose:** Makes requests look like they come from different Android devices

**Code Location:** Lines 74-78

### 2. `getInstagramHeaders(sessionId, authHeader?)`

Constructs complete header set for Instagram API requests

**Returns:** Object with all required headers

**Code Location:** Lines 84-133

### 3. `decodeSessionId(encoded)`

URL-decodes the session ID from environment variable

**Code Location:** Lines 61-67

### 4. `getAuthorizationHeader(sessionId, username)`

Attempts to extract `ig-set-authorization` header from initial request

**Returns:** Authorization header string or `null`

**Note:** This is optional - scraper works with just session cookie

**Code Location:** Lines 143-371

---

## 📝 Step-by-Step Recreation Instructions

### Prerequisites

1. **Environment Setup:**
   - Node.js/Next.js project
   - Environment variable: `INSTAGRAM_SESSION_ID` (URL-encoded session cookie)

2. **Get Session ID:**
   - Log into Instagram in browser
   - Open DevTools → Application → Cookies → `instagram.com`
   - Copy `sessionid` cookie value
   - URL-encode it: `encodeURIComponent(sessionId)`
   - Store in `.env.local`: `INSTAGRAM_SESSION_ID=encoded_value`

### Implementation Steps

#### Step 1: Create Header Helper Function

```typescript
function getInstagramHeaders(sessionId: string, authHeader?: string | null): Record<string, string> {
  const deviceId = generateAndroidId();
  const androidId = generateAndroidId();
  
  const headers: Record<string, string> = {
    'User-Agent': 'Instagram 267.0.0.19.301 Android',
    'X-IG-App-ID': '567067343352427',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Ch-Ua': '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'X-IG-Device-ID': deviceId,
    'X-IG-Android-ID': androidId,
    'X-IG-Device-Locale': 'en_US',
    'X-IG-Mapped-Locale': 'en_US',
    'X-IG-Connection-Type': 'WIFI',
    'X-IG-Capabilities': '3brTvw==',
    'Origin': 'https://www.instagram.com',
    'Referer': 'https://www.instagram.com/',
    'Cookie': `sessionid=${sessionId}`,
  };
  
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }
  
  return headers;
}
```

#### Step 2: Implement Profile Fetching

```typescript
async function fetchProfile(
  username: string,
  sessionId: string,
  authHeader: string | null
): Promise<InstagramProfile | null> {
  const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
  const headers = getInstagramHeaders(sessionId, authHeader);
  
  const response = await fetch(url, {
    method: "GET",
    headers,
    redirect: "manual", // Handle redirects manually
  });
  
  // Handle redirects
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (location && !location.includes("/login")) {
      const redirectUrl = location.startsWith("http") ? location : `https://www.instagram.com${location}`;
      response = await fetch(redirectUrl, { method: "GET", headers, redirect: "manual" });
    }
  }
  
  if (!response.ok) return null;
  
  const data = await response.json();
  const user = data?.data?.user;
  if (!user) return null;
  
  return {
    username: user.username || username,
    fullName: user.web_name || "",
    biography: user.biography || "",
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
```

#### Step 3: Implement Posts Fetching

```typescript
async function fetchUserFeed(
  userId: string,
  sessionId: string,
  authHeader: string | null,
  count: number = 12
): Promise<InstagramPost[]> {
  const url = `https://www.instagram.com/api/v1/feed/user/${userId}/?count=${count}`;
  const headers = getInstagramHeaders(sessionId, authHeader);
  
  const response = await fetch(url, {
    method: "GET",
    headers,
    redirect: "manual",
  });
  
  // Handle redirects (same as profile)
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (location) {
      const redirectUrl = location.startsWith("http") ? location : `https://www.instagram.com${location}`;
      response = await fetch(redirectUrl, { method: "GET", headers, redirect: "manual" });
    }
  }
  
  if (!response.ok) return [];
  
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
```

#### Step 4: Implement Comments Fetching (REST API)

```typescript
async function fetchCommentsREST(
  postPk: string,
  sessionId: string,
  authHeader: string | null,
  count: number = 30
): Promise<InstagramComment[]> {
  const url = `https://www.instagram.com/api/v1/media/${postPk}/comments/?can_support_threading=true&permalink_enabled=false&count=${count}`;
  const headers = getInstagramHeaders(sessionId, authHeader);
  
  const response = await fetch(url, {
    method: "GET",
    headers,
    redirect: "manual",
  });
  
  if (!response.ok) return [];
  
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
```

#### Step 5: Implement Comments Fetching (GraphQL - with Replies)

```typescript
async function fetchCommentsGraphQL(
  shortcode: string,
  sessionId: string,
  authHeader: string | null,
  first: number = 30
): Promise<InstagramComment[]> {
  const queryHash = "bc3296d1ce80a24b1b6e40b1e72903f5";
  const variables = { shortcode, first };
  const url = `https://www.instagram.com/graphql/query/?query_hash=${queryHash}&variables=${encodeURIComponent(JSON.stringify(variables))}`;
  const headers = getInstagramHeaders(sessionId, authHeader);
  
  const response = await fetch(url, {
    method: "GET",
    headers,
    redirect: "manual",
  });
  
  if (!response.ok) return [];
  
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
```

#### Step 6: Main Scraping Orchestration

```typescript
async function scrapeInstagramAPI(username: string): Promise<{
  profile: InstagramProfile | null;
  posts: InstagramPost[];
}> {
  // 1. Get and decode session ID
  const encodedSession = process.env.INSTAGRAM_SESSION_ID;
  if (!encodedSession) {
    throw new Error("INSTAGRAM_SESSION_ID environment variable not set");
  }
  const sessionId = decodeURIComponent(encodedSession);
  
  // 2. Try to get auth header (optional)
  let authHeader: string | null = null;
  try {
    authHeader = await getAuthorizationHeader(sessionId, username);
  } catch {
    // Continue without auth header - session cookie should be sufficient
  }
  
  // 3. Fetch profile
  const profile = await fetchProfile(username, sessionId, authHeader);
  if (!profile) {
    throw new Error("Failed to fetch profile");
  }
  
  // 4. Fetch posts
  const posts = await fetchUserFeed(profile.userId, sessionId, authHeader, 12);
  
  // 5. Fetch comments (if needed)
  if (includeComments) {
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      // Get post PK
      const postDetails = await fetchPostByShortcode(post.shortcode, sessionId, authHeader);
      const postPk = postDetails?.pk?.toString() || post.id;
      
      // Try REST first, fallback to GraphQL
      let comments: InstagramComment[] = [];
      try {
        comments = await fetchCommentsREST(postPk, sessionId, authHeader, 30);
      } catch {
        comments = await fetchCommentsGraphQL(post.shortcode, sessionId, authHeader, 30);
      }
      
      posts[i] = { ...post, comments };
    }
  }
  
  return { profile, posts };
}
```

---

## 🎯 Key Implementation Details

### 1. Redirect Handling

**Critical:** Always use `redirect: "manual"` in fetch options

**Why:** Instagram returns many redirects. Automatic following can cause:
- Redirect loops
- "Redirect count exceeded" errors
- Missing authorization headers

**Solution:** Handle redirects manually:
```typescript
if (response.status >= 300 && response.status < 400) {
  const location = response.headers.get("location");
  if (location && !location.includes("/login")) {
    const redirectUrl = location.startsWith("http") ? location : `https://www.instagram.com${location}`;
    response = await fetch(redirectUrl, { method: "GET", headers, redirect: "manual" });
  }
}
```

### 2. Authorization Header

**Status:** Optional but recommended

**How to Get:**
- Make initial request to profile endpoint
- Check response headers for `ig-set-authorization`
- May be in redirect response, not final response
- If not found, continue with session cookie only (works fine)

**Code Pattern:**
```typescript
const authHeader = response.headers.get("ig-set-authorization") || 
                   response.headers.get("Ig-Set-Authorization") || 
                   response.headers.get("IG-Set-Authorization");
```

### 3. Device ID Generation

**Purpose:** Make each request look like it comes from a different Android device

**Format:** `android-[16 random digits]`

**Implementation:**
```typescript
function generateAndroidId(): string {
  const digits = Array.from({ length: 16 }, () => Math.floor(Math.random() * 10)).join('');
  return `android-${digits}`;
}
```

### 4. Error Handling Strategy

**Principle:** Fail gracefully, don't throw errors

**Pattern:**
- Return `null` for profile fetch failures
- Return empty arrays `[]` for feed/comment failures
- Log errors but continue processing
- Allow partial data (e.g., profile without posts, posts without comments)

### 5. Timeout Management

**All requests:** 30-second timeout using `AbortController`

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000);

try {
  response = await fetch(url, {
    method: "GET",
    headers,
    signal: controller.signal,
  });
  clearTimeout(timeoutId);
} catch (error) {
  clearTimeout(timeoutId);
  // Handle error
}
```

---

## 📦 Data Extraction Details

### Profile Data Mapping

| Instagram API Field | Extracted Field | Notes |
|---------------------|-----------------|-------|
| `user.username` | `username` | Direct mapping |
| `user.full_name` | `fullName` | Direct mapping |
| `user.biography` | `biography` | Direct mapping |
| `user.profile_pic_url` | `profilePicUrl` | Standard resolution |
| `user.profile_pic_url_hd` | `profilePicUrlHd` | High resolution |
| `user.edge_followed_by.count` | `followerCount` | Nested count |
| `user.edge_follow.count` | `followingCount` | Nested count |
| `user.edge_owner_to_timeline_media.count` | `postCount` | Nested count |
| `user.is_verified` | `isVerified` | Boolean |
| `user.is_business_account` | `isBusinessAccount` | Boolean |
| `user.category_name` | `category` | Nullable |
| `user.external_url` | `website` | Nullable |
| `user.id` | `userId` | Used for feed fetching |

### Post Data Mapping

| Instagram API Field | Extracted Field | Notes |
|---------------------|-----------------|-------|
| `item.id` or `item.pk` | `id` | Primary identifier |
| `item.code` | `shortcode` | URL-friendly ID |
| `item.media_type` | `mediaType` | 1=photo, 2=video, 8=carousel |
| `item.like_count` | `likeCount` | Direct mapping |
| `item.comment_count` | `commentCount` | Direct mapping |
| `item.caption.text` | `caption` | Nullable |
| `item.image_versions2.candidates[0].url` | `thumbnailUrl` | First candidate (highest quality) |
| `item.video_versions[0].url` | `videoUrl` | For videos only |
| `item.taken_at` | `takenAt` | Unix timestamp |
| `item.user.username` | `owner.username` | Post owner |
| `item.user.pk` | `owner.userId` | Post owner ID |

### Comment Data Mapping (REST API)

| Instagram API Field | Extracted Field | Notes |
|---------------------|-----------------|-------|
| `comment.pk` or `comment.id` | `id` | Comment identifier |
| `comment.text` | `text` | Comment content |
| `comment.created_at_utc` or `comment.created_at` | `createdAt` | Unix timestamp |
| `comment.comment_like_count` | `likeCount` | Likes on comment |
| `comment.user.username` | `owner.username` | Commenter username |
| `comment.user.full_name` | `owner.fullName` | Commenter full name |
| `comment.user.pk` or `comment.user.id` | `owner.userId` | Commenter ID |
| `comment.user.profile_pic_url` | `owner.profilePicUrl` | Commenter avatar |
| `comment.user.is_verified` | `owner.isVerified` | Verification status |

**Note:** REST API does NOT include replies. Use GraphQL for nested replies.

### Comment Data Mapping (GraphQL)

| GraphQL Field | Extracted Field | Notes |
|---------------|-----------------|-------|
| `node.id` | `id` | Comment identifier |
| `node.text` | `text` | Comment content |
| `node.created_at` | `createdAt` | Unix timestamp |
| `node.edge_liked_by.count` | `likeCount` | Likes on comment |
| `node.owner.username` | `owner.username` | Commenter username |
| `node.owner.full_name` | `owner.fullName` | Commenter full name |
| `node.owner.id` | `owner.userId` | Commenter ID |
| `node.owner.profile_pic_url` | `owner.profilePicUrl` | Commenter avatar |
| `node.owner.is_verified` | `owner.isVerified` | Verification status |
| `node.edge_threaded_comments.edges[].node` | `replies[]` | **Nested replies** |

---

## 🔍 Frontend Integration

### Test Page: `/new-test`

**Location:** `app/new-test/page.tsx`

**Features:**
- Platform selector (Instagram/Facebook)
- Username input field
- "Include Comments" option
- Profile display with all metadata
- Posts grid with thumbnails
- Comments display (if enabled)
- Error handling and loading states

**API Call:**
```typescript
const response = await fetch("/api/test/instagram-api", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: username.trim(),
    includeComments: true,
  }),
});

const data = await response.json();
setInstagramProfile(data.profile);
setInstagramPosts(data.posts || []);
```

---

## ⚠️ Common Issues & Solutions

### Issue 1: "SecFetch Policy violation"

**Symptom:** `400 Bad Request` with message about SecFetch

**Solution:** Ensure all `Sec-Fetch-*` headers are included:
- `Sec-Fetch-Dest: empty`
- `Sec-Fetch-Mode: cors`
- `Sec-Fetch-Site: same-origin`

### Issue 2: "Redirect count exceeded"

**Symptom:** Error: `redirect count exceeded`

**Solution:** 
- Use `redirect: "manual"` in fetch options
- Handle redirects manually (only follow once)
- Check if redirect goes to login (session invalid)

### Issue 3: "Session expired"

**Symptom:** Redirects to `/accounts/login`

**Solution:**
- Get new session ID from browser
- Update `INSTAGRAM_SESSION_ID` environment variable
- Session IDs expire after ~30 days of inactivity

### Issue 4: "Authorization header not found"

**Symptom:** Warning in logs about missing auth header

**Solution:** This is OK! The scraper works with just session cookie. Auth header is optional.

### Issue 5: "Profile fetch failed"

**Possible Causes:**
1. Session ID invalid/expired
2. Username doesn't exist
3. Profile is private (and session doesn't follow them)
4. Instagram is blocking the request

**Solution:**
- Check session ID is valid
- Verify username exists
- Check if profile is private
- Review console logs for specific error

---

## 🚀 Performance Optimizations

1. **Parallel Comment Fetching:** Comments can be fetched in parallel for multiple posts
2. **Caching:** Profile and posts can be cached to avoid repeated API calls
3. **Pagination:** Use `max_id` parameter to fetch more posts (not implemented in current version)
4. **Selective Comment Fetching:** Only fetch comments for posts that need them

---

## 📚 API Endpoint Reference

### Base URL
`https://www.instagram.com`

### Endpoints

1. **Profile:** `/api/v1/users/web_profile_info/?username={username}`
2. **User Feed:** `/api/v1/feed/user/{userId}/?count={count}`
3. **Post by Shortcode:** `/api/v1/media/shortcode/{shortcode}/`
4. **Comments (REST):** `/api/v1/media/{postPk}/comments/?can_support_threading=true&permalink_enabled=false&count={count}`
5. **Comments (GraphQL):** `/graphql/query/?query_hash=bc3296d1ce80a24b1b6e40b1e72903f5&variables={variables}`

---

## 🔐 Security Considerations

1. **Session ID Storage:**
   - Store in environment variables (never commit to git)
   - Use URL encoding to handle special characters
   - Rotate session IDs periodically

2. **Rate Limiting:**
   - Instagram may rate limit requests
   - Add delays between requests if needed
   - Monitor for 429 (Too Many Requests) responses

3. **Request Headers:**
   - Always include all required headers
   - Don't modify User-Agent or App-ID
   - Keep device IDs consistent per session (optional)

---

## 📝 Summary

This Instagram scraper uses:
- **Session cookie authentication** (no OAuth needed)
- **Direct API endpoints** (no browser automation)
- **Comprehensive header construction** (bypasses security checks)
- **Graceful error handling** (partial data is OK)
- **Dual comment fetching** (REST + GraphQL fallback)

**Key Files:**
- Frontend: `app/new-test/page.tsx`
- Backend: `app/api/test/instagram-api/route.ts`

**Environment Variables:**
- `INSTAGRAM_SESSION_ID` (required)

**Main Functions:**
1. `scrapeInstagramAPI()` - Main orchestrator
2. `fetchProfile()` - Get profile data
3. `fetchUserFeed()` - Get posts
4. `fetchCommentsREST()` - Get comments (REST)
5. `fetchCommentsGraphQL()` - Get comments with replies (GraphQL)
6. `getInstagramHeaders()` - Construct headers
7. `getAuthorizationHeader()` - Extract auth header (optional)

---

## 🎓 Learning Points

1. **Instagram's API is accessible** without official API access
2. **Session cookies are powerful** - they provide full access
3. **Headers matter** - missing Sec-Fetch headers cause blocks
4. **Redirects must be handled manually** - automatic following causes loops
5. **GraphQL provides richer data** - use it for nested structures like replies
6. **Graceful degradation** - continue even if optional steps fail

---

**Last Updated:** 2025-01-11  
**Maintainer Notes:** This implementation is based on reverse-engineering Instagram's Android app API calls. The endpoints and headers may need updates if Instagram changes their API structure.
