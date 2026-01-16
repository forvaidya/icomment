/**
 * Authentication Login Endpoint
 * GET /api/auth/login
 *
 * Behavior:
 * - POC Mode (AUTH_ENABLED=false): Returns hardcoded mahesh.local session
 * - Production Mode (AUTH_ENABLED=true): Redirects to Auth0 login
 *
 * Response: Sets session_id cookie and returns { sessionId, expiresAt }
 */

import type { RequestContext } from '../../../src/types/index';
import {
  createSession,
  createSessionCookie,
} from '../../../src/lib/session';
import { isPOCMode, getPOCUser } from '../../../src/lib/auth-poc';
import { createSuccessResponse, AppError, ErrorCode } from '../../../src/lib/errors';

/**
 * Login endpoint handler
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
  const { request, env } = context;

  try {
    // POC Mode: Return hardcoded session for mahesh.local
    if (isPOCMode(env)) {
      const pocUser = getPOCUser();

      // Create session for POC user
      const { sessionId, expiresAt } = await createSession(
        env.kv,
        pocUser.id
      );

      // Create session cookie
      const sessionCookie = createSessionCookie(sessionId, expiresAt);

      // Return success response with session info
      const response = {
        sessionId,
        expiresAt: new Date(expiresAt).toISOString(),
        user: {
          id: pocUser.id,
          username: pocUser.username,
          type: pocUser.type,
          is_admin: pocUser.is_admin,
        },
      };

      return new Response(
        JSON.stringify(createSuccessResponse(response)),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': sessionCookie,
          },
        }
      );
    }

    // Production Mode: Redirect to Auth0 (not implemented in POC)
    // This would be implemented in Phase 5
    throw new AppError(
      ErrorCode.BAD_REQUEST,
      'Auth0 login not configured in POC mode. Set AUTH_ENABLED=true to enable Auth0.',
      400
    );
  } catch (error) {
    if (error instanceof AppError) {
      const { response, statusCode } = {
        response: {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        },
        statusCode: error.statusCode,
      };

      return new Response(JSON.stringify(response), {
        status: statusCode,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    console.error('Login error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'An unexpected error occurred during login',
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
