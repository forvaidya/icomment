/**
 * Admin Users List Endpoint
 * GET /api/admin/users
 *
 * Returns list of all users with pagination
 * Auth: Admin only (check is_admin=true)
 * Query: ?limit=50&offset=0
 *
 * Response: { users: [...], total, has_more }
 * Errors: 403 if not admin, 401 if not authenticated
 */

import type { RequestContext } from '../../../src/types/index';
import { getAllUsers } from '../../../src/lib/db';
import { createSuccessResponse, AppError, ErrorCode } from '../../../src/lib/errors';

/**
 * Get all users endpoint handler (admin only)
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

    // Check if user is admin
    if (!requestContext.user.is_admin) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'Admin access required',
        403
      );
    }

    // Parse query parameters
    const url = new URL(context.request.url);
    const limit = Math.min(
      parseInt(url.searchParams.get('limit') || '50', 10),
      100
    );
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);

    // Get users from database
    const paginatedUsers = await getAllUsers(context.env.db, limit, offset);

    // Map users to response format
    const response = {
      users: paginatedUsers.items.map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        type: user.type,
        is_admin: user.is_admin,
        created_at: user.created_at,
      })),
      total: paginatedUsers.total,
      limit: paginatedUsers.limit,
      offset: paginatedUsers.offset,
      has_more: paginatedUsers.hasMore,
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

    console.error('Error fetching users:', error);
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
