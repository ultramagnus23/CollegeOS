// backend/scripts/refreshScorecard.js
//
// Automated, batched college-data refresh from the U.S. Dept. of Education
// College Scorecard API (real, verified source — no scraping, no fabrication).
// Upserts DIRECTLY into the canonical.* tables the app reads, keyed on the IPEDS
// unit id stored in canonical.institutions.canonical_external_ids->>'ipeds'.
//
// Designed for a rolling weekly cycle: each run takes the N least-recently-updated
// US institutions, so a daily `--batch=1000` refreshes all ~6,200 US schools in
// about a week. Re-running is idempotent (ON CONFLICT upserts).
//
// Usage:
//   node scripts/refreshScorecard.js --batch=1000          # refresh oldest 1000
//   node scripts/refreshScorecard.js --batch=5 --dry       # preview, no writes
// Requires COLLEGE_SCORECARD_API_KEY (or DATA_GOV_API_KEY) in backend/.env.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const dbManager = require('../src/config/database');

const API_KEY = process.env.COLLEGE_SCORECARD_API_KEY || process.env.DATA_GOV_API_KEY;
const API_BASE = 'https://api.data.gov/ed/collegescorecard/v1/schools';
const CHUNK = 90; // ids per API call
const DATA_YEAR = new Date().getFullYear();
const SOURCE_URL = 'https://collegescorecard.ed.gov/';

const FIELDS = [
  'id', 'school.name',
  'latest.admissions.admission_rate.overall',
  'latest.admissions.sat_scores.average.overall',
  'latest.admissions.sat_scores.25th_percentile.critical_reading',
  'latest.admissions.sat_scores.75th_percentile.critical_reading',
  'latest.admissions.sat_scores.25th_percentile.math',
  'latest.admissions.sat_scores.75th_percentile.math',
  'latest.admissions.act_scores.midpoint.cumulative',
  'latest.admissions.act_scores.25th_percentile.cumulative',
  'latest.admissions.act_scores.75th_percentile.cumulative',
  'latest.cost.attendance.academic_year',
  'latest.cost.tuition.in_state',
  'latest.cost.tuition.out_of_state',
  'latest.student.size',
  'latest.completion.completion_rate_4yr_100nt',
  'latest.completion.completion_rate_4yr_150nt',
  'latest.earnings.6_yrs_after_entry.median',
  'latest.earnings.10_yrs_after_entry.median',
].join(',');

