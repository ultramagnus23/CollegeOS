/**
 * Notification Routes
 */

const express = require('express');
const router = express.Router();
const NotificationController = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');
const { pollingLimiter } = require('../middleware/rateLimiter');

// All routes require authentication
router.use(authenticate);

// Get all notifications
router.get('/', NotificationController.getNotifications);

// Get unread count — rate-limited to prevent polling abuse
router.get('/unread-count', pollingLimiter, NotificationController.getUnreadCount);

// Mark notification as read
router.put('/:id/read', NotificationController.markAsRead);

// Mark all as read
router.put('/read-all', NotificationController.markAllAsRead);

// Create test notification (for development)
router.post('/test', NotificationController.createTestNotification);

module.exports = router;
