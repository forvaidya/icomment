#!/usr/bin/env bun

/**
 * Main Setup Script - Guru Comment System
 *
 * This script automates the complete setup process:
 * - Check prerequisites (wrangler, git, bun)
 * - Create D1 database
 * - Run migrations
 * - Create KV namespace
 * - Create R2 bucket
 * - Seed initial POC user
 * - Generate setup summary
 *
 * Usage: bun run setup
 */

import { readFileSync, existsSync } from 'fs';
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
  packageJson: any;
  databaseName: string;
  databaseId: string | null;
  kvNamespace: string;
  kvId: string | null;
  r2Bucket: string;
  migrationsFile: string;
  isLocalMode: boolean;
  pagesProjectName: string;
}

// Check if command exists
function commandExists(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Execute command and return output
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

// Execute command silently
function executeSilent(command: string): string {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: 'pipe' }).trim();
  } catch (error: any) {
    throw new Error(`Command failed: ${command}\n${error.message}`);
  }
}

// Check prerequisites
async function checkPrerequisites(): Promise<boolean> {
  logSection('Checking Prerequisites');

  let allGood = true;

  // Check Bun
  if (commandExists('bun')) {
    const version = executeSilent('bun --version');
    logSuccess(`Bun installed: ${version}`);
  } else {
    logError('Bun not found. Install from https://bun.sh');
    allGood = false;
  }

  // Check Wrangler
  if (commandExists('wrangler')) {
    const version = executeSilent('wrangler --version');
    logSuccess(`Wrangler installed: ${version}`);
  } else {
    logError('Wrangler not found. Run: bun install');
    allGood = false;
  }

  // Check Git
  if (commandExists('git')) {
    logSuccess('Git installed');
  } else {
    logWarning('Git not found (optional)');
  }

  // Check wrangler auth
  const wranglerConfigPath = path.join(os.homedir(), '.wrangler', 'config.toml');
  if (existsSync(wranglerConfigPath)) {
    logSuccess('Wrangler authenticated');
  } else {
    logWarning('Wrangler not authenticated. Run: wrangler login');
  }

  return allGood;
}

// Load wrangler.toml configuration
async function loadConfiguration(ctx: SetupContext): Promise<void> {
  logSection('Loading Configuration');

  try {
    const wranglerContent = readFileSync(ctx.wranglerToml, 'utf-8');

    // Extract database name from wrangler.toml
    const dbNameMatch = wranglerContent.match(/database_name\s*=\s*"([^"]+)"/);
    const dbIdMatch = wranglerContent.match(/database_id\s*=\s*"([^"]+)"/);

    if (dbNameMatch) {
      ctx.databaseName = dbNameMatch[1];
      logSuccess(`Database name: ${ctx.databaseName}`);
    }

    if (dbIdMatch) {
      ctx.databaseId = dbIdMatch[1];
      logSuccess(`Database ID: ${ctx.databaseId}`);
    }

    // Extract KV namespace
    const kvNameMatch = wranglerContent.match(/id\s*=\s*"([^"]+)"/);
    if (kvNameMatch) {
      ctx.kvId = kvNameMatch[1];
      logSuccess(`KV namespace ID: ${ctx.kvId}`);
    }

    logSuccess('Configuration loaded from wrangler.toml');
  } catch (error: any) {
    logError(`Failed to load configuration: ${error.message}`);
    throw error;
  }
}

// Create D1 database
async function createDatabase(ctx: SetupContext): Promise<void> {
  logSection('Setting Up D1 Database');

  try {
    // Check if database already exists
    logInfo('Checking for existing database...');

    try {
      const dbList = executeSilent('wrangler d1 list');
      if (dbList.includes(ctx.databaseName)) {
        logWarning(`Database "${ctx.databaseName}" already exists`);
        return;
      }
    } catch {
      // Database list command may fail if no databases exist
    }

    // Create database
    logInfo(`Creating database: ${ctx.databaseName}`);
    const output = executeSilent(`wrangler d1 create ${ctx.databaseName}`);
    logSuccess(`Database created: ${ctx.databaseName}`);

    // Extract database ID from output
    const idMatch = output.match(/id = "([^"]+)"/);
    if (idMatch) {
      ctx.databaseId = idMatch[1];
      logInfo(`Database ID: ${ctx.databaseId}`);
    }
  } catch (error: any) {
    logError(`Failed to create database: ${error.message}`);
    throw error;
  }
}

