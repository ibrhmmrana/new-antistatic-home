/**
 * Reddit comment posting: OAuth API (primary) and Playwright fallback.
 */

import { getRedditAccessToken, clearRedditTokenCache } from './redditAuth';
import { chromium as pwChromium } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import chromium from '@sparticuz/chromium';

const REDDIT_COMMENT_API = 'https://oauth.reddit.com/api/comment';
const REDDIT_OLD_POST_URL = (postId: string) => `https://old.reddit.com/comments/${postId}`;

export interface PostCommentParams {
  /** Reddit post ID (e.g. abc123). Required. */
  postId: string;
  /** Reddit comment ID to reply to (e.g. xyz789). If omitted, reply to the post. */
  commentId?: string;
  /** Comment body (plain text or markdown). */
  text: string;
  /** Force Playwright path instead of API. */
  usePlaywright?: boolean;
}

export interface PostCommentResult {
  success: boolean;
  method: 'api' | 'playwright';
  commentId?: string;
  error?: string;
}

/**
 * Post a comment via Reddit OAuth API.
 * thing_id: t3_{postId} for post, t1_{commentId} for comment reply.
 */
export async function postCommentViaAPI(
  thingId: string,
  text: string
): Promise<{ success: boolean; commentId?: string; error?: string }> {
  const token = await getRedditAccessToken();
  const username = process.env.REDDIT_USERNAME || 'antistatic';

  const body = new URLSearchParams({
    thing_id: thingId,
    text,
    api_type: 'json',
  }).toString();

  const response = await fetch(REDDIT_COMMENT_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${token}`,
      'User-Agent': `antistatic-reddit-commenter/1.0 by ${username}`,
    },
    body,
  });

  if (!response.ok) {
    const textBody = await response.text();
    if (response.status === 401) clearRedditTokenCache();
    return { success: false, error: `API ${response.status}: ${textBody}` };
  }

  const data = (await response.json()) as {
    json?: { errors?: string[]; data?: { things?: Array<{ data?: { id?: string } }> } };
  };
  const errors = data.json?.errors;
  if (errors?.length) {
    return { success: false, error: errors.join('; ') };
  }
  const things = data.json?.data?.things;
  const commentId = things?.[0]?.data?.id;
  return { success: true, commentId };
}

/**
 * Post a comment via Playwright (cookie-based). Requires REDDIT_SESSION_COOKIE.
 */
export async function postCommentViaPlaywright(
  postId: string,
  commentId: string | undefined,
  text: string,
  sessionCookie: string
): Promise<{ success: boolean; error?: string }> {
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const localPath = process.env.CHROME_PATH || process.env.CHROME_EXECUTABLE_PATH;
  const executablePath = isServerless ? await chromium.executablePath() : localPath || undefined;

  let browser: Browser | null = null;
  try {
    browser = await pwChromium.launch({
      headless: true,
      args: [
        ...(isServerless ? chromium.args : []),
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
      executablePath,
      timeout: 30000,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    await context.addCookies([
      {
        name: 'reddit_session',
        value: sessionCookie,
        domain: '.reddit.com',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    const page = await context.newPage();
    const navTimeoutMs = 45000; // old.reddit.com can be slow; avoid 20s timeout
    context.setDefaultTimeout(15000);
    context.setDefaultNavigationTimeout(navTimeoutMs);

    const postUrl = REDDIT_OLD_POST_URL(postId);
    await page.goto(postUrl, { waitUntil: 'networkidle', timeout: navTimeoutMs });
    await page.waitForTimeout(2000);

    if (commentId) {
      // Reply to a specific comment: find comment by data-fullname, click reply, fill form
      const commentSelector = `[data-fullname="t1_${commentId}"]`;
      const comment = page.locator(commentSelector).first();
      await comment.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {
        throw new Error(`Comment t1_${commentId} not found on page`);
      });
      const replyLink = comment.locator('a[href*="reply"], button:has-text("reply"), .reply a').first();
      await replyLink.click();
      await page.waitForTimeout(1500);
      const form = page.locator('form').filter({ has: page.locator('.usertext-edit textarea') }).first();
      await form.waitFor({ state: 'visible', timeout: 5000 });
      const textarea = form.locator('.usertext-edit textarea, textarea[name="text"]').first();
      await textarea.waitFor({ state: 'visible', timeout: 5000 });
      await textarea.fill(text);
      const submit = form.locator('button[type="submit"], input[type="submit"]').first();
      await submit.waitFor({ state: 'visible', timeout: 3000 });
      await submit.click();
    } else {
      // Reply to post: top-level comment form (main "add a comment" box in .commentarea)
      const commentarea = page.locator('.commentarea').first();
      await commentarea.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
        throw new Error('Comment form not found (missing .commentarea). Check REDDIT_SESSION_COOKIE is valid and you are logged in.');
      });
      const form = commentarea.locator('form').first();
      await form.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
        throw new Error('Comment form element not found. Old Reddit layout may have changed or you may not be logged in.');
      });
      const textarea = form.locator('.usertext-edit textarea, textarea[name="text"]').first();
      await textarea.waitFor({ state: 'visible', timeout: 8000 });
      await textarea.fill(text);
      const submit = form.locator('button[type="submit"], input[type="submit"]').first();
      await submit.waitFor({ state: 'visible', timeout: 3000 });
      await submit.click();
    }

    // Wait for submit to process (old Reddit often does in-place update)
    await page.waitForTimeout(5000);

    // Verify: a .comment .usertext-body must have our exact text (avoid false positive when e.g. "haha" appears in other comments)
    const normalizedOurText = text.trim().replace(/\s+/g, " ");
    const commentAppeared = await page.evaluate((expected: string) => {
      const bodies = document.querySelectorAll(".comment .usertext-body");
      for (const el of bodies) {
        const raw = (el.textContent || "").trim().replace(/\s+/g, " ");
        if (raw === expected) return true;
      }
      return false;
    }, normalizedOurText);
    if (!commentAppeared) {
      const errorEl = await page.locator('.status, .error, [class*="error"]').first().textContent().catch(() => null);
      const errorMsg = errorEl?.trim() || "Comment did not appear on page after submit (form may have failed or selectors changed).";
      return { success: false, error: errorMsg };
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * Post a Reddit comment. Tries API first; falls back to Playwright if requested or on API failure.
 */
export async function postRedditComment(params: PostCommentParams): Promise<PostCommentResult> {
  const { postId, commentId, text, usePlaywright } = params;
  const thingId = commentId ? `t1_${commentId}` : `t3_${postId}`;
  const sessionCookie = process.env.REDDIT_SESSION_COOKIE;

  if (usePlaywright) {
    if (!sessionCookie) {
      return { success: false, method: 'playwright', error: 'REDDIT_SESSION_COOKIE not set (required for Playwright fallback)' };
    }
    const result = await postCommentViaPlaywright(postId, commentId, text, sessionCookie);
    return { ...result, method: 'playwright' };
  }

  const apiResult = await postCommentViaAPI(thingId, text);
  if (apiResult.success) {
    return { success: true, method: 'api', commentId: apiResult.commentId };
  }

  if (sessionCookie) {
    const pwResult = await postCommentViaPlaywright(postId, commentId, text, sessionCookie);
    return { ...pwResult, method: 'playwright' };
  }

  return { success: false, method: 'api', error: apiResult.error };
}
