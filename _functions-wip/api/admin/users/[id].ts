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

// Type definitions
interface RequestContext {
  isAuthenticated: boolean;
  user?: any;
  userId?: string;
  sessionId?: string;
}

interface User {
  id: string;
  username: string;
  type: string;
  email?: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

// Error codes
enum ErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  BAD_REQUEST = 'BAD_REQUEST',
  NOT_FOUND = 'NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// Database helper functions
async function getUserById(db: D1Database, id: string): Promise<User | null> {
  const result = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<any>();
  if (!result) return null;
  return {
    id: result.id,
    username: result.username,
    type: result.type,
    email: result.email || undefined,
    is_admin: result.is_admin === 1 || result.is_admin === true,
    created_at: result.created_at,
    updated_at: result.updated_at,
  };
}

async function updateUserAdminStatus(db: D1Database, id: string, isAdmin: boolean): Promise<User> {
  await db.prepare('UPDATE users SET is_admin = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(isAdmin ? 1 : 0, id)
    .run();

  const user = await getUserById(db, id);
  if (!user) throw new Error(`User not found: ${id}`);
  return user;
}

// Response helper
function createSuccessResponse(data: any) {
  return {
    success: true,
    data,
  };
}

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
  // Get request context (set by middleware)
  const requestContext = (context as any).context as RequestContext;

  // Check if user is authenticated
  if (!requestContext.isAuthenticated || !requestContext.user) {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check if user is admin
  if (!requestContext.user.is_admin) {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required',
        },
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check if only PATCH method is allowed
  if (context.request.method !== 'PATCH') {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'BAD_REQUEST',
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

  // Get user ID from URL params
  const url = new URL(context.request.url);
  const pathParts = url.pathname.split('/');
  const userId = pathParts[pathParts.length - 1];

  if (!userId || userId === '[id]') {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'User ID is required',
        },
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Parse request body
    let body: any;
    try {
      const bodyText = await context.request.text();
      body = JSON.parse(bodyText);
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'Invalid JSON in request body',
          },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate is_admin field
    if (typeof body.is_admin !== 'boolean') {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'is_admin must be a boolean',
          },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get existing user
    const existingUser = await getUserById(context.env.db, userId);
    if (!existingUser) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `User not found: ${userId}`,
          },
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
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
    console.error('Error updating user:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
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
