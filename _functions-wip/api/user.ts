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

interface User {
  id: string;
  username: string;
  type: 'local' | 'auth0';
  email: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

interface RequestContext {
  isAuthenticated: boolean;
  user?: User;
  userId?: string;
  sessionId?: string;
}

interface Env {
  db: D1Database;
  kv: KVNamespace;
}

/**
 * Get current user endpoint handler
 */
export async function onRequest(
  context: EventContext<Env, string, unknown>
): Promise<Response> {
  try {
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
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Return user information
    const user = requestContext.user;
    const response = {
      success: true,
      data: {
        id: user.id,
        username: user.username,
        type: user.type,
        is_admin: user.is_admin,
        created_at: user.created_at,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching user:', error);
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
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
