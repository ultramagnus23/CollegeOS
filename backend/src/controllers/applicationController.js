const Application = require('../models/Application');
const logger = require('../utils/logger');

// Generate request ID for tracking
function generateRequestId() {
  return `app_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

// Only include debug info in development
function addDebugInfo(obj, debugData) {
  if (process.env.NODE_ENV === 'development') {
    return { ...obj, _debug: debugData };
  }
  return obj;
}

class ApplicationController {
  // Get all user applications
  static async getApplications(req, res, next) {
    const requestId = generateRequestId();
    const startTime = Date.now();
    
    try {
      const userId = req.user?.userId;
      const { status, priority } = req.query;
      
      logger.info(`[${requestId}] GET /applications - User: ${userId}, Filters: status=${status}, priority=${priority}`);
      
      if (!userId) {
        logger.warn(`[${requestId}] No userId in request - authentication may have failed`);
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          errorCode: 'AUTH_REQUIRED'
        });
      }
      
      logger.debug(`[${requestId}] Calling Application.findByUser(${userId})`);
      const applications = Application.findByUser(userId, { status, priority });
      
      const duration = Date.now() - startTime;
      logger.info(`[${requestId}] Found ${applications?.length || 0} applications in ${duration}ms`);
      
      res.json(addDebugInfo({
        success: true,
        count: applications.length,
        data: applications
      }, { requestId, duration: `${duration}ms` }));
    } catch (error) {
      logger.error(`[${requestId}] Error in getApplications:`, error);
      next(error);
    }
  }
  
  // Create new application
  static async createApplication(req, res, next) {
    const requestId = generateRequestId();
    const startTime = Date.now();
    
    try {
      const userId = req.user?.userId;
      const data = req.validatedData || req.body;
      
      logger.info(`[${requestId}] POST /applications - User: ${userId}`);
      logger.debug(`[${requestId}] Request body keys: ${Object.keys(data || {}).join(', ')}`);
      
      if (!userId) {
        logger.warn(`[${requestId}] No userId - returning 401`);
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          errorCode: 'AUTH_REQUIRED'
        });
      }
      
      // Normalize collegeId field
      if (data.college_id && !data.collegeId) {
        data.collegeId = data.college_id;
        logger.debug(`[${requestId}] Normalized college_id to collegeId: ${data.collegeId}`);
      }
      
      if (!data.collegeId) {
        logger.warn(`[${requestId}] No collegeId provided in request`);
        return res.status(400).json({
          success: false,
          message: 'collegeId is required',
          errorCode: 'MISSING_COLLEGE_ID'
        });
      }
      
      logger.debug(`[${requestId}] Creating application for college: ${data.collegeId}`);
      const application = Application.create(userId, data);
      
      if (!application) {
        logger.error(`[${requestId}] Application.create returned null/undefined`);
        throw new Error('Failed to create application - no result returned');
      }
      
      logger.info(`[${requestId}] Application created with ID: ${application.id}`);
      
      // Generate deadlines automatically when application is created
      if (application && application.college_id) {
        try {
          logger.debug(`[${requestId}] Generating deadlines for college ${application.college_id}`);
          const { generateDeadlinesForCollege } = require('../../services/deadlineGenerator');
          const College = require('../models/College');
          const college = await College.findById(application.college_id);
          
          if (college) {
            await generateDeadlinesForCollege(college, userId, application.id);
            logger.info(`[${requestId}] Deadlines generated for application ${application.id}`);
          } else {
            logger.warn(`[${requestId}] College ${application.college_id} not found for deadline generation`);
          }
        } catch (deadlineError) {
          // Log but don't fail the application creation
          logger.error(`[${requestId}] Failed to generate deadlines:`, deadlineError);
        }
      }
      
      const duration = Date.now() - startTime;
      logger.info(`[${requestId}] Application creation completed in ${duration}ms`);
      
      res.status(201).json(addDebugInfo({
        success: true,
        message: 'Application created successfully. Deadlines generated automatically.',
        data: application
      }, { requestId, duration: `${duration}ms` }));
    } catch (error) {
      logger.error(`[${requestId}] Error in createApplication:`, error);
      
      // Handle duplicate application error specially
      if (error.code === 'DUPLICATE_APPLICATION') {
        return res.status(400).json(addDebugInfo({
          success: false,
          message: error.message,
          code: 'DUPLICATE_APPLICATION'
        }, { requestId }));
      }
      next(error);
    }
  }
  
  // Update application
  static async updateApplication(req, res, next) {
    const requestId = generateRequestId();
    
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      const data = req.validatedData || req.body;
      
      logger.info(`[${requestId}] PUT /applications/${id}`);
      logger.debug(`[${requestId}] Update data keys: ${Object.keys(data || {}).join(', ')}`);
      
      // Get old application to check ownership and status change
      const oldApplication = Application.findById(parseInt(id));
      
      if (!oldApplication) {
        logger.warn(`[${requestId}] Application ${id} not found`);
        return res.status(404).json({
          success: false,
          message: 'Application not found',
          errorCode: 'APPLICATION_NOT_FOUND'
        });
      }
      
      // SECURITY: Verify user owns this application
      if (oldApplication.user_id !== userId) {
        logger.warn(`[${requestId}] User ${userId} attempted to access application ${id} owned by user ${oldApplication.user_id}`);
        return res.status(403).json({
          success: false,
          message: 'Access denied',
          errorCode: 'ACCESS_DENIED'
        });
      }
      
      const application = Application.update(parseInt(id), data);
      
      logger.info(`[${requestId}] Application ${id} updated successfully`);
      
      // Auto-collect ML training data when decision status changes
      if (oldApplication && data.status && 
          ['accepted', 'rejected', 'waitlisted'].includes(data.status) &&
          oldApplication.status !== data.status) {
        try {
          const dbManager = require('../config/database');
          const db = dbManager.getDatabase();
          
          // Check if user has ML consent
          const user = db.prepare('SELECT ml_consent FROM users WHERE id = ?').get(userId);
          
          if (user && user.ml_consent === 1) {
            // Get student profile data
            const StudentProfile = require('../models/StudentProfile');
            const College = require('../models/College');
            
            const profile = StudentProfile.getCompleteProfile(userId);
            const college = College.findById(application.college_id);
            
            if (profile && college) {
              const activities = profile.activities || [];
              const tier1Count = activities.filter(a => a.tier_rating === 1).length;
              const tier2Count = activities.filter(a => a.tier_rating === 2).length;
              const apCourses = (profile.coursework || []).filter(c => c.course_level === 'AP' || c.course_level === 'IB').length;
              
              db.prepare(`
                INSERT INTO ml_training_data (
                  student_id, college_id, gpa, sat_total, act_composite,
                  class_rank_percentile, num_ap_courses, activity_tier_1_count,
                  activity_tier_2_count, is_first_gen, is_legacy, state,
                  college_acceptance_rate, college_sat_median, college_type,
                  decision, enrolled, application_year
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                userId,
                application.college_id,
                profile.gpa_unweighted || profile.gpa_weighted || null,
                profile.sat_total || null,
                profile.act_composite || null,
                profile.class_rank_percentile || null,
                apCourses,
                tier1Count,
                tier2Count,
                profile.is_first_generation ? 1 : 0,
                profile.is_legacy ? 1 : 0,
                profile.state_province || null,
                college.acceptance_rate || null,
                college.sat_total_median || null,
                college.type || null,
                data.status,
                0, // enrolled - will be updated later
                new Date().getFullYear()
              );
              
              logger.info(`[${requestId}] ML training data auto-collected for application ${id}`);
            }
          }
        } catch (mlError) {
          // Don't fail the update if ML collection fails
          logger.error(`[${requestId}] ML auto-collection failed:`, mlError);
        }
      }
      
      res.json(addDebugInfo({
        success: true,
        message: 'Application updated successfully',
        data: application
      }, { requestId }));
    } catch (error) {
      logger.error(`[${requestId}] Error in updateApplication:`, error);
      next(error);
    }
  }
  
  // Delete application
  static async deleteApplication(req, res, next) {
    const requestId = generateRequestId();
    
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      
      logger.info(`[${requestId}] DELETE /applications/${id}`);
      
      // SECURITY: Verify user owns this application
      const application = Application.findById(parseInt(id));
      
      if (!application) {
        logger.warn(`[${requestId}] Application ${id} not found`);
        return res.status(404).json({
          success: false,
          message: 'Application not found',
          errorCode: 'APPLICATION_NOT_FOUND'
        });
      }
      
      if (application.user_id !== userId) {
        logger.warn(`[${requestId}] User ${userId} attempted to delete application ${id} owned by user ${application.user_id}`);
        return res.status(403).json({
          success: false,
          message: 'Access denied',
          errorCode: 'ACCESS_DENIED'
        });
      }
      
      Application.delete(parseInt(id));
      
      logger.info(`[${requestId}] Application ${id} deleted successfully`);
      
      res.json(addDebugInfo({
        success: true,
        message: 'Application deleted successfully'
      }, { requestId }));
    } catch (error) {
      logger.error(`[${requestId}] Error in deleteApplication:`, error);
      next(error);
    }
  }
  
  // Get application timeline
  static async getTimeline(req, res, next) {
    const requestId = generateRequestId();
    
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      
      logger.info(`[${requestId}] GET /applications/${id}/timeline`);
      
      // SECURITY: Verify user owns this application
      const application = Application.findById(parseInt(id));
      
      if (!application) {
        logger.warn(`[${requestId}] Application ${id} not found`);
        return res.status(404).json({
          success: false,
          message: 'Application not found',
          errorCode: 'APPLICATION_NOT_FOUND'
        });
      }
      
      if (application.user_id !== userId) {
        logger.warn(`[${requestId}] User ${userId} attempted to access timeline for application ${id} owned by user ${application.user_id}`);
        return res.status(403).json({
          success: false,
          message: 'Access denied',
          errorCode: 'ACCESS_DENIED'
        });
      }
      
      const timeline = Application.getTimeline(parseInt(id));
      
      logger.debug(`[${requestId}] Timeline entries: ${timeline?.length || 0}`);
      
      res.json(addDebugInfo({
        success: true,
        data: timeline
      }, { requestId }));
    } catch (error) {
      logger.error(`[${requestId}] Error in getTimeline:`, error);
      next(error);
    }
  }
}

module.exports = ApplicationController;