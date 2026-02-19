const Deadline = require('../models/Deadline');
const logger = require('../utils/logger');

class DeadlineService {
  // Get deadline statistics
  static getStatistics(userId) {
    try {
      const upcomingDeadlines = Deadline.findUpcoming(userId, 365);
      
      const now = new Date();
      const stats = {
        total: upcomingDeadlines.length,
        thisWeek: 0,
        thisMonth: 0,
        thisQuarter: 0,
        byType: {}
      };
      
      upcomingDeadlines.forEach(deadline => {
        const deadlineDate = new Date(deadline.deadline_date);
        const daysUntil = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
        
        if (daysUntil <= 7) stats.thisWeek++;
        if (daysUntil <= 30) stats.thisMonth++;
        if (daysUntil <= 90) stats.thisQuarter++;
        
        stats.byType[deadline.deadline_type] = (stats.byType[deadline.deadline_type] || 0) + 1;
      });
      
      return stats;
    } catch (error) {
      logger.error('Failed to get deadline statistics:', error);
      throw error;
    }
  }
  
  // Get critical deadlines (next 7 days)
  static getCriticalDeadlines(userId) {
    try {
      const allDeadlines = Deadline.findUpcoming(userId, 7);
      
      return allDeadlines.map(deadline => {
        const daysUntil = Math.ceil(
          (new Date(deadline.deadline_date) - new Date()) / (1000 * 60 * 60 * 24)
        );
        
        return {
          ...deadline,
          daysUntil,
          isCritical: daysUntil <= 3,
          urgencyLevel: daysUntil <= 1 ? 'immediate' : daysUntil <= 3 ? 'urgent' : 'soon'
        };
      });
    } catch (error) {
      logger.error('Failed to get critical deadlines:', error);
      throw error;
    }
  }
}

module.exports = DeadlineService;