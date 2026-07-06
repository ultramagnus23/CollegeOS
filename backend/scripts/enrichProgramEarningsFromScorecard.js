'use strict';

// Enriches canonical.institution_programs with REAL per-program median
// earnings from the College Scorecard "Field of Study" data (the same API
// + key refreshScorecard.js already uses, just a different field set:
// latest.programs.cip_4_digit.earnings.{1_yr,4_yr}.overall_median_earnings).
// This is genuinely new, structured "outcomes" data -- program-level median
// salary 1 and 4 years after completion, per institution, per CIP program,
// per credential level -- not previously used anywhere in this codebase.
//
// Field-of-study data is reported at CIP-4-digit granularity; our existing
// institution_programs rows (from ipeds_completions_programs.js) are keyed
// at the coarser CIP-2-digit "family" level, so this aggregates the 4-digit
// earnings up to the matching 2-digit family + degree level bucket (median
// of the available medians) and updates metadata on the existing row --
// never inserts a new row, never overwrites with a null.
//
// Usage: node scripts/enrichProgramEarningsFromScorecard.js [--batch=300] [--dry-run]

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const API_KEY = process.env.COLLEGE_SCORECARD_API_KEY || process.env.DATA_GOV_API_KEY;
const API_BASE = 'https://api.data.gov/ed/collegescorecard/v1/schools';
const FIELDS = [
  'id',
  'latest.programs.cip_4_digit.code',
  'latest.programs.cip_4_digit.credential.level',
  'latest.programs.cip_4_digit.earnings.1_yr.overall_median_earnings',
  'latest.programs.cip_4_digit.earnings.4_yr.overall_median_earnings',
].join(',');

const arg = (name, def) => {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`));
  return m ? m.split('=')[1] : def;
};
const DRY = process.argv.includes('--dry-run');
const BATCH = Math.max(1, parseInt(arg('batch', '300'), 10) || 300);
const CHUNK = 90; // ids per API call, same as refreshScorecard.js

// Scorecard credential.level -> our degree_type buckets (same mapping used
// by ipeds_completions_programs.js's AWLEVEL_NAMES, adapted to Scorecard's
// own credential.level codes: 1=certificate<1yr,2=certificate1-2yr,
// 3=associate,4=certificate2-4yr,5=bachelor,6=post-bacc cert,7=master,
// 8=post-master cert,9=doctoral).
const LEVEL_TO_DEGREE = { 3: 'Associate', 5: 'Bachelor', 7: 'Master', 9: 'PhD' };

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

async function fetchChunk(ids) {
  const url = `${API_BASE}?api_key=${API_KEY}&id__in=${ids.join(',')}&fields=${FIELDS}&per_page=${ids.length}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Scorecard HTTP ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

async function main() {
  if (!API_KEY) throw new Error('COLLEGE_SCORECARD_API_KEY not set');
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

  const { rows: institutions } = await pool.query(`
    SELECT id, canonical_external_ids->>'ipeds' AS ipeds
    FROM canonical.institutions
    WHERE country_code = 'US' AND canonical_external_ids->>'ipeds' IS NOT NULL
    ORDER BY updated_at ASC
    LIMIT $1
  `, [BATCH]);
  console.log(`Selected ${institutions.length} US institutions (oldest-updated-first)`);

  const ipedsToInst = new Map(institutions.map((i) => [i.ipeds, i.id]));

  let updated = 0;
  let noData = 0;
  for (let i = 0; i < institutions.length; i += CHUNK) {
    const chunk = institutions.slice(i, i + CHUNK);
    const ids = chunk.map((c) => c.ipeds);
    let results;
    try {
      results = await fetchChunk(ids); // eslint-disable-line no-await-in-loop
    } catch (e) {
      console.log(`  chunk fetch failed: ${e.message}`);
      continue; // eslint-disable-line no-continue
    }

    for (const r of results) {
      const instId = ipedsToInst.get(String(r.id));
      const progs = r['latest.programs.cip_4_digit'] || [];
      if (!instId || !progs.length) { noData++; continue; } // eslint-disable-line no-continue

      // Aggregate 4-digit CIP earnings -> (2-digit family, degree bucket)
      const buckets = new Map(); // key: family|degree -> {e1:[], e4:[]}
      for (const p of progs) {
        const level = p.credential && p.credential.level;
        const degree = LEVEL_TO_DEGREE[level];
        if (!degree) continue; // eslint-disable-line no-continue
        // Scorecard's cip_4_digit.code is a bare 4-digit string ("0402" = family
        // "04", subfamily "02"), NOT dotted like our stored "04.0000" -- the
        // family is just the first 2 characters.
        const family = String(p.code || '').padStart(4, '0').slice(0, 2);
        if (!p.code) continue; // eslint-disable-line no-continue
        const key = `${family}|${degree}`;
        if (!buckets.has(key)) buckets.set(key, { e1: [], e4: [] });
        const b = buckets.get(key);
        const e1 = p.earnings && p.earnings['1_yr'] && p.earnings['1_yr'].overall_median_earnings;
        const e4 = p.earnings && p.earnings['4_yr'] && p.earnings['4_yr'].overall_median_earnings;
        if (typeof e1 === 'number') b.e1.push(e1);
        if (typeof e4 === 'number') b.e4.push(e4);
      }

      for (const [key, b] of buckets) {
        const [family, degree] = key.split('|');
        const m1 = median(b.e1);
        const m4 = median(b.e4);
        if (m1 == null && m4 == null) continue; // eslint-disable-line no-continue
        if (DRY) { updated++; continue; } // eslint-disable-line no-continue
        // eslint-disable-next-line no-await-in-loop
        const res = await pool.query(
          `UPDATE canonical.institution_programs
             SET metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
                   'median_earnings_1yr', $1::int, 'median_earnings_4yr', $2::int,
                   'earnings_source', 'College Scorecard Field of Study')),
                 updated_at = now()
           WHERE institution_id = $3 AND metadata->>'cip_code' = $4 || '.0000'
             AND degree_type = $5
             AND metadata->>'median_earnings_4yr' IS NULL`,
          [m1, m4, instId, family, degree]
        );
        if (res.rowCount > 0) updated += res.rowCount;
      }
    }
    console.log(`  ... processed ${Math.min(i + CHUNK, institutions.length)}/${institutions.length}, updated so far: ${updated}`);
  }

  console.log(`Done. institution_programs rows enriched: ${updated}. Institutions with no field-of-study data: ${noData}. dryRun=${DRY}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
