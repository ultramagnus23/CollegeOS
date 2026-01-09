// backend/routes/applications.js
// API routes for application management
// When a user "adds" a college, it creates an application and auto-generates deadlines

const express = require('express');
const router = express.Router();
const College = require('../models/College');
const { generateDeadlinesForCollege } = require('../services/deadlineGenerator');
const db = require('../config/database');

// Auth middleware (you already have this)
const authMiddleware = require('../middleware/auth');

// Apply auth to all routes
router.use(authMiddleware);

/**
 * GET /api/applications
 * Get all applications for the logged-in user
 * Includes college details and deadline counts
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Query applications with college details joined
    const applications = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          a.*,
          c.name as college_name,
          c.country,
          c.location,
          c.logo_url,
          c.website_url,
          COUNT(d.id) as total_deadlines,
          SUM(CASE WHEN d.completed = 0 AND d.deadline_date >= date('now') THEN 1 ELSE 0 END) as pending_deadlines
        FROM applications a
        JOIN colleges c ON a.college_id = c.id
        LEFT JOIN deadlines d ON d.application_id = a.id
        WHERE a.user_id = ?
        GROUP BY a.id
        ORDER BY a.created_at DESC
      `, [userId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    res.json({
      success: true,
      data: applications
    });
    
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch applications',
      error: error.message
    });
  }
});

/**
 * GET /api/applications/:id
 * Get detailed information about a specific application
 * Includes all deadlines for this application
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Get application with college details
    const application = await new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          a.*,
          c.*
        FROM applications a
        JOIN colleges c ON a.college_id = c.id
        WHERE a.id = ? AND a.user_id = ?
      `, [id, userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }
    
    // Get all deadlines for this application
    const deadlines = await new Promise((resolve, reject) => {
      db.all(`
        SELECT * FROM deadlines
        WHERE application_id = ?
        ORDER BY deadline_date ASC
      `, [id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // Parse college JSON fields
    application.programs = JSON.parse(application.programs || '[]');
    application.requirements = JSON.parse(application.requirements || '{}');
    application.research_data = JSON.parse(application.research_data || '{}');
    
    res.json({
      success: true,
      data: {
        ...application,
        deadlines
      }
    });
    
  } catch (error) {
    console.error('Error fetching application:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch application details',
      error: error.message
    });
  }
});

/**
 * POST /api/applications
 * Create a new application by selecting a college
 * This automatically generates all relevant deadlines
 * 
 * Body:
 *   - college_id: ID of the college to apply to (required)
 *   - application_type: Type of application (optional: early_action, early_decision, regular)
 *   - notes: Any notes about this application (optional)
 */
router.post('/', async (req, res) => {
  try {
    const { college_id, application_type = 'regular', notes } = req.body;
    const userId = req.user.id;
    
    // Validate required fields
    if (!college_id) {
      return res.status(400).json({
        success: false,
        message: 'college_id is required'
      });
    }
    
    // Check if college exists
    const college = await College.findById(college_id);
    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'College not found'
      });
    }
    
    // Check if user already has an application for this college
    const existingApp = await new Promise((resolve, reject) => {
      db.get(`
        SELECT id FROM applications
        WHERE user_id = ? AND college_id = ?
      `, [userId, college_id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (existingApp) {
      return res.status(400).json({
        success: false,
        message: 'You already have an application for this college',
        existing_application_id: existingApp.id
      });
    }
    
    // START TRANSACTION
    // Create the application
    const applicationId = await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO applications (user_id, college_id, application_type, status, notes)
        VALUES (?, ?, ?, 'planning', ?)
      `, [userId, college_id, application_type, notes], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
    
    // Generate deadlines for this application
    const deadlines = generateDeadlinesForCollege(college, userId, applicationId);
    
    // Insert all deadlines
    const insertPromises = deadlines.map(deadline => {
      return new Promise((resolve, reject) => {
        db.run(`
          INSERT INTO deadlines (
            user_id, application_id, college_id, title, description,
            deadline_date, deadline_type, priority, is_optional
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          deadline.user_id,
          deadline.application_id,
          deadline.college_id,
          deadline.title,
          deadline.description,
          deadline.deadline_date,
          deadline.deadline_type,
          deadline.priority,
          deadline.is_optional ? 1 : 0
        ], function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });
    });
    
    await Promise.all(insertPromises);
    
    // Fetch the complete application with deadlines
    const newApplication = await new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          a.*,
          c.name as college_name,
          c.country,
          c.logo_url
        FROM applications a
        JOIN colleges c ON a.college_id = c.id
        WHERE a.id = ?
      `, [applicationId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    res.status(201).json({
      success: true,
      message: `Application created for ${college.name}. ${deadlines.length} deadlines automatically generated.`,
      data: {
        application: newApplication,
        deadlines_created: deadlines.length
      }
    });
    
  } catch (error) {
    console.error('Error creating application:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create application',
      error: error.message
    });
  }
});

/**
 * PATCH /api/applications/:id
 * Update an application's status or notes
 * Body can include: status, notes, essay_completed, recommendation_letters_sent, etc.
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const updates = req.body;
    
    // Verify ownership
    const application = await new Promise((resolve, reject) => {
      db.get(`
        SELECT id FROM applications WHERE id = ? AND user_id = ?
      `, [id, userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found or unauthorized'
      });
    }
    
    // Build update query dynamically based on provided fields
    const allowedFields = [
      'status', 'application_type', 'notes', 'submission_date',
      'decision_date', 'essay_completed', 'recommendation_letters_sent',
      'transcripts_sent', 'test_scores_sent'
    ];
    
    const updateFields = [];
    const updateValues = [];
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        updateValues.push(updates[field]);
      }
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }
    
    // Add updated_at timestamp
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(id);
    
    // Execute update
    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE applications
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `, updateValues, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    res.json({
      success: true,
      message: 'Application updated successfully'
    });
    
  } catch (error) {
    console.error('Error updating application:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update application',
      error: error.message
    });
  }
});

/**
 * DELETE /api/applications/:id
 * Delete an application
 * This will also delete all associated deadlines (CASCADE)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Delete the application (deadlines will cascade delete)
    const result = await new Promise((resolve, reject) => {
      db.run(`
        DELETE FROM applications
        WHERE id = ? AND user_id = ?
      `, [id, userId], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
    
    if (result === 0) {
      return res.status(404).json({
        success: false,
        message: 'Application not found or unauthorized'
      });
    }
    
    res.json({
      success: true,
      message: 'Application and associated deadlines deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting application:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete application',
      error: error.message
    });
  }
});

module.exports = router;