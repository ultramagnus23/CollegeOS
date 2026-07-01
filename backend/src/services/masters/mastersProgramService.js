'use strict';
/**
 * mastersProgramService.js — Phase 4/4.5 of docs/MASTERS_TRACK_PLAN.md.
 *
 * Reads masters PROGRAM data exclusively from the canonical.* masters tables and
 * canonical.mv_masters_program_cards. Per the Performance Isolation contract this
 * service has ZERO code paths that touch `colleges` / `mv_college_cards`.
 */
const dbManager = require('../../config/database');

const CARD_COLUMNS = [
  'id', 'institution_name', 'institution_country AS country', 'city', 'program_name', 'degree_type',
  'specialization', 'is_stem_designated', 'gre_requirement', 'gmat_requirement',
  'funding_availability', 'tuition_total', 'tuition_currency', 'program_length_months AS duration_months',
  'median_earnings', 'median_debt', 'data_quality_score', 'last_scraped_at',
  'pathway_count', 'datapoint_count',
].join(', ');

/** List program cards with optional filters. Read-only, canonical MV only. */
async function listProgramCards({ country, degreeType, q, limit = 30, offset = 0 } = {}) {
  const pool = dbManager.getDatabase();
  const where = [];
  const params = [];
  if (country) { params.push(country); where.push(`institution_country = $${params.length}`); }
  if (degreeType) { params.push(degreeType); where.push(`degree_type = $${params.length}`); }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(program_name ILIKE $${params.length} OR specialization ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countParams = params.slice();
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM canonical.mv_masters_program_cards ${whereSql}`,
    countParams,
  );
  const total = countRows[0].n;

  params.push(Math.min(Number(limit) || 30, 100));
  const limitIdx = params.length;
  params.push(Math.max(Number(offset) || 0, 0));
  const offsetIdx = params.length;

  const { rows } = await pool.query(
    `SELECT ${CARD_COLUMNS}
       FROM canonical.mv_masters_program_cards
       ${whereSql}
       ORDER BY data_quality_score DESC NULLS LAST, datapoint_count DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );
  return { rows, total };
}

/**
 * Full program detail = program row + pathways + deadlines (+ datapoint count).
 * Column list is explicit (not SELECT *) so the contract with the frontend is
 * stable and uses the same `country`/`duration_months`/`website` aliases as the
 * card endpoints — these are real columns under different names, not invented data.
 */
async function getProgramDetail(programId) {
  const pool = dbManager.getDatabase();
  const program = (await pool.query(
    `SELECT
        id, institution_name, institution_country AS country, city, department,
        program_name, degree_type, specialization, cip_code, is_stem_designated,
        language_of_instruction, intake_term, intake_year,
        gre_requirement, gmat_requirement, min_gpa, min_gpa_scale, min_toefl, min_ielts,
        funding_availability, assistantship_types, tuition_waiver_available,
        tuition_total, tuition_currency, program_length_months AS duration_months,
        median_earnings, median_debt, roi_source,
        program_url AS official_website, data_source, data_quality_score, last_scraped_at
      FROM canonical.masters_programs WHERE id = $1`, [programId],
  )).rows[0];
  if (!program) return null;

  const [pathways, deadlines, datapointAgg] = await Promise.all([
    pool.query(`SELECT id, pathway_type, description, weighted_fields, min_requirements, confidence, source_url
                  FROM canonical.masters_program_pathways WHERE masters_program_id = $1
                  ORDER BY confidence DESC NULLS LAST`, [programId]),
    pool.query(`SELECT id, deadline_type, deadline_date, is_rolling, intake_term, intake_year, notes, source_url
                  FROM canonical.masters_program_deadlines WHERE masters_program_id = $1
                  ORDER BY deadline_date ASC NULLS LAST`, [programId]),
    pool.query(`SELECT COUNT(*)::int AS n FROM canonical.masters_admission_datapoints WHERE masters_program_id = $1`, [programId]),
  ]);

  return {
    ...program,
    pathways: pathways.rows,
    deadlines: deadlines.rows,
    datapoint_count: datapointAgg.rows[0].n,
  };
}

/**
 * Catalog-wide deadlines for the Timeline page — distinct from GET /api/masters/deadlines,
 * which is scoped to the user's saved applications. This is browse-all, not personal.
 */
async function listAllDeadlines({ country, degreeType, limit = 200 } = {}) {
  const pool = dbManager.getDatabase();
  const where = [];
  const params = [];
  if (country) { params.push(country); where.push(`mp.institution_country = $${params.length}`); }
  if (degreeType) { params.push(degreeType); where.push(`mp.degree_type = $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(Math.min(Number(limit) || 200, 500));

  const { rows } = await pool.query(
    `SELECT
        d.id, mp.id AS program_id, mp.institution_name, mp.institution_country AS country,
        mp.program_name, mp.degree_type, d.deadline_type, d.deadline_date, d.is_rolling,
        d.intake_term, d.intake_year
      FROM canonical.masters_program_deadlines d
      JOIN canonical.masters_programs mp ON mp.id = d.masters_program_id
      ${whereSql}
      ORDER BY CASE WHEN d.deadline_date IS NULL THEN 1 ELSE 0 END, d.deadline_date ASC
      LIMIT $${params.length}`,
    params,
  );
  return rows;
}

/** Pathways + datapoints needed by the chancing service for one program. */
async function getChancingInputs(programId) {
  const pool = dbManager.getDatabase();
  const program = (await pool.query(`SELECT * FROM canonical.masters_programs WHERE id = $1`, [programId])).rows[0];
  if (!program) return null;
  const [pathways, datapoints] = await Promise.all([
    pool.query(`SELECT pathway_type, weighted_fields FROM canonical.masters_program_pathways WHERE masters_program_id = $1`, [programId]),
    pool.query(`SELECT gre_verbal, gre_quant, gre_awa, gmat_total, gpa, gpa_scale
                  FROM canonical.masters_admission_datapoints WHERE masters_program_id = $1`, [programId]),
  ]);
  return { program, pathways: pathways.rows, datapoints: datapoints.rows };
}

/**
 * Phase 4.5 discovery v1 — deterministic filter + rank (semantic vector ranking is
 * added once Phase 2 populates embeddings; this is the data-honest fallback).
 * Ranks by: data completeness, then sample size, then STEM (for international fit).
 */
async function discoverPrograms({ field, countries = [], degreeType, budgetMax, limit = 25 } = {}) {
  const pool = dbManager.getDatabase();
  const where = [];
  const params = [];
  if (field) {
    params.push(`%${field}%`);
    where.push(`(program_name ILIKE $${params.length} OR specialization ILIKE $${params.length})`);
  }
  if (Array.isArray(countries) && countries.length) {
    params.push(countries);
    where.push(`institution_country = ANY($${params.length})`);
  }
  if (degreeType) { params.push(degreeType); where.push(`degree_type = $${params.length}`); }
  if (budgetMax != null && Number.isFinite(Number(budgetMax))) {
    params.push(Number(budgetMax));
    where.push(`(tuition_total IS NULL OR tuition_total <= $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(Math.min(Number(limit) || 25, 100));

  const { rows } = await pool.query(
    `SELECT ${CARD_COLUMNS}
       FROM canonical.mv_masters_program_cards
       ${whereSql}
       ORDER BY data_quality_score DESC NULLS LAST,
                datapoint_count DESC,
                is_stem_designated DESC NULLS LAST
       LIMIT $${params.length}`,
    params,
  );
  return rows;
}

module.exports = {
  listProgramCards,
  getProgramDetail,
  getChancingInputs,
  discoverPrograms,
  listAllDeadlines,
};
