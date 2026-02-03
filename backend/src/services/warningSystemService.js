/**
 * WarningSystemService.js
 * Centralized warning engine for deadline monitoring and task risk assessment
 * Provides automated alerts with urgency levels and actionable recommendations
 */

const dbManager = require('../config/database');
const logger = require('../utils/logger');

/**
 * Urgency levels with color codes
 */
const URGENCY_LEVELS = {
  SAFE: { level: 'safe', color: 'green', priority: 0 },
  APPROACHING: { level: 'approaching', color: 'yellow', priority: 1 },
  WARNING: { level: 'warning', color: 'orange', priority: 2 },
  CRITICAL: { level: 'critical', color: 'red', priority: 3 },
  OVERDUE: { level: 'overdue', color: 'darkred', priority: 4 }
};

/**
 * Warning thresholds in days
 */
const WARNING_THRESHOLDS = {
  SAME_DAY: 0,
  ONE_DAY: 1,
  THREE_DAYS: 3,
  SEVEN_DAYS: 7,
  FOURTEEN_DAYS: 14,
  THIRTY_DAYS: 30
};

/**
 * Task priority levels with metadata
 */
const TASK_PRIORITY = {
  CRITICAL: { value: 1, label: 'Critical', multiplier: 2.0 },
  HIGH: { value: 2, label: 'High', multiplier: 1.5 },
  MEDIUM: { value: 3, label: 'Medium', multiplier: 1.0 },
  LOW: { value: 4, label: 'Low', multiplier: 0.5 }
};

class WarningSystemService {
  /**
   * Get all warnings for a user
   * @param {number} userId - User ID
   * @returns {Object} Warnings summary with urgency levels
   */
  static async getWarnings(userId) {
    const db = dbManager.getDatabase();
    const now = new Date();
    
    const warnings = {
      critical: [],
      warning: [],
      approaching: [],
      safe: [],
      overdue: [],
      summary: {
        total: 0,
        criticalCount: 0,
        warningCount: 0,
        overdueCount: 0
      }
    };
    
    try {
      // Get all active deadlines for the user
      const deadlines = db.prepare(`
        SELECT ud.*, c.name as college_name
        FROM user_deadlines ud
        LEFT JOIN colleges c ON c.id = ud.college_id
        WHERE ud.user_id = ? AND ud.is_active = 1 AND ud.is_completed = 0
        ORDER BY ud.deadline_date ASC
      `).all(userId);
      
      for (const deadline of deadlines) {
        const deadlineDate = new Date(deadline.deadline_date);
        const daysUntil = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
        
        const warning = {
          id: deadline.id,
          type: 'deadline',
          title: deadline.title,
          collegeName: deadline.college_name,
          collegeId: deadline.college_id,
          date: deadline.deadline_date,
          daysUntil,
          ...this.getUrgencyLevel(daysUntil),
          message: this.generateWarningMessage(deadline.title, daysUntil, deadline.college_name)
        };
        
        warnings.summary.total++;
        
        if (daysUntil < 0) {
          warnings.overdue.push(warning);
          warnings.summary.overdueCount++;
        } else if (daysUntil <= WARNING_THRESHOLDS.ONE_DAY) {
          warnings.critical.push(warning);
          warnings.summary.criticalCount++;
        } else if (daysUntil <= WARNING_THRESHOLDS.THREE_DAYS) {
          warnings.warning.push(warning);
          warnings.summary.warningCount++;
        } else if (daysUntil <= WARNING_THRESHOLDS.SEVEN_DAYS) {
          warnings.approaching.push(warning);
        } else {
          warnings.safe.push(warning);
        }
      }
      
      // Get task-based warnings
      const taskWarnings = await this.getTaskWarnings(userId);
      
      return {
        ...warnings,
        taskWarnings,
        recommendations: this.generateRecommendations(warnings, taskWarnings)
      };
    } catch (error) {
      logger.error('Failed to get warnings:', error);
      throw error;
    }
  }

  /**
   * Get task-based warnings
   * @param {number} userId - User ID
   * @returns {Object[]} Task warnings
   */
  static async getTaskWarnings(userId) {
    const db = dbManager.getDatabase();
    const now = new Date();
    
    try {
      const tasks = db.prepare(`
        SELECT t.*, c.name as college_name
        FROM tasks t
        LEFT JOIN colleges c ON c.id = t.college_id
        WHERE t.user_id = ? AND t.status NOT IN ('complete', 'skipped') AND t.deadline IS NOT NULL
        ORDER BY t.deadline ASC
      `).all(userId);
      
      return tasks.map(task => {
        const deadline = new Date(task.deadline);
        const daysUntil = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
        const hoursNeeded = task.estimated_hours || 1;
        const hoursAvailable = daysUntil * 8; // Assume 8 productive hours per day
        
        const isAtRisk = hoursAvailable < hoursNeeded * 1.5;
        
        return {
          id: task.id,
          type: 'task',
          title: task.title,
          taskType: task.task_type,
          collegeName: task.college_name,
          collegeId: task.college_id,
          deadline: task.deadline,
          daysUntil,
          estimatedHours: hoursNeeded,
          priority: task.priority,
          isBlocked: task.status === 'blocked',
          blockingReason: task.blocking_reason,
          isAtRisk,
          ...this.getUrgencyLevel(daysUntil, isAtRisk)
        };
      }).filter(t => t.daysUntil <= WARNING_THRESHOLDS.FOURTEEN_DAYS);
    } catch (error) {
      logger.warn('Could not get task warnings:', error.message);
      return [];
    }
  }

