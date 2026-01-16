#!/usr/bin/env bun

/**
 * Teardown Script - Guru Comment System
 *
 * Deletes all Cloudflare resources created by setup:
 * - D1 database
 * - KV namespace
 * - R2 bucket
 * - Pages project
 *
 * WARNING: This is destructive and cannot be undone!
 * All data will be permanently deleted.
 *
 * Usage: bun run teardown
 */

import { execSync } from 'child_process';
import readline from 'readline';

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

function executeSilent(command: string): string {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: 'pipe' }).trim();
  } catch (error: any) {
    throw new Error(`Command failed: ${command}`);
  }
}

async function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${colors.yellow}${question}${colors.reset} `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

async function deleteDatabase(): Promise<void> {
  logSection('Deleting D1 Database');
  const confirmed = await askConfirmation('Delete D1 database "icomment-db"? (yes/no):');
  if (!confirmed) {
    logWarning('Database deletion skipped');
    return;
  }

  try {
    logInfo('Deleting database...');
    executeSilent('wrangler d1 delete icomment-db --yes 2>&1 || true');
    logSuccess('Database deleted: icomment-db');
  } catch (error: any) {
    logWarning(`Database deletion skipped: ${error.message}`);
  }
}

async function deleteKVNamespace(): Promise<void> {
  logSection('Deleting KV Namespace');
  const confirmed = await askConfirmation('Delete KV namespace "icomment-kv"? (yes/no):');
  if (!confirmed) {
    logWarning('KV namespace deletion skipped');
    return;
  }

  try {
    logInfo('Deleting KV namespace...');
    executeSilent('wrangler kv:namespace delete icomment-kv --yes 2>&1 || true');
    logSuccess('KV namespace deleted: icomment-kv');
  } catch (error: any) {
    logWarning(`KV namespace deletion skipped: ${error.message}`);
  }
}

async function deleteR2Bucket(): Promise<void> {
  logSection('Deleting R2 Bucket');
  const confirmed = await askConfirmation('Delete R2 bucket "icomment-attachments"? (yes/no):');
  if (!confirmed) {
    logWarning('R2 bucket deletion skipped');
    return;
  }

  try {
    logInfo('Deleting R2 bucket...');
    executeSilent('wrangler r2 bucket delete icomment-attachments --yes 2>&1 || true');
    logSuccess('R2 bucket deleted: icomment-attachments');
  } catch (error: any) {
    logWarning(`R2 bucket deletion skipped: ${error.message}`);
  }
}

async function deletePagesProject(): Promise<void> {
  logSection('Deleting Pages Project');
  const confirmed = await askConfirmation('Delete Pages project "guru-comments"? (yes/no):');
  if (!confirmed) {
    logWarning('Pages project deletion skipped');
    return;
  }

  try {
    logInfo('Deleting Pages project...');
    executeSilent('wrangler pages project delete guru-comments --yes 2>&1 || true');
    logSuccess('Pages project deleted: guru-comments');
  } catch (error: any) {
    logWarning(`Pages project deletion skipped: ${error.message}`);
  }
}

function generateSummary(): void {
  logSection('Teardown Summary');

  console.log();
  log('cyan', 'Deleted Resources:');
  log('cyan', '  • D1 Database: icomment-db');
  log('cyan', '  • KV Namespace: icomment-kv');
  log('cyan', '  • R2 Bucket: icomment-attachments');
  log('cyan', '  • Pages Project: guru-comments');

  console.log();
  logSuccess('Teardown completed! All resources deleted.');
  console.log();
}

async function main() {
  log('bold', `\n${icons.flower} Guru Comment System - Teardown\n`);

  log('red', `${icons.warn} WARNING: This will permanently delete all resources!`);
  log('red', `${icons.warn} This action CANNOT be undone.\n`);

  const proceed = await askConfirmation('Are you sure you want to continue? (yes/no):');
  if (!proceed) {
    logWarning('Teardown cancelled');
    process.exit(0);
  }

  try {
    await deleteDatabase();
    await deleteKVNamespace();
    await deleteR2Bucket();
    await deletePagesProject();
    generateSummary();
  } catch (error: any) {
    console.log();
    logError(`Teardown failed: ${error.message}`);
    console.log();
    process.exit(1);
  }
}

await main();
