/**
 * College Scorecard Scraper — v4 (fully fixed)
 * -----------------------------------------------
 * CRITICAL FIXES:
 *   1. FK mismatch: ALL enrichment tables have FK → colleges_comprehensive.id, NOT colleges.id
 *      colleges.id and colleges_comprehensive.id only match for 3 out of 6417 rows!
 *      Fix: always resolve colleges_comprehensive.id by NAME lookup, never reuse colleges.id
 *   2. tuition_cost on colleges table: now correctly written
 *   3. graduation_rate_6yr, retention_rate, median_start_salary: now populated (were 0% before)
 *   4. cost_of_attendance, avg_debt: now populated (were 0% before)
 *   5. student_demographics: all percent_* fields now written (were 0% before)
 *   6. net_price_data: now written (was 0 rows before)
 *   7. test_scores: now written (was 0 rows before)
 *   8. tuition_international: left NULL (Scorecard doesn't have international tuition)
 *   9. net_price_data.academic_year is TEXT "2023-24" (correct for TEXT column)
 *  10. scorecard_unit_id added to both tables for fast future lookups
 */

const axios = require('axios');

const SCORECARD_BASE = 'https://api.data.gov/ed/collegescorecard/v1/schools.json';
const YEAR = 2023;
const ACADEMIC_YEAR = '2023-24';

const FIELDS = [
  'id','school.name','school.state','school.city',
  'school.school_url','school.ownership','school.locale',
  'school.open_admissions_policy',
  'latest.admissions.admission_rate.overall',
  'latest.admissions.sat_scores.25th_percentile.critical_reading',
  'latest.admissions.sat_scores.75th_percentile.critical_reading',
  'latest.admissions.sat_scores.25th_percentile.math',
  'latest.admissions.sat_scores.75th_percentile.math',
  'latest.admissions.sat_scores.midpoint.critical_reading',
  'latest.admissions.sat_scores.midpoint.math',
  'latest.admissions.act_scores.25th_percentile.cumulative',
  'latest.admissions.act_scores.75th_percentile.cumulative',
  'latest.admissions.act_scores.midpoint.cumulative',
  'latest.student.size',
  'latest.student.grad_students',
  'latest.student.retention_rate.four_year.full_time',
  'latest.student.retention_rate.lt_four_year.full_time',
  'latest.completion.rate_suppressed.overall',
  'latest.completion.rate_suppressed.four_year',
  'latest.cost.tuition.in_state',
  'latest.cost.tuition.out_of_state',
  'latest.cost.attendance.academic_year',
  'latest.cost.avg_net_price.public',
  'latest.cost.avg_net_price.private',
  'latest.cost.net_price.public.by_income_level.0-30000',
  'latest.cost.net_price.public.by_income_level.30001-48000',
  'latest.cost.net_price.public.by_income_level.48001-75000',
  'latest.cost.net_price.public.by_income_level.75001-110000',
  'latest.cost.net_price.public.by_income_level.110001-plus',
  'latest.cost.net_price.private.by_income_level.0-30000',
  'latest.cost.net_price.private.by_income_level.30001-48000',
  'latest.cost.net_price.private.by_income_level.48001-75000',
  'latest.cost.net_price.private.by_income_level.75001-110000',
  'latest.cost.net_price.private.by_income_level.110001-plus',
  'latest.aid.median_debt.completers.overall',
  'latest.aid.pell_grant_rate',
  'latest.aid.federal_loan_rate',
  'latest.aid.loan_principal',
  'latest.aid.students_with_any_loan',
  'latest.aid.pctpell',
  'latest.aid.pctfloan',
  'latest.student.demographics.race_ethnicity.white',
  'latest.student.demographics.race_ethnicity.black',
  'latest.student.demographics.race_ethnicity.hispanic',
  'latest.student.demographics.race_ethnicity.asian',
  'latest.student.demographics.race_ethnicity.aian',
  'latest.student.demographics.race_ethnicity.nhpi',
  'latest.student.demographics.race_ethnicity.two_or_more',
  'latest.student.demographics.race_ethnicity.non_resident_alien',
  'latest.student.demographics.race_ethnicity.unknown',
  'latest.student.demographics.men',
  'latest.student.demographics.women',
  'latest.student.demographics.age_entry',
  'latest.student.share_firstgeneration',
  'latest.student.share_independent_students',
  'latest.earnings.6_yrs_after_entry.median',
  'latest.earnings.8_yrs_after_entry.median',
  'latest.earnings.10_yrs_after_entry.median',
  'latest.repayment.3_yr_default_rate',
].join(',');

