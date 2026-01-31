const Deadline = require('../models/Deadline');
const Application = require('../models/Application');
const logger = require('../utils/logger');

class DeadlineController {
  // Get all deadlines for user
  static async getDeadlines(req, res, next) {
    try {
      const userId = req.user.userId;
      const { daysAhead } = req.query;
      
      const deadlines = Deadline.findUpcoming(userId, daysAhead ? parseInt(daysAhead) : 30);
      
      res.json({
        success: true,
        count: deadlines.length,
        data: deadlines
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Helper to verify deadline ownership through application
  static async verifyOwnership(deadlineId, userId) {
    const deadline = Deadline.findById(deadlineId);
    if (!deadline) return { exists: false };
    
    const application = Application.findById(deadline.application_id);
    if (!application || application.user_id !== userId) {
      return { exists: true, authorized: false };
    }
    
    return { exists: true, authorized: true, deadline };
  }
  
  // Create deadline
  static async createDeadline(req, res, next) {
    try {
      const userId = req.user.userId;
      const data = req.validatedData;
      
      // SECURITY: Verify user owns the application
      const application = Application.findById(data.applicationId);
      if (!application) {
        return res.status(404).json({
          success: false,
          message: 'Application not found',
          errorCode: 'APPLICATION_NOT_FOUND'
        });
      }
      
      if (application.user_id !== userId) {
        logger.warn(`User ${userId} attempted to create deadline for application ${data.applicationId} owned by user ${application.user_id}`);
        return res.status(403).json({
          success: false,
          message: 'Access denied',
          errorCode: 'ACCESS_DENIED'
        });
      }
      
      const deadline = Deadline.create(data);
      
      res.status(201).json({
        success: true,
        message: 'Deadline created successfully',
        data: deadline
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Update deadline
  static async updateDeadline(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const data = req.body;
      
      // SECURITY: Verify ownership
      const check = await DeadlineController.verifyOwnership(parseInt(id), userId);
      
      if (!check.exists) {
        return res.status(404).json({
          success: false,
          message: 'Deadline not found',
          errorCode: 'DEADLINE_NOT_FOUND'
        });
      }
      
      if (!check.authorized) {
        logger.warn(`User ${userId} attempted to update deadline ${id} they don't own`);
        return res.status(403).json({
          success: false,
          message: 'Access denied',
          errorCode: 'ACCESS_DENIED'
        });
      }
      
      const deadline = Deadline.update(parseInt(id), data);
      
      res.json({
        success: true,
        message: 'Deadline updated successfully',
        data: deadline
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Delete deadline
  static async deleteDeadline(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      
      // SECURITY: Verify ownership
      const check = await DeadlineController.verifyOwnership(parseInt(id), userId);
      
      if (!check.exists) {
        return res.status(404).json({
          success: false,
          message: 'Deadline not found',
          errorCode: 'DEADLINE_NOT_FOUND'
        });
      }
      
      if (!check.authorized) {
        logger.warn(`User ${userId} attempted to delete deadline ${id} they don't own`);
        return res.status(403).json({
          success: false,
          message: 'Access denied',
          errorCode: 'ACCESS_DENIED'
        });
      }
      
      Deadline.delete(parseInt(id));
      
      res.json({
        success: true,
        message: 'Deadline deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = DeadlineController;