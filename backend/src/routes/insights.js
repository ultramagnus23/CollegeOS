/**
 * College Insights Routes  —  /api/insights
 *
 * REST endpoints for the `college_insights` table (migration 041).
 * Qualitative Reddit-sourced context surfaced as supplementary information —
 * never mixed into structured admissions or financial data.
 */
'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const dbManager = require('../config/database');
const logger = require('../utils/logger');

const VALID_TYPES = ['cost_experience','scholarship_success','perceived_value','general'];
const VALID_SENTIMENTS = ['positive','negative','neutral','mixed'];

function parseIntParam(val, fallback) {
  const n = parseInt(val, 10);
  return isNaN(n) ? fallback : n;
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/insights/:collegeId
 * Retrieve qualitative insights for a specific college.
 *
 * Query params:
 *   type       - insight_type filter
 *   sentiment  - filter by sentiment
 *   limit      - max results (default 20, max 100)
 *   offset
 */
router.get('/:collegeId', async (req, res, next) => {
  try {
    const pool = dbManager.getDatabase();
    const collegeId = parseIntParam(req.params.collegeId, null);

    if (!collegeId) {
      return res.status(400).json({ success: false, message: 'Invalid college ID' });
    }

    const {
      type,
      sentiment,
      limit: rawLimit = '20',
      offset: rawOffset = '0',
    } = req.query;

    if (type && !VALID_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid type. Allowed values: ${VALID_TYPES.join(', ')}`,
      });
    }

    if (sentiment && !VALID_SENTIMENTS.includes(sentiment)) {
      return res.status(400).json({
        success: false,
        message: `Invalid sentiment. Allowed values: ${VALID_SENTIMENTS.join(', ')}`,
      });
    }

    const limit = Math.min(parseIntParam(rawLimit, 20), 100);
    const offset = Math.max(parseIntParam(rawOffset, 0), 0);

    const conditions = [`college_id = $1`, `is_validated = TRUE`, `is_spam = FALSE`];
    const params = [collegeId];

    if (type) {
      params.push(type);
      conditions.push(`insight_type = $${params.length}`);
    }

    if (sentiment) {
      params.push(sentiment);
      conditions.push(`sentiment = $${params.length}`);
    }

    params.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT id, subreddit, post_url, posted_at, author_flair,
              college_name_raw, insight_type,
              content_snippet, sentiment, sentiment_score,
              scraped_at
       FROM   college_insights
       WHERE  ${conditions.join(' AND ')}
       ORDER  BY posted_at DESC NULLS LAST
       LIMIT  $${params.length - 1}
       OFFSET $${params.length}`,
      params
    );

    // Counts by type and sentiment for the UI summary
    const { rows: summary } = await pool.query(
      `SELECT insight_type, sentiment, COUNT(*)::int AS count
       FROM   college_insights
       WHERE  college_id = $1 AND is_validated = TRUE AND is_spam = FALSE
       GROUP  BY insight_type, sentiment`,
      [collegeId]
    );

    res.json({
      success: true,
      data: rows,
      count: rows.length,
      summary,
      notice: 'These insights are qualitative, user-sourced observations from Reddit. They are supplementary context only and are NOT included in structured admissions or financial data.',
    });
  } catch (err) {
    logger.error('GET /api/insights/:collegeId failed', { error: err.message });
    next(err);
  }
});

/**
 * GET /api/insights
 * Browse recent insights across all colleges.
 *
 * Query params: type, sentiment, limit, offset
 */
router.get('/', async (req, res, next) => {
  try {
    const pool = dbManager.getDatabase();

    const {
      type,
      sentiment,
      limit: rawLimit = '20',
      offset: rawOffset = '0',
    } = req.query;

    if (type && !VALID_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid type. Allowed values: ${VALID_TYPES.join(', ')}`,
      });
    }

    const limit = Math.min(parseIntParam(rawLimit, 20), 100);
    const offset = Math.max(parseIntParam(rawOffset, 0), 0);

    const conditions = [`is_validated = TRUE`, `is_spam = FALSE`];
    const params = [];

    if (type) {
      params.push(type);
      conditions.push(`insight_type = $${params.length}`);
    }

    if (sentiment) {
      params.push(sentiment);
      conditions.push(`sentiment = $${params.length}`);
    }

    params.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT ci.id, ci.subreddit, ci.post_url, ci.posted_at, ci.author_flair,
              ci.college_id, ci.college_name_raw, ci.insight_type,
              ci.content_snippet, ci.sentiment, ci.sentiment_score,
              ci.scraped_at, c.name AS college_name
       FROM   college_insights ci
       LEFT JOIN colleges c ON c.id = ci.college_id
       WHERE  ${conditions.join(' AND ')}
       ORDER  BY ci.posted_at DESC NULLS LAST
       LIMIT  $${params.length - 1}
       OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: rows,
      count: rows.length,
      notice: 'Qualitative, user-sourced observations from Reddit. Supplementary context only.',
    });
  } catch (err) {
    logger.error('GET /api/insights failed', { error: err.message });
    next(err);
  }
});

/**
 * POST /api/insights  (authenticated — used by the scraper pipeline)
 * Ingest a validated Reddit insight.
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { validate } = require('../services/scraperValidationService');
    const result = validate('college_insight', req.body);

    if (!result.valid) {
      return res.status(422).json({
        success: false,
        message: 'Record failed validation',
        errors: result.errors,
      });
    }

    const r = req.body;
    const pool = dbManager.getDatabase();

    const { rows } = await pool.query(
      `INSERT INTO college_insights (
         reddit_post_id, subreddit, post_url, posted_at, author_flair,
         college_id, college_name_raw, insight_type,
         content_snippet, full_text,
         sentiment, sentiment_score, sentiment_model,
         is_validated, scraped_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (reddit_post_id) DO NOTHING
       RETURNING *`,
      [
        r.reddit_post_id, r.subreddit, r.post_url || null,
        r.posted_at || null, r.author_flair || null,
        r.college_id || null, r.college_name_raw,
        r.insight_type, r.content_snippet, r.full_text || null,
        r.sentiment || 'neutral', r.sentiment_score || null, r.sentiment_model || null,
        true,
        r.scraped_at,
      ]
    );

    if (!rows.length) {
      return res.status(200).json({ success: true, message: 'Duplicate — already stored', duplicate: true });
    }

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error('POST /api/insights failed', { error: err.message });
    next(err);
  }
});

module.exports = router;