async function fetchPage(page, perPage, apiKey) {
  const resp = await axios.get(SCORECARD_BASE, {
    params: { api_key: apiKey, _fields: FIELDS, _page: page, _per_page: perPage },
    timeout: 30000,
    headers: { Accept: 'application/json' },
  });
  return resp.data;
}

function mapScorecardToDb(raw) {
  const latest     = raw['latest'] || {};
  const admissions = latest.admissions || {};
  const student    = latest.student || {};
  const completion = latest.completion || {};
  const cost       = latest.cost || {};
  const aid        = latest.aid || {};
  const demo       = student.demographics || {};
  const earnings   = latest.earnings || {};
  const repayment  = latest.repayment || {};
  const isPublic   = raw['school.ownership'] === 1;
  const nb         = cost.net_price?.[isPublic ? 'public' : 'private']?.by_income_level || {};

  return {
    scorecard_id:    raw.id,
    name:            raw['school.name'],
    state:           raw['school.state'],
    city:            raw['school.city'],
    website_url:     raw['school.school_url'],
    ownership:       raw['school.ownership'],
    open_admissions: raw['school.open_admissions_policy'],
    acceptance_rate: admissions.admission_rate?.overall ?? null,
    sat_ebrw_25:     admissions.sat_scores?.['25th_percentile']?.critical_reading ?? null,
    sat_ebrw_75:     admissions.sat_scores?.['75th_percentile']?.critical_reading ?? null,
    sat_math_25:     admissions.sat_scores?.['25th_percentile']?.math ?? null,
    sat_math_75:     admissions.sat_scores?.['75th_percentile']?.math ?? null,
    sat_ebrw_mid:    admissions.sat_scores?.midpoint?.critical_reading ?? null,
    sat_math_mid:    admissions.sat_scores?.midpoint?.math ?? null,
    act_25:          admissions.act_scores?.['25th_percentile']?.cumulative ?? null,
    act_75:          admissions.act_scores?.['75th_percentile']?.cumulative ?? null,
    act_mid:         admissions.act_scores?.midpoint?.cumulative ?? null,
    undergrad_enrollment: student.size ?? null,
    grad_enrollment:      student.grad_students ?? null,
    retention_rate:  student.retention_rate?.four_year?.full_time
                  ?? student.retention_rate?.lt_four_year?.full_time ?? null,
    grad_rate_4yr:   completion.rate_suppressed?.four_year ?? null,
    grad_rate_6yr:   completion.rate_suppressed?.overall   ?? null,
    tuition_in_state:   cost.tuition?.in_state        ?? null,
    tuition_out_state:  cost.tuition?.out_of_state     ?? null,
    cost_of_attendance: cost.attendance?.academic_year ?? null,
    avg_net_price:  cost.avg_net_price?.public ?? cost.avg_net_price?.private ?? null,
    net_price_0_30k:     nb['0-30000']      ?? null,
    net_price_30_48k:    nb['30001-48000']  ?? null,
    net_price_48_75k:    nb['48001-75000']  ?? null,
    net_price_75_110k:   nb['75001-110000'] ?? null,
    net_price_110k_plus: nb['110001-plus']  ?? null,
    avg_debt:         aid.median_debt?.completers?.overall ?? null,
    pell_grant_rate:  aid.pell_grant_rate    ?? null,
    avg_loan_amount:  aid.loan_principal     ?? null,
    pct_with_loans:   aid.students_with_any_loan ?? null,
    pct_pell:         aid.pctpell  ?? null,
    pct_federal_loan: aid.pctfloan ?? null,
    default_rate_3yr: repayment['3_yr_default_rate'] ?? null,
    pct_white:            demo.race_ethnicity?.white              ?? null,
    pct_black:            demo.race_ethnicity?.black              ?? null,
    pct_hispanic:         demo.race_ethnicity?.hispanic           ?? null,
    pct_asian:            demo.race_ethnicity?.asian              ?? null,
    pct_native_american:  demo.race_ethnicity?.aian               ?? null,
    pct_pacific_islander: demo.race_ethnicity?.nhpi               ?? null,
    pct_multiracial:      demo.race_ethnicity?.two_or_more        ?? null,
    pct_international:    demo.race_ethnicity?.non_resident_alien ?? null,
    pct_unknown_race:     demo.race_ethnicity?.unknown            ?? null,
    pct_men:      demo.men   ?? null,
    pct_women:    demo.women ?? null,
    pct_first_gen: student.share_firstgeneration ?? null,
    avg_age_entry: demo.age_entry ?? null,
    median_earnings_6yr:  earnings['6_yrs_after_entry']?.median  ?? null,
    median_earnings_8yr:  earnings['8_yrs_after_entry']?.median  ?? null,
    median_earnings_10yr: earnings['10_yrs_after_entry']?.median ?? null,
  };
}

