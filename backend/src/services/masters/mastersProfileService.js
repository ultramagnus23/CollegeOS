'use strict';
/**
 * mastersProfileService.js — Phase 4 of docs/MASTERS_TRACK_PLAN.md.
 * CRUD for public.masters_profile + read/write of users.program_track.
 * Touches only public.* user tables (never canonical college data).
 */
const dbManager = require('../../config/database');

const PROFILE_COLUMNS = [
  'target_degree_type', 'intended_program', 'intended_specialization',
  'gre_verbal', 'gre_quant', 'gre_awa', 'gmat_total', 'gmat_focus_total',
  'toefl_score', 'ielts_score', 'duolingo_score', 'pte_score',
  'undergrad_gpa', 'undergrad_gpa_scale', 'undergrad_institution', 'undergrad_major', 'undergrad_country',
  'research_experience', 'publication_count', 'work_experience_years', 'work_experience_desc',
  'sop_status', 'lors_secured', 'lors_required',
  'target_intake_term', 'target_intake_year',
  'target_budget_max', 'target_budget_currency',
];

async function getTrack(userId) {
  const pool = dbManager.getDatabase();
  const { rows } = await pool.query(
    `SELECT program_track, university_enrollment_status, current_year_of_study FROM public.users WHERE id = $1`,
    [userId],
  );
  return rows[0] || null;
}

async function setTrack(userId, { programTrack, enrollmentStatus, yearOfStudy }) {
  const pool = dbManager.getDatabase();
  const { rows } = await pool.query(
    `UPDATE public.users
       SET program_track = COALESCE($2, program_track),
           university_enrollment_status = COALESCE($3, university_enrollment_status),
           current_year_of_study = COALESCE($4, current_year_of_study),
           updated_at = NOW()
     WHERE id = $1
     RETURNING program_track, university_enrollment_status, current_year_of_study`,
    [userId, programTrack || null, enrollmentStatus || null, yearOfStudy ?? null],
  );
  return rows[0] || null;
}

async function getProfile(userId) {
  const pool = dbManager.getDatabase();
  const { rows } = await pool.query(`SELECT * FROM public.masters_profile WHERE user_id = $1`, [userId]);
  const row = rows[0];
  if (!row) return null;
  if (typeof row.target_countries === 'string') {
    try { row.target_countries = JSON.parse(row.target_countries); } catch { row.target_countries = []; }
  }
  return row;
}

/** Insert/update the 1:1 masters profile. `data` uses snake_case fields. */
async function upsertProfile(userId, data = {}) {
  const pool = dbManager.getDatabase();
  const cols = ['user_id'];
  const placeholders = ['$1'];
  const params = [userId];

  for (const col of PROFILE_COLUMNS) {
    if (data[col] !== undefined) {
      params.push(data[col]);
      cols.push(col);
      placeholders.push(`$${params.length}`);
    }
  }
  // target_countries is JSONB
  if (data.target_countries !== undefined) {
    params.push(JSON.stringify(Array.isArray(data.target_countries) ? data.target_countries : []));
    cols.push('target_countries');
    placeholders.push(`$${params.length}::jsonb`);
  }

  const updateSet = cols
    .filter((c) => c !== 'user_id')
    .map((c) => `${c} = EXCLUDED.${c}`)
    .concat(['profile_version = public.masters_profile.profile_version + 1', 'updated_at = NOW()'])
    .join(', ');

  const { rows } = await pool.query(
    `INSERT INTO public.masters_profile (${cols.join(', ')})
       VALUES (${placeholders.join(', ')})
     ON CONFLICT (user_id) DO UPDATE SET ${updateSet}
     RETURNING *`,
    params,
  );
  return rows[0];
}

module.exports = { getTrack, setTrack, getProfile, upsertProfile };
