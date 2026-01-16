#!/usr/bin/env bun

/**
 * Deploy Script - Guru Comment System
 *
 * Deploys the built application to Cloudflare Pages:
 * 1. Verifies dist/ directory exists (built SPA + Functions)
 * 2. Deploys to Cloudflare Pages
 * 3. Shows deployment summary
 *
 * Prerequisites:
 * - bun run build:all (must be run first)
 * - bun run setup (infrastructure must exist)
 * - wrangler authenticated
 *
 * Usage: bun run deploy
 * Or manually: wrangler pages deploy ./dist
 */

import { execSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import path from 'path';

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
    throw new Error(`Command failed: ${command}`);
  }
}

async function verifyBuild(): Promise<void> {
  logSection('Verifying Build');

  const projectRoot = process.cwd();
  const distDir = path.join(projectRoot, 'dist');

  if (!existsSync(distDir)) {
    logError('dist/ directory not found');
    logInfo('Run "bun run build:all" first to build the project');
    throw new Error('Build directory missing');
  }

  logSuccess('dist/ directory exists');

  try {
    const stats = statSync(distDir);
    if (!stats.isDirectory()) {
      throw new Error('dist is not a directory');
    }
    logSuccess('dist/ is a valid directory');
  } catch (error: any) {
    logError(`Failed to verify dist/: ${error.message}`);
    throw error;
  }
}

async function deployToPages(): Promise<void> {
  logSection('Deploying to Cloudflare Pages');

  try {
    logInfo('Deploying dist/ to Cloudflare Pages...');
    execute('wrangler pages deploy ./dist --project-name guru-comments', false);
    logSuccess('Deployment completed successfully!');
  } catch (error: any) {
    logError(`Deployment failed: ${error.message}`);
    throw error;
  }
}

function generateSummary(): void {
  logSection('Deployment Summary');

  console.log();
  log('cyan', 'Deployed:');
  log('cyan', '  • React SPA (dist/index.html and assets)');
  log('cyan', '  • Pages Functions (dist/functions)');
  log('cyan', '  • D1 Database bindings');
  log('cyan', '  • KV Namespace bindings');
  log('cyan', '  • R2 Bucket bindings');

  console.log();
  log('cyan', 'Next steps:');
  log('bold', '  1. Visit your Pages URL (shown above)');
  log('bold', '  2. Login with mahesh.local (auto-authenticated)');
  log('bold', '  3. Test API endpoints via browser console');

  console.log();
  logSuccess('Deployment ready for production use!');
  console.log();
}

async function main() {
  log('bold', `\n${icons.rocket} Guru Comment System - Deploy\n`);

  try {
    await verifyBuild();
    await deployToPages();
    generateSummary();
  } catch (error: any) {
    console.log();
    logError(`Deployment failed: ${error.message}`);
    console.log();
    logInfo('Troubleshooting:');
    logInfo('1. Verify you built the project: bun run build:all');
    logInfo('2. Verify infrastructure exists: bun run setup');
    logInfo('3. Verify Wrangler authentication: wrangler login');
    console.log();
    process.exit(1);
  }
}

await main();
