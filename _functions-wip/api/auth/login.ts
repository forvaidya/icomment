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

const POC_USER = {
  id: 'mahesh.local',
  username: 'mahesh',
  type: 'local' as const,
  email: 'mahesh@local',
  is_admin: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

/**
 * Create session in KV
 */
async function createSession(kv: KVNamespace, userId: string): Promise<{ sessionId: string; expiresAt: number }> {
  const sessionId = crypto.randomUUID();
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

  const session = {
    user_id: userId,
    created_at: Date.now(),
    expires_at: expiresAt,
  };

  await kv.put(`session:${sessionId}`, JSON.stringify(session), {
    expirationTtl: 7 * 24 * 60 * 60,
  });

  return { sessionId, expiresAt };
}

/**
 * Create session cookie header
 */
function createSessionCookie(sessionId: string, expiresAt: number): string {
  const expiresAtDate = new Date(expiresAt).toUTCString();
  return `session_id=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=${expiresAtDate}`;
}

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
  const { env } = context;

  try {
    // POC Mode: Return hardcoded session for mahesh.local
    if (env.AUTH_ENABLED !== 'true') {
      // Create session for POC user
      const { sessionId, expiresAt } = await createSession(env.kv, POC_USER.id);

      // Create session cookie
      const sessionCookie = createSessionCookie(sessionId, expiresAt);

      // Return success response with session info
      const response = {
        success: true,
        data: {
          sessionId,
          expiresAt: new Date(expiresAt).toISOString(),
          user: {
            id: POC_USER.id,
            username: POC_USER.username,
            type: POC_USER.type,
            is_admin: POC_USER.is_admin,
          },
        },
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': sessionCookie,
        },
      });
    }

    // Production Mode: Redirect to Auth0 (not implemented in POC)
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Auth0 login not configured in POC mode. Set AUTH_ENABLED=true to enable Auth0.',
        },
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred during login',
        },
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