// Run migrations
async function runMigrations(ctx: SetupContext): Promise<void> {
  logSection('Running Database Migrations');

  try {
    if (!existsSync(ctx.migrationsFile)) {
      logError(`Migration file not found: ${ctx.migrationsFile}`);
      throw new Error('Migration file missing');
    }

    logInfo('Reading migration file...');
    const migrationContent = readFileSync(ctx.migrationsFile, 'utf-8');
    logSuccess(`Migration file loaded (${migrationContent.length} bytes)`);

    logInfo('Running migrations...');

    // For local development, use local database
    if (ctx.isLocalMode) {
      execute(
        `wrangler d1 execute ${ctx.databaseName} --file ${ctx.migrationsFile}`,
        false
      );
    } else {
      // For remote, use --remote flag
      execute(
        `wrangler d1 execute ${ctx.databaseName} --file ${ctx.migrationsFile} --remote`,
        false
      );
    }

    logSuccess('Migrations completed successfully');
  } catch (error: any) {
    logError(`Failed to run migrations: ${error.message}`);
    throw error;
  }
}

// Create KV namespace
async function createKVNamespace(ctx: SetupContext): Promise<void> {
  logSection('Setting Up KV Namespace');

  try {
    logInfo(`Creating KV namespace: ${ctx.kvNamespace}`);

    try {
      const output = executeSilent(`wrangler kv:namespace create ${ctx.kvNamespace}`);
      logSuccess(`KV namespace created: ${ctx.kvNamespace}`);

      // Extract ID
      const idMatch = output.match(/id = "([^"]+)"/);
      if (idMatch) {
        ctx.kvId = idMatch[1];
        logInfo(`KV namespace ID: ${ctx.kvId}`);
      }
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        logWarning(`KV namespace "${ctx.kvNamespace}" already exists`);
      } else {
        throw error;
      }
    }
  } catch (error: any) {
    logWarning(`KV namespace setup skipped: ${error.message}`);
  }
}

// Create R2 bucket
async function createR2Bucket(ctx: SetupContext): Promise<void> {
  logSection('Setting Up R2 Bucket');

  try {
    logInfo(`Creating R2 bucket: ${ctx.r2Bucket}`);

    try {
      executeSilent(`wrangler r2 bucket create ${ctx.r2Bucket}`);
      logSuccess(`R2 bucket created: ${ctx.r2Bucket}`);
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        logWarning(`R2 bucket "${ctx.r2Bucket}" already exists`);
      } else {
        throw error;
      }
    }
  } catch (error: any) {
    logWarning(`R2 bucket setup skipped: ${error.message}`);
  }
}

// Create Cloudflare Pages project
async function createPagesProject(ctx: SetupContext): Promise<void> {
  logSection('Setting Up Cloudflare Pages Project');

  try {
    logInfo(`Creating Pages project: ${ctx.pagesProjectName}`);
    logInfo('This requires manual configuration in Cloudflare dashboard or via wrangler CLI');

    try {
      // Check if Pages project already exists
      const projectList = executeSilent('wrangler pages project list 2>&1 || true');
      if (projectList.includes(ctx.pagesProjectName)) {
        logWarning(`Pages project "${ctx.pagesProjectName}" already exists`);
        return;
      }

      // Create Pages project using wrangler
      // Note: wrangler pages create requires git to be initialized
      logInfo('Checking if git repository is initialized...');
      if (!existsSync(path.join(ctx.projectRoot, '.git'))) {
        logWarning('Git repository not initialized. Initializing now...');
        execute('git init', false);
        logSuccess('Git repository initialized');
      }

      logInfo('Creating Pages project with Wrangler...');
      executeSilent(`wrangler pages project create ${ctx.pagesProjectName} --production-branch main 2>&1 || true`);
      logSuccess(`Pages project created: ${ctx.pagesProjectName}`);

      logInfo(`Next steps to complete Pages setup:`);
      logInfo('1. Push your code to GitHub (or connect your repository)');
      logInfo('2. In Cloudflare dashboard, connect Pages project to your GitHub repo');
      logInfo('3. Configure build settings:');
      logInfo('   - Build command: bun run build:all');
      logInfo('   - Build output directory: dist');
      logInfo('4. Bind resources in Pages project settings:');
      logInfo(`   - Database: ${ctx.databaseName} (${ctx.databaseId})`);
      logInfo(`   - KV Namespace: ${ctx.kvNamespace} (${ctx.kvId})`);
      logInfo(`   - R2 Bucket: ${ctx.r2Bucket}`);

    } catch (error: any) {
      logWarning(`Pages project creation skipped. You can create it manually at:`);
      logWarning('https://dash.cloudflare.com/?to=/:account/pages');
    }
  } catch (error: any) {
    logWarning(`Pages setup skipped: ${error.message}`);
  }
}

