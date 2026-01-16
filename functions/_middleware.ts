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

import {
  extractSessionIdFromCookies,
  getSessionUserId,
} from '../src/lib/session';
import type { RequestContext, User } from '../src/types/index';

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
): Promise<Response | undefined> {
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
      const userId = await getSessionUserId(env.kv, sessionId);

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
