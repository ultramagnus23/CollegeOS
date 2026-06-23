'use strict';

// Robust ROLLING deadlines + requirements scraper. Unlike the 2-target adapters,
// this AUTO-DISCOVERS targets from canonical.institutions (any institution with a
// website), fetches its homepage, follows the most likely admissions/deadlines
// link, and extracts deadlines + requirements from that page using the proven
// extractors. Idempotent + non-destructive (requirements skip if a row exists;
// deadlines upsert by unique key). Skips JS-only/404/no-data pages — never
// fabricates. Rolling + throttled (least-recently-checked first) so it can run as
// a daily batch and cover the catalog over time.
//
//   node scripts/runAdmissionsRolling.js --batch=25
//   node scripts/runAdmissionsRolling.js --countries=US,IN --batch=50 --dry-run

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { cleanHtml, extractDeadlines } = require('../src/scrapers/adapters/usOfficialDeadlines');
const { extractRequirements } = require('../src/scrapers/adapters/usOfficialRequirements');

const CYCLE_YEAR = '2025-2026';
const CYCLE_YEAR_KEY = 2026;

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d; };

async function fetchHtml(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'CollegeOS-AdmissionsBot/1.0 (+https://collegeos.app/bot)' }, redirect: 'follow', signal: AbortSignal.timeout(18000) });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

// Find the most likely admissions/deadlines page link on a homepage.
function findAdmissionsUrl(html, baseUrl) {
  const links = [...String(html).matchAll(/href=["']([^"'#]+)["']/gi)].map((m) => m[1]);
  const score = (l) => {
    const s = l.toLowerCase();
    if (/deadline|dates-and-deadlines|key-dates/.test(s)) return 3;
    if (/how-to-apply|first-year|freshman|undergraduate-admission|apply\/first/.test(s)) return 2;
    if (/admission|apply/.test(s)) return 1;
    return 0;
  };
  let best = null; let bestScore = 0;
  for (const l of links) { const sc = score(l); if (sc > bestScore) { bestScore = sc; best = l; } }
  if (!best) return null;
  try { return new URL(best, baseUrl).href; } catch { return null; }
}

async function upsertDeadlines(pool, instId, deadlines, srcUrl, now) {
  let n = 0;
  let domain = ''; try { domain = new URL(srcUrl).hostname; } catch { /* ignore */ }
  for (const d of deadlines) {
    try {
      const res = await pool.query( // eslint-disable-line no-await-in-loop
        `INSERT INTO canonical.institution_deadlines
           (institution_id, cycle_year, cycle_year_key, degree_level, applicant_type, intake_term,
            deadline_type, deadline_date, deadline_date_key, is_binding, is_rolling, is_estimated,
            source_url, source_domain, source_type, parser_name, parser_version, last_verified,
            confidence_score, source_priority, conflict_status, raw_payload, parser_trace, created_at, updated_at)
         VALUES ($1,$2,$3,'undergraduate','international','fall',$4,$5,$5,$6,false,false,$7,$8,'official',
                 'admissionsRolling','1.0.0',$9,0.8,90,'clean',$10::jsonb,$11::jsonb,$9,$9)
         ON CONFLICT (institution_id, cycle_year_key, applicant_type, degree_level, intake_term, deadline_type)
         DO UPDATE SET deadline_date = EXCLUDED.deadline_date, last_verified = EXCLUDED.last_verified
         RETURNING (xmax = 0) AS inserted`,
        [instId, CYCLE_YEAR, CYCLE_YEAR_KEY, d.deadline_type, d.deadline_date, d.is_binding, false, srcUrl, now,
          JSON.stringify({ snippet: d.snippet, source_url: srcUrl }), JSON.stringify({ matched: d.snippet })]
      );
      if (res.rows[0] && res.rows[0].inserted) n += 1;
    } catch { /* skip bad row (CHECK/constraint) */ }
  }
  return n;
}

