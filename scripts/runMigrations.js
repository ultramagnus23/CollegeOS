#!/usr/bin/env node
/**
 * Root migration runner for SQL files under scripts/migrations.
 * Usage:
 *   node scripts/runMigrations.js
 *
 * Requires:
 *   DATABASE_URL or SUPABASE_DB_URL (a real Postgres connection string)
 *
 * NOTE: this previously POSTed SQL to `${SUPABASE_URL}/sql/v1`, an endpoint
 * that does not exist on Supabase (PostgREST only exposes `/rest/v1`; the
 * SQL-execution route lives on the project-ref-scoped Management API at
 * api.supabase.com, not the project URL). That made this script fail with
 * `TypeError: fetch failed` on every run, silently blocking every migration
 * placed under scripts/migrations/ (including 038_scraper_execution_history.sql,
 * which is why canonical.scraper_execution_history never existed in prod).
 * Switched to a direct pg connection, matching every other working workflow
 * in this repo (canonical-data-refresh.yml, scorecard-refresh.yml, etc.).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function getConnectionString() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error('DATABASE_URL or SUPABASE_DB_URL is required');
  }
  return url;
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.script_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

async function isApplied(client, filename) {
  const { rows } = await client.query(
    `SELECT 1 FROM public.script_migrations WHERE filename = $1 LIMIT 1;`,
    [filename]
  );
  return rows.length > 0;
}

async function markApplied(client, filename) {
  await client.query(
    `INSERT INTO public.script_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING;`,
    [filename]
  );
}

async function main() {
  console.log('🔄 Running script migrations from scripts/migrations ...');

  const client = new Client({
    connectionString: getConnectionString(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await ensureMigrationTable(client);

    const files = (await fs.readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('ℹ️ No migration files found.');
      return;
    }

    for (const file of files) {
      const already = await isApplied(client, file);
      if (already) {
        console.log(`↷ Skipping ${file} (already applied)`);
        continue;
      }

      const fullPath = path.join(MIGRATIONS_DIR, file);
      const sql = await fs.readFile(fullPath, 'utf8');
      console.log(`▶ Applying ${file}`);
      await client.query(sql);
      await markApplied(client, file);
      console.log(`✅ Applied ${file}`);
    }

    console.log('✅ All script migrations complete.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('❌ Migration runner failed:', err.message);
  process.exit(1);
});
