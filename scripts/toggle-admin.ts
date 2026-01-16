#!/usr/bin/env bun

/**
 * CLI Script: Toggle User Admin Status
 * Usage: bun scripts/toggle-admin.ts --user-id <uuid> --admin true/false
 *
 * Examples:
 * bun scripts/toggle-admin.ts --user-id mahesh-local-id --admin true
 * bun scripts/toggle-admin.ts --user-id user-123 --admin false
 *
 * Output:
 * User admin status updated: mahesh (mahesh-local-id) -> true
 */

/**
 * Parse command line arguments
 */
function parseArgs(): { userId?: string; admin?: boolean } {
  const args = process.argv.slice(2);
  const result: { userId?: string; admin?: boolean } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--user-id' && i + 1 < args.length) {
      result.userId = args[i + 1];
      i++;
    } else if (args[i] === '--admin' && i + 1 < args.length) {
      const value = args[i + 1].toLowerCase();
      result.admin = value === 'true' || value === '1' || value === 'yes';
      i++;
    }
  }

  return result;
}

/**
 * Main function to toggle user admin status
 */
async function toggleAdmin(): Promise<void> {
  try {
    const { userId, admin } = parseArgs();

    // Validate arguments
    if (!userId) {
      console.error('Error: --user-id argument is required');
      console.error('Usage: bun scripts/toggle-admin.ts --user-id <uuid> --admin true/false');
      process.exit(1);
    }

    if (admin === undefined) {
      console.error('Error: --admin argument is required (true or false)');
      console.error('Usage: bun scripts/toggle-admin.ts --user-id <uuid> --admin true/false');
      process.exit(1);
    }

    // Note: In a real scenario, we would connect to the database and update the user
    // For now, this shows the expected output and placeholder implementation

    console.log('Guru - Toggle User Admin Status');
    console.log('==============================\n');

    console.log(`User ID: ${userId}`);
    console.log(`Admin Status: ${admin ? 'yes' : 'no'}`);

    console.log('\nNote: To use this script with a real database, you need to:');
    console.log('1. Set up your D1 database with the migration');
    console.log('2. Configure the database binding in wrangler.toml');
    console.log('3. Run: bun scripts/toggle-admin.ts --user-id <uuid> --admin true/false');

    console.log('\nExample output:');
    console.log(`User admin status updated: mahesh (${userId}) -> ${admin}`);
  } catch (error) {
    console.error('Error toggling admin status:', error);
    process.exit(1);
  }
}

// Run the script
await toggleAdmin();
