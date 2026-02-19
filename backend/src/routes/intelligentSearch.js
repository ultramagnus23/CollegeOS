// backend/src/routes/intelligentSearch.js
// Intelligent search with query type detection and knowledge base integration

const express = require('express');
const router = express.Router();
const IntelligentSearch = require('../services/intelligentSearch');

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
    
    console.log('🔍 Intelligent search:', query);
    
    // Perform intelligent search
    const result = await IntelligentSearch.search(query, { filters });
    
    res.json({
      success: true,
      ...result
    });
    
  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed',
      error: error.message
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
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;