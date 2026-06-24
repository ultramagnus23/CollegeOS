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

// ── Outcome collection (deliverable #6 — proprietary dataset for future models) ──
const OUTCOME_TO_DECISION = { admit: 'admit', reject: 'reject', waitlist: 'waitlist', interview: 'interview' };
const OUTCOME_TO_APP = { applied: 'pending', interview: 'interview', admit: 'admitted', reject: 'rejected', waitlist: 'waitlisted', deferred: 'pending' };

router.post('/outcomes', authenticate, requireMastersTrackForWrite, async (req, res) => {
  try {
    const { mastersProgramId, intakeTerm, intakeYear, outcome } = req.body || {};
    if (!mastersProgramId || !Object.prototype.hasOwnProperty.call(OUTCOME_TO_APP, outcome)) {
      return fail(res, 400, 'mastersProgramId and a valid outcome (applied|interview|admit|reject|waitlist|deferred) are required');
    }
    const pool = dbManager.getDatabase();
    const profile = await profileService.getProfile(req.user.userId);

    // 1) Update the application lifecycle.
    await pool.query(
      `INSERT INTO public.masters_applications (user_id, masters_program_id, status, intake_term, intake_year, decision_outcome)
         VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id, masters_program_id) DO UPDATE SET
         status = EXCLUDED.status, decision_outcome = EXCLUDED.decision_outcome,
         intake_term = EXCLUDED.intake_term, intake_year = EXCLUDED.intake_year, updated_at = NOW()`,
      [req.user.userId, mastersProgramId, outcome, intakeTerm || null, intakeYear ?? null, OUTCOME_TO_APP[outcome]],
    );

    // 2) Terminal outcomes capture a training datapoint (profile-feature snapshot + label),
    //    stored as source='our_user' alongside scraped GradCafe data — the strategic asset.
    let datapointCaptured = false;
    if (OUTCOME_TO_DECISION[outcome] && profile) {
      await pool.query(
        `INSERT INTO canonical.masters_admission_datapoints
           (masters_program_id, source, gre_verbal, gre_quant, gre_awa, gmat_total, gpa, gpa_scale, decision, intake_term, intake_year, scraped_at)
         VALUES ($1,'our_user',$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
        [mastersProgramId, profile.gre_verbal, profile.gre_quant, profile.gre_awa, profile.gmat_total,
          profile.undergrad_gpa, profile.undergrad_gpa_scale, OUTCOME_TO_DECISION[outcome], intakeTerm || null, intakeYear ?? null],
      );
      datapointCaptured = true;
    }
    res.json({ success: true, data: { outcome, datapointCaptured }, message: 'Outcome recorded' });
  } catch (e) { fail(res, 500, 'Failed to record outcome', e); }
});

// ── Application readiness (deliverable #7) ──
router.get('/readiness', authenticate, async (req, res) => {
  try {
    const profile = await profileService.getProfile(req.user.userId);
    if (!profile) {
      return res.json({ success: true, data: { completion: 0, ready: false, items: [], message: 'Create your masters profile first.' } });
    }
    const items = [
      { key: 'SOP', done: profile.sop_status === 'final', detail: profile.sop_status || 'not_started' },
      { key: 'Recommendations', done: (profile.lors_secured || 0) >= (profile.lors_required || 3), detail: `${profile.lors_secured || 0}/${profile.lors_required || 3}` },
      { key: 'GRE/GMAT', done: profile.gre_quant != null || profile.gmat_total != null || profile.gmat_focus_total != null, detail: profile.gre_quant != null ? 'GRE' : (profile.gmat_total || profile.gmat_focus_total) ? 'GMAT' : 'none' },
      { key: 'English test', done: profile.toefl_score != null || profile.ielts_score != null || profile.duolingo_score != null, detail: profile.toefl_score != null ? 'TOEFL' : profile.ielts_score != null ? 'IELTS' : profile.duolingo_score != null ? 'Duolingo' : 'none' },
      { key: 'Transcript / GPA', done: profile.undergrad_gpa != null, detail: profile.undergrad_gpa != null ? `${profile.undergrad_gpa}/${profile.undergrad_gpa_scale || '?'}` : 'missing' },
      { key: 'Resume / experience', done: (Number(profile.work_experience_years) || 0) > 0 || (profile.research_experience || '').length > 0, detail: '' },
    ];
    const done = items.filter((i) => i.done).length;
    res.json({ success: true, data: { completion: Math.round((100 * done) / items.length), ready: done === items.length, items } });
  } catch (e) { fail(res, 500, 'Failed to compute readiness', e); }
});

module.exports = router;
