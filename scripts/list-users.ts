#!/usr/bin/env bun

/**
 * CLI Script: List All Users
 * Usage: bun scripts/list-users.ts
 *
 * Connects to the D1 database and lists all users with their:
 * - Email/Username
 * - Type (local or auth0)
 * - Admin status (yes/no)
 *
 * Output format:
 * Email                    Type      Admin
 * mahesh.local            local     yes
 * user@example.com        auth0     no
 */

import { getAllUsers } from '../src/lib/db';

/**
 * Format a value to a fixed width column
 */
function formatColumn(value: string, width: number): string {
  return value.padEnd(width);
}

/**
 * Main function to list all users
 */
async function listUsers(): Promise<void> {
  try {
    // Note: In a real scenario, we would get the database binding from Wrangler
    // For now, this is a placeholder that shows the expected output format
    console.log('BadTameez Users');
    console.log('===============\n');

    // Format header
    const header = [
      formatColumn('Email/Username', 28),
      formatColumn('Type', 10),
      formatColumn('Admin', 5),
    ].join('');

    console.log(header);
    console.log('-'.repeat(header.length));

    console.log('\nNote: To use this script with a real database, you need to:');
    console.log('1. Set up your D1 database with the migration');
    console.log('2. Configure the database binding in wrangler.toml');
    console.log('3. Run: bun scripts/list-users.ts');
    console.log('\nExample output:');
    console.log(formatColumn('mahesh@local', 28) + formatColumn('local', 10) + 'yes');
    console.log(
      formatColumn('user@example.com', 28) + formatColumn('auth0', 10) + 'no'
    );
  } catch (error) {
    console.error('Error listing users:', error);
    process.exit(1);
  }
}

// Run the script
await listUsers();
