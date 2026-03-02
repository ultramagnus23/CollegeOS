// backend/src/routes/intelligentSearch.js
// Intelligent search with query type detection and knowledge base integration

const express = require('express');
const router = express.Router();
const IntelligentSearch = require('../services/intelligentSearch');
const logger = require('../utils/logger');

/**
 * Intelligent search endpoint
 * POST /api/intelligent-search
 * @body {string} query - Search query
 * @body {object} filters - Optional filters (country, type, etc.)
 */
router.post('/', async (req, res) => {
  try {
    const { query, filters = {} } = req.body;
    
    if (!query || query.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Query is required'
      });
    }
    
    const { sanitizeForLog } = require('../utils/security');
    
    logger.info('Intelligent search request', { query: sanitizeForLog(query) });
    
    // Perform intelligent search
    const result = await IntelligentSearch.search(query, { filters });
    
    res.json({
      success: true,
      ...result
    });
    
  } catch (error) {
    logger.error('Search error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed',
      error: 'An internal error occurred'
    });
  }
});

/**
 * Get query type classification
 * POST /api/intelligent-search/classify
 */
router.post('/classify', (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Query is required'
      });
    }
    
    const classification = IntelligentSearch.detectQueryType(query);
    
    res.json({
      success: true,
      query: query,
      classification: classification
    });
    
  } catch (error) {
    logger.error('Classification error:', error);
    res.status(500).json({
      success: false,
      error: 'An internal error occurred'
    });
  }
});

module.exports = router;