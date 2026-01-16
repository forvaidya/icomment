/**
 * Logout Endpoint
 * POST /api/auth/logout
 *
 * Clears session from KV and removes session_id cookie
 * Auth: Optional (works with or without authentication)
 *
 * Response: { success: true }
 */

import type { RequestContext } from '../../../src/types/index';
import {
  extractSessionIdFromCookies,
  deleteSession,
  createLogoutCookie,
} from '../../../src/lib/session';
import { createSuccessResponse, AppError, ErrorCode } from '../../../src/lib/errors';

/**
 * Logout endpoint handler
 */
export async function onRequest(
  context: EventContext<
    {
      db: D1Database;
      kv: KVNamespace;
    },
    string,
    unknown
  >
): Promise<Response> {
  try {
    // Only POST method is allowed
    if (context.request.method !== 'POST') {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: ErrorCode.BAD_REQUEST,
            message: 'Method not allowed. Use POST.',
          },
        }),
        {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            Allow: 'POST',
          },
        }
      );
    }

    // Get session ID from cookies
    const cookieHeader = context.request.headers.get('cookie');
    const sessionId = extractSessionIdFromCookies(cookieHeader);

    // Delete session from KV if it exists
    if (sessionId) {
      try {
        await deleteSession(context.env.kv, sessionId);
      } catch (error) {
        console.error('Error deleting session:', error);
        // Continue even if deletion fails
      }
    }

    // Create logout cookie
    const logoutCookie = createLogoutCookie();

    // Return success response
    const response = {
      success: true,
      message: 'Logged out successfully',
    };

    return new Response(JSON.stringify(createSuccessResponse(response)), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': logoutCookie,
      },
    });
  } catch (error) {
    console.error('Logout error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'An unexpected error occurred during logout',
        },
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}
