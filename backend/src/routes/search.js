// backend/src/routes/search.js
// Advanced search engine with filters, sorting, and search history

const express = require('express');
const router = express.Router();
const dbManager = require('../config/database');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * Advanced College Search
 * GET /api/search/colleges
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
      sort = 'name',
      order = 'asc',
      page = 1,
      limit = 50
    } = req.query;

    const db = dbManager.getDatabase();
    const conditions = [];
    const params = [];

    // Full-text search on name, location, major_categories
    if (q) {
      conditions.push(`(
        LOWER(name) LIKE LOWER(?) OR 
        LOWER(location) LIKE LOWER(?) OR 
        LOWER(country) LIKE LOWER(?) OR
        LOWER(major_categories) LIKE LOWER(?)
      )`);
      const searchTerm = `%${q}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Country filter - support region grouping
    if (country) {
      const countryLower = country.toLowerCase();
      if (countryLower === 'europe') {
        conditions.push(`country NOT IN ('United States', 'USA', 'United Kingdom', 'UK', 'India')`);
      } else if (countryLower === 'united states' || countryLower === 'usa') {
        conditions.push(`(country = 'United States' OR country = 'USA')`);
      } else if (countryLower === 'united kingdom' || countryLower === 'uk') {
        conditions.push(`(country = 'United Kingdom' OR country = 'UK')`);
      } else {
        conditions.push('country = ?');
        params.push(country);
      }
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

    // Cost range
    if (min_cost) {
      conditions.push(`tuition_international >= ?`);
      params.push(parseInt(min_cost));
    }
    if (max_cost) {
      conditions.push(`tuition_international <= ?`);
      params.push(parseInt(max_cost));
    }

    // Programs filter
    if (programs) {
      const programList = programs.split(',');
      const programConditions = programList.map(() => 'LOWER(major_categories) LIKE LOWER(?)').join(' OR ');
      conditions.push(`(${programConditions})`);
      programList.forEach(p => params.push(`%${p.trim()}%`));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Valid sort fields
    const validSorts = {
      name: 'name',
      rate: 'acceptance_rate',
      cost: 'tuition_international',
      students: 'student_population',
      ranking: 'ranking'
    };

    const sortField = validSorts[sort] || 'name';
    const sortOrder = order === 'desc' ? 'DESC' : 'ASC';

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM colleges ${whereClause}`;
    const countResult = db.prepare(countQuery).get(...params);

    // Get results
    const query = `
      SELECT * FROM colleges 
      ${whereClause}
      ORDER BY ${sortField} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    const results = db.prepare(query).all(...params, limitNum, offset);

    // Format results
    const formattedResults = results.map(college => {
      let academicStrengths = [];
      let majorCategories = [];
      
      try { academicStrengths = JSON.parse(college.academic_strengths || '[]'); } catch (e) {}
      try { majorCategories = JSON.parse(college.major_categories || '[]'); } catch (e) {}
      
      return {
        id: college.id,
        name: college.name,
        country: college.country,
        location: college.location,
        officialWebsite: college.official_website,
        acceptanceRate: college.acceptance_rate,
        tuitionDomestic: college.tuition_domestic,
        tuitionInternational: college.tuition_international,
        studentPopulation: college.student_population,
        satRange: college.sat_range,
        actRange: college.act_range,
        ranking: college.ranking,
        academicStrengths,
        majorCategories,
        programs: majorCategories
      };
    });

    res.json({
      success: true,
      data: formattedResults,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: countResult.total,
        totalPages: Math.ceil(countResult.total / limitNum)
      }
    });

  } catch (error) {
    logger.error('Search error:', error);
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
    const db = dbManager.getDatabase();
    
    // Get simplified country filters (4 regions)
    const countryFilters = [
      { value: 'United States', label: 'United States' },
      { value: 'India', label: 'India' },
      { value: 'United Kingdom', label: 'United Kingdom' },
      { value: 'Europe', label: 'Europe' }
    ];
    
    // Add counts using safe queries
    countryFilters.forEach(filter => {
      let result;
      if (filter.value === 'Europe') {
        result = db.prepare(`SELECT COUNT(*) as count FROM colleges WHERE country NOT IN ('United States', 'USA', 'United Kingdom', 'UK', 'India')`).get();
      } else if (filter.value === 'United States') {
        result = db.prepare(`SELECT COUNT(*) as count FROM colleges WHERE country IN ('United States', 'USA')`).get();
      } else if (filter.value === 'United Kingdom') {
        result = db.prepare(`SELECT COUNT(*) as count FROM colleges WHERE country IN ('United Kingdom', 'UK')`).get();
      } else if (filter.value === 'India') {
        result = db.prepare(`SELECT COUNT(*) as count FROM colleges WHERE country = 'India'`).get();
      } else {
        // Use parameterized query for any other value
        result = db.prepare(`SELECT COUNT(*) as count FROM colleges WHERE country = ?`).get(filter.value);
      }
      filter.count = result.count;
    });

    // Get all unique programs/majors
    const programRows = db.prepare('SELECT major_categories FROM colleges').all();
    const allPrograms = new Set();
    programRows.forEach(row => {
      try {
        const programs = JSON.parse(row.major_categories || '[]');
        programs.forEach(p => allPrograms.add(p));
      } catch (e) {}
    });

    // Get acceptance rate and cost ranges
    const ranges = db.prepare(`
      SELECT 
        MIN(acceptance_rate) as min_rate,
        MAX(acceptance_rate) as max_rate,
        MIN(tuition_international) as min_cost,
        MAX(tuition_international) as max_cost
      FROM colleges
    `).get();

    res.json({
      success: true,
      data: {
        countries: countryFilters,
        programs: Array.from(allPrograms).sort(),
        acceptanceRate: {
          min: ranges.min_rate || 0,
          max: ranges.max_rate || 1
        },
        cost: {
          min: ranges.min_cost || 0,
          max: ranges.max_cost || 100000
        }
      }
    });

  } catch (error) {
    logger.error('Filters error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get filters',
      error: error.message
    });
  }
});

/**
 * POST /api/search/log
 * Log a search query to history
 */
router.post('/log', authenticate, async (req, res, next) => {
  try {
    const { query, resultCount } = req.body;
    const userId = req.user.userId;
    
    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }
    
    const db = dbManager.getDatabase();
    
    db.prepare(`
      INSERT INTO search_history (user_id, search_query, result_count)
      VALUES (?, ?, ?)
    `).run(userId, query.trim(), resultCount || 0);
    
    res.json({
      success: true,
      message: 'Search logged'
    });
  } catch (error) {
    logger.error('Failed to log search:', error);
    next(error);
  }
});

/**
 * GET /api/search/recent
 * Get recent searches for the current user
 */
router.get('/recent', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const parsedLimit = parseInt(req.query.limit);
    const limit = Math.min(isNaN(parsedLimit) ? 10 : parsedLimit, 20);
    
    const db = dbManager.getDatabase();
    
    const searches = db.prepare(`
      SELECT DISTINCT search_query, MAX(searched_at) as last_searched, MAX(result_count) as result_count
      FROM search_history
      WHERE user_id = ?
      GROUP BY search_query
      ORDER BY last_searched DESC
      LIMIT ?
    `).all(userId, limit);
    
    res.json({
      success: true,
      data: searches.map(s => ({
        query: s.search_query,
        lastSearched: s.last_searched,
        resultCount: s.result_count
      }))
    });
  } catch (error) {
    logger.error('Failed to get recent searches:', error);
    next(error);
  }
});

/**
 * DELETE /api/search/history
 * Clear search history
 */
router.delete('/history', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    const db = dbManager.getDatabase();
    
    const result = db.prepare(`
      DELETE FROM search_history WHERE user_id = ?
    `).run(userId);
    
    res.json({
      success: true,
      message: 'Search history cleared',
      deletedCount: result.changes
    });
  } catch (error) {
    logger.error('Failed to clear search history:', error);
    next(error);
  }
});

/**
 * GET /api/search/suggestions
 * Get search suggestions based on partial input
 */
router.get('/suggestions', async (req, res, next) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({
        success: true,
        data: { colleges: [], majors: [] }
      });
    }
    
    const db = dbManager.getDatabase();
    
    // Get college name suggestions
    const colleges = db.prepare(`
      SELECT DISTINCT name, country
      FROM colleges
      WHERE name LIKE ?
      ORDER BY name ASC
      LIMIT 10
    `).all(`%${q}%`);
    
    // Get major suggestions
    const majorsResult = db.prepare(`
      SELECT major_categories FROM colleges
      WHERE major_categories LIKE ?
      LIMIT 50
    `).all(`%${q}%`);
    
    const majorsSet = new Set();
    majorsResult.forEach(row => {
      try {
        const majors = JSON.parse(row.major_categories || '[]');
        majors.forEach(major => {
          if (major.toLowerCase().includes(q.toLowerCase())) {
            majorsSet.add(major);
          }
        });
      } catch (e) {}
    });
    
    res.json({
      success: true,
      data: {
        colleges: colleges.map(c => ({
          type: 'college',
          name: c.name,
          country: c.country
        })),
        majors: Array.from(majorsSet).slice(0, 5).map(m => ({
          type: 'major',
          name: m
        }))
      }
    });
  } catch (error) {
    logger.error('Failed to get suggestions:', error);
    next(error);
  }
});

module.exports = router;
