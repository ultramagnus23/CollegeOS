// Research/Search Engine Routes
// Layer 3: On-demand research and major-based search

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ResearchController = require('../controllers/researchController');
const logger = require('../utils/logger');

// Search colleges by major/program
// GET /api/research/majors?major=Computer+Science&country=US
router.get('/majors', async (req, res, next) => {
  try {
    const { major, country, limit = 100 } = req.query;
    
    if (!major || major.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Major/program name is required'
      });
    }
    
    const dbManager = require('../config/database');
    const pool = dbManager.getDatabase();
    
    // Search in major_categories JSON field
    // Use LOWER() for case-insensitive matching
    let query = `
      SELECT * FROM colleges 
      WHERE LOWER(major_categories::text) LIKE LOWER($1)
    `;
    const params = [`%${major.trim()}%`];
    let idx = 2;
    
    if (country) {
      query += ` AND country = $${idx++}`;
      params.push(country);
    }
    
    query += ` ORDER BY name ASC LIMIT $${idx++}`;
    params.push(parseInt(limit));
    
    let colleges;
    try {
      const { rows } = await pool.query(query, params);
      colleges = rows;
    } catch (error) {
      logger.error('Database query error:', error);
      return res.status(500).json({
        success: false,
        message: 'Database query failed',
        error: 'An internal error occurred'
      });
    }
    
    // Parse JSON fields safely
    const results = colleges.map(college => {
      try {
        return {
          ...college,
          academicStrengths: JSON.parse(college.academic_strengths || '[]'),
          majorCategories: JSON.parse(college.major_categories || '[]')
        };
      } catch (e) {
        logger.warn(`Failed to parse JSON for college ${college.id}:`, e);
        return {
          ...college,
          academicStrengths: [],
          majorCategories: []
        };
      }
    });
    
    res.json({
      success: true,
      count: results.length,
      searchTerm: major,
      filters: { country: country || 'all' },
      data: results
    });
  } catch (error) {
    logger.error('Major search failed:', error);
    next(error);
  }
});

// Comprehensive search across all fields
// GET /api/research/search?q=engineering&country=US&type=major
router.get('/search', async (req, res, next) => {
  try {
    const { q, country, type = 'all' } = req.query;
    
    if (!q || q.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }
    
    const searchTerm = q.trim();
    const dbManager = require('../config/database');
    const pool = dbManager.getDatabase();
    
    let query = '';
    const params = [];
    let idx = 1;
    
    if (type === 'major' || type === 'program') {
      // Search only in major_categories
      query = `SELECT * FROM colleges WHERE major_categories ILIKE $1`;
      params.push(`%"${searchTerm}"%`);
      idx = 2;
    } else if (type === 'name') {
      // Search only in name
      query = `SELECT * FROM colleges WHERE name ILIKE $1`;
      params.push(`%${searchTerm}%`);
      idx = 2;
    } else {
      // Search across name, location, country, major_categories, academic_strengths
      const searchPattern = `%${searchTerm}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      query = `
        SELECT * FROM colleges 
        WHERE (
          name ILIKE $1 
          OR location ILIKE $2
          OR country ILIKE $3
          OR major_categories ILIKE $4
          OR academic_strengths ILIKE $5
        )
      `;
      idx = 6;
    }
    
    if (country) {
      query += ` AND country = $${idx++}`;
      params.push(country);
    }
    
    query += ' ORDER BY name ASC LIMIT 500';
    
    let colleges;
    try {
      const { rows } = await pool.query(query, params);
      colleges = rows;
    } catch (error) {
      logger.error('Database query error:', error);
      return res.status(500).json({
        success: false,
        message: 'Database query failed',
        error: 'An internal error occurred'
      });
    }
    
    // Parse JSON fields safely
    const results = colleges.map(college => {
      try {
        return {
          ...college,
          academicStrengths: JSON.parse(college.academic_strengths || '[]'),
          majorCategories: JSON.parse(college.major_categories || '[]')
        };
      } catch (e) {
        logger.warn(`Failed to parse JSON for college ${college.id}:`, e);
        return {
          ...college,
          academicStrengths: [],
          majorCategories: []
        };
      }
    });
    
    res.json({
      success: true,
      count: results.length,
      searchTerm: searchTerm,
      searchType: type,
      filters: { country: country || 'all' },
      data: results
    });
  } catch (error) {
    logger.error('Research search failed:', error);
    next(error);
  }
});

// Get all available majors/programs across all colleges
// GET /api/research/majors/list
router.get('/majors/list', async (req, res, next) => {
  try {
    const dbManager = require('../config/database');
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query('SELECT major_categories FROM colleges WHERE major_categories IS NOT NULL');
    
    const majorsSet = new Set();
    rows.forEach(row => {
      try {
        const categories = JSON.parse(row.major_categories || '[]');
        if (Array.isArray(categories)) {
          categories.forEach(cat => majorsSet.add(cat));
        }
      } catch (e) {
        // Skip invalid JSON
      }
    });
    
    const majors = Array.from(majorsSet).sort();
    
    res.json({
      success: true,
      count: majors.length,
      data: majors
    });
  } catch (error) {
    logger.error('Get majors list failed:', error);
    next(error);
  }
});

// On-demand research endpoint (existing)
router.post('/on-demand', authenticate, ResearchController.conductResearch);

module.exports = router;
