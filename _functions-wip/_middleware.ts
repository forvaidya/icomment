/**
 * Global middleware for request processing
 * Runs before all route handlers
 *
 * Responsibilities:
 * - Extract and validate session from cookies
 * - Attach user context to request if authenticated
 * - Handle POC mode (AUTH_ENABLED=false) with hardcoded user
 * - Add user information to request context
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

const POC_USER: User = {
  id: 'mahesh.local',
  username: 'mahesh',
  type: 'local',
  email: 'mahesh@local',
  is_admin: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

declare global {
  interface EventContext<E, P, D> {
    context: RequestContext;
  }
}

/**
 * Extract session ID from cookie header
 */
function extractSessionIdFromCookies(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/session_id=([^;]+)/);
  return match ? match[1] : null;
}

/**
 * Handle request preprocessing
 * Attaches user context and session information
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
): Promise<Response | void> {
  const { request, env } = context;
  const authEnabled = env.AUTH_ENABLED !== 'false';

  // Initialize request context
  const requestContext: RequestContext = {
    isAuthenticated: false,
  };

  // POC Mode: Return hardcoded user if AUTH_ENABLED=false
  if (!authEnabled) {
    requestContext.user = POC_USER;
    requestContext.userId = POC_USER.id;
    requestContext.isAuthenticated = true;
    (context as any).context = requestContext;
    return undefined; // Continue to next handler
  }

  // Production Mode: Validate session from cookies
  const cookieHeader = request.headers.get('cookie');
  const sessionId = extractSessionIdFromCookies(cookieHeader);

  if (sessionId) {
    try {
      const sessionData = await env.kv.get(`session:${sessionId}`);
      if (sessionData) {
        const session = JSON.parse(sessionData);
        const userId = session.user_id;
        if (userId) {
          // For now, return user object with basic info
          // In production, fetch full user from D1
          requestContext.user = {
            id: userId,
            username: userId.split('.')[0] || userId,
            type: 'auth0',
            email: userId,
            is_admin: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          requestContext.userId = userId;
          requestContext.isAuthenticated = true;
          requestContext.sessionId = sessionId;
        }
      }
    } catch (error) {
      console.error('Error validating session:', error);
      // Continue without user (unauthenticated request)
    }
  }

  // Attach context to request for use in handlers
  (context as any).context = requestContext;

  // Continue to next handler
  return undefined;
}