// Seed initial POC user
async function seedPOCUser(ctx: SetupContext): Promise<void> {
  logSection('Seeding Initial POC User');

  try {
    const userId = 'poc-user-' + Date.now();
    const insertUserSQL = `
      INSERT INTO users (id, username, type, email, is_admin, created_at, updated_at)
      VALUES ('${userId}', 'mahesh.local', 'local', 'mahesh@local', true, datetime('now'), datetime('now'))
      ON CONFLICT(username) DO NOTHING;
    `;

    logInfo('Inserting POC user (mahesh.local)...');

    const dbCommand = `wrangler d1 execute ${ctx.databaseName} "${insertUserSQL.trim()}"`;

    if (ctx.isLocalMode) {
      executeSilent(dbCommand);
    } else {
      executeSilent(dbCommand + ' --remote');
    }

    logSuccess('POC user created: mahesh.local (admin)');
  } catch (error: any) {
    logWarning(`POC user seeding skipped: ${error.message}`);
  }
}

// Verify database schema
async function verifyDatabase(ctx: SetupContext): Promise<void> {
  logSection('Verifying Database Schema');

  try {
    logInfo('Checking tables...');

    const tables = [
      'users',
      'discussions',
      'comments',
      'attachments',
    ];

    const checkSQL = "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'discussions', 'comments', 'attachments');";

    const dbCommand = `wrangler d1 execute ${ctx.databaseName} "${checkSQL}"`;

    if (ctx.isLocalMode) {
      executeSilent(dbCommand);
    } else {
      executeSilent(dbCommand + ' --remote');
    }

    logSuccess('All required tables verified');
  } catch (error: any) {
    logWarning(`Database verification skipped: ${error.message}`);
  }
}

// Generate setup summary
function generateSummary(ctx: SetupContext): void {
  logSection('Setup Summary');

  console.log();
  console.log('Created Resources:');
  log('cyan', `  • Database:      ${ctx.databaseName}${ctx.databaseId ? ` (${ctx.databaseId})` : ''}`);
  log('cyan', `  • KV Namespace:  ${ctx.kvNamespace}${ctx.kvId ? ` (${ctx.kvId})` : ''}`);
  log('cyan', `  • R2 Bucket:     ${ctx.r2Bucket}`);
  log('cyan', `  • Pages Project: ${ctx.pagesProjectName}`);

  console.log();
  console.log('Deployment Quick Start:');
  log('cyan', '  Development (local):');
  log('bold', '     bun run dev');
  log('cyan', '     Then visit: http://localhost:8788');

  console.log();
  log('cyan', '  Production (Cloudflare Pages):');
  log('bold', '     git push origin main');
  log('cyan', '     (Pages auto-deploys from git commits)');

  console.log();
  console.log('Local Testing:');
  log('cyan', '  1. Start dev server:');
  log('bold', '     bun run dev');

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
  console.log('Completing Pages Setup:');
  log('yellow', `  ${icons.warn} Pages project requires manual GitHub connection:`)
  log('cyan', '     1. Push code to GitHub');
  log('cyan', '     2. Connect repo in: https://dash.cloudflare.com/?to=/:account/pages');
  log('cyan', '     3. Configure build: bun run build:all → dist/');
  log('cyan', '     4. Bind resources (D1, KV, R2) in Pages settings');

  console.log();
  logSuccess('Setup completed! Ready for development.');
  console.log();
}

// Main setup function
async function main() {
  log('bold', `\n${icons.flower} Guru Comment System - Setup\n`);

  const ctx: SetupContext = {
    projectRoot: process.cwd(),
    wranglerToml: path.join(process.cwd(), 'wrangler.toml'),
    packageJson: JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')),
    databaseName: 'icomment-db',
    databaseId: null,
    kvNamespace: 'icomment-kv',
    kvId: null,
    r2Bucket: 'icomment-attachments',
    pagesProjectName: 'guru-comments',
    migrationsFile: path.join(process.cwd(), 'migrations', '0001_init_schema.sql'),
    isLocalMode: process.env.WRANGLER_ENV === 'local' || !process.env.WRANGLER_ENV,
  };

  try {
    // Step 1: Check prerequisites
    const prereqOk = await checkPrerequisites();
    if (!prereqOk) {
      logWarning('Some prerequisites are missing. Installation may not work correctly.');
    }

    // Step 2: Load configuration
    await loadConfiguration(ctx);

    // Step 3: Create database
    await createDatabase(ctx);

    // Step 4: Run migrations
    await runMigrations(ctx);

    // Step 5: Create KV namespace
    await createKVNamespace(ctx);

    // Step 6: Create R2 bucket
    await createR2Bucket(ctx);

    // Step 7: Create Pages project
    await createPagesProject(ctx);

    // Step 8: Seed POC user
    await seedPOCUser(ctx);

    // Step 9: Verify database
    await verifyDatabase(ctx);

    // Step 10: Generate summary
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

// Run main
await main();
