import { NextRequest, NextResponse } from 'next/server';
import { postRedditComment } from '@/lib/reddit/redditComment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Expected API key in env. Set REDDIT_COMMENT_API_KEY in .env.local. */
const REDDIT_COMMENT_API_KEY = process.env.REDDIT_COMMENT_API_KEY;

function getAuthToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7).trim();
  const apiKey = request.headers.get('x-api-key');
  if (apiKey) return apiKey.trim();
  return null;
}

function isAuthorized(request: NextRequest): boolean {
  if (!REDDIT_COMMENT_API_KEY?.trim()) return false;
  const token = getAuthToken(request);
  return token !== null && token === REDDIT_COMMENT_API_KEY.trim();
}

/** Extract post ID from a Reddit URL or raw ID. */
function parsePostId(input: string): string {
  const trimmed = input.trim();
  if (/^[a-z0-9]+$/i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const match = url.pathname.match(/\/comments\/([a-z0-9]+)/i);
    if (!match) throw new Error('URL must contain /comments/<postId>');
    return match[1];
  } catch {
    throw new Error('Invalid Reddit URL or post ID');
  }
}

/**
 * POST /api/reddit/comment
 * Auth: Authorization: Bearer <REDDIT_COMMENT_API_KEY> or X-API-Key: <REDDIT_COMMENT_API_KEY>
 * Body: { postId: string, text: string }
 * Always uses Playwright (browser). Requires REDDIT_SESSION_COOKIE in env.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { postId: rawPostId, text } = body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ success: false, error: 'text is required' }, { status: 400 });
    }

    if (!rawPostId || typeof rawPostId !== 'string' || !rawPostId.trim()) {
      return NextResponse.json({ success: false, error: 'postId is required' }, { status: 400 });
    }

    const postId = parsePostId(rawPostId);

    const result = await postRedditComment({
      postId,
      text: text.trim(),
      usePlaywright: true,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        method: result.method,
        commentId: result.commentId,
      });
    }
    return NextResponse.json(
      { success: false, method: result.method, error: result.error },
      { status: 422 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