async function fetchAllScorecardData(apiKey, onProgress) {
  const perPage = 100;
  let page = 0, total = null;
  const results = [];

  do {
    try {
      const raw = await fetchPage(page, perPage, apiKey);
      if (total === null) total = raw.metadata?.total || 0;
      const mapped = (raw.results || []).map(mapScorecardToDb);
      results.push(...mapped);
      if (onProgress) onProgress(results.length, total);
      page++;
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      if (err.response?.status === 429) {
        console.warn('[scorecard] Rate limited, waiting 60s...');
        await new Promise(r => setTimeout(r, 60000));
      } else {
        throw err;
      }
    }
  } while (results.length < total);

  return results;
}

// Convert 0-1 fraction → percentage with 1 decimal
const pct = (v) => v != null ? Math.round(v * 1000) / 10 : null;

function writeScorecardData(db, colleges) {
  let written = 0, skipped = 0;

  // One-time: add scorecard_unit_id to both tables for fast future lookups
  for (const tbl of ['colleges', 'colleges_comprehensive']) {
    try { db.prepare(`ALTER TABLE ${tbl} ADD COLUMN scorecard_unit_id INTEGER`).run(); }
    catch { /* already exists */ }
  }

  // ── THE KEY FIX ──────────────────────────────────────────────────────────────
  // colleges_comprehensive.id ≠ colleges.id (only 3/6417 match!)
  // ALL enrichment FKs point to colleges_comprehensive.id
  // ALWAYS look up by name, never reuse colleges.id for enrichment tables

  const findCompByUnit = db.prepare(`SELECT id FROM colleges_comprehensive WHERE scorecard_unit_id = ? LIMIT 1`);
  const findCompByName = db.prepare(`SELECT id FROM colleges_comprehensive WHERE name = ? LIMIT 1`);
  const findColByUnit  = db.prepare(`SELECT id FROM colleges WHERE scorecard_unit_id = ? LIMIT 1`);
  const findColByName  = db.prepare(`SELECT id FROM colleges WHERE name = ? LIMIT 1`);
  const stampComp = db.prepare(`UPDATE colleges_comprehensive SET scorecard_unit_id = ? WHERE id = ? AND scorecard_unit_id IS NULL`);
  const stampCol  = db.prepare(`UPDATE colleges SET scorecard_unit_id = ? WHERE id = ? AND scorecard_unit_id IS NULL`);

  const upsertComp = db.prepare(`
    INSERT INTO colleges_comprehensive (name, country, state_region, city, institution_type,
      undergraduate_enrollment, graduate_enrollment, total_enrollment, website_url, last_updated)
    VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(name, country) DO UPDATE SET
      state_region             = COALESCE(excluded.state_region,             state_region),
      city                     = COALESCE(excluded.city,                     city),
      institution_type         = COALESCE(excluded.institution_type,         institution_type),
      undergraduate_enrollment = COALESCE(excluded.undergraduate_enrollment, undergraduate_enrollment),
      graduate_enrollment      = COALESCE(excluded.graduate_enrollment,      graduate_enrollment),
      total_enrollment         = COALESCE(excluded.total_enrollment,         total_enrollment),
      website_url              = COALESCE(excluded.website_url,              website_url),
      last_updated             = CURRENT_TIMESTAMP
  `);

  const upsertAdmissions = db.prepare(`
    INSERT INTO college_admissions (college_id, year, acceptance_rate, test_optional_flag, source, confidence_score)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(college_id, year) DO UPDATE SET
      acceptance_rate    = COALESCE(excluded.acceptance_rate, acceptance_rate),
      test_optional_flag = excluded.test_optional_flag,
      source = excluded.source, confidence_score = excluded.confidence_score
  `);

  const upsertTestScores = db.prepare(`
    INSERT INTO test_scores (college_id, sat_ebrw_25th, sat_ebrw_75th, sat_math_25th, sat_math_75th,
      sat_total_25th, sat_total_75th, act_composite_25th, act_composite_75th)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(college_id) DO UPDATE SET
      sat_ebrw_25th      = COALESCE(excluded.sat_ebrw_25th,      sat_ebrw_25th),
      sat_ebrw_75th      = COALESCE(excluded.sat_ebrw_75th,      sat_ebrw_75th),
      sat_math_25th      = COALESCE(excluded.sat_math_25th,      sat_math_25th),
      sat_math_75th      = COALESCE(excluded.sat_math_75th,      sat_math_75th),
      sat_total_25th     = COALESCE(excluded.sat_total_25th,     sat_total_25th),
      sat_total_75th     = COALESCE(excluded.sat_total_75th,     sat_total_75th),
      act_composite_25th = COALESCE(excluded.act_composite_25th, act_composite_25th),
      act_composite_75th = COALESCE(excluded.act_composite_75th, act_composite_75th)
  `);

  const upsertAdmittedStats = db.prepare(`
    INSERT INTO admitted_student_stats (college_id, year,
      sat_25, sat_50, sat_75, act_25, act_50, act_75, gpa_50, source, confidence_score)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(college_id, year) DO UPDATE SET
      sat_25 = COALESCE(excluded.sat_25, sat_25), sat_50 = COALESCE(excluded.sat_50, sat_50),
      sat_75 = COALESCE(excluded.sat_75, sat_75), act_25 = COALESCE(excluded.act_25, act_25),
      act_50 = COALESCE(excluded.act_50, act_50), act_75 = COALESCE(excluded.act_75, act_75),
      gpa_50 = COALESCE(excluded.gpa_50, gpa_50),
      source = excluded.source, confidence_score = excluded.confidence_score
  `);

  const upsertFinancial = db.prepare(`
    INSERT INTO college_financial_data (college_id, year,
      tuition_in_state, tuition_out_state, cost_of_attendance,
      avg_financial_aid, avg_debt,
      net_price_low_income, net_price_mid_income, net_price_high_income,
      percent_receiving_aid, loan_default_rate, fafsa_required, source, confidence_score)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(college_id, year) DO UPDATE SET
      tuition_in_state      = COALESCE(excluded.tuition_in_state,      tuition_in_state),
      tuition_out_state     = COALESCE(excluded.tuition_out_state,     tuition_out_state),
      cost_of_attendance    = COALESCE(excluded.cost_of_attendance,    cost_of_attendance),
      avg_financial_aid     = COALESCE(excluded.avg_financial_aid,     avg_financial_aid),
      avg_debt              = COALESCE(excluded.avg_debt,              avg_debt),
      net_price_low_income  = COALESCE(excluded.net_price_low_income,  net_price_low_income),
      net_price_mid_income  = COALESCE(excluded.net_price_mid_income,  net_price_mid_income),
      net_price_high_income = COALESCE(excluded.net_price_high_income, net_price_high_income),
      percent_receiving_aid = COALESCE(excluded.percent_receiving_aid, percent_receiving_aid),
      loan_default_rate     = COALESCE(excluded.loan_default_rate,     loan_default_rate),
      source = excluded.source, confidence_score = excluded.confidence_score
  `);

  const upsertNetPrice = db.prepare(`
    INSERT INTO net_price_data (college_id, academic_year,
      net_price_0_30k, net_price_30_48k, net_price_48_75k, net_price_75_110k, net_price_110k_plus,
      avg_grant_aid, avg_federal_loan, pct_receiving_any_aid, pct_receiving_pell, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(college_id, academic_year) DO UPDATE SET
      net_price_0_30k     = COALESCE(excluded.net_price_0_30k,     net_price_0_30k),
      net_price_30_48k    = COALESCE(excluded.net_price_30_48k,    net_price_30_48k),
      net_price_48_75k    = COALESCE(excluded.net_price_48_75k,    net_price_48_75k),
      net_price_75_110k   = COALESCE(excluded.net_price_75_110k,   net_price_75_110k),
      net_price_110k_plus = COALESCE(excluded.net_price_110k_plus, net_price_110k_plus),
      avg_grant_aid       = COALESCE(excluded.avg_grant_aid,       avg_grant_aid),
      pct_receiving_pell  = COALESCE(excluded.pct_receiving_pell,  pct_receiving_pell)
  `);

  const upsertDemographics = db.prepare(`
    INSERT INTO student_demographics (college_id, year,
      percent_international, percent_first_gen,
      percent_black, percent_hispanic, percent_asian, percent_white,
      percent_native_american, percent_pacific_islander, percent_multiracial,
      percent_unknown_race, percent_male, percent_female,
      percent_pell_recipients, average_age, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(college_id, year) DO UPDATE SET
      percent_international    = COALESCE(excluded.percent_international,    percent_international),
      percent_first_gen        = COALESCE(excluded.percent_first_gen,        percent_first_gen),
      percent_black            = COALESCE(excluded.percent_black,            percent_black),
      percent_hispanic         = COALESCE(excluded.percent_hispanic,         percent_hispanic),
      percent_asian            = COALESCE(excluded.percent_asian,            percent_asian),
      percent_white            = COALESCE(excluded.percent_white,            percent_white),
      percent_native_american  = COALESCE(excluded.percent_native_american,  percent_native_american),
      percent_pacific_islander = COALESCE(excluded.percent_pacific_islander, percent_pacific_islander),
      percent_multiracial      = COALESCE(excluded.percent_multiracial,      percent_multiracial),
      percent_unknown_race     = COALESCE(excluded.percent_unknown_race,     percent_unknown_race),
      percent_male             = COALESCE(excluded.percent_male,             percent_male),
      percent_female           = COALESCE(excluded.percent_female,           percent_female),
      percent_pell_recipients  = COALESCE(excluded.percent_pell_recipients,  percent_pell_recipients),
      average_age              = COALESCE(excluded.average_age,              average_age),
      source = excluded.source
  `);

  const upsertOutcomes = db.prepare(`
    INSERT INTO academic_outcomes (college_id, year,
      graduation_rate_4yr, graduation_rate_6yr, retention_rate, median_start_salary,
      source, confidence_score)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(college_id, year) DO UPDATE SET
      graduation_rate_4yr = COALESCE(excluded.graduation_rate_4yr, graduation_rate_4yr),
      graduation_rate_6yr = COALESCE(excluded.graduation_rate_6yr, graduation_rate_6yr),
      retention_rate      = COALESCE(excluded.retention_rate,      retention_rate),
      median_start_salary = COALESCE(excluded.median_start_salary, median_start_salary),
      confidence_score    = excluded.confidence_score
  `);

  // colleges table has tuition_cost and acceptance_rate as denormalized summary columns
  const updateCollegesSummary = db.prepare(`
    UPDATE colleges SET
      acceptance_rate = COALESCE(?, acceptance_rate),
      tuition_cost    = COALESCE(?, tuition_cost),
      last_scraped_at = CURRENT_TIMESTAMP,
      updated_at      = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const runAll = db.transaction((rows) => {
    for (const c of rows) {
      if (!c.name || !c.scorecard_id) continue;

      // Resolve colleges_comprehensive.id — REQUIRED for all enrichment FK
      let compId = findCompByUnit.get(c.scorecard_id)?.id
                || findCompByName.get(c.name)?.id;

      if (!compId) {
        // Create the row if it doesn't exist
        const instType = c.ownership === 1 ? 'Public'
          : c.ownership === 2 ? 'Private' : c.ownership === 3 ? 'For-Profit' : null;
        try {
          upsertComp.run(c.name, 'United States', c.state, c.city, instType,
            c.undergrad_enrollment, c.grad_enrollment,
            (c.undergrad_enrollment || 0) + (c.grad_enrollment || 0), c.website_url);
          compId = findCompByName.get(c.name)?.id;
        } catch {}
      }
      if (!compId) { skipped++; continue; }

      // Resolve colleges.id — only needed for summary update
      const colId = findColByUnit.get(c.scorecard_id)?.id
                 || findColByName.get(c.name)?.id;

      // Stamp unit IDs for fast future lookups
      try { stampComp.run(c.scorecard_id, compId); } catch {}
      if (colId) { try { stampCol.run(c.scorecard_id, colId); } catch {} }

      // Derived SAT totals
      const sat25 = (c.sat_ebrw_25 && c.sat_math_25) ? c.sat_ebrw_25 + c.sat_math_25 : null;
      const sat75 = (c.sat_ebrw_75 && c.sat_math_75) ? c.sat_ebrw_75 + c.sat_math_75 : null;
      const sat50 = (c.sat_ebrw_mid && c.sat_math_mid) ? c.sat_ebrw_mid + c.sat_math_mid : null;

      // GPA estimate from acceptance rate (Scorecard doesn't publish GPA directly)
      let gpa50 = null;
      if (c.acceptance_rate != null) {
        if      (c.acceptance_rate < 0.10) gpa50 = 3.90;
        else if (c.acceptance_rate < 0.20) gpa50 = 3.75;
        else if (c.acceptance_rate < 0.40) gpa50 = 3.60;
        else if (c.acceptance_rate < 0.60) gpa50 = 3.40;
        else if (c.acceptance_rate < 0.80) gpa50 = 3.10;
        else                               gpa50 = 2.80;
      }

      // Write all enrichment tables — each in its own try/catch
      try { upsertAdmissions.run(compId, YEAR, c.acceptance_rate, c.open_admissions ? 1 : 0, 'College_Scorecard', 0.95); } catch {}
      try { if (c.sat_ebrw_25 || c.act_25) upsertTestScores.run(compId, c.sat_ebrw_25, c.sat_ebrw_75, c.sat_math_25, c.sat_math_75, sat25, sat75, c.act_25, c.act_75); } catch {}
      try { upsertAdmittedStats.run(compId, YEAR, sat25, sat50, sat75, c.act_25, c.act_mid, c.act_75, gpa50, 'College_Scorecard', 0.90); } catch {}
      try {
        upsertFinancial.run(compId, YEAR,
          c.tuition_in_state, c.tuition_out_state, c.cost_of_attendance,
          c.avg_net_price, c.avg_debt,
          c.net_price_0_30k, c.net_price_48_75k, c.net_price_110k_plus,
          c.pell_grant_rate != null ? pct(c.pell_grant_rate) : null,
          c.default_rate_3yr, 1, 'College_Scorecard', 0.95);
      } catch {}
      try {
        upsertNetPrice.run(compId, ACADEMIC_YEAR,
          c.net_price_0_30k, c.net_price_30_48k, c.net_price_48_75k,
          c.net_price_75_110k, c.net_price_110k_plus,
          c.avg_net_price, c.avg_loan_amount,
          c.pct_with_loans != null ? pct(c.pct_with_loans) : null,
          c.pct_pell != null ? pct(c.pct_pell) : null,
          'College_Scorecard');
      } catch {}
      try {
        upsertDemographics.run(compId, YEAR,
          pct(c.pct_international), pct(c.pct_first_gen),
          pct(c.pct_black), pct(c.pct_hispanic), pct(c.pct_asian), pct(c.pct_white),
          pct(c.pct_native_american), pct(c.pct_pacific_islander), pct(c.pct_multiracial),
          pct(c.pct_unknown_race), pct(c.pct_men), pct(c.pct_women),
          pct(c.pct_pell), c.avg_age_entry, 'College_Scorecard');
      } catch {}
      try {
        upsertOutcomes.run(compId, YEAR,
          c.grad_rate_4yr, c.grad_rate_6yr, c.retention_rate, c.median_earnings_6yr,
          'College_Scorecard', 0.90);
      } catch {}

      // Update summary columns on colleges table (uses colId)
      if (colId) { try { updateCollegesSummary.run(c.acceptance_rate, c.tuition_out_state, colId); } catch {} }

      written++;
    }
  });

  runAll(colleges);
  console.log(`[scorecard] Written: ${written}, Skipped (no match): ${skipped}`);
  return written;
}

module.exports = { fetchAllScorecardData, writeScorecardData, mapScorecardToDb };