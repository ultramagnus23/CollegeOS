const Application = require('../models/Application');
const Deadline = require('../models/Deadline');
const Essay = require('../models/Essay');
const logger = require('../utils/logger');

class ApplicationService {
  // Get dashboard summary for user
  static async getDashboardSummary(userId) {
    try {
      const applications = Application.findByUser(userId);
      const upcomingDeadlines = Deadline.findUpcoming(userId, 30);
      
      // Calculate statistics
      const stats = {
        total: applications.length,
        byStatus: {},
        byPriority: {},
        upcomingDeadlines: upcomingDeadlines.length,
        urgentDeadlines: upcomingDeadlines.filter(d => {
          const daysUntil = Math.ceil((new Date(d.deadline_date) - new Date()) / (1000 * 60 * 60 * 24));
          return daysUntil <= 7;
        }).length
      };
      
      applications.forEach(app => {
        stats.byStatus[app.status] = (stats.byStatus[app.status] || 0) + 1;
        if (app.priority) {
          stats.byPriority[app.priority] = (stats.byPriority[app.priority] || 0) + 1;
        }
      });
      
      return {
        applications: applications.slice(0, 10), // Recent 10
        deadlines: upcomingDeadlines.slice(0, 5), // Next 5
        stats
      };
    } catch (error) {
      logger.error('Failed to get dashboard summary:', error);
      throw error;
    }
  }
  
  // Check application completeness
  static checkCompleteness(applicationId) {
    try {
      const application = Application.findById(applicationId);
      const deadlines = Deadline.findByApplication(applicationId);
      const essays = Essay.findByApplication(applicationId);
      
      const checklist = {
        hasApplication: !!application,
        hasDeadlines: deadlines.length > 0,
        hasEssays: essays.length > 0,
        allEssaysComplete: essays.every(e => e.status === 'final'),
        allDeadlinesMet: deadlines.every(d => d.is_completed === 1 || new Date(d.deadline_date) > new Date()),
        readyToSubmit: false
      };
      
      checklist.readyToSubmit = 
        checklist.hasApplication && 
        checklist.hasDeadlines && 
        checklist.hasEssays && 
        checklist.allEssaysComplete;
      
      const completionPercentage = [
        checklist.hasApplication,
        checklist.hasDeadlines,
        checklist.hasEssays,
        checklist.allEssaysComplete
      ].filter(Boolean).length / 4 * 100;
      
      return {
        checklist,
        completionPercentage,
        application,
        deadlines,
        essays
      };
    } catch (error) {
      logger.error('Failed to check completeness:', error);
      throw error;
    }
  }
}

module.exports = ApplicationService;