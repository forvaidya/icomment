/**
 * User Information Endpoint
 * GET /api/user
 *
 * Returns current authenticated user information
 * Auth: Required (must have valid session)
 *
 * Response: { id, username, type, is_admin, created_at }
 * Errors: 401 if not authenticated
 */

import type { RequestContext, User } from '../../src/types/index';
import { createSuccessResponse, AppError, ErrorCode } from '../../src/lib/errors';

/**
 * Get current user endpoint handler
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
    // Get request context (set by middleware)
    const requestContext = (context as any).context as RequestContext;

    // Check if user is authenticated
    if (!requestContext.isAuthenticated || !requestContext.user) {
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        'Authentication required',
        401
      );
    }

    // Return user information
    const user = requestContext.user;
    const response = {
      id: user.id,
      username: user.username,
      type: user.type,
      is_admin: user.is_admin,
      created_at: user.created_at,
    };

    return new Response(JSON.stringify(createSuccessResponse(response)), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
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

    console.error('Error fetching user:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'An unexpected error occurred',
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
