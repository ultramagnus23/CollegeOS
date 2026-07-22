// Phase 2 data-seed: refreshes real College Scorecard data for exactly the 323 US
// institutions in data/top_colleges_target.json (the top-300/400 seed target list), rather
// than refreshScorecard.js's normal "oldest N of all ~6,300 US institutions" rolling cycle.
// Field mapping / upsert logic is copied from refreshScorecard.js (kept in sync manually --
// that script's field list and upsert statements are the source of truth for schema shape;
// this script exists only to change WHICH institutions get refreshed and WHEN).
//
// Idempotent: same ON CONFLICT ... DO UPDATE pattern as refreshScorecard.js, safe to re-run.
// Only writes fields that are non-null in the Scorecard response (COALESCE against the
// existing value) -- never overwrites real data with a null, never fabricates.
//
// Usage:
//   node scripts/phase2_seed_target_scorecard.js --start=0 --count=50   # batch of 50
//   node scripts/phase2_seed_target_scorecard.js --dry                  # preview all, no writes

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const dbManager = require('../src/config/database');

const API_KEY = process.env.COLLEGE_SCORECARD_API_KEY || process.env.DATA_GOV_API_KEY;
const API_BASE = 'https://api.data.gov/ed/collegescorecard/v1/schools';
const CHUNK = 90;
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
  'latest.cost.booksupply',
  'latest.cost.roomboard.oncampus',
  'latest.cost.otherexpense.oncampus',
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
const START = Math.max(0, parseInt(arg('start', '0'), 10) || 0);
const COUNT = arg('count', null) !== null ? parseInt(arg('count'), 10) : null;

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const sumOrNull = (a, b) => (num(a) != null && num(b) != null ? num(a) + num(b) : null);
const pct = (frac) => (num(frac) != null ? Math.round(num(frac) * 1000) / 10 : null);

