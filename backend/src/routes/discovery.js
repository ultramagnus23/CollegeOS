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

async function listBase({ limit, whereClause = 'TRUE', params = [], orderBy = 'pi.popularity_score DESC, pi.trending_delta_30d DESC' }) {
  const pool = dbManager.getDatabase();
  const queryParams = [...params, limit];
  const { rows } = await pool.query(
    `SELECT
       i.id,
       i.canonical_name AS name,
       i.country_code AS country,
       i.city,
       i.logo_url,
       pi.popularity_score,
       pi.trending_delta_30d,
       pi.featured,
       COALESCE((
         SELECT MIN(COALESCE(ir.global_rank, ir.national_rank))
         FROM canonical.institution_rankings ir
         WHERE ir.institution_id = i.id
       ), NULL) AS best_rank
     FROM canonical.institutions i
     JOIN canonical.popularity_index pi ON pi.institution_id = i.id
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
    popularity_score: Number(row.popularity_score) || 0,
    trending_delta_30d: Number(row.trending_delta_30d) || 0,
    featured: Boolean(row.featured),
    best_rank: row.best_rank == null ? null : Number(row.best_rank),
  }));
}

async function listByMajor(major, limit) {
  return listBase({
    limit,
    whereClause: `EXISTS (
      SELECT 1
      FROM canonical.institution_programs p
      WHERE p.institution_id = i.id
        AND p.program_name ILIKE $1
    )`,
    params: [`%${major}%`],
    orderBy: 'pi.popularity_score DESC, pi.trending_delta_30d DESC',
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
      orderBy: 'pi.trending_delta_30d DESC, pi.popularity_score DESC',
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
      whereClause: 'LOWER(i.country_code) = LOWER($1)',
      params: [country],
    });
    res.json({ success: true, country: titleCountry(country), data, count: data.length });
  } catch (error) {
    next(error);
  }
});

router.get('/top-global', async (_req, res, next) => {
  try {
    const data = await listBase({ limit: 20 });
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
