const Essay = require('../models/Essay');
const Application = require('../models/Application');
const logger = require('../utils/logger');

class EssayController {
  // Get all essays for user
  static async getEssays(req, res, next) {
    try {
      const userId = req.user.userId;
      
      const essays = Essay.findByUser(userId);
      
      res.json({
        success: true,
        count: essays.length,
        data: essays
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Helper to verify essay ownership through application
  static async verifyOwnership(essayId, userId) {
    const essay = Essay.findById(essayId);
    if (!essay) return { exists: false };
    
    const application = Application.findById(essay.application_id);
    if (!application || application.user_id !== userId) {
      return { exists: true, authorized: false };
    }
    
    return { exists: true, authorized: true, essay };
  }
  
  // Create essay
  static async createEssay(req, res, next) {
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
        logger.warn(`User ${userId} attempted to create essay for application ${data.applicationId} owned by user ${application.user_id}`);
        return res.status(403).json({
          success: false,
          message: 'Access denied',
          errorCode: 'ACCESS_DENIED'
        });
      }
      
      const essay = Essay.create(data);
      
      res.status(201).json({
        success: true,
        message: 'Essay created successfully',
        data: essay
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Update essay
  static async updateEssay(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const data = req.validatedData;
      
      // SECURITY: Verify ownership
      const check = await EssayController.verifyOwnership(parseInt(id), userId);
      
      if (!check.exists) {
        return res.status(404).json({
          success: false,
          message: 'Essay not found',
          errorCode: 'ESSAY_NOT_FOUND'
        });
      }
      
      if (!check.authorized) {
        logger.warn(`User ${userId} attempted to update essay ${id} they don't own`);
        return res.status(403).json({
          success: false,
          message: 'Access denied',
          errorCode: 'ACCESS_DENIED'
        });
      }
      
      const essay = Essay.update(parseInt(id), data);
      
      res.json({
        success: true,
        message: 'Essay updated successfully',
        data: essay
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Delete essay
  static async deleteEssay(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      
      // SECURITY: Verify ownership
      const check = await EssayController.verifyOwnership(parseInt(id), userId);
      
      if (!check.exists) {
        return res.status(404).json({
          success: false,
          message: 'Essay not found',
          errorCode: 'ESSAY_NOT_FOUND'
        });
      }
      
      if (!check.authorized) {
        logger.warn(`User ${userId} attempted to delete essay ${id} they don't own`);
        return res.status(403).json({
          success: false,
          message: 'Access denied',
          errorCode: 'ACCESS_DENIED'
        });
      }
      
      Essay.delete(parseInt(id));
      
      res.json({
        success: true,
        message: 'Essay deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = EssayController;