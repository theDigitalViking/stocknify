/**
 * run-manual-migrations.ts
 *
 * Applies manual SQL files that Prisma cannot express in schema.prisma.
 * These include: RLS policies, partial unique indexes, CHECK constraints
 * with subqueries, and composite FKs.
 *
 * Run order matters — files are applied in the order listed below.
 * All files must be idempotent (safe to re-run on any DB state).
 *
 * Usage:
 *   pnpm --filter api db:migrate:manual
 *
 * This script runs automatically after prisma migrate deploy in CI/CD.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SQL_DIR = join(__dirname, 'sql');
const SEED_DIR = join(__dirname, 'seed');

// Order matters — RLS must be applied before constraints that reference policies
const MANUAL_SQL_FILES = [
  // v2 — applied once on initial setup
  'unique-stock-type-definitions.sql',
  'unique-stock-levels.sql',
  'rules-check-constraint.sql',
  'rls-policies.sql',
  // v3 — applied after schema v3 migration
  'rls-policies-v3.sql',
  'unique-notification-templates.sql',
  'schedule-check-constraints.sql',
  'attribute-value-tenant-guard.sql',
  // v4 — applied after schema v4 migration
  'rls-policies-v4.sql',
  'incident-check-constraints.sql',
];

// Idempotent seed files — safe to re-run via ON CONFLICT DO NOTHING
const SEED_FILES = [
  'stock-type-definitions.sql',
  'notification-templates.sql',
];

async function runManualMigrations(): Promise<void> {
  const client = new Client({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  });

  await client.connect();

  console.log('Running manual SQL migrations...');

  for (const file of MANUAL_SQL_FILES) {
    const filePath = join(SQL_DIR, file);
    let sql: string;

    try {
      sql = readFileSync(filePath, 'utf-8');
    } catch {
      console.warn(`  SKIP  ${file} (file not found)`);
      continue;
    }

    try {
      await client.query(sql);
      console.log(`  OK    ${file}`);
    } catch (err) {
      console.error(`  FAIL  ${file}`);
      console.error(err);
      await client.end();
      process.exit(1);
    }
  }

  console.log('Running idempotent seeds...');

  for (const file of SEED_FILES) {
    const filePath = join(SEED_DIR, file);
    let sql: string;

    try {
      sql = readFileSync(filePath, 'utf-8');
    } catch {
      console.warn(`  SKIP  ${file} (file not found)`);
      continue;
    }

    try {
      await client.query(sql);
      console.log(`  OK    ${file}`);
    } catch (err) {
      console.error(`  FAIL  ${file}`);
      console.error(err);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log('Manual migrations complete.');
}

runManualMigrations();
