/**
 * Notification Service
 * Handles creation, retrieval, and management of user notifications
 */

const dbManager = require('../config/database');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/security');

class NotificationService {
  static async createNotification(userId, type, title, message, metadata = {}) {
    try {
      const pool = dbManager.getDatabase();
      // Table uses is_read (not read); metadata added by migration 092
      const { rows } = await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, metadata, created_at, is_read)
         VALUES ($1,$2,$3,$4,$5,NOW(),false) RETURNING id`,
        [userId, type, title, message, metadata]
      );
      logger.info('Notification created', { userId, type: sanitizeForLog(type) });
      return { id: rows[0].id, userId, type, title, message, metadata, read: false };
    } catch (error) {
      logger.error('Error creating notification:', error);
      throw error;
    }
  }

  static async getUserNotifications(userId, unreadOnly = false) {
    try {
      const pool = dbManager.getDatabase();
      let query = `SELECT id, user_id, type, title, message, metadata, created_at, is_read AS read
                   FROM notifications WHERE user_id = $1`;
      if (unreadOnly) query += ' AND is_read IS FALSE';
      query += ' ORDER BY created_at DESC LIMIT 50';
      const { rows } = await pool.query(query, [userId]);
      return rows.map(n => ({
        ...n,
        metadata: n.metadata ? (typeof n.metadata === 'string' ? JSON.parse(n.metadata) : n.metadata) : {},
        read: Boolean(n.read),
      }));
    } catch (error) {
      logger.error('Error fetching notifications:', error);
      return [];
    }
  }

  static async markAsRead(notificationId, userId) {
    try {
      const pool = dbManager.getDatabase();
      await pool.query(
        `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
        [notificationId, userId]
      );
      logger.info('Notification marked as read', { notificationId });
    } catch (error) {
      logger.error('Error marking notification as read:', error);
    }
  }

  static async markAllAsRead(userId) {
    try {
      const pool = dbManager.getDatabase();
      const { rowCount } = await pool.query(
        `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read IS FALSE`,
        [userId]
      );
      logger.info('Marked notifications as read', { userId, count: rowCount });
      return rowCount;
    } catch (error) {
      logger.error('Error marking all notifications as read:', error);
      return 0;
    }
  }

  static async getUnreadCount(userId) {
    try {
      const pool = dbManager.getDatabase();
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND is_read IS FALSE`,
        [userId]
      );
      return parseInt(rows[0].count) || 0;
    } catch (error) {
      logger.error('Error getting unread count:', error);
      return 0;
    }
  }

  static async notifyDeadlineChange(userId, collegeName, deadlineType, oldDate, newDate, collegeId = null) {
    const title = 'Deadline Updated';
    const message = `${collegeName} has changed their ${deadlineType} deadline from ${oldDate} to ${newDate}`;
    const metadata = { collegeId, collegeName, deadlineType, oldDate, newDate, changeDays: this._calculateDaysDifference(oldDate, newDate) };
    return this.createNotification(userId, 'deadline_change', title, message, metadata);
  }

  static async notifyEssayChange(userId, collegeName, essayTitle, collegeId = null) {
    const title = 'Essay Prompt Changed';
    const message = `${collegeName} has updated an essay prompt. Please review: "${essayTitle}"`;
    return this.createNotification(userId, 'essay_change', title, message, { collegeId, collegeName, essayTitle });
  }

  static async notifyDecisionApproaching(userId, collegeName, decisionDate, daysUntil, collegeId = null) {
    const title = daysUntil === 0 ? 'Decision Day!' : 'Decision Approaching';
    const message = daysUntil === 0
      ? `Decision day for ${collegeName}! Check your portal.`
      : `You'll hear from ${collegeName} in ${daysUntil} days (${decisionDate})`;
    return this.createNotification(userId, 'decision_approaching', title, message, { collegeId, collegeName, decisionDate, daysUntil });
  }

  static async notifyDeadlineApproaching(userId, collegeName, deadlineType, deadlineDate, daysUntil, collegeId = null) {
    const title = daysUntil <= 1 ? 'Deadline Tomorrow!' : 'Deadline Approaching';
    const message = daysUntil === 0
      ? `${collegeName} ${deadlineType} deadline is TODAY!`
      : `${collegeName} ${deadlineType} deadline in ${daysUntil} days (${deadlineDate})`;
    return this.createNotification(userId, 'deadline_approaching', title, message, { collegeId, collegeName, deadlineType, deadlineDate, daysUntil });
  }

  static _calculateDaysDifference(date1, date2) {
    try {
      return Math.ceil((new Date(date2) - new Date(date1)) / (1000 * 60 * 60 * 24));
    } catch { return 0; }
  }

  static async cleanupOldNotifications() {
    try {
      const pool = dbManager.getDatabase();
      const { rowCount } = await pool.query(
        `DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '90 days'`
      );
      logger.info('Cleaned up old notifications', { count: rowCount });
      return rowCount;
    } catch (error) {
      logger.error('Error cleaning up notifications:', error);
      return 0;
    }
  }

  static async checkApproachingDeadlines() {
    try {
      const pool = dbManager.getDatabase();
      // user_id on deadlines is populated by migration 093; is_completed replaces status
      const { rows: upcomingDeadlines } = await pool.query(
        `SELECT d.user_id, d.deadline_date, d.deadline_type,
                c.name AS college_name, c.id AS college_id,
                EXTRACT(EPOCH FROM (d.deadline_date::timestamptz - NOW())) / 86400 AS days_until
         FROM deadlines d
         JOIN applications a ON d.application_id = a.id
         JOIN colleges_full c ON a.college_id = c.id
         WHERE (d.is_completed IS NULL OR d.is_completed = false)
           AND d.deadline_date >= CURRENT_DATE
           AND d.deadline_date <= CURRENT_DATE + INTERVAL '7 days'
           AND (d.user_id IS NOT NULL OR a.user_id IS NOT NULL)`
      );

      let notificationsCreated = 0;
      for (const deadline of upcomingDeadlines) {
        const userId = deadline.user_id;
        if (!userId) continue;
        const daysUntil = Math.ceil(parseFloat(deadline.days_until));
        if ([7, 3, 1, 0].includes(daysUntil)) {
          await this.notifyDeadlineApproaching(userId, deadline.college_name, deadline.deadline_type, deadline.deadline_date, daysUntil, deadline.college_id);
          notificationsCreated++;
        }
      }
      logger.info('Created deadline approaching notifications', { count: notificationsCreated });
      return notificationsCreated;
    } catch (error) {
      logger.error('Error checking approaching deadlines:', error);
      return 0;
    }
  }

  static async checkApproachingDecisions() {
    try {
      const pool = dbManager.getDatabase();
      // application_deadlines uses type-specific notification columns
      const { rows: upcomingDecisions } = await pool.query(
        `SELECT a.user_id, c.name AS college_name, c.id AS college_id,
                COALESCE(
                  ad.regular_decision_notification,
                  ad.early_decision_1_notification,
                  ad.early_action_notification
                ) AS notification_date,
                EXTRACT(EPOCH FROM (
                  COALESCE(
                    ad.regular_decision_notification,
                    ad.early_decision_1_notification,
                    ad.early_action_notification
                  )::timestamptz - NOW()
                )) / 86400 AS days_until
         FROM applications a
         JOIN colleges_full c ON a.college_id = c.id
         JOIN application_deadlines ad ON ad.college_id = a.college_id
         WHERE a.status = 'submitted'
           AND COALESCE(
             ad.regular_decision_notification,
             ad.early_decision_1_notification,
             ad.early_action_notification
           ) BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`
      );

      let notificationsCreated = 0;
      for (const decision of upcomingDecisions) {
        const daysUntil = Math.ceil(parseFloat(decision.days_until));
        if ([7, 3, 1, 0].includes(daysUntil)) {
          await this.notifyDecisionApproaching(decision.user_id, decision.college_name, decision.notification_date, daysUntil, decision.college_id);
          notificationsCreated++;
        }
      }
      logger.info('Created decision approaching notifications', { count: notificationsCreated });
      return notificationsCreated;
    } catch (error) {
      logger.error('Error checking approaching decisions:', error);
      return 0;
    }
  }
}

module.exports = NotificationService;
