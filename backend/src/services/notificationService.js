/**
 * Notification Service
 * Handles creation, retrieval, and management of user notifications
 * Supports in-app notifications and email alerts for deadline/essay changes
 */

const db = require('../config/database');
const logger = require('../utils/logger');

class NotificationService {
  /**
   * Create a notification for a user
   * @param {number} userId - User ID
   * @param {string} type - Notification type (deadline_change, essay_change, decision_approaching, etc.)
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {object} metadata - Additional data (collegeId, deadlineId, etc.)
   * @returns {object} Created notification
   */
  static createNotification(userId, type, title, message, metadata = {}) {
    try {
      const stmt = db.prepare(`
        INSERT INTO notifications (user_id, type, title, message, metadata, created_at, read)
        VALUES (?, ?, ?, ?, ?, datetime('now'), 0)
      `);
      
      const result = stmt.run(
        userId,
        type,
        title,
        message,
        JSON.stringify(metadata)
      );
      
      logger.info(`Notification created for user ${userId}: ${type}`);
      
      return {
        id: result.lastInsertRowid,
        userId,
        type,
        title,
        message,
        metadata,
        read: false
      };
    } catch (error) {
      logger.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Get all notifications for a user
   * @param {number} userId - User ID
   * @param {boolean} unreadOnly - Only return unread notifications
   * @returns {Array} Array of notifications
   */
  static getUserNotifications(userId, unreadOnly = false) {
    try {
      let query = `
        SELECT id, user_id, type, title, message, metadata, created_at, read
        FROM notifications
        WHERE user_id = ?
      `;
      
      if (unreadOnly) {
        query += ' AND read = 0';
      }
      
      query += ' ORDER BY created_at DESC LIMIT 50';
      
      const stmt = db.prepare(query);
      const notifications = stmt.all(userId);
      
      // Parse metadata JSON
      return notifications.map(n => ({
        ...n,
        metadata: n.metadata ? JSON.parse(n.metadata) : {},
        read: Boolean(n.read)
      }));
    } catch (error) {
      logger.error('Error fetching notifications:', error);
      return [];
    }
  }

  /**
   * Mark notification as read
   * @param {number} notificationId - Notification ID
   * @param {number} userId - User ID (for security)
   */
  static markAsRead(notificationId, userId) {
    try {
      const stmt = db.prepare(`
        UPDATE notifications
        SET read = 1
        WHERE id = ? AND user_id = ?
      `);
      
      stmt.run(notificationId, userId);
      logger.info(`Notification ${notificationId} marked as read`);
    } catch (error) {
      logger.error('Error marking notification as read:', error);
    }
  }

  /**
   * Mark all notifications as read for a user
   * @param {number} userId - User ID
   */
  static markAllAsRead(userId) {
    try {
      const stmt = db.prepare(`
        UPDATE notifications
        SET read = 1
        WHERE user_id = ? AND read = 0
      `);
      
      const result = stmt.run(userId);
      logger.info(`Marked ${result.changes} notifications as read for user ${userId}`);
      return result.changes;
    } catch (error) {
      logger.error('Error marking all notifications as read:', error);
      return 0;
    }
  }

  /**
   * Get unread notification count
   * @param {number} userId - User ID
   * @returns {number} Count of unread notifications
   */
  static getUnreadCount(userId) {
    try {
      const stmt = db.prepare(`
        SELECT COUNT(*) as count
        FROM notifications
        WHERE user_id = ? AND read = 0
      `);
      
      const result = stmt.get(userId);
      return result.count || 0;
    } catch (error) {
      logger.error('Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * Notify user about deadline change
   * @param {number} userId - User ID
   * @param {string} collegeName - College name
   * @param {string} deadlineType - Deadline type (ED1, EA, RD, etc.)
   * @param {string} oldDate - Previous deadline date
   * @param {string} newDate - New deadline date
   */
  static notifyDeadlineChange(userId, collegeName, deadlineType, oldDate, newDate, collegeId = null) {
    const title = 'Deadline Updated';
    const message = `${collegeName} has changed their ${deadlineType} deadline from ${oldDate} to ${newDate}`;
    
    const metadata = {
      collegeId,
      collegeName,
      deadlineType,
      oldDate,
      newDate,
      changeDays: this._calculateDaysDifference(oldDate, newDate)
    };
    
    return this.createNotification(userId, 'deadline_change', title, message, metadata);
  }

  /**
   * Notify user about essay prompt change
   * @param {number} userId - User ID
   * @param {string} collegeName - College name
   * @param {string} essayTitle - Essay title/prompt preview
   */
  static notifyEssayChange(userId, collegeName, essayTitle, collegeId = null) {
    const title = 'Essay Prompt Changed';
    const message = `${collegeName} has updated an essay prompt. Please review: "${essayTitle}"`;
    
    const metadata = {
      collegeId,
      collegeName,
      essayTitle
    };
    
    return this.createNotification(userId, 'essay_change', title, message, metadata);
  }

  /**
   * Notify user about approaching decision date
   * @param {number} userId - User ID
   * @param {string} collegeName - College name
   * @param {string} decisionDate - Decision release date
   * @param {number} daysUntil - Days until decision
   */
  static notifyDecisionApproaching(userId, collegeName, decisionDate, daysUntil, collegeId = null) {
    const title = daysUntil === 0 ? 'Decision Day!' : 'Decision Approaching';
    const message = daysUntil === 0
      ? `Decision day for ${collegeName}! Check your portal.`
      : `You'll hear from ${collegeName} in ${daysUntil} days (${decisionDate})`;
    
    const metadata = {
      collegeId,
      collegeName,
      decisionDate,
      daysUntil
    };
    
    return this.createNotification(userId, 'decision_approaching', title, message, metadata);
  }

  /**
   * Notify user about deadline approaching
   * @param {number} userId - User ID
   * @param {string} collegeName - College name
   * @param {string} deadlineType - Deadline type
   * @param {string} deadlineDate - Deadline date
   * @param {number} daysUntil - Days until deadline
   */
  static notifyDeadlineApproaching(userId, collegeName, deadlineType, deadlineDate, daysUntil, collegeId = null) {
    const title = daysUntil <= 1 ? 'Deadline Tomorrow!' : 'Deadline Approaching';
    const message = daysUntil === 0
      ? `${collegeName} ${deadlineType} deadline is TODAY!`
      : `${collegeName} ${deadlineType} deadline in ${daysUntil} days (${deadlineDate})`;
    
    const metadata = {
      collegeId,
      collegeName,
      deadlineType,
      deadlineDate,
      daysUntil
    };
    
    return this.createNotification(userId, 'deadline_approaching', title, message, metadata);
  }

  /**
   * Calculate days difference between two dates
   * @private
   */
  static _calculateDaysDifference(date1, date2) {
    try {
      const d1 = new Date(date1);
      const d2 = new Date(date2);
      const diffTime = d2 - d1;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Delete old notifications (older than 90 days)
   * Should be run as a scheduled task
   */
  static cleanupOldNotifications() {
    try {
      const stmt = db.prepare(`
        DELETE FROM notifications
        WHERE created_at < datetime('now', '-90 days')
      `);
      
      const result = stmt.run();
      logger.info(`Cleaned up ${result.changes} old notifications`);
      return result.changes;
    } catch (error) {
      logger.error('Error cleaning up notifications:', error);
      return 0;
    }
  }

  /**
   * Check for approaching deadlines and send notifications
   * Should be run daily as a scheduled task
   */
  static async checkApproachingDeadlines() {
    try {
      // Get all user deadlines that are 1, 3, or 7 days away
      const stmt = db.prepare(`
        SELECT 
          d.id,
          d.user_id,
          d.deadline_date,
          d.deadline_type,
          c.name as college_name,
          c.id as college_id,
          julianday(d.deadline_date) - julianday('now') as days_until
        FROM deadlines d
        JOIN applications a ON d.application_id = a.id
        JOIN colleges c ON a.college_id = c.id
        WHERE d.status != 'submitted'
          AND d.deadline_date >= date('now')
          AND julianday(d.deadline_date) - julianday('now') <= 7
      `);
      
      const upcomingDeadlines = stmt.all();
      let notificationsCreated = 0;
      
      for (const deadline of upcomingDeadlines) {
        const daysUntil = Math.ceil(deadline.days_until);
        
        // Only notify at specific intervals: 7, 3, 1, 0 days
        if ([7, 3, 1, 0].includes(daysUntil)) {
          this.notifyDeadlineApproaching(
            deadline.user_id,
            deadline.college_name,
            deadline.deadline_type,
            deadline.deadline_date,
            daysUntil,
            deadline.college_id
          );
          notificationsCreated++;
        }
      }
      
      logger.info(`Created ${notificationsCreated} deadline approaching notifications`);
      return notificationsCreated;
    } catch (error) {
      logger.error('Error checking approaching deadlines:', error);
      return 0;
    }
  }

  /**
   * Check for approaching decision dates and send notifications
   * Should be run daily as a scheduled task
   */
  static async checkApproachingDecisions() {
    try {
      // Get decision dates from application_deadlines
      const stmt = db.prepare(`
        SELECT 
          a.user_id,
          c.name as college_name,
          c.id as college_id,
          ad.notification_date,
          julianday(ad.notification_date) - julianday('now') as days_until
        FROM applications a
        JOIN colleges c ON a.college_id = c.id
        JOIN application_deadlines ad ON c.id = ad.college_id
        WHERE a.status = 'submitted'
          AND ad.notification_date IS NOT NULL
          AND ad.notification_date >= date('now')
          AND julianday(ad.notification_date) - julianday('now') <= 7
      `);
      
      const upcomingDecisions = stmt.all();
      let notificationsCreated = 0;
      
      for (const decision of upcomingDecisions) {
        const daysUntil = Math.ceil(decision.days_until);
        
        // Only notify at specific intervals: 7, 3, 1, 0 days
        if ([7, 3, 1, 0].includes(daysUntil)) {
          this.notifyDecisionApproaching(
            decision.user_id,
            decision.college_name,
            decision.notification_date,
            daysUntil,
            decision.college_id
          );
          notificationsCreated++;
        }
      }
      
      logger.info(`Created ${notificationsCreated} decision approaching notifications`);
      return notificationsCreated;
    } catch (error) {
      logger.error('Error checking approaching decisions:', error);
      return 0;
    }
  }
}

module.exports = NotificationService;
