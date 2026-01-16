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

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// Error codes
enum ErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// Database helper functions
async function getAllUsers(db: D1Database, limit: number = 50, offset: number = 0): Promise<PaginatedResponse<User>> {
  const countResult = await db.prepare('SELECT COUNT(*) as total FROM users').first<{ total: number }>();
  const total = countResult?.total || 0;

  const results = await db
    .prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .bind(limit, offset)
    .all<any>();

  const users = (results.results || []).map((row: any) => ({
    id: row.id,
    username: row.username,
    type: row.type,
    email: row.email || undefined,
    is_admin: row.is_admin === 1 || row.is_admin === true,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  return {
    items: users,
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
  };
}

// Response helper
function createSuccessResponse(data: any) {
  return {
    success: true,
    data,
  };
}

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
    console.error('Error fetching users:', error);
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
