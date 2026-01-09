// backend/src/routes/search.js
// Advanced search engine with filters, sorting, and full-text search

const express = require('express');
const router = express.Router();
const db = require('../config/database');

/**
 * Advanced College Search
 * GET /api/search/colleges
 * Query params:
 * - q: search query (name, location, programs)
 * - country: filter by country
 * - min_rate, max_rate: acceptance rate range
 * - min_cost, max_cost: cost range
 * - programs: comma-separated programs
 * - type: Public/Private
 * - sort: name, rate, cost, students
 * - order: asc, desc
 * - page, limit: pagination
 */
router.get('/colleges', async (req, res) => {
  try {
    const {
      q = '',
      country,
      min_rate,
      max_rate,
      min_cost,
      max_cost,
      programs,
      type,
      sort = 'name',
      order = 'asc',
      page = 1,
      limit = 20
    } = req.query;

    // Build WHERE clause
    const conditions = [];
    const params = [];

    // Full-text search on name, location, description
    if (q) {
      conditions.push(`(
        LOWER(name) LIKE LOWER(?) OR 
        LOWER(location) LIKE LOWER(?) OR 
        LOWER(description) LIKE LOWER(?) OR
        LOWER(programs) LIKE LOWER(?)
      )`);
      const searchTerm = `%${q}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Country filter
    if (country) {
      conditions.push('country = ?');
      params.push(country);
    }

    // Acceptance rate range
    if (min_rate) {
      conditions.push('acceptance_rate >= ?');
      params.push(parseFloat(min_rate));
    }
    if (max_rate) {
      conditions.push('acceptance_rate <= ?');
      params.push(parseFloat(max_rate));
    }

    // Cost range (from research_data JSON)
    if (min_cost || max_cost) {
      if (min_cost) {
        conditions.push(`CAST(json_extract(research_data, '$.avg_cost') AS INTEGER) >= ?`);
        params.push(parseInt(min_cost));
      }
      if (max_cost) {
        conditions.push(`CAST(json_extract(research_data, '$.avg_cost') AS INTEGER) <= ?`);
        params.push(parseInt(max_cost));
      }
    }

    // Programs filter
    if (programs) {
      const programList = programs.split(',');
      const programConditions = programList.map(() => 'LOWER(programs) LIKE LOWER(?)').join(' OR ');
      conditions.push(`(${programConditions})`);
      programList.forEach(p => params.push(`%${p.trim()}%`));
    }

    // Type filter
    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Valid sort fields
    const validSorts = {
      name: 'name',
      rate: 'acceptance_rate',
      cost: `CAST(json_extract(research_data, '$.avg_cost') AS INTEGER)`,
      students: `CAST(json_extract(research_data, '$.indian_students') AS INTEGER)`
    };

    const sortField = validSorts[sort] || 'name';
    const sortOrder = order === 'desc' ? 'DESC' : 'ASC';

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM colleges ${whereClause}`;
    const countResult = await new Promise((resolve, reject) => {
      db.get(countQuery, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // Get results
    const query = `
      SELECT 
        id, name, country, location, type, application_portal,
        acceptance_rate, programs, requirements, deadline_templates,
        research_data, description, website_url, logo_url
      FROM colleges 
      ${whereClause}
      ORDER BY ${sortField} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    const results = await new Promise((resolve, reject) => {
      db.all(query, [...params, parseInt(limit), offset], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Parse JSON fields
    const formattedResults = results.map(college => ({
      ...college,
      programs: JSON.parse(college.programs),
      requirements: JSON.parse(college.requirements),
      deadline_templates: JSON.parse(college.deadline_templates),
      research_data: JSON.parse(college.research_data)
    }));

    res.json({
      success: true,
      data: formattedResults,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.total,
        totalPages: Math.ceil(countResult.total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed',
      error: error.message
    });
  }
});

/**
 * Get filter options
 * GET /api/search/filters
 */
router.get('/filters', async (req, res) => {
  try {
    // Get unique countries
    const countries = await new Promise((resolve, reject) => {
      db.all('SELECT DISTINCT country FROM colleges ORDER BY country', (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(r => r.country));
      });
    });

    // Get all unique programs
    const programsQuery = 'SELECT DISTINCT programs FROM colleges';
    const programRows = await new Promise((resolve, reject) => {
      db.all(programsQuery, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const allPrograms = new Set();
    programRows.forEach(row => {
      try {
        const programs = JSON.parse(row.programs);
        programs.forEach(p => allPrograms.add(p));
      } catch (e) {}
    });

    // Get cost range
    const costRange = await new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          MIN(CAST(json_extract(research_data, '$.avg_cost') AS INTEGER)) as min_cost,
          MAX(CAST(json_extract(research_data, '$.avg_cost') AS INTEGER)) as max_cost
        FROM colleges
      `, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // Get acceptance rate range
    const rateRange = await new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          MIN(acceptance_rate) as min_rate,
          MAX(acceptance_rate) as max_rate
        FROM colleges
      `, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    res.json({
      success: true,
      filters: {
        countries,
        programs: Array.from(allPrograms).sort(),
        types: ['Public', 'Private'],
        costRange: {
          min: costRange.min_cost || 0,
          max: costRange.max_cost || 100000
        },
        acceptanceRateRange: {
          min: rateRange.min_rate || 0,
          max: rateRange.max_rate || 1
        }
      }
    });

  } catch (error) {
    console.error('Filters error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get filters',
      error: error.message
    });
  }
});

/**
 * Get search suggestions (autocomplete)
 * GET /api/search/suggestions?q=mit
 */
router.get('/suggestions', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ success: true, suggestions: [] });
    }

    const query = `
      SELECT name, country, location
      FROM colleges
      WHERE LOWER(name) LIKE LOWER(?)
      LIMIT 10
    `;

    const results = await new Promise((resolve, reject) => {
      db.all(query, [`%${q}%`], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    res.json({
      success: true,
      suggestions: results
    });

  } catch (error) {
    console.error('Suggestions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get suggestions',
      error: error.message
    });
  }
});

module.exports = router;