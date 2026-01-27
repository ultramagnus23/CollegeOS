const Application = require('../models/Application');
const College = require('../models/College');
const deadlineFetchService = require('../../services/deadlineFetchService');
const logger = require('../utils/logger');

class ApplicationController {
  // Get all user applications
  static async getApplications(req, res, next) {
    try {
      const userId = req.user.userId;
      const { status, priority } = req.query;
      
      const applications = Application.findByUser(userId, { status, priority });
      
      res.json({
        success: true,
        count: applications.length,
        data: applications
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Create new application
  static async createApplication(req, res, next) {
    try {
      const userId = req.user.userId;
      const data = req.validatedData;
      
      // Normalize collegeId field
      if (data.college_id && !data.collegeId) {
        data.collegeId = data.college_id;
      }
      
      const application = Application.create(userId, data);
      
      // Automatically create deadlines when application is created
      let deadlineInfo = null;
      if (application && application.college_id) {
        try {
          deadlineInfo = await deadlineFetchService.createDeadlinesForApplication(
            application.id,
            application.college_id,
            [] // Empty array = create all available deadline types
          );
          logger.info(`Created ${deadlineInfo.createdDeadlines.length} deadlines for application ${application.id}`);
        } catch (deadlineError) {
          // Log but don't fail the application creation
          logger.error('Failed to generate deadlines:', deadlineError);
        }
      }
      
      res.status(201).json({
        success: true,
        message: deadlineInfo?.createdDeadlines?.length > 0 
          ? `Application created with ${deadlineInfo.createdDeadlines.length} deadline(s) added automatically.`
          : 'Application created successfully.',
        data: application,
        deadlines: deadlineInfo
      });
    } catch (error) {
      // Handle duplicate application error specially
      if (error.code === 'DUPLICATE_APPLICATION') {
        return res.status(400).json({
          success: false,
          message: error.message,
          code: 'DUPLICATE_APPLICATION'
        });
      }
      next(error);
    }
  }
  
  // Update application
  static async updateApplication(req, res, next) {
    try {
      const { id } = req.params;
      const data = req.validatedData;
      
      const application = Application.update(parseInt(id), data);
      
      res.json({
        success: true,
        message: 'Application updated successfully',
        data: application
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Delete application
  static async deleteApplication(req, res, next) {
    try {
      const { id } = req.params;
      
      Application.delete(parseInt(id));
      
      res.json({
        success: true,
        message: 'Application deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Get application timeline
  static async getTimeline(req, res, next) {
    try {
      const { id } = req.params;
      
      const timeline = Application.getTimeline(parseInt(id));
      
      res.json({
        success: true,
        data: timeline
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ApplicationController;