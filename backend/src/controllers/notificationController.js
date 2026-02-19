/**
 * Notification Controller
 * Handles HTTP requests for user notifications
 */

const NotificationService = require('../services/notificationService');
const logger = require('../utils/logger');

class NotificationController {
  /**
   * Get all notifications for the authenticated user
   * GET /api/notifications
   */
  static getNotifications(req, res) {
    try {
      const userId = req.user.id;
      const unreadOnly = req.query.unreadOnly === 'true';
      
      const notifications = NotificationService.getUserNotifications(userId, unreadOnly);
      
      res.json({
        success: true,
        notifications,
        count: notifications.length
      });
    } catch (error) {
      logger.error('Error in getNotifications:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch notifications'
      });
    }
  }

  /**
   * Get unread notification count
   * GET /api/notifications/unread-count
   */
  static getUnreadCount(req, res) {
    try {
      const userId = req.user.id;
      const count = NotificationService.getUnreadCount(userId);
      
      res.json({
        success: true,
        count
      });
    } catch (error) {
      logger.error('Error in getUnreadCount:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch unread count'
      });
    }
  }

  /**
   * Mark a notification as read
   * PUT /api/notifications/:id/read
   */
  static markAsRead(req, res) {
    try {
      const userId = req.user.id;
      const notificationId = parseInt(req.params.id);
      
      if (isNaN(notificationId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid notification ID'
        });
      }
      
      NotificationService.markAsRead(notificationId, userId);
      
      res.json({
        success: true,
        message: 'Notification marked as read'
      });
    } catch (error) {
      logger.error('Error in markAsRead:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to mark notification as read'
      });
    }
  }

  /**
   * Mark all notifications as read
   * PUT /api/notifications/read-all
   */
  static markAllAsRead(req, res) {
    try {
      const userId = req.user.id;
      const count = NotificationService.markAllAsRead(userId);
      
      res.json({
        success: true,
        message: `Marked ${count} notifications as read`,
        count
      });
    } catch (error) {
      logger.error('Error in markAllAsRead:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to mark all notifications as read'
      });
    }
  }

  /**
   * Create a test notification (for development/testing)
   * POST /api/notifications/test
   */
  static createTestNotification(req, res) {
    try {
      const userId = req.user.id;
      const { type = 'test', title = 'Test Notification', message = 'This is a test notification' } = req.body;
      
      const notification = NotificationService.createNotification(
        userId,
        type,
        title,
        message,
        { test: true }
      );
      
      res.json({
        success: true,
        notification
      });
    } catch (error) {
      logger.error('Error in createTestNotification:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create test notification'
      });
    }
  }
}

module.exports = NotificationController;
