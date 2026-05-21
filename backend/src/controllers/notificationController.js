/**
 * Notification Controller
 * Handles HTTP requests for user notifications
 */

const NotificationService = require('../services/notificationService');
const logger = require('../utils/logger');

class NotificationController {
  static resolveUserId(req) {
    return req?.user?.userId ?? req?.user?.id ?? null;
  }

  /**
   * Get all notifications for the authenticated user
   * GET /api/notifications
   */
  static async getNotifications(req, res) {
    try {
      const userId = this.resolveUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const unreadOnly = req.query.unreadOnly === 'true';
      
      const notifications = await NotificationService.getUserNotifications(userId, unreadOnly);
      
      res.json({
        success: true,
        data: notifications,
        count: notifications.length
      });
    } catch (error) {
      logger.error('Error in getNotifications:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch notifications'
      });
    }
  }

  /**
   * Get unread notification count
   * GET /api/notifications/unread-count
   */
  static async getUnreadCount(req, res) {
    try {
      const userId = this.resolveUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const count = await NotificationService.getUnreadCount(userId);
      
      res.json({
        success: true,
        data: { count },
        count,
      });
    } catch (error) {
      logger.error('Error in getUnreadCount:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch unread count'
      });
    }
  }

  /**
   * Mark a notification as read
   * PUT /api/notifications/:id/read
   */
  static async markAsRead(req, res) {
    try {
      const userId = this.resolveUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const notificationId = parseInt(req.params.id);
      
      if (isNaN(notificationId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid notification ID'
        });
      }
      
      await NotificationService.markAsRead(notificationId, userId);
      
      res.json({
        success: true,
        message: 'Notification marked as read'
      });
    } catch (error) {
      logger.error('Error in markAsRead:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark notification as read'
      });
    }
  }

  /**
   * Mark all notifications as read
   * PUT /api/notifications/read-all
   */
  static async markAllAsRead(req, res) {
    try {
      const userId = this.resolveUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const count = await NotificationService.markAllAsRead(userId);
      
      res.json({
        success: true,
        message: 'Notifications marked as read',
        count
      });
    } catch (error) {
      logger.error('Error in markAllAsRead:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark all notifications as read'
      });
    }
  }

  /**
   * Create a test notification (for development/testing)
   * POST /api/notifications/test
   */
  static async createTestNotification(req, res) {
    try {
      const userId = this.resolveUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const { type = 'test', title = 'Test Notification', message = 'This is a test notification' } = req.body;
      
      const notification = await NotificationService.createNotification(
        userId,
        type,
        title,
        message,
        { test: true }
      );
      
      res.json({
        success: true,
        data: notification,
        notification,
      });
    } catch (error) {
      logger.error('Error in createTestNotification:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create test notification'
      });
    }
  }
}

module.exports = NotificationController;
