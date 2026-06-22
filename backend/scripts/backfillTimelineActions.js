'use strict';

// One-time backfill: generate timeline_actions for every user who already has
// applications. New applications auto-generate a timeline via the application
// bootstrap (applicationController -> applicationBootstrapService -> timelineService
// .generateTimelineActions). But users whose applications were created BEFORE the
// timeline-generation schema-drift fix never had it run, so timeline_actions was
// empty for them. This runs the same generator for each such user. Idempotent:
// generateTimelineActions deletes prior system-generated actions before inserting.
//
//   node scripts/backfillTimelineActions.js [--dry-run]

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadEnv();
  process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const dryRun = process.argv.includes('--dry-run');
  const dbManager = require('../src/config/database');
  dbManager.initialize();
  const pool = dbManager.getDatabase();
  const timelineService = require('../src/services/timelineService');

  const { rows } = await pool.query(
    'SELECT user_id, COUNT(*)::int apps FROM applications GROUP BY user_id ORDER BY user_id'
  );
  console.log(`Users with applications: ${rows.length}${dryRun ? ' [DRY RUN]' : ''}`);

  let totalActions = 0; let ok = 0; let failed = 0;
  for (const { user_id: userId, apps } of rows) {
    if (dryRun) { console.log(`  user ${userId}: ${apps} apps (would generate)`); continue; }
    try {
      const r = await timelineService.generateTimelineActions(userId); // eslint-disable-line no-await-in-loop
      const n = r.actions_generated || 0;
      totalActions += n; ok += 1;
      console.log(`  user ${userId}: ${apps} apps -> ${n} timeline actions`);
    } catch (e) {
      failed += 1;
      console.error(`  user ${userId}: FAILED -> ${e.message}`);
    }
  }

  console.log(`\nDone: users=${rows.length} ok=${ok} failed=${failed} totalActions=${totalActions}`);
  await dbManager.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('backfill failed:', e.message); process.exit(1); });
