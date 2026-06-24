'use strict';
/**
 * routes/masters.js — Phase 4/4.5/5 of docs/MASTERS_TRACK_PLAN.md.
 *
 * Dedicated masters surface. Mirrors the undergrad routes but never overloads
 * them. The whole router is dark behind MASTERS_TRACK_ENABLED. Every handler
 * touches only masters_* services — no path can reach colleges/mv_college_cards.
 */
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { mastersFeatureGate, requireMastersTrackForWrite } = require('../middleware/requireMastersTrack');
const profileService = require('../services/masters/mastersProfileService');
const programService = require('../services/masters/mastersProgramService');
const chancing = require('../services/masters/mastersChancingService');
const dbManager = require('../config/database');
const logger = require('../utils/logger');

// Whole surface is dark unless the flag is on.
router.use(mastersFeatureGate);

const DEGREE_TYPES = new Set(['MS', 'MA', 'MBA']);
const SOP_STATUSES = new Set(['not_started', 'drafting', 'reviewing', 'final']);
const INTAKE_TERMS = new Set(['fall', 'spring', 'summer', 'winter']);

/** Keep only known masters_profile fields and coerce/guard enums. */
function sanitizeProfile(body = {}) {
  const out = {};
  const numeric = [
    'gre_verbal', 'gre_quant', 'gre_awa', 'gmat_total', 'gmat_focus_total',
    'toefl_score', 'ielts_score', 'duolingo_score', 'pte_score',
    'undergrad_gpa', 'undergrad_gpa_scale', 'publication_count',
    'work_experience_years', 'lors_secured', 'lors_required', 'target_intake_year',
  ];
  for (const k of numeric) {
    if (body[k] !== undefined && body[k] !== null && body[k] !== '') {
      const n = Number(body[k]);
      if (Number.isFinite(n)) out[k] = n;
    }
  }
  const text = ['intended_program', 'intended_specialization', 'undergrad_institution',
    'undergrad_major', 'undergrad_country', 'research_experience', 'work_experience_desc'];
  for (const k of text) {
    if (typeof body[k] === 'string') out[k] = body[k].slice(0, 2000);
  }
  if (DEGREE_TYPES.has(body.target_degree_type)) out.target_degree_type = body.target_degree_type;
  if (SOP_STATUSES.has(body.sop_status)) out.sop_status = body.sop_status;
  if (INTAKE_TERMS.has(body.target_intake_term)) out.target_intake_term = body.target_intake_term;
  if (Array.isArray(body.target_countries)) {
    out.target_countries = body.target_countries.map((c) => String(c).slice(0, 100)).filter(Boolean).slice(0, 20);
  }
  return out;
}

const fail = (res, code, message, error) => {
  if (error) logger.error(message, { error: error.message });
  return res.status(code).json({ success: false, message });
};

// ── Track ──────────────────────────────────────────────────────────────────
router.get('/track', authenticate, async (req, res) => {
  try {
    const track = await profileService.getTrack(req.user.userId);
    res.json({ success: true, data: track });
  } catch (e) { fail(res, 500, 'Failed to fetch track', e); }
});

router.put('/track', authenticate, async (req, res) => {
  try {
    const { programTrack, enrollmentStatus, yearOfStudy } = req.body || {};
    if (programTrack && !['undergraduate', 'masters', 'transfer'].includes(programTrack)) {
      return fail(res, 400, 'Invalid programTrack');
    }
    const updated = await profileService.setTrack(req.user.userId, { programTrack, enrollmentStatus, yearOfStudy });
    res.json({ success: true, data: updated });
  } catch (e) { fail(res, 500, 'Failed to update track', e); }
});

// ── Profile ──────────────────────────────────────────────────────────────────
router.get('/profile', authenticate, async (req, res) => {
  try {
    const profile = await profileService.getProfile(req.user.userId);
    res.json({ success: true, data: profile });
  } catch (e) { fail(res, 500, 'Failed to fetch masters profile', e); }
});

