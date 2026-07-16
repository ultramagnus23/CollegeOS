'use strict';

/**
 * Import real r/collegeresults outcomes (scraped + scrubbed + IPEDS-joined by the
 * pipeline in ml/reddit_chancing/) into ml_training_data, so trainChancingModel.js's
 * existing auto-switch (>= MIN_REAL accepted/rejected rows) picks them up.
 *
 * Column set confirmed against TWO independent live write paths into ml_training_data:
 *   - backend/src/routes/chancing.js POST /api/chancing/outcome (14 cols)
 *   - backend/src/controllers/applicationController.js outcome-capture loop, fixed in
 *     commit 3d546f5 ("outcome-capture loop was fully broken ... fix schema drift") --
 *     9 cols: user_id, college_id, gpa, sat_score, act_score, outcome, source,
 *     source_year, features. Both agree on sat_score/act_score/outcome/features naming.
 *
 * Schema-drift safe: college_admissions_stats.college_id and ml_training_data.college_id
 * have been redefined across migrations (049 -> colleges(id), 055 -> colleges_comprehensive(id)).
 * Rather than guess which migration "won", this script reads the ACTUAL live foreign-key
 * target from information_schema/pg_constraint at runtime, and looks for an IPEDS-id-like
 * column on whichever table that turns out to be.
 *
 * DEFAULT MODE IS DRY RUN. Nothing is written unless you pass --commit.
 *
 * Usage:
 *   node backend/ml/reddit_chancing_import.js                 # dry run, prints a report
 *   node backend/ml/reddit_chancing_import.js --commit         # actually inserts
 *   node backend/ml/reddit_chancing_import.js --commit --limit=100   # cap rows written
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const dbManager = require('../src/config/database');

const argv = process.argv.slice(2);
const COMMIT = argv.includes('--commit');
const LIMIT = (() => {
  const a = argv.find((x) => x.startsWith('--limit='));
  return a ? parseInt(a.split('=')[1], 10) : Infinity;
})();

const CSV_PATH = path.join(__dirname, '..', '..', 'ml', 'reddit_chancing', 'ipeds_join', 'training_rows.csv');
const IMPORT_SOURCE = 'reddit_import';
const IMPORT_USER_EMAIL = 'reddit-import-bot@collegeos.internal';

const ACT_TO_SAT = {
  36: 1590, 35: 1540, 34: 1500, 33: 1460, 32: 1430, 31: 1400, 30: 1370, 29: 1340,
  28: 1310, 27: 1280, 26: 1240, 25: 1210, 24: 1180, 23: 1140, 22: 1110, 21: 1080,
  20: 1020, 19: 980, 18: 940, 17: 910, 16: 880, 15: 850, 14: 820, 13: 780,
};

const DECISION_MAP = { ACCEPT: 'accepted', REJECT: 'rejected', WAITLIST: 'waitlisted', DEFER: 'deferred' };

// ---- minimal RFC4180 CSV parser (no new dependency needed for this one-off script) ----
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows[0];
  return rows.slice(1).filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

function loadCsvRows() {
  const text = fs.readFileSync(CSV_PATH, 'utf8');
  return parseCSV(text);
}

// Find the live FK target of <table>.<column> via information_schema (not migration
// file order, which is ambiguous here -- 049 vs 055 disagree on the FK target).
async function findFkTarget(pool, table, column) {
  const { rows } = await pool.query(
    `SELECT ccu.table_name AS target_table, ccu.column_name AS target_column
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = $1 AND kcu.column_name = $2`,
    [table, column],
  );
  return rows[0] || null;
}

async function findIpedsColumn(pool, table) {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = $1 AND column_name ILIKE '%ipeds%'`,
    [table],
  );
  return rows[0]?.column_name || null;
}

async function main() {
  const pool = dbManager.getDatabase();

  console.log(`Mode: ${COMMIT ? 'COMMIT (will write)' : 'DRY RUN (no writes)'}`);
  console.log(`Reading: ${CSV_PATH}`);

  const csvRows = loadCsvRows();
  console.log(`CSV rows: ${csvRows.length}`);

  // Same usability bar the trainer itself applies: outcome in accepted/rejected,
  // and a usable test score (SAT direct, or ACT convertible). GPA absence is fine --
  // buildRealDataset() in trainChancingModel.js defaults missing GPA to 3.5.
  const candidates = csvRows.filter((r) => {
    const outcome = DECISION_MAP[r.decision];
    if (outcome !== 'accepted' && outcome !== 'rejected') return false;
    if (!r.unitid) return false; // must have resolved to a real IPEDS school
    const hasSat = r.sat_total && !Number.isNaN(Number(r.sat_total));
    const hasAct = r.act_composite && ACT_TO_SAT[Math.round(Number(r.act_composite))];
    return hasSat || hasAct;
  });
  console.log(`Rows with a usable outcome + test score + resolved IPEDS id: ${candidates.length}`);

  // ---- resolve live FK targets (schema-drift safe) ----
  const mlFk = await findFkTarget(pool, 'ml_training_data', 'college_id');
  const statsFk = await findFkTarget(pool, 'college_admissions_stats', 'college_id');
  if (!mlFk) throw new Error('Could not find ml_training_data.college_id foreign key in the live DB. Aborting -- schema may differ from expectations.');
  if (!statsFk) throw new Error('Could not find college_admissions_stats.college_id foreign key in the live DB. Aborting.');
  console.log(`ml_training_data.college_id -> ${mlFk.target_table}.${mlFk.target_column}`);
  console.log(`college_admissions_stats.college_id -> ${statsFk.target_table}.${statsFk.target_column}`);

  if (mlFk.target_table !== statsFk.target_table) {
    console.warn(`WARNING: ml_training_data and college_admissions_stats point at DIFFERENT tables `
      + `(${mlFk.target_table} vs ${statsFk.target_table}). trainChancingModel.js's join between them `
      + `will only match rows whose college_id happens to mean the same institution in both tables. `
      + `This is a real schema-drift risk in the live DB, independent of this import.`);
  }

  const ipedsCol = await findIpedsColumn(pool, mlFk.target_table);
  if (!ipedsCol) {
    throw new Error(`No IPEDS-id-like column found on ${mlFk.target_table}. Cannot map our UnitIDs to `
      + `college_id without one -- inspect the schema manually before proceeding.`);
  }
  console.log(`IPEDS column on ${mlFk.target_table}: ${ipedsCol}`);

  // ---- resolve unitid -> college_id for every distinct unitid in our candidates ----
  const uniqueUnitids = [...new Set(candidates.map((r) => r.unitid))];
  const { rows: idMapRows } = await pool.query(
    `SELECT id, ${ipedsCol} AS ipeds_id FROM ${mlFk.target_table} WHERE ${ipedsCol} = ANY($1::text[])`,
    [uniqueUnitids],
  );
  const unitidToCollegeId = new Map(idMapRows.map((r) => [String(r.ipeds_id), r.id]));
  console.log(`Distinct schools in candidate rows: ${uniqueUnitids.length}`);
  console.log(`Resolved to a real ${mlFk.target_table}.id via IPEDS match: ${unitidToCollegeId.size}`);

  const resolvable = candidates.filter((r) => unitidToCollegeId.has(r.unitid));
  console.log(`Rows resolvable to a real college_id: ${resolvable.length}`);

  // ---- check how many of those colleges also have usable college_admissions_stats ----
  // (this is what trainChancingModel.js's fetchRealLabeledData() actually requires --
  // a row can exist in ml_training_data and still be silently excluded from training
  // if the college has no median_sat/acceptance_rate row here)
  const resolvedCollegeIds = [...new Set(resolvable.map((r) => unitidToCollegeId.get(r.unitid)))];
  const { rows: statsRows } = await pool.query(
    `SELECT college_id FROM college_admissions_stats
      WHERE college_id = ANY($1::int[]) AND median_sat IS NOT NULL
        AND acceptance_rate > 0 AND acceptance_rate < 1`,
    [resolvedCollegeIds],
  );
  const collegesWithUsableStats = new Set(statsRows.map((r) => r.college_id));
  const trainerUsable = resolvable.filter((r) => collegesWithUsableStats.has(unitidToCollegeId.get(r.unitid)));
  console.log(`Colleges with usable college_admissions_stats (median_sat + acceptance_rate): ${collegesWithUsableStats.size} / ${resolvedCollegeIds.length}`);
  console.log(`>>> Rows that will ACTUALLY be usable by trainChancingModel.js's fetchRealLabeledData(): ${trainerUsable.length}`);
  console.log(`>>> Trainer's MIN_REAL default threshold is 200. `
    + `${trainerUsable.length >= 200 ? 'This clears the threshold.' : 'This does NOT clear the threshold yet.'}`);

  const toInsert = resolvable.slice(0, LIMIT);
  console.log(`\nRows that would be inserted into ml_training_data this run: ${toInsert.length}`
    + (LIMIT < Infinity ? ` (capped by --limit=${LIMIT})` : ''));

  if (!COMMIT) {
    console.log('\nDry run complete. No rows were written. Re-run with --commit to actually insert.');
    await dbManager.close();
    return;
  }

  // ---- actual write path ----
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `INSERT INTO users (email, full_name, country, password_hash)
       VALUES ($1, $2, $3, NULL)
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      [IMPORT_USER_EMAIL, 'Reddit Import Bot', 'US'],
    );
    const importUserId = userResult.rows[0].id;
    console.log(`Import placeholder user id: ${importUserId}`);

    let inserted = 0;
    for (const r of toInsert) {
      const collegeId = unitidToCollegeId.get(r.unitid);
      const outcome = DECISION_MAP[r.decision];
      const gpa = r.gpa_uw ? Number(r.gpa_uw) : (r.gpa_w ? Number(r.gpa_w) : null);
      const satScore = r.sat_total ? Number(r.sat_total) : null;
      const actScore = r.act_composite ? Number(r.act_composite) : null;
      const features = {
        gpa, sat: satScore, act: actScore,
        num_ap: r.num_ap ? Number(r.num_ap) : null,
        college_acceptance_rate: r.admit_rate ? Number(r.admit_rate) : null,
        decision: outcome,
        source_dataset: 'r/collegeresults via Arctic Shift, scrubbed + IPEDS-joined',
      };

      // Confirmed column set: intersection of both live write paths (chancing.js's
      // /api/chancing/outcome route, and applicationController.js post-3d546f5) --
      // user_id, college_id, outcome, gpa, sat_score, act_score, features, source,
      // source_year all agree by name. confidence_score/is_verified/major_applied/
      // education_system/board_percentage are the wider set chancing.js also sets;
      // included here too since they exist on the table and have sane defaults
      // otherwise (0.7/0/NULL/NULL/NULL per migration 010).
      await client.query(
        `INSERT INTO ml_training_data (
           user_id, college_id, outcome, gpa, sat_score, act_score, features,
           source, source_year, confidence_score, is_verified, major_applied,
           education_system, board_percentage
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          importUserId, collegeId, outcome, gpa, satScore, actScore,
          JSON.stringify(features), IMPORT_SOURCE, r.cycle_year ? parseInt(r.cycle_year, 10) : null,
          0.6, // lower confidence than user_verified (0.95) / self_reported (default 0.7) -- scraped, not app-verified
          0,   // is_verified = false
          null, 'US', null,
        ],
      );
      inserted += 1;
    }

    await client.query('COMMIT');
    console.log(`\nCommitted ${inserted} rows into ml_training_data (source='${IMPORT_SOURCE}').`);
    console.log('Run `node backend/ml/trainChancingModel.js` to retrain -- it will auto-switch to real '
      + 'data if the trainer-usable count above clears MIN_REAL (200).');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Import failed, rolled back:', err.message);
    throw err;
  } finally {
    client.release();
  }

  await dbManager.close();
}

main().catch(async (e) => {
  console.error('reddit_chancing_import failed:', e.message);
  try { await dbManager.close(); } catch (_) { /* ignore */ }
  process.exit(1);
});