async function fetchChunk(ids, attempt = 1) {
  const url = `${API_BASE}?id=${ids.join(',')}&per_page=100&fields=${FIELDS}&api_key=${API_KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Scorecard API ${res.status} ${res.statusText}`);
    const json = await res.json();
    return json.results || [];
  } catch (e) {
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
    sat_total_25: sumOrNull(sat25r, sat25m),
    sat_total_75: sumOrNull(sat75r, sat75m),
    sat_ebrw_25: sat25r,
    sat_ebrw_75: sat75r,
    sat_math_25: sat25m,
    sat_math_75: sat75m,
    act_50: num(r['latest.admissions.act_scores.midpoint.cumulative']),
    act_25: num(r['latest.admissions.act_scores.25th_percentile.cumulative']),
    act_75: num(r['latest.admissions.act_scores.75th_percentile.cumulative']),
    cost_of_attendance: num(r['latest.cost.attendance.academic_year']),
    tuition_in_state: tuitionIn,
    tuition_out_state: tuitionOut,
    tuition_domestic: tuitionIn,
    avg_debt_at_graduation: num(r['latest.aid.median_debt.completers.overall']),
    net_price: num(r['latest.cost.avg_net_price.public']) ?? num(r['latest.cost.avg_net_price.private']),
    books_cost: num(r['latest.cost.booksupply']),
    housing_cost: num(r['latest.cost.roomboard.oncampus']),
    personal_expenses: num(r['latest.cost.otherexpense.oncampus']),
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

  if (d.cost_of_attendance != null || d.tuition_in_state != null || d.tuition_out_state != null || d.net_price != null || d.pell_grant_rate != null || d.books_cost != null || d.housing_cost != null || d.personal_expenses != null) {
    await client.query(
      `INSERT INTO canonical.institution_financials
         (institution_id, data_year, cost_of_attendance, tuition_in_state, tuition_out_state,
          tuition_domestic, avg_debt_at_graduation, net_price, pell_grant_rate,
          books_cost, housing_cost, personal_expenses, source_attribution, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb, now())
       ON CONFLICT ON CONSTRAINT uq_institution_financials DO UPDATE SET
         cost_of_attendance=COALESCE(EXCLUDED.cost_of_attendance, canonical.institution_financials.cost_of_attendance),
         tuition_in_state=COALESCE(EXCLUDED.tuition_in_state, canonical.institution_financials.tuition_in_state),
         tuition_out_state=COALESCE(EXCLUDED.tuition_out_state, canonical.institution_financials.tuition_out_state),
         tuition_domestic=COALESCE(EXCLUDED.tuition_domestic, canonical.institution_financials.tuition_domestic),
         avg_debt_at_graduation=COALESCE(EXCLUDED.avg_debt_at_graduation, canonical.institution_financials.avg_debt_at_graduation),
         net_price=COALESCE(EXCLUDED.net_price, canonical.institution_financials.net_price),
         pell_grant_rate=COALESCE(EXCLUDED.pell_grant_rate, canonical.institution_financials.pell_grant_rate),
         books_cost=COALESCE(EXCLUDED.books_cost, canonical.institution_financials.books_cost),
         housing_cost=COALESCE(EXCLUDED.housing_cost, canonical.institution_financials.housing_cost),
         personal_expenses=COALESCE(EXCLUDED.personal_expenses, canonical.institution_financials.personal_expenses),
         source_attribution=EXCLUDED.source_attribution, updated_at=now()`,
      [institutionId, DATA_YEAR, d.cost_of_attendance, d.tuition_in_state, d.tuition_out_state,
        d.tuition_domestic, d.avg_debt_at_graduation, d.net_price, d.pell_grant_rate,
        d.books_cost, d.housing_cost, d.personal_expenses, attribution],
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

  const target = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', '..', 'data', 'top_colleges_target.json'), 'utf8'));
  const usTargets = target.institutions.filter((i) => i.scorecard_linkable);
  const slice = COUNT != null ? usTargets.slice(START, START + COUNT) : usTargets.slice(START);

  const pool = dbManager.initialize();
  const client = await pool.connect();
  client.on('error', (err) => console.error('  pg client error (continuing):', err.message));
  const summary = { selected: slice.length, fetched: 0, upserted: 0, noData: 0, errors: 0 };
  try {
    console.log(`Seeding ${slice.length} target-list institutions (offset ${START}, data_year ${DATA_YEAR})${DRY ? ' [DRY RUN]' : ''}`);
    const byIpeds = new Map(slice.map((t) => [String(t.ipeds), t.institution_id]));
    const ids = [...byIpeds.keys()];

    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      let results;
      try { results = await fetchChunk(chunk); }
      catch (e) { summary.errors += chunk.length; console.error(`chunk fetch failed:`, e.message); continue; }
      summary.fetched += results.length;
      for (const r of results) {
        const d = mapRow(r);
        const institutionId = byIpeds.get(d.ipeds);
        if (!institutionId) continue;
        const hasData = d.acceptance_rate != null || d.cost_of_attendance != null || d.median_start_salary != null || d.enrollment != null || d.sat_50 != null;
        if (!hasData) summary.noData += 1;
        if (DRY) { console.log(`  ${d.ipeds} ${d.name}: accept=${d.acceptance_rate} sat=${d.sat_50} cost=${d.cost_of_attendance} grad4=${d.graduation_rate_4yr}`); continue; }
        try { await upsert(client, institutionId, d); summary.upserted += 1; }
        catch (e) { summary.errors += 1; console.error(`  upsert ${d.ipeds} failed:`, e.message); }
      }
    }

    if (!DRY && summary.upserted > 0) {
      console.log('Refreshing materialized view...');
      try { await pool.query('REFRESH MATERIALIZED VIEW canonical.mv_college_cards'); }
      catch (e) { console.error('MV refresh failed (data was still written; refresh manually):', e.message); }
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
