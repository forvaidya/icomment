/**
 * Admin Update User Status Endpoint
 * PATCH /api/admin/users/:id
 *
 * Toggle admin status for a specific user
 * Auth: Admin only (check is_admin=true)
 * Body: { is_admin: boolean }
 *
 * Response: Updated user object
 * Errors: 403 if not admin, 401 if not authenticated, 404 if user not found
 */

import type { RequestContext } from '../../../../src/types/index';
import {
  getUserById,
  updateUserAdminStatus,
} from '../../../../src/lib/db';
import { createSuccessResponse, AppError, ErrorCode } from '../../../../src/lib/errors';

/**
 * Update user admin status endpoint handler (admin only)
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

    // Get user ID from URL params
    const url = new URL(context.request.url);
    const pathParts = url.pathname.split('/');
    const userId = pathParts[pathParts.length - 1];

    if (!userId || userId === '[id]') {
      throw new AppError(
        ErrorCode.BAD_REQUEST,
        'User ID is required',
        400
      );
    }

    // Check if only PATCH method is allowed
    if (context.request.method !== 'PATCH') {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: ErrorCode.BAD_REQUEST,
            message: 'Method not allowed. Use PATCH.',
          },
        }),
        {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            Allow: 'PATCH',
          },
        }
      );
    }

    // Parse request body
    let body: any;
    try {
      const bodyText = await context.request.text();
      body = JSON.parse(bodyText);
    } catch (error) {
      throw new AppError(
        ErrorCode.BAD_REQUEST,
        'Invalid JSON in request body',
        400
      );
    }

    // Validate is_admin field
    if (typeof body.is_admin !== 'boolean') {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'is_admin must be a boolean',
        400,
        [{ field: 'is_admin', message: 'Expected boolean value' }]
      );
    }

    // Get existing user
    const existingUser = await getUserById(context.env.db, userId);
    if (!existingUser) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        `User not found: ${userId}`,
        404
      );
    }

    // Update user admin status
    const updatedUser = await updateUserAdminStatus(
      context.env.db,
      userId,
      body.is_admin
    );

    // Return updated user
    const response = {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      type: updatedUser.type,
      is_admin: updatedUser.is_admin,
      created_at: updatedUser.created_at,
      updated_at: updatedUser.updated_at,
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

    console.error('Error updating user:', error);
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
