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

    // Full-text search using canonical colleges table.
    if (q) {
      conditions.push(
        `to_tsvector('english',
          coalesce(name,'') || ' ' ||
          coalesce(city,'') || ' ' ||
          coalesce(state,'') || ' ' ||
          coalesce(country,'') || ' ' ||
          coalesce(description,'') || ' ' ||
          coalesce((SELECT string_agg(cp.program_name, ' ') FROM college_programs cp WHERE cp.college_id=c.id),'')
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
      conditions.push(`c.acceptance_rate >= $${paramIndex}`);
      params.push(parseFloat(min_rate));
      paramIndex++;
    }
    if (max_rate) {
      conditions.push(`c.acceptance_rate <= $${paramIndex}`);
      params.push(parseFloat(max_rate));
      paramIndex++;
    }

    // Cost range
    if (min_cost) {
      conditions.push(`c.tuition_international >= $${paramIndex}`);
      params.push(parseInt(min_cost));
      paramIndex++;
    }
    if (max_cost) {
      conditions.push(`c.tuition_international <= $${paramIndex}`);
      params.push(parseInt(max_cost));
      paramIndex++;
    }

    // Programs filter
    if (programs) {
      const programList = programs.split(',');
      const programConditions = programList.map(() => {
        const cond = `EXISTS (SELECT 1 FROM college_programs cp WHERE cp.college_id=c.id AND LOWER(cp.program_name) LIKE LOWER($${paramIndex}))`;
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
      rate: 'c.acceptance_rate',
      cost: 'c.tuition_international',
      students: 'c.total_enrollment',
      ranking: 'COALESCE(c.ranking_us_news, c.ranking_qs, c.ranking_the, 999999)'
    };

    const sortField = validSorts[sort] || 'name';
    const sortOrder = order === 'desc' ? 'DESC' : 'ASC';

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM public.colleges c
      ${whereClause}
    `;
    const countResult = (await pool.query(countQuery, params)).rows[0];

    // Get results
    const queryParams = [...params, limitNum, offset];
    const query = `
      SELECT
        c.id,
        c.name,
        c.country,
        c.state,
        c.city,
        c.description,
        c.official_website,
        LOWER(REGEXP_REPLACE(c.name, '\\s+', '-', 'g')) || '-' || c.id AS slug,
        c.acceptance_rate,
        c.sat_25,
        c.sat_75,
        c.act_25,
        c.act_75,
        c.gpa_25,
        c.gpa_75,
        c.tuition_domestic AS tuition_in_state,
        c.tuition_international,
        c.total_enrollment,
        (SELECT ARRAY_AGG(cp.program_name) FROM college_programs cp WHERE cp.college_id=c.id) as program_names
      FROM public.colleges c
      ${whereClause}
      ORDER BY ${sortField} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const results = (await pool.query(query, queryParams)).rows;

    // Format results
    const formattedResults = results.map(college => {
      let majorCategories = [];
      
      majorCategories = Array.isArray(college.program_names) ? college.program_names.filter(Boolean) : [];
      
      return {
        id: college.id,
        slug: college.slug,
        name: college.name,
        country: college.country,
        state: college.state || null,
        city: college.city || null,
        location: [college.city, college.state, college.country].filter(Boolean).join(', ') || college.country,
        officialWebsite: college.official_website,
        acceptanceRate: college.acceptance_rate ?? null,
        satScore25: college.sat_25 ?? null,
        satScore75: college.sat_75 ?? null,
        actScore25: college.act_25 ?? null,
        actScore75: college.act_75 ?? null,
        tuitionDomestic: college.tuition_in_state ?? null,
        tuitionInternational: college.tuition_international ?? null,
        studentPopulation: college.total_enrollment ?? null,
        graduationRate4yr: null,
        graduationRate6yr: null,
        studentFacultyRatio: null,
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
        result = (await pool.query(`SELECT COUNT(*) as count FROM public.colleges WHERE country NOT IN ('United States', 'USA', 'United Kingdom', 'UK', 'India')`)).rows[0];
      } else if (filter.value === 'United States') {
        result = (await pool.query(`SELECT COUNT(*) as count FROM public.colleges WHERE country IN ('United States', 'USA')`)).rows[0];
      } else if (filter.value === 'United Kingdom') {
        result = (await pool.query(`SELECT COUNT(*) as count FROM public.colleges WHERE country IN ('United Kingdom', 'UK')`)).rows[0];
      } else if (filter.value === 'India') {
        result = (await pool.query(`SELECT COUNT(*) as count FROM public.colleges WHERE country = 'India'`)).rows[0];
      } else {
        // Use parameterized query for any other value
        result = (await pool.query(`SELECT COUNT(*) as count FROM public.colleges WHERE country = $1`, [filter.value])).rows[0];
      }
      filter.count = parseInt(result.count);
    }

    // Get all unique programs/majors
    const programRows = (await pool.query('SELECT DISTINCT program_name FROM college_programs WHERE program_name IS NOT NULL ORDER BY program_name')).rows;
    const allPrograms = new Set(programRows.map(r => r.program_name));

    // Get acceptance rate and cost ranges
    const ranges = (await pool.query(`
      SELECT 
        MIN(c.acceptance_rate) as min_rate,
        MAX(c.acceptance_rate) as max_rate,
        MIN(c.tuition_international) as min_cost,
        MAX(c.tuition_international) as max_cost
      FROM public.colleges c
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
      FROM public.colleges
      WHERE to_tsvector('english', coalesce(name,'')) @@ websearch_to_tsquery('english', $1)
      ORDER BY name ASC
      LIMIT 10
    `, [q])).rows;
    
    // Get major suggestions using program names from college_programs
    const majorsResult = (await pool.query(`
      SELECT DISTINCT program_name
      FROM college_programs
      WHERE program_name ILIKE $1
      LIMIT 50
    `, [`%${q}%`])).rows;
    
    const majorsSet = new Set(majorsResult.map(r => r.program_name));
    
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