  /**
   * Get urgency level based on days until deadline
   * @param {number} daysUntil - Days until deadline
   * @param {boolean} isAtRisk - Whether task is at risk
   * @returns {Object} Urgency level details
   */
  static getUrgencyLevel(daysUntil, isAtRisk = false) {
    if (daysUntil < 0) {
      return { urgency: URGENCY_LEVELS.OVERDUE, urgencyLabel: 'Overdue' };
    } else if (daysUntil <= WARNING_THRESHOLDS.SAME_DAY || isAtRisk) {
      return { urgency: URGENCY_LEVELS.CRITICAL, urgencyLabel: 'Critical' };
    } else if (daysUntil <= WARNING_THRESHOLDS.ONE_DAY) {
      return { urgency: URGENCY_LEVELS.CRITICAL, urgencyLabel: 'Due Tomorrow' };
    } else if (daysUntil <= WARNING_THRESHOLDS.THREE_DAYS) {
      return { urgency: URGENCY_LEVELS.WARNING, urgencyLabel: `${daysUntil} days left` };
    } else if (daysUntil <= WARNING_THRESHOLDS.SEVEN_DAYS) {
      return { urgency: URGENCY_LEVELS.APPROACHING, urgencyLabel: `${daysUntil} days left` };
    } else {
      return { urgency: URGENCY_LEVELS.SAFE, urgencyLabel: `${daysUntil} days left` };
    }
  }

  /**
   * Generate warning message based on context
   * @param {string} title - Deadline/task title
   * @param {number} daysUntil - Days until deadline
   * @param {string} collegeName - College name
   * @returns {string} Warning message
   */
  static generateWarningMessage(title, daysUntil, collegeName) {
    const collegeText = collegeName ? ` for ${collegeName}` : '';
    
    if (daysUntil < 0) {
      return `⚠️ OVERDUE: ${title}${collegeText} was due ${Math.abs(daysUntil)} day(s) ago!`;
    } else if (daysUntil === 0) {
      return `🔴 DUE TODAY: ${title}${collegeText} must be completed today!`;
    } else if (daysUntil === 1) {
      return `🟠 DUE TOMORROW: ${title}${collegeText} is due tomorrow!`;
    } else if (daysUntil <= 3) {
      return `🟡 URGENT: ${title}${collegeText} is due in ${daysUntil} days.`;
    } else if (daysUntil <= 7) {
      return `📢 REMINDER: ${title}${collegeText} is due in ${daysUntil} days.`;
    } else {
      return `ℹ️ ${title}${collegeText} is due in ${daysUntil} days.`;
    }
  }

  /**
   * Generate actionable recommendations
   * @param {Object} warnings - Warnings object
   * @param {Object[]} taskWarnings - Task warnings
   * @returns {string[]} Recommendations
   */
  static generateRecommendations(warnings, taskWarnings) {
    const recommendations = [];
    
    if (warnings.overdue.length > 0) {
      recommendations.push({
        priority: 'critical',
        action: `Address ${warnings.overdue.length} overdue deadline(s) immediately`,
        items: warnings.overdue.map(w => w.title)
      });
    }
    
    if (warnings.critical.length > 0) {
      recommendations.push({
        priority: 'high',
        action: `Focus on ${warnings.critical.length} critical deadline(s) due within 24 hours`,
        items: warnings.critical.map(w => w.title)
      });
    }
    
    const blockedTasks = taskWarnings.filter(t => t.isBlocked);
    if (blockedTasks.length > 0) {
      recommendations.push({
        priority: 'high',
        action: `Unblock ${blockedTasks.length} task(s) that are preventing progress`,
        items: blockedTasks.map(t => t.title)
      });
    }
    
    const atRiskTasks = taskWarnings.filter(t => t.isAtRisk && !t.isBlocked);
    if (atRiskTasks.length > 0) {
      recommendations.push({
        priority: 'medium',
        action: `Allocate more time for ${atRiskTasks.length} at-risk task(s)`,
        items: atRiskTasks.map(t => t.title)
      });
    }
    
    if (warnings.approaching.length >= 5) {
      recommendations.push({
        priority: 'medium',
        action: 'Consider reviewing your application timeline - multiple deadlines approaching',
        items: []
      });
    }
    
    return recommendations;
  }