router.post('/profile', authenticate, requireMastersTrackForWrite, async (req, res) => {
  try {
    const clean = sanitizeProfile(req.body);
    const profile = await profileService.upsertProfile(req.user.userId, clean);
    res.json({ success: true, data: profile, message: 'Masters profile saved' });
  } catch (e) { fail(res, 500, 'Failed to save masters profile', e); }
});

// ── Programs ──────────────────────────────────────────────────────────────────
router.get('/programs', authenticate, async (req, res) => {
  try {
    const { country, degreeType, q, limit, offset } = req.query;
    const rows = await programService.listProgramCards({ country, degreeType, q, limit, offset });
    res.json({ success: true, data: rows });
  } catch (e) { fail(res, 500, 'Failed to list masters programs', e); }
});

router.get('/programs/:id', authenticate, async (req, res) => {
  try {
    const detail = await programService.getProgramDetail(req.params.id);
    if (!detail) return fail(res, 404, 'Program not found');
    res.json({ success: true, data: detail });
  } catch (e) { fail(res, 500, 'Failed to fetch program', e); }
});

router.post('/discover', authenticate, async (req, res) => {
  try {
    const { field, countries, degreeType, budgetMax, limit } = req.body || {};
    const rows = await programService.discoverPrograms({ field, countries, degreeType, budgetMax, limit });
    res.json({ success: true, data: rows });
  } catch (e) { fail(res, 500, 'Failed to discover programs', e); }
});

// ── Chancing (rules-based bands) ──────────────────────────────────────────────
router.get('/chances/:programId', authenticate, async (req, res) => {
  try {
    const profile = await profileService.getProfile(req.user.userId);
    if (!profile) return fail(res, 409, 'Complete your masters profile first.');
    const inputs = await programService.getChancingInputs(req.params.programId);
    if (!inputs) return fail(res, 404, 'Program not found');
    const assessment = chancing.assessProgram(profile, inputs.program, inputs.pathways, inputs.datapoints);
    res.json({ success: true, data: assessment });
  } catch (e) { fail(res, 500, 'Failed to compute chances', e); }
});

// ── Applications tracker ──────────────────────────────────────────────────────
router.get('/applications', authenticate, async (req, res) => {
  try {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT a.id, a.masters_program_id, a.status, a.intake_term, a.intake_year, a.priority,
              a.notes, a.decision_outcome, a.created_at,
              p.institution_name, p.program_name, p.degree_type
         FROM public.masters_applications a
         JOIN canonical.masters_programs p ON p.id = a.masters_program_id
        WHERE a.user_id = $1
        ORDER BY a.created_at DESC`,
      [req.user.userId],
    );
    res.json({ success: true, data: rows });
  } catch (e) { fail(res, 500, 'Failed to fetch applications', e); }
});

router.post('/applications', authenticate, requireMastersTrackForWrite, async (req, res) => {
  try {
    const { mastersProgramId, status, intakeTerm, intakeYear, priority, notes } = req.body || {};
    if (!mastersProgramId) return fail(res, 400, 'mastersProgramId is required');
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `INSERT INTO public.masters_applications
         (user_id, masters_program_id, status, intake_term, intake_year, priority, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id, masters_program_id) DO UPDATE SET
         status = EXCLUDED.status, intake_term = EXCLUDED.intake_term,
         intake_year = EXCLUDED.intake_year, priority = EXCLUDED.priority,
         notes = EXCLUDED.notes, updated_at = NOW()
       RETURNING *`,
      [req.user.userId, mastersProgramId, status || 'planning', intakeTerm || null,
        intakeYear ?? null, priority || null, notes || null],
    );
    res.status(201).json({ success: true, data: rows[0], message: 'Application saved' });
  } catch (e) { fail(res, 500, 'Failed to save application', e); }
});

module.exports = router;
