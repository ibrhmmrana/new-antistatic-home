import { NextRequest, NextResponse } from 'next/server';
import { InstagramSessionService } from '@/lib/services/instagram-session';
import { EnvManager } from '@/lib/services/env-manager';

export const runtime = 'nodejs';

/**
 * POST /api/instagram/session/refresh
 * Refreshes Instagram session by logging in and extracting new credentials
 * 
 * Security: Requires X-API-Key header matching SESSION_REFRESH_API_KEY
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Check API key for security
    const apiKey = request.headers.get('X-API-Key');
    const expectedApiKey = process.env.SESSION_REFRESH_API_KEY;

    if (expectedApiKey && apiKey !== expectedApiKey) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid API key' },
        { status: 401 }
      );
    }

    // Check if headful/headless mode is requested via query parameter
    const { searchParams } = new URL(request.url);
    const headfulParam = searchParams.get('headful');
    const headlessParam = searchParams.get('headless');
    
    // Determine headless override (but force headless in production)
    let headlessOverride: boolean | undefined;
    
    if (headfulParam === 'true' || headlessParam === 'false') {
      // User wants headful mode (visible browser) - only allow locally
      const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
      if (isServerless) {
        console.log(`[API] ⚠️ Headful mode requested but forcing headless in production`);
        headlessOverride = true;
      } else {
        console.log(`[API] Overriding to headful mode (visible browser)`);
        headlessOverride = false;
      }
    } else if (headlessParam === 'true' || headfulParam === 'false') {
      // User explicitly wants headless mode
      console.log(`[API] Overriding to headless mode (hidden browser)`);
      headlessOverride = true;
    }

    console.log(`[API] Starting Instagram session refresh (headless override: ${headlessOverride !== undefined ? headlessOverride : 'none'})...`);
    return await executeRefresh(headlessOverride);
  } catch (error: any) {
    console.error('[API] Session refresh error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error during session refresh',
        duration_ms: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

async function executeRefresh(headlessOverride?: boolean) {
  const startTime = Date.now();

  const sessionService = InstagramSessionService.getInstance();
  const result = await sessionService.refreshSession({ headlessOverride });

  if (!result.success || !result.session) {
    return NextResponse.json(
      {
        success: false,
        error: result.error || 'Session refresh failed',
        steps: result.steps,
        duration_ms: result.duration_ms,
      },
      { status: 500 }
    );
  }

  // Update environment variables
  try {
    const envManager = new EnvManager();
    await envManager.updateEnvironment(result.session);
  } catch (envError) {
    console.error('[API] Failed to update environment file:', envError);
    // Continue even if env update fails - webhook was sent
  }

  // Return success with masked credentials
  const maskedSession = {
    ...result.session,
    sessionid: `${result.session.sessionid.substring(0, 20)}...`,
    csrftoken: result.session.csrftoken ? `${result.session.csrftoken.substring(0, 10)}...` : '',
  };

  return NextResponse.json({
    success: true,
    message: 'Session refreshed successfully',
    session: maskedSession,
    steps: result.steps,
    duration_ms: result.duration_ms,
    refreshed_at: result.session.refreshed_at.toISOString(),
  });
}
