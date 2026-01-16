/**
 * Session management utilities using Cloudflare KV Store
 * Handles session creation, retrieval, and deletion
 */

import { User } from '../types/index';

const SESSION_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
const SESSION_PREFIX = 'session:';

/**
 * Generate a random session ID
 * Uses crypto.getRandomValues for secure random generation
 * @returns Random session ID string
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const randomStr = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 16);

  return `${timestamp}-${randomStr}`;
}

/**
 * Create a new session for a user
 * @param kv - KV namespace
 * @param userId - User ID to create session for
 * @returns Promise with sessionId and expiresAt timestamp
 */
export async function createSession(
  kv: KVNamespace,
  userId: string
): Promise<{ sessionId: string; expiresAt: number }> {
  const sessionId = generateSessionId();
  const expiresAt = Date.now() + SESSION_TTL * 1000;
  const key = `${SESSION_PREFIX}${sessionId}`;

  await kv.put(key, userId, {
    expirationTtl: SESSION_TTL,
  });

  return {
    sessionId,
    expiresAt,
  };
}

/**
 * Get a session and retrieve the user ID
 * @param kv - KV namespace
 * @param sessionId - Session ID to retrieve
 * @returns Promise with user ID or null if session not found
 */
export async function getSessionUserId(
  kv: KVNamespace,
  sessionId: string
): Promise<string | null> {
  const key = `${SESSION_PREFIX}${sessionId}`;

  try {
    const userId = await kv.get<string>(key);
    return userId || null;
  } catch (error) {
    console.error('Error retrieving session:', error);
    return null;
  }
}

/**
 * Delete a session
 * @param kv - KV namespace
 * @param sessionId - Session ID to delete
 * @returns Promise<boolean> - true if deletion successful, false otherwise
 */
export async function deleteSession(
  kv: KVNamespace,
  sessionId: string
): Promise<boolean> {
  const key = `${SESSION_PREFIX}${sessionId}`;

  try {
    await kv.delete(key);
    return true;
  } catch (error) {
    console.error('Error deleting session:', error);
    return false;
  }
}

/**
 * Validate session and return user if valid
 * @param kv - KV namespace
 * @param sessionId - Session ID to validate
 * @param getUserFn - Function to get user by ID
 * @returns Promise with User object or null if session invalid
 */
export async function validateSession(
  kv: KVNamespace,
  sessionId: string,
  getUserFn: (userId: string) => Promise<User | null>
): Promise<User | null> {
  const userId = await getSessionUserId(kv, sessionId);

  if (!userId) {
    return null;
  }

  try {
    const user = await getUserFn(userId);
    return user;
  } catch (error) {
    console.error('Error getting user from session:', error);
    return null;
  }
}

/**
 * Extract session ID from cookies
 * @param cookieHeader - Cookie header value
 * @returns Session ID or null if not found
 */
export function extractSessionIdFromCookies(
  cookieHeader?: string
): string | null {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'session_id' && value) {
      return decodeURIComponent(value);
    }
  }

  return null;
}

/**
 * Create session cookie value
 * @param sessionId - Session ID
 * @param expiresAt - Expiration timestamp
 * @returns Cookie string for Set-Cookie header
 */
export function createSessionCookie(
  sessionId: string,
  expiresAt: number
): string {
  const expiresDate = new Date(expiresAt).toUTCString();

  return `session_id=${encodeURIComponent(sessionId)}; Path=/; Expires=${expiresDate}; HttpOnly; Secure; SameSite=Strict`;
}

/**
 * Create logout cookie (empty session)
 * @returns Cookie string to clear session
 */
export function createLogoutCookie(): string {
  const pastDate = new Date(0).toUTCString();
  return `session_id=; Path=/; Expires=${pastDate}; HttpOnly; Secure; SameSite=Strict`;
}