const arg = (name, def) => {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`));
  return m ? m.split('=')[1] : def;
};
const DRY = process.argv.includes('--dry');
const BATCH = Math.max(1, parseInt(arg('batch', '1000'), 10) || 1000);

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const sumOrNull = (a, b) => (num(a) != null && num(b) != null ? num(a) + num(b) : null);
const pct = (frac) => (num(frac) != null ? Math.round(num(frac) * 1000) / 10 : null); // 0-1 -> 0-100

async function fetchChunk(ids) {
  const url = `${API_BASE}?id=${ids.join(',')}&per_page=100&fields=${FIELDS}&api_key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Scorecard API ${res.status} ${res.statusText}`);
  const json = await res.json();
  return json.results || [];
}

function mapRow(r) {
  return {
    ipeds: String(r.id),
    name: r['school.name'],
    acceptance_rate: num(r['latest.admissions.admission_rate.overall']),
    sat_50: num(r['latest.admissions.sat_scores.average.overall']),
    sat_25: sumOrNull(r['latest.admissions.sat_scores.25th_percentile.critical_reading'], r['latest.admissions.sat_scores.25th_percentile.math']),
    sat_75: sumOrNull(r['latest.admissions.sat_scores.75th_percentile.critical_reading'], r['latest.admissions.sat_scores.75th_percentile.math']),
    act_50: num(r['latest.admissions.act_scores.midpoint.cumulative']),
    act_25: num(r['latest.admissions.act_scores.25th_percentile.cumulative']),
    act_75: num(r['latest.admissions.act_scores.75th_percentile.cumulative']),
    cost_of_attendance: num(r['latest.cost.attendance.academic_year']),
    tuition_in_state: num(r['latest.cost.tuition.in_state']),
    tuition_out_state: num(r['latest.cost.tuition.out_of_state']),
    enrollment: num(r['latest.student.size']),
    graduation_rate_4yr: pct(r['latest.completion.completion_rate_4yr_100nt']),
    graduation_rate_6yr: pct(r['latest.completion.completion_rate_4yr_150nt']),
    median_start_salary: num(r['latest.earnings.6_yrs_after_entry.median']),
    median_mid_career_salary: num(r['latest.earnings.10_yrs_after_entry.median']),
  };
}

async function upsert(client, institutionId, d) {
  const attribution = JSON.stringify({
    source: 'college_scorecard', source_url: SOURCE_URL, scorecard_id: d.ipeds,
    last_verified: new Date().toISOString(), confidence: 0.95,
  });

  if (d.acceptance_rate != null || d.sat_50 != null || d.act_50 != null) {
    await client.query(
      `INSERT INTO canonical.institution_admissions
         (institution_id, data_year, admissions_cycle, acceptance_rate, sat_25, sat_50, sat_75, act_25, act_50, act_75, source_attribution, updated_at)
       VALUES ($1,$2,'regular',$3,$4,$5,$6,$7,$8,$9,$10::jsonb, now())
       ON CONFLICT (institution_id, data_year, admissions_cycle) DO UPDATE SET
         acceptance_rate=COALESCE(EXCLUDED.acceptance_rate, canonical.institution_admissions.acceptance_rate),
         sat_25=COALESCE(EXCLUDED.sat_25, canonical.institution_admissions.sat_25),
         sat_50=COALESCE(EXCLUDED.sat_50, canonical.institution_admissions.sat_50),
         sat_75=COALESCE(EXCLUDED.sat_75, canonical.institution_admissions.sat_75),
         act_25=COALESCE(EXCLUDED.act_25, canonical.institution_admissions.act_25),
         act_50=COALESCE(EXCLUDED.act_50, canonical.institution_admissions.act_50),
         act_75=COALESCE(EXCLUDED.act_75, canonical.institution_admissions.act_75),
         source_attribution=EXCLUDED.source_attribution, updated_at=now()`,
      [institutionId, DATA_YEAR, d.acceptance_rate, d.sat_25, d.sat_50, d.sat_75, d.act_25, d.act_50, d.act_75, attribution],
    );
  }

  if (d.cost_of_attendance != null || d.tuition_in_state != null || d.tuition_out_state != null) {
    await client.query(
      `INSERT INTO canonical.institution_financials
         (institution_id, data_year, cost_of_attendance, tuition_in_state, tuition_out_state, source_attribution, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb, now())
       ON CONFLICT ON CONSTRAINT uq_institution_financials DO UPDATE SET
         cost_of_attendance=COALESCE(EXCLUDED.cost_of_attendance, canonical.institution_financials.cost_of_attendance),
         tuition_in_state=COALESCE(EXCLUDED.tuition_in_state, canonical.institution_financials.tuition_in_state),
         tuition_out_state=COALESCE(EXCLUDED.tuition_out_state, canonical.institution_financials.tuition_out_state),
         source_attribution=EXCLUDED.source_attribution, updated_at=now()`,
      [institutionId, DATA_YEAR, d.cost_of_attendance, d.tuition_in_state, d.tuition_out_state, attribution],
    );
  }

  if (d.graduation_rate_4yr != null || d.graduation_rate_6yr != null || d.median_start_salary != null || d.median_mid_career_salary != null) {
    await client.query(
      `INSERT INTO canonical.institution_outcomes
         (institution_id, data_year, graduation_rate_4yr, graduation_rate_6yr, median_start_salary, median_mid_career_salary, source_attribution, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb, now())
       ON CONFLICT ON CONSTRAINT uq_institution_outcomes DO UPDATE SET
         graduation_rate_4yr=COALESCE(EXCLUDED.graduation_rate_4yr, canonical.institution_outcomes.graduation_rate_4yr),
         graduation_rate_6yr=COALESCE(EXCLUDED.graduation_rate_6yr, canonical.institution_outcomes.graduation_rate_6yr),
         median_start_salary=COALESCE(EXCLUDED.median_start_salary, canonical.institution_outcomes.median_start_salary),
         median_mid_career_salary=COALESCE(EXCLUDED.median_mid_career_salary, canonical.institution_outcomes.median_mid_career_salary),
         source_attribution=EXCLUDED.source_attribution, updated_at=now()`,
      [institutionId, DATA_YEAR, d.graduation_rate_4yr, d.graduation_rate_6yr, d.median_start_salary, d.median_mid_career_salary, attribution],
    );
  }

  // enrollment lives in institutions.metadata.total_enrollment (read by the card);
  // always bump updated_at so the rolling cycle advances.
  await client.query(
    `UPDATE canonical.institutions
       SET metadata = CASE WHEN $2::int IS NULL THEN metadata
                           ELSE jsonb_set(coalesce(metadata,'{}'::jsonb), '{total_enrollment}', to_jsonb($2::int)) END,
           updated_at = now()
     WHERE id = $1`,
    [institutionId, d.enrollment],
  );
}

async function main() {
  if (!API_KEY) { console.error('Missing COLLEGE_SCORECARD_API_KEY'); process.exit(2); }
  const pool = dbManager.initialize();
  const client = await pool.connect();
  const summary = { selected: 0, fetched: 0, upserted: 0, noData: 0, errors: 0 };
  try {
    const { rows: targets } = await client.query(
      `SELECT id, canonical_external_ids->>'ipeds' AS ipeds
       FROM canonical.institutions
       WHERE country_code = 'US' AND coalesce(canonical_external_ids->>'ipeds','') <> ''
       ORDER BY updated_at ASC
       LIMIT $1`, [BATCH]);
    summary.selected = targets.length;
    const byIpeds = new Map(targets.map((t) => [String(t.ipeds), t.id]));
    console.log(`Refreshing ${targets.length} least-recently-updated US institutions (data_year ${DATA_YEAR})${DRY ? ' [DRY RUN]' : ''}`);

    const ids = [...byIpeds.keys()];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      let results;
      try { results = await fetchChunk(chunk); }
      catch (e) { summary.errors += chunk.length; console.error(`chunk ${i / CHUNK} fetch failed:`, e.message); continue; }
      summary.fetched += results.length;
      for (const r of results) {
        const d = mapRow(r);
        const institutionId = byIpeds.get(d.ipeds);
        if (!institutionId) continue;
        const hasData = d.acceptance_rate != null || d.cost_of_attendance != null || d.median_start_salary != null || d.enrollment != null || d.sat_50 != null;
        if (!hasData) { summary.noData += 1; }
        if (DRY) { if (hasData) console.log(`  ${d.ipeds} ${d.name}: accept=${d.acceptance_rate} cost=${d.cost_of_attendance} enroll=${d.enrollment} sal10=${d.median_mid_career_salary}`); continue; }
        try { await upsert(client, institutionId, d); summary.upserted += 1; }
        catch (e) { summary.errors += 1; console.error(`  upsert ${d.ipeds} failed:`, e.message); }
      }
      process.stdout.write(`  progress ${Math.min(i + CHUNK, ids.length)}/${ids.length}\r`);
    }

    if (!DRY && summary.upserted > 0) {
      console.log('\nRefreshing materialized view...');
      await client.query('REFRESH MATERIALIZED VIEW canonical.mv_college_cards');
    }
    console.log('\nDone:', JSON.stringify(summary));
  } catch (e) {
    console.error('FATAL', e.message); process.exitCode = 1;
  } finally {
    client.release();
    await dbManager.close();
  }
}

main();
