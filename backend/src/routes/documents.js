/**
 * Documents Routes for Document Vault
 * API endpoints for managing application documents
 */
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const Document = require('../models/Document');

// Require authentication for all routes
router.use(authenticate);

/**
 * GET /api/documents
 * Get all documents for the current user
 */
router.get('/', async (req, res, next) => {
  try {
    const { category, status, collegeId, limit } = req.query;
    
    const documents = Document.getByUserId(req.user.id, {
      category,
      status,
      collegeId,
      limit: limit ? parseInt(limit) : undefined
    });
    
    res.json({
      success: true,
      data: documents,
      count: documents.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/documents/summary
 * Get document category summary
 */
router.get('/summary', async (req, res, next) => {
  try {
    const summary = Document.getCategorySummary(req.user.id);
    const expiring = Document.getExpiringDocuments(req.user.id, 30);
    
    res.json({
      success: true,
      data: {
        categories: summary,
        expiring: expiring,
        totalDocuments: summary.reduce((sum, cat) => sum + cat.count, 0)
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/documents/expiring
 * Get documents expiring soon
 */
router.get('/expiring', async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const documents = Document.getExpiringDocuments(req.user.id, parseInt(days));
    
    res.json({
      success: true,
      data: documents,
      count: documents.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/documents/categories
 * Get all document categories
 */
router.get('/categories', async (req, res) => {
  res.json({
    success: true,
    data: Document.CATEGORIES
  });
});

/**
 * GET /api/documents/check/:collegeId
 * Check required documents for a college
 */
router.get('/check/:collegeId', async (req, res, next) => {
  try {
    const { collegeId } = req.params;
    const { required } = req.query;
    
    // Default required categories if not specified
    const requiredCategories = required 
      ? required.split(',')
      : ['transcript', 'test_score', 'essay'];
    
    const status = Document.checkRequiredDocuments(
      req.user.id, 
      collegeId, 
      requiredCategories
    );
    
    const complete = Object.values(status).every(v => v);
    
    res.json({
      success: true,
      data: {
        collegeId,
        status,
        complete,
        missingCategories: Object.entries(status)
          .filter(([_, hasDoc]) => !hasDoc)
          .map(([category]) => category)
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/documents/:id
 * Get document by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const document = Document.getById(req.params.id, req.user.id);
    
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }
    
    res.json({
      success: true,
      data: document
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/documents
 * Create a new document record
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      name,
      category,
      fileType,
      fileSize,
      filePath,
      fileUrl,
      description,
      status,
      expiryDate,
      tags,
      collegeIds,
      metadata
    } = req.body;
    
    if (!name || !category) {
      return res.status(400).json({
        success: false,
        message: 'Name and category are required'
      });
    }
    
    // Validate category
    const validCategories = Object.values(Document.CATEGORIES);
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Valid options: ${validCategories.join(', ')}`
      });
    }
    
    const document = Document.create(req.user.id, {
      name,
      category,
      fileType,
      fileSize,
      filePath,
      fileUrl,
      description,
      status,
      expiryDate,
      tags,
      collegeIds,
      metadata
    });
    
    res.status(201).json({
      success: true,
      data: document,
      message: 'Document created successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/documents/:id
 * Update a document
 */
router.put('/:id', async (req, res, next) => {
  try {
    const existing = Document.getById(req.params.id, req.user.id);
    
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }
    
    const document = Document.update(req.params.id, req.user.id, req.body);
    
    res.json({
      success: true,
      data: document,
      message: 'Document updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/documents/:id/tag
 * Tag document to colleges
 */
router.put('/:id/tag', async (req, res, next) => {
  try {
    const { collegeIds } = req.body;
    
    if (!Array.isArray(collegeIds)) {
      return res.status(400).json({
        success: false,
        message: 'collegeIds must be an array'
      });
    }
    
    const document = Document.tagToColleges(req.params.id, req.user.id, collegeIds);
    
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }
    
    res.json({
      success: true,
      data: document,
      message: 'Document tagged to colleges successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/documents/:id
 * Delete a document
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = Document.delete(req.params.id, req.user.id);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
