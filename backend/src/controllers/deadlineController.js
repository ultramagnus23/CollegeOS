const Deadline = require('../models/Deadline');
const Application = require('../models/Application');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/security');

class DeadlineController {
  // Get all deadlines for user
  static async getDeadlines(req, res, next) {
    try {
      const userId = req.user.userId;
      const { daysAhead } = req.query;

      const deadlines = await Deadline.findUpcoming(userId, daysAhead ? parseInt(daysAhead) : 30);

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
    const deadline = await Deadline.findById(deadlineId);
    if (!deadline) return { exists: false };

    const application = await Application.findById(deadline.application_id);
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
      const application = await Application.findById(data.applicationId);
      if (!application) {
        return res.status(404).json({
          success: false,
          message: 'Application not found',
          errorCode: 'APPLICATION_NOT_FOUND'
        });
      }

      if (application.user_id !== userId) {
        logger.warn(`User ${sanitizeForLog(String(userId))} attempted to create deadline for application ${sanitizeForLog(String(data.applicationId))} owned by another user`);
        return res.status(403).json({
          success: false,
          message: 'Access denied',
          errorCode: 'ACCESS_DENIED'
        });
      }

      const deadline = await Deadline.create(data);

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
        logger.warn(`User ${sanitizeForLog(String(userId))} attempted to update deadline ${sanitizeForLog(String(id))} they don't own`);
        return res.status(403).json({
          success: false,
          message: 'Access denied',
          errorCode: 'ACCESS_DENIED'
        });
      }

      const deadline = await Deadline.update(parseInt(id), data);

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
        logger.warn(`User ${sanitizeForLog(String(userId))} attempted to delete deadline ${sanitizeForLog(String(id))} they don't own`);
        return res.status(403).json({
          success: false,
          message: 'Access denied',
          errorCode: 'ACCESS_DENIED'
        });
      }

      await Deadline.delete(parseInt(id));

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