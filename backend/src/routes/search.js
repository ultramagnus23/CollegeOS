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

    const pool = dbManager.getDatabase();
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Full-text search using PostgreSQL tsvector (GIN index on idx_colleges_fts)
    if (q) {
      conditions.push(
        `to_tsvector('english',
          coalesce(name,'') || ' ' ||
          coalesce(location,'') || ' ' ||
          coalesce(country,'') || ' ' ||
          coalesce(description,'') || ' ' ||
          coalesce(major_categories,'') || ' ' ||
          coalesce(academic_strengths,'')
        ) @@ websearch_to_tsquery('english', $${paramIndex})`
      );
      params.push(q);
      paramIndex += 1;
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
        conditions.push(`country = $${paramIndex}`);
        params.push(country);
        paramIndex++;
      }
    }

    // Acceptance rate range
    if (min_rate) {
      conditions.push(`acceptance_rate >= $${paramIndex}`);
      params.push(parseFloat(min_rate));
      paramIndex++;
    }
    if (max_rate) {
      conditions.push(`acceptance_rate <= $${paramIndex}`);
      params.push(parseFloat(max_rate));
      paramIndex++;
    }

    // Cost range
    if (min_cost) {
      conditions.push(`tuition_international >= $${paramIndex}`);
      params.push(parseInt(min_cost));
      paramIndex++;
    }
    if (max_cost) {
      conditions.push(`tuition_international <= $${paramIndex}`);
      params.push(parseInt(max_cost));
      paramIndex++;
    }

    // Programs filter
    if (programs) {
      const programList = programs.split(',');
      const programConditions = programList.map(() => {
        const cond = `LOWER(major_categories) LIKE LOWER($${paramIndex})`;
        paramIndex++;
        return cond;
      }).join(' OR ');
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
    const countResult = (await pool.query(countQuery, params)).rows[0];

    // Get results
    const queryParams = [...params, limitNum, offset];
    const query = `
      SELECT * FROM colleges 
      ${whereClause}
      ORDER BY ${sortField} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const results = (await pool.query(query, queryParams)).rows;

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
        total: parseInt(countResult.total),
        totalPages: Math.ceil(parseInt(countResult.total) / limitNum)
      }
    });

  } catch (error) {
    logger.error('Search error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed'
    });
  }
});

/**
 * Get filter options
 * GET /api/search/filters
 */
router.get('/filters', async (req, res) => {
  try {
    const pool = dbManager.getDatabase();
    
    // Get simplified country filters (4 regions)
    const countryFilters = [
      { value: 'United States', label: 'United States' },
      { value: 'India', label: 'India' },
      { value: 'United Kingdom', label: 'United Kingdom' },
      { value: 'Europe', label: 'Europe' }
    ];
    
    // Add counts using safe queries
    for (const filter of countryFilters) {
      let result;
      if (filter.value === 'Europe') {
        result = (await pool.query(`SELECT COUNT(*) as count FROM colleges WHERE country NOT IN ('United States', 'USA', 'United Kingdom', 'UK', 'India')`)).rows[0];
      } else if (filter.value === 'United States') {
        result = (await pool.query(`SELECT COUNT(*) as count FROM colleges WHERE country IN ('United States', 'USA')`)).rows[0];
      } else if (filter.value === 'United Kingdom') {
        result = (await pool.query(`SELECT COUNT(*) as count FROM colleges WHERE country IN ('United Kingdom', 'UK')`)).rows[0];
      } else if (filter.value === 'India') {
        result = (await pool.query(`SELECT COUNT(*) as count FROM colleges WHERE country = 'India'`)).rows[0];
      } else {
        // Use parameterized query for any other value
        result = (await pool.query(`SELECT COUNT(*) as count FROM colleges WHERE country = $1`, [filter.value])).rows[0];
      }
      filter.count = parseInt(result.count);
    }

    // Get all unique programs/majors
    const programRows = (await pool.query('SELECT major_categories FROM colleges')).rows;
    const allPrograms = new Set();
    programRows.forEach(row => {
      try {
        const programs = JSON.parse(row.major_categories || '[]');
        programs.forEach(p => allPrograms.add(p));
      } catch (e) {}
    });

    // Get acceptance rate and cost ranges
    const ranges = (await pool.query(`
      SELECT 
        MIN(acceptance_rate) as min_rate,
        MAX(acceptance_rate) as max_rate,
        MIN(tuition_international) as min_cost,
        MAX(tuition_international) as max_cost
      FROM colleges
    `)).rows[0];

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
      message: 'Failed to get filters'
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
    
    const pool = dbManager.getDatabase();
    
    await pool.query(`
      INSERT INTO search_history (user_id, search_query, result_count)
      VALUES ($1, $2, $3)
    `, [userId, query.trim(), resultCount || 0]);
    
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
    
    const pool = dbManager.getDatabase();
    
    const searches = (await pool.query(`
      SELECT DISTINCT search_query, MAX(searched_at) as last_searched, MAX(result_count) as result_count
      FROM search_history
      WHERE user_id = $1
      GROUP BY search_query
      ORDER BY last_searched DESC
      LIMIT $2
    `, [userId, limit])).rows;
    
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
    
    const pool = dbManager.getDatabase();
    
    const result = await pool.query(`
      DELETE FROM search_history WHERE user_id = $1
    `, [userId]);
    
    res.json({
      success: true,
      message: 'Search history cleared',
      deletedCount: result.rowCount
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
    const rawQ = req.query.q;
    let q;

    // Normalize q to a string to avoid type confusion (e.g., arrays from repeated query params)
    if (Array.isArray(rawQ)) {
      q = rawQ[0];
    } else {
      q = rawQ;
    }

    if (typeof q !== 'string' || q.length < 2) {
      return res.json({
        success: true,
        data: { colleges: [], majors: [] }
      });
    }
    
    const pool = dbManager.getDatabase();
    
    // Get college name suggestions using FTS
    const colleges = (await pool.query(`
      SELECT DISTINCT name, country
      FROM colleges
      WHERE to_tsvector('english', coalesce(name,'')) @@ websearch_to_tsquery('english', $1)
      ORDER BY name ASC
      LIMIT 10
    `, [q])).rows;
    
    // Get major suggestions using FTS
    const majorsResult = (await pool.query(`
      SELECT major_categories FROM colleges
      WHERE to_tsvector('english', coalesce(major_categories,'')) @@ websearch_to_tsquery('english', $1)
      LIMIT 50
    `, [q])).rows;
    
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
