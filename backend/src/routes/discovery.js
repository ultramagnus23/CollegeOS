'use strict';

const express = require('express');
const dbManager = require('../config/database');
const router = express.Router();

function parseLimit(raw, def = 20) {
  const n = Number.parseInt(String(raw ?? def), 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(5, Math.min(60, n));
}

function titleCountry(codeOrName) {
  const raw = String(codeOrName || '').trim();
  if (!raw) return null;
  const mapped = { US: 'United States', USA: 'United States', UK: 'United Kingdom', IN: 'India' }[raw.toUpperCase()] || raw;
  return mapped.replace(/\b\w/g, (c) => c.toUpperCase());
}

function asNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function confidenceForRow(row) {
  const hasRank = row.best_rank != null || row.global_rank != null;
  const hasPopularity = row.popularity_score != null && Number(row.popularity_score) > 0;
  const hasOutcomes = row.employment_rate != null || row.median_start_salary != null || row.graduation_rate_4yr != null;
  const score = (hasRank ? 0.45 : 0) + (hasPopularity ? 0.3 : 0) + (hasOutcomes ? 0.25 : 0);
  return Number(score.toFixed(2));
}

async function listBase({ limit, whereClause = 'TRUE', params = [], orderBy = 'popularity_score DESC, global_rank ASC NULLS LAST, canonical_name ASC' }) {
  const pool = dbManager.getDatabase();
  const queryParams = [...params, limit];
  const { rows } = await pool.query(
    `SELECT
       id,
       canonical_name AS name,
       country_code AS country,
       city,
       logo_url,
       popularity_score,
       global_rank,
       acceptance_rate,
       graduation_rate_4yr,
       employment_rate,
       median_start_salary,
       CASE
         WHEN global_rank IS NULL OR global_rank <= 0 THEN NULL
         ELSE global_rank
       END AS best_rank
     FROM canonical.mv_college_cards
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${queryParams.length}`,
    queryParams
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    country: titleCountry(row.country),
    city: row.city,
    logo_url: row.logo_url || null,
    popularity_score: asNumber(row.popularity_score, 0),
    trending_delta_30d: 0,
    featured: false,
    best_rank: row.best_rank == null ? null : Number(row.best_rank),
    acceptance_rate: row.acceptance_rate == null ? null : asNumber(row.acceptance_rate, null),
    confidence_score: confidenceForRow(row),
  }));
}

async function listByMajor(major, limit) {
  const token = String(major || '').trim().toLowerCase();
  const metaRankKeys = {
    'computer science': ['subject_cs_rank', 'cs_rank', 'computer_science_rank'],
    engineering: ['subject_engineering_rank', 'engineering_rank'],
    business: ['subject_business_rank', 'business_rank'],
  };
  const keys = metaRankKeys[token] || [];
  const firstKey = keys[0];
  const secondKey = keys[1];
  const thirdKey = keys[2];
  return listBase({
    limit,
    whereClause: firstKey
      ? `TRUE`
      : `canonical_name ILIKE $1`,
    params: firstKey ? [] : [`%${major}%`],
    orderBy: firstKey
      ? `COALESCE(
          CASE WHEN (metadata->>'${firstKey}') ~ '^[0-9]+$' THEN (metadata->>'${firstKey}')::int END,
          CASE WHEN (metadata->>'${secondKey || firstKey}') ~ '^[0-9]+$' THEN (metadata->>'${secondKey || firstKey}')::int END,
          CASE WHEN (metadata->>'${thirdKey || firstKey}') ~ '^[0-9]+$' THEN (metadata->>'${thirdKey || firstKey}')::int END,
          global_rank,
          999999
        ) ASC,
        popularity_score DESC,
        canonical_name ASC`
      : 'global_rank ASC NULLS LAST, popularity_score DESC, canonical_name ASC',
  });
}

router.get('/popular', async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit, 24);
    const data = await listBase({ limit });
    res.json({ success: true, data, count: data.length });
  } catch (error) {
    next(error);
  }
});

router.get('/trending', async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit, 24);
    const data = await listBase({
      limit,
      orderBy: 'popularity_score DESC, global_rank ASC NULLS LAST, acceptance_rate ASC NULLS LAST, canonical_name ASC',
    });
    res.json({ success: true, data, count: data.length });
  } catch (error) {
    next(error);
  }
});

router.get('/top-by-major', async (req, res, next) => {
  try {
    const major = String(req.query.major || '').trim();
    if (!major) return res.status(400).json({ success: false, message: 'major query parameter is required' });
    const limit = parseLimit(req.query.limit, 20);
    const data = await listByMajor(major, limit);
    res.json({ success: true, major, data, count: data.length });
  } catch (error) {
    next(error);
  }
});

router.get('/top-by-country', async (req, res, next) => {
  try {
    const country = String(req.query.country || '').trim();
    if (!country) return res.status(400).json({ success: false, message: 'country query parameter is required' });
    const limit = parseLimit(req.query.limit, 20);
    const data = await listBase({
      limit,
      whereClause: 'LOWER(country_code) = LOWER($1)',
      params: [country],
      orderBy: 'global_rank ASC NULLS LAST, popularity_score DESC, canonical_name ASC',
    });
    res.json({ success: true, country: titleCountry(country), data, count: data.length });
  } catch (error) {
    next(error);
  }
});

router.get('/top-global', async (_req, res, next) => {
  try {
    const data = await listBase({
      limit: 20,
      orderBy: 'global_rank ASC NULLS LAST, popularity_score DESC, canonical_name ASC',
    });
    res.json({ success: true, category: 'top-global', data, count: data.length });
  } catch (error) {
    next(error);
  }
});

router.get('/top-cs', async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit, 20);
    const data = await listByMajor('computer science', limit);
    res.json({ success: true, category: 'top-cs', data, count: data.length });
  } catch (error) {
    next(error);
  }
});

router.get('/top-business', async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit, 20);
    const data = await listByMajor('business', limit);
    res.json({ success: true, category: 'top-business', data, count: data.length });
  } catch (error) {
    next(error);
  }
});

router.get('/top-engineering', async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit, 20);
    const data = await listByMajor('engineering', limit);
    res.json({ success: true, category: 'top-engineering', data, count: data.length });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
