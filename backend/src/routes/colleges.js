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

// Get all majors with counts (Issue 7)
router.get('/majors', CollegeController.getMajors);

router.get('/', CollegeController.getColleges);
router.get('/search', CollegeController.searchColleges);
router.get('/filters/countries', CollegeController.getCountries);
router.get('/filters/programs', CollegeController.getPrograms);
router.get('/stats', CollegeController.getDatabaseStats);
router.get('/:id', CollegeController.getCollegeById);
router.get('/:id/majors', CollegeController.getCollegeMajors);
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

// ─── colleges_comprehensive endpoints ─────────────────────────────────────────
// These routes query the `colleges_comprehensive` table (Supabase-seeded, 6,207 rows)
// and its related child tables using the existing PostgreSQL pool.

/**
 * GET /api/colleges/comprehensive
 * List + search colleges_comprehensive with optional filters.
 *
 * Query params:
 *   query     — name ILIKE search
 *   state     — exact state match
 *   type      — 'public' | 'private' | 'for-profit'
 *   setting   — 'urban' | 'suburban' | 'rural'
 *   page      — 1-based page number (default 1, 20 per page)
 */
router.get('/comprehensive', async (req, res, next) => {
  try {
    const db = require('../config/database');
    const pool = db.getDatabase();
    const PAGE_SIZE = 20;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const offset = (page - 1) * PAGE_SIZE;

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
      conditions.push(`cc.type = $${idx++}`);
      params.push(req.query.type);
    }
    if (req.query.setting) {
      conditions.push(`cc.setting = $${idx++}`);
      params.push(req.query.setting);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) FROM colleges_comprehensive cc ${where}`;
    const { rows: countRows } = await pool.query(countSql, params);
    const total = parseInt(countRows[0].count);

    const listParams = [...params, PAGE_SIZE, offset];
    const dataSql = `
      SELECT
        cc.*,
        ca.acceptance_rate, ca.test_optional, ca.sat_avg, ca.sat_range, ca.act_range, ca.gpa_50,
        cfd.tuition_in_state, cfd.tuition_out_state, cfd.tuition_international, cfd.avg_net_price,
        ad.graduation_rate_4yr, ad.retention_rate, ad.median_salary_6yr, ad.median_salary_10yr, ad.median_debt
      FROM colleges_comprehensive cc
      LEFT JOIN college_admissions ca ON ca.college_id = cc.id
      LEFT JOIN college_financial_data cfd ON cfd.college_id = cc.id
      LEFT JOIN academic_details ad ON ad.college_id = cc.id
      ${where}
      ORDER BY cc.name ASC
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
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/colleges/comprehensive/:id
 * Fetch a single college from colleges_comprehensive with ALL related data.
 */
router.get('/comprehensive/:id', async (req, res, next) => {
  try {
    const db = require('../config/database');
    const pool = db.getDatabase();
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid college ID' });

    const { rows: college } = await pool.query(
      'SELECT * FROM colleges_comprehensive WHERE id = $1',
      [id]
    );
    if (!college.length) return res.status(404).json({ success: false, message: 'College not found' });

    const [admissions, financials, academics, programs, demographics, campusLife, rankings, deadlines, contact] =
      await Promise.all([
        pool.query('SELECT * FROM college_admissions WHERE college_id = $1', [id]),
        pool.query('SELECT * FROM college_financial_data WHERE college_id = $1', [id]),
        pool.query('SELECT * FROM academic_details WHERE college_id = $1', [id]),
        pool.query('SELECT * FROM college_programs WHERE college_id = $1 ORDER BY degree_type, program_name', [id]),
        pool.query('SELECT * FROM student_demographics WHERE college_id = $1', [id]),
        pool.query('SELECT * FROM campus_life WHERE college_id = $1', [id]),
        pool.query('SELECT * FROM college_rankings WHERE college_id = $1', [id]),
        pool.query('SELECT * FROM college_deadlines WHERE college_id = $1', [id]).catch((err) => { logger.warn('college_deadlines query failed for id %d: %s', id, err.message); return { rows: [] }; }),
        pool.query('SELECT * FROM college_contact WHERE college_id = $1', [id]).catch((err) => { logger.warn('college_contact query failed for id %d: %s', id, err.message); return { rows: [] }; }),
      ]);

    res.json({
      success: true,
      data: {
        ...college[0],
        college_admissions: admissions.rows,
        college_financial_data: financials.rows,
        academic_details: academics.rows,
        college_programs: programs.rows,
        student_demographics: demographics.rows,
        campus_life: campusLife.rows,
        college_rankings: rankings.rows,
        college_deadlines: deadlines.rows,
        college_contact: contact.rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/colleges/comprehensive/:id/programs
 * Programs list for a college from colleges_comprehensive, grouped by degree_type.
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
      `SELECT
        cc.*,
        ca.acceptance_rate, ca.test_optional, ca.sat_avg, ca.sat_range, ca.act_range, ca.gpa_50,
        cfd.tuition_in_state, cfd.tuition_out_state, cfd.tuition_international, cfd.avg_net_price,
        ad.graduation_rate_4yr, ad.retention_rate, ad.median_salary_6yr, ad.median_salary_10yr, ad.median_debt
      FROM colleges_comprehensive cc
      LEFT JOIN college_admissions ca ON ca.college_id = cc.id
      LEFT JOIN college_financial_data cfd ON cfd.college_id = cc.id
      LEFT JOIN academic_details ad ON ad.college_id = cc.id
      WHERE cc.id = ANY($1)`,
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
      pool.query('SELECT COUNT(*) AS total FROM colleges_comprehensive'),
      pool.query('SELECT country, COUNT(*) AS count FROM colleges_comprehensive WHERE country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT 20'),
      pool.query("SELECT state, COUNT(*) AS count FROM colleges_comprehensive WHERE state IS NOT NULL AND country = 'United States' GROUP BY state ORDER BY count DESC"),
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

module.exports = router;