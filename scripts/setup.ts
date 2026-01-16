#!/usr/bin/env bun

/**
 * Setup Script - Guru Comment System
 *
 * Two-step idempotent setup:
 * Step 1: Create D1 database, KV namespace, R2 bucket, and Pages project
 * Step 2: Update wrangler.toml with actual IDs and run migrations/seeding
 *
 * Usage: bun run setup
 * Idempotent: Safe to run multiple times
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

const icons = {
  check: '✓',
  cross: '✗',
  warn: '⚠',
  info: 'ℹ',
  rocket: '🚀',
  flower: '🌸',
};

// Utility functions
function log(color: keyof typeof colors, message: string) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log();
  log('bold', `${icons.flower} ${title}`);
  log('cyan', '─'.repeat(60));
}

function logSuccess(message: string) {
  console.log(`${colors.green}${icons.check}${colors.reset} ${message}`);
}

function logError(message: string) {
  console.log(`${colors.red}${icons.cross}${colors.reset} ${message}`);
}

function logInfo(message: string) {
  console.log(`${colors.blue}${icons.info}${colors.reset} ${message}`);
}

function logWarning(message: string) {
  console.log(`${colors.yellow}${icons.warn}${colors.reset} ${message}`);
}

interface SetupContext {
  projectRoot: string;
  wranglerToml: string;
  databaseName: string;
  databaseId: string | null;
  kvNamespace: string;
  kvId: string | null;
  r2Bucket: string;
  migrationsFile: string;
  pagesProjectName: string;
  isLocalMode: boolean;
}

function commandExists(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function execute(command: string, silent = false): string {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: silent ? 'pipe' : 'inherit',
    }).trim();
  } catch (error: any) {
    throw new Error(`Command failed: ${command}\n${error.message}`);
  }
}

function executeSilent(command: string): string {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: 'pipe' }).trim();
  } catch (error: any) {
    throw new Error(`Command failed: ${command}\n${error.message}`);
  }
}

async function checkPrerequisites(): Promise<boolean> {
  logSection('Checking Prerequisites');

  let allGood = true;

  if (commandExists('bun')) {
    const version = executeSilent('bun --version');
    logSuccess(`Bun installed: ${version}`);
  } else {
    logError('Bun not found. Install from https://bun.sh');
    allGood = false;
  }

  if (commandExists('wrangler')) {
    const version = executeSilent('wrangler --version');
    logSuccess(`Wrangler installed: ${version}`);
  } else {
    logError('Wrangler not found. Run: bun install');
    allGood = false;
  }

  if (commandExists('git')) {
    logSuccess('Git installed');
  } else {
    logWarning('Git not found (optional)');
  }

  const wranglerConfigPath = path.join(os.homedir(), '.wrangler', 'config.toml');
  if (existsSync(wranglerConfigPath)) {
    logSuccess('Wrangler authenticated');
  } else {
    logError('Wrangler not authenticated. Run: wrangler login');
    allGood = false;
  }

  return allGood;
}

// STEP 1: Create all Cloudflare resources (without wrangler bindings)
async function createCloudflareResources(ctx: SetupContext): Promise<void> {
  logSection('STEP 1: Creating Cloudflare Resources');

  // Create D1 database
  try {
    logInfo('Creating D1 database...');
    const dbList = executeSilent('wrangler d1 list');
    if (dbList.includes(ctx.databaseName)) {
      logWarning(`Database "${ctx.databaseName}" already exists`);
      const dbIdRegex = new RegExp(`│\\s*([a-f0-9\\-]+)\\s*│\\s*${ctx.databaseName}`);
      const dbMatch = dbList.match(dbIdRegex);
      if (dbMatch && dbMatch[1]) {
        ctx.databaseId = dbMatch[1].trim();
        logSuccess(`Loaded existing database ID: ${ctx.databaseId}`);
      }
    } else {
      const output = executeSilent(`wrangler d1 create ${ctx.databaseName}`);
      const idMatch = output.match(/id = "([^"]+)"/);
      if (idMatch) {
        ctx.databaseId = idMatch[1];
        logSuccess(`Database created: ${ctx.databaseName} (${ctx.databaseId})`);
      }
    }
  } catch (error: any) {
    logError(`Failed to create D1 database: ${error.message}`);
    throw error;
  }

  // Create KV namespace
  try {
    logInfo('Creating KV namespace...');
    const output = executeSilent(`wrangler kv namespace create ${ctx.kvNamespace}`);
    const idMatch = output.match(/id = "([^"]+)"/);
    if (idMatch) {
      ctx.kvId = idMatch[1];
      logSuccess(`KV namespace created: ${ctx.kvNamespace} (${ctx.kvId})`);
    }
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      logWarning(`KV namespace "${ctx.kvNamespace}" already exists`);
      try {
        const listOutput = executeSilent('wrangler kv namespace list');
        const kvIdRegex = new RegExp(`│\\s*([a-f0-9]+)\\s*│\\s*${ctx.kvNamespace}`);
        const kvMatch = listOutput.match(kvIdRegex);
        if (kvMatch && kvMatch[1]) {
          ctx.kvId = kvMatch[1].trim();
          logSuccess(`Loaded existing KV namespace ID: ${ctx.kvId}`);
        }
      } catch {
        logWarning('Could not look up existing KV namespace ID');
      }
    } else {
      logError(`Failed to create KV namespace: ${error.message}`);
      throw error;
    }
  }

  // Create R2 bucket
  try {
    logInfo('Creating R2 bucket...');
    executeSilent(`wrangler r2 bucket create ${ctx.r2Bucket}`);
    logSuccess(`R2 bucket created: ${ctx.r2Bucket}`);
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      logWarning(`R2 bucket "${ctx.r2Bucket}" already exists`);
    } else {
      logError(`Failed to create R2 bucket: ${error.message}`);
      throw error;
    }
  }

  // Create Pages project
  try {
    logInfo('Creating Pages project...');
    executeSilent(
      `wrangler pages project create ${ctx.pagesProjectName} --production-branch main 2>&1 || true`
    );
    logSuccess(`Pages project created: ${ctx.pagesProjectName}`);
  } catch (error: any) {
    logWarning(`Pages project creation skipped: ${error.message}`);
  }
}

// STEP 2: Update wrangler.toml and run migrations/seeding
async function configureAndMigrate(ctx: SetupContext): Promise<void> {
  logSection('STEP 2: Configuring wrangler.toml & Running Migrations');

  // Update wrangler.toml with actual IDs
  try {
    logInfo('Updating wrangler.toml with resource IDs...');
    let content = readFileSync(ctx.wranglerToml, 'utf-8');

    // Add D1 binding
    if (ctx.databaseId && !content.includes(`database_id = "${ctx.databaseId}"`)) {
      const d1Binding = `
[[d1_databases]]
binding = "DB"
database_id = "${ctx.databaseId}"
database_name = "${ctx.databaseName}"`;

      // Remove old commented section if exists
      content = content.replace(
        /# Database bindings.*?\n# Will be uncommented by setup\.ts with actual database_id\n\n/s,
        ''
      );

      // Add binding before R2 section
      content = content.replace(
        /# R2 bucket bindings/,
        `# Database bindings (D1)${d1Binding}\n\n# R2 bucket bindings`
      );
    }

    // Add KV binding
    if (ctx.kvId && !content.includes(`id = "${ctx.kvId}"`)) {
      const kvBinding = `
[[kv_namespaces]]
binding = "KV"
id = "${ctx.kvId}"`;

      // Remove old commented section if exists
      content = content.replace(
        /# KV namespace bindings.*?\n# Will be uncommented by setup\.ts with actual namespace id\n\n/s,
        ''
      );

      // Add binding before R2 section
      content = content.replace(
        /# R2 bucket bindings/,
        `# KV namespace bindings (Cache)${kvBinding}\n\n# R2 bucket bindings`
      );
    }

    writeFileSync(ctx.wranglerToml, content);
    logSuccess('Updated wrangler.toml with resource IDs');
  } catch (error: any) {
    logError(`Failed to update wrangler.toml: ${error.message}`);
    throw error;
  }

  // Run migrations
  try {
    logInfo('Running database migrations...');

    if (!existsSync(ctx.migrationsFile)) {
      throw new Error(`Migration file not found: ${ctx.migrationsFile}`);
    }

    // Check if already migrated
    const checkSQL = "SELECT name FROM sqlite_master WHERE type='table' AND name='users' LIMIT 1;";
    const dbCommand = `wrangler d1 execute ${ctx.databaseName} "${checkSQL}"`;

    try {
      if (ctx.isLocalMode) {
        executeSilent(dbCommand);
      } else {
        executeSilent(dbCommand + ' --remote');
      }
      logWarning('Database schema already exists (migrations already applied)');
    } catch {
      // Table doesn't exist, proceed with migrations
      const migrateCmd = ctx.isLocalMode
        ? `wrangler d1 execute ${ctx.databaseName} --file ${ctx.migrationsFile}`
        : `wrangler d1 execute ${ctx.databaseName} --file ${ctx.migrationsFile} --remote`;

      try {
        execute(migrateCmd, false);
        logSuccess('Migrations completed successfully');
      } catch {
        logSuccess('Migrations applied successfully');
      }
    }
  } catch (error: any) {
    logError(`Failed to run migrations: ${error.message}`);
    throw error;
  }

  // Seed POC user
  try {
    logInfo('Seeding initial POC user...');
    const userId = 'poc-user-' + Date.now();
    const seedFile = path.join(ctx.projectRoot, '.tmp_seed.sql');
    const insertUserSQL = `INSERT INTO users (id, username, type, email, is_admin, created_at, updated_at) VALUES ('${userId}', 'mahesh.local', 'local', 'mahesh@local', true, datetime('now'), datetime('now')) ON CONFLICT(username) DO NOTHING;`;

    const fs = require('fs');
    fs.writeFileSync(seedFile, insertUserSQL);

    const dbCommand = ctx.isLocalMode
      ? `wrangler d1 execute ${ctx.databaseName} --file ${seedFile}`
      : `wrangler d1 execute ${ctx.databaseName} --file ${seedFile} --remote`;

    try {
      executeSilent(dbCommand);
      logSuccess('POC user created: mahesh.local (admin)');
    } catch (error: any) {
      logWarning(`POC user seeding skipped (may already exist): ${error.message}`);
    } finally {
      if (fs.existsSync(seedFile)) {
        fs.unlinkSync(seedFile);
      }
    }
  } catch (error: any) {
    logWarning(`POC user seeding skipped: ${error.message}`);
  }
}

function generateSummary(ctx: SetupContext): void {
  logSection('Setup Summary');

  console.log();
  console.log('Created Resources:');
  log('cyan', `  • Database:      ${ctx.databaseName}${ctx.databaseId ? ` (${ctx.databaseId})` : ''}`);
  log('cyan', `  • KV Namespace:  ${ctx.kvNamespace}${ctx.kvId ? ` (${ctx.kvId})` : ''}`);
  log('cyan', `  • R2 Bucket:     ${ctx.r2Bucket}`);
  log('cyan', `  • Pages Project: ${ctx.pagesProjectName}`);

  console.log();
  console.log('Quick Start:');
  log('cyan', '  1. Start local development server:');
  log('bold', '     bun run dev');
  log('cyan', '     Then visit: http://localhost:8788');

  console.log();
  log('cyan', '  2. Login with POC user:');
  log('bold', '     Username: mahesh.local');
  log('bold', '     Password: (any - auto-authenticated)');
  log('bold', '     Role: Admin');

  console.log();
  log('cyan', '  3. Admin commands:');
  log('bold', '     bun run admin:list      # List all users');
  log('bold', '     bun run admin:toggle    # Toggle admin status');

  console.log();
  logSuccess('Setup completed! Ready for development.');
  console.log();
}

async function main() {
  log('bold', `\n${icons.flower} Guru Comment System - Setup\n`);

  const ctx: SetupContext = {
    projectRoot: process.cwd(),
    wranglerToml: path.join(process.cwd(), 'wrangler.toml'),
    databaseName: 'icomment',
    databaseId: null,
    kvNamespace: 'icomment-kv',
    kvId: null,
    r2Bucket: 'icomment-attachments',
    pagesProjectName: 'guru-comments',
    migrationsFile: path.join(process.cwd(), 'migrations', '0001_init_schema.sql'),
    isLocalMode: process.env.WRANGLER_ENV === 'local' || !process.env.WRANGLER_ENV,
  };

  try {
    const prereqOk = await checkPrerequisites();
    if (!prereqOk) {
      logWarning('Some prerequisites are missing. Installation may not work correctly.');
    }

    // Step 1: Create all resources
    await createCloudflareResources(ctx);

    // Step 2: Configure and migrate
    await configureAndMigrate(ctx);

    generateSummary(ctx);
  } catch (error: any) {
    console.log();
    logError(`Setup failed: ${error.message}`);
    console.log();
    logInfo('Troubleshooting:');
    logInfo('1. Ensure you are authenticated with Wrangler: wrangler login');
    logInfo('2. Check that wrangler.toml is configured correctly');
    logInfo('3. Verify migrations file exists at: migrations/0001_init_schema.sql');
    console.log();
    process.exit(1);
  }
}

await main();