  /**
   * Calculate task load for a time period
   * @param {number} userId - User ID
   * @param {number} days - Number of days to calculate
   * @returns {Object} Task load analysis
   */
  static async calculateTaskLoad(userId, days = 7) {
    const db = dbManager.getDatabase();
    const now = new Date();
    const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    
    try {
      const tasks = db.prepare(`
        SELECT * FROM tasks
        WHERE user_id = ? 
          AND status NOT IN ('complete', 'skipped')
          AND deadline IS NOT NULL
          AND deadline <= ?
        ORDER BY deadline ASC, priority ASC
      `).all(userId, endDate.toISOString());
      
      const totalHours = tasks.reduce((sum, t) => sum + (t.estimated_hours || 1), 0);
      const availableHours = days * 8; // 8 productive hours per day
      const utilization = totalHours / availableHours;
      
      // Group by priority
      const byPriority = {
        critical: tasks.filter(t => t.priority === 1),
        high: tasks.filter(t => t.priority === 2),
        medium: tasks.filter(t => t.priority === 3),
        low: tasks.filter(t => t.priority === 4)
      };
      
      // Calculate daily distribution
      const dailyTasks = [];
      for (let i = 0; i < days; i++) {
        const dayStart = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        
        const dayTasks = tasks.filter(t => {
          const deadline = new Date(t.deadline);
          return deadline >= dayStart && deadline < dayEnd;
        });
        
        dailyTasks.push({
          date: dayStart.toISOString().split('T')[0],
          taskCount: dayTasks.length,
          hoursNeeded: dayTasks.reduce((sum, t) => sum + (t.estimated_hours || 1), 0),
          tasks: dayTasks.map(t => ({ id: t.id, title: t.title, hours: t.estimated_hours }))
        });
      }
      
      return {
        totalTasks: tasks.length,
        totalHoursNeeded: totalHours,
        availableHours,
        utilization: Math.round(utilization * 100),
        isOverloaded: utilization > 1.0,
        loadLevel: utilization > 1.0 ? 'overloaded' : utilization > 0.8 ? 'heavy' : utilization > 0.5 ? 'moderate' : 'light',
        byPriority,
        dailyDistribution: dailyTasks,
        suggestedSchedule: this.generateSuggestedSchedule(tasks, days)
      };
    } catch (error) {
      logger.error('Failed to calculate task load:', error);
      throw error;
    }
  }

  /**
   * Generate suggested task schedule
   * @param {Object[]} tasks - Tasks to schedule
   * @param {number} days - Number of days
   * @returns {Object[]} Suggested schedule
   */
  static generateSuggestedSchedule(tasks, days) {
    const hoursPerDay = 8;
    const schedule = [];
    let remainingTasks = [...tasks].sort((a, b) => {
      // Sort by priority first, then by deadline
      if (a.priority !== b.priority) return a.priority - b.priority;
      return new Date(a.deadline) - new Date(b.deadline);
    });
    
    for (let day = 0; day < days && remainingTasks.length > 0; day++) {
      let hoursLeft = hoursPerDay;
      const dayTasks = [];
      const dayDate = new Date(Date.now() + day * 24 * 60 * 60 * 1000);
      
      while (hoursLeft > 0 && remainingTasks.length > 0) {
        const task = remainingTasks[0];
        const taskHours = task.estimated_hours || 1;
        
        if (taskHours <= hoursLeft) {
          dayTasks.push({
            id: task.id,
            title: task.title,
            allocatedHours: taskHours,
            priority: task.priority
          });
          hoursLeft -= taskHours;
          remainingTasks.shift();
        } else if (hoursLeft >= 1) {
          // Partial allocation
          dayTasks.push({
            id: task.id,
            title: task.title,
            allocatedHours: hoursLeft,
            priority: task.priority,
            partial: true,
            remaining: taskHours - hoursLeft
          });
          task.estimated_hours = taskHours - hoursLeft;
          hoursLeft = 0;
        } else {
          break;
        }
      }
      
      if (dayTasks.length > 0) {
        schedule.push({
          date: dayDate.toISOString().split('T')[0],
          tasks: dayTasks,
          hoursAllocated: hoursPerDay - hoursLeft
        });
      }
    }
    
    return schedule;
  }

  /**
   * Get deadline dashboard summary
   * @param {number} userId - User ID
   * @returns {Object} Dashboard summary
   */
  static async getDashboardSummary(userId) {
    const warnings = await this.getWarnings(userId);
    const taskLoad = await this.calculateTaskLoad(userId, 14);
    
    return {
      urgentItems: warnings.critical.length + warnings.overdue.length,
      warningItems: warnings.warning.length,
      approachingItems: warnings.approaching.length,
      totalActiveDeadlines: warnings.summary.total,
      weeklyTaskLoad: taskLoad.loadLevel,
      weeklyUtilization: taskLoad.utilization,
      topPriorities: [
        ...warnings.overdue.slice(0, 2),
        ...warnings.critical.slice(0, 3),
        ...warnings.warning.slice(0, 2)
      ].slice(0, 5),
      recommendations: warnings.recommendations.slice(0, 3)
    };
  }
}

module.exports = WarningSystemService;
