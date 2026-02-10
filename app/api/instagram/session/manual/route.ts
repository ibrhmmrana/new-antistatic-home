import { NextRequest, NextResponse } from 'next/server';
import { InstagramSessionService } from '@/lib/services/instagram-session';
import { EnvManager } from '@/lib/services/env-manager';

export const runtime = 'nodejs';

/**
 * POST /api/instagram/session/manual
 * Manually creates session with provided credentials (for testing)
 * 
 * Body: { username: string, password: string }
 */
export async function POST(request: NextRequest) {
  try {
    // API key check: same protection as /refresh endpoint
    const apiKey = request.headers.get('x-api-key');
    const expectedKey = process.env.SESSION_REFRESH_API_KEY;
    if (!expectedKey || apiKey !== expectedKey) {
      return NextResponse.json(
        { error: 'Unauthorized: valid API key required' },
        { status: 401 }
      );
    }

    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    // Temporarily set environment variables for this request
    const originalUsername = process.env.INSTAGRAM_USERNAME;
    const originalPassword = process.env.INSTAGRAM_PASSWORD;

    process.env.INSTAGRAM_USERNAME = username;
    process.env.INSTAGRAM_PASSWORD = password;

    try {
      const sessionService = InstagramSessionService.getInstance();
      const result = await sessionService.refreshSession();

      // Restore original values
      if (originalUsername) process.env.INSTAGRAM_USERNAME = originalUsername;
      if (originalPassword) process.env.INSTAGRAM_PASSWORD = originalPassword;

      if (!result.success || !result.session) {
        return NextResponse.json(
          {
            success: false,
            error: result.error || 'Manual session creation failed',
            steps: result.steps,
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
      }

      // Return success with masked credentials
      const maskedSession = {
        ...result.session,
        sessionid: `${result.session.sessionid.substring(0, 20)}...`,
        csrftoken: result.session.csrftoken ? `${result.session.csrftoken.substring(0, 10)}...` : '',
      };

      return NextResponse.json({
        success: true,
        message: 'Manual session created successfully',
        session: maskedSession,
        steps: result.steps,
        duration_ms: result.duration_ms,
      });
    } catch (error) {
      // Restore original values on error
      if (originalUsername) process.env.INSTAGRAM_USERNAME = originalUsername;
      if (originalPassword) process.env.INSTAGRAM_PASSWORD = originalPassword;
      throw error;
    }
  } catch (error: any) {
    console.error('[API] Manual session creation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error during manual session creation',
      },
      { status: 500 }
    );
  }
}
