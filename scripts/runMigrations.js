#!/usr/bin/env node
/**
 * Root migration runner for SQL files under scripts/migrations.
 * Usage:
 *   node scripts/runMigrations.js
 *
 * Requires:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function execSql(query) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/sql/v1`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SQL API failed (${res.status}): ${text}`);
  }
  const body = await res.text();
  return body ? JSON.parse(body) : null;
}

async function ensureMigrationTable() {
  await execSql(`
    CREATE TABLE IF NOT EXISTS public.script_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

async function isApplied(filename) {
  const rows = await execSql(`
    SELECT 1
    FROM public.script_migrations
    WHERE filename = '${filename.replace(/'/g, "''")}'
    LIMIT 1;
  `);
  return Array.isArray(rows) && rows.length > 0;
}

async function markApplied(filename) {
  await execSql(`
    INSERT INTO public.script_migrations (filename)
    VALUES ('${filename.replace(/'/g, "''")}')
    ON CONFLICT (filename) DO NOTHING;
  `);
}

async function main() {
  console.log('🔄 Running script migrations from scripts/migrations ...');

  await ensureMigrationTable();

  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('ℹ️ No migration files found.');
    return;
  }

  for (const file of files) {
    const already = await isApplied(file);
    if (already) {
      console.log(`↷ Skipping ${file} (already applied)`);
      continue;
    }

    const fullPath = path.join(MIGRATIONS_DIR, file);
    const sql = await fs.readFile(fullPath, 'utf8');
    console.log(`▶ Applying ${file}`);
    await execSql(sql);
    await markApplied(file);
    console.log(`✅ Applied ${file}`);
  }

  console.log('✅ All script migrations complete.');
}

main().catch((err) => {
  console.error('❌ Migration runner failed:', err.message);
  process.exit(1);
});

