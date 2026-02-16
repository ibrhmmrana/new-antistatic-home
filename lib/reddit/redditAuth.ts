/**
 * Reddit OAuth token manager (script-type app, password grant).
 * Caches access token in memory and refreshes when expired.
 */

const REDDIT_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const TOKEN_BUFFER_SECONDS = 300; // Refresh 5 min before expiry

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cached: CachedToken | null = null;

function getRedditCredentials(): {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
} {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME;
  const password = process.env.REDDIT_PASSWORD;

  if (!clientId || !clientSecret || !username || !password) {
    throw new Error(
      'Missing Reddit credentials. Set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD in .env.local (create a script app at reddit.com/prefs/apps).'
    );
  }
  return { clientId, clientSecret, username, password };
}

/**
 * Get a valid Reddit OAuth access token. Uses cached token if still valid;
 * otherwise requests a new one via password grant.
 */
export async function getRedditAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt > now + TOKEN_BUFFER_SECONDS) {
    return cached.accessToken;
  }

  const { clientId, clientSecret, username, password } = getRedditCredentials();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'password',
    username,
    password,
  }).toString();

  const response = await fetch(REDDIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
      'User-Agent': 'antistatic-reddit-commenter/1.0',
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Reddit OAuth failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  cached = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in,
  };

  return cached.accessToken;
}

/**
 * Clear cached token (e.g. after auth failure to force refresh).
 */
export function clearRedditTokenCache(): void {
  cached = null;
}
