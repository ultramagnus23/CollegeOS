const Application = require('../models/Application');

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
      
      // Generate deadlines automatically when application is created
      if (application && application.college_id) {
        try {
          const { generateDeadlinesForCollege } = require('../../services/deadlineGenerator');
          const College = require('../models/College');
          const college = await College.findById(application.college_id);
          
          if (college) {
            await generateDeadlinesForCollege(college, userId, application.id);
          }
        } catch (deadlineError) {
          // Log but don't fail the application creation
          console.error('Failed to generate deadlines:', deadlineError);
        }
      }
      
      res.status(201).json({
        success: true,
        message: 'Application created successfully. Deadlines generated automatically.',
        data: application
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