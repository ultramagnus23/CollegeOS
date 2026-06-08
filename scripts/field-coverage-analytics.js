#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'workflow-diagnostics');

const FIELD_GROUPS = {
  us: {
    admissions: ['acceptance_rate', 'sat_25', 'sat_75', 'act_25', 'act_75'],
    financials: ['tuition_in_state', 'tuition_out_state', 'cost_of_attendance', 'net_price_low_income'],
    outcomes: ['graduation_rate_4yr', 'employment_rate', 'median_start_salary'],
  },
  india: {
    rankings: ['ranking_body', 'national_rank', 'global_rank'],
    admissions: ['acceptance_rate', 'application_volume', 'admit_volume'],
    outcomes: ['employment_rate', 'median_start_salary'],
  },
  international: {
    demographics: ['percent_international'],
    financials: ['tuition_international', 'cost_of_attendance'],
    programs: ['program_name', 'degree_type', 'field_category'],
  },
};

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
      Authorization: 'Bearer ' + serviceRoleKey,
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(`SQL API failed (${res.status}): ${await res.text()}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

async function fetchCoverage() {
  const baseCounts = await execSql(`
    SELECT
      COUNT(*) FILTER (WHERE i.country_code = 'US') AS us_total,
      COUNT(*) FILTER (WHERE i.country_code = 'IN') AS india_total,
      COUNT(*) FILTER (WHERE COALESCE(i.country_code, '') NOT IN ('US', 'IN')) AS intl_total,
      COUNT(*) AS global_total
    FROM canonical.institutions i
  `);
  const counts = baseCounts[0] || { us_total: 0, india_total: 0, intl_total: 0, global_total: 0 };

  const detail = await execSql(`
    WITH latest_adm AS (
      SELECT DISTINCT ON (institution_id) institution_id, acceptance_rate, sat_25, sat_75, act_25, act_75, data_year, updated_at
      FROM canonical.institution_admissions
      ORDER BY institution_id, data_year DESC NULLS LAST, updated_at DESC NULLS LAST
    ), latest_fin AS (
      SELECT DISTINCT ON (institution_id) institution_id, tuition_in_state, tuition_out_state, tuition_international, cost_of_attendance, net_price_low_income, data_year, updated_at
      FROM canonical.institution_financials
      ORDER BY institution_id, data_year DESC NULLS LAST, updated_at DESC NULLS LAST
    ), latest_out AS (
      SELECT DISTINCT ON (institution_id) institution_id, graduation_rate_4yr, employment_rate, median_start_salary, data_year, updated_at
      FROM canonical.institution_outcomes
      ORDER BY institution_id, data_year DESC NULLS LAST, updated_at DESC NULLS LAST
    ), latest_demo AS (
      SELECT DISTINCT ON (institution_id) institution_id, percent_international, data_year, updated_at
      FROM canonical.institution_demographics
      ORDER BY institution_id, data_year DESC NULLS LAST, updated_at DESC NULLS LAST
    )
    SELECT
      i.country_code,
      COUNT(*) AS institutions,
      COUNT(*) FILTER (WHERE la.acceptance_rate IS NOT NULL) AS acceptance_rate_non_null,
      COUNT(*) FILTER (WHERE la.sat_25 IS NOT NULL AND la.sat_75 IS NOT NULL) AS sat_range_non_null,
      COUNT(*) FILTER (WHERE la.act_25 IS NOT NULL AND la.act_75 IS NOT NULL) AS act_range_non_null,
      COUNT(*) FILTER (WHERE lf.cost_of_attendance IS NOT NULL) AS coa_non_null,
      COUNT(*) FILTER (WHERE lf.tuition_international IS NOT NULL) AS intl_tuition_non_null,
      COUNT(*) FILTER (WHERE lo.graduation_rate_4yr IS NOT NULL) AS grad4_non_null,
      COUNT(*) FILTER (WHERE lo.employment_rate IS NOT NULL) AS employment_non_null,
      COUNT(*) FILTER (WHERE ld.percent_international IS NOT NULL) AS percent_international_non_null,
      MAX(GREATEST(COALESCE(la.updated_at, 'epoch'::timestamptz), COALESCE(lf.updated_at, 'epoch'::timestamptz), COALESCE(lo.updated_at, 'epoch'::timestamptz), COALESCE(ld.updated_at, 'epoch'::timestamptz))) AS latest_update
    FROM canonical.institutions i
    LEFT JOIN latest_adm la ON la.institution_id = i.id
    LEFT JOIN latest_fin lf ON lf.institution_id = i.id
    LEFT JOIN latest_out lo ON lo.institution_id = i.id
    LEFT JOIN latest_demo ld ON ld.institution_id = i.id
    GROUP BY i.country_code
  `);

  return { counts, detail };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const started = Date.now();
  const { counts, detail } = await fetchCoverage();

  const byCountry = detail.map((row) => {
    const institutions = Number(row.institutions || 0);
    const acceptance = Number(row.acceptance_rate_non_null || 0);
    const sat = Number(row.sat_range_non_null || 0);
    const act = Number(row.act_range_non_null || 0);
    const coa = Number(row.coa_non_null || 0);
    const intlTuition = Number(row.intl_tuition_non_null || 0);
    const grad = Number(row.grad4_non_null || 0);
    const employment = Number(row.employment_non_null || 0);
    const intlPct = Number(row.percent_international_non_null || 0);
    return {
      country_code: row.country_code || 'UNKNOWN',
      institutions,
      null_percentages: {
        acceptance_rate: Number((100 - pct(acceptance, institutions)).toFixed(2)),
        sat_range: Number((100 - pct(sat, institutions)).toFixed(2)),
        act_range: Number((100 - pct(act, institutions)).toFixed(2)),
        cost_of_attendance: Number((100 - pct(coa, institutions)).toFixed(2)),
        tuition_international: Number((100 - pct(intlTuition, institutions)).toFixed(2)),
        graduation_rate_4yr: Number((100 - pct(grad, institutions)).toFixed(2)),
        employment_rate: Number((100 - pct(employment, institutions)).toFixed(2)),
        percent_international: Number((100 - pct(intlPct, institutions)).toFixed(2)),
      },
      source_quality_score: Number(((pct(acceptance + coa + grad + employment, institutions * 4))).toFixed(2)),
      latest_update: row.latest_update,
      stale_detection: {
        stale_over_45d: row.latest_update ? (Date.now() - Date.parse(row.latest_update)) > 45 * 24 * 60 * 60 * 1000 : true,
      },
    };
  });

  const output = {
    generated_at: new Date().toISOString(),
    runtime_ms: Date.now() - started,
    counts,
    field_groups: FIELD_GROUPS,
    per_country_completeness: byCountry,
  };

  await fs.writeFile(path.join(OUT_DIR, 'field-coverage-report.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  const lines = [
    '# Field Coverage Report',
    '',
    `Generated: ${output.generated_at}`,
    `Runtime ms: ${output.runtime_ms}`,
    `Global institutions: ${counts.global_total}`,
    '',
    '| Country | Institutions | Acceptance Null % | SAT Null % | ACT Null % | COA Null % | Quality Score |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const row of byCountry) {
    lines.push(`| ${row.country_code} | ${row.institutions} | ${row.null_percentages.acceptance_rate} | ${row.null_percentages.sat_range} | ${row.null_percentages.act_range} | ${row.null_percentages.cost_of_attendance} | ${row.source_quality_score} |`);
  }

  await fs.writeFile(path.join(OUT_DIR, 'field-coverage-report.md'), `${lines.join('\n')}\n`, 'utf8');
  console.log('field-coverage analytics complete');
}

main().catch((error) => {
  console.error('field-coverage-analytics failed:', error.message);
  process.exit(1);
});
