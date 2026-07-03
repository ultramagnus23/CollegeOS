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
  'latest.aid.median_debt.completers.overall',
  'latest.aid.pell_grant_rate',
  'latest.repayment.3_yr_default_rate',
  'latest.student.share_firstgeneration',
  'latest.student.size',
  'latest.student.enrollment.undergrad_12_month',
  'latest.cost.avg_net_price.public',
  'latest.cost.avg_net_price.private',
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

async function fetchChunk(ids, attempt = 1) {
  const url = `${API_BASE}?id=${ids.join(',')}&per_page=100&fields=${FIELDS}&api_key=${API_KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Scorecard API ${res.status} ${res.statusText}`);
    const json = await res.json();
    return json.results || [];
  } catch (e) {
    // Transient network blips are common over a long-running batch; retry
    // twice with backoff before letting the chunk fail for real.
    if (attempt >= 3) throw e;
    await new Promise((r) => setTimeout(r, attempt * 1500));
    return fetchChunk(ids, attempt + 1);
  }
}

function mapRow(r) {
  const sat25r = num(r['latest.admissions.sat_scores.25th_percentile.critical_reading']);
  const sat75r = num(r['latest.admissions.sat_scores.75th_percentile.critical_reading']);
  const sat25m = num(r['latest.admissions.sat_scores.25th_percentile.math']);
  const sat75m = num(r['latest.admissions.sat_scores.75th_percentile.math']);
  const tuitionIn = num(r['latest.cost.tuition.in_state']);
  const tuitionOut = num(r['latest.cost.tuition.out_of_state']);

  return {
    ipeds: String(r.id),
    name: r['school.name'],
    acceptance_rate: num(r['latest.admissions.admission_rate.overall']),
    sat_50: num(r['latest.admissions.sat_scores.average.overall']),
    sat_25: sumOrNull(sat25r, sat25m),
    sat_75: sumOrNull(sat75r, sat75m),
    // migration-127 fields: canonical.v_college_cards_extended reads these
    // names, not the sat_25/sat_75/tuition_in_state/median_start_salary
    // columns above (those feed older, pre-127 readers only).
    sat_total_25: sumOrNull(sat25r, sat25m),
    sat_total_75: sumOrNull(sat75r, sat75m),
    sat_ebrw_25: sat25r,
    sat_ebrw_75: sat75r,
    sat_math_25: sat25m,
    sat_math_75: sat75m,
    act_50: num(r['latest.admissions.act_scores.midpoint.cumulative']),
    act_25: num(r['latest.admissions.act_scores.25th_percentile.cumulative']),
    act_75: num(r['latest.admissions.act_scores.75th_percentile.cumulative']),
    // NOTE: applicants.total/admitted.total/enrolled.total (and thus yield_rate)
    // are no longer exposed by the College Scorecard API (verified live 2026-07-02
    // against known institutions — the fields return nothing) — do not resurrect
    // this without confirming the current API data dictionary first.
    cost_of_attendance: num(r['latest.cost.attendance.academic_year']),
    tuition_in_state: tuitionIn,
    tuition_out_state: tuitionOut,
    tuition_domestic: tuitionIn,
    avg_debt_at_graduation: num(r['latest.aid.median_debt.completers.overall']),
    net_price: num(r['latest.cost.avg_net_price.public']) ?? num(r['latest.cost.avg_net_price.private']),
    pell_grant_rate: pct(r['latest.aid.pell_grant_rate']),
    loan_default_rate_3yr: pct(r['latest.repayment.3_yr_default_rate']),
    percent_first_gen: pct(r['latest.student.share_firstgeneration']),
    enrollment: num(r['latest.student.size']),
    undergraduate_enrollment: num(r['latest.student.enrollment.undergrad_12_month']),
    graduation_rate_4yr: pct(r['latest.completion.completion_rate_4yr_100nt']),
    graduation_rate_6yr: pct(r['latest.completion.completion_rate_4yr_150nt']),
    median_start_salary: num(r['latest.earnings.6_yrs_after_entry.median']),
    median_mid_career_salary: num(r['latest.earnings.10_yrs_after_entry.median']),
    median_salary_1yr: num(r['latest.earnings.6_yrs_after_entry.median']),
    median_salary_5yr: num(r['latest.earnings.10_yrs_after_entry.median']),
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
         (institution_id, data_year, admissions_cycle, acceptance_rate, sat_25, sat_50, sat_75, act_25, act_50, act_75,
          sat_total_25, sat_total_75, sat_ebrw_25, sat_ebrw_75, sat_math_25, sat_math_75,
          source_attribution, updated_at)
       VALUES ($1,$2,'regular',$3,$4,$5,$6,$7,$8,$9,
               $10,$11,$12,$13,$14,$15,
               $16::jsonb, now())
       ON CONFLICT (institution_id, data_year, admissions_cycle) DO UPDATE SET
         acceptance_rate=COALESCE(EXCLUDED.acceptance_rate, canonical.institution_admissions.acceptance_rate),
         sat_25=COALESCE(EXCLUDED.sat_25, canonical.institution_admissions.sat_25),
         sat_50=COALESCE(EXCLUDED.sat_50, canonical.institution_admissions.sat_50),
         sat_75=COALESCE(EXCLUDED.sat_75, canonical.institution_admissions.sat_75),
         act_25=COALESCE(EXCLUDED.act_25, canonical.institution_admissions.act_25),
         act_50=COALESCE(EXCLUDED.act_50, canonical.institution_admissions.act_50),
         act_75=COALESCE(EXCLUDED.act_75, canonical.institution_admissions.act_75),
         sat_total_25=COALESCE(EXCLUDED.sat_total_25, canonical.institution_admissions.sat_total_25),
         sat_total_75=COALESCE(EXCLUDED.sat_total_75, canonical.institution_admissions.sat_total_75),
         sat_ebrw_25=COALESCE(EXCLUDED.sat_ebrw_25, canonical.institution_admissions.sat_ebrw_25),
         sat_ebrw_75=COALESCE(EXCLUDED.sat_ebrw_75, canonical.institution_admissions.sat_ebrw_75),
         sat_math_25=COALESCE(EXCLUDED.sat_math_25, canonical.institution_admissions.sat_math_25),
         sat_math_75=COALESCE(EXCLUDED.sat_math_75, canonical.institution_admissions.sat_math_75),
         source_attribution=EXCLUDED.source_attribution, updated_at=now()`,
      [institutionId, DATA_YEAR, d.acceptance_rate, d.sat_25, d.sat_50, d.sat_75, d.act_25, d.act_50, d.act_75,
        d.sat_total_25, d.sat_total_75, d.sat_ebrw_25, d.sat_ebrw_75, d.sat_math_25, d.sat_math_75,
        attribution],
    );
  }

  if (d.cost_of_attendance != null || d.tuition_in_state != null || d.tuition_out_state != null || d.net_price != null || d.pell_grant_rate != null) {
    await client.query(
      `INSERT INTO canonical.institution_financials
         (institution_id, data_year, cost_of_attendance, tuition_in_state, tuition_out_state,
          tuition_domestic, avg_debt_at_graduation, net_price, pell_grant_rate, source_attribution, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb, now())
       ON CONFLICT ON CONSTRAINT uq_institution_financials DO UPDATE SET
         cost_of_attendance=COALESCE(EXCLUDED.cost_of_attendance, canonical.institution_financials.cost_of_attendance),
         tuition_in_state=COALESCE(EXCLUDED.tuition_in_state, canonical.institution_financials.tuition_in_state),
         tuition_out_state=COALESCE(EXCLUDED.tuition_out_state, canonical.institution_financials.tuition_out_state),
         tuition_domestic=COALESCE(EXCLUDED.tuition_domestic, canonical.institution_financials.tuition_domestic),
         avg_debt_at_graduation=COALESCE(EXCLUDED.avg_debt_at_graduation, canonical.institution_financials.avg_debt_at_graduation),
         net_price=COALESCE(EXCLUDED.net_price, canonical.institution_financials.net_price),
         pell_grant_rate=COALESCE(EXCLUDED.pell_grant_rate, canonical.institution_financials.pell_grant_rate),
         source_attribution=EXCLUDED.source_attribution, updated_at=now()`,
      [institutionId, DATA_YEAR, d.cost_of_attendance, d.tuition_in_state, d.tuition_out_state,
        d.tuition_domestic, d.avg_debt_at_graduation, d.net_price, d.pell_grant_rate, attribution],
    );
  }

  if (d.graduation_rate_4yr != null || d.graduation_rate_6yr != null || d.median_start_salary != null || d.median_mid_career_salary != null || d.loan_default_rate_3yr != null) {
    await client.query(
      `INSERT INTO canonical.institution_outcomes
         (institution_id, data_year, graduation_rate_4yr, graduation_rate_6yr, median_start_salary, median_mid_career_salary,
          median_salary_1yr, median_salary_5yr, loan_default_rate_3yr, source_attribution, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb, now())
       ON CONFLICT ON CONSTRAINT uq_institution_outcomes DO UPDATE SET
         graduation_rate_4yr=COALESCE(EXCLUDED.graduation_rate_4yr, canonical.institution_outcomes.graduation_rate_4yr),
         graduation_rate_6yr=COALESCE(EXCLUDED.graduation_rate_6yr, canonical.institution_outcomes.graduation_rate_6yr),
         median_start_salary=COALESCE(EXCLUDED.median_start_salary, canonical.institution_outcomes.median_start_salary),
         median_mid_career_salary=COALESCE(EXCLUDED.median_mid_career_salary, canonical.institution_outcomes.median_mid_career_salary),
         median_salary_1yr=COALESCE(EXCLUDED.median_salary_1yr, canonical.institution_outcomes.median_salary_1yr),
         median_salary_5yr=COALESCE(EXCLUDED.median_salary_5yr, canonical.institution_outcomes.median_salary_5yr),
         loan_default_rate_3yr=COALESCE(EXCLUDED.loan_default_rate_3yr, canonical.institution_outcomes.loan_default_rate_3yr),
         source_attribution=EXCLUDED.source_attribution, updated_at=now()`,
      [institutionId, DATA_YEAR, d.graduation_rate_4yr, d.graduation_rate_6yr, d.median_start_salary, d.median_mid_career_salary,
        d.median_salary_1yr, d.median_salary_5yr, d.loan_default_rate_3yr, attribution],
    );
  }

  if (d.percent_first_gen != null) {
    await client.query(
      `INSERT INTO canonical.institution_demographics
         (institution_id, data_year, percent_first_gen, source_attribution, updated_at)
       VALUES ($1,$2,$3,$4::jsonb, now())
       ON CONFLICT (institution_id, data_year_key) DO UPDATE SET
         percent_first_gen=COALESCE(EXCLUDED.percent_first_gen, canonical.institution_demographics.percent_first_gen),
         source_attribution=EXCLUDED.source_attribution, updated_at=now()`,
      [institutionId, DATA_YEAR, d.percent_first_gen, attribution],
    );
  }

  // total_enrollment lives in institutions.metadata (read by the card);
  // undergraduate_enrollment is a real migration-127 column. Always bump
  // updated_at so the rolling refresh cycle advances regardless.
  await client.query(
    `UPDATE canonical.institutions
       SET metadata = CASE WHEN $2::int IS NULL THEN metadata
                           ELSE jsonb_set(coalesce(metadata,'{}'::jsonb), '{total_enrollment}', to_jsonb($2::int)) END,
           undergraduate_enrollment = COALESCE($3::int, undergraduate_enrollment),
           updated_at = now()
     WHERE id = $1`,
    [institutionId, d.enrollment, d.undergraduate_enrollment],
  );
}

async function main() {
  if (!API_KEY) { console.error('Missing COLLEGE_SCORECARD_API_KEY'); process.exit(2); }
  const pool = dbManager.initialize();
  const client = await pool.connect();
  // A checked-out client is its own EventEmitter; a failed statement (e.g. a
  // constraint violation) can leave the underlying socket in a state that
  // later drops with an unhandled 'error' event, crashing the whole batch.
  client.on('error', (err) => console.error('  pg client error (continuing):', err.message));
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
    const touchedIpeds = new Set();
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
        touchedIpeds.add(d.ipeds);
        const hasData = d.acceptance_rate != null || d.cost_of_attendance != null || d.median_start_salary != null || d.enrollment != null || d.sat_50 != null;
        if (!hasData) { summary.noData += 1; }
        if (DRY) { if (hasData) console.log(`  ${d.ipeds} ${d.name}: accept=${d.acceptance_rate} cost=${d.cost_of_attendance} enroll=${d.enrollment} sal10=${d.median_mid_career_salary}`); continue; }
        try { await upsert(client, institutionId, d); summary.upserted += 1; }
        catch (e) { summary.errors += 1; console.error(`  upsert ${d.ipeds} failed:`, e.message); }
      }
      process.stdout.write(`  progress ${Math.min(i + CHUNK, ids.length)}/${ids.length}\r`);
    }

    // Institutions Scorecard never returned (bad/stale ipeds id, closed
    // school, etc.) previously never got updated_at bumped, so they stuck
    // permanently at the front of the "oldest" queue and starved every
    // subsequent run from ever reaching real institutions past them. Bump
    // them too (no data written) so the rolling cycle actually advances.
    const untouched = targets.filter((t) => t.ipeds && !touchedIpeds.has(String(t.ipeds)));
    if (!DRY && untouched.length > 0) {
      await client.query(
        `UPDATE canonical.institutions SET updated_at = now() WHERE id = ANY($1::uuid[])`,
        [untouched.map((t) => t.id)],
      );
      summary.skippedNoMatch = untouched.length;
    }

    if (!DRY && summary.upserted > 0) {
      console.log('\nRefreshing materialized view...');
      // Long batches (many minutes) can outlive the checked-out client's
      // connection (pooler idle/statement timeout); use a fresh query from
      // the pool for this step rather than the same long-lived client so a
      // dead connection here doesn't discard an otherwise-successful run.
      try {
        await pool.query('REFRESH MATERIALIZED VIEW canonical.mv_college_cards');
      } catch (e) {
        console.error('MV refresh failed (data was still written; refresh manually):', e.message);
      }
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
