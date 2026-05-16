const express = require('express');
const router = express.Router();
const CollegeController = require('../controllers/collegeController');
const CollegeDeadlineController = require('../controllers/collegeDeadlineController');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

// Public routes - no authentication required for browsing

// Browse all colleges with pagination (Issue 8)
router.get('/all', CollegeController.browseAll);

// Browse by major (Issue 7)
router.get('/by-major/:major', CollegeController.browseByMajor);

// ─── IPEDS majors master list ──────────────────────────────────────────────
// GET /api/colleges/majors
//   Returns the full master list of IPEDS-verified majors with categories.
//   Falls back to the legacy master_majors table if the new one is empty.
router.get('/majors', async (req, res, next) => {
  try {
    const db   = require('../config/database');
    const pool = db.getDatabase();

    // Try the IPEDS-sourced table first
    let { rows } = await pool.query(
      `SELECT id, cip_code, name, broad_category, is_stem
       FROM   majors
       ORDER  BY broad_category, name`
    ).catch(() => ({ rows: [] }));

    // Fallback to legacy controller if new table is empty
    if (!rows.length) {
      return CollegeController.getMajors(req, res, next);
    }

    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/colleges/majors/search?q=computer
//   Fuzzy (ILIKE) search on major names.
router.get('/majors/search', async (req, res, next) => {
  try {
    const db   = require('../config/database');
    const pool = db.getDatabase();
    const q    = (req.query.q || '').trim();

    if (!q) {
      return res.status(400).json({ success: false, message: 'q parameter is required' });
    }

    const { rows } = await pool.query(
      `SELECT id, cip_code, name, broad_category, is_stem
       FROM   majors
       WHERE  name ILIKE $1
       ORDER  BY
         CASE WHEN name ILIKE $2 THEN 0 ELSE 1 END,
         name
       LIMIT 50`,
      [`%${q}%`, `${q}%`]
    );

    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    // If table doesn't exist yet, return empty
    logger.warn('Majors search error: %s', err.message);
    res.json({ success: true, count: 0, data: [] });
  }
});

router.get('/', CollegeController.getColleges);
router.get('/search', CollegeController.searchColleges);
router.get('/filters/countries', CollegeController.getCountries);
router.get('/filters/programs', CollegeController.getPrograms);
router.get('/stats', CollegeController.getDatabaseStats);
router.get('/:id', CollegeController.getCollegeById);

// ─── GET /api/colleges/:id/majors ─────────────────────────────────────────────
// Returns majors offered at this college.
// Priority:
//   1. IPEDS-sourced college_majors table (populated by build_college_majors.py)
//   2. Fallback: legacy college_majors_offered + master_majors (controller)
//   3. Fallback: college_programs table (program names as strings)
router.get('/:id/majors', async (req, res, next) => {
  try {
    const db   = require('../config/database');
    const pool = db.getDatabase();
    const id   = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid college ID' });
    }

    // ── 1. Try IPEDS college_majors table ──────────────────────────────────
    let rows = [];
    try {
      const result = await pool.query(
        `SELECT
           m.id            AS major_id,
           m.cip_code,
           m.name,
           m.broad_category,
           m.is_stem,
           cm.awlevel,
           cm.completions_count
         FROM   college_majors cm
         JOIN   majors m ON m.id = cm.major_id
         WHERE  cm.college_id = $1
           AND  cm.offered    = true
         ORDER  BY m.broad_category, m.name`,
        [id]
      );
      rows = result.rows;
    } catch (_) {
      // table doesn't exist yet — fall through
    }

    if (rows.length > 0) {
      // Group by broad_category
      const grouped = {};
      for (const row of rows) {
        const cat = row.broad_category || 'Other';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push({
          major_id:          row.major_id,
          cip_code:          row.cip_code,
          name:              row.name,
          is_stem:           row.is_stem,
          awlevel:           row.awlevel,
          completions_count: row.completions_count,
        });
      }

      return res.json({
        success:  true,
        source:   'ipeds',
        count:    rows.length,
        grouped,
        data:     rows,
      });
    }

    // ── 2. Fallback to legacy controller ───────────────────────────────────
    return CollegeController.getCollegeMajors(req, res, next);
  } catch (err) {
    next(err);
  }
});
router.get('/:id/deadlines', CollegeDeadlineController.getCollegeDeadlines);

// Protected routes - require authentication
router.post('/', authenticate, CollegeController.createCollege); // Add college manually (Layer 1)
router.get('/:id/data', authenticate, CollegeController.getCollegeData);
router.get('/:id/eligibility', authenticate, CollegeController.checkEligibility);

// Cost-of-Attendance breakdown (real components, source-backed, never fabricated)
router.get('/:id/cost-breakdown', async (req, res, next) => {
  try {
    const { computeCostOfAttendance } = require('../services/financialComputationEngine');
    const College = require('../models/College');

    const college = await College.findById(req.params.id);
    if (!college) {
      return res.status(404).json({ success: false, message: 'College not found' });
    }

    const breakdown = await computeCostOfAttendance({
      collegeId: college.id,
      collegeCountry: college.country,
      isInternational: req.query.international !== 'false',
      displayCurrency: req.query.currency === 'INR' ? 'INR' : 'USD',
    });

    res.json({ success: true, data: breakdown });
  } catch (err) {
    next(err);
  }
});

// College request routes - for users to request colleges not in database
router.post('/requests', CollegeController.requestCollege);
router.get('/requests/popular', CollegeController.getPopularRequests);
router.post('/requests/:id/upvote', CollegeController.upvoteRequest);

// Data contribution routes
router.post('/contributions', authenticate, CollegeController.contributeData);
router.get('/contributions/:collegeId', CollegeController.getContributions);

// ─── colleges endpoints ────────────────────────────────────────────────────────
// These routes query `clean_colleges` + detail tables for enriched college data.

/**
 * GET /api/colleges/comprehensive
  * List + search clean_colleges with optional filters.
 *
 * Query params:
 *   query     — name ILIKE search
 *   state     — exact state match
 *   type      — 'public' | 'private' | 'for-profit'
 *   setting   — 'urban' | 'suburban' | 'rural'
 *   page      — 1-based page number (default 1, 20 per page)
 *   sortBy    — 'popularity' (default) | 'name' | 'acceptance_rate' | 'tuition' | 'ranking'
 */
router.get('/comprehensive', async (req, res, next) => {
  try {
    const db = require('../config/database');
    const pool = db.getDatabase();
    const PAGE_SIZE = 20;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    // Allowlist sort expressions to prevent SQL injection
    const SORT_EXPRESSIONS = {
      popularity:      '(1 - COALESCE(ca.acceptance_rate, 0.5)) * COALESCE(cc.total_enrollment, 0) DESC',
      name:            'cc.name ASC',
      acceptance_rate: 'ca.acceptance_rate ASC NULLS LAST',
      tuition:         'COALESCE(cfd.tuition_in_state, cfd.tuition_international) ASC NULLS LAST',
      ranking:         'best_rank ASC NULLS LAST',
    };
    const sortKey = SORT_EXPRESSIONS[req.query.sortBy] ? req.query.sortBy : 'popularity';
    const orderExpr = SORT_EXPRESSIONS[sortKey];

    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.query.query) {
      conditions.push(`cc.name ILIKE $${idx++}`);
      params.push(`%${req.query.query}%`);
    }
    if (req.query.state) {
      conditions.push(`cc.state = $${idx++}`);
      params.push(req.query.state);
    }
    if (req.query.type) {
      conditions.push(`cc.institution_type = $${idx++}`);
      params.push(req.query.type);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(*) FROM public.clean_colleges cc
      LEFT JOIN public.college_admissions ca ON cc.id = ca.college_id
      LEFT JOIN public.college_financial_data cfd ON cc.id = cfd.college_id
      ${where}
    `;
    const { rows: countRows } = await pool.query(countSql, params);
    const total = parseInt(countRows[0].count);

    const listParams = [...params, PAGE_SIZE, offset];
    const dataSql = `
      SELECT
        cc.id,
        cc.name,
        LOWER(REGEXP_REPLACE(cc.name, '\\s+', '-', 'g')) || '-' || cc.id AS slug,
        cc.country,
        cc.state,
        cc.city,
        cc.institution_type,
        cc.latitude,
        cc.longitude,
        cc.logo_url,
        cc.total_enrollment,
        cc.undergraduate_enrollment,
        cc.description,
        ca.acceptance_rate,
        ca.sat_25,
        ca.sat_75,
        ca.gpa_25,
        ca.gpa_75,
        cfd.tuition_in_state,
        cfd.tuition_international,
        ad.graduation_rate_4yr,
        COUNT(DISTINCT cm.id) as major_count,
        COUNT(DISTINCT cp.id) as program_count,
        (
          SELECT MIN(CAST(cr.ranking_value AS INTEGER))
          FROM college_rankings cr
          WHERE cr.college_id = cc.id AND cr.ranking_value ~ '^[0-9]+$'
        ) AS best_rank
      FROM public.clean_colleges cc
      LEFT JOIN public.college_admissions ca ON cc.id = ca.college_id
      LEFT JOIN public.college_financial_data cfd ON cc.id = cfd.college_id
      LEFT JOIN public.academic_details ad ON cc.id = ad.college_id
      LEFT JOIN public.college_majors cm ON cc.id = cm.college_id
      LEFT JOIN public.college_programs cp ON cc.id = cp.college_id
      ${where}
      GROUP BY cc.id, ca.id, cfd.id, ad.id
      ORDER BY ${orderExpr}
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    const { rows } = await pool.query(dataSql, listParams);

    res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
        sortBy: sortKey,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/colleges/comprehensive/:id
  * Fetch a single college from clean_colleges with ALL related data.
 */
router.get('/comprehensive/:id', async (req, res, next) => {
  try {
    const db = require('../config/database');
    const pool = db.getDatabase();
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid college ID' });

    const { rows: college } = await pool.query(
      `SELECT
         cc.*,
         LOWER(REGEXP_REPLACE(cc.name, '\\s+', '-', 'g')) || '-' || cc.id AS slug,
         ca.acceptance_rate,
         ca.sat_25,
         ca.sat_75,
         ca.act_25,
         ca.act_75,
         ca.gpa_25,
         ca.gpa_75,
         cfd.tuition_in_state,
         cfd.tuition_international,
         ad.graduation_rate_4yr,
         ad.graduation_rate_6yr,
         ad.student_faculty_ratio,
         COALESCE(
           JSON_AGG(DISTINCT JSONB_BUILD_OBJECT('name', cm.major_name, 'code', cm.major_code))
             FILTER (WHERE cm.id IS NOT NULL),
           '[]'::json
         ) as majors,
         COALESCE(
           JSON_AGG(DISTINCT JSONB_BUILD_OBJECT('name', cp.program_name, 'description', cp.program_description))
             FILTER (WHERE cp.id IS NOT NULL),
           '[]'::json
         ) as programs,
         COALESCE(
           JSON_AGG(DISTINCT JSONB_BUILD_OBJECT(
             'rd_deadline', cd.rd_deadline,
             'ed_deadline', cd.ed_deadline,
             'ea_deadline', cd.ea_deadline,
             'application_platforms', cd.application_platforms
           )) FILTER (WHERE cd.id IS NOT NULL),
           '[]'::json
         ) as deadlines
       FROM public.clean_colleges cc
       LEFT JOIN public.college_admissions ca ON cc.id = ca.college_id
       LEFT JOIN public.college_financial_data cfd ON cc.id = cfd.college_id
       LEFT JOIN public.academic_details ad ON cc.id = ad.college_id
       LEFT JOIN public.college_majors cm ON cc.id = cm.college_id
       LEFT JOIN public.college_programs cp ON cc.id = cp.college_id
       LEFT JOIN public.college_deadlines cd ON cc.id = cd.college_id
       WHERE cc.id = $1
       GROUP BY cc.id, ca.id, cfd.id, ad.id`,
      [id]
    );
    if (!college.length) return res.status(404).json({ success: false, message: 'College not found' });

    res.json({
      success: true,
      data: college[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/colleges/comprehensive/:id/programs
 * Programs list for a college from colleges, grouped by degree_type.
 */
router.get('/comprehensive/:id/programs', async (req, res, next) => {
  try {
    const db = require('../config/database');
    const pool = db.getDatabase();
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid college ID' });

    const { rows } = await pool.query(
      'SELECT program_name, degree_type FROM college_programs WHERE college_id = $1 ORDER BY degree_type, program_name',
      [id]
    );

    // Group by degree_type
    const grouped = {};
    for (const row of rows) {
      const key = row.degree_type || 'Other';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row.program_name);
    }

    res.json({ success: true, data: grouped, total: rows.length });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/colleges/comprehensive/compare
 * Body: { ids: [1, 2, 3, 4] }
 * Returns up to 4 colleges with admissions + financials + academics for comparison.
 */
router.post('/comprehensive/compare', async (req, res, next) => {
  try {
    const db = require('../config/database');
    const pool = db.getDatabase();
    const ids = (req.body.ids || []).slice(0, 4).map(Number).filter((n) => !isNaN(n));
    if (!ids.length) return res.status(400).json({ success: false, message: 'Provide at least one college ID' });

    const { rows } = await pool.query(
      `SELECT DISTINCT ON (cc.id)
        cc.*,
        ca.acceptance_rate,
        ca.sat_25,
        ca.sat_75,
        ca.gpa_25,
        ca.gpa_75,
        cfd.tuition_in_state,
        cfd.tuition_international,
        ad.graduation_rate_4yr
      FROM public.clean_colleges cc
      LEFT JOIN public.college_admissions ca ON cc.id = ca.college_id
      LEFT JOIN public.college_financial_data cfd ON cc.id = cfd.college_id
      LEFT JOIN public.academic_details ad ON cc.id = ad.college_id
      WHERE cc.id = ANY($1)
      ORDER BY cc.id`,
      [ids]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/colleges/comprehensive/stats
 * Summary stats: total count, countries, states distribution.
 */
router.get('/comprehensive/stats', async (req, res, next) => {
  try {
    const db = require('../config/database');
    const pool = db.getDatabase();

    const [total, countries, states] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total FROM public.clean_colleges'),
      pool.query('SELECT country, COUNT(*) AS count FROM public.clean_colleges WHERE country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT 20'),
      pool.query("SELECT state, COUNT(*) AS count FROM public.clean_colleges WHERE state IS NOT NULL AND country = 'United States' GROUP BY state ORDER BY count DESC"),
    ]);

    res.json({
      success: true,
      data: {
        total: parseInt(total.rows[0].total),
        countries: countries.rows,
        states: states.rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/colleges/suggested
 * Returns a tier-balanced list of suggested colleges for the authenticated user.
 *
 * Algorithm:
 *   match_score = 0.5 × gpa_alignment + 0.3 × test_score_alignment + 0.2 × popularity_signal
 *
 * Tier balance enforced in final list:
 *   - At least 3 Safety  (acceptance_rate > 0.40)
 *   - At least 4 Match   (acceptance_rate 0.20–0.40)
 *   - At least 3 Reach/Extreme Reach (acceptance_rate < 0.20)
 */
router.get('/suggested', authenticate, async (req, res, next) => {
  try {
    const db = require('../config/database');
    const pool = db.getDatabase();
    const StudentProfile = require('../models/StudentProfile');

    const profile = await StudentProfile.findByUserId(req.user.userId);

    // Student academic metrics (with sensible defaults so scoring still works)
    const studentGPA = profile?.gpa_unweighted ?? profile?.gpa_weighted ?? null;
    const studentSAT = profile?.sat_total ?? null;
    const boardPct   = profile?.board_exam_percentage ?? null;
    // Convert board percentage to a 4.0 scale GPA for rough alignment comparison only.
    // This is a linear approximation (boardPct / 100 × 4.0) and not an exact equivalence;
    // it is used solely for ranking relative match quality, not for admissions prediction.
    const effectiveGPA = studentGPA ?? (boardPct != null ? (boardPct / 100) * 4.0 : null);

    // Fetch all colleges that have acceptance_rate and enough data for scoring
    const { rows: colleges } = await pool.query(
       `SELECT cc.id, cc.name, cc.city, cc.state, cc.country,
               ca.acceptance_rate,
               ca.gpa_50    AS median_gpa,
               ca.sat_avg   AS median_sat,
               cc.popularity_score
        FROM   public.clean_colleges cc
        LEFT JOIN public.college_admissions ca ON cc.id = ca.college_id
        WHERE  ca.acceptance_rate IS NOT NULL
          AND  ca.acceptance_rate > 0
        LIMIT  500`
    );

    if (!colleges || colleges.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Determine tier label from acceptance_rate
    function tierLabel(ar) {
      if (ar < 0.05)  return 'Extreme Reach';
      if (ar < 0.20)  return 'Reach';
      if (ar <= 0.40) return 'Match';
      return 'Safety';
    }

    // Compute match_score for each college
    const scored = colleges.map(c => {
      const ar  = parseFloat(c.acceptance_rate) || 0;
      const cgpa = parseFloat(c.median_gpa) || null;
      const csat = parseFloat(c.median_sat) || null;
      const pop  = parseFloat(c.popularity_score) || 0;

      // GPA alignment: 1 - |student_gpa - college_median_gpa| / 4.0
      let gpaAlignment = 0.5;
      if (effectiveGPA != null && cgpa != null) {
        gpaAlignment = Math.max(0, 1 - Math.abs(effectiveGPA - cgpa) / 4.0);
      }

      // Test score alignment: 1 - |student_sat - college_median_sat| / 1600
      let testAlignment = 0.5;
      if (studentSAT != null && csat != null) {
        testAlignment = Math.max(0, 1 - Math.abs(studentSAT - csat) / 1600);
      }

      // Popularity signal: normalised 0–1 from popularity_score
      const popularitySignal = Math.min(pop / 100, 1);

      const matchScore = 0.5 * gpaAlignment + 0.3 * testAlignment + 0.2 * popularitySignal;

      return {
        id: c.id,
        name: c.name,
        location: [c.city, c.state, c.country].filter(Boolean).join(', '),
        acceptanceRate: ar,
        tier: tierLabel(ar),
        matchScore,
      };
    });

    // Sort descending by match_score
    scored.sort((a, b) => b.matchScore - a.matchScore);

    // Split by tier
    const safeties = scored.filter(c => c.tier === 'Safety');
    const matches  = scored.filter(c => c.tier === 'Match');
    const reaches  = scored.filter(c => c.tier === 'Reach' || c.tier === 'Extreme Reach');

    const SAFETY_MIN = 3;
    const MATCH_MIN  = 4;
    const REACH_MIN  = 3;

    // Build balanced list: take top from each tier to meet minimums, then fill from overall ranked list
    const finalSet = new Set();
    const result   = [];

    const addGroup = (group, min) => {
      for (let i = 0; i < Math.min(min, group.length); i++) {
        if (!finalSet.has(group[i].id)) {
          finalSet.add(group[i].id);
          result.push(group[i]);
        }
      }
    };

    addGroup(safeties, SAFETY_MIN);
    addGroup(matches,  MATCH_MIN);
    addGroup(reaches,  REACH_MIN);

    // Inject top-ranked remaining colleges until we have at least 12 total
    const TARGET_TOTAL = 12;
    for (const c of scored) {
      if (result.length >= TARGET_TOTAL) break;
      if (!finalSet.has(c.id)) {
        finalSet.add(c.id);
        result.push(c);
      }
    }

    // Sort final list by match_score descending
    result.sort((a, b) => b.matchScore - a.matchScore);

    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Suggested colleges failed:', err);
    next(err);
  }
});

module.exports = router;
