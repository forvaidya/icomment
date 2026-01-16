/**
 * POC Authentication Utilities for Guru Comment System
 * Handles POC mode user creation and validation
 * Feature-flagged with AUTH_ENABLED environment variable
 */

import type { User } from '../types/index';
import { createUser, getUserById } from './db';

/**
 * POC User Configuration
 * Hardcoded mahesh.local user for development/POC
 */
const POC_USER_ID = 'mahesh-local-id';
const POC_USER: User = {
  id: POC_USER_ID,
  username: 'mahesh',
  type: 'local',
  email: 'mahesh@local',
  is_admin: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

/**
 * Get the POC hardcoded user
 * @returns User object for POC mode
 */
export function getPOCUser(): User {
  return { ...POC_USER };
}

/**
 * Create or get the POC user in database
 * Ensures the hardcoded POC user exists in D1
 * @param db - D1 database binding
 * @returns Promise<User> - POC user from database
 */
export async function createOrGetPOCUser(db: D1Database): Promise<User> {
  try {
    // Try to get existing POC user
    const existingUser = await getUserById(db, POC_USER_ID);
    if (existingUser) {
      return existingUser;
    }

    // Create POC user if it doesn't exist
    const user = await createUser(db, POC_USER);
    return user;
  } catch (error) {
    console.error('Error creating/getting POC user:', error);
    // Return in-memory POC user as fallback
    return getPOCUser();
  }
}

/**
 * Check if running in POC mode
 * POC mode is when AUTH_ENABLED is not set or set to 'false'
 * @param env - Environment object containing AUTH_ENABLED flag
 * @returns boolean - true if in POC mode
 */
export function isPOCMode(env: any): boolean {
  return env.AUTH_ENABLED !== 'true';
}

/**
 * Validate POC mode and return authenticated user
 * Used in endpoints that require authentication in POC mode
 * @param env - Environment object
 * @returns User | null - POC user if in POC mode, null otherwise
 */
export function validatePOCMode(env: any): User | null {
  if (isPOCMode(env)) {
    return getPOCUser();
  }
  return null;
}
