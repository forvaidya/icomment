/**
 * Database Query Helpers for BadTameez Comment System
 * Provides typed query helpers for D1 database operations
 * All queries use parameterized statements to prevent SQL injection
 */

import type { User, PaginatedResponse } from '../types/index';

/**
 * Initialize or ensure user exists in database
 * @param db - D1 database binding
 * @param user - User object to initialize
 * @returns Promise<void>
 */
export async function initUser(db: D1Database, user: User): Promise<void> {
  const { id, username, type, email, is_admin, created_at } = user;

  await db
    .prepare(
      `
      INSERT OR REPLACE INTO users (id, username, type, email, is_admin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `
    )
    .bind(id, username, type, email || null, is_admin ? 1 : 0, created_at)
    .run();
}

/**
 * Get user by ID
 * @param db - D1 database binding
 * @param id - User ID
 * @returns Promise<User | null>
 */
export async function getUserById(
  db: D1Database,
  id: string
): Promise<User | null> {
  const result = await db
    .prepare('SELECT * FROM users WHERE id = ?')
    .bind(id)
    .first<any>();

  if (!result) {
    return null;
  }

  return mapRowToUser(result);
}

/**
 * Get user by username
 * @param db - D1 database binding
 * @param username - Username to search for
 * @returns Promise<User | null>
 */
export async function getUserByUsername(
  db: D1Database,
  username: string
): Promise<User | null> {
  const result = await db
    .prepare('SELECT * FROM users WHERE username = ?')
    .bind(username)
    .first<any>();

  if (!result) {
    return null;
  }

  return mapRowToUser(result);
}

/**
 * Get all users with pagination
 * @param db - D1 database binding
 * @param limit - Number of users to return
 * @param offset - Offset for pagination
 * @returns Promise<PaginatedResponse<User>>
 */
export async function getAllUsers(
  db: D1Database,
  limit: number = 50,
  offset: number = 0
): Promise<PaginatedResponse<User>> {
  // Get total count
  const countResult = await db
    .prepare('SELECT COUNT(*) as total FROM users')
    .first<{ total: number }>();

  const total = countResult?.total || 0;

  // Get paginated users
  const results = await db
    .prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .bind(limit, offset)
    .all<any>();

  const users = (results.results || []).map(mapRowToUser);

  return {
    items: users,
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
  };
}

/**
 * Update user admin status
 * @param db - D1 database binding
 * @param id - User ID
 * @param isAdmin - New admin status
 * @returns Promise<User> - Updated user object
 */
export async function updateUserAdminStatus(
  db: D1Database,
  id: string,
  isAdmin: boolean
): Promise<User> {
  await db
    .prepare(
      'UPDATE users SET is_admin = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    )
    .bind(isAdmin ? 1 : 0, id)
    .run();

  const user = await getUserById(db, id);
  if (!user) {
    throw new Error(`User not found: ${id}`);
  }

  return user;
}

/**
 * Get user by Auth0 subject (sub) claim
 * @param db - D1 database binding
 * @param auth0Sub - Auth0 subject claim
 * @returns Promise<User | null>
 */
export async function getUserByAuth0Sub(
  db: D1Database,
  auth0Sub: string
): Promise<User | null> {
  const result = await db
    .prepare('SELECT * FROM users WHERE auth0_sub = ?')
    .bind(auth0Sub)
    .first<any>();

  if (!result) {
    return null;
  }

  return mapRowToUser(result);
}

/**
 * Create a new user
 * @param db - D1 database binding
 * @param user - User object to create
 * @returns Promise<User> - Created user
 */
export async function createUser(db: D1Database, user: User): Promise<User> {
  const { id, username, type, email, auth0_sub, is_admin, created_at } = user;

  await db
    .prepare(
      `
      INSERT INTO users (id, username, type, email, auth0_sub, is_admin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `
    )
    .bind(
      id,
      username,
      type,
      email || null,
      auth0_sub || null,
      is_admin ? 1 : 0,
      created_at
    )
    .run();

  return user;
}

/**
 * Delete a user (hard delete)
 * @param db - D1 database binding
 * @param id - User ID
 * @returns Promise<boolean> - true if successful
 */
export async function deleteUser(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM users WHERE id = ?')
    .bind(id)
    .run();

  return result.success;
}

/**
 * Map database row to User object
 * @param row - Database row
 * @returns User object
 */
function mapRowToUser(row: any): User {
  return {
    id: row.id,
    username: row.username,
    type: row.type,
    email: row.email || undefined,
    is_admin: row.is_admin === 1 || row.is_admin === true,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