async function insertRequirements(pool, instId, fields, srcUrl, now) {
  // non-destructive: only if no requirements row yet for this key
  const ex = await pool.query(
    `SELECT 1 FROM canonical.institution_requirements WHERE institution_id=$1 AND cycle_year=$2 AND degree_level='undergraduate' AND applicant_type='international' LIMIT 1`,
    [instId, CYCLE_YEAR]
  );
  if (ex.rows[0]) return 0;
  let domain = ''; try { domain = new URL(srcUrl).hostname; } catch { /* ignore */ }
  try {
    await pool.query(
      `INSERT INTO canonical.institution_requirements
         (institution_id, cycle_year, degree_level, applicant_type, sat_policy, sat_required,
          toefl_required, ielts_required, duolingo_required, transcript_required, essays_required,
          supplemental_essays_required, teacher_recommendations_required, interview_required,
          interview_optional, common_app_supported, coalition_app_supported, application_platform,
          source_url, source_domain, source_type, parser_name, parser_version, last_verified,
          confidence_score, raw_payload, parser_trace, created_at, updated_at)
       VALUES ($1,$2,'undergraduate','international',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
               $17,$18,'official','admissionsRolling','1.0.0',$19,0.7,$20::jsonb,'{}'::jsonb,$19,$19)`,
      [instId, CYCLE_YEAR, fields.sat_policy || null, fields.sat_required || null,
        fields.toefl_required || null, fields.ielts_required || null, fields.duolingo_required || null,
        fields.transcript_required || null, fields.essays_required || null, fields.supplemental_essays_required || null,
        fields.teacher_recommendations_required || null, fields.interview_required || null, fields.interview_optional || null,
        fields.common_app_supported || null, fields.coalition_app_supported || null, fields.application_platform || null,
        srcUrl, domain, now, JSON.stringify({ source_url: srcUrl })]
    );
    return 1;
  } catch { return 0; }
}

async function main() {
  loadEnv();
  const dryRun = process.argv.includes('--dry-run');
  const batch = Math.max(1, parseInt(arg('batch', '25'), 10));
  const countries = arg('countries', 'US,IN,AU,GB,CA,DE,FR').split(',').map((c) => c.trim().toUpperCase());
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });

  // Rolling: prioritize PROMINENT colleges (ranked, then most selective — i.e. the
  // ones students actually apply to and that publish deadlines) that have a website
  // but no deadlines yet. Far higher yield + value than obscure colleges first.
  const { rows } = await pool.query(
    `SELECT i.id, i.canonical_name, i.website, i.country_code
       FROM canonical.institutions i
       LEFT JOIN canonical.mv_college_cards m ON m.id = i.id
      WHERE i.country_code = ANY($1) AND i.website IS NOT NULL AND i.website <> ''
        AND NOT EXISTS (SELECT 1 FROM canonical.institution_deadlines d WHERE d.institution_id = i.id)
      ORDER BY (m.global_rank IS NULL), m.global_rank ASC NULLS LAST,
               m.acceptance_rate ASC NULLS LAST, i.popularity_score DESC NULLS LAST
      LIMIT $2`,
    [countries, batch]
  );
  console.log(`Admissions rolling: ${rows.length} institutions (countries=${countries.join(',')}, batch=${batch})${dryRun ? ' [DRY RUN]' : ''}`);

  const stats = { fetched: 0, deadlines: 0, requirements: 0, no_data: 0, fetch_failed: 0 };
  for (const inst of rows) {
    let url = inst.website.trim(); if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const home = await fetchHtml(url); // eslint-disable-line no-await-in-loop
    if (!home) { stats.fetch_failed += 1; continue; }
    const admUrl = findAdmissionsUrl(home, url) || url;
    const page = admUrl === url ? home : (await fetchHtml(admUrl)) || home; // eslint-disable-line no-await-in-loop
    stats.fetched += 1;
    const clean = cleanHtml(page);
    const deadlines = extractDeadlines(clean);
    const { fields, signals } = extractRequirements(clean);
    if (!deadlines.length && signals < 2) { stats.no_data += 1; continue; }
    if (dryRun) {
      console.log(`  ~ ${inst.canonical_name}: ${deadlines.length} deadlines, ${signals} req-signals (${admUrl})`);
      stats.deadlines += deadlines.length; if (signals >= 2) stats.requirements += 1; continue;
    }
    const now = new Date().toISOString();
    stats.deadlines += await upsertDeadlines(pool, inst.id, deadlines, admUrl, now); // eslint-disable-line no-await-in-loop
    if (signals >= 2) stats.requirements += await insertRequirements(pool, inst.id, fields, admUrl, now); // eslint-disable-line no-await-in-loop
    console.log(`  ✓ ${inst.canonical_name}: +${deadlines.length} deadlines, ${signals >= 2 ? '+req' : ''} (${inst.country_code})`);
  }
  if (!dryRun && (stats.deadlines || stats.requirements)) {
    try { await pool.query('REFRESH MATERIALIZED VIEW canonical.mv_college_cards'); } catch { /* ignore */ }
  }
  console.log(`\nDone: ${JSON.stringify(stats)}`);
  await pool.end();
}

main().catch((e) => { console.error('runAdmissionsRolling failed:', e.message); process.exit(1); });
