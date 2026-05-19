const express = require('express');
const router = express.Router();
const CollegeController = require('../controllers/collegeController');
const CollegeDeadlineController = require('../controllers/collegeDeadlineController');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const CANONICAL_DEBUG = process.env.CANONICAL_DEBUG === '1' || process.env.NODE_ENV !== 'production';

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

    const SORT_EXPRESSIONS = {
      popularity: 'acceptance_rate ASC NULLS LAST',
      name: 'canonical_name ASC',
      acceptance_rate: 'acceptance_rate ASC NULLS LAST',
      tuition: 'tuition_international ASC NULLS LAST',
      ranking: `CASE
        WHEN (metadata->>'ranking_us_news') ~ '^[0-9]+$' THEN (metadata->>'ranking_us_news')::INTEGER
        ELSE NULL
      END ASC NULLS LAST`,
    };
    const sortKey = SORT_EXPRESSIONS[req.query.sortBy] ? req.query.sortBy : 'popularity';
    const orderExpr = SORT_EXPRESSIONS[sortKey];

    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.query.query) {
      conditions.push(`canonical_name ILIKE $${idx++}`);
      params.push(`%${req.query.query}%`);
    }
    if (req.query.country) {
      conditions.push(`country_code = $${idx++}`);
      params.push(req.query.country);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(*) FROM canonical.mv_college_cards
      ${where}
    `;
    const { rows: countRows } = await pool.query(countSql, params);
    const total = parseInt(countRows[0].count);

    const listParams = [...params, PAGE_SIZE, offset];
    const dataSql = `
      SELECT
        id,
        canonical_name,
        country_code,
        city,
        website,
        logo_url,
        acceptance_rate,
        sat_50,
        act_50,
        tuition_international,
        cost_of_attendance,
        median_start_salary,
        metadata
      FROM canonical.mv_college_cards
      ${where}
      ORDER BY ${orderExpr}
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    const { rows } = await pool.query(dataSql, listParams);
    if (CANONICAL_DEBUG) {
      logger.info('canonical.cards.query.summary', {
        request_country: req.query.country || null,
        request_query: req.query.query || null,
        total,
        returned: rows.length,
        sample: rows.slice(0, 5).map((r) => ({
          institution_id: r.id,
          country_code: r.country_code,
          admissions_present: r.acceptance_rate != null || r.sat_50 != null || r.act_50 != null,
          financials_present: r.tuition_international != null || r.cost_of_attendance != null,
        })),
      });
    }

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
    const CollegeService = require('../services/collegeService');
    const college = await CollegeService.getCanonicalCollegeById(String(req.params.id).trim());
    if (!college) return res.status(404).json({ success: false, message: 'College not found' });
    if (CANONICAL_DEBUG) {
      logger.info('canonical.detail.route.summary', {
        institution_id: college?.institution?.id ?? null,
        country_code: college?.institution?.country_code ?? null,
        admissions_present: Object.keys(college?.admissions ?? {}).length > 0,
        financials_present: Object.keys(college?.financials ?? {}).length > 0,
        rankings_count: Array.isArray(college?.rankings) ? college.rankings.length : 0,
      });
    }

    res.json({
      success: true,
      data: college,
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
    const CollegeService = require('../services/collegeService');
    const detail = await CollegeService.getCanonicalCollegeById(String(req.params.id).trim());
    if (!detail) return res.status(404).json({ success: false, message: 'College not found' });
    const rows = Array.isArray(detail.programs) ? detail.programs : [];

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
    const CollegeService = require('../services/collegeService');
    const ids = (req.body.ids || []).slice(0, 4).map((v) => String(v).trim()).filter(Boolean);
    if (!ids.length) return res.status(400).json({ success: false, message: 'Provide at least one college ID' });

    const rows = (await Promise.all(ids.map((id) => CollegeService.getCanonicalCollegeById(id)))).filter(Boolean);

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

    const [total, countries, regions, completeness, quality] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total FROM canonical.institutions'),
      pool.query('SELECT country_code AS country, COUNT(*) AS count FROM canonical.institutions WHERE country_code IS NOT NULL GROUP BY country_code ORDER BY count DESC LIMIT 20'),
      pool.query("SELECT region_code AS state, COUNT(*) AS count FROM canonical.institutions WHERE region_code IS NOT NULL GROUP BY region_code ORDER BY count DESC"),
      pool.query('SELECT AVG(overall_score)::numeric(10,2) AS avg_completeness FROM canonical.institution_completeness'),
      pool.query('SELECT AVG(final_quality_score)::numeric(10,2) AS avg_quality FROM canonical.institution_quality_scores'),
    ]);

    res.json({
      success: true,
      data: {
        total: parseInt(total.rows[0].total),
        countries: countries.rows,
        states: regions.rows,
        avgCompleteness: Number(completeness.rows[0]?.avg_completeness ?? 0),
        avgQuality: Number(quality.rows[0]?.avg_quality ?? 0),
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

    // Fetch colleges with canonical admissions and search-card metadata.
    const { rows: colleges } = await pool.query(
       `SELECT
          i.id,
          i.canonical_name AS name,
          i.city,
          i.state_region AS state,
          i.country_code AS country,
          a.acceptance_rate,
          a.sat_50 AS median_sat,
          0.0::numeric AS popularity_score
        FROM canonical.institutions i
        JOIN LATERAL (
          SELECT acceptance_rate, sat_50
          FROM canonical.institution_admissions
          WHERE institution_id = i.id
          ORDER BY data_year DESC NULLS LAST, updated_at DESC
          LIMIT 1
        ) a ON TRUE
        WHERE a.acceptance_rate IS NOT NULL
          AND a.acceptance_rate > 0
        LIMIT 500`
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
      const csat = parseFloat(c.median_sat) || null;
      const pop  = parseFloat(c.popularity_score) || 0;

      // GPA alignment uses an acceptance-rate-based expectation curve:
      // selective (<20%) -> 3.8, mid-selective (20-40%) -> 3.4, broad access -> 3.0.
      const REACH_ACCEPT_RATE_THRESHOLD = 0.2;
      const MATCH_ACCEPT_RATE_THRESHOLD = 0.4;
      const REACH_GPA_EXPECTATION = 3.8;
      const MATCH_GPA_EXPECTATION = 3.4;
      const SAFETY_GPA_EXPECTATION = 3.0;
      let gpaAlignment = 0.5;
      if (effectiveGPA != null) {
        const targetGPA = ar < REACH_ACCEPT_RATE_THRESHOLD
          ? REACH_GPA_EXPECTATION
          : ar < MATCH_ACCEPT_RATE_THRESHOLD
            ? MATCH_GPA_EXPECTATION
            : SAFETY_GPA_EXPECTATION;
        gpaAlignment = Math.max(0, 1 - Math.abs(effectiveGPA - targetGPA) / 4.0);
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

// Keep this dynamic route last so it doesn't shadow literal paths (e.g. /comprehensive).
router.get('/:id', CollegeController.getCollegeById);

module.exports = router;
