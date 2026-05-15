const express = require('express');
const router = express.Router();
const DeadlineController = require('../controllers/deadlineController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const validators = require('../utils/validators');
const intelligenceSvc = require('../services/collegeDeadlineIntelligenceService');
const deadlineScrapingOrchestrator = require('../services/deadlineScrapingOrchestrator');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/security');
const dbManager = require('../config/database');

// All routes require authentication
router.use(authenticate);

// ── Personal deadline CRUD (unchanged) ────────────────────────────────────────

router.get('/', DeadlineController.getDeadlines);
router.post('/', validate(validators.createDeadline), DeadlineController.createDeadline);
router.put('/:id', DeadlineController.updateDeadline);
router.delete('/:id', DeadlineController.deleteDeadline);

// ── Intelligence Layer ────────────────────────────────────────────────────────
// All paths are prefixed with /intelligence so they don't clash with /:id above.

/**
 * GET /api/deadlines/intelligence/upcoming?days=90
 * Upcoming deadlines for the authenticated user's saved colleges.
 * Sorted by deadline_date ASC; includes confidence_tier + days_until.
 */
router.get('/intelligence/upcoming', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const days = Math.min(parseInt(req.query.days || '90', 10), 365);
    const deadlines = await intelligenceSvc.getUpcomingForUser(userId, days);
    res.json({ success: true, count: deadlines.length, data: deadlines });
  } catch (error) {
    logger.error('GET /deadlines/intelligence/upcoming failed', { error: error.message });
    next(error);
  }
});

/**
 * GET /api/deadlines/intelligence/college/:id
 * All deadlines for a specific college + year-over-year history + missing data flags.
 */
router.get('/intelligence/college/:id', async (req, res, next) => {
  try {
    const collegeId = parseInt(req.params.id, 10);
    if (!collegeId || collegeId < 1) {
      return res.status(400).json({ success: false, message: 'Invalid college id' });
    }
    const result = await intelligenceSvc.getForCollege(collegeId);
    if (!result.college) {
      return res.status(404).json({ success: false, message: 'College not found' });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('GET /deadlines/intelligence/college/:id failed', { error: error.message });
    next(error);
  }
});

/**
 * GET /api/deadlines/intelligence/country/:country
 * All colleges + deadlines for a given country, grouped by college.
 */
router.get('/intelligence/country/:country', async (req, res, next) => {
  try {
    const country = req.params.country;
    if (!country || country.length > 100) {
      return res.status(400).json({ success: false, message: 'Invalid country' });
    }
    const data = await intelligenceSvc.getByCountry(country);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    logger.error('GET /deadlines/intelligence/country/:country failed', { error: error.message });
    next(error);
  }
});

/**
 * GET /api/deadlines/intelligence/history/:collegeId
 * Year-over-year deadline history for a college.
 */
router.get('/intelligence/history/:collegeId', async (req, res, next) => {
  try {
    const collegeId = parseInt(req.params.collegeId, 10);
    if (!collegeId || collegeId < 1) {
      return res.status(400).json({ success: false, message: 'Invalid college id' });
    }
    const history = await intelligenceSvc.getHistory(collegeId);
    res.json({ success: true, count: history.length, data: history });
  } catch (error) {
    logger.error('GET /deadlines/intelligence/history/:collegeId failed', { error: error.message });
    next(error);
  }
});

/**
 * POST /api/deadlines/intelligence/refresh/:collegeId
 * Trigger a live re-scrape for one college.
 * Requires the college to exist in canonical colleges table.
 */
router.post('/intelligence/refresh/:collegeId', async (req, res, next) => {
  try {
    const collegeId = parseInt(req.params.collegeId, 10);
    if (!collegeId || collegeId < 1) {
      return res.status(400).json({ success: false, message: 'Invalid college id' });
    }

    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT
         id,
         name,
         COALESCE(
           to_jsonb(colleges) ->> 'official_website',
           to_jsonb(colleges) ->> 'website_url',
           to_jsonb(colleges) ->> 'website'
         ) AS deadlines_page_url
       FROM colleges
       WHERE id = $1`,
      [collegeId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'College not found' });
    }

    logger.info('Manual deadline refresh triggered', {
      collegeId: sanitizeForLog(String(collegeId)),
      user: sanitizeForLog(String(req.user.userId)),
    });

    // Run asynchronously — respond immediately to the client
    setImmediate(async () => {
      try {
        await deadlineScrapingOrchestrator.scrapeAndUpdateCollege(rows[0]);
      } catch (err) {
        logger.error('Background refresh failed', { collegeId, error: err.message });
      }
    });

    res.json({ success: true, message: 'Deadline refresh queued', college: rows[0].name });
  } catch (error) {
    logger.error('POST /deadlines/intelligence/refresh/:collegeId failed', { error: error.message });
    next(error);
  }
});

module.exports = router;
